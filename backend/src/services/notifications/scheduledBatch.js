const { sendDailyJobReminders, dispatchAllNotifications } = require('./dispatcher');

// A partially failed run must stay eligible for retry. Recipient history prevents
// successful messages from being sent again when the scheduler retries.
async function runScheduledBatch() {
  let remindersSent = 0;
  let alertsSent = 0;
  let lastError;
  // Vercel does not retry failed cron invocations. Retry pending recipients
  // within this invocation, with a fixed limit so persistent failures surface.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const summary = await sendDailyJobReminders();
      remindersSent += summary.dispatched || 0;
      const alertSummary = await dispatchAllNotifications();
      alertsSent += alertSummary.dispatched || 0;
      if (summary.error || summary.failed || alertSummary.error || alertSummary.failed) {
        const error = new Error('Scheduled email batch has failed deliveries; retry required');
        error.summary = summary;
        error.alertSummary = alertSummary;
        throw error;
      }
      return {
        summary: { ...summary, dispatched: remindersSent },
        alertSummary: { ...alertSummary, dispatched: alertsSent },
        attempts: attempt
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

module.exports = { runScheduledBatch };
