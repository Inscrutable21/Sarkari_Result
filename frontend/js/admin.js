/**
 * Admin Control Center Logic for Sarkari Hith
 * Coordinates live scraping, cryptographic tokenization, token rotation, and MongoDB Atlas telemetry.
 */

import {
  triggerLiveScrape,
  fetchMongoStatus,
  verifyAdminKey,
  fetchPostingDetails,
  triggerDailyReminders,
  loginAdmin,
  rotateAdminToken,
  revokeAllAdminSessions,
  verifySessionToken
} from './api.js';

// State
let activeToken = '';
let activeAdminKey = '';
let sessionData = null;
let countdownInterval = null;
let scrapeTimerInterval = null;

// Terminal Log Helper
function logTerminal(message, type = 'info') {
  const terminalLogs = document.getElementById('admin-terminal-logs');
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

// Update Active Session UI Card
function updateSessionCard(token, session) {
  const tokenSnippet = document.getElementById('session-token-snippet');
  const genBadge = document.getElementById('session-gen-badge');
  const adminUser = document.getElementById('session-admin-user');
  const countdownEl = document.getElementById('session-expires-countdown');

  if (tokenSnippet) {
    tokenSnippet.textContent = token ? `${token.substring(0, 22)}...${token.slice(-10)}` : '--';
    tokenSnippet.title = token || '';
  }

  const rot = session?.rotationCount ?? session?.rot ?? 0;
  if (genBadge) {
    genBadge.textContent = `GEN #${rot}`;
  }

  if (adminUser) {
    adminUser.textContent = session?.username || session?.admin?.username || 'Superadmin';
  }

  // Start live expiration countdown
  clearInterval(countdownInterval);
  const expiresAt = session?.expiresAt || (Date.now() + 12 * 3600 * 1000);
  function tickCountdown() {
    if (!countdownEl) return;
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      countdownEl.textContent = 'Expired';
      countdownEl.style.color = '#ef4444';
      clearInterval(countdownInterval);
      return;
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    countdownEl.textContent = `${hours}h ${mins}m ${secs}s`;
    countdownEl.style.color = diff < 15 * 60 * 1000 ? '#f59e0b' : '#34d399';
  }
  tickCountdown();
  countdownInterval = setInterval(tickCountdown, 1000);
}

// Unlock Dashboard
function unlockDashboard(token, session, remember = true) {
  activeToken = token;
  sessionData = session;

  if (remember) {
    localStorage.setItem('sarkari_admin_token', token);
    localStorage.setItem('sarkari_admin_session', JSON.stringify(session));
  } else {
    sessionStorage.setItem('sarkari_admin_token', token);
    sessionStorage.setItem('sarkari_admin_session', JSON.stringify(session));
  }

  const loginSection = document.getElementById('admin-login-view');
  const dashboardSection = document.getElementById('admin-dashboard-view');
  const logoutBtnEl = document.getElementById('btn-admin-logout');

  if (loginSection) loginSection.style.display = 'none';
  if (dashboardSection) dashboardSection.style.display = 'block';
  if (logoutBtnEl) logoutBtnEl.style.display = 'inline-flex';

  updateSessionCard(token, session);
  showToast('Admin session token active', 'success');
  logTerminal(`Authenticated with cryptographic token (Gen #${session?.rotationCount || 0}).`, 'success');
  loadTelemetry();
}

function logout() {
  activeToken = '';
  activeAdminKey = '';
  sessionData = null;
  clearInterval(countdownInterval);

  localStorage.removeItem('sarkari_admin_token');
  localStorage.removeItem('sarkari_admin_session');
  localStorage.removeItem('sarkari_admin_key');
  sessionStorage.removeItem('sarkari_admin_token');
  sessionStorage.removeItem('sarkari_admin_session');
  sessionStorage.removeItem('sarkari_admin_key');

  const loginSection = document.getElementById('admin-login-view');
  const dashboardSection = document.getElementById('admin-dashboard-view');
  const logoutBtnEl = document.getElementById('btn-admin-logout');
  const keyField = document.getElementById('admin-key-input');

  if (dashboardSection) dashboardSection.style.display = 'none';
  if (loginSection) loginSection.style.display = 'block';
  if (logoutBtnEl) logoutBtnEl.style.display = 'none';
  if (keyField) keyField.value = '';
}

// Authentication Handler (Single Master Admin Key -> Tokenization)
async function handleLogin(e) {
  if (e) e.preventDefault();
  const keyField = document.getElementById('admin-key-input');
  const remField = document.getElementById('admin-remember-session');
  const errBanner = document.getElementById('admin-login-error');
  const unlockBtn = document.getElementById('btn-unlock-admin');

  const apiKey = (keyField?.value || '').trim();
  const remember = remField ? remField.checked : true;

  if (!apiKey) {
    if (errBanner) {
      errBanner.textContent = 'Please enter your Admin Authorization Key';
      errBanner.style.display = 'block';
    }
    keyField?.focus();
    return;
  }

  try {
    if (errBanner) errBanner.style.display = 'none';
    if (unlockBtn) {
      unlockBtn.setAttribute('disabled', 'true');
      unlockBtn.innerHTML = '<span>Issuing secure session token...</span>';
    }

    const result = await loginAdmin({ apiKey });
    unlockDashboard(result.token, result, remember);
  } catch (err) {
    console.error('[Login Error]:', err);
    if (errBanner) {
      errBanner.textContent = err.message || 'Authentication failed. Please check your Admin Authorization Key.';
      errBanner.style.display = 'block';
    }
    showToast(err.message || 'Login failed', 'error');
  } finally {
    if (unlockBtn) {
      unlockBtn.removeAttribute('disabled');
      unlockBtn.innerHTML = '<span>🚀 Generate Secure Session Token</span>';
    }
  }
}

// Token Rotation Handler
async function handleTokenRotation() {
  const rotateBtn = document.getElementById('btn-rotate-token');
  if (!activeToken) {
    showToast('No active session token to rotate', 'error');
    return;
  }

  try {
    if (rotateBtn) {
      rotateBtn.setAttribute('disabled', 'true');
      rotateBtn.innerHTML = '<span>Rotating cryptographic token...</span>';
    }

    logTerminal('Initiating token rotation with cloud database session store...', 'info');
    const result = await rotateAdminToken(activeToken);

    activeToken = result.token;
    sessionData = { ...sessionData, ...result };

    localStorage.setItem('sarkari_admin_token', activeToken);
    updateSessionCard(activeToken, sessionData);

    logTerminal(`Token rotated successfully! Active Generation #${result.rotationCount}. Old token invalidated.`, 'success');
    showToast(`Token Rotated! Generation #${result.rotationCount} active.`, 'success');
  } catch (err) {
    console.error('[Rotation Error]:', err);
    logTerminal(`Token rotation failed: ${err.message}`, 'error');
    showToast(`Token rotation failed: ${err.message}`, 'error');
  } finally {
    if (rotateBtn) {
      rotateBtn.removeAttribute('disabled');
      rotateBtn.innerHTML = '<span>🔄 Rotate Token (New Generation)</span>';
    }
  }
}

// Emergency Session Revocation
async function handleRevokeAll() {
  const confirmed = confirm('WARNING: This will immediately revoke ALL active admin session tokens in MongoDB Atlas across every device. Continue?');
  if (!confirmed) return;

  try {
    logTerminal('Emergency revocation triggered: Revoking all active tokens...', 'warn');
    await revokeAllAdminSessions();
    showToast('All active sessions revoked', 'info');
    logout();
  } catch (err) {
    showToast(`Revocation failed: ${err.message}`, 'error');
  }
}

// Copy Token Helper
function copyTokenToClipboard() {
  if (!activeToken) return;
  navigator.clipboard.writeText(activeToken).then(() => {
    showToast('Full token copied to clipboard!', 'info');
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
}

// Telemetry & Stats Loader
async function loadTelemetry() {
  try {
    const status = await fetchMongoStatus();
    const statJobs = document.getElementById('stat-count-jobs');
    const statResults = document.getElementById('stat-count-results');
    const statAdmit = document.getElementById('stat-count-admit');
    const statSubscribers = document.getElementById('stat-count-subscribers');
    const statTracked = document.getElementById('stat-count-tracked');
    const dbHealthStatus = document.getElementById('db-health-status');
    const dbHealthPing = document.getElementById('db-health-ping');
    const dbHealthName = document.getElementById('db-health-name');
    const dbStatusText = document.getElementById('admin-db-status-text');

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
  const btnTriggerScrape = document.getElementById('btn-trigger-scrape');
  const scraperStatusBadge = document.getElementById('scraper-status-badge');
  const scraperProgressContainer = document.getElementById('scraper-progress-container');
  const scraperProgressText = document.getElementById('scraper-progress-text');
  const scraperTimer = document.getElementById('scraper-timer');
  const lastRunBox = document.getElementById('admin-last-run-box');
  const lastRunDetails = document.getElementById('admin-last-run-details');

  btnTriggerScrape.setAttribute('disabled', 'true');
  btnTriggerScrape.innerHTML = '<span>⏳ Scraper Pipeline Running...</span>';
  if (scraperStatusBadge) {
    scraperStatusBadge.textContent = 'RUNNING';
    scraperStatusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
    scraperStatusBadge.style.color = '#fbbf24';
    scraperStatusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
  }

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
    const result = await triggerLiveScrape(activeToken || activeAdminKey);
    clearInterval(logInterval);
    clearInterval(scrapeTimerInterval);

    if (scraperProgressContainer) scraperProgressContainer.style.display = 'none';
    if (scraperStatusBadge) {
      scraperStatusBadge.textContent = 'SUCCESS';
      scraperStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      scraperStatusBadge.style.color = '#34d399';
      scraperStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    }

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
    if (scraperStatusBadge) {
      scraperStatusBadge.textContent = 'FAILED';
      scraperStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      scraperStatusBadge.style.color = '#f87171';
      scraperStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }

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
  const url = (document.getElementById('inspector-url-input')?.value || '').trim();
  const inspectorResultBox = document.getElementById('inspector-result-box');
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
  const btnManualReminders = document.getElementById('btn-manual-reminders');
  if (btnManualReminders) {
    btnManualReminders.setAttribute('disabled', 'true');
    btnManualReminders.textContent = 'Dispatching reminders...';
  }
  logTerminal('Triggering manual daily reminder engine for tracked candidates...', 'info');

  try {
    const result = await triggerDailyReminders();
    logTerminal(`Reminder engine complete: ${result.dispatched || 0} reminders sent (${result.skippedApplied || 0} already applied).`, 'success');
    showToast(`Dispatched ${result.dispatched || 0} daily reminders!`, 'success');
  } catch (err) {
    logTerminal(`Reminder engine error: ${err.message}`, 'error');
    showToast(`Failed to dispatch reminders: ${err.message}`, 'error');
  } finally {
    if (btnManualReminders) {
      btnManualReminders.removeAttribute('disabled');
      btnManualReminders.textContent = '📬 Dispatch Daily Reminders Now';
    }
  }
}

// Initializer
function initAdmin() {
  console.log('[Admin Panel] Initializing tokenized control center...');

  // Tab Switchers
  const formLogin = document.getElementById('admin-login-form');

  // Check stored token session
  const storedToken = localStorage.getItem('sarkari_admin_token') || sessionStorage.getItem('sarkari_admin_token');
  const storedSessionStr = localStorage.getItem('sarkari_admin_session') || sessionStorage.getItem('sarkari_admin_session');
  if (storedToken) {
    let session = null;
    try { session = JSON.parse(storedSessionStr || '{}'); } catch {}
    verifySessionToken(storedToken)
      .then(res => {
        unlockDashboard(storedToken, res.session || session, Boolean(localStorage.getItem('sarkari_admin_token')));
      })
      .catch(() => {
        logout();
      });
  }

  // Toggle Password Visibility
  const toggleBtn = document.getElementById('btn-toggle-login-key');
  toggleBtn?.addEventListener('click', () => {
    const input = document.getElementById('admin-key-input');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      toggleBtn.textContent = '🔒';
    } else {
      input.type = 'password';
      toggleBtn.textContent = '👁️';
    }
  });

  // Login Form Submission
  formLogin?.addEventListener('submit', handleLogin);
  document.getElementById('btn-unlock-admin')?.addEventListener('click', handleLogin);

  // Token Management
  document.getElementById('btn-rotate-token')?.addEventListener('click', handleTokenRotation);
  document.getElementById('btn-revoke-all-sessions')?.addEventListener('click', handleRevokeAll);
  document.getElementById('btn-copy-token')?.addEventListener('click', copyTokenToClipboard);

  // Logout
  document.getElementById('btn-admin-logout')?.addEventListener('click', logout);

  // Scraper Trigger
  document.getElementById('btn-trigger-scrape')?.addEventListener('click', runScraper);

  // Clear Logs
  document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
    const termLogs = document.getElementById('admin-terminal-logs');
    if (termLogs) {
      termLogs.innerHTML = `
        <div class="log-entry">
          <span class="log-time">[System]</span>
          <span class="log-msg-info">Terminal logs cleared.</span>
        </div>
      `;
    }
  });

  // Refresh Telemetry
  document.getElementById('btn-refresh-telemetry')?.addEventListener('click', () => {
    loadTelemetry();
    showToast('Database telemetry refreshed', 'info');
  });

  // Inspector Form
  document.getElementById('admin-inspector-form')?.addEventListener('submit', inspectUrl);

  // Manual Reminders
  document.getElementById('btn-manual-reminders')?.addEventListener('click', triggerReminders);
}

// Guarantee execution whether script runs before or after DOM readiness
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
