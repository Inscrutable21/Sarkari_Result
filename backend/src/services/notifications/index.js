/**
 * Sarkari Hith Notification System - Modular Index
 * 
 * Re-exports all components of the structured notification service:
 * - Constants & Validators (constants.js)
 * - Email Transporters & Logging (emailTransporter.js)
 * - Premium Email Templates & Status Pages (emailTemplates.js)
 * - Persistent Sent-Job History Store (sentHistoryStore.js)
 * - Subscriber Profiles & Matching (subscriberStore.js)
 * - Job Application Deadline Tracker (jobTrackerStore.js)
 * - Dispatchers & Batch Processors (dispatcher.js)
 */

const constants = require('./constants');
const emailTransporter = require('./emailTransporter');
const emailTemplates = require('./emailTemplates');
const sentHistoryStore = require('./sentHistoryStore');
const subscriberStore = require('./subscriberStore');
const jobTrackerStore = require('./jobTrackerStore');
const dispatcher = require('./dispatcher');
const subscriberStatusService = require('./subscriberStatusService');

module.exports = {
  // Constants & Utilities
  ...constants,

  // Transporter & Logging
  ...emailTransporter,

  // Templates & HTML Renderers
  ...emailTemplates,

  // Sent History Store (Deduplication)
  ...sentHistoryStore,

  // Subscribers Management & Matching
  ...subscriberStore,

  // Job Deadline Tracking
  ...jobTrackerStore,

  // Dispatchers & Reminders
  ...dispatcher,

  // Subscriber & 6 PM Reminder Status
  ...subscriberStatusService
};
