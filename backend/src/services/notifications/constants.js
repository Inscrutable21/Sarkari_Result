const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Load environment variables from .env if not already set
function loadEnv() {
  const envCandidates = [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../backend/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env')
  ];
  for (const envPath of envCandidates) {
    if (nodeFs.existsSync(envPath)) {
      try {
        const content = nodeFs.readFileSync(envPath, 'utf8');
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
      } catch { }
    }
  }
}
loadEnv();

const DATA_DIR = path.resolve(__dirname, '../../data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const TRACKED_JOBS_FILE = path.join(DATA_DIR, 'trackedJobs.json');
const LOGS_FILE = path.join(DATA_DIR, 'emailLogs.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const SENT_JOB_HISTORY_FILE = path.join(DATA_DIR, 'sentJobHistory.json');

/**
 * Defensive HTML Escaper to prevent XSS in emails and rendered HTML pages
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates and ensures URLs only use http/https protocols
 */
function safeHttpUrl(rawUrl, fallback = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch { }
  return fallback;
}

/**
 * Generates a stable deterministic tracking ID from candidate email and job key
 */
function generateStableTrackId(email, jobKey) {
  const normEmail = (email || '').trim().toLowerCase();
  const normKey = (jobKey || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  const hash = crypto.createHash('md5').update(`${normEmail}::${normKey}`).digest('hex').slice(0, 10);
  return `trk_${hash}`;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  return EMAIL_REGEX.test(email.trim());
}

module.exports = {
  DATA_DIR,
  SUBSCRIBERS_FILE,
  TRACKED_JOBS_FILE,
  LOGS_FILE,
  JOBS_FILE,
  SENT_JOB_HISTORY_FILE,
  escapeHtml,
  safeHttpUrl,
  generateStableTrackId,
  isValidEmail,
  loadEnv
};
