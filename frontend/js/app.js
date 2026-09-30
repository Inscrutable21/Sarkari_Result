/**
 * Application Entry Point for Sarkari Result Portal
 */

import {
  fetchAllData,
  fetchCategories,
  subscribeToJobAlerts,
  sendTestJobAlert,
  trackJobOpening,
  fetchTrackedJobs,
  updateTrackedJobStatus,
  trackAnalyticsEvent
} from './api.js';
import {
  state,
  subscribe,
  setFilters,
  resetFilters,
  setTheme
} from './state.js';
import {
  renderTicker,
  renderSectorChips,
  populateDropdowns,
  renderTrendingGrid,
  renderMatrix,
  renderSecondaryGrid,
  openModal,
  closeModal,
  openAlertsModal,
  closeAlertsModal,
  openTrackJobModal,
  closeTrackJobModal,
  openMyTrackedModal,
  closeMyTrackedModal,
  renderTrackedJobsList,
  showToast,
  updateDegreeScopePills,
  escapeHtml
} from './components.js';

// DOM Element References
const tickerContainer = document.getElementById('ticker-content');
const sectorChipsContainer = document.getElementById('sector-chips-container');
const stateSelect = document.getElementById('filter-state');
const qualSelect = document.getElementById('filter-qualification');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const resetFiltersBtn = document.getElementById('btn-reset-filters');
const themeToggleBtn = document.getElementById('btn-theme-toggle');
const trendingContainer = document.getElementById('trending-container');
const resultsContainer = document.getElementById('matrix-results-list');
const admitCardsContainer = document.getElementById('matrix-admitcards-list');
const jobsContainer = document.getElementById('matrix-jobs-list');
const secondaryGridContainer = document.getElementById('secondary-grid-container');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalOverlay = document.getElementById('item-detail-modal');

// Job Alert Notification DOM References
const btnOpenAlerts = document.getElementById('btn-open-alerts');
const btnBannerSubscribe = document.getElementById('btn-banner-subscribe');
const alertsModalCloseBtn = document.getElementById('alerts-modal-close-btn');
const alertsModalOverlay = document.getElementById('job-alerts-modal');
const alertsForm = document.getElementById('alerts-subscription-form');
const btnTestAlert = document.getElementById('btn-test-alert');
const alertsStatusMsg = document.getElementById('alerts-modal-status-msg');

const ALERT_DISCIPLINES = [
  { id: 'all', label: 'All Degrees (Any Stream)' },
  { id: 'cs_it', label: 'Computer Science & IT' },
  { id: 'civil_eng', label: 'Civil Engineering' },
  { id: 'mech_eng', label: 'Mechanical Engineering' },
  { id: 'elec_eng', label: 'Electrical & ECE' },
  { id: 'any_bachelor', label: 'Any Bachelor Degree' },
  { id: 'commerce_finance', label: 'Commerce & Accounts' },
  { id: 'law_legal', label: 'Law & Legal (LLB)' },
  { id: 'science_agriculture', label: 'Science & Agri' },
  { id: 'medical_healthcare', label: 'Medical & Nursing' },
  { id: 'education_teaching', label: 'Teaching / B.Ed' },
  { id: 'matric_inter_10_12', label: '10th / 12th Pass' }
];

const alertSelectedDisciplines = new Set(['all']);

/**
 * Finds an item across all portal categories by its ID
 */
function findItemById(id) {
  const all = [
    ...state.data.trending,
    ...state.data.latestJobs,
    ...state.data.results,
    ...state.data.admitCards,
    ...state.data.answerKeys,
    ...state.data.syllabus,
    ...state.data.admissions,
    ...state.data.certificates,
    ...(state.data.important || [])
  ];
  return all.find(item => item.id === id);
}

/**
 * Re-renders all views whenever state changes
 */
function renderAll() {
  renderTrendingGrid(trendingContainer, state.data.trending);
  renderMatrix(resultsContainer, admitCardsContainer, jobsContainer, state.data);

  // Render secondary active tab
  const secondaryMap = {
    answerKeys: state.data.answerKeys,
    syllabus: state.data.syllabus,
    admissions: state.data.admissions,
    certificates: state.data.certificates
  };
  renderSecondaryGrid(secondaryGridContainer, secondaryMap[state.activeSecondaryTab] || []);

  // Update sector chips active state
  renderSectorChips(sectorChipsContainer, state.categories.sectors || [], state.filters.sector);

  // Update candidate degree opportunity scope pills
  updateDegreeScopePills();

  // Search clear button visibility
  if (searchClearBtn) {
    searchClearBtn.classList.toggle('is-visible', Boolean(state.filters.searchQuery));
  }

  // Update real-time alert match count preview if modal is active
  updateAlertMatchPreview();
}

/**
 * Renders the multi-select degree pills in the Job Alerts modal
 */
function renderAlertDisciplinePills() {
  const container = document.getElementById('alerts-discipline-pills');
  if (!container) return;

  container.innerHTML = ALERT_DISCIPLINES.map(d => {
    const isSel = alertSelectedDisciplines.has(d.id);
    return `
      <button type="button" class="alert-discipline-chip ${isSel ? 'is-selected' : ''}" data-id="${d.id}">
        <span>${d.label}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.alert-discipline-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.getAttribute('data-id');
      if (id === 'all') {
        alertSelectedDisciplines.clear();
        alertSelectedDisciplines.add('all');
      } else {
        alertSelectedDisciplines.delete('all');
        if (alertSelectedDisciplines.has(id)) {
          alertSelectedDisciplines.delete(id);
          if (alertSelectedDisciplines.size === 0) alertSelectedDisciplines.add('all');
        } else {
          alertSelectedDisciplines.add(id);
        }
      }
      renderAlertDisciplinePills();
      updateAlertMatchPreview();
    });
  });
}

/**
 * Calculates current matching opportunities for the chosen qualification & degree
 */
function updateAlertMatchPreview() {
  const qualSelectEl = document.getElementById('alerts-select-qualification');
  const stateSelectEl = document.getElementById('alerts-select-state');
  const sectorSelectEl = document.getElementById('alerts-select-sector');
  const countText = document.getElementById('alerts-match-count-text');
  const tagsContainer = document.getElementById('alerts-match-job-tags');
  if (!countText) return;

  const qual = qualSelectEl ? qualSelectEl.value : 'all';
  const stateVal = stateSelectEl ? stateSelectEl.value : 'all';
  const sectorVal = sectorSelectEl ? sectorSelectEl.value : 'all';
  const disciplines = Array.from(alertSelectedDisciplines);

  const allJobs = state.data.latestJobs || [];
  const todayIso = new Date().toISOString().split('T')[0];

  const matched = allJobs.filter(job => {
    if (job.isActive === false || job.isExpired === true) return false;
    if (job.lastDate && job.lastDate < todayIso) return false;

    if (!disciplines.includes('all')) {
      const eligible = job.eligibleDisciplines || [];
      const match = disciplines.some(d => eligible.includes(d));
      if (!match) return false;
    }

    if (qual !== 'all') {
      const jobQual = (job.qualification || '').toLowerCase();
      const target = qual.toLowerCase();
      const qualMatch = jobQual.includes(target) || target.includes(jobQual) || jobQual.includes('check notice');
      if (!qualMatch) return false;
    }

    if (stateVal !== 'all') {
      const jobState = (job.state || '').toLowerCase();
      if (!jobState.includes(stateVal.toLowerCase()) && !jobState.includes('central') && !jobState.includes('all india')) {
        return false;
      }
    }

    if (sectorVal !== 'all') {
      const jobSec = (job.sector || '').toLowerCase();
      if (!jobSec.includes(sectorVal.toLowerCase())) return false;
    }

    return true;
  });

  countText.textContent = `${matched.length} active government jobs currently match your alert profile!`;
  if (tagsContainer) {
    if (matched.length > 0) {
      tagsContainer.innerHTML = matched.slice(0, 4).map(j => `
        <span class="alerts-match-job-chip" title="${j.title}">
          ${j.organization || 'Govt'}: ${j.title}
        </span>
      `).join('');
    } else {
      tagsContainer.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No current active listings match all exact filters. You will be notified the instant a new vacancy is announced!</span>`;
    }
  }
}

/**
 * Syncs the page's current active degree filter into the modal when opening
 */
function handleOpenAlertsModal() {
  if (state.filters.discipline && state.filters.discipline !== 'all') {
    alertSelectedDisciplines.clear();
    alertSelectedDisciplines.add(state.filters.discipline);
  }
  if (state.filters.qualification && state.filters.qualification !== 'all') {
    const qualSelectEl = document.getElementById('alerts-select-qualification');
    if (qualSelectEl) {
      // Find matching option
      for (const opt of qualSelectEl.options) {
        if (opt.value.toLowerCase().includes(state.filters.qualification.toLowerCase())) {
          qualSelectEl.value = opt.value;
          break;
        }
      }
    }
  }
  if (state.filters.state && state.filters.state !== 'all') {
    const stateSelectEl = document.getElementById('alerts-select-state');
    if (stateSelectEl) {
      for (const opt of stateSelectEl.options) {
        if (opt.value.toLowerCase().includes(state.filters.state.toLowerCase())) {
          stateSelectEl.value = opt.value;
          break;
        }
      }
    }
  }

  renderAlertDisciplinePills();
  updateAlertMatchPreview();
  if (alertsStatusMsg) alertsStatusMsg.style.display = 'none';
  openAlertsModal();
}

/**
 * Initializes Portal Data from Backend
 */
async function loadPortalData(retryCount = 0) {
  try {
    const [allResult, catResult] = await Promise.all([
      fetchAllData(),
      fetchCategories()
    ]);

    state.data = {
      trending: [],
      latestJobs: [],
      results: [],
      admitCards: [],
      answerKeys: [],
      syllabus: [],
      admissions: [],
      certificates: [],
      important: [],
      ...(allResult || {})
    };
    state.categories = catResult?.data || catResult || {};

    renderTicker(tickerContainer, state.data.trending);
    populateDropdowns(stateSelect, qualSelect, state.categories);
    renderAll();
  } catch (error) {
    console.error('Failed to load initial data:', error);
    if (retryCount < 2) {
      setTimeout(() => loadPortalData(retryCount + 1), 1000);
    } else {
      showToast('Failed to load portal datasets. Start the backend and try again.', 'error');
    }
  }
}



/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  // 1. Debounced Search Input & Hero Search Button
  let debounceTimer;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = e.target.value;
      setFilters({ searchQuery: query });
      if (query && query.trim().length > 2) {
        trackAnalyticsEvent('search', { query: query.trim() });
      }
    }, 200);
  });

  const heroSearchBtn = document.getElementById('hero-search-btn');
  heroSearchBtn?.addEventListener('click', () => {
    if (searchInput) {
      setFilters({ searchQuery: searchInput.value.trim() });
      document.querySelector('.matrix-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Quick Category Tag Pills
  document.querySelectorAll('.quick-tag-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.getAttribute('data-query');
      if (query && searchInput) {
        searchInput.value = query;
        setFilters({ searchQuery: query });
        document.querySelectorAll('.quick-tag-pill').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        document.querySelector('.matrix-section')?.scrollIntoView({ behavior: 'smooth' });
        showToast(`Filtered by tag: ${query}`, 'info');
      }
    });
  });

  // View All Trending Button
  const viewAllTrendingBtn = document.getElementById('btn-view-all-trending');
  viewAllTrendingBtn?.addEventListener('click', () => {
    document.querySelector('.matrix-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Navigation Links Interaction
  document.querySelectorAll('.nav-tab-link, .dropdown-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const tabTarget = link.getAttribute('data-tab-target');
      if (tabTarget) {
        state.activeSecondaryTab = tabTarget;
        document.querySelectorAll('.tab-nav-item').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-tab') === tabTarget);
        });
        renderAll();
        document.querySelector('.secondary-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  searchClearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.quick-tag-pill').forEach(b => b.classList.remove('is-active'));
    setFilters({ searchQuery: '' });
    searchInput?.focus();
  });

  // 2. Sector Filter Chips (Event Delegation)
  sectorChipsContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sector-chip');
    if (btn) {
      const sector = btn.getAttribute('data-sector');
      setFilters({ sector });
    }
  });

  // 3. Dropdown Selectors
  const disciplineSelect = document.getElementById('filter-discipline');
  if (disciplineSelect && state.filters.degreeStream) {
    disciplineSelect.value = state.filters.degreeStream;
  }

  disciplineSelect?.addEventListener('change', (e) => {
    setFilters({ degreeStream: e.target.value, degreeScope: 'all' });
    const selectedText = e.target.options[e.target.selectedIndex]?.text;
    showToast(e.target.value === 'all' ? 'Showing all degrees' : `Filtered for: ${selectedText}`, 'info');
  });

  // Opportunity Scope Pills (All, Direct Field Match, General Degree)
  document.querySelectorAll('.scope-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = btn.getAttribute('data-scope');
      setFilters({ degreeScope: scope });
    });
  });

  stateSelect?.addEventListener('change', (e) => {
    setFilters({ state: e.target.value });
  });

  qualSelect?.addEventListener('change', (e) => {
    setFilters({ qualification: e.target.value });
  });

  // 4. Active Jobs Only Toggle
  const activeOnlyCheckbox = document.getElementById('filter-active-only');
  activeOnlyCheckbox?.addEventListener('change', (e) => {
    setFilters({ activeOnly: e.target.checked });
    showToast(e.target.checked ? 'Active jobs only (expired hidden)' : 'Showing all listings (including closed)', 'info');
  });

  // 5. Reset Filters Button
  resetFiltersBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.quick-tag-pill').forEach(b => b.classList.remove('is-active'));
    if (disciplineSelect) disciplineSelect.value = 'all';
    if (stateSelect) stateSelect.value = 'all';
    if (qualSelect) qualSelect.value = 'all';
    if (activeOnlyCheckbox) activeOnlyCheckbox.checked = true;
    resetFilters();
    showToast('Filters cleared', 'info');
  });

  // Quick Subscribe to Currently Selected Filters
  const btnQuickSubscribeFilters = document.getElementById('btn-quick-subscribe-filters');
  btnQuickSubscribeFilters?.addEventListener('click', () => {
    handleOpenAlertsModal();
  });

  // 6. Theme Toggle Button
  themeToggleBtn?.addEventListener('click', () => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  });

  // 7. Mobile Matrix Tabs Switching
  document.querySelectorAll('.matrix-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.matrix-tab-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      const targetCol = btn.getAttribute('data-target');
      document.querySelectorAll('.matrix-column').forEach(col => {
        col.classList.remove('is-mobile-active');
      });
      document.getElementById(`matrix-col-${targetCol}`)?.classList.add('is-mobile-active');
    });
  });

  // 8. Secondary Services Tabs Switching
  document.querySelectorAll('.tab-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-nav-item').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.activeSecondaryTab = btn.getAttribute('data-tab');
      renderAll();
    });
  });

  // 9. Card Click -> Open Detail Modal (Event Delegation)
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.trending-card, .matrix-item, .secondary-card');
    if (card && !e.target.closest('a')) {
      const id = card.getAttribute('data-id');
      if (id) {
        const item = findItemById(id);
        if (item) openModal(item);
      }
    }
  });

  // 10. Close Item Detail Modal
  modalCloseBtn?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // 11. Job Alerts Modal Triggers & Subscriptions
  btnOpenAlerts?.addEventListener('click', handleOpenAlertsModal);
  btnBannerSubscribe?.addEventListener('click', handleOpenAlertsModal);
  alertsModalCloseBtn?.addEventListener('click', closeAlertsModal);
  alertsModalOverlay?.addEventListener('click', (e) => {
    if (e.target === alertsModalOverlay) closeAlertsModal();
  });

  // Watch for qualification / state / sector changes in modal to recalculate live matches
  document.getElementById('alerts-select-qualification')?.addEventListener('change', updateAlertMatchPreview);
  document.getElementById('alerts-select-state')?.addEventListener('change', updateAlertMatchPreview);
  document.getElementById('alerts-select-sector')?.addEventListener('change', updateAlertMatchPreview);

  // Subscribe Form Submission
  alertsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('alerts-input-email')?.value.trim();
    const name = document.getElementById('alerts-input-name')?.value.trim();
    const qualification = document.getElementById('alerts-select-qualification')?.value;
    const disciplines = Array.from(alertSelectedDisciplines);
    const stateVal = document.getElementById('alerts-select-state')?.value;
    const sectorVal = document.getElementById('alerts-select-sector')?.value;

    if (!email) {
      showToast('Please enter your email address', 'error');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-subscription');
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) {
      submitBtn.setAttribute('disabled', 'true');
      submitBtn.innerHTML = '<span>Subscribing...</span>';
    }

    try {
      const res = await subscribeToJobAlerts({
        email,
        name,
        qualification,
        disciplines,
        state: stateVal,
        sector: sectorVal
      });

      if (alertsStatusMsg) {
        alertsStatusMsg.className = 'alerts-status-banner is-success';
        alertsStatusMsg.innerHTML = `<strong>${escapeHtml(res.message || 'Subscribed successfully!')}</strong><br>We will email you whenever new recruitments match your degree & qualifications.`;
        alertsStatusMsg.style.display = 'block';
      }

      showToast('Successfully subscribed to job alerts!', 'success');
      trackAnalyticsEvent('job_alerts_subscribed', { qualification, sector: sectorVal, state: stateVal });
    } catch (err) {
      console.error('Subscription error:', err);
      if (alertsStatusMsg) {
        alertsStatusMsg.className = 'alerts-status-banner is-error';
        alertsStatusMsg.textContent = err.message || 'Subscription failed. Please check connection.';
        alertsStatusMsg.style.display = 'block';
      }
      showToast(err.message || 'Subscription failed', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.removeAttribute('disabled');
        submitBtn.innerHTML = originalText;
      }
    }
  });

  // Send Instant Test Job Alert
  btnTestAlert?.addEventListener('click', async () => {
    const email = document.getElementById('alerts-input-email')?.value.trim();
    const name = document.getElementById('alerts-input-name')?.value.trim();
    const qualification = document.getElementById('alerts-select-qualification')?.value;
    const disciplines = Array.from(alertSelectedDisciplines);
    const stateVal = document.getElementById('alerts-select-state')?.value;
    const sectorVal = document.getElementById('alerts-select-sector')?.value;

    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address first', 'error');
      document.getElementById('alerts-input-email')?.focus();
      return;
    }

    const originalText = btnTestAlert.innerHTML;
    btnTestAlert.setAttribute('disabled', 'true');
    btnTestAlert.innerHTML = '<span>Sending Test Alert...</span>';

    try {
      const res = await sendTestJobAlert({
        email,
        name,
        qualification,
        disciplines,
        state: stateVal,
        sector: sectorVal
      });

      if (alertsStatusMsg) {
        alertsStatusMsg.className = 'alerts-status-banner is-success';
        const previewLink = res.data?.previewUrl
          ? `<br><a href="${res.data.previewUrl}" target="_blank" style="color: #15803d; text-decoration: underline; font-weight: 700; margin-top: 4px; display: inline-block;">View sent email preview online</a>`
          : '';
        alertsStatusMsg.innerHTML = `<strong>Test alert sent to ${escapeHtml(email)}!</strong><br>Matched <strong>${res.data?.matchedCount || 0} jobs</strong> matching your Degree & Qualification.${previewLink}`;
        alertsStatusMsg.style.display = 'block';
      }

      showToast(`Test alert dispatched to ${email}!`, 'success');
    } catch (err) {
      console.error('Test alert error:', err);
      if (alertsStatusMsg) {
        alertsStatusMsg.className = 'alerts-status-banner is-error';
        alertsStatusMsg.textContent = err.message || 'Failed to dispatch test alert.';
        alertsStatusMsg.style.display = 'block';
      }
      showToast(err.message || 'Failed to send test alert', 'error');
    } finally {
      btnTestAlert.removeAttribute('disabled');
      btnTestAlert.innerHTML = originalText;
    }
  });

  // --- Specific Job Tracking & Daily Deadline Reminders ---
  const trackJobForm = document.getElementById('track-job-form');
  const btnSubmitTrack = document.getElementById('btn-submit-track');
  const trackStatusMsg = document.getElementById('track-modal-status-msg');
  const trackModalCloseBtn = document.getElementById('track-modal-close-btn');
  const trackModalOverlay = document.getElementById('track-job-modal');

  const btnOpenTracked = document.getElementById('btn-open-tracked');
  const myTrackedModalCloseBtn = document.getElementById('my-tracked-modal-close-btn');
  const myTrackedModalOverlay = document.getElementById('my-tracked-modal');
  const btnLookupTracked = document.getElementById('btn-lookup-tracked');
  const trackedFilterEmail = document.getElementById('tracked-filter-email');
  const trackedJobsContainer = document.getElementById('tracked-jobs-list-container');

  // Open "My Tracked Jobs" Dashboard
  btnOpenTracked?.addEventListener('click', async () => {
    openMyTrackedModal();
    const savedEmail = localStorage.getItem('sr_user_email');
    if (savedEmail && trackedFilterEmail) {
      trackedFilterEmail.value = savedEmail;
      await loadUserTrackedJobs(savedEmail);
    }
  });

  // Load user's tracked jobs helper
  async function loadUserTrackedJobs(email) {
    if (!email || !trackedJobsContainer) return;
    trackedJobsContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-muted);">Loading your tracked recruitments...</p>';
    try {
      const list = await fetchTrackedJobs(email);
      renderTrackedJobsList(trackedJobsContainer, list);
    } catch (err) {
      trackedJobsContainer.innerHTML = `<p style="text-align: center; color: var(--primary-red); padding: 20px;">Failed to load tracked jobs: ${escapeHtml(err.message)}</p>`;
    }
  }

  btnLookupTracked?.addEventListener('click', () => {
    const email = trackedFilterEmail?.value.trim();
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    localStorage.setItem('sr_user_email', email);
    loadUserTrackedJobs(email);
  });

  // Toggle "I Have Applied" / "Reactivate" from Dashboard
  trackedJobsContainer?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-toggle-applied');
    if (!btn) return;
    const trackId = btn.getAttribute('data-track-id');
    const current = btn.getAttribute('data-current');
    const newStatus = current === 'applied' ? 'pending' : 'applied';

    btn.setAttribute('disabled', 'true');
    btn.textContent = 'Updating...';

    try {
      await updateTrackedJobStatus(trackId, newStatus);
      showToast(newStatus === 'applied' ? 'Marked as Applied! Reminders stopped.' : 'Reminders reactivated!', 'success');
      const email = trackedFilterEmail?.value.trim() || localStorage.getItem('sr_user_email');
      if (email) await loadUserTrackedJobs(email);
    } catch (err) {
      showToast(err.message || 'Status update failed', 'error');
      btn.removeAttribute('disabled');
    }
  });

  // Close tracking modals
  trackModalCloseBtn?.addEventListener('click', closeTrackJobModal);
  trackModalOverlay?.addEventListener('click', (e) => {
    if (e.target === trackModalOverlay) closeTrackJobModal();
  });

  myTrackedModalCloseBtn?.addEventListener('click', closeMyTrackedModal);
  myTrackedModalOverlay?.addEventListener('click', (e) => {
    if (e.target === myTrackedModalOverlay) closeMyTrackedModal();
  });

  // Submit Job Tracking Form
  trackJobForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('track-input-email')?.value.trim();
    const name = document.getElementById('track-input-name')?.value.trim();
    const jobId = document.getElementById('track-input-job-id')?.value;
    const link = document.getElementById('track-input-job-link')?.value;
    const lastDate = document.getElementById('track-input-job-last-date')?.value;
    const lastDateFormatted = document.getElementById('track-input-job-last-date-fmt')?.value;
    const jobTitle = document.getElementById('track-job-name')?.textContent;
    const organization = document.getElementById('track-job-org')?.textContent;

    if (!email) {
      showToast('Please enter your email address', 'error');
      return;
    }

    const originalText = btnSubmitTrack?.innerHTML;
    if (btnSubmitTrack) {
      btnSubmitTrack.setAttribute('disabled', 'true');
      btnSubmitTrack.innerHTML = '<span>Activating Reminders...</span>';
    }

    try {
      const res = await trackJobOpening({
        email,
        name,
        jobId,
        jobTitle,
        organization,
        lastDate,
        lastDateFormatted,
        link
      });

      // Save user identity in localStorage for convenience
      localStorage.setItem('sr_user_email', email);
      if (name) localStorage.setItem('sr_user_name', name);

      if (trackStatusMsg) {
        trackStatusMsg.className = 'alerts-status-banner is-success';
        trackStatusMsg.innerHTML = `<strong>${escapeHtml(res.message || 'Reminders activated!')}</strong><br>Check your inbox (${escapeHtml(email)}) for the confirmation email. We will send daily countdown alerts with days left.`;
        trackStatusMsg.style.display = 'block';
      }

      showToast(`Daily reminders set for ${jobTitle}!`, 'success');
      setTimeout(() => {
        closeTrackJobModal();
      }, 2600);
    } catch (err) {
      console.error('Job tracking error:', err);
      if (trackStatusMsg) {
        trackStatusMsg.className = 'alerts-status-banner is-error';
        trackStatusMsg.textContent = err.message || 'Failed to set reminders. Please try again.';
        trackStatusMsg.style.display = 'block';
      }
      showToast(err.message || 'Failed to activate reminders', 'error');
    } finally {
      if (btnSubmitTrack) {
        btnSubmitTrack.removeAttribute('disabled');
        btnSubmitTrack.innerHTML = originalText;
      }
    }
  });

  // Global trigger helper for Remind Me buttons
  window.triggerJobTracking = function(jobId) {
    const item = findItemById(jobId);
    if (item) {
      openTrackJobModal(item);
    }
  };

  // 13. Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
    if (e.key === 'Escape') {
      closeModal();
      closeAlertsModal();
      closeTrackJobModal();
      closeMyTrackedModal();
    }
  });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);

  const todayBadge = document.getElementById('filter-current-date-badge');
  if (todayBadge) {
    const today = new Date();
    const formatted = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    todayBadge.textContent = `Active from ${formatted}`;
  }

  setupEventListeners();
  subscribe(renderAll);
  loadPortalData();
});
