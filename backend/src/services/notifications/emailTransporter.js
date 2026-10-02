const fs = require('node:fs/promises');
const nodemailer = require('nodemailer');
const { DATA_DIR, LOGS_FILE } = require('./constants');

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

const {
  isMongoEnabled,
  insertEmailLogIntoMongo,
  getEmailLogsFromMongo
} = require('../mongoService');

/**
 * Loads recent email dispatch history (from MongoDB Atlas or local JSON)
 */
async function getEmailLogs() {
  if (isMongoEnabled()) {
    try {
      const mongoLogs = await getEmailLogsFromMongo(200);
      if (Array.isArray(mongoLogs) && mongoLogs.length > 0) {
        return mongoLogs;
      }
    } catch (err) {
      console.warn('[MongoDB] getEmailLogs fallback:', err.message);
    }
  }

  try {
    const raw = await fs.readFile(LOGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Records an email dispatch in history (MongoDB Atlas & local JSON)
 */
async function logEmailDispatch(entry) {
  const logItem = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ...entry
  };

  // Sync to MongoDB Atlas
  if (isMongoEnabled()) {
    insertEmailLogIntoMongo(logItem).catch(err => {
      console.warn('[MongoDB] Failed to log email dispatch:', err.message);
    });
  }

  try {
    const logs = await getEmailLogs();
    logs.push(logItem);
    // Keep last 1000 logs
    const trimmed = logs.slice(-1000);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(LOGS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    // Non-blocking in serverless environments
    console.warn('[Storage] Local log write notice:', err.message);
  }
}

module.exports = {
  getTransporter,
  getEmailLogs,
  logEmailDispatch
};
