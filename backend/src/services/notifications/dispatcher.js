const nodemailer = require('nodemailer');
const { getPortalDatasetFromMongo } = require('../mongoService');
const { getTransporter, logEmailDispatch } = require('./emailTransporter');
const { buildJobAlertEmailHtml, buildJobReminderEmailHtml } = require('./emailTemplates');
const {
  getSentJobHistory,
  hasJobBeenSentToSubscriber,
  recordSentJobsForSubscriber
} = require('./sentHistoryStore');
const {
  getSubscribers,
  matchJobsForSubscriber
} = require('./subscriberStore');
const {
  getTrackedJobs,
  saveTrackedJobs,
  calculateDaysLeft
} = require('./jobTrackerStore');
const {
  isDateTodayIST,
  getTodayISTString
} = require('./constants');

/**
 * Sends a job alert email to a subscriber
 */
async function sendJobAlertEmail(subscriber, jobs, isTest = false, isConfirmation = false) {
  if (!jobs || jobs.length === 0) {
    return { skipped: true, reason: 'No matching jobs to send' };
  }

  const transporter = await getTransporter();
  const html = buildJobAlertEmailHtml({ subscriber, jobs, isTest, isConfirmation });
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const defaultFrom = emailUser
    ? `"sarkari hith Job Alerts" <${emailUser}>`
    : '"sarkari hith Job Alerts" <alerts@sarkariresult.com>';
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || defaultFrom;

  let subject = '';
  if (isTest) {
    subject = `[Test Alert] ${jobs.length} Sarkari Jobs matching your Degree & Qualification`;
  } else if (isConfirmation) {
    subject = `[Subscription Confirmed] You are Subscribed to Sarkari Job Alerts (${subscriber.qualification || 'All'})`;
  } else {
    subject = `[Sarkari Alert] ${jobs.length} New Government Jobs Matching Your Degree (${subscriber.qualification || 'All'})`;
  }

  const mailOptions = {
    from: fromEmail,
    to: subscriber.email,
    subject,
    html,
    text: `sarkari hith Job Alert\n\nFound ${jobs.length} jobs matching your profile:\n\n` +
      jobs.map(j => `- ${j.title} (Last Date: ${j.lastDateFormatted || 'Check Notice'})\n  Link: ${j.link}\n`).join('\n')
  };

  const info = await transporter.sendMail(mailOptions);
  if (!Array.isArray(info.accepted) || !info.accepted.some(address =>
    String(address).toLowerCase() === String(mailOptions.to).toLowerCase())) {
    throw new Error('SMTP server did not accept the recipient; email remains pending');
  }
  let previewUrl = null;

  if (transporter._isEthereal && nodemailer.getTestMessageUrl) {
    previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[Email Preview URL]: ${previewUrl}`);
  }

  // Update subscriber history and persistent sent-job history if real dispatch (not test)
  if (!isTest) {
    await recordSentJobsForSubscriber(subscriber.email, jobs);
  }

  // Log dispatch
  await logEmailDispatch({
    recipient: subscriber.email,
    recipientName: subscriber.name,
    jobCount: jobs.length,
    jobTitles: jobs.map(j => j.title),
    isTest,
    previewUrl,
    messageId: info.messageId || 'local-test-id'
  });

  return {
    success: true,
    recipient: subscriber.email,
    jobCount: jobs.length,
    messageId: info.messageId,
    previewUrl
  };
}

/**
 * Dispatches test notification immediately with active matching jobs
 */
async function sendTestNotification({ email, name, qualification, disciplines, state, sector }) {
  if (!email || !email.includes('@')) {
    throw new Error('Valid email address is required');
  }

  // Load all jobs from MongoDB Atlas
  let allJobs = [];
  try {
    const jobsFromDb = await getPortalDatasetFromMongo('jobs');
    allJobs = Array.isArray(jobsFromDb) ? jobsFromDb : [];
    if (allJobs.length === 0) {
      throw new Error('No jobs available in MongoDB Atlas database.');
    }
  } catch (err) {
    throw new Error('Jobs dataset not accessible from database: ' + err.message);
  }

  const dummySubscriber = {
    id: 'test_sub',
    email: email.trim().toLowerCase(),
    name: name?.trim() || 'Job Aspirant',
    qualification: qualification || 'all',
    disciplines: Array.isArray(disciplines) ? disciplines : (disciplines ? [disciplines] : ['all']),
    state: state || 'all',
    sector: sector || 'all'
  };

  let matching = matchJobsForSubscriber(dummySubscriber, allJobs);

  // If strict match gave 0, fallback to top 3 active jobs so user can experience the alert
  if (matching.length === 0) {
    matching = allJobs.filter(j => j.isActive !== false && !j.isExpired).slice(0, 3);
  } else {
    matching = matching.slice(0, 10);
  }

  const result = await sendJobAlertEmail(dummySubscriber, matching, true);
  return {
    ...result,
    matchedCount: matching.length,
    jobs: matching.map(j => ({ id: j.id, title: j.title, lastDate: j.lastDateFormatted, organization: j.organization }))
  };
}

/**
 * Scans all active subscribers and dispatches new matching jobs
 */
async function dispatchAllNotifications() {
  console.log('[Job Alerts] Checking job notifications for subscribers...');
  const subscribers = await getSubscribers();
  const activeSubscribers = subscribers.filter(s => s.active !== false);

  if (activeSubscribers.length === 0) {
    console.log('No active subscribers found.');
    return { dispatched: 0, skipped: 0, totalSubscribers: 0 };
  }

  let allJobs = [];
  try {
    const jobsFromDb = await getPortalDatasetFromMongo('jobs');
    allJobs = Array.isArray(jobsFromDb) ? jobsFromDb : [];
  } catch (err) {
    console.error('Cannot dispatch notifications: failed to load jobs from database:', err.message);
    return { error: err.message };
  }

  const sentHistory = await getSentJobHistory();
  let dispatched = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];

  for (const subscriber of activeSubscribers) {
    const matchingJobs = matchJobsForSubscriber(subscriber, allJobs);

    // Filter out jobs that this subscriber was already notified for (by ID, Link, or Title)
    const newJobs = matchingJobs.filter(job => !hasJobBeenSentToSubscriber(subscriber.email, job, sentHistory, subscriber.notifiedJobIds));

    if (newJobs.length === 0) {
      console.log(`[Job Alerts] Subscriber ${subscriber.email}: All ${matchingJobs.length} matching jobs were already sent in past dispatches. Skipping duplicate mail.`);
      skipped++;
      continue;
    }

    try {
      console.log(`[Job Alerts] Subscriber ${subscriber.email}: Found ${newJobs.length} NEW jobs to send (${matchingJobs.length - newJobs.length} older jobs filtered out).`);
      const sendResult = await sendJobAlertEmail(subscriber, newJobs.slice(0, 10), false);
      results.push(sendResult);
      dispatched++;
      console.log(`[Job Alert Sent] Sent notification with ${Math.min(newJobs.length, 10)} new jobs to ${subscriber.email}`);
    } catch (err) {
      failed++;
      console.error(`[Job Alert Failed] Failed to send alert to ${subscriber.email}:`, err.message);
    }
  }

  console.log(`[Job Alerts Finished] Dispatched ${dispatched}, Skipped ${skipped} (no new matches).`);
  return {
    dispatched,
    failed,
    skipped,
    totalSubscribers: activeSubscribers.length,
    results
  };
}

/**
 * Sends a single job reminder or confirmation email to a candidate
 */
async function sendTrackedJobEmail(track, daysLeft, isConfirmation = false, isTestReminder = false) {
  const transporter = await getTransporter();
  const html = buildJobReminderEmailHtml({ track, daysLeft, isConfirmation, isTestReminder });
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const defaultFrom = emailUser
    ? `"sarkari hith Job Alerts" <${emailUser}>`
    : '"sarkari hith Job Alerts" <alerts@sarkariresult.com>';
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || defaultFrom;

  let subject = '';
  if (isTestReminder) {
    subject = `[TEST 1-Min REMINDER] ${daysLeft !== null && daysLeft > 0 ? daysLeft + ' Days Left' : 'Deadline Alert'}: ${track.jobTitle}`;
  } else if (isConfirmation) {
    subject = `[Subscribed] You are Subscribed to Application Reminders: ${track.jobTitle} (${daysLeft !== null ? daysLeft + ' Days Left' : 'Active'})`;
  } else if (daysLeft === 0) {
    subject = `[LAST DAY TODAY] Final Notice: Apply Today for ${track.jobTitle}`;
  } else if (daysLeft === 1) {
    subject = `[1 Day Left] Deadline Tomorrow: Please Fill ${track.jobTitle}`;
  } else if (daysLeft !== null && daysLeft > 1) {
    subject = `[Deadline Reminder] ${daysLeft} Days Left: Please Fill ${track.jobTitle}`;
  } else {
    subject = `[Deadline Reminder] Please Fill ${track.jobTitle}`;
  }

  const mailOptions = {
    from: fromEmail,
    to: track.email,
    subject,
    html,
    text: `${subject}\n\nOrganization: ${track.organization}\nDeadline: ${track.lastDateFormatted}\nDays Left: ${daysLeft}\n\nApply Link: ${track.link}\nMark Applied: ${process.env.PORTAL_URL || 'http://localhost:3000'}/api/track-job/status?trackId=${encodeURIComponent(track.id || '')}&status=applied&email=${encodeURIComponent(track.email || '')}\nPending: ${process.env.PORTAL_URL || 'http://localhost:3000'}/api/track-job/status?trackId=${encodeURIComponent(track.id || '')}&status=pending&email=${encodeURIComponent(track.email || '')}`
  };

  const info = await transporter.sendMail(mailOptions);
  if (!Array.isArray(info.accepted) || !info.accepted.some(address =>
    String(address).toLowerCase() === String(mailOptions.to).toLowerCase())) {
    throw new Error('SMTP server did not accept the recipient; email remains pending');
  }

  await logEmailDispatch({
    recipient: track.email,
    recipientName: track.name,
    jobCount: 1,
    jobTitles: [track.jobTitle],
    isTest: isTestReminder,
    isReminder: true,
    daysLeft,
    messageId: info.messageId || 'reminder-id'
  });

  return {
    success: true,
    recipient: track.email,
    messageId: info.messageId,
    daysLeft
  };
}

/**
 * Batch processor: dispatches daily deadline countdown reminders to all active tracked jobs
 */
async function sendDailyJobReminders(force = false) {
  console.log('[Job Reminders] Checking daily deadline reminders for candidates...');
  const trackedList = await getTrackedJobs();
  const now = new Date();

  let dispatched = 0;
  let failed = 0;
  let skippedApplied = 0;
  let skippedExpired = 0;
  let skippedAlreadySentToday = 0;
  const results = [];

  for (const track of trackedList) {
    // 1. If candidate marked applied, NEVER send reminders
    if (track.applied === true || track.active === false) {
      skippedApplied++;
      continue;
    }

    // 2. Calculate days remaining
    let daysLeft = calculateDaysLeft(track.lastDate);

    // If deadline has completely passed (more than 1 day ago) and not forced
    if (daysLeft !== null && daysLeft < 0 && !force) {
      skippedExpired++;
      track.active = false;
      continue;
    }

    if (daysLeft === null || daysLeft < 0) {
      daysLeft = null; // Unknown deadlines must not invent a countdown.
    }

    // 3. Prevent duplicate emails on the exact same calendar day unless forced
    if (!force && track.lastReminderSentAt && isDateTodayIST(track.lastReminderSentAt)) {
      skippedAlreadySentToday++;
      continue;
    }

    try {
      const mailRes = await sendTrackedJobEmail(track, daysLeft, false, force);
      track.lastReminderSentAt = now.toISOString();
      track.reminderCount = (track.reminderCount || 0) + 1;
      dispatched++;
      results.push(mailRes);
      console.log(`[Job Reminder Sent] Sent ${daysLeft} days-left reminder to ${track.email} for ${track.jobTitle}`);
    } catch (err) {
      failed++;
      console.error(`[Job Reminder Error] Failed sending reminder to ${track.email}: ${err.message}`);
    }
  }

  await saveTrackedJobs(trackedList);

  console.log(`[Job Reminders Complete] Dispatched ${dispatched}, Skipped Applied: ${skippedApplied}, Skipped Expired: ${skippedExpired}, Sent Today: ${skippedAlreadySentToday}`);
  return {
    dispatched,
    failed,
    skippedApplied,
    skippedExpired,
    skippedAlreadySentToday,
    totalTracked: trackedList.length,
    results
  };
}

module.exports = {
  sendJobAlertEmail,
  sendTestNotification,
  dispatchAllNotifications,
  sendTrackedJobEmail,
  sendDailyJobReminders
};
