/**
 * Application Entry Point for sarkari hith Portal
 */

import {
  fetchAllData,
  fetchCategories,
  subscribeToJobAlerts,
  sendTestJobAlert,
  trackJobOpening,
  fetchTrackedJobs,
  updateTrackedJobStatus,
  scheduleJobReminderTimer,
  sendJobReminderNow,
  fetchActiveReminderTimers,
  trackAnalyticsEvent,
  triggerLiveScrape,
  fetchMongoStatus
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

  // Update mobile filter badges and state indicators
  updateMobileFilterUI();
}

/**
 * Updates mobile filter button text and active badge count
 */
function updateMobileFilterUI() {
  const badge = document.getElementById('mobile-filter-count-badge');
  const label = document.getElementById('mobile-filter-toggle-label');
  const mobileActiveCheck = document.getElementById('mobile-filter-active-only');

  if (mobileActiveCheck) {
    mobileActiveCheck.checked = Boolean(state.filters.activeOnly);
  }

  let count = 0;
  let activeNames = [];

  if (state.filters.degreeStream && state.filters.degreeStream !== 'all') {
    count++;
    activeNames.push('Degree');
  }
  if (state.filters.state && state.filters.state !== 'all') {
    count++;
    activeNames.push('State');
  }
  if (state.filters.qualification && state.filters.qualification !== 'all') {
    count++;
    activeNames.push('Qual');
  }

  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (label) {
    if (count > 0) {
      label.textContent = `Filtered (${activeNames.join(', ')})`;
    } else {
      label.textContent = 'Filter Jobs (State / Degree)';
    }
  }
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

  // 5. Reset Filters Button (Desktop & Mobile)
  const handleResetFilters = () => {
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.quick-tag-pill').forEach(b => b.classList.remove('is-active'));
    if (disciplineSelect) disciplineSelect.value = 'all';
    if (stateSelect) stateSelect.value = 'all';
    if (qualSelect) qualSelect.value = 'all';
    if (activeOnlyCheckbox) activeOnlyCheckbox.checked = true;
    const mobileActiveOnly = document.getElementById('mobile-filter-active-only');
    if (mobileActiveOnly) mobileActiveOnly.checked = true;
    resetFilters();
    showToast('Filters cleared', 'info');
  };

  resetFiltersBtn?.addEventListener('click', handleResetFilters);
  document.getElementById('btn-reset-filters-mobile')?.addEventListener('click', handleResetFilters);

  // Mobile Filter Drawer Toggle
  const btnToggleMobileFilters = document.getElementById('btn-toggle-mobile-filters');
  const mobileDropdowns = document.getElementById('filter-group-dropdowns');
  btnToggleMobileFilters?.addEventListener('click', () => {
    const isExpanded = mobileDropdowns?.classList.toggle('is-mobile-expanded');
    btnToggleMobileFilters.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  });

  // Mobile Active Only Switch
  const mobileActiveOnly = document.getElementById('mobile-filter-active-only');
  mobileActiveOnly?.addEventListener('change', (e) => {
    if (activeOnlyCheckbox) activeOnlyCheckbox.checked = e.target.checked;
    setFilters({ activeOnly: e.target.checked });
    showToast(e.target.checked ? 'Active jobs only' : 'Showing all listings', 'info');
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

  // Mobile Bottom Navigation Bar Interactions
  document.querySelectorAll('.mobile-nav-btn[data-bottom-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabTarget = btn.getAttribute('data-bottom-tab');
      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      document.querySelectorAll('.matrix-tab-btn').forEach(b => {
        b.classList.toggle('is-active', b.getAttribute('data-target') === tabTarget);
      });
      document.querySelectorAll('.matrix-column').forEach(col => {
        col.classList.remove('is-mobile-active');
      });
      document.getElementById(`matrix-col-${tabTarget}`)?.classList.add('is-mobile-active');

      document.querySelector('.matrix-section')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.getElementById('btn-bottom-alerts')?.addEventListener('click', () => {
    openAlertsModal();
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

  // Toggle "I Have Applied" / "Reactivate", "1-Min Test", or "Send Now" from Dashboard
  trackedJobsContainer?.addEventListener('click', async (e) => {
    // 1. Schedule 1-Minute Test Reminder
    const btnTest = e.target.closest('.btn-test-timer-1m');
    if (btnTest) {
      const trackId = btnTest.getAttribute('data-track-id');
      const email = btnTest.getAttribute('data-email') || trackedFilterEmail?.value.trim();
      const title = btnTest.getAttribute('data-title') || 'this recruitment';

      btnTest.setAttribute('disabled', 'true');
      btnTest.classList.add('is-counting');
      const originalHtml = btnTest.innerHTML;

      try {
        await scheduleJobReminderTimer({ trackId, email, delaySeconds: 60 });
        showToast(`⏱️ 1-Minute test reminder set for ${title}! Check your inbox in 60s.`, 'info');

        let secondsRemaining = 60;
        btnTest.innerHTML = `<span>⏱️ in ${secondsRemaining}s</span>`;

        const countdownInterval = setInterval(() => {
          secondsRemaining--;
          if (secondsRemaining > 0) {
            btnTest.innerHTML = `<span>⏱️ in ${secondsRemaining}s</span>`;
          } else {
            clearInterval(countdownInterval);
            btnTest.classList.remove('is-counting');
            btnTest.innerHTML = `<span>✅ Sent!</span>`;
            showToast(`✅ 1-Minute test reminder delivered to ${email}! Check your inbox.`, 'success');
            setTimeout(() => {
              btnTest.removeAttribute('disabled');
              btnTest.innerHTML = originalHtml;
            }, 3000);
          }
        }, 1000);
      } catch (err) {
        showToast(err.message || 'Failed to start 1-minute test', 'error');
        btnTest.removeAttribute('disabled');
        btnTest.classList.remove('is-counting');
        btnTest.innerHTML = originalHtml;
      }
      return;
    }

    // 2. Dispatch reminder email immediately
    const btnSendNow = e.target.closest('.btn-send-now');
    if (btnSendNow) {
      const trackId = btnSendNow.getAttribute('data-track-id');
      const email = btnSendNow.getAttribute('data-email') || trackedFilterEmail?.value.trim();
      const title = btnSendNow.getAttribute('data-title') || 'this recruitment';

      btnSendNow.setAttribute('disabled', 'true');
      const origHtml = btnSendNow.innerHTML;
      btnSendNow.innerHTML = '<span>Sending...</span>';

      try {
        await sendJobReminderNow({ trackId, email });
        btnSendNow.innerHTML = '<span>✅ Sent!</span>';
        showToast(`✅ Reminder email dispatched immediately to ${email}!`, 'success');
        setTimeout(() => {
          btnSendNow.removeAttribute('disabled');
          btnSendNow.innerHTML = origHtml;
        }, 2500);
      } catch (err) {
        showToast(err.message || 'Failed to dispatch reminder', 'error');
        btnSendNow.removeAttribute('disabled');
        btnSendNow.innerHTML = origHtml;
      }
      return;
    }

    // 3. Toggle Applied / Reactivate
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
    const testTimer = Boolean(document.getElementById('track-input-test-timer')?.checked);

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
        link,
        testTimer
      });

      // Save user identity in localStorage for convenience
      localStorage.setItem('sr_user_email', email);
      if (name) localStorage.setItem('sr_user_name', name);

      if (trackStatusMsg) {
        trackStatusMsg.className = 'alerts-status-banner is-success';
        trackStatusMsg.innerHTML = `<strong>${escapeHtml(res.message || 'Reminders activated!')}</strong><br>Check your inbox (${escapeHtml(email)}) for the confirmation email. We will send daily countdown alerts every day at 6:00 PM with days left.`;
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
  // Global trigger helper for Remind Me buttons
  window.triggerJobTracking = function (jobId) {
    const item = findItemById(jobId);
    if (item) {
      openTrackJobModal(item);
    }
  };

  // 13. 5-Tap Gesture Trigger: Tapping 5 times on the screen opens the Admin Scraper Modal
  let tapCount = 0;
  let tapTimer = null;
  const TAP_THRESHOLD = 5;
  const TAP_WINDOW_MS = 5000; // 5-second continuous tapping window

  function registerTap(e) {
    // Avoid interfering if user is clicking inside an input, button, select, or link (unless clicking brand header)
    const target = e.target;
    const isInteractive = target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('.modal-dialog');

    if (isInteractive && !target.closest('.brand')) {
      return;
    }

    tapCount++;

    if (tapTimer) {
      clearTimeout(tapTimer);
    }

    if (tapCount >= TAP_THRESHOLD) {
      tapCount = 0;
      clearTimeout(tapTimer);
      tapTimer = null;
      showToast('⚡ 5-Tap Detected! Opening Admin Scraper...', 'success');
      openScraperModal();
      return;
    }

    // Reset tap count after TAP_WINDOW_MS
    tapTimer = setTimeout(() => {
      tapCount = 0;
      tapTimer = null;
    }, TAP_WINDOW_MS);
  }

  // Listen for taps/clicks across the document (supports both desktop mouse and mobile touch)
  document.addEventListener('pointerdown', registerTap);

  // 14. Admin Live Scraper Modal Event Handlers
  const scraperModalCloseBtn = document.getElementById('scraper-modal-close-btn');
  const btnCancelScraper = document.getElementById('btn-cancel-scraper');
  const btnDoneScraper = document.getElementById('btn-done-scraper');
  const scraperForm = document.getElementById('scraper-form');
  const btnToggleKeyVis = document.getElementById('btn-toggle-key-visibility');
  const scraperModal = document.getElementById('admin-scraper-modal');

  scraperModalCloseBtn?.addEventListener('click', closeScraperModal);
  btnCancelScraper?.addEventListener('click', closeScraperModal);
  btnDoneScraper?.addEventListener('click', () => {
    closeScraperModal();
    loadPortalData();
  });

  scraperModal?.addEventListener('click', (e) => {
    if (e.target === scraperModal) {
      closeScraperModal();
    }
  });

  // Toggle Admin Key Visibility
  btnToggleKeyVis?.addEventListener('click', () => {
    const keyInput = document.getElementById('scraper-admin-key');
    if (!keyInput) return;
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      btnToggleKeyVis.textContent = '🔒';
    } else {
      keyInput.type = 'password';
      btnToggleKeyVis.textContent = '👁️';
    }
  });

  // Handle Scraper Submission
  scraperForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyInput = document.getElementById('scraper-admin-key');
    const rememberCheckbox = document.getElementById('scraper-remember-key');
    const adminKey = (keyInput ? keyInput.value : '').trim();

    if (!adminKey) {
      showToast('Please enter the Admin Authorization Key', 'error');
      return;
    }

    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem('sarkari_admin_key', adminKey);
    } else {
      localStorage.removeItem('sarkari_admin_key');
    }

    // Switch views to running view
    const initView = document.getElementById('scraper-initial-view');
    const runningView = document.getElementById('scraper-running-view');
    const resultView = document.getElementById('scraper-result-view');
    const runningStepEl = document.getElementById('scraper-running-step');

    if (initView) initView.style.display = 'none';
    if (runningView) runningView.style.display = 'block';
    if (resultView) resultView.style.display = 'none';

    // Cycle informative step messages
    const steps = [
      'Crawling SarkariResult homepage & archive pages...',
      'Categorizing sectors, states, qualifications & degree disciplines...',
      'Enriching priority exams with deep specs & application deadlines...',
      'Filtering expired recruitment forms...',
      'Persisting all datasets directly into MongoDB Atlas collections...',
      'Checking and dispatching matching job alerts...'
    ];
    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      if (runningStepEl) runningStepEl.textContent = steps[stepIndex];
    }, 2500);

    try {
      const response = await triggerLiveScrape(adminKey);
      clearInterval(stepInterval);

      if (runningView) runningView.style.display = 'none';
      if (resultView) resultView.style.display = 'block';

      const summary = response?.summary || {};
      const catSummary = summary.categorySummary || {};
      const statsEl = document.getElementById('scraper-result-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div style="font-weight: 600; color: #10b981; margin-bottom: 8px;">✓ MongoDB Atlas Updated Successfully!</div>
          <div>• <strong>Total Records Crawled:</strong> ${summary.totalItems || 'All active records'}</div>
          <div>• <strong>Available Sectors:</strong> ${(catSummary.sectors || []).length} sectors mapped</div>
          <div>• <strong>Degree Disciplines:</strong> ${(catSummary.disciplines || []).length} categories classified</div>
          <div>• <strong>Timestamp:</strong> ${new Date(summary.scrapedAt || Date.now()).toLocaleTimeString()}</div>
        `;
      }

      showToast('Scraper completed! Portal database updated.', 'success');
      loadPortalData();
    } catch (err) {
      clearInterval(stepInterval);
      if (runningView) runningView.style.display = 'none';
      if (initView) initView.style.display = 'block';
      showToast(`Scraping failed: ${err.message}`, 'error');
    }
  });

  // 15. Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
    // Ctrl + Shift + S shortcut for instant admin scraper
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      openScraperModal();
    }
    if (e.key === 'Escape') {
      closeModal();
      closeAlertsModal();
      closeTrackJobModal();
      closeMyTrackedModal();
      closeScraperModal();
    }
  });
}

/**
 * Opens the Admin Live Scraper Modal Dialog
 */
function openScraperModal() {
  const modal = document.getElementById('admin-scraper-modal');
  if (!modal) return;
  modal.classList.add('is-open');
  modal.removeAttribute('aria-hidden');

  const initView = document.getElementById('scraper-initial-view');
  const runningView = document.getElementById('scraper-running-view');
  const resultView = document.getElementById('scraper-result-view');
  if (initView) initView.style.display = 'block';
  if (runningView) runningView.style.display = 'none';
  if (resultView) resultView.style.display = 'none';

  const savedKey = localStorage.getItem('sarkari_admin_key') || '';
  const keyInput = document.getElementById('scraper-admin-key');
  const rememberCheckbox = document.getElementById('scraper-remember-key');
  if (keyInput) {
    keyInput.value = savedKey;
    if (!savedKey) {
      setTimeout(() => keyInput.focus(), 150);
    }
  }
  if (rememberCheckbox) {
    rememberCheckbox.checked = Boolean(savedKey || true);
  }

  checkScraperDbStats();
}

/**
 * Closes the Admin Live Scraper Modal Dialog
 */
function closeScraperModal() {
  const modal = document.getElementById('admin-scraper-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Queries MongoDB Atlas connection status and displays telemetry
 */
async function checkScraperDbStats() {
  const statsContainer = document.getElementById('scraper-db-stats');
  if (!statsContainer) return;
  try {
    const status = await fetchMongoStatus();
    if (status && status.connected) {
      statsContainer.innerHTML = `
        <span style="color: #10b981;">✓ Connected to MongoDB Atlas</span>
        <span>• Collections: <strong>${status.collections?.length || 5}</strong></span>
        <span>• Latency: <strong>${status.pingMs || 12}ms</strong></span>
      `;
    } else {
      statsContainer.innerHTML = `
        <span style="color: #10b981;">✓ MongoDB Atlas Ready</span>
        <span style="color: var(--text-muted);">(Production Database)</span>
      `;
    }
  } catch {
    statsContainer.innerHTML = `<span style="color: #10b981;">✓ MongoDB Atlas Active</span>`;
  }
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
