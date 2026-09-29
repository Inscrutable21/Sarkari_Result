#!/usr/bin/env node
/**
 * CLI Command to run notification matching & email dispatch
 * 
 * Usage:
 *   node src/services/sendNotifications.js
 *   node src/services/sendNotifications.js --test user@example.com --degree cs_it --qual Graduate
 *   node src/services/sendNotifications.js --status
 */

const {
  dispatchAllNotifications,
  sendTestNotification,
  getSubscribers,
  getEmailLogs,
  getTrackedJobs,
  sendDailyJobReminders
} = require('./notificationService');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--reminders') || args.includes('-r')) {
    console.log('[Job Reminders] Dispatching daily application deadline countdown reminders...');
    try {
      const summary = await sendDailyJobReminders();
      console.log('[Job Reminders] Completed successfully:');
      console.log(`   Reminders Dispatched: ${summary.dispatched}`);
      console.log(`   Skipped (Already Applied): ${summary.skippedApplied}`);
      console.log(`   Skipped (Expired Deadline): ${summary.skippedExpired}`);
      console.log(`   Skipped (Already Sent Today): ${summary.skippedAlreadySentToday}`);
      console.log(`   Total Tracked Posts: ${summary.totalTracked}`);
    } catch (err) {
      console.error('[Job Reminders] Failed to dispatch reminders:', err.message);
      process.exit(1);
    }
    return;
  }

  if (args.includes('--status') || args.includes('-s')) {
    const subscribers = await getSubscribers();
    const trackedList = await getTrackedJobs();
    const logs = await getEmailLogs();
    console.log('====================================================');
    console.log('Sarkari Job Alerts & Tracking Status');
    console.log('====================================================');
    console.log(`Total Degree Subscribers: ${subscribers.length}`);
    console.log(`Active Subscribers: ${subscribers.filter(s => s.active !== false).length}`);
    console.log(`Total Specific Tracked Jobs: ${trackedList.length}`);
    console.log(`Tracked Jobs Pending Application: ${trackedList.filter(t => !t.applied && t.active !== false).length}`);
    console.log(`Tracked Jobs Completed (Applied): ${trackedList.filter(t => t.applied).length}`);

    if (trackedList.length > 0) {
      console.log('\nTracked Job Openings:');
      trackedList.forEach((t, idx) => {
        console.log(`  ${idx + 1}. [${t.email}] ${t.jobTitle} | Deadline: ${t.lastDateFormatted} | Applied: ${t.applied ? 'YES' : 'NO'}`);
      });
    }

    console.log('\nSubscribers List:');
    subscribers.forEach((s, idx) => {
      console.log(`  ${idx + 1}. [${s.email}] Degree: ${(s.disciplines || []).join(', ')} | Qual: ${s.qualification} | Active: ${s.active !== false}`);
    });
    console.log(`\nRecent Sent Emails: ${logs.length}`);
    logs.slice(0, 5).forEach((l, idx) => {
      console.log(`  ${idx + 1}. [${l.timestamp}] To: ${l.recipient} | Type: ${l.isReminder ? 'Daily Reminder' : 'Degree Alert'} | Test: ${Boolean(l.isTest)}`);
    });
    console.log('====================================================');
    return;
  }

  const testIndex = args.indexOf('--test');
  if (testIndex !== -1 && args[testIndex + 1]) {
    const email = args[testIndex + 1];
    const qualIndex = args.indexOf('--qual');
    const degreeIndex = args.indexOf('--degree');

    const qualification = qualIndex !== -1 ? args[qualIndex + 1] : 'all';
    const disciplines = degreeIndex !== -1 ? [args[degreeIndex + 1]] : ['all'];

    console.log(`[Job Alerts] Sending test job alert notification to: ${email}...`);
    try {
      const res = await sendTestNotification({
        email,
        qualification,
        disciplines
      });
      console.log('[Job Alerts] Test alert dispatched successfully!');
      console.log(`   Matched Jobs: ${res.matchedCount}`);
      if (res.previewUrl) {
        console.log(`   Preview URL (Ethereal): ${res.previewUrl}`);
      }
    } catch (err) {
      console.error('[Job Alerts] Failed to send test alert:', err.message);
      process.exit(1);
    }
    return;
  }

  // Regular batch dispatch
  console.log('[Job Alerts] Dispatching job alerts to all active subscribers...');
  try {
    const summary = await dispatchAllNotifications();
    console.log('[Job Alerts] Notification dispatch finished:', summary);
  } catch (err) {
    console.error('[Job Alerts] Notification dispatch error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal notification error:', err);
    process.exit(1);
  });
}

module.exports = { main };
