/**
 * Google Sheet Integration Service (Comprehensive CMS Engine)
 * 
 * Supports two-way synchronization for:
 * 1. LatestJobs
 * 2. Results
 * 3. AdmitCards
 * 4. AnswerKeys
 * 5. Syllabus
 * 6. Admissions
 * 7. Certificates
 * 8. Trending
 * 9. Subscribers
 * 10. TrackedJobs
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.resolve(__dirname, '../data');
const ALL_DATA_FILE = path.join(DATA_DIR, 'allData.json');

// In-memory cache for ultra-fast response times
let cachedPortalData = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

/**
 * Checks if Google Sheets integration is enabled
 */
function isGoogleSheetEnabled() {
  return Boolean(process.env.GOOGLE_SHEET_WEBAPP_URL && process.env.GOOGLE_SHEET_WEBAPP_URL.startsWith('http'));
}

/**
 * Neutralizes Formula / CSV injection in Google Sheets
 * If a value begins with =, +, -, @, \t, or \r, prepend a single quote '
 */
function sanitizeSheetValue(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${val}`;
  }
  return val;
}

function sanitizeObjectForSheet(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      sanitized[k] = sanitizeSheetValue(v);
    } else if (Array.isArray(v)) {
      sanitized[k] = v.map(item => typeof item === 'string' ? sanitizeSheetValue(item) : item);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Executes a GET request against the Google Apps Script Web App
 */
async function callSheetGet(action, params = {}) {
  const url = new URL(process.env.GOOGLE_SHEET_WEBAPP_URL);
  url.searchParams.set('action', action);
  if (process.env.GOOGLE_SHEET_SECRET_KEY) {
    url.searchParams.set('secretKey', process.env.GOOGLE_SHEET_SECRET_KEY);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    redirect: 'follow'
  });

  const text = await response.text();
  try {
    const result = JSON.parse(text);
    if (result.success === false) {
      throw new Error(result.error || 'Google Sheets operation failed');
    }
    return result.data;
  } catch (err) {
    throw new Error(`Google Sheets parse error: ${err.message}. Output: ${text.slice(0, 150)}`);
  }
}

/**
 * Executes a POST request against the Google Apps Script Web App
 */
async function callSheetPost(action, payload = {}) {
  const url = new URL(process.env.GOOGLE_SHEET_WEBAPP_URL);

  const bodyData = {
    action,
    secretKey: process.env.GOOGLE_SHEET_SECRET_KEY || '',
    ...payload
  };

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(bodyData),
    redirect: 'follow'
  });

  const text = await response.text();
  try {
    const result = JSON.parse(text);
    if (result.success === false) {
      throw new Error(result.error || 'Google Sheets operation failed');
    }
    return result;
  } catch (err) {
    throw new Error(`Google Sheets POST error: ${err.message}. Output: ${text.slice(0, 150)}`);
  }
}

/**
 * Fetches all portal data across all categories from Google Sheet (with TTL caching)
 */
async function getAllPortalDataFromSheet(forceRefresh = false) {
  if (!isGoogleSheetEnabled()) return null;

  const now = Date.now();
  if (!forceRefresh && cachedPortalData && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedPortalData;
  }

  try {
    const data = await callSheetGet('getAllPortalData');
    if (data && typeof data === 'object') {
      cachedPortalData = data;
      lastCacheTime = now;
      return data;
    }
  } catch (err) {
    console.warn(`[Google Sheets] Could not fetch allPortalData: ${err.message}`);
  }
  return null;
}

/**
 * Fetches all jobs from the Google Sheet
 */
async function getJobsFromSheet() {
  if (!isGoogleSheetEnabled()) return null;
  try {
    const allData = await getAllPortalDataFromSheet();
    if (allData?.latestJobs && allData.latestJobs.length > 0) {
      return allData.latestJobs;
    }
    const rows = await callSheetGet('getCategory', { category: 'LatestJobs' });
    return rows || [];
  } catch (err) {
    console.warn(`[Google Sheets] Failed to fetch jobs: ${err.message}`);
    return null;
  }
}

/**
 * Appends or updates a subscriber in the Google Sheet "Subscribers" tab
 */
async function appendSubscriberToSheet(subscriber) {
  if (!isGoogleSheetEnabled()) return null;
  try {
    const sanitizedSubscriber = sanitizeObjectForSheet(subscriber);
    const res = await callSheetPost('addSubscriber', { subscriber: sanitizedSubscriber });
    console.log(`[Google Sheets] Subscriber recorded: ${subscriber.email}`);
    return res;
  } catch (err) {
    console.warn(`[Google Sheets] Failed to record subscriber: ${err.message}`);
    return null;
  }
}

/**
 * Fetches all subscribers from Google Sheet
 */
async function getSubscribersFromSheet() {
  if (!isGoogleSheetEnabled()) return null;
  try {
    return await callSheetGet('getSubscribers');
  } catch (err) {
    console.warn(`[Google Sheets] Failed to fetch subscribers: ${err.message}`);
    return null;
  }
}

/**
 * Appends a tracked job entry to the Google Sheet "TrackedJobs" tab
 */
async function appendTrackedJobToSheet(track) {
  if (!isGoogleSheetEnabled()) return null;
  try {
    const sanitizedTrack = sanitizeObjectForSheet(track);
    const res = await callSheetPost('addTrackedJob', { track: sanitizedTrack });
    console.log(`[Google Sheets] Tracked job recorded: ${track.email} -> ${track.jobTitle}`);
    return res;
  } catch (err) {
    console.warn(`[Google Sheets] Failed to record tracked job: ${err.message}`);
    return null;
  }
}

/**
 * Fetches all tracked jobs from Google Sheet
 */
async function getTrackedJobsFromSheet() {
  if (!isGoogleSheetEnabled()) return null;
  try {
    return await callSheetGet('getTrackedJobs');
  } catch (err) {
    console.warn(`[Google Sheets] Failed to fetch tracked jobs: ${err.message}`);
    return null;
  }
}

/**
 * Updates application status ("applied" or "pending") in the Google Sheet
 */
async function updateTrackedJobStatusInSheet(trackId, status) {
  if (!isGoogleSheetEnabled()) return null;
  try {
    const res = await callSheetPost('updateTrackedJobStatus', { trackId, status });
    console.log(`[Google Sheets] Status updated for trackId ${trackId}: ${status}`);
    return res;
  } catch (err) {
    console.warn(`[Google Sheets] Failed to update status in sheet: ${err.message}`);
    return null;
  }
}

/**
 * Uploads all local datasets (Jobs, Admit Cards, Results, etc.) into Google Sheet in one batch
 */
async function batchUploadAllDataToSheet() {
  if (!isGoogleSheetEnabled()) {
    throw new Error('GOOGLE_SHEET_WEBAPP_URL is not set in backend/.env');
  }

  const raw = await fs.readFile(ALL_DATA_FILE, 'utf-8');
  const all = JSON.parse(raw);

  const payload = {
    latestJobs: (all.latestJobs || []).map(j => ({
      id: j.id || '',
      title: j.title || '',
      organization: j.organization || '',
      sector: j.sector || '',
      state: j.state || '',
      qualification: j.qualification || '',
      disciplines: Array.isArray(j.eligibleDisciplines) ? j.eligibleDisciplines.join(', ') : '',
      lastDate: j.lastDateFormatted || j.lastDate || '',
      link: j.link || '',
      totalVacancies: j.details?.totalVacancies || '',
      active: j.isActive !== false ? 'true' : 'false'
    })),
    admitCards: (all.admitCards || []).map(a => ({
      id: a.id || '',
      title: a.title || '',
      organization: a.organization || '',
      link: a.link || '',
      active: a.isActive !== false ? 'true' : 'false'
    })),
    results: (all.results || []).map(r => ({
      id: r.id || '',
      title: r.title || '',
      organization: r.organization || '',
      link: r.link || '',
      active: r.isActive !== false ? 'true' : 'false'
    })),
    answerKeys: (all.answerKeys || []).map(k => ({
      id: k.id || '',
      title: k.title || '',
      organization: k.organization || '',
      link: k.link || '',
      active: 'true'
    })),
    syllabus: (all.syllabus || []).map(s => ({
      id: s.id || '',
      title: s.title || '',
      organization: s.organization || '',
      link: s.link || '',
      active: 'true'
    })),
    admissions: (all.admissions || []).map(ad => ({
      id: ad.id || '',
      title: ad.title || '',
      organization: ad.organization || '',
      lastDate: ad.lastDateFormatted || ad.lastDate || '',
      link: ad.link || '',
      active: 'true'
    })),
    certificates: (all.certificates || []).map(c => ({
      id: c.id || '',
      title: c.title || '',
      organization: c.organization || '',
      link: c.link || '',
      active: 'true'
    })),
    trending: (all.trending || []).map(t => ({
      id: t.id || '',
      title: t.title || '',
      link: t.link || '',
      tag: t.tag || 'Trending',
      category: t.section || 'General'
    }))
  };

  return await callSheetPost('batchImportAllPortalData', { datasets: payload });
}

/**
 * Generates the complete Google Apps Script code for the user to paste into their Google Sheet
 */
function getAppsScriptCode() {
  return `/**
 * SARKARI HITH - COMPLETE PORTAL DATABASE SCRIPT
 * Manages Jobs, Admit Cards, Results, Answer Keys, Syllabus, Admissions, Certificates, Trending, Subscribers, TrackedJobs
 */

const HEADERS_MAP = {
  LatestJobs: ['ID', 'Title', 'Organization', 'Sector', 'State', 'Qualification', 'Disciplines', 'LastDate', 'Link', 'Vacancies', 'Active'],
  AdmitCards: ['ID', 'Title', 'Organization', 'Link', 'Active'],
  Results: ['ID', 'Title', 'Organization', 'Link', 'Active'],
  AnswerKeys: ['ID', 'Title', 'Organization', 'Link', 'Active'],
  Syllabus: ['ID', 'Title', 'Organization', 'Link', 'Active'],
  Admissions: ['ID', 'Title', 'Organization', 'LastDate', 'Link', 'Active'],
  Certificates: ['ID', 'Title', 'Organization', 'Link', 'Active'],
  Trending: ['ID', 'Title', 'Link', 'Tag', 'Category'],
  Subscribers: ['ID', 'Email', 'Name', 'Qualification', 'Disciplines', 'State', 'Sector', 'SubscribedAt', 'Active'],
  TrackedJobs: ['ID', 'Email', 'Name', 'JobID', 'JobTitle', 'Deadline', 'Link', 'Applied', 'SubscribedAt', 'LastReminderSent']
};

const SECRET_KEY = "${process.env.GOOGLE_SHEET_SECRET_KEY || 'REPLACE_WITH_YOUR_SECRET_KEY'}";

function isAuthorized(e, bodyData) {
  const token = (e && e.parameter && e.parameter.secretKey) || (bodyData && bodyData.secretKey);
  return token === SECRET_KEY;
}

function doGet(e) {
  try {
    if (!isAuthorized(e)) {
      return jsonResponse({ success: false, error: '401 Unauthorized: Invalid or missing secret key' });
    }

    const action = e.parameter.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'getAllPortalData') {
      const data = {};
      const categories = ['LatestJobs', 'Results', 'AdmitCards', 'AnswerKeys', 'Syllabus', 'Admissions', 'Certificates', 'Trending'];
      categories.forEach(function(cat) {
        const sheet = ss.getSheetByName(cat);
        const camelKey = cat.charAt(0).toLowerCase() + cat.slice(1);
        data[camelKey] = sheet ? sheetToObjects(sheet) : [];
      });
      return jsonResponse({ success: true, data: data });
    }

    if (action === 'getCategory') {
      const cat = e.parameter.category || 'LatestJobs';
      const sheet = ss.getSheetByName(cat);
      const rows = sheet ? sheetToObjects(sheet) : [];
      return jsonResponse({ success: true, data: rows });
    }

    if (action === 'getSubscribers') {
      const sheet = getOrCreateSheet(ss, 'Subscribers', HEADERS_MAP.Subscribers);
      return jsonResponse({ success: true, data: sheetToObjects(sheet) });
    }

    if (action === 'getTrackedJobs') {
      const sheet = getOrCreateSheet(ss, 'TrackedJobs', HEADERS_MAP.TrackedJobs);
      return jsonResponse({ success: true, data: sheetToObjects(sheet) });
    }

    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!isAuthorized(e, data)) {
      return jsonResponse({ success: false, error: '401 Unauthorized: Invalid or missing secret key' });
    }

    const action = data.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Batch Import All Portal Data (Creates all tabs with rows in seconds)
    if (action === 'batchImportAllPortalData') {
      const ds = data.datasets || {};
      for (const catName in HEADERS_MAP) {
        const camel = catName.charAt(0).toLowerCase() + catName.slice(1);
        const items = ds[camel] || ds[catName];
        if (Array.isArray(items) && items.length > 0) {
          const headers = HEADERS_MAP[catName];
          const sheet = getOrCreateSheet(ss, catName, headers);
          
          // Clear old rows except header
          if (sheet.getLastRow() > 1) {
            sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
          }

          const rows = items.map(function(item) {
            return headers.map(function(h) {
              const val = item[h] !== undefined ? item[h] : item[h.charAt(0).toLowerCase() + h.slice(1)];
              return val !== undefined && val !== null ? String(val) : '';
            });
          });

          if (rows.length > 0) {
            sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
          }
        }
      }
      return jsonResponse({ success: true, message: 'All portal categories imported successfully' });
    }

    // 2. Add or Update Subscriber
    if (action === 'addSubscriber') {
      const s = data.subscriber;
      const sheet = getOrCreateSheet(ss, 'Subscribers', HEADERS_MAP.Subscribers);
      const email = (s.email || '').trim().toLowerCase();
      
      const values = sheet.getDataRange().getValues();
      let rowIdx = -1;
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][1]).toLowerCase() === email) {
          rowIdx = i + 1;
          break;
        }
      }

      const discStr = Array.isArray(s.disciplines) ? s.disciplines.join(', ') : (s.disciplines || 'all');
      const rowData = [s.id || '', email, s.name || '', s.qualification || 'all', discStr, s.state || 'all', s.sector || 'all', s.subscribedAt || new Date().toISOString(), 'true'];

      if (rowIdx !== -1) {
        sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }
      return jsonResponse({ success: true, message: 'Subscriber saved' });
    }

    // 3. Add or Update Tracked Job
    if (action === 'addTrackedJob') {
      const t = data.track;
      const sheet = getOrCreateSheet(ss, 'TrackedJobs', HEADERS_MAP.TrackedJobs);
      
      const values = sheet.getDataRange().getValues();
      let rowIdx = -1;
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(t.id) || (String(values[i][1]).toLowerCase() === String(t.email).toLowerCase() && String(values[i][3]) === String(t.jobId))) {
          rowIdx = i + 1;
          break;
        }
      }

      const rowData = [t.id || '', t.email || '', t.name || '', t.jobId || '', t.jobTitle || '', t.lastDateFormatted || t.lastDate || '', t.link || '', t.applied ? 'true' : 'false', t.subscribedAt || new Date().toISOString(), t.lastReminderSentAt || ''];

      if (rowIdx !== -1) {
        sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }
      return jsonResponse({ success: true, message: 'Tracked job saved' });
    }

    // 4. Update Status (Applied / Pending)
    if (action === 'updateTrackedJobStatus') {
      const trackId = data.trackId;
      const status = data.status;
      const sheet = getOrCreateSheet(ss, 'TrackedJobs', HEADERS_MAP.TrackedJobs);
      
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(trackId)) {
          sheet.getRange(i + 1, 8).setValue(status === 'applied' ? 'true' : 'false');
          return jsonResponse({ success: true, message: 'Status updated' });
        }
      }
      return jsonResponse({ success: false, error: 'Track ID not found' });
    }

    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  const list = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0] && !row[1]) continue;
    const obj = {};
    headers.forEach((h, colIdx) => {
      obj[h.charAt(0).toLowerCase() + h.slice(1)] = row[colIdx];
    });
    list.push(obj);
  }
  return list;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

module.exports = {
  isGoogleSheetEnabled,
  getAllPortalDataFromSheet,
  getJobsFromSheet,
  appendSubscriberToSheet,
  getSubscribersFromSheet,
  appendTrackedJobToSheet,
  getTrackedJobsFromSheet,
  updateTrackedJobStatusInSheet,
  batchUploadAllDataToSheet,
  getAppsScriptCode
};
