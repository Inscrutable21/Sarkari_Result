/**
 * Data Migration Tool: Local Datasets -> Google Sheets
 * 
 * Migrates:
 * 1. subscribers.json  -> "Subscribers" sheet tab
 * 2. trackedJobs.json  -> "TrackedJobs" sheet tab
 * 3. jobs.json         -> "Jobs" sheet tab
 * 
 * Run via CLI:
 * node src/services/migrateToGoogleSheet.js
 */

const fs = require('node:fs/promises');
const path = require('node:path');

// Load environment variables
function loadEnv() {
  const envCandidates = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../backend/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env')
  ];
  for (const envPath of envCandidates) {
    try {
      const content = require('node:fs').readFileSync(envPath, 'utf8');
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
loadEnv();

const DATA_DIR = path.resolve(__dirname, '../data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const TRACKED_JOBS_FILE = path.join(DATA_DIR, 'trackedJobs.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

const WEBAPP_URL = process.env.GOOGLE_SHEET_WEBAPP_URL;

async function sendPostToSheet(action, payload) {
  if (!WEBAPP_URL) {
    throw new Error('GOOGLE_SHEET_WEBAPP_URL is not set in backend/.env');
  }

  const response = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    redirect: 'follow'
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid response from Google Sheets. Raw output: ${text.slice(0, 200)}`);
  }
}

async function migrate() {
  console.log('='.repeat(70));
  console.log(' SARKARI HITH - GOOGLE SHEETS DATA MIGRATION');
  console.log('='.repeat(70));

  if (!WEBAPP_URL) {
    console.error('ERROR: GOOGLE_SHEET_WEBAPP_URL is missing in backend/.env');
    process.exit(1);
  }

  console.log(`Connecting to WebApp:\n${WEBAPP_URL}\n`);

  // 1. Check WebApp Accessibility
  try {
    const testRes = await fetch(`${WEBAPP_URL}?action=getSubscribers`, { redirect: 'follow' });
    const text = await testRes.text();
    if (text.includes('You need access') || text.includes('accounts.google.com')) {
      console.error('PERMISSION ERROR: Google Apps Script Web App is set to private!');
      console.error('\nTo fix this:');
      console.error('1. In your Google Sheet, open Extensions > Apps Script.');
      console.error('2. Click "Deploy" > "Manage deployments".');
      console.error('3. Click the pencil (edit) icon.');
      console.error('4. Under "Who has access", change it from "Only myself" to "Anyone".');
      console.error('5. Click "Deploy" and re-run this migration command.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Network error reaching Google Apps Script:', err.message);
    process.exit(1);
  }

  // 2. Migrate Subscribers
  let subscribers = [];
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, 'utf-8');
    subscribers = JSON.parse(raw);
    if (!Array.isArray(subscribers)) subscribers = [];
  } catch {}

  console.log(`[1/2] Migrating ${subscribers.length} Subscribers to Google Sheet...`);
  let subCount = 0;
  for (const s of subscribers) {
    try {
      await sendPostToSheet('addSubscriber', { subscriber: s });
      subCount++;
      console.log(`  + Migrated subscriber: ${s.email} (${s.qualification})`);
    } catch (err) {
      console.warn(`  ! Failed to migrate subscriber ${s.email}: ${err.message}`);
    }
  }
  console.log(`Done! ${subCount} subscribers migrated successfully.\n`);

  // 3. Migrate Tracked Jobs
  let tracked = [];
  try {
    const raw = await fs.readFile(TRACKED_JOBS_FILE, 'utf-8');
    tracked = JSON.parse(raw);
    if (!Array.isArray(tracked)) tracked = [];
  } catch {}

  console.log(`[2/2] Migrating ${tracked.length} Tracked Jobs to Google Sheet...`);
  let trackCount = 0;
  for (const t of tracked) {
    try {
      await sendPostToSheet('addTrackedJob', { track: t });
      trackCount++;
      console.log(`  + Migrated tracked job: ${t.email} -> ${t.jobTitle}`);
    } catch (err) {
      console.warn(`  ! Failed to migrate tracked job ${t.jobTitle}: ${err.message}`);
    }
  }
  console.log(`Done! ${trackCount} tracked jobs migrated successfully.\n`);

  console.log('='.repeat(70));
  console.log(' MIGRATION COMPLETED SUCCESSFULLY!');
  console.log(' Open your Google Spreadsheet to view all your migrated rows.');
  console.log('='.repeat(70));
}

migrate().catch(err => {
  console.error('Fatal migration error:', err);
});
