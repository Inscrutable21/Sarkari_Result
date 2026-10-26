/**
 * Sarkari Radar Scraper & Adapter
 * Fetches vacancies, examinations calendar, and institutional listings
 * from Sarkari Radar (https://sarkaritech.netlify.app/)
 */

const axios = require('axios');
const { safeFetchOptions } = require('../../utils/safeFetch');

const RADAR_BASE = 'https://sarkaritech.netlify.app';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,*/*',
  'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
};

function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function generateId(str, fallback = '') {
  const base = cleanText(str || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  return base || `radar-${Date.now()}`;
}

/**
 * Normalizes Sarkari Radar vacancy item into standard portal job format
 */
function normalizeRadarItem(item) {
  if (!item) return null;

  const org = cleanText(item.org || '');
  const what = cleanText(item.what || '');
  const title = org ? `${org}: ${what}` : what;
  const link = item.apply || item.official || item.site || item.notice || '';
  const itemId = item.id ? `sr-${item.id}` : generateId(title, link);
  const deadline = item.d && /^\d{4}-\d{2}-\d{2}$/.test(item.d) ? item.d : null;

  // Extract total vacancies from title if not explicitly in facts
  let totalVacancies = '';
  const vacMatch = what.match(/\b(\d+)\s*(?:posts?|vacanc(?:y|ies)|openings?|trainee|driver|fellow)\b/i);
  if (vacMatch) totalVacancies = `${vacMatch[1]} Posts`;

  // Build structured details
  const importantDates = {};
  if (deadline) {
    importantDates['Last Date for Apply Online'] = deadline;
  }

  const applicationFee = {};
  const ageLimit = {};
  const vacancyDetails = [];
  const sections = [];
  const tables = [];
  const importantLinks = [];

  // Map action links
  if (item.apply) {
    importantLinks.push({ label: 'Apply Online (Official Portal)', url: item.apply });
  }
  if (item.pdf) {
    importantLinks.push({ label: 'Download Notification (PDF)', url: item.pdf });
  }
  if (item.official) {
    importantLinks.push({ label: 'Official Recruitment Page', url: item.official });
  }
  if (item.site) {
    importantLinks.push({ label: 'Official Website', url: item.site });
  }
  if (item.notice) {
    importantLinks.push({ label: 'Source Notification Details', url: item.notice });
  }

  // Parse rich embedded details if available from Sarkari Radar
  if (item.detail && typeof item.detail === 'object') {
    const d = item.detail;

    // 1. Facts
    if (Array.isArray(d.facts)) {
      for (const fact of d.facts) {
        if (!Array.isArray(fact) || fact.length < 2) continue;
        const [label, val] = [cleanText(fact[0]), cleanText(fact[1])];
        const lowerLabel = label.toLowerCase();

        if (lowerLabel.includes('date') || lowerLabel.includes('deadline') || lowerLabel.includes('interview')) {
          importantDates[label] = val;
        } else if (lowerLabel.includes('fee')) {
          applicationFee[label] = val;
        } else if (lowerLabel.includes('age')) {
          ageLimit[label] = val;
        } else if (lowerLabel.includes('vacanc') || lowerLabel.includes('post count') || lowerLabel.includes('total post')) {
          if (!totalVacancies) totalVacancies = val;
        }
      }
    }

    // 2. Sections
    if (Array.isArray(d.sections)) {
      for (const s of d.sections) {
        if (!s) continue;
        const sectionTitle = cleanText(s.h || '');
        if (Array.isArray(s.items) && s.items.length > 0) {
          sections.push({
            type: sectionTitle.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            title: sectionTitle,
            items: s.items.map(cleanText).filter(Boolean)
          });
        }
        if (Array.isArray(s.rows) && s.rows.length > 0) {
          const tableRows = [];
          if (Array.isArray(s.head)) {
            tableRows.push(s.head.map(cleanText));
          }
          for (const row of s.rows) {
            if (Array.isArray(row)) {
              tableRows.push(row.map(cleanText));
              // Extract vacancy detail if 3-4 cols
              if (row.length >= 3) {
                vacancyDetails.push({
                  postName: cleanText(row[0]),
                  totalPost: cleanText(row[1]),
                  eligibility: cleanText(row[2])
                });
              }
            }
          }
          tables.push({
            title: sectionTitle || 'Eligibility & Vacancy Breakdown',
            rows: tableRows
          });
        }
      }
    }

    // 3. Links from detail
    if (d.links && typeof d.links === 'object') {
      if (d.links.site && !importantLinks.some(l => l.url === d.links.site)) {
        importantLinks.push({ label: 'Official Body Website', url: d.links.site });
      }
      if (d.links.notice && !importantLinks.some(l => l.url === d.links.notice)) {
        importantLinks.push({ label: 'Official Notice PDF', url: d.links.notice });
      }
    }
  }

  // Format short info
  let shortInfo = what;
  const aboutSec = sections.find(s => s.title.toLowerCase().includes('about') || s.title.toLowerCase().includes('eligibility'));
  if (aboutSec && aboutSec.items.length > 0) {
    shortInfo = `${what}. ${aboutSec.items[0]}`;
  }

  const details = {
    title,
    url: link,
    postDate: item.d || '',
    shortInfo,
    importantDates,
    applicationFee,
    ageLimit,
    totalVacancies: totalVacancies || 'See Notification',
    vacancyDetails,
    importantLinks,
    sections,
    tables
  };

  return {
    id: itemId,
    title,
    link,
    category: 'latestJobs',
    org,
    what,
    radarCategory: item.k || 'govt', // 'research', 'psu', 'govt', 'state', 'intern'
    radarType: item.type || '',
    state: item.state || (item.level === 'central' ? 'Central / All India' : ''),
    district: item.district || '',
    block: item.block || '',
    level: item.level || 'central',
    source: 'Sarkari Radar',
    sourceUrl: item.notice || item.official || RADAR_BASE,
    officialSite: item.site || '',
    applyUrl: item.apply || '',
    pdfUrl: item.pdf || '',
    deadline,
    details,
    scrapedAt: new Date().toISOString()
  };
}

/**
 * Normalizes Sarkari Radar exam item into portal examination/admissions format
 */
function normalizeRadarExam(exam) {
  if (!exam) return null;

  const name = cleanText(exam.name || '');
  const use = cleanText(exam.use || '');
  const title = use ? `${name} (${use})` : name;
  const link = exam.site || exam.src || RADAR_BASE;
  const deadline = exam.d && /^\d{4}-\d{2}-\d{2}$/.test(exam.d) ? exam.d : null;

  const importantDates = {};
  if (Array.isArray(exam.rows)) {
    for (const r of exam.rows) {
      if (Array.isArray(r) && r.length >= 2) {
        importantDates[cleanText(r[0])] = cleanText(r[1]);
      }
    }
  }

  const importantLinks = [];
  if (exam.site) {
    importantLinks.push({ label: 'Official Examination Portal', url: exam.site });
  }
  if (exam.src) {
    importantLinks.push({ label: 'Official Bulletin & Exam Schedule', url: exam.src });
  }

  return {
    id: `exam-${generateId(name)}`,
    title,
    link,
    category: 'admissions',
    org: 'National Testing Agency (NTA) / Examination Board',
    what: use,
    radarCategory: 'exam',
    radarType: 'National Examination',
    state: 'Central / All India',
    level: 'central',
    source: 'Sarkari Radar',
    sourceUrl: exam.src || exam.site || RADAR_BASE,
    officialSite: exam.site || '',
    deadline,
    details: {
      title,
      url: link,
      shortInfo: `${name}: National competitive examination for ${use}.`,
      importantDates,
      applicationFee: { Notice: 'Refer to official examination bulletin for category-wise fees' },
      ageLimit: { Notice: 'As per official examination eligibility criteria' },
      totalVacancies: 'National Eligibility / Examination',
      vacancyDetails: [],
      importantLinks,
      sections: [
        {
          type: 'exam_purpose',
          title: 'Purpose & Eligibility Scope',
          items: [use]
        }
      ],
      tables: []
    },
    scrapedAt: new Date().toISOString()
  };
}

/**
 * Scrapes Sarkari Radar listings from data/listings.json and /api/jobs
 */
async function scrapeRadarListings() {
  const mergedMap = new Map();

  // 1. Fetch data/listings.json (primary archive)
  try {
    const res = await axios.get(`${RADAR_BASE}/data/listings.json`, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 12000
    });

    if (res.data && Array.isArray(res.data.items)) {
      for (const raw of res.data.items) {
        const normalized = normalizeRadarItem(raw);
        if (normalized) {
          const key = normalized.link || normalized.id;
          mergedMap.set(key, normalized);
        }
      }
    }
  } catch (err) {
    console.warn('[SarkariRadar] Notice: Failed to fetch data/listings.json:', err.message);
  }

  // 2. Fetch /api/jobs (live hourly feed) to overlay any newer posts
  try {
    const res = await axios.get(`${RADAR_BASE}/api/jobs`, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 12000
    });

    if (res.data && Array.isArray(res.data.items)) {
      for (const raw of res.data.items) {
        const normalized = normalizeRadarItem(raw);
        if (normalized) {
          const key = normalized.link || normalized.id;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, normalized);
          } else {
            // Merge details if present
            const existing = mergedMap.get(key);
            if (normalized.details && !existing.details) {
              existing.details = normalized.details;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SarkariRadar] Notice: Failed to fetch /api/jobs:', err.message);
  }

  const allItems = Array.from(mergedMap.values());
  return allItems;
}

/**
 * Scrapes Sarkari Radar examination calendar
 */
async function scrapeRadarExams() {
  try {
    const res = await axios.get(`${RADAR_BASE}/data/exams.json`, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 10000
    });

    if (Array.isArray(res.data)) {
      return res.data.map(normalizeRadarExam).filter(Boolean);
    }
    return [];
  } catch (err) {
    console.warn('[SarkariRadar] Notice: Failed to fetch data/exams.json:', err.message);
    return [];
  }
}

/**
 * Scrapes Sarkari Radar institutional directory
 */
async function scrapeRadarDirectory() {
  try {
    const res = await axios.get(`${RADAR_BASE}/data/directory.json`, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 10000
    });

    if (Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch (err) {
    console.warn('[SarkariRadar] Notice: Failed to fetch data/directory.json:', err.message);
    return [];
  }
}

/**
 * Orchestrates complete scraping of Sarkari Radar
 */
async function scrapeRadarAll() {
  const [jobs, exams] = await Promise.all([
    scrapeRadarListings(),
    scrapeRadarExams()
  ]);

  // Select top candidates for trending (high priority PSU / research posts)
  const trending = jobs
    .filter(j => j.radarCategory === 'psu' || j.radarCategory === 'research' || (j.what && j.what.toLowerCase().includes('engineer')))
    .slice(0, 8)
    .map(j => ({
      ...j,
      category: 'trending',
      tag: j.radarType || (j.radarCategory === 'psu' ? 'PSU' : 'Research')
    }));

  return {
    jobs,
    trending,
    exams,
    meta: {
      source: RADAR_BASE,
      scrapedAt: new Date().toISOString(),
      counts: {
        jobs: jobs.length,
        trending: trending.length,
        exams: exams.length
      }
    }
  };
}

module.exports = {
  scrapeRadarListings,
  scrapeRadarExams,
  scrapeRadarDirectory,
  scrapeRadarAll,
  normalizeRadarItem,
  normalizeRadarExam
};
