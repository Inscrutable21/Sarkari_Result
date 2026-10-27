/**
 * Context.dev Web Scraper Service for Government Openings
 * Scrapes and structures research fellowships, scientist openings, and institutional
 * recruitments from premier Indian government institutions, research councils, colleges, and PSUs.
 */

const crypto = require('crypto');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
} catch {
  // Ignore in environments where dotenv is preloaded
}

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
const GOVT_KEYWORDS = [
  'iit', 'nit', 'iisc', 'iiser', 'aiims', 'iim', 'csir', 'drdo', 'isro', 'icmr',
  'icar', 'barc', 'tifr', 'dae', 'dst', 'dbt', 'cdac', 'nic', 'university',
  'institute', 'national', 'central', 'bhel', 'ongc', 'ntpc', 'iocl', 'gail',
  'sail', 'hal', 'bel', 'powergrid', 'nhpc', 'npcil', 'rrb', 'ssc', 'upsc',
  'government', 'govt', 'ministry', 'department', 'council', 'academy', 'board'
];

/**
 * Checks if an organization or title corresponds to a government entity
 */
function isGovernmentEntity(org = '', title = '') {
  const corpus = `${org} ${title}`.toLowerCase();
  return GOVT_KEYWORDS.some(kw => corpus.includes(kw));
}

/**
 * Formats YYYY-MM-DD into readable Indian date format (e.g. 30 Jun 2026)
 */
function formatLastDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'Active 2026';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
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
 * Normalizes a raw opening extracted via Context.dev into the portal item schema
 */
function normalizeContextItem(raw) {
  if (!raw || !raw.title) return null;

  const title = String(raw.title).trim();
  const organization = String(raw.organization || 'Government of India Institution').trim();
  const link = (raw.link && raw.link.startsWith('http')) ? raw.link.trim() : '#';

  // Generate deterministic ID
  const hash = crypto.createHash('md5').update(`${title}|${organization}`).digest('hex').slice(0, 8);
  const orgSlug = slugify(organization) || 'govt';
  const id = `cd-${orgSlug}-${hash}`;

  // Categorization
  const lowerTitle = title.toLowerCase();
  const lowerOrg = organization.toLowerCase();
  let radarCategory = 'research';
  let sector = 'Research & Fellowship';

  if (
    lowerTitle.includes('psu') ||
    lowerOrg.includes('ongc') ||
    lowerOrg.includes('bhel') ||
    lowerOrg.includes('ntpc') ||
    lowerOrg.includes('iocl') ||
    lowerOrg.includes('gail') ||
    lowerOrg.includes('sail')
  ) {
    radarCategory = 'psu';
    sector = 'Public Sector (PSU)';
  } else if (lowerTitle.includes('intern') || lowerTitle.includes('internship') || lowerTitle.includes('trainee')) {
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
  let lastDate = raw.lastDate || '';
  if (lastDate && !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    const match = lastDate.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      lastDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
  }

  const lastDateFormatted = formatLastDate(lastDate);

  // Check if closing date is in the past
  if (lastDate && /^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    const deadline = new Date(lastDate + 'T23:59:59').getTime();
    if (deadline < Date.now() - 86400000) {
      return null; // Expired, skip
    }
  }

  const qualification = raw.qualification || 'As per official institutional notification';
  const totalVacancies = raw.totalVacancies || 'Refer Notification';
  const state = raw.state || 'Central / All India';
  const shortInfo = raw.shortInfo || `${title} released by ${organization}. Eligible candidates can apply directly via the official institution link.`;

  return {
    id,
    title,
    organization,
    sector,
    category: 'latestJobs',
    type: 'job',
    radarCategory,
    radarType: raw.category || 'Institutional Opening',
    qualification,
    state,
    postedDateFormatted: 'Active 2026',
    lastDate: lastDate || null,
    lastDateFormatted,
    link,
    source: 'Government Institute (Context)',
    level: 'central',
    isActive: true,
    details: {
      postDate: 'Active 2026',
      lastDate: lastDateFormatted,
      totalVacancies,
      qualification,
      shortInfo,
      importantDates: {
        'Application Deadline': lastDateFormatted,
        'Application Mode': 'Online / Official Institutional Form'
      },
      importantLinks: [
        { label: 'Official Institutional Notification / Apply Online', url: link }
      ]
    }
  };
}

/**
 * Scrapes government openings via Context.dev Answers API
 * @param {Object} options
 * @param {number} [options.maxItems=30] - Max total items to return
 * @returns {Promise<Array>} List of normalized portal items
 */
async function scrapeContextDevOpenings({ maxItems = 30 } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[ContextDev Scraper] No Contextdev API key found in environment (.env). Skipping Context.dev scrape.');
    return [];
  }

  console.log('[ContextDev Scraper] Starting institutional government scrape via Context.dev...');

  const queryTasks = [
    {
      task: 'Find 8 active official government research fellowship (JRF, SRF, RA, PostDoc) and project scientist openings in Indian research councils (CSIR, DRDO, ICMR, ISRO, BARC, TIFR, DST) closing in 2026.',
      defaultCategory: 'research'
    },
    {
      task: 'Find 8 active official recruitment, faculty, and research openings in premier Indian government institutions and universities (IITs, NITs, IISc, IISERs, AIIMS, Central Universities) closing in 2026.',
      defaultCategory: 'govt'
    },
    {
      task: 'Find 8 active recruitment notifications in Indian government PSUs and autonomous bodies (ONGC, BHEL, NTPC, IOCL, GAIL, SAIL, BEL, CDAC) closing in 2026.',
      defaultCategory: 'psu'
    }
  ];

  const results = [];
  const seenIds = new Set();
  const seenLinks = new Set();

  for (const { task, defaultCategory } of queryTasks) {
    try {
      const response = await fetch(CONTEXT_API_URL, {
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
                category: defaultCategory,
                qualification: '',
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

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[ContextDev Scraper] HTTP ${response.status} from Context.dev:`, errorText.slice(0, 150));
        continue;
      }

      const data = await response.json();
      const rawOpenings = data?.json_content?.openings || [];

      for (const raw of rawOpenings) {
        if (!raw.organization || !isGovernmentEntity(raw.organization, raw.title)) {
          continue; // Strict government check
        }

        const normalized = normalizeContextItem(raw);
        if (!normalized) continue;

        if (seenIds.has(normalized.id) || (normalized.link !== '#' && seenLinks.has(normalized.link))) {
          continue;
        }

        seenIds.add(normalized.id);
        if (normalized.link !== '#') seenLinks.add(normalized.link);

        results.push(normalized);
        if (results.length >= maxItems) break;
      }

      if (results.length >= maxItems) break;
    } catch (err) {
      console.warn(`[ContextDev Scraper] Error during task fetch:`, err.message);
    }
  }

  console.log(`[ContextDev Scraper] Successfully extracted ${results.length} verified government openings.`);
  return results;
}

module.exports = {
  scrapeContextDevOpenings,
  fetchContextDevOpenings: scrapeContextDevOpenings,
  normalizeContextItem,
  isGovernmentEntity,
  formatLastDate,
  getApiKey
};
