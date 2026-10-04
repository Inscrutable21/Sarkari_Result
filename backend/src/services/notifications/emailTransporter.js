const nodemailer = require('nodemailer');
const {
  insertEmailLogIntoMongo,
  getEmailLogsFromMongo
} = require('../mongoService');

let cachedTransporter = null;

/**
 * Gets or creates a real SMTP transport. Missing credentials must fail delivery.
 */
async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  let emailPass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  if (emailPass) {
    emailPass = emailPass.replace(/\s+/g, '');
  }

  if (emailUser && emailPass) {
    if (!host) {
      cachedTransporter = nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
        auth: { user: emailUser, pass: emailPass }
      });
      return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
      host,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      port,
      secure: port === 465,
      auth: { user: emailUser, pass: emailPass }
    });
    return cachedTransporter;
  }

  throw new Error('Email delivery is not configured: set EMAIL_USER and EMAIL_APP_PASSWORD, or SMTP_USER and SMTP_PASS, in the deployment environment.');
}

/**
 * Loads recent email dispatch history exclusively from MongoDB Atlas
 */
async function getEmailLogs() {
  const mongoLogs = await getEmailLogsFromMongo(200);
  return Array.isArray(mongoLogs) ? mongoLogs : [];
}

/**
 * Records an email dispatch in history exclusively in MongoDB Atlas
 */
async function logEmailDispatch(entry) {
  const logItem = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ...entry
  };

  try {
    await insertEmailLogIntoMongo(logItem);
  } catch (err) {
    console.warn('[MongoDB] Failed to log email dispatch:', err.message);
  }
}

module.exports = {
  getTransporter,
  getEmailLogs,
  logEmailDispatch
};
