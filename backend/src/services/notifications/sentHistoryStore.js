const {
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
 * Loads the sent-job history store exclusively from MongoDB Atlas
 */
async function getSentJobHistory() {
  const mongoHistory = await getSentJobHistoryFromMongo();
  return (mongoHistory && typeof mongoHistory === 'object') ? mongoHistory : {};
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
 * Persists newly dispatched jobs into the user's sent history exclusively in MongoDB Atlas
 */
async function recordSentJobsForSubscriber(email, jobs) {
  if (!email || !Array.isArray(jobs) || jobs.length === 0) return;
  const cleanEmail = email.trim().toLowerCase();
  await recordSentJobsInMongo(cleanEmail, jobs);
}

module.exports = {
  normalizeJobTitle,
  normalizeJobLink,
  getJobFingerprint,
  getSentJobHistory,
  hasJobBeenSentToSubscriber,
  recordSentJobsForSubscriber
};
