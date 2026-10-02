const {
  isValidEmail,
  safeHttpUrl,
  generateStableTrackId
} = require('./constants');
const {
  getTrackedJobsFromMongo,
  upsertTrackedJobInMongo,
  updateTrackedJobStatusInMongo,
  getPortalDatasetFromMongo
} = require('../mongoService');

/**
 * Calculates calendar days remaining until deadline
 */
function calculateDaysLeft(lastDateStr) {
  if (!lastDateStr) return null;
  const deadline = new Date(lastDateStr + 'T23:59:59');
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Active in-memory reminder timers map
 */
const activeReminderTimers = new Map();

/**
 * Returns active reminder timers (optionally filtered by email)
 */
function getActiveReminderTimers(filterEmail = null) {
  const now = Date.now();
  const list = [];
  for (const [key, timer] of activeReminderTimers.entries()) {
    if (filterEmail && timer.email.toLowerCase() !== filterEmail.toLowerCase().trim()) {
      continue;
    }
    const remainingMs = Math.max(0, timer.targetTime - now);
    list.push({
      timerId: key,
      trackId: timer.trackId,
      email: timer.email,
      jobTitle: timer.jobTitle,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      targetTime: new Date(timer.targetTime).toISOString()
    });
  }
  return list;
}

/**
 * Loads all currently tracked jobs across candidates exclusively from MongoDB Atlas
 */
async function getTrackedJobs() {
  const mongoTracked = await getTrackedJobsFromMongo();
  const list = Array.isArray(mongoTracked) ? mongoTracked : [];

  return list.map(t => ({
    ...t,
    reminderCount: t.reminderCount ? Number(t.reminderCount) : 0,
    applied: t.applied === true || String(t.applied).toLowerCase() === 'true',
    active: t.applied !== true && String(t.applied).toLowerCase() !== 'true'
  }));
}

/**
 * Persists tracked jobs list exclusively to MongoDB Atlas
 */
async function saveTrackedJobs(tracked) {
  if (!Array.isArray(tracked)) return;
  for (const t of tracked) {
    if (t.email && (t.id || t.jobId)) {
      await upsertTrackedJobInMongo(t);
    }
  }
}

/**
 * Schedules a 1-minute (or custom delay) test reminder for an existing tracked job
 */
async function scheduleReminderTimer({ trackId, email, delaySeconds = 60 }) {
  const trackedList = await getTrackedJobs();
  const track = trackedList.find(t =>
    (trackId && t.id === trackId) ||
    (email && t.email.toLowerCase() === email.trim().toLowerCase())
  );

  if (!track) {
    throw new Error('Tracked job record not found in database. Please verify your email or tracking ID.');
  }

  const timerKey = `${track.id || track.email}`;
  // Cancel previous pending timer for this record if any
  if (activeReminderTimers.has(timerKey)) {
    clearTimeout(activeReminderTimers.get(timerKey).timeoutHandle);
    activeReminderTimers.delete(timerKey);
  }

  const delayMs = Math.max(5000, (Number(delaySeconds) || 60) * 1000);
  const targetTime = Date.now() + delayMs;

  console.log(`[Timer Scheduled] Reminder for ${track.email} (${track.jobTitle}) scheduled in ${Math.round(delayMs / 1000)} seconds.`);

  const timeoutHandle = setTimeout(async () => {
    activeReminderTimers.delete(timerKey);
    try {
      console.log(`[Timer Fired] Executing scheduled 1-min reminder dispatch for ${track.email}...`);
      let daysLeft = calculateDaysLeft(track.lastDate);
      if (daysLeft === null || daysLeft <= 0) {
        daysLeft = 5; // realistic fallback for test dispatch
      }
      const { sendTrackedJobEmail } = require('./dispatcher');
      const sendRes = await sendTrackedJobEmail(track, daysLeft, false, true);
      track.lastReminderSentAt = new Date().toISOString();
      track.reminderCount = (track.reminderCount || 0) + 1;
      await upsertTrackedJobInMongo(track);
      console.log(`[Timer Success] 1-min test reminder delivered to ${track.email}:`, sendRes.messageId);
    } catch (err) {
      console.error(`[Timer Error] Scheduled reminder dispatch failed for ${track.email}:`, err.message);
    }
  }, delayMs);

  activeReminderTimers.set(timerKey, {
    trackId: track.id,
    email: track.email,
    jobTitle: track.jobTitle,
    targetTime,
    timeoutHandle
  });

  return {
    success: true,
    message: `1-minute reminder timer set! Email will be delivered in ${Math.round(delayMs / 1000)} seconds to ${track.email}.`,
    delaySeconds: Math.round(delayMs / 1000),
    targetTime: new Date(targetTime).toISOString(),
    track
  };
}

/**
 * Dispatches a reminder email immediately for verification
 */
async function sendImmediateReminder({ trackId, email }) {
  const trackedList = await getTrackedJobs();
  const track = trackedList.find(t =>
    (trackId && t.id === trackId) ||
    (email && t.email.toLowerCase() === email.trim().toLowerCase())
  );

  if (!track) {
    throw new Error('Tracked job record not found in database.');
  }

  let daysLeft = calculateDaysLeft(track.lastDate);
  if (daysLeft === null || daysLeft <= 0) {
    daysLeft = 5; // realistic fallback
  }

  const { sendTrackedJobEmail } = require('./dispatcher');
  const sendRes = await sendTrackedJobEmail(track, daysLeft, false, true);
  track.lastReminderSentAt = new Date().toISOString();
  track.reminderCount = (track.reminderCount || 0) + 1;
  await upsertTrackedJobInMongo(track);

  return {
    success: true,
    message: `Test reminder email successfully dispatched to ${track.email}! Check your inbox.`,
    track,
    daysLeft,
    messageId: sendRes.messageId
  };
}

/**
 * Tracks a specific job opening for a user and dispatches immediate confirmation email (Purely MongoDB Atlas)
 */
async function trackJob({ email, name, jobId, jobTitle, organization, lastDate, lastDateFormatted, link }) {
  if (!isValidEmail(email)) {
    throw new Error('Please enter a valid email address');
  }
  if (!jobId && !jobTitle) {
    throw new Error('Job details are required to set reminders');
  }

  const cleanEmail = email.trim().toLowerCase();
  const trackedList = await getTrackedJobs();

  // Try to enrich from database
  let resolvedJob = null;
  try {
    const jobs = (await getPortalDatasetFromMongo('jobs')) || [];
    resolvedJob = jobs.find(j => j.id === jobId || j.title === jobTitle);
  } catch { }

  const finalTitle = jobTitle || resolvedJob?.title || 'Government Recruitment';
  const finalOrg = organization || resolvedJob?.organization || 'Government Department';
  const finalLastDate = lastDate || resolvedJob?.lastDate || null;
  const finalLastDateFormatted = lastDateFormatted || resolvedJob?.lastDateFormatted || finalLastDate || 'Check Notice';
  const rawCandidateLink = link || resolvedJob?.link;
  const finalLink = safeHttpUrl(rawCandidateLink, 'https://www.sarkariresult.com');

  const daysLeft = calculateDaysLeft(finalLastDate);

  // Check if candidate is already tracking this specific job
  const existing = trackedList.find(t =>
    t.email.toLowerCase() === cleanEmail && (t.jobId === jobId || t.jobTitle === finalTitle)
  );

  let trackRecord;
  let isNew = false;
  const now = new Date().toISOString();

  if (existing) {
    trackRecord = {
      ...existing,
      name: name?.trim() || existing.name,
      jobTitle: finalTitle,
      organization: finalOrg,
      lastDate: finalLastDate,
      lastDateFormatted: finalLastDateFormatted,
      link: finalLink,
      applied: false, // Reactivate if user re-tracks
      appliedAt: null,
      active: true,
      updatedAt: now
    };
  } else {
    isNew = true;
    trackRecord = {
      id: generateStableTrackId(cleanEmail, jobId || finalTitle),
      email: cleanEmail,
      name: name?.trim() || 'Job Aspirant',
      jobId: jobId || ('job_' + Math.random().toString(36).slice(2, 8)),
      jobTitle: finalTitle,
      organization: finalOrg,
      lastDate: finalLastDate,
      lastDateFormatted: finalLastDateFormatted,
      link: finalLink,
      subscribedAt: now,
      lastReminderSentAt: null,
      reminderCount: 0,
      applied: false,
      appliedAt: null,
      active: true
    };
  }

  // Persist directly into MongoDB Atlas
  await upsertTrackedJobInMongo(trackRecord);

  // Immediately dispatch confirmation email with countdown
  let emailSent = false;
  try {
    const { sendTrackedJobEmail } = require('./dispatcher');
    const mailRes = await sendTrackedJobEmail(trackRecord, daysLeft, true);
    emailSent = mailRes.success === true;
    console.log(`[Job Tracker] Confirmation email sent to ${cleanEmail} for ${finalTitle}`);
  } catch (err) {
    console.warn(`[Job Tracker] Could not send confirmation email: ${err.message}`);
  }

  return {
    success: true,
    isNew,
    track: trackRecord,
    emailSent,
    daysLeft
  };
}

/**
 * Updates application status from candidate response ("applied" or "pending") exclusively in MongoDB Atlas
 */
async function updateJobApplicationStatus(trackId, status, fallbackContext = {}) {
  const cleanTrackId = (trackId || '').trim();
  const queryEmail = (fallbackContext.email || '').trim().toLowerCase();
  const queryJob = (fallbackContext.jobId || fallbackContext.job || '').trim().toLowerCase();

  if (!cleanTrackId && !queryEmail) {
    throw new Error('Missing tracking identifier');
  }

  const trackedList = await getTrackedJobs();
  let track = null;

  // 1. Exact match on track ID
  if (cleanTrackId) {
    track = trackedList.find(t => t.id === cleanTrackId);
  }

  // 2. Case-insensitive / trimmed match
  if (!track && cleanTrackId) {
    track = trackedList.find(t => t.id && t.id.toLowerCase() === cleanTrackId.toLowerCase());
  }

  // 3. Fallback match by Email + Job Identifier/Title
  if (!track && queryEmail) {
    track = trackedList.find(t => {
      const emailMatches = (t.email || '').toLowerCase() === queryEmail;
      if (!emailMatches) return false;
      if (!queryJob) return true;
      const idMatches = (t.jobId || '').toLowerCase() === queryJob;
      const titleMatches = (t.jobTitle || '').toLowerCase().includes(queryJob) ||
                           queryJob.includes((t.jobTitle || '').toLowerCase());
      return idMatches || titleMatches;
    });
  }

  if (!track) {
    return {
      found: false,
      message: 'Tracking record not found in database'
    };
  }

  const isApplied = status === 'applied';
  track.applied = isApplied;
  track.appliedAt = isApplied ? new Date().toISOString() : null;
  track.statusUpdatedAt = new Date().toISOString();
  track.active = !isApplied;

  // Persist status update directly to MongoDB Atlas
  await updateTrackedJobStatusInMongo(track.id || cleanTrackId, status, { email: track.email, jobId: track.jobId, jobTitle: track.jobTitle });

  return {
    found: true,
    track,
    status: isApplied ? 'applied' : 'pending'
  };
}

module.exports = {
  calculateDaysLeft,
  activeReminderTimers,
  getActiveReminderTimers,
  getTrackedJobs,
  saveTrackedJobs,
  trackJob,
  updateJobApplicationStatus,
  scheduleReminderTimer,
  sendImmediateReminder
};
