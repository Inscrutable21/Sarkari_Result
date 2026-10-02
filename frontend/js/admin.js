/**
 * Admin Control Center Logic for Sarkari Hith
 * Coordinates live scraping, MongoDB Atlas telemetry, and system maintenance.
 */

import {
  triggerLiveScrape,
  fetchMongoStatus,
  verifyAdminKey,
  fetchPostingDetails,
  triggerDailyReminders
} from './api.js';

// DOM Elements
const loginView = document.getElementById('admin-login-view');
const dashboardView = document.getElementById('admin-dashboard-view');
const loginForm = document.getElementById('admin-login-form');
const keyInput = document.getElementById('admin-key-input');
const rememberCheckbox = document.getElementById('admin-remember-session');
const toggleKeyBtn = document.getElementById('btn-toggle-login-key');
const loginErrorBanner = document.getElementById('admin-login-error');
const logoutBtn = document.getElementById('btn-admin-logout');

// Scraper Elements
const btnTriggerScrape = document.getElementById('btn-trigger-scrape');
const scraperStatusBadge = document.getElementById('scraper-status-badge');
const scraperProgressContainer = document.getElementById('scraper-progress-container');
const scraperProgressText = document.getElementById('scraper-progress-text');
const scraperTimer = document.getElementById('scraper-timer');
const terminalLogs = document.getElementById('admin-terminal-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const lastRunBox = document.getElementById('admin-last-run-box');
const lastRunDetails = document.getElementById('admin-last-run-details');

// Telemetry Elements
const statJobs = document.getElementById('stat-count-jobs');
const statResults = document.getElementById('stat-count-results');
const statAdmit = document.getElementById('stat-count-admit');
const statSubscribers = document.getElementById('stat-count-subscribers');
const statTracked = document.getElementById('stat-count-tracked');
const dbHealthStatus = document.getElementById('db-health-status');
const dbHealthPing = document.getElementById('db-health-ping');
const dbHealthName = document.getElementById('db-health-name');
const dbStatusText = document.getElementById('admin-db-status-text');
const btnRefreshTelemetry = document.getElementById('btn-refresh-telemetry');

// Utility Elements
const inspectorForm = document.getElementById('admin-inspector-form');
const inspectorUrlInput = document.getElementById('inspector-url-input');
const inspectorResultBox = document.getElementById('inspector-result-box');
const btnManualReminders = document.getElementById('btn-manual-reminders');

let activeAdminKey = '';
let scrapeTimerInterval = null;

// Terminal Log Helper
function logTerminal(message, type = 'info') {
  if (!terminalLogs) return;
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  let msgClass = 'log-msg-info';
  if (type === 'success') msgClass = 'log-msg-success';
  if (type === 'warn') msgClass = 'log-msg-warn';
  if (type === 'error') msgClass = 'log-msg-error';

  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="${msgClass}">${escapeHtml(message)}</span>
  `;
  terminalLogs.appendChild(entry);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('is-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Authentication Handlers
async function authenticate(key, remember = true) {
  try {
    if (loginErrorBanner) loginErrorBanner.style.display = 'none';
    const verifyBtn = document.getElementById('btn-unlock-admin');
    if (verifyBtn) {
      verifyBtn.setAttribute('disabled', 'true');
      verifyBtn.textContent = 'Verifying key...';
    }

    await verifyAdminKey(key);

    activeAdminKey = key;
    if (remember) {
      localStorage.setItem('sarkari_admin_key', key);
    } else {
      sessionStorage.setItem('sarkari_admin_key', key);
    }

    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';

    logTerminal('Administrator authenticated successfully.', 'success');
    loadTelemetry();
  } catch (err) {
    if (loginErrorBanner) {
      loginErrorBanner.textContent = err.message || 'Invalid Admin Key. Please verify your credentials.';
      loginErrorBanner.style.display = 'block';
    }
    showToast(err.message || 'Authentication failed', 'error');
  } finally {
    const verifyBtn = document.getElementById('btn-unlock-admin');
    if (verifyBtn) {
      verifyBtn.removeAttribute('disabled');
      verifyBtn.textContent = 'Unlock Admin Panel';
    }
  }
}

function logout() {
  activeAdminKey = '';
  localStorage.removeItem('sarkari_admin_key');
  sessionStorage.removeItem('sarkari_admin_key');
  dashboardView.style.display = 'none';
  loginView.style.display = 'block';
  logoutBtn.style.display = 'none';
  if (keyInput) keyInput.value = '';
}

// Telemetry & Stats Loader
async function loadTelemetry() {
  try {
    const status = await fetchMongoStatus();

    if (status && (status.connected || status.enabled)) {
      if (dbHealthStatus) dbHealthStatus.textContent = 'Connected (Live)';
      if (dbHealthPing) dbHealthPing.textContent = `${status.latencyMs || status.pingMs || 12} ms`;
      if (dbHealthName && status.dbName) dbHealthName.textContent = status.dbName;
      if (dbStatusText) dbStatusText.textContent = `MongoDB Atlas Live (${status.latencyMs || 12}ms)`;

      const counts = status.counts || {};
      if (statJobs) statJobs.textContent = counts.jobs ?? '--';
      if (statResults) statResults.textContent = counts.results ?? '--';
      if (statAdmit) statAdmit.textContent = counts.admitCards ?? '--';
      if (statSubscribers) statSubscribers.textContent = counts.subscribers ?? '--';
      if (statTracked) statTracked.textContent = counts.trackedJobs ?? '--';

      logTerminal(`Database telemetry updated: ${counts.jobs || 0} active jobs in cloud collections.`, 'info');
    } else {
      if (dbHealthStatus) dbHealthStatus.textContent = 'Connecting...';
      if (dbStatusText) dbStatusText.textContent = 'MongoDB Atlas Ready';
    }
  } catch (err) {
    console.warn('[Admin Telemetry]:', err);
    logTerminal(`Failed to update telemetry: ${err.message}`, 'warn');
  }
}

// Live Scraper Runner
async function runScraper() {
  if (!activeAdminKey) {
    showToast('Admin key missing. Please log in again.', 'error');
    logout();
    return;
  }

  btnTriggerScrape.setAttribute('disabled', 'true');
  btnTriggerScrape.innerHTML = '<span>⏳ Scraper Pipeline Running...</span>';
  scraperStatusBadge.textContent = 'RUNNING';
  scraperStatusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
  scraperStatusBadge.style.color = '#fbbf24';
  scraperStatusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';

  if (scraperProgressContainer) scraperProgressContainer.style.display = 'block';

  let seconds = 0;
  if (scraperTimer) scraperTimer.textContent = '00:00';
  clearInterval(scrapeTimerInterval);
  scrapeTimerInterval = setInterval(() => {
    seconds++;
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    if (scraperTimer) scraperTimer.textContent = `${m}:${s}`;
  }, 1000);

  // Rotating log steps
  const simulationSteps = [
    'Initiating SarkariResult crawler (homepage, latest jobs, results, admit cards, UPSC)...',
    'Extracting posting links and deduplicating recruitment listings...',
    'Fetching deep specs for featured institutions & state commissions...',
    'Categorizing by Sector (Banking, SSC, Railway, Police, Defense, Teaching)...',
    'Categorizing by State & Degree Disciplines (CS/IT, Civil, Mech, Law, Medical)...',
    'Filtering unfillable & expired application forms...',
    'Persisting all datasets directly into MongoDB Atlas cloud database...',
    'Evaluating candidate subscriber profiles and dispatching matching job alerts...'
  ];

  let stepIdx = 0;
  logTerminal(simulationSteps[0], 'info');
  if (scraperProgressText) scraperProgressText.textContent = simulationSteps[0];

  const logInterval = setInterval(() => {
    stepIdx = (stepIdx + 1) % simulationSteps.length;
    logTerminal(simulationSteps[stepIdx], 'info');
    if (scraperProgressText) scraperProgressText.textContent = simulationSteps[stepIdx];
  }, 2600);

  try {
    const result = await triggerLiveScrape(activeAdminKey);
    clearInterval(logInterval);
    clearInterval(scrapeTimerInterval);

    if (scraperProgressContainer) scraperProgressContainer.style.display = 'none';
    scraperStatusBadge.textContent = 'SUCCESS';
    scraperStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    scraperStatusBadge.style.color = '#34d399';
    scraperStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';

    const summary = result.summary || {};
    const cat = summary.categorySummary || {};
    const timeFormatted = new Date(summary.scrapedAt || Date.now()).toLocaleTimeString();

    logTerminal(`Pipeline completed successfully! Crawled & classified ${summary.totalItems || 'all'} records into MongoDB Atlas.`, 'success');

    if (lastRunBox && lastRunDetails) {
      lastRunDetails.innerHTML = `
        <div>• <strong>Total Records Crawled:</strong> ${summary.totalItems || 'All'}</div>
        <div>• <strong>Available Sectors:</strong> ${(cat.sectors || []).length} mapped</div>
        <div>• <strong>Degree Disciplines:</strong> ${(cat.disciplines || []).length} categories classified</div>
        <div>• <strong>Execution Duration:</strong> ${seconds} seconds</div>
        <div>• <strong>Completed At:</strong> ${timeFormatted}</div>
      `;
      lastRunBox.style.display = 'block';
    }

    showToast('Scraper completed successfully! MongoDB Atlas updated.', 'success');
    loadTelemetry();
  } catch (err) {
    clearInterval(logInterval);
    clearInterval(scrapeTimerInterval);

    if (scraperProgressContainer) scraperProgressContainer.style.display = 'none';
    scraperStatusBadge.textContent = 'FAILED';
    scraperStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
    scraperStatusBadge.style.color = '#f87171';
    scraperStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';

    logTerminal(`Scraper pipeline error: ${err.message}`, 'error');
    showToast(`Scraper error: ${err.message}`, 'error');
  } finally {
    btnTriggerScrape.removeAttribute('disabled');
    btnTriggerScrape.innerHTML = '<span>🚀 Run Full Scraper Pipeline</span>';
  }
}

// Single Posting Inspector Handler
async function inspectUrl(e) {
  e.preventDefault();
  const url = (inspectorUrlInput?.value || '').trim();
  if (!url) return;

  if (inspectorResultBox) {
    inspectorResultBox.textContent = `Scraping posting specs from:\n${url}\nPlease wait...`;
  }

  try {
    const res = await fetchPostingDetails(url);
    if (inspectorResultBox) {
      inspectorResultBox.textContent = JSON.stringify(res.data || res, null, 2);
    }
    logTerminal(`Inspected URL details for: ${url.substring(0, 50)}...`, 'info');
  } catch (err) {
    if (inspectorResultBox) {
      inspectorResultBox.textContent = `Error inspecting URL:\n${err.message}`;
    }
    logTerminal(`URL Inspection failed: ${err.message}`, 'warn');
  }
}

// Manual Daily Reminders Trigger
async function triggerReminders() {
  btnManualReminders.setAttribute('disabled', 'true');
  btnManualReminders.textContent = 'Dispatching reminders...';
  logTerminal('Triggering manual daily reminder engine for tracked candidates...', 'info');

  try {
    const result = await triggerDailyReminders();
    logTerminal(`Reminder engine complete: ${result.dispatched || 0} reminders sent (${result.skippedApplied || 0} already applied).`, 'success');
    showToast(`Dispatched ${result.dispatched || 0} daily reminders!`, 'success');
  } catch (err) {
    logTerminal(`Reminder engine error: ${err.message}`, 'error');
    showToast(`Failed to dispatch reminders: ${err.message}`, 'error');
  } finally {
    btnManualReminders.removeAttribute('disabled');
    btnManualReminders.textContent = '📬 Dispatch Daily Reminders Now';
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Check existing session
  const storedKey = localStorage.getItem('sarkari_admin_key') || sessionStorage.getItem('sarkari_admin_key');
  if (storedKey) {
    if (keyInput) keyInput.value = storedKey;
    authenticate(storedKey, Boolean(localStorage.getItem('sarkari_admin_key')));
  }

  // Toggle Password Visibility
  toggleKeyBtn?.addEventListener('click', () => {
    if (!keyInput) return;
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      toggleKeyBtn.textContent = '🔒';
    } else {
      keyInput.type = 'password';
      toggleKeyBtn.textContent = '👁️';
    }
  });

  // Login Form
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = (keyInput?.value || '').trim();
    const remember = rememberCheckbox ? rememberCheckbox.checked : true;
    if (!key) {
      showToast('Please enter your Admin Authorization Key', 'error');
      return;
    }
    authenticate(key, remember);
  });

  // Logout
  logoutBtn?.addEventListener('click', logout);

  // Scraper Trigger
  btnTriggerScrape?.addEventListener('click', runScraper);

  // Clear Logs
  btnClearLogs?.addEventListener('click', () => {
    if (terminalLogs) {
      terminalLogs.innerHTML = `
        <div class="log-entry">
          <span class="log-time">[System]</span>
          <span class="log-msg-info">Terminal logs cleared.</span>
        </div>
      `;
    }
  });

  // Refresh Telemetry
  btnRefreshTelemetry?.addEventListener('click', () => {
    loadTelemetry();
    showToast('Database telemetry refreshed', 'info');
  });

  // Inspector Form
  inspectorForm?.addEventListener('submit', inspectUrl);

  // Manual Reminders
  btnManualReminders?.addEventListener('click', triggerReminders);
});
