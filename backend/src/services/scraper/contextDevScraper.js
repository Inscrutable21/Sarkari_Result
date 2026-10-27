/**
 * Context.dev Web Scraper Service for Government Openings
 * Scrapes and structures research fellowships, scientist openings, and institutional
 * recruitments from premier Indian government institutions, research councils, universities, and PSUs.
 * Designed for both Students (Fellowships, Trainees, Apprentices, PhD) and Professionals (Scientists, Faculty, Lateral PSUs).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Auto-load environment variables without relying solely on external dotenv
function loadEnvFile() {
  const envCandidates = [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../backend/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env')
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            let val = match[2] || '';
            val = val.trim().replace(/^['"](.*)['"]$/, '$1');
            if (!process.env[match[1]]) {
              process.env[match[1]] = val;
            }
          }
        });
        break;
      } catch {}
    }
  }
}
loadEnvFile();

const { getQueryTasks } = require('./contextDevQueries');

const CONTEXT_API_URL = 'https://api.context.dev/v1/web/answers';

/**
 * Returns the Context.dev API key from environment
 */
function getApiKey() {
  return (
    process.env.Contextdev ||
    process.env.CONTEXT_DEV_API_KEY ||
    process.env.CONTEXTDEV_API_KEY ||
    ''
  ).trim();
}

/**
 * Recognizes legitimate Indian government institutions, research councils, universities & PSUs
 */
const SHORT_GOVT_ACRONYMS = [
  'iit', 'nit', 'iisc', 'iiser', 'iiit', 'aiims', 'iim', 'csir', 'drdo', 'isro', 'icmr',
  'icar', 'barc', 'tifr', 'dae', 'dst', 'dbt', 'cdac', 'nic', 'bhel', 'ongc', 'ntpc',
  'iocl', 'gail', 'sail', 'hal', 'bel', 'nhpc', 'ccl', 'cil', 'aai', 'bis', 'nal', 'npl',
  'rrb', 'ssc', 'upsc', 'govt'
];

const LONG_GOVT_KEYWORDS = [
  'university', 'institute', 'national', 'central', 'powergrid', 'npcil', 'hpcl', 'bpcl',
  'coal india', 'pgcil', 'rvnl', 'irctc', 'government', 'ministry', 'department',
  'council', 'academy', 'board', 'fssai', 'defence', 'defense', 'research laboratory',
  'bank of', 'state bank', 'reserve bank', 'nabard', 'sidbi', 'life insurance', 'railway',
  'indian oil', 'oil india', 'oil and natural gas', 'nmdc', 'nalco', 'moil', 'mecon', 'rites',
  'concor', 'ircon', 'bsnl', 'mtnl', 'airports authority', 'esic', 'epfo', 'nhai', 'mazagon',
  'cochin shipyard', 'bharat ', 'hindustan', 'electricity board', 'transmission corporation',
  'pgimer', 'jipmer', 'public sector', 'psu'
];

/**
 * Checks if an organization or title corresponds to a legitimate government entity
 */
function isGovernmentEntity(org = '', title = '') {
  const corpus = `${org} ${title}`.toLowerCase();
  
  // Check multi-character keyword substrings
  if (LONG_GOVT_KEYWORDS.some(kw => corpus.includes(kw))) {
    return true;
  }

  // Check short acronyms with strict word boundaries to avoid false positives (e.g. 'analyst' matching 'nal')
  return SHORT_GOVT_ACRONYMS.some(acronym => {
    const regex = new RegExp(`\\b${acronym}\\b`, 'i');
    return regex.test(corpus);
  });
}

/**
 * Parses diverse date formats (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY) and validates expiry
 */
function parseAndNormalizeDate(dateStr) {
  if (!dateStr) {
    return { isoDate: null, formattedDate: 'Active 2026', isExpired: false };
  }

  const str = String(dateStr).trim();

  // Pattern: YYYY-MM-DD
  let match = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const dateObj = new Date(`${iso}T23:59:59`);
    const isExpired = !isNaN(dateObj.getTime()) && dateObj.getTime() < Date.now() - 86400000;
    return {
      isoDate: iso,
      formattedDate: formatIsoDate(dateObj, iso),
      isExpired
    };
  }

  // Pattern: DD-MM-YYYY or DD/MM/YYYY
  match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    const y = match[3];
    const iso = `${y}-${m}-${d}`;
    const dateObj = new Date(`${iso}T23:59:59`);
    const isExpired = !isNaN(dateObj.getTime()) && dateObj.getTime() < Date.now() - 86400000;
    return {
      isoDate: iso,
      formattedDate: formatIsoDate(dateObj, iso),
      isExpired
    };
  }

  // Direct Date.parse fallback
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const dObj = new Date(parsed);
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const isExpired = dObj.getTime() < Date.now() - 86400000;
    return {
      isoDate: iso,
      formattedDate: formatIsoDate(dObj, str),
      isExpired
    };
  }

  return { isoDate: null, formattedDate: str || 'Active 2026', isExpired: false };
}

function formatIsoDate(dateObj, fallback) {
  try {
    return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return fallback;
  }
}

/**
 * Backward compatibility helper for formatLastDate
 */
function formatLastDate(dateStr) {
  return parseAndNormalizeDate(dateStr).formattedDate;
}

/**
 * Generates a clean URL slug
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 40);
}

/**
 * Detects whether an opportunity targets Students/Scholars, Experienced Professionals, or Both
 */
function detectAudience(explicitAudience, title = '', org = '', qualification = '', shortInfo = '') {
  if (explicitAudience) {
    const low = String(explicitAudience).toLowerCase();
    if (low.includes('student') || low.includes('fresher') || low.includes('scholar')) return 'student';
    if (low.includes('professional') || low.includes('experienced') || low.includes('lateral')) return 'professional';
  }

  const corpus = `${title} ${org} ${qualification} ${shortInfo}`.toLowerCase();

  const isStudent = (
    corpus.includes('jrf') ||
    corpus.includes('srf') ||
    corpus.includes('fellow') ||
    corpus.includes('fellowship') ||
    corpus.includes('phd') ||
    corpus.includes('intern') ||
    corpus.includes('internship') ||
    corpus.includes('trainee') ||
    corpus.includes('apprentice') ||
    corpus.includes('graduate engineer trainee') ||
    corpus.includes('management trainee') ||
    corpus.includes('executive trainee') ||
    corpus.includes('project assistant') ||
    corpus.includes('project associate') ||
    corpus.includes('fresher') ||
    corpus.includes('scholar') ||
    corpus.includes('gate 202')
  );

  const isProfessional = (
    corpus.includes('scientist b') ||
    corpus.includes('scientist c') ||
    corpus.includes('scientist d') ||
    corpus.includes('scientist e') ||
    corpus.includes('professor') ||
    corpus.includes('faculty') ||
    corpus.includes('postdoc') ||
    corpus.includes('research associate iii') ||
    corpus.includes('research associate ii') ||
    corpus.includes('experienced') ||
    corpus.includes('lateral') ||
    corpus.includes('deputy manager') ||
    corpus.includes('general manager') ||
    corpus.includes('assistant manager') ||
    corpus.includes('specialist') ||
    corpus.includes('medical officer') ||
    corpus.includes('years experience') ||
    corpus.includes('yrs experience')
  );

  if (isStudent && !isProfessional) return 'student';
  if (isProfessional && !isStudent) return 'professional';
  return 'both';
}

/**
 * Normalizes a raw opening extracted via Context.dev into the portal item schema
 */
function normalizeContextItem(raw, defaults = {}) {
  if (!raw || !raw.title) return null;

  const title = String(raw.title).trim();
  const organization = String(raw.organization || defaults.organization || 'Government of India Institution').trim();
  const link = (raw.link && raw.link.startsWith('http')) ? raw.link.trim() : '#';

  // Generate deterministic ID
  const hash = crypto.createHash('md5').update(`${title}|${organization}`).digest('hex').slice(0, 8);
  const orgSlug = slugify(organization) || 'govt';
  const id = `cd-${orgSlug}-${hash}`;

  // Categorization & Sector detection
  const lowerTitle = title.toLowerCase();
  const lowerOrg = organization.toLowerCase();
  let radarCategory = defaults.category || raw.category || 'research';
  let sector = 'Research & Fellowship';

  if (
    lowerTitle.includes('psu') ||
    lowerOrg.includes('ongc') ||
    lowerOrg.includes('bhel') ||
    lowerOrg.includes('ntpc') ||
    lowerOrg.includes('iocl') ||
    lowerOrg.includes('gail') ||
    lowerOrg.includes('sail') ||
    lowerOrg.includes('powergrid') ||
    lowerOrg.includes('coal india') ||
    lowerOrg.includes('hpcl') ||
    lowerOrg.includes('bpcl')
  ) {
    radarCategory = 'psu';
    sector = 'Public Sector (PSU)';
  } else if (lowerTitle.includes('intern') || lowerTitle.includes('internship') || lowerTitle.includes('trainee') || lowerTitle.includes('apprentice')) {
    radarCategory = 'intern';
    sector = 'Engineering & Technical';
  } else if (lowerOrg.includes('drdo') || lowerTitle.includes('drdo') || lowerOrg.includes('defense') || lowerOrg.includes('defence')) {
    sector = 'Defense & Armed Forces';
  } else if (lowerOrg.includes('aiims') || lowerTitle.includes('medical') || lowerTitle.includes('nursing') || lowerTitle.includes('health')) {
    sector = 'Medical & Healthcare';
  } else if (lowerTitle.includes('faculty') || lowerTitle.includes('professor') || lowerTitle.includes('lecturer')) {
    sector = 'Teaching & Education';
  }

  // Dates and expiration check
  const dateInfo = parseAndNormalizeDate(raw.lastDate);
  if (dateInfo.isExpired) {
    return null; // Expired, skip
  }

  // Target Audience classification (Student / Scholar vs Professional / Experienced)
  const targetAudience = detectAudience(raw.targetAudience || defaults.audience, title, organization, raw.qualification, raw.shortInfo);
  const audienceBadge = targetAudience === 'student'
    ? 'Student / Fresher / Scholar'
    : targetAudience === 'professional'
      ? 'Professional / Experienced'
      : 'Students & Professionals';

  const qualification = raw.qualification || 'As per official institutional notification';
  const stipendOrSalary = (raw.stipendOrSalary && raw.stipendOrSalary !== 'N/A') ? String(raw.stipendOrSalary).trim() : '';
  const totalVacancies = raw.totalVacancies || 'Refer Notification';
  const state = raw.state || 'Central / All India';
  const shortInfo = raw.shortInfo || `${title} released by ${organization}. Eligible candidates can apply directly via the official institution link.`;
  const opportunityType = raw.opportunityType || defaults.opportunityType || (radarCategory === 'research' ? 'Research Fellowship' : radarCategory === 'psu' ? 'PSU Recruitment' : 'Institutional Opening');

  return {
    id,
    title,
    organization,
    sector,
    category: 'latestJobs',
    type: 'job',
    radarCategory,
    radarType: opportunityType,
    targetAudience,
    audienceLabel: audienceBadge,
    stipendOrSalary,
    qualification,
    state,
    postedDateFormatted: 'Active 2026',
    lastDate: dateInfo.isoDate,
    lastDateFormatted: dateInfo.formattedDate,
    link,
    source: 'Government Institute (Context)',
    level: 'central',
    isActive: true,
    details: {
      postDate: 'Active 2026',
      lastDate: dateInfo.formattedDate,
      totalVacancies,
      qualification,
      stipendOrSalary,
      targetAudience: audienceBadge,
      shortInfo,
      importantDates: {
        'Application Deadline': dateInfo.formattedDate,
        'Application Mode': 'Online / Official Institutional Form'
      },
      importantLinks: [
        { label: 'Official Institutional Notification / Apply Online', url: link }
      ]
    }
  };
}

/**
 * Executes fetch with automated retry on HTTP 429 concurrency limit
 */
async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 && attempt < maxRetries) {
      console.warn(`[ContextDev Scraper] Concurrency limit hit (429). Backing off for 3s before retry (${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, 3200));
      continue;
    }
    return res;
  }
}

/**
 * Scrapes government openings via Context.dev Answers API
 * Extracts research programs and fellowships for students as well as institutional & PSU vacancies for professionals.
 * Runs queries sequentially to respect Context.dev's single in-flight concurrency restriction.
 *
 * @param {Object} options
 * @param {number} [options.maxItems=40] - Max total items to return
 * @param {string} [options.filterAudience='all'] - 'all' | 'student' | 'professional'
 * @returns {Promise<Array>} List of normalized portal items
 */
async function scrapeContextDevOpenings({ maxItems = 200, filterAudience = 'all', mode = 'quick', onProgress = null } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[ContextDev Scraper] No Context.dev API key found in environment (.env). Skipping Context.dev scrape.');
    if (onProgress) onProgress({ status: 'skipped', reason: 'No API key' });
    return [];
  }

  console.log(`[ContextDev Scraper] Starting institutional government & PSU scrape via Context.dev (${mode} mode)...`);
  if (onProgress) onProgress({ status: 'running', message: `Initializing Context.dev queries (${mode} mode)...` });

  // Query catalogue lives in contextDevQueries.js (research bodies, institutes, PSUs, banks, state PSUs...)
  const queryTasks = getQueryTasks(new Date().getFullYear(), mode);

  const results = [];
  const seenIds = new Set();
  const seenLinks = new Set();

  let completedTasks = 0;
  // Execute sequentially to respect Context.dev account concurrency limit (1 in-flight request at a time)
  for (const { name, task, category, audience, opportunityType } of queryTasks) {
    try {
      console.log(`[ContextDev Scraper] Querying: ${name}...`);
      if (onProgress) {
        onProgress({
          status: 'running',
          taskName: name,
          completed: completedTasks,
          total: queryTasks.length,
          count: results.length
        });
      }
      const response = await fetchWithRetry(CONTEXT_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: 'fast',
          task,
          json_format: {
            openings: [
              {
                title: '',
                organization: '',
                sector: '',
                category,
                targetAudience: audience,
                opportunityType,
                qualification: '',
                stipendOrSalary: '',
                state: '',
                lastDate: 'YYYY-MM-DD',
                totalVacancies: '',
                link: '',
                shortInfo: ''
              }
            ]
          }
        })
      });

      if (!response || !response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[ContextDev Scraper] [${name}] HTTP ${response?.status}:`, errorText.slice(0, 140));
        continue;
      }

      const data = await response.json();
      const rawOpenings = data?.json_content?.openings || [];

      for (const raw of rawOpenings) {
        if (!raw.organization || !isGovernmentEntity(raw.organization, raw.title)) {
          continue; // Strict government & legitimate PSU filter
        }

        const normalized = normalizeContextItem(raw, { category, audience, opportunityType });
        if (!normalized) continue;

        // Filter by audience if requested
        if (filterAudience !== 'all' && normalized.targetAudience !== 'both' && normalized.targetAudience !== filterAudience) {
          continue;
        }

        if (seenIds.has(normalized.id) || (normalized.link !== '#' && seenLinks.has(normalized.link))) {
          continue;
        }

        seenIds.add(normalized.id);
        if (normalized.link !== '#') seenLinks.add(normalized.link);

        results.push(normalized);
        if (results.length >= maxItems) break;
      }

      if (results.length >= maxItems) break;

      // Small pause between sequential queries to let connection clear
      await new Promise(r => setTimeout(r, 1200));
      completedTasks++;
    } catch (err) {
      completedTasks++;
      console.warn(`[ContextDev Scraper] [${name}] Error:`, err.message);
    }
  }

  console.log(`[ContextDev Scraper] Successfully extracted ${results.length} verified government institutional & PSU openings.`);
  return results;
}

// Standalone CLI runner when executed directly (e.g. node contextDevScraper.js)
if (require.main === module) {
  scrapeContextDevOpenings({ maxItems: 200 })
    .then(items => {
      console.log(`\n Extracted ${items.length} openings via Context.dev:`);
      items.forEach((item, idx) => {
        console.log(`\n[${idx + 1}] ${item.title}`);
        console.log(`    Org: ${item.organization}`);
        console.log(`    Audience: ${item.audienceLabel}`);
        console.log(`    Category: ${item.radarCategory} | Sector: ${item.sector}`);
        if (item.stipendOrSalary) console.log(`    Stipend/Salary: ${item.stipendOrSalary}`);
        console.log(`    Deadline: ${item.lastDateFormatted || item.lastDate}`);
        console.log(`    Link: ${item.link}`);
      });
      process.exit(0);
    })
    .catch(err => {
      console.error('[ContextDev Scraper] CLI Execution failed:', err);
      process.exit(1);
    });
}

module.exports = {
  scrapeContextDevOpenings,
  fetchContextDevOpenings: scrapeContextDevOpenings,
  normalizeContextItem,
  isGovernmentEntity,
  formatLastDate,
  parseAndNormalizeDate,
  detectAudience,
  getApiKey
};
