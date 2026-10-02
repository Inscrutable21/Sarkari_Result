const nodemailer = require('nodemailer');
const {
  insertEmailLogIntoMongo,
  getEmailLogsFromMongo
} = require('../mongoService');

let cachedTransporter = null;

/**
 * Gets or creates the nodemailer transport (SMTP or Ethereal test fallback)
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
    if (emailUser.toLowerCase().includes('@gmail.com') || !host) {
      cachedTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: emailUser, pass: emailPass }
      });
      return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: emailUser, pass: emailPass }
    });
    return cachedTransporter;
  }

  // If no SMTP credentials provided, try creating an Ethereal test account
  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    cachedTransporter._isEthereal = true;
    return cachedTransporter;
  } catch {
    // Local fallback transport that captures messages without internet requirement
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true
    });
    cachedTransporter._isJson = true;
    return cachedTransporter;
  }
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
