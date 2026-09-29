/**
 * One-Click Bulk Data Importer: JSON -> Google Sheets
 * 
 * Uploads all scraped portal data into respective Google Sheet tabs:
 * - LatestJobs
 * - Results
 * - AdmitCards
 * - AnswerKeys
 * - Syllabus
 * - Admissions
 * - Certificates
 * - Trending
 * 
 * Run with: node src/services/pushAllDataToSheet.js
 */

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

const { batchUploadAllDataToSheet, isGoogleSheetEnabled } = require('./googleSheetService');

async function main() {
  console.log('='.repeat(70));
  console.log(' SARKARI HITH - BULK UPLOAD TO GOOGLE SHEETS');
  console.log('='.repeat(70));

  if (!isGoogleSheetEnabled()) {
    console.error('ERROR: GOOGLE_SHEET_WEBAPP_URL is missing in backend/.env');
    process.exit(1);
  }

  console.log('Uploading all jobs, results, admit cards, syllabus, answer keys...');
  try {
    const res = await batchUploadAllDataToSheet();
    console.log('\nSUCCESS!', res.message || 'All portal categories uploaded to Google Sheets!');
    console.log('Check your Google Sheet tabs now:');
    console.log('- LatestJobs');
    console.log('- Results');
    console.log('- AdmitCards');
    console.log('- AnswerKeys');
    console.log('- Syllabus');
    console.log('- Admissions');
    console.log('- Certificates');
    console.log('- Trending\n');
  } catch (err) {
    console.error('Upload failed:', err.message);
  }
}

main();
