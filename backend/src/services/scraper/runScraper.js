try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
} catch {}

const { scrapeHomepage, scrapeCategoryArchive, scrapePostingDetails } = require('./sarkariScraper');
const { scrapeRadarAll } = require('./sarkariRadarScraper');
const { scrapeContextDevOpenings } = require('./contextDevScraper');
const { categorizeCollection, DEGREE_DISCIPLINES, isFillableJob } = require('./classifier');
const { dispatchAllNotifications } = require('../notificationService');
const { saveAllPortalDataToMongo, saveCategorySummaryToMongo } = require('../mongoService');

/**
 * Global In-Memory Centralized Scraper State Manager
 * Tracks live progress, per-platform telemetry, recent execution logs, and last run summary.
 */
class ScraperStateManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.isScrapingInProgress = false;
    this.currentJobId = null;
    this.startedAt = null;
    this.completedAt = null;
    this.progress = 0; // 0 - 100
    this.stage = 'Ready to trigger centralized scraping pipeline.';
    this.platforms = {
      sarkariResult: {
        name: 'Sarkari Result',
        status: 'idle', // 'idle' | 'running' | 'success' | 'warn' | 'error'
        counts: { jobs: 0, results: 0, admitCards: 0, admissions: 0, trending: 0, total: 0 },
        durationMs: 0,
        error: null
      },
      sarkariRadar: {
        name: 'Sarkari Radar',
        status: 'idle',
        counts: { jobs: 0, exams: 0, trending: 0, total: 0 },
        durationMs: 0,
        error: null
      },
      contextDev: {
        name: 'Context.dev Government AI',
        status: 'idle',
        counts: { openings: 0, research: 0, psu: 0, total: 0 },
        durationMs: 0,
        error: null
      }
    };
    this.logs = [];
    this.maxLogs = 120;
    this.lastRunSummary = null;
  }

  log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, message };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    const prefix = `[Scraper ${time}]`;
    if (type === 'error') console.error(`${prefix} ❌`, message);
    else if (type === 'warn') console.warn(`${prefix} ⚠️`, message);
    else if (type === 'success') console.log(`${prefix} ✅`, message);
    else console.log(`${prefix}`, message);
  }

  setStage(stage, progress = null) {
    this.stage = stage;
    if (progress !== null) {
      this.progress = Math.min(100, Math.max(0, Math.round(progress)));
    }
    this.log(`Stage: ${stage}`, 'info');
  }

  updatePlatform(key, data) {
    if (this.platforms[key]) {
      this.platforms[key] = { ...this.platforms[key], ...data };
    }
  }

  getStatus() {
    return {
      isScrapingInProgress: this.isScrapingInProgress,
      jobId: this.currentJobId,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      progress: this.progress,
      stage: this.stage,
      platforms: this.platforms,
      logs: this.logs,
      lastRunSummary: this.lastRunSummary
    };
  }
}

const scraperState = new ScraperStateManager();

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

  for (const item of (primary || [])) {
    const key = item.link || item.id;
    if (key) map.set(key, { ...item });
  }

  for (const item of (secondary || [])) {
    const key = item.link || item.id;
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key);
      const secondaryHasDate = item.title && (item.title.toLowerCase().includes('last date') || item.title.toLowerCase().includes('extended'));
      const existingHasDate = existing.title && (existing.title.toLowerCase().includes('last date') || existing.title.toLowerCase().includes('extended'));

      if (secondaryHasDate && !existingHasDate) {
        existing.title = item.title;
      }
      if (item.details && !existing.details) {
        existing.details = item.details;
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Centralized Scraper Orchestrator
 * Scrapes data from all platforms:
 * 1. Sarkari Result (Homepage + Archives)
 * 2. Sarkari Radar (Vacancies, Exams, Highlights)
 * 3. Context.dev (Government Research Councils, Institutes & PSUs)
 *
 * @param {Object} options
 * @param {string[]} [options.platforms=['sarkariResult','sarkariRadar','contextDev']] - Selected platforms
 * @param {'quick'|'full'} [options.contextDevMode='quick'] - Context.dev depth mode
 * @param {number} [options.maxItems=200] - Max items per platform
 * @param {boolean} [options.enrichPriority=true] - Enrich top postings with deep specs
 */
async function run(options = {}) {
  const selectedPlatforms = Array.isArray(options.platforms) && options.platforms.length > 0
    ? options.platforms
    : ['sarkariResult', 'sarkariRadar', 'contextDev'];

  const contextDevMode = options.contextDevMode === 'full' ? 'full' : 'quick';
  const enrichPriority = options.enrichPriority !== false;

  if (scraperState.isScrapingInProgress) {
    const msg = 'A centralized scraping job is already running in background.';
    scraperState.log(msg, 'warn');
    throw new Error(msg);
  }

  scraperState.isScrapingInProgress = true;
  scraperState.currentJobId = `scrape-${Date.now()}`;
  scraperState.startedAt = new Date().toISOString();
  scraperState.completedAt = null;

  // Reset platform statuses for enabled vs excluded
  for (const key of ['sarkariResult', 'sarkariRadar', 'contextDev']) {
    if (selectedPlatforms.includes(key)) {
      scraperState.updatePlatform(key, { status: 'pending', counts: {}, durationMs: 0, error: null });
    } else {
      scraperState.updatePlatform(key, { status: 'idle', error: 'Excluded by options' });
    }
  }

  const overallStartTime = Date.now();
  scraperState.log('====================================================', 'info');
  scraperState.log(`Starting Centralized Multi-Platform Scraper [${scraperState.currentJobId}]`, 'info');
  scraperState.log(`Target Platforms: ${selectedPlatforms.join(', ')} | Context.dev Depth: ${contextDevMode}`, 'info');
  scraperState.log('====================================================', 'info');

  try {
    scraperState.setStage('Initiating concurrent platform crawls...', 5);

    // ── Platform 1: Sarkari Result Task ─────────────────────────────
    let srPromise = Promise.resolve({
      trending: [],
      results: [],
      admitCards: [],
      latestJobs: [],
      answerKeys: [],
      syllabus: [],
      admissions: [],
      certificates: [],
      important: []
    });

    if (selectedPlatforms.includes('sarkariResult')) {
      srPromise = (async () => {
        const start = Date.now();
        scraperState.updatePlatform('sarkariResult', { status: 'running' });
        scraperState.log('Connecting to Sarkari Result homepage & dedicated archives...', 'info');

        try {
          const [homepageData, archiveJobs, archiveResults, archiveAdmit, archiveUpsc] = await Promise.all([
            scrapeHomepage().catch(err => {
              scraperState.log(`SarkariResult homepage notice: ${err.message}`, 'warn');
              return { trending: [], results: [], admitCards: [], latestJobs: [], answerKeys: [], syllabus: [], admissions: [], certificates: [], important: [] };
            }),
            scrapeCategoryArchive('https://www.sarkariresult.com/latestjob/', 'latestJobs', 120).catch(() => []),
            scrapeCategoryArchive('https://www.sarkariresult.com/result/', 'results', 100).catch(() => []),
            scrapeCategoryArchive('https://www.sarkariresult.com/admitcard/', 'admitCards', 100).catch(() => []),
            scrapeCategoryArchive('https://www.sarkariresult.com/upsc/', 'latestJobs', 50).catch(() => [])
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

          homepageData.latestJobs = mergeListings(homepageData.latestJobs || [], [...archiveJobs, ...upscJobs]);
          homepageData.results = mergeListings(homepageData.results || [], [...archiveResults, ...upscResults]);
          homepageData.admitCards = mergeListings(homepageData.admitCards || [], [...archiveAdmit, ...upscAdmit]);

          const total = (homepageData.latestJobs.length || 0) +
                        (homepageData.results.length || 0) +
                        (homepageData.admitCards.length || 0) +
                        (homepageData.admissions.length || 0) +
                        (homepageData.trending.length || 0);

          const durationMs = Date.now() - start;
          scraperState.updatePlatform('sarkariResult', {
            status: 'success',
            counts: {
              jobs: homepageData.latestJobs.length,
              results: homepageData.results.length,
              admitCards: homepageData.admitCards.length,
              admissions: homepageData.admissions.length,
              trending: homepageData.trending.length,
              total
            },
            durationMs
          });
          scraperState.log(`Sarkari Result scraped successfully in ${(durationMs / 1000).toFixed(1)}s: ${total} total records.`, 'success');
          return homepageData;
        } catch (err) {
          const durationMs = Date.now() - start;
          scraperState.updatePlatform('sarkariResult', { status: 'error', error: err.message, durationMs });
          scraperState.log(`Sarkari Result fetch error: ${err.message}`, 'error');
          return { trending: [], results: [], admitCards: [], latestJobs: [], answerKeys: [], syllabus: [], admissions: [], certificates: [], important: [] };
        }
      })();
    }

    // ── Platform 2: Sarkari Radar Task ──────────────────────────────
    let radarPromise = Promise.resolve({ jobs: [], trending: [], exams: [] });

    if (selectedPlatforms.includes('sarkariRadar')) {
      radarPromise = (async () => {
        const start = Date.now();
        scraperState.updatePlatform('sarkariRadar', { status: 'running' });
        scraperState.log('Connecting to Sarkari Radar (vacancies, calendar & institutional listings)...', 'info');

        try {
          const radarData = await scrapeRadarAll();
          const total = (radarData.jobs?.length || 0) + (radarData.exams?.length || 0);
          const durationMs = Date.now() - start;

          scraperState.updatePlatform('sarkariRadar', {
            status: 'success',
            counts: {
              jobs: radarData.jobs?.length || 0,
              exams: radarData.exams?.length || 0,
              trending: radarData.trending?.length || 0,
              total
            },
            durationMs
          });
          scraperState.log(`Sarkari Radar scraped successfully in ${(durationMs / 1000).toFixed(1)}s: ${radarData.jobs?.length || 0} vacancies, ${radarData.exams?.length || 0} exams.`, 'success');
          return radarData;
        } catch (err) {
          const durationMs = Date.now() - start;
          scraperState.updatePlatform('sarkariRadar', { status: 'error', error: err.message, durationMs });
          scraperState.log(`Sarkari Radar fetch error: ${err.message}`, 'warn');
          return { jobs: [], trending: [], exams: [] };
        }
      })();
    }

    // ── Platform 3: Context.dev Task ────────────────────────────────
    let contextPromise = Promise.resolve([]);

    if (selectedPlatforms.includes('contextDev')) {
      contextPromise = (async () => {
        const start = Date.now();
        scraperState.updatePlatform('contextDev', { status: 'running' });
        scraperState.log(`Connecting to Context.dev Answers API (mode: ${contextDevMode})...`, 'info');

        try {
          const openings = await scrapeContextDevOpenings({
            maxItems: 200,
            mode: contextDevMode,
            onProgress: (prog) => {
              if (prog.taskName) {
                scraperState.log(`[Context.dev] Querying: ${prog.taskName} (${prog.completed + 1}/${prog.total})...`, 'info');
              }
            }
          });

          const researchCount = openings.filter(o => o.radarCategory === 'research').length;
          const psuCount = openings.filter(o => o.radarCategory === 'psu').length;
          const durationMs = Date.now() - start;

          scraperState.updatePlatform('contextDev', {
            status: 'success',
            counts: {
              openings: openings.length,
              research: researchCount,
              psu: psuCount,
              total: openings.length
            },
            durationMs
          });
          scraperState.log(`Context.dev scraped successfully in ${(durationMs / 1000).toFixed(1)}s: ${openings.length} verified government institutional & PSU openings.`, 'success');
          return openings;
        } catch (err) {
          const durationMs = Date.now() - start;
          scraperState.updatePlatform('contextDev', { status: 'error', error: err.message, durationMs });
          scraperState.log(`Context.dev fetch notice: ${err.message}`, 'warn');
          return [];
        }
      })();
    }

    // Wait for all 3 platform tasks concurrently
    scraperState.setStage('Extracting listings concurrently across all platforms...', 20);
    const [data, radarData, contextOpenings] = await Promise.all([
      srPromise,
      radarPromise,
      contextPromise
    ]);

    scraperState.setStage('Unifying and deduplicating cross-platform listings...', 45);

    // Merge cross-platform datasets into unified portal collections
    data.latestJobs = mergeListings(data.latestJobs || [], [...(radarData.jobs || []), ...(contextOpenings || [])]);
    data.results = mergeListings(data.results || [], []);
    data.admitCards = mergeListings(data.admitCards || [], []);
    data.trending = mergeListings(data.trending || [], radarData.trending || []);
    data.admissions = mergeListings(data.admissions || [], radarData.exams || []);

    scraperState.log(`Merged Unified Datasets -> Jobs: ${data.latestJobs.length}, Results: ${data.results.length}, Admit Cards: ${data.admitCards.length}, Admissions/Exams: ${data.admissions.length}, Trending: ${data.trending.length}`, 'info');

    // Step 3: Enrich priority and key featured jobs with deep specs
    if (enrichPriority && data.latestJobs.length > 0) {
      scraperState.setStage('Enriching priority vacancies with deep specifications...', 60);
      const enrichedMap = new Map();

      const priorityItems = data.latestJobs.filter(j =>
        (j.link && (
          j.link.includes('upsc-engineering') ||
          j.link.includes('engineering') ||
          j.link.includes('iit-bhu') ||
          j.link.includes('bank-of-baroda') ||
          j.link.includes('bob-sep26')
        )) ||
        (j.title && (
          j.title.toLowerCase().includes('upsc engineering') ||
          j.title.toLowerCase().includes('engineering service') ||
          j.title.toLowerCase().includes('ese') ||
          j.title.toLowerCase().includes('iit bhu') ||
          j.title.toLowerCase().includes('bob wealth')
        ))
      );

      const jobsToEnrich = [...priorityItems, ...data.latestJobs.slice(0, 5)];
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
          scraperState.log(`Scraping deep specs for: ${job.title.substring(0, 48)}...`, 'info');
          const details = await scrapePostingDetails(job.link).catch(() => null);
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
    }

    // Step 4: Run Advanced Categorization & Metadata Extraction
    scraperState.setStage('Applying Multi-Dimensional Categorization (Sector, State, Degree, Badges)...', 75);
    data.trending = categorizeCollection(data.trending || [], 'trending');
    data.results = categorizeCollection(data.results || [], 'results');
    data.admitCards = categorizeCollection(data.admitCards || [], 'admitCards');
    data.latestJobs = categorizeCollection(data.latestJobs || [], 'latestJobs');
    data.answerKeys = categorizeCollection(data.answerKeys || [], 'answerKeys');
    data.syllabus = categorizeCollection(data.syllabus || [], 'syllabus');
    data.admissions = categorizeCollection(data.admissions || [], 'admissions');
    data.certificates = categorizeCollection(data.certificates || [], 'certificates');
    data.important = categorizeCollection(data.important || [], 'important');

    // Remove unfillable or expired application forms
    const initialJobsCount = data.latestJobs.length;
    data.latestJobs = data.latestJobs.filter(isFillableJob);
    const cleanedJobsCount = initialJobsCount - data.latestJobs.length;
    scraperState.log(`Cleaned Expired Postings: Filtered out ${cleanedJobsCount} expired/closed jobs. Retained ${data.latestJobs.length} active jobs.`, 'info');

    // In trending, also filter out expired application forms
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
      ...data.admitCards,
      ...(data.admissions || [])
    ];
    const categorySummary = buildCategorySummary(allItems);

    // Step 5: Persist structured datasets directly to MongoDB Atlas
    scraperState.setStage('Persisting all datasets directly to MongoDB Atlas Cloud database...', 85);
    await saveAllPortalDataToMongo(data);
    await saveCategorySummaryToMongo(categorySummary);
    scraperState.log('All portal collections & category summaries persisted to MongoDB Atlas cloud!', 'success');

    // Step 6: Automatically evaluate and dispatch alerts to subscribed candidates
    scraperState.setStage('Evaluating candidate subscriber profiles and dispatching matching job alerts...', 93);
    let notifSummary = { dispatched: 0 };
    try {
      notifSummary = await dispatchAllNotifications();
      scraperState.log(`Job alerts dispatched to ${notifSummary.dispatched || 0} active subscribers.`, 'success');
    } catch (notifErr) {
      scraperState.log(`Notification notice: ${notifErr.message}`, 'warn');
    }

    const overallDurationMs = Date.now() - overallStartTime;
    scraperState.setStage('Centralized scraping pipeline completed successfully!', 100);

    const summary = {
      success: true,
      jobId: scraperState.currentJobId,
      totalItems: allItems.length,
      platforms: {
        sarkariResult: scraperState.platforms.sarkariResult,
        sarkariRadar: scraperState.platforms.sarkariRadar,
        contextDev: scraperState.platforms.contextDev
      },
      counts: {
        latestJobs: data.latestJobs.length,
        results: data.results.length,
        admitCards: data.admitCards.length,
        admissions: (data.admissions || []).length,
        trending: data.trending.length,
        totalPortalItems: allItems.length
      },
      cleanedExpiredCount: cleanedJobsCount,
      notifications: notifSummary,
      categorySummary,
      durationMs: overallDurationMs,
      scrapedAt: new Date().toISOString()
    };

    scraperState.completedAt = summary.scrapedAt;
    scraperState.lastRunSummary = summary;
    scraperState.isScrapingInProgress = false;

    scraperState.log(`Execution completed in ${(overallDurationMs / 1000).toFixed(1)}s across all 3 platforms! Total items in cloud: ${allItems.length}.`, 'success');
    return summary;
  } catch (err) {
    scraperState.isScrapingInProgress = false;
    scraperState.setStage(`Centralized scraping failed: ${err.message}`, 100);
    scraperState.log(`Pipeline Failure: ${err.message}`, 'error');
    scraperState.lastRunSummary = {
      success: false,
      jobId: scraperState.currentJobId,
      error: err.message,
      failedAt: new Date().toISOString()
    };
    throw err;
  }
}

// Standalone CLI runner
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  runScraperPipeline: run,
  run,
  getScraperStatus: () => scraperState.getStatus(),
  scraperState,
  default: run
};
