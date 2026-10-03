/**
 * Sarkari Hith - Subscriber & Reminder Dispatch Status Service
 * Aggregates subscriber profiles, tracked application deadlines, and email dispatch logs
 * to provide real-time visibility into who received the 6:00 PM reminders and who is pending.
 */

const { getSubscribers, saveSubscribers } = require('./subscriberStore');
const { getTrackedJobs, saveTrackedJobs, calculateDaysLeft } = require('./jobTrackerStore');
const { getEmailLogs } = require('./emailTransporter');
const { getSentJobHistory, hasJobBeenSentToSubscriber } = require('./sentHistoryStore');
const { matchJobsForSubscriber } = require('./subscriberStore');
const { getPortalDatasetFromMongo, getDb } = require('../mongoService');
const { sendTrackedJobEmail, sendJobAlertEmail } = require('./dispatcher');
const { getTodayISTString, isDateTodayIST } = require('./constants');

/**
 * Compiles a unified diagnostic list of all subscribers and tracked job candidates
 * with their 6:00 PM reminder dispatch status.
 */
async function getSubscribersDispatchStatus() {
  const [subscribers, trackedJobs, emailLogs] = await Promise.all([
    getSubscribers().catch(() => []),
    getTrackedJobs().catch(() => []),
    getEmailLogs().catch(() => [])
  ]);

  let portalJobs = [];
  try {
    const jobsFromDb = await getPortalDatasetFromMongo('jobs');
    portalJobs = Array.isArray(jobsFromDb) ? jobsFromDb : [];
  } catch {
    portalJobs = [];
  }

  const sentHistory = await getSentJobHistory().catch(() => ({}));
  const todayStr = getTodayISTString();

  // Index logs by recipient email for quick lookup
  const logsByEmail = new Map();
  for (const log of emailLogs) {
    const email = (log.recipient || '').toLowerCase().trim();
    if (!email) continue;
    if (!logsByEmail.has(email)) {
      logsByEmail.set(email, []);
    }
    logsByEmail.get(email).push(log);
  }

  const items = [];
  let sentTodayCount = 0;
  let pendingCount = 0;
  let appliedCount = 0;
  let expiredCount = 0;

  // 1. Process Tracked Job Reminders (Specific Job Application Deadlines)
  for (const track of trackedJobs) {
    const email = (track.email || '').toLowerCase().trim();
    const daysLeft = calculateDaysLeft(track.lastDate);
    const sentToday = Boolean(track.lastReminderSentAt && isDateTodayIST(track.lastReminderSentAt));
    const recipientLogs = logsByEmail.get(email) || [];
    const latestLog = recipientLogs[0] || null;

    let status = 'pending';
    let statusLabel = '⏳ Pending (6:00 PM Batch)';
    let statusBadge = 'status-pending';
    let reason = 'Candidate is active. Daily countdown reminder scheduled for 6:00 PM IST.';

    if (track.applied === true) {
      status = 'applied';
      statusLabel = '✓ Marked Applied';
      statusBadge = 'status-applied';
      reason = 'Candidate marked this job as Applied. Reminders are safely suppressed.';
      appliedCount++;
    } else if (daysLeft !== null && daysLeft < 0) {
      status = 'expired';
      statusLabel = '⛔ Deadline Passed';
      statusBadge = 'status-expired';
      reason = `Application deadline passed on ${track.lastDateFormatted || track.lastDate}.`;
      expiredCount++;
    } else if (sentToday) {
      status = 'sent_today';
      const timeStr = track.lastReminderSentAt ? new Date(track.lastReminderSentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
      statusLabel = `✓ Sent Today (${timeStr})`;
      statusBadge = 'status-sent';
      reason = `Deadline reminder (${daysLeft !== null ? daysLeft + ' days left' : 'active'}) was successfully dispatched today.`;
      sentTodayCount++;
    } else {
      pendingCount++;
    }

    items.push({
      id: track.id || `trk_${Math.random().toString(36).substring(2, 7)}`,
      type: 'tracked_job',
      typeLabel: 'Job Deadline Countdown',
      name: track.name || 'Candidate',
      email: track.email,
      jobTitle: track.jobTitle || 'Government Recruitment Form',
      organization: track.organization || 'Govt Department',
      lastDate: track.lastDateFormatted || track.lastDate || 'Active',
      daysLeft: daysLeft !== null ? daysLeft : null,
      applied: Boolean(track.applied),
      status,
      statusLabel,
      statusBadge,
      statusReason: reason,
      lastSentAt: track.lastReminderSentAt || (latestLog ? latestLog.timestamp : null),
      reminderCount: track.reminderCount || 0,
      link: track.link || '#',
      canSendNow: status !== 'applied' && status !== 'expired'
    });
  }

  // 2. Process General Subscribers (Custom Sector / Degree Job Alerts)
  for (const sub of subscribers) {
    const email = (sub.email || '').toLowerCase().trim();
    const recipientLogs = logsByEmail.get(email) || [];
    const latestLog = recipientLogs[0] || null;

    // Check if an email was sent to this subscriber today
    const sentToday = Boolean(
      (sub.lastNotifiedAt && isDateTodayIST(sub.lastNotifiedAt)) ||
      (latestLog && latestLog.timestamp && isDateTodayIST(latestLog.timestamp))
    );

    const matching = matchJobsForSubscriber(sub, portalJobs);
    const newJobs = matching.filter(job => !hasJobBeenSentToSubscriber(sub.email, job, sentHistory, sub.notifiedJobIds));

    let status = 'pending';
    let statusLabel = '⏳ Pending (6:00 PM Batch)';
    let statusBadge = 'status-pending';
    let reason = `${newJobs.length} new matching vacancies ready for daily digest dispatch.`;

    if (sub.active === false) {
      status = 'inactive';
      statusLabel = '🚫 Unsubscribed';
      statusBadge = 'status-expired';
      reason = 'Subscriber has unsubscribed or deactivated email alerts.';
    } else if (sentToday) {
      status = 'sent_today';
      const timeStr = sub.lastNotifiedAt
        ? new Date(sub.lastNotifiedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : (latestLog?.timestamp ? new Date(latestLog.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
      statusLabel = `✓ Sent Today (${timeStr})`;
      statusBadge = 'status-sent';
      reason = `Daily alert email successfully dispatched today with ${latestLog?.jobCount || matching.length} vacancies.`;
      sentTodayCount++;
    } else if (newJobs.length === 0) {
      status = 'up_to_date';
      statusLabel = '✓ All Caught Up';
      statusBadge = 'status-uptodate';
      reason = `All ${matching.length} matching active jobs have already been delivered in past emails. No duplicate jobs pending.`;
    } else {
      pendingCount++;
    }

    items.push({
      id: sub.id || `sub_${Math.random().toString(36).substring(2, 7)}`,
      type: 'general_subscriber',
      typeLabel: 'Daily Sector & Degree Alerts',
      name: sub.name || 'Candidate',
      email: sub.email,
      jobTitle: `${sub.sector === 'all' ? 'All Sectors' : sub.sector} • ${sub.qualification || 'All Qualifications'}`,
      organization: sub.state === 'all' ? 'All India' : sub.state,
      lastDate: `${matching.length} Matching Jobs (${newJobs.length} New)`,
      daysLeft: null,
      applied: false,
      status,
      statusLabel,
      statusBadge,
      statusReason: reason,
      lastSentAt: sub.lastNotifiedAt || (latestLog ? latestLog.timestamp : null),
      reminderCount: (sub.notifiedJobIds || []).length,
      link: '#',
      canSendNow: sub.active !== false
    });
  }

  return {
    summary: {
      totalSubscribers: subscribers.length,
      totalTracked: trackedJobs.length,
      totalRecipients: items.length,
      sentTodayCount,
      pendingCount,
      appliedCount,
      expiredCount,
      todayDate: todayStr,
      scheduledHour: 18,
      scheduledMinute: 0,
      currentTime: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
    },
    items
  };
}

/**
 * Manually dispatches a reminder or alert to a specific recipient on demand
 */
async function sendIndividualReminder(targetId, targetEmail) {
  const [subscribers, trackedJobs] = await Promise.all([
    getSubscribers().catch(() => []),
    getTrackedJobs().catch(() => [])
  ]);

  const normalizedEmail = (targetEmail || '').toLowerCase().trim();

  // Check if it's a tracked job
  const track = trackedJobs.find(t => (targetId && t.id === targetId) || ((t.email || '').toLowerCase().trim() === normalizedEmail));
  if (track) {
    if (track.applied === true) {
      throw new Error(`Candidate ${track.email} has marked this job as Applied. Reminders are suppressed.`);
    }

    let daysLeft = calculateDaysLeft(track.lastDate);
    if (daysLeft === null || daysLeft < 0) daysLeft = 3;

    const result = await sendTrackedJobEmail(track, daysLeft, false, true);
    track.lastReminderSentAt = new Date().toISOString();
    track.reminderCount = (track.reminderCount || 0) + 1;
    await saveTrackedJobs(trackedJobs);

    return {
      success: true,
      message: `Reminder email successfully dispatched to ${track.email} for "${track.jobTitle}" (${daysLeft} days left notice)`,
      recipient: track.email,
      type: 'tracked_job',
      messageId: result?.messageId || 'sent'
    };
  }

  // Check if it's a general subscriber
  const sub = subscribers.find(s => (targetId && s.id === targetId) || ((s.email || '').toLowerCase().trim() === normalizedEmail));
  if (sub) {
    let portalJobs = [];
    try {
      const jobsFromDb = await getPortalDatasetFromMongo('jobs');
      portalJobs = Array.isArray(jobsFromDb) ? jobsFromDb : [];
    } catch {
      portalJobs = [];
    }

    const matching = matchJobsForSubscriber(sub, portalJobs);
    const jobsToSend = matching.slice(0, 10);
    if (jobsToSend.length === 0) {
      throw new Error(`No active jobs found matching ${sub.email}'s preferences (${sub.sector}, ${sub.qualification}).`);
    }

    const result = await sendJobAlertEmail(sub, jobsToSend, false);
    sub.lastNotifiedAt = new Date().toISOString();
    await saveSubscribers(subscribers);

    return {
      success: true,
      message: `Job alert email successfully dispatched to ${sub.email} (${jobsToSend.length} matching vacancies)`,
      recipient: sub.email,
      type: 'general_subscriber',
      messageId: result?.messageId || 'sent'
    };
  }

  throw new Error(`Recipient with email ${targetEmail} not found in subscriber or tracked candidate database.`);
}

/**
 * Deletes an individual subscriber or tracked job record from MongoDB Atlas
 */
async function deleteSubscriberOrTrackedJob(targetId, targetEmail) {
  const db = await getDb();
  if (!db) throw new Error('Database connection unavailable');
  const email = (targetEmail || '').trim().toLowerCase();
  let deletedSub = 0;
  let deletedTrk = 0;

  if (targetId) {
    const res1 = await db.collection('subscribers').deleteOne({ id: targetId });
    const res2 = await db.collection('tracked_jobs').deleteOne({ id: targetId });
    deletedSub += res1.deletedCount;
    deletedTrk += res2.deletedCount;
  }
  if (email) {
    const res1 = await db.collection('subscribers').deleteMany({ email });
    const res2 = await db.collection('tracked_jobs').deleteMany({ email });
    deletedSub += res1.deletedCount;
    deletedTrk += res2.deletedCount;
  }

  return {
    success: true,
    message: `Deleted recipient records (${deletedSub} subscriber, ${deletedTrk} tracked applications)`,
    deletedSubscribers: deletedSub,
    deletedTracked: deletedTrk
  };
}

/**
 * Clears all subscribers and tracked application records from MongoDB Atlas
 */
async function clearAllSubscribersAndTracked() {
  const db = await getDb();
  if (!db) throw new Error('Database connection unavailable');
  const subRes = await db.collection('subscribers').deleteMany({});
  const trkRes = await db.collection('tracked_jobs').deleteMany({});
  return {
    success: true,
    deletedSubscribers: subRes.deletedCount,
    deletedTracked: trkRes.deletedCount,
    message: `Successfully cleared all ${subRes.deletedCount} subscribers and ${trkRes.deletedCount} tracked applications.`
  };
}

module.exports = {
  getSubscribersDispatchStatus,
  sendIndividualReminder,
  deleteSubscriberOrTrackedJob,
  clearAllSubscribersAndTracked
};
