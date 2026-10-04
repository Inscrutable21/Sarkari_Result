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
  revokeAllAdminSessions,
  verifySessionToken,
  fetchSubscribersStatus,
  sendIndividualSubscriberReminder,
  dispatchAllPendingReminders,
  deleteSubscriberRecord,
  clearAllSubscribersRecords,
  sendAdminTestNotification
} from './api.js';

// State
let activeToken = '';
let activeAdminKey = '';
let sessionData = null;
let countdownInterval = null;
let scrapeTimerInterval = null;
let schedulerCountdownInterval = null;
let currentSubscribersData = null;
let currentFilter = 'all';
let searchQuery = '';

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
  const adminUser = document.getElementById('session-admin-user');
  const adminRole = document.getElementById('session-admin-role');
  const adminPerms = document.getElementById('session-admin-permissions');
  const countdownEl = document.getElementById('session-expires-countdown');

  if (adminUser) {
    adminUser.textContent = session?.username || session?.admin?.username || 'Master Administrator';
  }

  const role = session?.role || session?.admin?.role || 'superadmin';
  const perms = session?.permissions || session?.admin?.permissions || ['*'];

  if (adminRole) {
    adminRole.textContent = role === 'superadmin' ? 'Superadmin (Full Access)' : (role.toUpperCase() + ' (Restricted)');
  }
  if (adminPerms) {
    adminPerms.textContent = Array.isArray(perms) && perms.includes('*') 
      ? 'All Administrative Capabilities (*)' 
      : (Array.isArray(perms) ? perms.join(', ') : 'Default Capabilities');
  }

  // Start live expiration countdown
  clearInterval(countdownInterval);
  const expiresAt = session?.expiresAt || (Date.now() + 12 * 3600 * 1000);
  function tickCountdown() {
    if (!countdownEl) return;
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      countdownEl.textContent = 'Session Expired';
      countdownEl.style.color = '#ef4444';
      clearInterval(countdownInterval);
      showToast('Admin session has expired. Please re-authenticate.', 'error');
      logout();
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

// Live Real-Time Countdown to the Next 6:00 PM IST Batch
function startSchedulerCountdown() {
  clearInterval(schedulerCountdownInterval);

  function tickScheduler() {
    const hoursEl = document.getElementById('cd-hours');
    const minsEl = document.getElementById('cd-mins');
    const secsEl = document.getElementById('cd-secs');
    const triggerTextEl = document.getElementById('scheduler-next-trigger-text');
    if (!hoursEl || !minsEl || !secsEl) return;

    try {
      const now = new Date();
      // Format current time in Asia/Kolkata timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const getVal = (t) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
      const curHour = getVal('hour');
      const curMin = getVal('minute');
      const curSec = getVal('second');

      const curTotalSecs = curHour * 3600 + curMin * 60 + curSec;
      const targetHour = 18; // 6:00 PM IST
      const targetTotalSecs = targetHour * 3600;

      let diffSecs = 0;
      if (curTotalSecs < targetTotalSecs) {
        // Earlier today before 6:00 PM IST
        diffSecs = targetTotalSecs - curTotalSecs;
        if (triggerTextEl) triggerTextEl.textContent = 'Today, 6:00 PM IST';
      } else {
        // Past 6:00 PM IST, target is tomorrow 6:00 PM IST
        diffSecs = (24 * 3600 - curTotalSecs) + targetTotalSecs;
        if (triggerTextEl) triggerTextEl.textContent = 'Tomorrow, 6:00 PM IST';
      }

      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;

      hoursEl.textContent = String(h).padStart(2, '0');
      minsEl.textContent = String(m).padStart(2, '0');
      secsEl.textContent = String(s).padStart(2, '0');
    } catch {
      hoursEl.textContent = '--';
      minsEl.textContent = '--';
      secsEl.textContent = '--';
    }
  }

  tickScheduler();
  schedulerCountdownInterval = setInterval(tickScheduler, 1000);
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
  startSchedulerCountdown();
  loadTelemetry();
  loadSubscribersMonitor();
}

function logout() {
  activeToken = '';
  activeAdminKey = '';
  sessionData = null;
  clearInterval(countdownInterval);
  clearInterval(schedulerCountdownInterval);

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

// Emergency Session Revocation (Requires Master Key confirmation)
async function handleRevokeAll() {
  const masterKey = prompt('SECURITY VERIFICATION:\nPlease enter the Master Authorization Key to confirm revoking ALL active sessions across all devices:');
  if (!masterKey || !masterKey.trim()) {
    showToast('Revocation cancelled: Master Authorization Key is required', 'info');
    return;
  }

  try {
    logTerminal('Emergency revocation triggered: Verifying Master Key and revoking sessions...', 'warn');
    const result = await revokeAllAdminSessions(masterKey.trim());
    logTerminal(`Emergency revocation complete: ${result.message || 'All sessions revoked.'}`, 'info');
    showToast('All active sessions revoked successfully', 'info');
    logout();
  } catch (err) {
    logTerminal(`Revocation failed: ${err.message}`, 'error');
    showToast(`Revocation failed: ${err.message}`, 'error');
  }
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
    loadSubscribersMonitor();
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

// Helper to generate initials from name
function getInitials(name) {
  if (!name) return 'CA';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Load Subscriber Directory & 6:00 PM Dispatch Status
async function loadSubscribersMonitor() {
  const tableBody = document.getElementById('subscribers-table-body');
  try {
    const data = await fetchSubscribersStatus(activeToken || activeAdminKey);
    currentSubscribersData = data;

    const summary = data.summary || {};
    const items = data.items || [];

    // Update Badges
    const dateEl = document.getElementById('subscribers-today-date');
    const statTotal = document.getElementById('sub-stat-total');
    const statPending = document.getElementById('sub-stat-pending');
    const statSent = document.getElementById('sub-stat-sent');
    const statApplied = document.getElementById('sub-stat-applied');

    if (dateEl) dateEl.textContent = summary.todayDate || new Date().toISOString().split('T')[0];
    if (statTotal) statTotal.textContent = summary.totalRecipients ?? items.length;
    if (statPending) statPending.textContent = summary.pendingCount ?? 0;
    if (statSent) statSent.textContent = summary.sentTodayCount ?? 0;
    if (statApplied) statApplied.textContent = summary.appliedCount ?? 0;

    // Update 6th Stat Card: 6 PM Batch Today
    const statBatchToday = document.getElementById('stat-count-batch-today');
    if (statBatchToday) {
      statBatchToday.textContent = `${summary.sentTodayCount ?? 0} Sent`;
    }

    // Update Scheduler Hero Widget Today's Badge
    const schedulerTodayBadge = document.getElementById('scheduler-today-status-badge');
    if (schedulerTodayBadge) {
      if ((summary.sentTodayCount || 0) > 0) {
        schedulerTodayBadge.textContent = `✓ Completed (${summary.sentTodayCount} Dispatched)`;
        schedulerTodayBadge.style.color = '#34d399';
      } else {
        schedulerTodayBadge.textContent = `⏳ ${summary.pendingCount || 0} Pending (6:00 PM Batch)`;
        schedulerTodayBadge.style.color = '#fbbf24';
      }
    }

    // Update Filter counts
    const fAll = document.getElementById('filter-count-all');
    const fPending = document.getElementById('filter-count-pending');
    const fSent = document.getElementById('filter-count-sent');
    const fApplied = document.getElementById('filter-count-applied');
    const fUptodate = document.getElementById('filter-count-uptodate');

    if (fAll) fAll.textContent = items.length;
    if (fPending) fPending.textContent = summary.pendingCount ?? 0;
    if (fSent) fSent.textContent = summary.sentTodayCount ?? 0;
    if (fApplied) fApplied.textContent = summary.appliedCount ?? 0;
    if (fUptodate) fUptodate.textContent = items.filter(i => i.status === 'up_to_date').length;

    renderSubscribersTable();
  } catch (err) {
    console.warn('[Subscribers Monitor Error]:', err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: #f87171; padding: 2rem;">
            Failed to load subscriber reminder status: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }
}

// Render Subscriber Directory Table with Live Search and Avatars
function renderSubscribersTable() {
  const tableBody = document.getElementById('subscribers-table-body');
  if (!tableBody || !currentSubscribersData) return;

  const items = currentSubscribersData.items || [];
  const filtered = items.filter(item => {
    // 1. Status Filter Pill Match
    let statusMatch = true;
    if (currentFilter === 'pending') statusMatch = item.status === 'pending';
    else if (currentFilter === 'sent_today') statusMatch = item.status === 'sent_today';
    else if (currentFilter === 'applied') statusMatch = item.status === 'applied';
    else if (currentFilter === 'up_to_date') statusMatch = item.status === 'up_to_date';

    if (!statusMatch) return false;

    // 2. Search Query Match
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const name = (item.name || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      const job = (item.jobTitle || '').toLowerCase();
      const org = (item.organization || '').toLowerCase();
      return name.includes(q) || email.includes(q) || job.includes(q) || org.includes(q);
    }

    return true;
  });

  if (filtered.length === 0) {
    const emptyNotice = searchQuery
      ? `No candidates match "${escapeHtml(searchQuery)}" in "${escapeHtml(currentFilter)}" filter.`
      : `No candidates or subscribers found in "${escapeHtml(currentFilter)}" view.`;
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="candidate-empty">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</div>
          <div>${emptyNotice}</div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(item => {
    const formattedDate = item.lastSentAt
      ? new Date(item.lastSentAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
      : '<span style="color: #64748b;">Never sent</span>';

    const statusLabel = item.status === 'sent_today' && item.lastSentAt
      ? `Sent Today (${new Date(item.lastSentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST)`
      : item.statusLabel;

    const deadlineNotice = item.daysLeft != null
      ? `<span class="candidate-deadline">⏳ ${item.daysLeft} days remaining</span>`
      : '';

    const actionHtml = item.canSendNow
      ? `<button type="button" class="admin-btn admin-btn-secondary btn-send-individual" data-id="${escapeHtml(item.id)}" data-email="${escapeHtml(item.email)}" >
           <span>📧 Send Now</span>
         </button>`
      : `<span style="font-size: 0.72rem; color: #64748b;">Suppressed</span>`;

    const deleteBtnHtml = `
      <button type="button" class="admin-btn admin-btn-secondary btn-delete-individual" data-id="${escapeHtml(item.id)}" data-email="${escapeHtml(item.email)}" aria-label="Delete subscriber record" title="Delete subscriber record">
        <span>🗑️</span>
      </button>
    `;

    const initials = getInitials(item.name);

    return `
      <tr>
        <td>
          <div class="candidate-identity">
            <div class="candidate-avatar">${escapeHtml(initials)}</div>
            <div class="candidate-contact">
              <div class="candidate-name">${escapeHtml(item.name || 'Candidate')}</div>
              <div class="candidate-meta">${escapeHtml(item.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="candidate-scope">
            ${escapeHtml(item.typeLabel)}
          </span>
        </td>
        <td>
          <div class="candidate-job-title" title="${escapeHtml(item.jobTitle)}">
            ${escapeHtml(item.jobTitle)}
          </div>
          <div class="candidate-meta">
            ${escapeHtml(item.organization)} • ${escapeHtml(item.lastDate)}
          </div>
          ${deadlineNotice}
        </td>
        <td>
          <span class="admin-status-badge ${item.statusBadge}" title="${escapeHtml(item.statusReason)}">
            ${escapeHtml(statusLabel)}
          </span>
          <div class="candidate-status-reason">
            ${escapeHtml(item.statusReason)}
          </div>
        </td>
        <td>
          <div class="candidate-last-sent">${formattedDate}</div>
          <div class="candidate-meta">Dispatches: ${item.reminderCount || 0}</div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div class="candidate-actions">
            ${actionHtml}
            ${deleteBtnHtml}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach individual send handlers
  tableBody.querySelectorAll('.btn-send-individual').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const email = btn.getAttribute('data-email');
      await handleSendSingleReminder(btn, id, email);
    });
  });

  // Attach individual delete handlers
  tableBody.querySelectorAll('.btn-delete-individual').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const email = btn.getAttribute('data-email');
      await handleDeleteSingleSubscriber(id, email);
    });
  });
}

// Handle sending an individual reminder
async function handleSendSingleReminder(btn, id, email) {
  if (!confirm(`Dispatch immediate reminder/alert email to ${email}?`)) return;

  const originalHtml = btn.innerHTML;
  btn.setAttribute('disabled', 'true');
  btn.innerHTML = '<span>Sending...</span>';

  logTerminal(`Dispatching on-demand reminder to ${email}...`, 'info');
  try {
    const result = await sendIndividualSubscriberReminder(activeToken || activeAdminKey, { id, email });
    logTerminal(`Reminder delivered: ${result.message || 'Email sent successfully.'}`, 'success');
    showToast(`Dispatched to ${email}!`, 'success');
    await loadSubscribersMonitor();
  } catch (err) {
    logTerminal(`Reminder failed for ${email}: ${err.message}`, 'error');
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    btn.removeAttribute('disabled');
    btn.innerHTML = originalHtml;
  }
}

// Handle force dispatching all pending reminders
async function handleForceAllReminders() {
  const btn = document.getElementById('btn-force-all-reminders');
  if (!confirm('This will trigger the 6:00 PM Reminder & Alert Engine right now for all pending subscribers and tracked candidates. Continue?')) return;

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.setAttribute('disabled', 'true');
    btn.innerHTML = '<span>⏳ Dispatching All Pending...</span>';
  }

  logTerminal('Forcing immediate 6:00 PM dispatch run for all pending candidates and subscribers...', 'warn');
  try {
    const result = await dispatchAllPendingReminders(activeToken || activeAdminKey);
    logTerminal(`Force dispatch complete: ${result.message || 'All pending reminders delivered.'}`, 'success');
    showToast('6:00 PM Reminder & Alert Engine executed successfully!', 'success');
    await loadSubscribersMonitor();
  } catch (err) {
    logTerminal(`Force dispatch failed: ${err.message}`, 'error');
    showToast(`Dispatch failed: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.innerHTML = originalHtml;
    }
  }
}

// Handle deleting an individual subscriber
async function handleDeleteSingleSubscriber(id, email) {
  if (!confirm(`Are you sure you want to permanently delete subscriber "${email}" from MongoDB Atlas?`)) return;

  logTerminal(`Deleting subscriber ${email}...`, 'warn');
  try {
    const result = await deleteSubscriberRecord(activeToken || activeAdminKey, { id, email });
    logTerminal(`Subscriber deleted: ${result.message || 'Record removed from cloud database.'}`, 'success');
    showToast(`Deleted ${email}`, 'info');
    await loadSubscribersMonitor();
  } catch (err) {
    logTerminal(`Deletion failed for ${email}: ${err.message}`, 'error');
    showToast(`Failed: ${err.message}`, 'error');
  }
}

// Handle clearing all subscribers
async function handleClearAllSubscribers() {
  if (!confirm('WARNING: Are you sure you want to delete ALL subscribers and tracked applications from MongoDB Atlas?')) return;

  logTerminal('Clearing all subscribers and tracked applications from MongoDB Atlas...', 'warn');
  try {
    const result = await clearAllSubscribersRecords(activeToken || activeAdminKey);
    logTerminal(`Database cleared: ${result.message || 'All subscriber records removed.'}`, 'success');
    showToast('All subscribers successfully deleted!', 'info');
    await loadSubscribersMonitor();
  } catch (err) {
    logTerminal(`Clear all failed: ${err.message}`, 'error');
    showToast(`Failed to clear: ${err.message}`, 'error');
  }
}

// Export all currently visible or loaded subscribers/candidates to CSV
function exportSubscribersToCsv() {
  if (!currentSubscribersData || !Array.isArray(currentSubscribersData.items) || currentSubscribersData.items.length === 0) {
    showToast('No candidate records available to export', 'warn');
    return;
  }

  const items = currentSubscribersData.items;
  const headers = ['ID', 'Candidate Name', 'Email', 'Type', 'Target Job Title', 'Organization', 'Deadline', 'Days Remaining', '6 PM Status', 'Last Sent Date', 'Total Dispatches'];

  const rows = items.map(i => [
    i.id || '',
    `"${(i.name || '').replace(/"/g, '""')}"`,
    `"${(i.email || '').replace(/"/g, '""')}"`,
    `"${(i.typeLabel || '').replace(/"/g, '""')}"`,
    `"${(i.jobTitle || '').replace(/"/g, '""')}"`,
    `"${(i.organization || '').replace(/"/g, '""')}"`,
    `"${(i.lastDate || '').replace(/"/g, '""')}"`,
    i.daysLeft !== null ? i.daysLeft : '',
    `"${(i.statusLabel || '').replace(/"/g, '""')}"`,
    `"${(i.lastSentAt || '').replace(/"/g, '""')}"`,
    i.reminderCount || 0
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `sarkari_hith_candidates_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Candidates exported to CSV successfully', 'success');
}

// Handle dispatching on-demand test email
async function handleSendTestEmail(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('test-email-input');
  const btn = document.getElementById('btn-send-test-email');
  const email = (input?.value || '').trim();

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid recipient email', 'warn');
    input?.focus();
    return;
  }

  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.setAttribute('disabled', 'true');
    btn.textContent = 'Sending...';
  }

  logTerminal(`Sending test alert email notification to ${email}...`, 'info');
  try {
    const result = await sendAdminTestNotification(activeToken || activeAdminKey, { email });
    logTerminal(`Test email sent successfully: ${result.message || 'Delivered to ' + email}`, 'success');
    showToast(`Test email delivered to ${email}!`, 'success');
    if (input) input.value = '';
    loadSubscribersMonitor();
  } catch (err) {
    logTerminal(`Test email delivery failed: ${err.message}`, 'error');
    showToast(`Test failed: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.textContent = originalText;
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

  // Session Security & Logout Controls
  document.getElementById('btn-quick-lock')?.addEventListener('click', logout);
  document.getElementById('btn-revoke-all-sessions')?.addEventListener('click', handleRevokeAll);
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
  document.getElementById('btn-hero-force-reminders')?.addEventListener('click', handleForceAllReminders);

  // Quick Test Email Form
  document.getElementById('admin-test-email-form')?.addEventListener('submit', handleSendTestEmail);

  // Subscriber Directory & 6:00 PM Monitor Controls
  document.getElementById('btn-refresh-subscribers')?.addEventListener('click', () => {
    loadSubscribersMonitor();
    showToast('Subscriber directory refreshed', 'info');
  });

  document.getElementById('btn-force-all-reminders')?.addEventListener('click', handleForceAllReminders);
  document.getElementById('btn-clear-all-subscribers')?.addEventListener('click', handleClearAllSubscribers);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportSubscribersToCsv);

  // Live Candidate Search Input & Clear
  const searchInput = document.getElementById('subscribers-search-input');
  const clearSearchBtn = document.getElementById('btn-clear-search');

  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (clearSearchBtn) {
      clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
    }
    renderSubscribersTable();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderSubscribersTable();
    searchInput?.focus();
  });

  // Filter Pills
  document.querySelectorAll('.admin-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.admin-filter-pill').forEach(p => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      currentFilter = pill.getAttribute('data-filter') || 'all';
      renderSubscribersTable();
    });
  });
}

// Guarantee execution whether script runs before or after DOM readiness
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}

