const fs = require('node:fs/promises');
const {
  DATA_DIR,
  TRACKED_JOBS_FILE,
  JOBS_FILE,
  isValidEmail,
  safeHttpUrl,
  generateStableTrackId
} = require('./constants');
const {
  isGoogleSheetEnabled,
  getTrackedJobsFromSheet,
  appendTrackedJobToSheet,
  updateTrackedJobStatusInSheet
} = require('../googleSheetService');

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
 * Loads all currently tracked jobs across candidates (Google Sheet or local)
 */
async function getTrackedJobs() {
  // 1. Load local file first so existing IDs (including legacy trk_sheet_*) are retained
  let localList = [];
  try {
    const raw = await fs.readFile(TRACKED_JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    localList = Array.isArray(parsed) ? parsed : [];
  } catch {
    localList = [];
  }

  let list = [];
  if (isGoogleSheetEnabled()) {
    try {
      const sheetTracked = await getTrackedJobsFromSheet();
      if (Array.isArray(sheetTracked) && sheetTracked.length > 0) {
        list = sheetTracked.map((t, idx) => {
          const email = (t.Email || t.email || '').trim().toLowerCase();
          const jobTitle = t.JobTitle || t.jobTitle || '';
          const jobId = t.JobID || t.jobId || '';

          // Look for an existing local record to keep the exact same ID sent in previous emails
          const existingLocal = localList.find(loc =>
            (loc.id && (loc.id === t.ID || loc.id === t.id)) ||
            (loc.email && loc.email.toLowerCase() === email && (loc.jobTitle === jobTitle || (jobId && loc.jobId === jobId))) ||
            (loc.id && loc.id.startsWith(`trk_sheet_${idx}_`))
          );

          const id = t.ID || t.id || (existingLocal && existingLocal.id) || generateStableTrackId(email, jobId || jobTitle);

          return {
            id,
            email,
            name: t.Name || t.name || (existingLocal && existingLocal.name) || 'Job Aspirant',
            jobId,
            jobTitle,
            organization: t.Organization || t.organization || (existingLocal && existingLocal.organization) || 'Government Department',
            lastDate: t.Deadline || t.lastDate || (existingLocal && existingLocal.lastDate) || null,
            lastDateFormatted: t.Deadline || t.lastDateFormatted || (existingLocal && existingLocal.lastDateFormatted) || 'Check Notice',
            link: t.Link || t.link || (existingLocal && existingLocal.link) || '',
            subscribedAt: t.SubscribedAt || t.subscribedAt || (existingLocal && existingLocal.subscribedAt) || new Date().toISOString(),
            lastReminderSentAt: t.LastReminderSent || t.lastReminderSentAt || (existingLocal && existingLocal.lastReminderSentAt) || null,
            reminderCount: t.ReminderCount ? Number(t.ReminderCount) : (existingLocal ? existingLocal.reminderCount || 0 : 0),
            applied: String(t.Applied).toLowerCase() === 'true' || (existingLocal && existingLocal.applied === true),
            active: String(t.Applied).toLowerCase() !== 'true' && !(existingLocal && existingLocal.applied === true)
          };
        });
      }
    } catch (err) {
      console.warn('[Google Sheets] getTrackedJobs fallback to local:', err.message);
    }
  }

  if (list.length === 0) {
    list = localList;
  } else {
    // Merge local entries into list if local has better date or existing ID
    for (const localItem of localList) {
      const existingInSheet = list.find(s =>
        (s.id && localItem.id && s.id === localItem.id) ||
        (s.email.toLowerCase() === localItem.email.toLowerCase() && (s.jobTitle === localItem.jobTitle || s.jobId === localItem.jobId))
      );
      if (existingInSheet) {
        // ALWAYS keep localItem's ID if present so already dispatched email URLs don't break
        if (localItem.id) existingInSheet.id = localItem.id;
        if ((!existingInSheet.lastDate || existingInSheet.lastDate === 'null') && localItem.lastDate) {
          existingInSheet.lastDate = localItem.lastDate;
          existingInSheet.lastDateFormatted = localItem.lastDateFormatted;
        }
        if (localItem.applied === true) {
          existingInSheet.applied = true;
          existingInSheet.active = false;
        }
      } else {
        list.push(localItem);
      }
    }
  }

  // Deduplicate entries by email + job (keeping the one with valid lastDate or latest)
  const dedupMap = new Map();
  for (const item of list) {
    const key = `${(item.email || '').trim().toLowerCase()}_${(item.jobId || item.jobTitle || '').trim().toLowerCase()}`;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, item);
    } else {
      const existing = dedupMap.get(key);
      const merged = {
        ...existing,
        id: existing.id || item.id,
        lastDate: ((!existing.lastDate || existing.lastDate === 'null') && item.lastDate) ? item.lastDate : existing.lastDate,
        lastDateFormatted: (existing.lastDateFormatted === 'Check Notice' && item.lastDateFormatted) ? item.lastDateFormatted : existing.lastDateFormatted,
        applied: existing.applied || item.applied,
        active: (existing.applied || item.applied) ? false : (existing.active && item.active)
      };
      dedupMap.set(key, merged);
    }
  }
  const cleanList = Array.from(dedupMap.values());

  // Ensure every item has a stable id
  let needsSave = false;
  for (let i = 0; i < cleanList.length; i++) {
    if (!cleanList[i].id) {
      cleanList[i].id = generateStableTrackId(cleanList[i].email, cleanList[i].jobId || cleanList[i].jobTitle);
      needsSave = true;
    }
  }
  if (needsSave || cleanList.length !== localList.length) {
    await saveTrackedJobs(cleanList);
  }

  return cleanList;
}

/**
 * Persists tracked jobs list to disk
 */
async function saveTrackedJobs(tracked) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TRACKED_JOBS_FILE, JSON.stringify(tracked, null, 2), 'utf-8');
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
    throw new Error('Tracked job record not found. Please verify your email or tracking ID.');
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
      await saveTrackedJobs(trackedList);
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
    throw new Error('Tracked job record not found.');
  }

  let daysLeft = calculateDaysLeft(track.lastDate);
  if (daysLeft === null || daysLeft <= 0) {
    daysLeft = 5; // realistic fallback
  }

  const { sendTrackedJobEmail } = require('./dispatcher');
  const sendRes = await sendTrackedJobEmail(track, daysLeft, false, true);
  track.lastReminderSentAt = new Date().toISOString();
  track.reminderCount = (track.reminderCount || 0) + 1;
  await saveTrackedJobs(trackedList);

  return {
    success: true,
    message: `Test reminder email successfully dispatched to ${track.email}! Check your inbox.`,
    track,
    daysLeft,
    messageId: sendRes.messageId
  };
}

/**
 * Tracks a specific job opening for a user and dispatches immediate confirmation email
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

  // Try to enrich from jobs.json if not passed in
  let resolvedJob = null;
  try {
    const rawJobs = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsedJobs = JSON.parse(rawJobs);
    const jobs = Array.isArray(parsedJobs) ? parsedJobs : (parsedJobs.data || []);
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
  const existingIdx = trackedList.findIndex(t =>
    t.email.toLowerCase() === cleanEmail && (t.jobId === jobId || t.jobTitle === finalTitle)
  );

  let trackRecord;
  let isNew = false;
  const now = new Date().toISOString();

  if (existingIdx !== -1) {
    trackRecord = {
      ...trackedList[existingIdx],
      name: name?.trim() || trackedList[existingIdx].name,
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
    trackedList[existingIdx] = trackRecord;
  } else {
    isNew = true;
    trackRecord = {
      id: 'trk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
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
    trackedList.push(trackRecord);
  }

  await saveTrackedJobs(trackedList);

  // Sync to Google Sheet if enabled
  if (isGoogleSheetEnabled()) {
    appendTrackedJobToSheet(trackRecord).catch(err => {
      console.warn('[Google Sheets] Failed to sync tracked job:', err.message);
    });
  }

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
 * Updates application status from candidate response ("applied" or "pending")
 * Supports multi-strategy matching: direct ID, stable hash, sheet index pattern, or fallback query context
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

  // 3. Match by stable deterministic hash
  if (!track && cleanTrackId) {
    track = trackedList.find(t => {
      const stableId = generateStableTrackId(t.email, t.jobId || t.jobTitle);
      return stableId.toLowerCase() === cleanTrackId.toLowerCase();
    });
  }

  // 4. Legacy index pattern match: "trk_sheet_<index>_<random>" (e.g. "trk_sheet_3_znaiq" -> index 3)
  if (!track && cleanTrackId) {
    const sheetMatch = cleanTrackId.match(/^trk_sheet_(\d+)(?:_[a-z0-9]+)?$/i);
    if (sheetMatch) {
      const idx = parseInt(sheetMatch[1], 10);
      if (!isNaN(idx) && idx >= 0 && idx < trackedList.length) {
        track = trackedList[idx];
      }
    }
  }

  // 5. Fallback match by Email + Job Identifier/Title
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

  // 6. Match by cleaned Job Title or ID in trackId
  if (!track && cleanTrackId) {
    track = trackedList.find(t =>
      (t.jobId && t.jobId.toLowerCase() === cleanTrackId.toLowerCase()) ||
      (t.jobTitle && t.jobTitle.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTrackId.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
  }

  if (!track) {
    return {
      found: false,
      message: 'Tracking record not found'
    };
  }

  const isApplied = status === 'applied';
  track.applied = isApplied;
  track.appliedAt = isApplied ? new Date().toISOString() : null;
  track.statusUpdatedAt = new Date().toISOString();

  // If candidate has applied, stop further reminders for this job
  if (isApplied) {
    track.active = false;
    console.log(`[Job Tracker] Candidate ${track.email} applied for ${track.jobTitle}. Reminders stopped.`);
  } else {
    track.active = true;
    console.log(`[Job Tracker] Candidate ${track.email} pending application for ${track.jobTitle}. Reminders continue.`);
  }

  await saveTrackedJobs(trackedList);

  // Sync status to Google Sheet
  if (isGoogleSheetEnabled()) {
    updateTrackedJobStatusInSheet(track.id || cleanTrackId, status, { email: track.email, jobTitle: track.jobTitle }).catch(err => {
      console.warn('[Google Sheets] Status sync error:', err.message);
    });
  }

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
