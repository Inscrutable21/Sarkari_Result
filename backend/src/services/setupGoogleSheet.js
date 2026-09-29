/**
 * Google Sheet Setup Guide & Script Generator
 * Run: node src/services/setupGoogleSheet.js
 */

const { getAppsScriptCode } = require('./googleSheetService');

console.log('='.repeat(70));
console.log(' SARKARI HITH - GOOGLE SHEETS LIVE DATABASE SETUP GUIDE');
console.log('='.repeat(70));
console.log(`
Follow these 4 simple steps to connect your Google Spreadsheet:

1. OPEN GOOGLE SHEETS:
   Create a new Google Sheet (or open an existing one) at:
   https://sheets.new

2. OPEN APPS SCRIPT:
   In the Google Sheet menu, click:
   "Extensions" -> "Apps Script"

3. PASTE THE CODE:
   Delete any existing code in the editor, and paste the script below:

---------------------------- [ APPS SCRIPT CODE START ] ----------------------------
${getAppsScriptCode()}
---------------------------- [ APPS SCRIPT CODE END ] ------------------------------

4. DEPLOY AS WEB APP:
   a. Click the blue "Deploy" button (top right) -> "New deployment".
   b. Click the gear icon next to "Select type" and choose "Web app".
   c. Set:
      - Description: Sarkari Live Database
      - Execute as: "Me" (your Google account)
      - Who has access: "Anyone"
   d. Click "Deploy" (grant permissions if prompted).
   e. Copy the "Web app URL" (it looks like: https://script.google.com/macros/s/AKfycb.../exec).

5. SAVE IN YOUR .ENV:
   Open "backend/.env" and add this line:
   GOOGLE_SHEET_WEBAPP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec

DONE!
Once saved in .env:
- New subscribers on your website will appear in your "Subscribers" sheet tab.
- Tracked jobs will appear in "TrackedJobs" tab.
- Any job you type in the "Jobs" tab will sync to your portal and email notifications!
`);
