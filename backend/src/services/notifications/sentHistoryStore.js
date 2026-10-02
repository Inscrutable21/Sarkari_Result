const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const {
  DATA_DIR,
  SUBSCRIBERS_FILE,
  LOGS_FILE,
  SENT_JOB_HISTORY_FILE
} = require('./constants');
const {
  isMongoEnabled,
  getSentJobHistoryFromMongo,
  recordSentJobsInMongo
} = require('../mongoService');

/**
 * Normalizes a job title for robust historical deduplication
 * Removes extraneous date labels, trailing pipe segments, extra spaces, and punctuation
 */
function normalizeJobTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .toLowerCase()
    .replace(/\|\s*last\s*date\s*:\s*[^\s|]+/gi, '')
    .replace(/\|\s*date\s*extended/gi, '')
    .replace(/\b(online\s*form|recruitment|apply\s*online|notification)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a job URL to prevent scheme or trailing slash discrepancies
 */
function normalizeJobLink(rawLink) {
  if (!rawLink || typeof rawLink !== 'string') return '';
  return rawLink
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/**
 * Generates a stable deterministic fingerprint from job attributes
 */
function getJobFingerprint(job) {
  if (!job) return '';
  const id = (job.id || '').trim().toLowerCase();
  if (id) return id;
  const linkKey = normalizeJobLink(job.link);
  if (linkKey) return linkKey;
  const titleKey = normalizeJobTitle(job.title);
  return titleKey;
}

/**
 * Loads the sent-job history store indexed by subscriber email.
 * If MongoDB is enabled, loads from Atlas. Otherwise from sentJobHistory.json or auto-seeds.
 */
async function getSentJobHistory() {
  if (isMongoEnabled()) {
    try {
      const mongoHistory = await getSentJobHistoryFromMongo();
      if (mongoHistory && Object.keys(mongoHistory).length > 0) {
        return mongoHistory;
      }
    } catch (err) {
      console.warn('[MongoDB] getSentJobHistory fallback:', err.message);
    }
  }

  try {
    const raw = await fs.readFile(SENT_JOB_HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch { }

  // Auto-seed from existing subscribers.json and emailLogs.json
  const seeded = {};

  try {
    // 1. Seed from subscribers.json
    if (nodeFs.existsSync(SUBSCRIBERS_FILE)) {
      const subsRaw = nodeFs.readFileSync(SUBSCRIBERS_FILE, 'utf-8');
      const subs = JSON.parse(subsRaw);
      if (Array.isArray(subs)) {
        for (const s of subs) {
          const email = (s.email || '').trim().toLowerCase();
          if (!email) continue;
          if (!seeded[email]) {
            seeded[email] = {
              jobIds: [],
              jobLinks: [],
              jobTitles: [],
              history: [],
              lastDispatchedAt: s.lastNotifiedAt || null
            };
          }
          if (Array.isArray(s.notifiedJobIds)) {
            for (const id of s.notifiedJobIds) {
              if (id && !seeded[email].jobIds.includes(id)) {
                seeded[email].jobIds.push(id);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Sent History] Auto-seed from subscribers.json skipped:', err.message);
  }

  try {
    // 2. Seed from emailLogs.json
    if (nodeFs.existsSync(LOGS_FILE)) {
      const logsRaw = nodeFs.readFileSync(LOGS_FILE, 'utf-8');
      const logs = JSON.parse(logsRaw);
      if (Array.isArray(logs)) {
        for (const log of logs) {
          const email = (log.recipient || '').trim().toLowerCase();
          if (!email) continue;
          if (!seeded[email]) {
            seeded[email] = {
              jobIds: [],
              jobLinks: [],
              jobTitles: [],
              history: [],
              lastDispatchedAt: log.timestamp || null
            };
          }
          if (Array.isArray(log.jobTitles)) {
            for (const t of log.jobTitles) {
              const normT = normalizeJobTitle(t);
              if (normT && !seeded[email].jobTitles.includes(normT)) {
                seeded[email].jobTitles.push(normT);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Sent History] Auto-seed from emailLogs.json skipped:', err.message);
  }

  // Save bootstrapped history
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SENT_JOB_HISTORY_FILE, JSON.stringify(seeded, null, 2), 'utf-8');
  } catch { }

  return seeded;
}

/**
 * Checks whether a given job has already been sent to a subscriber
 */
function hasJobBeenSentToSubscriber(email, job, historyMap, notifiedJobIds = []) {
  if (!email || !job) return false;
  const cleanEmail = email.trim().toLowerCase();
  const userHistory = historyMap && historyMap[cleanEmail];

  const jobId = (job.id || '').trim().toLowerCase();
  if (jobId) {
    if (userHistory && Array.isArray(userHistory.jobIds) && userHistory.jobIds.includes(jobId)) {
      return true;
    }
    if (Array.isArray(notifiedJobIds) && notifiedJobIds.includes(jobId)) {
      return true;
    }
  }

  const normLink = normalizeJobLink(job.link);
  if (normLink && userHistory && Array.isArray(userHistory.jobLinks) && userHistory.jobLinks.includes(normLink)) {
    return true;
  }

  const normTitle = normalizeJobTitle(job.title);
  if (normTitle && userHistory && Array.isArray(userHistory.jobTitles)) {
    const hasMatch = userHistory.jobTitles.some(prev =>
      prev === normTitle || (prev.length > 12 && normTitle.includes(prev)) || (normTitle.length > 12 && prev.includes(normTitle))
    );
    if (hasMatch) return true;
  }

  return false;
}

/**
 * Persists newly dispatched jobs into the user's sent history and subscriber record
 */
async function recordSentJobsForSubscriber(email, jobs) {
  if (!email || !Array.isArray(jobs) || jobs.length === 0) return;
  const cleanEmail = email.trim().toLowerCase();
  const historyMap = await getSentJobHistory();

  if (!historyMap[cleanEmail]) {
    historyMap[cleanEmail] = {
      jobIds: [],
      jobLinks: [],
      jobTitles: [],
      history: [],
      lastDispatchedAt: null
    };
  }

  const entry = historyMap[cleanEmail];
  const nowIso = new Date().toISOString();
  entry.lastDispatchedAt = nowIso;

  const newIds = [];
  for (const job of jobs) {
    const id = (job.id || '').trim();
    if (id && !entry.jobIds.includes(id)) {
      entry.jobIds.push(id);
      newIds.push(id);
    }

    const normLink = normalizeJobLink(job.link);
    if (normLink && !entry.jobLinks.includes(normLink)) {
      entry.jobLinks.push(normLink);
    }

    const normTitle = normalizeJobTitle(job.title);
    if (normTitle && !entry.jobTitles.includes(normTitle)) {
      entry.jobTitles.push(normTitle);
    }

    entry.history.push({
      id: id || getJobFingerprint(job),
      title: job.title || '',
      link: job.link || '',
      organization: job.organization || '',
      sentAt: nowIso
    });
  }

  // Cap history to last 500 items per user
  if (entry.history.length > 500) {
    entry.history = entry.history.slice(-500);
  }

  // Persist to MongoDB Atlas
  if (isMongoEnabled()) {
    recordSentJobsInMongo(cleanEmail, jobs).catch(err => {
      console.warn('[MongoDB] recordSentJobs warning:', err.message);
    });
  }

  // Persist sentJobHistory.json
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SENT_JOB_HISTORY_FILE, JSON.stringify(historyMap, null, 2), 'utf-8');
  } catch (fsErr) {
    console.warn('[Storage] Local write notice:', fsErr.message);
  }

  // Also update subscribers.json to keep them aligned
  try {
    let localSubs = [];
    if (nodeFs.existsSync(SUBSCRIBERS_FILE)) {
      const subsRaw = nodeFs.readFileSync(SUBSCRIBERS_FILE, 'utf-8');
      localSubs = JSON.parse(subsRaw);
    }
    if (Array.isArray(localSubs)) {
      const idx = localSubs.findIndex(s => (s.email || '').toLowerCase() === cleanEmail);
      if (idx !== -1) {
        localSubs[idx].notifiedJobIds = Array.from(new Set([
          ...(localSubs[idx].notifiedJobIds || []),
          ...entry.jobIds
        ]));
        localSubs[idx].lastNotifiedAt = nowIso;
        await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(localSubs, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.warn('[Sent History] Update subscribers.json warning:', err.message);
  }
}

module.exports = {
  normalizeJobTitle,
  normalizeJobLink,
  getJobFingerprint,
  getSentJobHistory,
  hasJobBeenSentToSubscriber,
  recordSentJobsForSubscriber
};
