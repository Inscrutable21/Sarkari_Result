const { isValidEmail } = require('./constants');
const {
  getSubscribersFromMongo,
  upsertSubscriberInMongo,
  unsubscribeUserInMongo,
  getPortalDatasetFromMongo
} = require('../mongoService');
const {
  getSentJobHistory,
  recordSentJobsForSubscriber
} = require('./sentHistoryStore');

/**
 * Loads current list of subscribers exclusively from MongoDB Atlas
 */
async function getSubscribers() {
  const sentHistory = await getSentJobHistory();
  const mongoSubs = await getSubscribersFromMongo();
  const list = Array.isArray(mongoSubs) ? mongoSubs : [];

  return list.map(s => {
    const email = (s.email || '').trim().toLowerCase();
    const historyIds = sentHistory[email]?.jobIds || [];
    return {
      ...s,
      email,
      notifiedJobIds: Array.from(new Set([...(s.notifiedJobIds || []), ...historyIds]))
    };
  });
}

/**
 * Persists subscribers exclusively to MongoDB Atlas
 */
async function saveSubscribers(subscribers) {
  if (!Array.isArray(subscribers) || subscribers.length === 0) return;
  for (const sub of subscribers) {
    if (sub.email) {
      await upsertSubscriberInMongo(sub);
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
 * Subscribes a user with their degree, qualification, and alert preferences (Exclusively MongoDB Atlas)
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
  }

  // Persist directly into MongoDB Atlas
  await upsertSubscriberInMongo(subscriber);

  // Lazy import dispatcher to avoid circular dependency
  const { sendJobAlertEmail } = require('./dispatcher');

  // Dispatch immediate subscription confirmation email with jobs from database
  let emailDispatched = false;
  let matchedCount = 0;
  try {
    const jobs = (await getPortalDatasetFromMongo('jobs')) || [];
    const matchingJobs = matchJobsForSubscriber(subscriber, jobs);
    matchedCount = matchingJobs.length;
    // Send matching jobs or top active vacancies so candidate immediately gets active opportunities
    const jobsToSend = matchingJobs.length > 0 ? matchingJobs.slice(0, 10) : jobs.slice(0, 5);
    const dispatch = await sendJobAlertEmail(subscriber, jobsToSend, false, true);
    emailDispatched = dispatch.success === true;
    if (emailDispatched) {
      await recordSentJobsForSubscriber(cleanEmail, jobsToSend);
    }
    console.log(`[Job Alerts] Confirmation alert email sent to ${subscriber.email} (${jobsToSend.length} jobs from database)`);
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
 * Unsubscribes a user by email (Exclusively MongoDB Atlas)
 */
async function unsubscribeUser(email) {
  if (!email) throw new Error('Email is required to unsubscribe');
  const cleanEmail = email.trim().toLowerCase();

  await unsubscribeUserInMongo(cleanEmail);
  return { found: true, message: 'Successfully unsubscribed from job alerts in database' };
}

module.exports = {
  getSubscribers,
  saveSubscribers,
  matchJobsForSubscriber,
  subscribeUser,
  unsubscribeUser
};
