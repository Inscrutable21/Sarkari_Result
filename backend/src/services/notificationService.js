/**
 * Sarkari Hith - Notification Service Facade
 * 
 * This service provides unified access to the structured notification subsystem:
 * 
 * Architecture:
 * - notifications/constants.js        -> Config, file paths, regexes, security sanitizers
 * - notifications/emailTransporter.js -> Nodemailer transport setup, logging & telemetry
 * - notifications/emailTemplates.js   -> High-fidelity HTML email templates & status view
 * - notifications/sentHistoryStore.js -> Persistent deduplication history store
 * - notifications/subscriberStore.js  -> Subscriber CRUD, MongoDB sync & degree matching
 * - notifications/jobTrackerStore.js  -> Deadline countdown tracking, status management & timers
 * - notifications/dispatcher.js       -> Dispatch workflows, test triggers & batch runners
 */

const {
  getLastReminderTriggerDateFromMongo,
  setLastReminderTriggerDateInMongo
} = require('./mongoService');

const {
  // Subscribers
  getSubscribers,
  saveSubscribers,
  subscribeUser,
  unsubscribeUser,
  matchJobsForSubscriber,

  // Dispatchers
  sendJobAlertEmail,
  sendTestNotification,
  dispatchAllNotifications,
  sendTrackedJobEmail,
  sendDailyJobReminders,

  // Transporter & Logs
  getTransporter,
  getEmailLogs,
  logEmailDispatch,

  // Job Deadline Tracking & Reminders
  getTrackedJobs,
  saveTrackedJobs,
  trackJob,
  updateJobApplicationStatus,
  scheduleReminderTimer,
  sendImmediateReminder,
  getActiveReminderTimers,
  calculateDaysLeft,
  activeReminderTimers,

  // Templates
  buildJobAlertEmailHtml,
  buildJobReminderEmailHtml,
  renderStatusPageHtml,

  // Sent History Deduplication
  getSentJobHistory,
  hasJobBeenSentToSubscriber,
  recordSentJobsForSubscriber,

  // Subscriber & 7 PM Reminder Status
  getSubscribersDispatchStatus,
  sendIndividualReminder,
  deleteSubscriberOrTrackedJob,
  clearAllSubscribersAndTracked,

  // Constants & Utilities
  DATA_DIR,
  SUBSCRIBERS_FILE,
  TRACKED_JOBS_FILE,
  LOGS_FILE,
  JOBS_FILE,
  SENT_JOB_HISTORY_FILE,
  escapeHtml,
  safeHttpUrl,
  isValidEmail,
  generateStableTrackId
} = require('./notifications');

module.exports = {
  // Core Public API (Maintained 100% backward compatible for server.js, runScraper.js, sendNotifications.js)
  getSubscribers,
  saveSubscribers,
  subscribeUser,
  unsubscribeUser,
  matchJobsForSubscriber,
  sendJobAlertEmail,
  sendTestNotification,
  dispatchAllNotifications,
  sendTrackedJobEmail,
  getEmailLogs,
  logEmailDispatch,
  getTransporter,
  getTrackedJobs,
  saveTrackedJobs,
  trackJob,
  updateJobApplicationStatus,
  sendDailyJobReminders,
  scheduleReminderTimer,
  sendImmediateReminder,
  getActiveReminderTimers,
  calculateDaysLeft,
  activeReminderTimers,
  renderStatusPageHtml,
  buildJobAlertEmailHtml,
  buildJobReminderEmailHtml,
  getSentJobHistory,
  hasJobBeenSentToSubscriber,
  recordSentJobsForSubscriber,
  getSubscribersDispatchStatus,
  sendIndividualReminder,
  deleteSubscriberOrTrackedJob,
  clearAllSubscribersAndTracked,
  getLastReminderTriggerDateFromMongo,
  setLastReminderTriggerDateInMongo,
  DATA_DIR,
  SUBSCRIBERS_FILE,
  TRACKED_JOBS_FILE,
  LOGS_FILE,
  JOBS_FILE,
  SENT_JOB_HISTORY_FILE,
  escapeHtml,
  safeHttpUrl,
  isValidEmail,
  generateStableTrackId
};

