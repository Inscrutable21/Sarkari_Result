const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

// Load environment variables from .env if not already set
function loadEnv() {
  const envCandidates = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../backend/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env')
  ];
  for (const envPath of envCandidates) {
    if (nodeFs.existsSync(envPath)) {
      try {
        const content = nodeFs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            let val = match[2] || '';
            val = val.trim().replace(/^['"](.*)['"]$/, '$1');
            if (!process.env[match[1]]) {
              process.env[match[1]] = val;
            }
          }
        });
        break;
      } catch {}
    }
  }
}
loadEnv();

const DATA_DIR = path.resolve(__dirname, '../data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const TRACKED_JOBS_FILE = path.join(DATA_DIR, 'trackedJobs.json');
const LOGS_FILE = path.join(DATA_DIR, 'emailLogs.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

const {
  isGoogleSheetEnabled,
  getJobsFromSheet,
  appendSubscriberToSheet,
  getSubscribersFromSheet,
  appendTrackedJobToSheet,
  getTrackedJobsFromSheet,
  updateTrackedJobStatusInSheet
} = require('./googleSheetService');

/**
 * Defensive HTML Escaper to prevent XSS in emails and rendered HTML pages
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates and ensures URLs only use http/https protocols
 */
function safeHttpUrl(rawUrl, fallback = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {}
  return fallback;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Loads current list of subscribers (from Google Sheets if enabled, fallback to local file)
 */
async function getSubscribers() {
  if (isGoogleSheetEnabled()) {
    try {
      const sheetSubs = await getSubscribersFromSheet();
      if (Array.isArray(sheetSubs) && sheetSubs.length > 0) {
        return sheetSubs.map(s => ({
          id: s.ID || s.id || ('sub_' + Math.random().toString(36).slice(2, 7)),
          email: (s.Email || s.email || '').trim().toLowerCase(),
          name: s.Name || s.name || 'Job Aspirant',
          qualification: s.Qualification || s.qualification || 'all',
          disciplines: typeof s.Disciplines === 'string' ? s.Disciplines.split(',').map(d => d.trim()) : (Array.isArray(s.Disciplines) ? s.Disciplines : ['all']),
          state: s.State || s.state || 'all',
          sector: s.Sector || s.sector || 'all',
          subscribedAt: s.SubscribedAt || s.subscribedAt || new Date().toISOString(),
          notifiedJobIds: [],
          active: s.Active !== false && String(s.Active).toLowerCase() !== 'false'
        }));
      }
    } catch (err) {
      console.warn('[Google Sheets] getSubscribers fallback to local:', err.message);
    }
  }

  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.subscribers || []);
  } catch {
    return [];
  }
}

/**
 * Persists subscribers to local file and syncs to Google Sheets
 */
async function saveSubscribers(subscribers) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2), 'utf-8');

  // Sync to Google Sheet if configured
  if (isGoogleSheetEnabled() && subscribers.length > 0) {
    const latest = subscribers[subscribers.length - 1];
    if (latest) {
      appendSubscriberToSheet(latest).catch(err => {
        console.warn('[Google Sheets] Async subscriber append error:', err.message);
      });
    }
  }
}

/**
 * Loads all currently tracked jobs across candidates (Google Sheet or local)
 */
async function getTrackedJobs() {
  if (isGoogleSheetEnabled()) {
    try {
      const sheetTracked = await getTrackedJobsFromSheet();
      if (Array.isArray(sheetTracked) && sheetTracked.length > 0) {
        return sheetTracked.map(t => ({
          id: t.ID || t.id,
          email: (t.Email || t.email || '').trim().toLowerCase(),
          name: t.Name || t.name || 'Job Aspirant',
          jobId: t.JobID || t.jobId || '',
          jobTitle: t.JobTitle || t.jobTitle || '',
          organization: t.Organization || t.organization || 'Government Department',
          lastDate: t.Deadline || t.lastDate || null,
          lastDateFormatted: t.Deadline || t.lastDateFormatted || 'Check Notice',
          link: t.Link || t.link || '',
          subscribedAt: t.SubscribedAt || t.subscribedAt || new Date().toISOString(),
          lastReminderSentAt: t.LastReminderSent || t.lastReminderSentAt || null,
          reminderCount: 1,
          applied: String(t.Applied).toLowerCase() === 'true',
          active: String(t.Applied).toLowerCase() !== 'true'
        }));
      }
    } catch (err) {
      console.warn('[Google Sheets] getTrackedJobs fallback to local:', err.message);
    }
  }

  try {
    const raw = await fs.readFile(TRACKED_JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists tracked jobs list to disk
 */
async function saveTrackedJobs(tracked) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TRACKED_JOBS_FILE, JSON.stringify(tracked, null, 2), 'utf-8');
}

/**
 * Loads recent email dispatch history
 */
async function getEmailLogs() {
  try {
    const raw = await fs.readFile(LOGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Records an email dispatch in history
 */
async function logEmailDispatch(entry) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const logs = await getEmailLogs();
    logs.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Keep max 100 recent entries
    if (logs.length > 100) logs.length = 100;
    await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to log email dispatch:', err.message);
  }
}

/**
 * Subscribes a user with their degree, qualification, and alert preferences
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
    subscribers[index] = subscriber;
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
    subscribers.push(subscriber);
  }

  await saveSubscribers(subscribers);

  // Always dispatch immediate subscription confirmation email
  let emailDispatched = false;
  let matchedCount = 0;
  try {
    const rawJobs = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsedJobs = JSON.parse(rawJobs);
    const jobs = Array.isArray(parsedJobs) ? parsedJobs : (parsedJobs.data || []);
    const matchingJobs = matchJobsForSubscriber(subscriber, jobs);
    matchedCount = matchingJobs.length;
    // Send matching jobs or top active vacancies so candidate immediately gets active opportunities
    const jobsToSend = matchingJobs.length > 0 ? matchingJobs.slice(0, 10) : jobs.slice(0, 5);
    const dispatch = await sendJobAlertEmail(subscriber, jobsToSend, false, true);
    emailDispatched = dispatch.success === true;
    console.log(`[Job Alerts] Confirmation alert email sent to ${subscriber.email} (${jobsToSend.length} jobs)`);
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
 * Unsubscribes a user by email
 */
async function unsubscribeUser(email) {
  if (!email) throw new Error('Email is required to unsubscribe');
  const subscribers = await getSubscribers();
  const cleanEmail = email.trim().toLowerCase();
  const index = subscribers.findIndex(s => s.email.toLowerCase() === cleanEmail);
  if (index === -1) {
    return { found: false, message: 'Email address not found in alert list' };
  }
  subscribers[index].active = false;
  subscribers[index].unsubscribedAt = new Date().toISOString();
  await saveSubscribers(subscribers);
  return { found: true, message: 'Successfully unsubscribed from job alerts' };
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
 * Initializes nodemailer transporter: uses Gmail credentials (EMAIL_USER / EMAIL_APP_PASSWORD)
 * or custom SMTP if configured, or ethereal / json fallback for offline testing.
 */
let cachedTransporter = null;

async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  loadEnv();

  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  let emailPass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  if (emailPass) {
    emailPass = emailPass.replace(/\s+/g, '');
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;

  if (emailUser && emailPass) {
    // If Gmail account or default SMTP
    if (emailUser.toLowerCase().includes('@gmail.com') || !host) {
      cachedTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass
        }
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
 * Builds HTML template for Job Alerts
 */
function buildJobAlertEmailHtml({ subscriber, jobs, isTest = false, isConfirmation = false }) {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
  const degreeText = Array.isArray(subscriber.disciplines) && !subscriber.disciplines.includes('all')
    ? subscriber.disciplines.join(', ').toUpperCase().replace(/_/g, ' ')
    : 'All Streams';

  const qualText = subscriber.qualification !== 'all' ? subscriber.qualification : 'Any Eligibility';

  const jobsListHtml = jobs.map((job, idx) => {
    const applyLink = job.link || portalUrl;
    const lastDate = job.lastDateFormatted || job.lastDate || 'Check Notification';
    const org = job.organization || 'Government of India';
    const sectorBadge = job.sector || 'Central / State';

    return `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <span style="display: inline-block; background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px;">
            ${org} &bull; ${sectorBadge}
          </span>
          <span style="display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
            Last Date: ${lastDate}
          </span>
        </div>
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.35;">
          ${idx + 1}. ${job.title}
        </h3>
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #475569; line-height: 1.45;">
          <strong>Eligibility:</strong> ${job.qualification || 'Check official advertisement'} 
          ${job.details?.totalVacancies ? `&bull; <strong>Vacancies:</strong> ${job.details.totalVacancies}` : ''}
        </p>
        <div style="display: flex; gap: 10px; align-items: center;">
          <a href="${applyLink}" style="display: inline-block; background: #b30000; color: #ffffff; text-decoration: none; font-size: 12px; font-weight: 700; padding: 7px 16px; border-radius: 5px;" target="_blank">
            Apply Online / View Details &rarr;
          </a>
        </div>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sarkari Result Job Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #b30000 0%, #7f1d1d 100%); padding: 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">SARKARI RESULT &bull; JOB NOTIFICATIONS</h1>
      <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">Tailored Recruitment Notifications Based on Your Qualifications</p>
    </div>

    <!-- Alert Summary Bar -->
    <div style="background: #f1f5f9; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">
      ${isTest ? '<div style="background: #e0e7ff; color: #3730a3; padding: 6px 12px; border-radius: 6px; font-weight: 700; margin-bottom: 10px; font-size: 12px;">TEST NOTIFICATION PREVIEW</div>' : ''}
      ${isConfirmation ? '<div style="background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 10px 14px; border-radius: 6px; font-weight: 700; margin-bottom: 12px; font-size: 13px;">SUBSCRIPTION ACTIVE: You are now subscribed to Sarkari Job Alerts! We will automatically email you when new eligible vacancies are announced.</div>' : ''}
      <strong>Hello ${subscriber.name || 'Job Aspirant'},</strong><br>
      ${isConfirmation ? 'Your job notification service is active. Here are currently active openings matching your profile:' : `Found <strong>${jobs.length} government jobs</strong> matching your preferences:`}
      <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
        <span style="background: #ffffff; border: 1px solid #cbd5e1; padding: 3px 10px; border-radius: 4px; font-size: 12px;"><strong>Degree:</strong> ${degreeText}</span>
        <span style="background: #ffffff; border: 1px solid #cbd5e1; padding: 3px 10px; border-radius: 4px; font-size: 12px;"><strong>Qualification:</strong> ${qualText}</span>
        <span style="background: #ffffff; border: 1px solid #cbd5e1; padding: 3px 10px; border-radius: 4px; font-size: 12px;"><strong>Status:</strong> Active &amp; Subscribed</span>
      </div>
    </div>

    <!-- Job Listings -->
    <div style="padding: 20px 24px; background: #f8fafc;">
      ${jobsListHtml || '<p style="text-align: center; color: #64748b; font-size: 14px;">No new matching jobs at this moment. We will alert you the moment a new one is announced!</p>'}
    </div>

    <!-- Footer -->
    <div style="background: #ffffff; padding: 20px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
      <p style="margin: 0 0 8px 0;">
        You received this email because you subscribed to custom job alerts on <a href="${portalUrl}" style="color: #b30000; text-decoration: none; font-weight: 600;">Sarkari Result</a>.
      </p>
      <p style="margin: 0;">
        Always verify exam fees, eligibility, and age limit from the official advertisement before applying.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

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
    ? `"Sarkari Result Job Alerts" <${emailUser}>`
    : '"Sarkari Result Job Alerts" <alerts@sarkariresult.com>';
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
    text: `Sarkari Result Job Alert\n\nFound ${jobs.length} jobs matching your profile:\n\n` +
      jobs.map(j => `- ${j.title} (Last Date: ${j.lastDateFormatted || 'Check Notice'})\n  Link: ${j.link}\n`).join('\n')
  };

  const info = await transporter.sendMail(mailOptions);
  let previewUrl = null;

  if (transporter._isEthereal && nodemailer.getTestMessageUrl) {
    previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[Email Preview URL]: ${previewUrl}`);
  }

  // Update subscriber history if real dispatch (not test)
  if (!isTest) {
    const subscribers = await getSubscribers();
    const idx = subscribers.findIndex(s => s.id === subscriber.id || s.email === subscriber.email);
    if (idx !== -1) {
      const newlySentIds = jobs.map(j => j.id).filter(Boolean);
      subscribers[idx].notifiedJobIds = Array.from(new Set([...(subscribers[idx].notifiedJobIds || []), ...newlySentIds]));
      subscribers[idx].lastNotifiedAt = new Date().toISOString();
      await saveSubscribers(subscribers);
    }
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

  // Load all jobs
  let allJobs = [];
  try {
    const raw = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    allJobs = Array.isArray(parsed) ? parsed : (parsed.data || []);
  } catch (err) {
    throw new Error('Jobs dataset not found. Please run scraper first: ' + err.message);
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
    const raw = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    allJobs = Array.isArray(parsed) ? parsed : (parsed.data || []);
  } catch (err) {
    console.error('Cannot dispatch notifications: jobs.json not found:', err.message);
    return { error: err.message };
  }

  let dispatched = 0;
  let skipped = 0;
  const results = [];

  for (const subscriber of activeSubscribers) {
    const matchingJobs = matchJobsForSubscriber(subscriber, allJobs);
    
    // Filter out jobs that this subscriber was already notified for
    const notifiedIds = new Set(subscriber.notifiedJobIds || []);
    const newJobs = matchingJobs.filter(job => !notifiedIds.has(job.id));

    if (newJobs.length === 0) {
      skipped++;
      continue;
    }

    try {
      const sendResult = await sendJobAlertEmail(subscriber, newJobs.slice(0, 10), false);
      results.push(sendResult);
      dispatched++;
      console.log(`[Job Alert Sent] Sent notification with ${newJobs.length} jobs to ${subscriber.email}`);
    } catch (err) {
      console.error(`[Job Alert Failed] Failed to send alert to ${subscriber.email}:`, err.message);
    }
  }

  console.log(`[Job Alerts Finished] Dispatched ${dispatched}, Skipped ${skipped} (no new matches).`);
  return {
    dispatched,
    skipped,
    totalSubscribers: activeSubscribers.length,
    results
  };
}

/**
 * Calculates calendar days remaining until deadline
 */
function calculateDaysLeft(lastDateStr) {
  if (!lastDateStr) return null;
  const deadline = new Date(lastDateStr + 'T23:59:59');
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Builds HTML template for Job Specific Reminders & Confirmation
 */
function buildJobReminderEmailHtml({ track, daysLeft, isConfirmation = false }) {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
  const applyLink = track.link || portalUrl;
  const deadlineFormatted = track.lastDateFormatted || track.lastDate || 'Check official advertisement';
  const org = track.organization || 'Government of India';

  const statusBaseUrl = `${portalUrl}/api/track-job/status?trackId=${encodeURIComponent(track.id)}`;
  const appliedUrl = `${statusBaseUrl}&status=applied`;
  const pendingUrl = `${statusBaseUrl}&status=pending`;

  let headline = '';
  let subheadline = '';
  let badgeText = '';
  let badgeBg = '#dbeafe';
  let badgeColor = '#1e40af';

  if (isConfirmation) {
    headline = 'Application Reminders Activated';
    subheadline = `You are successfully subscribed to daily deadline countdown reminders for this recruitment.`;
    badgeText = daysLeft !== null && daysLeft >= 0 ? `${daysLeft} Days Remaining` : 'Active Recruitment';
  } else if (daysLeft === 0) {
    headline = 'FINAL DAY TO APPLY TODAY';
    subheadline = `Application window closes TONIGHT. Please submit your online form immediately.`;
    badgeText = 'Closes Today';
    badgeBg = '#fee2e2';
    badgeColor = '#b91c1c';
  } else if (daysLeft === 1) {
    headline = '1 DAY REMAINING: Deadline Tomorrow';
    subheadline = `Only 1 day left before the application form closes. Complete your submission soon.`;
    badgeText = '1 Day Left';
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
  } else if (daysLeft > 1) {
    headline = `${daysLeft} DAYS LEFT: Please Fill The Form`;
    subheadline = `Daily deadline countdown reminder for your tracked government recruitment.`;
    badgeText = `${daysLeft} Days Left`;
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
  } else {
    headline = 'Application Deadline Closed';
    subheadline = `The application window for this recruitment has officially concluded.`;
    badgeText = 'Deadline Passed';
    badgeBg = '#f1f5f9';
    badgeColor = '#64748b';
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sarkari Hith Job Reminder</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);">
          <!-- Top Red Header -->
          <tr>
            <td style="background-color: #b30000; padding: 20px 24px;">
              <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">SARKARI HITH</span>
              <p style="margin: 3px 0 0 0; color: #fecaca; font-size: 12px; font-weight: 500;">Candidate Deadline Tracking & Notification Service</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 24px;">
              <div style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.5px; margin-bottom: 12px;">
                ${badgeText}
              </div>

              <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                ${headline}
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.5;">
                ${subheadline}
              </p>

              <!-- Job Details Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
                <div style="font-size: 11px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 6px;">
                  ${org}
                </div>
                <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                  ${track.jobTitle}
                </h3>
                <div style="display: flex; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                  <span style="font-size: 13px; color: #475569;">
                    <strong>Application Deadline:</strong> <span style="color: #b91c1c; font-weight: 700;">${deadlineFormatted}</span>
                  </span>
                  ${daysLeft !== null && daysLeft >= 0 ? `<span style="font-size: 13px; color: #0369a1; font-weight: 700;">(${daysLeft} days remaining)</span>` : ''}
                </div>
                <a href="${applyLink}" style="display: inline-block; background-color: #b30000; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 20px; border-radius: 6px;" target="_blank">
                  Apply Online &amp; View Official Details &rarr;
                </a>
              </div>

              <!-- Interactive Application Status Check -->
              <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
                  Have you submitted your application for this post?
                </h4>
                <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b; line-height: 1.4;">
                  Please update your status below. If you have applied, we will stop sending reminders for this post.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding-bottom: 10px;">
                      <a href="${appliedUrl}" style="display: block; max-width: 320px; background-color: #16a34a; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 11px 18px; border-radius: 6px;">
                        [Yes, I Have Applied] &mdash; Stop Reminders
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <a href="${pendingUrl}" style="display: block; max-width: 320px; background-color: #ffffff; color: #475569; text-decoration: none; font-weight: 600; font-size: 12px; padding: 9px 18px; border-radius: 6px; border: 1px solid #cbd5e1;">
                        Not Yet Applied &mdash; Remind Me Tomorrow
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
                  If no option is selected, we will continue sending daily countdown updates until the deadline closes.
                </p>
              </div>

              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                You received this email because you asked to track <strong>${track.jobTitle}</strong> on Sarkari Hith.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
              Sarkari Hith &bull; Official Indian Government Employment &amp; Examination Portal &bull; Free Candidate Alerts
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Sends a single job reminder or confirmation email to a candidate
 */
async function sendTrackedJobEmail(track, daysLeft, isConfirmation = false) {
  const transporter = await getTransporter();
  const html = buildJobReminderEmailHtml({ track, daysLeft, isConfirmation });
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const defaultFrom = emailUser
    ? `"Sarkari Result Job Alerts" <${emailUser}>`
    : '"Sarkari Result Job Alerts" <alerts@sarkariresult.com>';
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || defaultFrom;

  let subject = '';
  if (isConfirmation) {
    subject = `[Subscribed] You are Subscribed to Application Reminders: ${track.jobTitle} (${daysLeft} Days Left)`;
  } else if (daysLeft === 0) {
    subject = `[LAST DAY TODAY] Final Notice: Apply Today for ${track.jobTitle}`;
  } else if (daysLeft === 1) {
    subject = `[1 Day Left] Deadline Tomorrow: Please Fill ${track.jobTitle}`;
  } else {
    subject = `[Deadline Reminder] ${daysLeft} Days Left: Please Fill ${track.jobTitle}`;
  }

  const mailOptions = {
    from: fromEmail,
    to: track.email,
    subject,
    html,
    text: `${subject}\n\nOrganization: ${track.organization}\nDeadline: ${track.lastDateFormatted}\nDays Left: ${daysLeft}\n\nApply Link: ${track.link}\nMark Applied: ${process.env.PORTAL_URL || 'http://localhost:3000'}/api/track-job/status?trackId=${track.id}&status=applied`
  };

  const info = await transporter.sendMail(mailOptions);

  await logEmailDispatch({
    recipient: track.email,
    recipientName: track.name,
    jobCount: 1,
    jobTitles: [track.jobTitle],
    isTest: false,
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
 * Tracks a specific job opening for a user and dispatches immediate confirmation email
 */
async function trackJob({ email, name, jobId, jobTitle, organization, lastDate, lastDateFormatted, link }) {
  if (!isValidEmail(email)) {
    throw new Error('Please enter a valid email address');
  }
  if (!jobId && !jobTitle) {
    throw new Error('Job details are required to set reminders');
  }

  const cleanEmail = email.trim().toLowerCase();
  const trackedList = await getTrackedJobs();

  // Try to enrich from jobs.json if not passed in
  let resolvedJob = null;
  try {
    const rawJobs = await fs.readFile(JOBS_FILE, 'utf-8');
    const parsedJobs = JSON.parse(rawJobs);
    const jobs = Array.isArray(parsedJobs) ? parsedJobs : (parsedJobs.data || []);
    resolvedJob = jobs.find(j => j.id === jobId || j.title === jobTitle);
  } catch {}

  const finalTitle = jobTitle || resolvedJob?.title || 'Government Recruitment';
  const finalOrg = organization || resolvedJob?.organization || 'Government Department';
  const finalLastDate = lastDate || resolvedJob?.lastDate || null;
  const finalLastDateFormatted = lastDateFormatted || resolvedJob?.lastDateFormatted || finalLastDate || 'Check Notice';
  const rawCandidateLink = link || resolvedJob?.link;
  const finalLink = safeHttpUrl(rawCandidateLink, 'https://www.sarkariresult.com');

  const daysLeft = calculateDaysLeft(finalLastDate);

  // Check if candidate is already tracking this specific job
  const existingIdx = trackedList.findIndex(t => 
    t.email.toLowerCase() === cleanEmail && (t.jobId === jobId || t.jobTitle === finalTitle)
  );

  let trackRecord;
  let isNew = false;
  const now = new Date().toISOString();

  if (existingIdx !== -1) {
    trackRecord = {
      ...trackedList[existingIdx],
      name: name?.trim() || trackedList[existingIdx].name,
      jobTitle: finalTitle,
      organization: finalOrg,
      lastDate: finalLastDate,
      lastDateFormatted: finalLastDateFormatted,
      link: finalLink,
      applied: false, // Reactivate if user re-tracks
      appliedAt: null,
      active: true,
      updatedAt: now
    };
    trackedList[existingIdx] = trackRecord;
  } else {
    isNew = true;
    trackRecord = {
      id: 'trk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      email: cleanEmail,
      name: name?.trim() || 'Job Aspirant',
      jobId: jobId || ('job_' + Math.random().toString(36).slice(2, 8)),
      jobTitle: finalTitle,
      organization: finalOrg,
      lastDate: finalLastDate,
      lastDateFormatted: finalLastDateFormatted,
      link: finalLink,
      subscribedAt: now,
      lastReminderSentAt: null,
      reminderCount: 0,
      applied: false,
      appliedAt: null,
      active: true
    };
    trackedList.push(trackRecord);
  }

  await saveTrackedJobs(trackedList);

  // Sync to Google Sheet if enabled
  if (isGoogleSheetEnabled()) {
    appendTrackedJobToSheet(trackRecord).catch(err => {
      console.warn('[Google Sheets] Failed to sync tracked job:', err.message);
    });
  }

  // Immediately dispatch confirmation email with countdown
  let emailSent = false;
  try {
    const mailRes = await sendTrackedJobEmail(trackRecord, daysLeft, true);
    emailSent = mailRes.success === true;
    console.log(`[Job Tracker] Confirmation email sent to ${cleanEmail} for ${finalTitle}`);
  } catch (err) {
    console.warn(`[Job Tracker] Could not send confirmation email: ${err.message}`);
  }

  return {
    success: true,
    isNew,
    track: trackRecord,
    emailSent,
    daysLeft
  };
}

/**
 * Updates application status from candidate response ("applied" or "pending")
 */
async function updateJobApplicationStatus(trackId, status) {
  if (!trackId) throw new Error('Missing tracking identifier');

  const trackedList = await getTrackedJobs();
  const track = trackedList.find(t => t.id === trackId);
  if (!track) {
    return { found: false, message: 'Tracking record not found' };
  }

  const isApplied = status === 'applied';
  track.applied = isApplied;
  track.appliedAt = isApplied ? new Date().toISOString() : null;
  track.statusUpdatedAt = new Date().toISOString();

  // If candidate has applied, stop further reminders for this job
  if (isApplied) {
    track.active = false;
    console.log(`[Job Tracker] Candidate ${track.email} applied for ${track.jobTitle}. Reminders stopped.`);
  } else {
    track.active = true;
    console.log(`[Job Tracker] Candidate ${track.email} pending application for ${track.jobTitle}. Reminders continue.`);
  }

  await saveTrackedJobs(trackedList);

  // Sync status to Google Sheet
  if (isGoogleSheetEnabled()) {
    updateTrackedJobStatusInSheet(trackId, status).catch(err => {
      console.warn('[Google Sheets] Status sync error:', err.message);
    });
  }

  return {
    found: true,
    track,
    status: isApplied ? 'applied' : 'pending'
  };
}

/**
 * Batch processor: dispatches daily deadline countdown reminders to all active tracked jobs
 */
async function sendDailyJobReminders() {
  console.log('[Job Reminders] Checking daily deadline reminders for candidates...');
  const trackedList = await getTrackedJobs();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  let dispatched = 0;
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
    const daysLeft = calculateDaysLeft(track.lastDate);

    // If deadline has completely passed (more than 1 day ago)
    if (daysLeft !== null && daysLeft < 0) {
      skippedExpired++;
      track.active = false;
      continue;
    }

    // 3. Prevent duplicate emails on the exact same calendar day
    if (track.lastReminderSentAt && track.lastReminderSentAt.startsWith(todayStr)) {
      skippedAlreadySentToday++;
      continue;
    }

    try {
      const mailRes = await sendTrackedJobEmail(track, daysLeft, false);
      track.lastReminderSentAt = now.toISOString();
      track.reminderCount = (track.reminderCount || 0) + 1;
      dispatched++;
      results.push(mailRes);
      console.log(`[Job Reminder Sent] Sent ${daysLeft} days-left reminder to ${track.email} for ${track.jobTitle}`);
    } catch (err) {
      console.error(`[Job Reminder Error] Failed sending reminder to ${track.email}: ${err.message}`);
    }
  }

  await saveTrackedJobs(trackedList);

  console.log(`[Job Reminders Complete] Dispatched ${dispatched}, Skipped Applied: ${skippedApplied}, Skipped Expired: ${skippedExpired}, Sent Today: ${skippedAlreadySentToday}`);
  return {
    dispatched,
    skippedApplied,
    skippedExpired,
    skippedAlreadySentToday,
    totalTracked: trackedList.length,
    results
  };
}

/**
 * Renders user-facing HTML response when candidate clicks "I Applied" / "Not Yet" in email
 */
function renderStatusPageHtml(result, requestedStatus) {
  const isApplied = requestedStatus === 'applied' && result.found;
  const track = result.track || {};
  const portalUrl = process.env.PORTAL_URL || '/';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Application Status Recorded | Sarkari Hith</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 90vh;
    }
    .status-card {
      background: #ffffff;
      max-width: 520px;
      width: 100%;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .header {
      background: #b30000;
      color: #ffffff;
      padding: 24px 28px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .header p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #fecaca;
    }
    .content {
      padding: 32px 28px;
      text-align: center;
    }
    .icon-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }
    .icon-applied {
      background: #dcfce7;
      color: #16a34a;
    }
    .icon-pending {
      background: #e0f2fe;
      color: #0284c7;
    }
    .job-title {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .desc {
      font-size: 14px;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-portal {
      display: block;
      background: #b30000;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
    }
    .btn-apply-job {
      display: block;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #334155;
      text-decoration: none;
      font-weight: 600;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="status-card">
    <div class="header">
      <h1>SARKARI HITH</h1>
      <p>Government Recruitment &amp; Student Welfare Portal</p>
    </div>
    <div class="content">
      <div class="icon-circle ${isApplied ? 'icon-applied' : 'icon-pending'}">
        ${isApplied
          ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
        }
      </div>

      <div class="job-title">
        ${escapeHtml(track.jobTitle || 'Government Recruitment Post')}
      </div>

      ${isApplied ? `
        <div style="display: inline-block; background: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase;">
          Application Recorded
        </div>
        <p class="desc">
          You marked that you have submitted your online application for this post. <strong>Daily deadline reminders for this job have been stopped.</strong><br><br>
          Best wishes from Sarkari Hith for your upcoming exam and final selection!
        </p>
      ` : `
        <div style="display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase;">
          Reminder Active
        </div>
        <p class="desc">
          Your reminder is active. We will send you tomorrow's daily update with the remaining days.<br><br>
          Don't forget to submit your application before <strong>${escapeHtml(track.lastDateFormatted || 'the closing deadline')}</strong>.
        </p>
      `}

      <div class="actions">
        ${safeHttpUrl(track.link) ? `
          <a href="${escapeHtml(safeHttpUrl(track.link))}" target="_blank" rel="noopener noreferrer" class="btn-apply-job">
            Open Official Form Page &rarr;
          </a>
        ` : ''}
        <a href="${escapeHtml(safeHttpUrl(portalUrl, '/'))}" class="btn-portal">
          Return to Sarkari Hith Portal
        </a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  getSubscribers,
  saveSubscribers,
  subscribeUser,
  unsubscribeUser,
  matchJobsForSubscriber,
  sendJobAlertEmail,
  sendTestNotification,
  dispatchAllNotifications,
  getEmailLogs,
  getTrackedJobs,
  saveTrackedJobs,
  trackJob,
  updateJobApplicationStatus,
  sendDailyJobReminders,
  calculateDaysLeft,
  renderStatusPageHtml
};
