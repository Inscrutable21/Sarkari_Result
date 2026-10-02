const fs = require('node:fs/promises');
const {
  DATA_DIR,
  SUBSCRIBERS_FILE,
  JOBS_FILE,
  isValidEmail
} = require('./constants');
const {
  isGoogleSheetEnabled,
  appendSubscriberToSheet,
  getSubscribersFromSheet
} = require('../googleSheetService');
const {
  isMongoEnabled,
  getSubscribersFromMongo,
  upsertSubscriberInMongo,
  unsubscribeUserInMongo
} = require('../mongoService');
const {
  getSentJobHistory,
  recordSentJobsForSubscriber
} = require('./sentHistoryStore');

/**
 * Loads current list of subscribers (from MongoDB Atlas if enabled, or Google Sheets / local JSON)
 */
async function getSubscribers() {
  const sentHistory = await getSentJobHistory();

  // 1. Try MongoDB Atlas (Primary cloud store)
  if (isMongoEnabled()) {
    try {
      const mongoSubs = await getSubscribersFromMongo();
      if (Array.isArray(mongoSubs) && mongoSubs.length > 0) {
        return mongoSubs.map(s => {
          const email = (s.email || '').trim().toLowerCase();
          const historyIds = sentHistory[email]?.jobIds || [];
          return {
            ...s,
            email,
            notifiedJobIds: Array.from(new Set([...(s.notifiedJobIds || []), ...historyIds]))
          };
        });
      }
    } catch (err) {
      console.warn('[MongoDB] getSubscribers fallback:', err.message);
    }
  }

  // 2. Fallback to local subscribers.json
  let localSubs = [];
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    localSubs = Array.isArray(parsed) ? parsed : (parsed.subscribers || []);
  } catch {
    localSubs = [];
  }

  const localMap = new Map();
  for (const s of localSubs) {
    const em = (s.email || '').trim().toLowerCase();
    if (em) localMap.set(em, s);
  }

  // 3. Fallback to Google Sheets if configured
  if (isGoogleSheetEnabled()) {
    try {
      const sheetSubs = await getSubscribersFromSheet();
      if (Array.isArray(sheetSubs) && sheetSubs.length > 0) {
        return sheetSubs.map(s => {
          const email = (s.Email || s.email || '').trim().toLowerCase();
          const localMatch = localMap.get(email);
          const historyIds = sentHistory[email]?.jobIds || [];
          const localNotified = localMatch?.notifiedJobIds || [];
          const combinedNotified = Array.from(new Set([...localNotified, ...historyIds]));

          return {
            id: s.ID || s.id || localMatch?.id || ('sub_' + Math.random().toString(36).slice(2, 7)),
            email,
            name: s.Name || s.name || localMatch?.name || 'Job Aspirant',
            qualification: s.Qualification || s.qualification || localMatch?.qualification || 'all',
            disciplines: typeof s.Disciplines === 'string'
              ? s.Disciplines.split(',').map(d => d.trim())
              : (Array.isArray(s.Disciplines) ? s.Disciplines : (localMatch?.disciplines || ['all'])),
            state: s.State || s.state || localMatch?.state || 'all',
            sector: s.Sector || s.sector || localMatch?.sector || 'all',
            subscribedAt: s.SubscribedAt || s.subscribedAt || localMatch?.subscribedAt || new Date().toISOString(),
            notifiedJobIds: combinedNotified,
            active: s.Active !== false && String(s.Active).toLowerCase() !== 'false'
          };
        });
      }
    } catch (err) {
      console.warn('[Google Sheets] getSubscribers fallback to local:', err.message);
    }
  }

  return localSubs.map(s => {
    const email = (s.email || '').trim().toLowerCase();
    const historyIds = sentHistory[email]?.jobIds || [];
    return {
      ...s,
      notifiedJobIds: Array.from(new Set([...(s.notifiedJobIds || []), ...historyIds]))
    };
  });
}

/**
 * Persists subscribers to local file, MongoDB Atlas, and Google Sheets
 */
async function saveSubscribers(subscribers) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2), 'utf-8');
  } catch (fsErr) {
    // On serverless environments filesystem may be read-only; log and continue
    console.warn('[Storage] Local write notice:', fsErr.message);
  }

  // Sync to MongoDB Atlas
  if (isMongoEnabled() && subscribers.length > 0) {
    const latest = subscribers[subscribers.length - 1];
    if (latest) {
      upsertSubscriberInMongo(latest).catch(err => {
        console.warn('[MongoDB] Subscriber sync error:', err.message);
      });
    }
  }

  // Sync to Google Sheet if configured
  if (isGoogleSheetEnabled() && subscribers.length > 0) {
    const latest = subscribers[subscribers.length - 1];
    if (latest) {
      appendSubscriberToSheet(latest).catch(err => {
        console.warn('[Google Sheets] Async subscriber append error:', err.message);
      });
    }
  }
}

/**
 * Filter jobs according to a subscriber's degree & qualification profile
 */
function matchJobsForSubscriber(subscriber, allJobs) {
  if (!Array.isArray(allJobs)) return [];

  const todayIso = new Date().toISOString().split('T')[0];

  return allJobs.filter(job => {
    // 1. Must be active & unexpired
    if (job.isActive === false || job.isExpired === true) return false;
    if (job.lastDate && job.lastDate < todayIso) return false;

    // 2. Discipline / Degree match
    const subDisciplines = subscriber.disciplines || ['all'];
    const hasDisciplineWildcard = subDisciplines.includes('all');

    if (!hasDisciplineWildcard) {
      const eligible = job.eligibleDisciplines || [];
      const hasMatch = subDisciplines.some(d => eligible.includes(d));
      if (!hasMatch) return false;
    }

    // 3. Qualification level match
    const subQual = subscriber.qualification;
    if (subQual && subQual !== 'all') {
      const jobQual = (job.qualification || '').toLowerCase();
      const target = subQual.toLowerCase();

      // Check direct inclusion or broad eligibility
      const isQualMatch = jobQual.includes(target) ||
        target.includes(jobQual) ||
        jobQual.includes('check notice') ||
        (target.includes('graduate') && jobQual.includes('graduate')) ||
        (target.includes('10th') && jobQual.includes('10th')) ||
        (target.includes('12th') && (jobQual.includes('12th') || jobQual.includes('10th'))) ||
        (target.includes('diploma') && (jobQual.includes('engineering') || jobQual.includes('diploma')));

      if (!isQualMatch) return false;
    }

    // 4. State match (if selected)
    const subState = subscriber.state;
    if (subState && subState !== 'all') {
      const jobState = (job.state || '').toLowerCase();
      const targetState = subState.toLowerCase();
      const isStateMatch = jobState.includes(targetState) || jobState.includes('central') || jobState.includes('all india');
      if (!isStateMatch) return false;
    }

    // 5. Sector match (if selected)
    const subSector = subscriber.sector;
    if (subSector && subSector !== 'all') {
      const jobSector = (job.sector || '').toLowerCase();
      const targetSector = subSector.toLowerCase();
      if (!jobSector.includes(targetSector)) return false;
    }

    return true;
  });
}

/**
 * Subscribes a user with their degree, qualification, and alert preferences
 */
async function subscribeUser({ email, name, qualification, disciplines, state, sector, frequency = 'instant' }) {
  if (!isValidEmail(email)) {
    throw new Error('Please provide a valid email address');
  }

  const subscribers = await getSubscribers();
  const cleanEmail = email.trim().toLowerCase();

  const disciplineList = Array.isArray(disciplines)
    ? disciplines
    : (disciplines ? [disciplines] : ['all']);

  const index = subscribers.findIndex(s => s.email.toLowerCase() === cleanEmail);
  const now = new Date().toISOString();

  let subscriber;
  let isNew = false;

  if (index !== -1) {
    // Update existing subscription preferences
    subscriber = {
      ...subscribers[index],
      name: name?.trim() || subscribers[index].name || 'Job Aspirant',
      qualification: qualification || subscribers[index].qualification || 'all',
      disciplines: disciplineList.length > 0 ? disciplineList : ['all'],
      state: state || subscribers[index].state || 'all',
      sector: sector || subscribers[index].sector || 'all',
      frequency: frequency || subscribers[index].frequency || 'instant',
      updatedAt: now,
      active: true
    };
    subscribers[index] = subscriber;
  } else {
    isNew = true;
    subscriber = {
      id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      email: cleanEmail,
      name: name?.trim() || 'Job Aspirant',
      qualification: qualification || 'all',
      disciplines: disciplineList.length > 0 ? disciplineList : ['all'],
      state: state || 'all',
      sector: sector || 'all',
      frequency: frequency || 'instant',
      subscribedAt: now,
      lastNotifiedAt: null,
      notifiedJobIds: [],
      active: true
    };
    subscribers.push(subscriber);
  }

  await saveSubscribers(subscribers);

  // Lazy import dispatcher to avoid circular dependency
  const { sendJobAlertEmail } = require('./dispatcher');

  // Always dispatch immediate subscription confirmation email
  let emailDispatched = false;
  let matchedCount = 0;
  try {
    const rawJobs = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsedJobs = JSON.parse(rawJobs);
    const jobs = Array.isArray(parsedJobs) ? parsedJobs : (parsedJobs.data || []);
    const matchingJobs = matchJobsForSubscriber(subscriber, jobs);
    matchedCount = matchingJobs.length;
    // Send matching jobs or top active vacancies so candidate immediately gets active opportunities
    const jobsToSend = matchingJobs.length > 0 ? matchingJobs.slice(0, 10) : jobs.slice(0, 5);
    const dispatch = await sendJobAlertEmail(subscriber, jobsToSend, false, true);
    emailDispatched = dispatch.success === true;
    if (emailDispatched) {
      await recordSentJobsForSubscriber(cleanEmail, jobsToSend);
    }
    console.log(`[Job Alerts] Confirmation alert email sent to ${subscriber.email} (${jobsToSend.length} jobs)`);
  } catch (emailErr) {
    console.warn(`[Job Alerts] Could not send confirmation alert email: ${emailErr.message}`);
  }

  return {
    isNew,
    subscriber,
    emailDispatched,
    matchedCount
  };
}

/**
 * Unsubscribes a user by email
 */
async function unsubscribeUser(email) {
  if (!email) throw new Error('Email is required to unsubscribe');
  const cleanEmail = email.trim().toLowerCase();

  if (isMongoEnabled()) {
    await unsubscribeUserInMongo(cleanEmail).catch(err => {
      console.warn('[MongoDB] unsubscribe error:', err.message);
    });
  }

  const subscribers = await getSubscribers();
  const index = subscribers.findIndex(s => s.email.toLowerCase() === cleanEmail);
  if (index === -1) {
    return { found: false, message: 'Email address not found in alert list' };
  }
  subscribers[index].active = false;
  subscribers[index].unsubscribedAt = new Date().toISOString();
  await saveSubscribers(subscribers);
  return { found: true, message: 'Successfully unsubscribed from job alerts' };
}

module.exports = {
  getSubscribers,
  saveSubscribers,
  matchJobsForSubscriber,
  subscribeUser,
  unsubscribeUser
};
