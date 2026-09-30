const fs = require('node:fs/promises');
const path = require('node:path');
const { scrapeHomepage, scrapeCategoryArchive, scrapePostingDetails } = require('./sarkariScraper');
const { categorizeCollection, DEGREE_DISCIPLINES, isFillableJob } = require('./classifier');
const { dispatchAllNotifications } = require('../notificationService');
const { batchUploadAllDataToSheet, isGoogleSheetEnabled } = require('../googleSheetService');

const DATA_DIR = path.resolve(__dirname, '../../data');

/**
 * Computes frequency counts for sectors, states, qualifications, and degree disciplines
 */
function buildCategorySummary(allItems) {
  const sectors = {};
  const states = {};
  const qualifications = {};
  const disciplines = {};
  const fieldDisciplines = {};
  const generalDisciplines = {};

  for (const item of allItems) {
    if (item.sector) sectors[item.sector] = (sectors[item.sector] || 0) + 1;
    if (item.state) states[item.state] = (states[item.state] || 0) + 1;
    if (item.qualification) qualifications[item.qualification] = (qualifications[item.qualification] || 0) + 1;

    if (Array.isArray(item.eligibleDisciplines)) {
      for (const dId of item.eligibleDisciplines) {
        disciplines[dId] = (disciplines[dId] || 0) + 1;
      }
    }
    if (Array.isArray(item.fieldDisciplines)) {
      for (const dId of item.fieldDisciplines) {
        fieldDisciplines[dId] = (fieldDisciplines[dId] || 0) + 1;
      }
    }
    if (Array.isArray(item.generalDisciplines)) {
      for (const dId of item.generalDisciplines) {
        generalDisciplines[dId] = (generalDisciplines[dId] || 0) + 1;
      }
    }
  }

  const disciplinesSummary = DEGREE_DISCIPLINES.map(d => ({
    id: d.id,
    label: d.label,
    shortLabel: d.shortLabel,
    icon: d.icon,
    count: disciplines[d.id] || 0,
    fieldCount: fieldDisciplines[d.id] || 0,
    generalCount: generalDisciplines[d.id] || 0
  }));

  return {
    sectors: Object.entries(sectors).map(([name, count]) => ({ name, count })),
    states: Object.entries(states).map(([name, count]) => ({ name, count })),
    qualifications: Object.entries(qualifications).map(([name, count]) => ({ name, count })),
    disciplines: disciplinesSummary,
    totalItems: allItems.length
  };
}

/**
 * Merges two arrays of postings de-duplicating by URL or ID
 */
function mergeListings(primary, secondary) {
  const map = new Map();

  for (const item of primary) {
    const key = item.link || item.id;
    if (key) map.set(key, { ...item });
  }

  for (const item of secondary) {
    const key = item.link || item.id;
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key);
      // Prefer secondary title if it has date info or is richer
      const secondaryHasDate = item.title && (item.title.toLowerCase().includes('last date') || item.title.toLowerCase().includes('extended'));
      const existingHasDate = existing.title && (existing.title.toLowerCase().includes('last date') || existing.title.toLowerCase().includes('extended'));

      if (secondaryHasDate && !existingHasDate) {
        existing.title = item.title;
      }
    }
  }

  return Array.from(map.values());
}

async function run() {
  console.log('====================================================');
  console.log('Starting SarkariResult Scraper & Categorization Pipeline...');
  console.log('====================================================');

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Step 1: Scrape Homepage
    console.log('[Scraper] Fetching homepage listings from SarkariResult.com...');
    const data = await scrapeHomepage();

    // Step 2: Fetch Dedicated Archive Pages for Comprehensive Datasets
    console.log('[Scraper] Fetching dedicated archive listings for Latest Jobs, Results, Admit Cards, and UPSC...');
    const [archiveJobs, archiveResults, archiveAdmit, archiveUpsc] = await Promise.all([
      scrapeCategoryArchive('https://www.sarkariresult.com/latestjob/', 'latestJobs', 120),
      scrapeCategoryArchive('https://www.sarkariresult.com/result/', 'results', 100),
      scrapeCategoryArchive('https://www.sarkariresult.com/admitcard/', 'admitCards', 100),
      scrapeCategoryArchive('https://www.sarkariresult.com/upsc/', 'latestJobs', 50)
    ]);

    // Separate UPSC archive items into appropriate categories
    const upscJobs = [];
    const upscResults = [];
    const upscAdmit = [];
    for (const item of (archiveUpsc || [])) {
      const lower = (item.title || '').toLowerCase();
      if (lower.includes('result') || lower.includes('marks') || lower.includes('cutoff')) {
        upscResults.push({ ...item, category: 'results' });
      } else if (lower.includes('admit card') || lower.includes('call letter') || lower.includes('hall ticket')) {
        upscAdmit.push({ ...item, category: 'admitCards' });
      } else {
        upscJobs.push({ ...item, category: 'latestJobs' });
      }
    }

    data.latestJobs = mergeListings(data.latestJobs, [...archiveJobs, ...upscJobs]);
    data.results = mergeListings(data.results, [...archiveResults, ...upscResults]);
    data.admitCards = mergeListings(data.admitCards, [...archiveAdmit, ...upscAdmit]);

    console.log(`   Merged datasets -> Jobs: ${data.latestJobs.length}, Results: ${data.results.length}, Admit Cards: ${data.admitCards.length}`);

    // Step 3: Enrich priority and recent jobs with deep specs
    console.log('\n[Scraper] Enriching priority jobs with deep specs (UPSC Engineering, IIT BHU, BOB, and top recent)...');
    const enrichedMap = new Map();

    // Prioritize UPSC Engineering Services, key national exams, and featured institutions
    const priorityItems = data.latestJobs.filter(j =>
      j.link.includes('upsc-engineering') ||
      j.link.includes('engineering') ||
      j.title.toLowerCase().includes('upsc engineering') ||
      j.title.toLowerCase().includes('engineering service') ||
      j.title.toLowerCase().includes('ese') ||
      j.link.includes('iit-bhu') ||
      j.link.includes('bank-of-baroda') ||
      j.link.includes('bob-sep26') ||
      j.title.toLowerCase().includes('iit bhu') ||
      j.title.toLowerCase().includes('bob wealth')
    );

    // Pick top 6 newest plus priority items
    const jobsToEnrich = [...priorityItems, ...data.latestJobs.slice(0, 6)];
    const uniqueEnrichList = [];
    const enrichSeen = new Set();
    for (const job of jobsToEnrich) {
      if (job.link && !enrichSeen.has(job.link)) {
        enrichSeen.add(job.link);
        uniqueEnrichList.push(job);
      }
    }

    for (const job of uniqueEnrichList) {
      if (job.link && job.link.includes('sarkariresult.com')) {
        console.log(`   Scraping specs for: ${job.title.substring(0, 48)}...`);
        const details = await scrapePostingDetails(job.link);
        if (details) {
          enrichedMap.set(job.link, details);
        }
      }
    }

    data.latestJobs = data.latestJobs.map(job => {
      if (enrichedMap.has(job.link)) {
        return { ...job, details: enrichedMap.get(job.link) };
      }
      return job;
    });

    // Step 3: Run Advanced Categorization & Metadata Extraction
    console.log('\n[Categorizer] Applying Multi-Dimensional Categorization (Sector, State, Qualification, Org, Badges)...');
    data.trending = categorizeCollection(data.trending, 'trending');
    data.results = categorizeCollection(data.results, 'results');
    data.admitCards = categorizeCollection(data.admitCards, 'admitCards');
    data.latestJobs = categorizeCollection(data.latestJobs, 'latestJobs');
    data.answerKeys = categorizeCollection(data.answerKeys, 'answerKeys');
    data.syllabus = categorizeCollection(data.syllabus, 'syllabus');
    data.admissions = categorizeCollection(data.admissions, 'admissions');
    data.certificates = categorizeCollection(data.certificates, 'certificates');
    data.important = categorizeCollection(data.important, 'important');

    // Remove all jobs whose application deadline has expired or are cancelled
    const initialJobsCount = data.latestJobs.length;
    data.latestJobs = data.latestJobs.filter(isFillableJob);
    console.log(`   Cleaned Jobs: Removed ${initialJobsCount - data.latestJobs.length} expired/unfillable jobs. Retained ${data.latestJobs.length} active jobs.`);

    // In trending, also remove expired job postings that cannot be filled
    data.trending = data.trending.filter(item => {
      if (item.section === 'latestJobs' || item.link?.includes('/2026/') || item.title?.toLowerCase().includes('form')) {
        return isFillableJob(item);
      }
      return true;
    });

    const allItems = [
      ...data.trending,
      ...data.latestJobs,
      ...data.results,
      ...data.admitCards
    ];
    const categorySummary = buildCategorySummary(allItems);

    // Step 4: Write structured data files
    console.log(`\n[Storage] Persisting datasets to ${DATA_DIR}...`);

    await fs.writeFile(
      path.join(DATA_DIR, 'allData.json'),
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(DATA_DIR, 'trending.json'),
      JSON.stringify({ success: true, data: data.trending }, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(DATA_DIR, 'results.json'),
      JSON.stringify({ success: true, data: data.results }, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(DATA_DIR, 'admitCards.json'),
      JSON.stringify({ success: true, data: data.admitCards }, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(DATA_DIR, 'jobs.json'),
      JSON.stringify({ success: true, data: data.latestJobs }, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(DATA_DIR, 'categories.json'),
      JSON.stringify({ success: true, data: categorySummary }, null, 2),
      'utf-8'
    );

    console.log('[Pipeline] Completed successfully!');
    console.log(`   Processed ${allItems.length} items with rich multi-tier categorization.`);
    console.log('   Available Sectors:', categorySummary.sectors.map(s => `${s.name} (${s.count})`).join(', '));
    console.log('====================================================\n');

    // Automatically check & dispatch job alerts to subscribed candidates
    try {
      await dispatchAllNotifications();
    } catch (notifErr) {
      console.warn('[Notification Warning]:', notifErr.message);
    }

    // Automatically sync freshly scraped data to live Google Sheet
    if (isGoogleSheetEnabled()) {
      console.log('[Pipeline] Syncing newly scraped data to live Google Sheet...');
      try {
        await batchUploadAllDataToSheet();
        console.log('[Pipeline] Live Google Sheet updated successfully!');
      } catch (sheetErr) {
        console.warn('[Google Sheet Sync Warning]:', sheetErr.message);
      }
    }

    return {
      success: true,
      totalItems: allItems.length,
      categorySummary,
      scrapedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[Pipeline Failed]:', err.message);
    throw err;
  }
}

if (require.main === module) {
  run().catch(() => process.exit(1));
}

module.exports = {
  runScraperPipeline: run
};
