/**
 * UI Components & DOM Renderers for sarkari hith
 */

import { state, filterItems, setSelectedItem } from './state.js';
import { fetchPostingDetails } from './api.js';

/**
 * Escapes HTML characters to prevent XSS
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Allow only web URLs before inserting an escaped href attribute. */
export function safeLink(value) {
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return escapeHtml(url.href);
  } catch {}
  return '#';
}

/**
 * Renders the top announcement live ticker
 */
export function renderTicker(container, items) {
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<span class="ticker-item">Loading latest government recruitment notifications...</span>';
    return;
  }

  const tickerHtml = items.slice(0, 10).map(item => `
    <a href="${safeLink(item.link)}" target="_blank" rel="noopener" class="ticker-item">
      <strong>[${escapeHtml(item.sector || 'Alert')}]</strong>&nbsp;${escapeHtml(item.title)}
      <span class="ticker-item-separator">|</span>
    </a>
  `).join('');

  container.innerHTML = tickerHtml;
}

/**
 * Renders sector filter chips with active state and count badges
 */
export function renderSectorChips(container, sectors, activeSector) {
  if (!container) return;

  const totalAll = sectors.reduce((acc, s) => acc + s.count, 0);

  let html = `
    <button class="sector-chip ${activeSector === 'all' ? 'is-active' : ''}" data-sector="all">
      <span>All Categories</span>
      <span class="chip-counter">${totalAll}</span>
    </button>
  `;

  sectors.forEach(sec => {
    const isActive = activeSector === sec.name;
    html += `
      <button class="sector-chip ${isActive ? 'is-active' : ''}" data-sector="${escapeHtml(sec.name)}">
        <span>${escapeHtml(sec.name)}</span>
        <span class="chip-counter">${sec.count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

/**
 * Populates state and qualification dropdown selectors
 */
export function populateDropdowns(stateSelect, qualSelect, categories) {
  if (stateSelect && categories.states) {
    const currentState = state.filters.state;
    stateSelect.innerHTML = '<option value="all">All States / Regions</option>' +
      categories.states.map(s => `
        <option value="${escapeHtml(s.name)}" ${currentState === s.name ? 'selected' : ''}>
          ${escapeHtml(s.name)} (${s.count})
        </option>
      `).join('');
  }

  if (qualSelect && categories.qualifications) {
    const currentQual = state.filters.qualification;
    qualSelect.innerHTML = '<option value="all">All Qualifications</option>' +
      categories.qualifications.map(q => `
        <option value="${escapeHtml(q.name)}" ${currentQual === q.name ? 'selected' : ''}>
          ${escapeHtml(q.name)} (${q.count})
        </option>
      `).join('');
  }
}

/**
 * Sector icon helper for reference-style avatar icons (SVG only, zero emojis)
 */
export function getSectorIcon(sector = '', title = '') {
  const s = (sector || '').toLowerCase();
  const t = (title || '').toLowerCase();

  // Banking & Financial
  if (s.includes('bank') || t.includes('bank') || t.includes('ibps') || t.includes('sbi') || t.includes('rbi')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z"/></svg>`;
  }

  // Police, Defense & Armed Forces
  if (s.includes('defense') || s.includes('defence') || s.includes('police') || s.includes('army') || s.includes('navy') || s.includes('air force') || t.includes('police') || t.includes('constable') || t.includes('si')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }

  // Teaching & Education
  if (s.includes('teach') || s.includes('education') || t.includes('teacher') || t.includes('tet') || t.includes('b.ed') || t.includes('professor') || t.includes('lecturer')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM8 7h8M8 11h6"/></svg>`;
  }

  // Medical & Healthcare
  if (s.includes('medic') || s.includes('health') || t.includes('nurse') || t.includes('doctor') || t.includes('aiims') || t.includes('medical') || t.includes('pharm')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/></svg>`;
  }

  // Engineering & Technical
  if (s.includes('engineer') || s.includes('technic') || t.includes('engineer') || t.includes('diploma') || t.includes('je') || t.includes('ae') || t.includes('apprentice')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  }

  // Railway Recruitment
  if (s.includes('rail') || t.includes('railway') || t.includes('rrb') || t.includes('rrc')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M16 19l2 3M9 15h.01M15 15h.01"/></svg>`;
  }

  // Staff Selection (SSC) & UPSC / Civil Services
  if (s.includes('ssc') || s.includes('upsc') || s.includes('civil') || t.includes('upsc') || t.includes('ssc') || t.includes('psc')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`;
  }

  // Default Government Office / Recruitment Briefcase
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
}

const TRENDING_THEMES = [
  { numBg: '#ff4b72', watermark: '' },
  { numBg: '#8b5cf6', watermark: '' },
  { numBg: '#f97316', watermark: '' },
  { numBg: '#3b82f6', watermark: '' },
  { numBg: '#10b981', watermark: '' }
];

/**
 * Renders Trending Highlight Cards
 */
export function renderTrendingGrid(container, items) {
  if (!container) return;
  const filtered = filterItems(items);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>No trending notifications matching current filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.slice(0, 5).map((item, index) => {
    const theme = TRENDING_THEMES[index % TRENDING_THEMES.length];
    const itemNum = index + 1;
    const watermarkIcon = theme.watermark;

    return `
      <article class="trending-card" style="--card-accent: ${item.sectorColor || 'var(--primary-red)'}" data-id="${escapeHtml(item.id)}">
        <div class="trending-card-top-row">
          <div class="trending-num-badge" style="background-color: ${theme.numBg};">
            ${itemNum}
          </div>
          <span class="badge badge-sector" style="--badge-color: ${item.sectorColor}; --badge-bg: ${item.sectorColor}15">
            ${escapeHtml(item.sector || 'General')}
          </span>
          <div class="trending-watermark-icon" aria-hidden="true">${watermarkIcon}</div>
        </div>

        <div class="trending-card-body">
          <h3 class="trending-card-title">${escapeHtml(item.title)}</h3>
        </div>

        <div class="trending-card-footer">
          <span class="trending-org-name">${escapeHtml(item.organization || item.state || 'Govt of India')} View Details &rarr;</span>
          <span class="trending-circle-chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Renders an item card inside a Matrix column (Results, Admit Cards, Latest Jobs)
 */
function createMatrixItemHtml(item) {
  const isExpired = item.isExpired === true;
  const deadlineBadge = item.lastDateFormatted
    ? `<span class="badge ${isExpired ? 'badge-deadline-expired' : 'badge-deadline-active'}">${isExpired ? 'Closed: ' : 'Till '}${escapeHtml(item.lastDateFormatted)}</span>`
    : '';

  const activeStream = state.filters.degreeStream;
  let streamBadge = '';
  if (activeStream && activeStream !== 'all') {
    const isDirectField = Array.isArray(item.fieldDisciplines) && item.fieldDisciplines.includes(activeStream);
    const isGeneral = Array.isArray(item.generalDisciplines) && item.generalDisciplines.includes(activeStream);
    const isEligible = Array.isArray(item.eligibleDisciplines) && item.eligibleDisciplines.includes(activeStream);
    const warning = item.ineligibleWarnings?.find(w => w.disciplineId === activeStream);

    if (warning) {
      streamBadge = `<span class="badge badge-stream-warning" title="${escapeHtml(warning.message)}">Ineligible</span>`;
    } else if (isDirectField) {
      const meta = item.eligibleDisciplinesMeta?.find(m => m.id === activeStream);
      const postCount = meta?.matchedPostsCount ? ` (${meta.matchedPostsCount} posts)` : '';
      streamBadge = `<span class="badge badge-field-match" title="Direct field requirement specifically for your degree branch">Direct Match${postCount}</span>`;
    } else if (isGeneral) {
      streamBadge = `<span class="badge badge-general-match" title="Open to any Bachelor degree graduate (Any Stream)">Any Graduate</span>`;
    } else if (isEligible) {
      streamBadge = `<span class="badge badge-stream-match">Degree Eligible</span>`;
    } else {
      streamBadge = `<span class="badge badge-stream-mismatch">Other Branch</span>`;
    }
  } else if (item.eligibleDisciplinesMeta && item.eligibleDisciplinesMeta.length > 0) {
    const topStreams = item.eligibleDisciplinesMeta.slice(0, 1);
    streamBadge = topStreams.map(s => `<span class="badge badge-stream-pill">${escapeHtml(s.shortLabel)}</span>`).join('');
  }

  const sectorIcon = getSectorIcon(item.sector, item.title);
  const isRecentNew = item.isActive && !isExpired && (item.category === 'jobs' || item.type === 'job');

  return `
    <div class="matrix-item ${isExpired ? 'is-expired-item' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="matrix-item-avatar" style="--avatar-color: ${item.sectorColor || '#c01b22'};" aria-hidden="true">
        <span>${sectorIcon}</span>
      </div>

      <div class="matrix-item-content">
        <div class="matrix-item-title">
          ${escapeHtml(item.title)}
          ${isRecentNew ? '<span class="matrix-badge-new">New</span>' : ''}
        </div>

        <div class="matrix-item-badges">
          <span class="badge badge-sector" style="--badge-color: ${item.sectorColor}; --badge-bg: ${item.sectorColor}15">
            ${escapeHtml(item.sector || 'Notice')}
          </span>
          <span class="badge badge-status ${escapeHtml(item.statusType || 'neutral')}">
            ${escapeHtml(item.status || 'Active')}
          </span>
          ${streamBadge}
          ${deadlineBadge}
        </div>

        <div class="matrix-item-meta-row">
          <span class="meta-item-date">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${escapeHtml(item.postedDateFormatted || item.lastDateFormatted || 'Active 2026')}
          </span>
          <span class="meta-item-divider">|</span>
          <span class="meta-item-state">${escapeHtml(item.state || 'All India')}</span>
          ${item.lastDate && !isExpired ? `
            <span class="meta-item-divider">|</span>
            <button type="button" class="btn-track-job" data-track-id="${escapeHtml(item.id)}" title="Track application deadline & get daily reminders" onclick="event.stopPropagation(); window.triggerJobTracking('${escapeHtml(item.id)}');">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Remind Me</span>
            </button>
          ` : ''}
        </div>
      </div>

      <div class="matrix-item-action" aria-hidden="true">
        <span class="matrix-circle-chevron">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </span>
      </div>
    </div>
  `;
}

/**
 * Renders the 3-column sarkari hith Matrix
 */
export function renderMatrix(resultsContainer, admitCardsContainer, jobsContainer, data) {
  const filteredResults = filterItems(data.results);
  const filteredAdmit = filterItems(data.admitCards);
  const filteredJobs = filterItems(data.latestJobs);

  // Update column counters
  const resultsCount = document.getElementById('count-results');
  const admitCount = document.getElementById('count-admitcards');
  const jobsCount = document.getElementById('count-jobs');

  if (resultsCount) resultsCount.textContent = filteredResults.length;
  if (admitCount) admitCount.textContent = filteredAdmit.length;
  if (jobsCount) jobsCount.textContent = filteredJobs.length;

  // Update mobile tab badges
  const tabJobs = document.querySelector('.matrix-tab-btn[data-target="latestjobs"]');
  const tabAdmit = document.querySelector('.matrix-tab-btn[data-target="admitcards"]');
  const tabResults = document.querySelector('.matrix-tab-btn[data-target="results"]');

  if (tabJobs) tabJobs.innerHTML = `Latest Jobs <span class="tab-badge">${filteredJobs.length}</span>`;
  if (tabAdmit) tabAdmit.innerHTML = `Admit Cards <span class="tab-badge">${filteredAdmit.length}</span>`;
  if (tabResults) tabResults.innerHTML = `Results <span class="tab-badge">${filteredResults.length}</span>`;

  if (resultsContainer) {
    resultsContainer.innerHTML = filteredResults.length > 0
      ? filteredResults.map(createMatrixItemHtml).join('')
      : '<div class="empty-state"><p>No results found</p></div>';
  }

  if (admitCardsContainer) {
    admitCardsContainer.innerHTML = filteredAdmit.length > 0
      ? filteredAdmit.map(createMatrixItemHtml).join('')
      : '<div class="empty-state"><p>No admit cards found</p></div>';
  }

  if (jobsContainer) {
    jobsContainer.innerHTML = filteredJobs.length > 0
      ? filteredJobs.map(createMatrixItemHtml).join('')
      : '<div class="empty-state"><p>No latest jobs found</p></div>';
  }
}

/**
 * Renders Secondary Service Grid (Answer Keys, Syllabus, Admissions, Certificates)
 */
export function renderSecondaryGrid(container, items) {
  if (!container) return;
  const filtered = filterItems(items);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>No items found for this section with the current filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="secondary-card" data-id="${escapeHtml(item.id)}">
      <div style="flex: 1;">
        <div style="font-size: 0.925rem; font-weight: 600; line-height: 1.4; margin-bottom: 0.5rem;">
          ${escapeHtml(item.title)}
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <span class="badge badge-sector" style="--badge-color: ${item.sectorColor}; --badge-bg: ${item.sectorColor}15">
            ${escapeHtml(item.sector || 'General')}
          </span>
          <span class="badge badge-state">${escapeHtml(item.state || 'India')}</span>
        </div>
      </div>
      <a href="${safeLink(item.link)}" target="_blank" rel="noopener" class="btn-secondary-action" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="event.stopPropagation();">
        Open &nearr;
      </a>
    </div>
  `).join('');
}

/**
 * Renders details into the modal DOM elements
 */
function renderModalContent(item) {
  const titleEl = document.getElementById('modal-title');
  const metaSectorEl = document.getElementById('modal-meta-sector');
  const metaStateEl = document.getElementById('modal-meta-state');
  const metaQualEl = document.getElementById('modal-meta-qual');
  const datesListEl = document.getElementById('modal-dates-list');
  const feeListEl = document.getElementById('modal-fee-list');
  const shortInfoEl = document.getElementById('modal-short-info');
  const vacancyEl = document.getElementById('modal-vacancies');
  const vacancyTableContainer = document.getElementById('modal-vacancy-table-container');
  const actionLinksEl = document.getElementById('modal-action-links');

  if (titleEl) titleEl.textContent = item.title;
  if (metaSectorEl) metaSectorEl.textContent = item.sector || 'Government Examination';
  if (metaStateEl) metaStateEl.textContent = item.state || 'Central / All India';
  if (metaQualEl) metaQualEl.textContent = item.qualification || 'As per notification rules';

  // 0. Degree Eligibility Banner & Stream Badges
  const eligibilityBanner = document.getElementById('modal-eligibility-banner');
  const activeStream = state.filters.degreeStream;

  if (eligibilityBanner) {
    let bannerHtml = '';
    const warnings = item.ineligibleWarnings || [];
    const activeWarning = activeStream && activeStream !== 'all'
      ? warnings.find(w => w.disciplineId === activeStream)
      : null;

    if (activeWarning) {
      bannerHtml = `
        <div class="eligibility-banner is-ineligible">
          <div class="eligibility-banner-content">
            <strong>Stream Ineligible Notice:</strong>
            <p>${escapeHtml(activeWarning.message)}</p>
          </div>
        </div>
      `;
    } else if (activeStream && activeStream !== 'all') {
      const isDirectField = Array.isArray(item.fieldDisciplines) && item.fieldDisciplines.includes(activeStream);
      const isGeneral = Array.isArray(item.generalDisciplines) && item.generalDisciplines.includes(activeStream);
      const isEligible = Array.isArray(item.eligibleDisciplines) && item.eligibleDisciplines.includes(activeStream);
      const meta = item.eligibleDisciplinesMeta?.find(m => m.id === activeStream);
      const postCount = meta?.matchedPostsCount || 0;

      if (isDirectField) {
        bannerHtml = `
          <div class="eligibility-banner is-direct-field">
            <div class="eligibility-banner-content">
              <strong>Direct Branch Requirement: ${escapeHtml(meta?.label || activeStream)}</strong>
              <p>${postCount > 0
            ? `This notification specifically demands your specialization! You qualify for <strong>${postCount}</strong> specific post(s) (highlighted below).`
            : `Your qualification branch directly matches the required discipline for this post.`
          }</p>
            </div>
          </div>
        `;
      } else if (isGeneral) {
        bannerHtml = `
          <div class="eligibility-banner is-general-graduate">
            <div class="eligibility-banner-content">
              <strong>Eligible via Any Bachelor Degree (Open Stream): ${escapeHtml(meta?.label || activeStream)}</strong>
              <p>This vacancy is open to graduates in <strong>Any Stream / Recognized University</strong>. As a degree holder, you are eligible to apply.</p>
            </div>
          </div>
        `;
      } else if (isEligible) {
        bannerHtml = `
          <div class="eligibility-banner is-eligible">
            <div class="eligibility-banner-content">
              <strong>Eligible For Your Degree: ${escapeHtml(meta?.label || activeStream)}</strong>
              <p>${postCount > 0
            ? `You can apply for <strong>${postCount}</strong> post(s) in this notification.`
            : `General eligibility criteria matches your qualification.`
          }</p>
            </div>
          </div>
        `;
      } else {
        bannerHtml = `
          <div class="eligibility-banner is-warning">
            <div class="eligibility-banner-content">
              <strong>Degree Notice:</strong>
              <p>This vacancy generally requires other disciplines. Review the eligible streams and eligibility criteria below.</p>
            </div>
          </div>
        `;
      }
    }

    if (item.eligibleDisciplinesMeta?.length > 0) {
      bannerHtml += `
        <div class="modal-disciplines-bar">
          <span class="modal-disciplines-title">Eligible Degree Streams:</span>
          <div class="modal-disciplines-chips">
            ${item.eligibleDisciplinesMeta.map(m => `
              <span class="badge badge-discipline-tag ${m.id === activeStream ? 'is-highlighted' : ''}">
                ${escapeHtml(m.shortLabel)}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }

    eligibilityBanner.innerHTML = bannerHtml;
  }

  // Tracking CTA banner in modal
  const trackerBannerEl = document.getElementById('modal-tracker-banner');
  if (trackerBannerEl) {
    if (item.lastDate && !item.isExpired) {
      const daysLeft = calculateDaysLeft(item.lastDate);
      const daysText = daysLeft === 0 ? 'Closes Today!' : daysLeft > 0 ? `${daysLeft} days remaining` : 'Deadline closing';
      trackerBannerEl.style.display = 'block';
      trackerBannerEl.innerHTML = `
        <div class="job-tracker-modal-card">
          <div class="tracker-info">
            <div class="tracker-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Daily Deadline Reminders</span>
            </div>
            <div class="tracker-text">
              <strong>Track this job & never miss the deadline to apply</strong>
              <span>Get daily email countdown updates until ${escapeHtml(item.lastDateFormatted || 'deadline')} (${daysText}).</span>
            </div>
          </div>
          <button type="button" class="btn-activate-tracking" id="btn-modal-open-tracker">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>Set Reminders</span>
          </button>
        </div>
      `;
      document.getElementById('btn-modal-open-tracker')?.addEventListener('click', () => {
        openTrackJobModal(item);
      });
    } else {
      trackerBannerEl.style.display = 'none';
      trackerBannerEl.innerHTML = '';
    }
  }

  // Overview keeps source metadata visible alongside the full notification.
  const details = item.details || {};
  const overview = document.getElementById('modal-overview');
  if (overview) {
    const facts = [
      ['Conducting authority', item.organization], ['Location', item.state],
      ['Qualification', item.qualification], ['Notification updated', details.postDate],
      ['Application deadline', item.lastDateFormatted || item.lastDate],
      ['Total vacancies', details.totalVacancies]
    ].filter(([, value]) => value);
    overview.innerHTML = facts.map(([label, value]) => `<div class="modal-overview-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }
  const ageList = document.getElementById('modal-age-list');
  if (ageList) {
    const entries = Object.entries(details.ageLimit || {});
    ageList.innerHTML = entries.length ? entries.map(([key, value]) => `<li><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></li>`).join('')
      : '<li><span>Age requirements</span><strong>Not published in the available source</strong></li>';
  }
  const extended = document.getElementById('modal-extended-details');
  if (extended) {
    const groups = [
      ['eligibility', 'Qualification & Experience'], ['selectionProcess', 'Selection Process'],
      ['salary', 'Salary & Benefits'], ['howToApply', 'How to Apply'],
      ['documents', 'Required Documents'], ['examPattern', 'Exam Pattern & Syllabus'],
      ['physicalStandards', 'Physical Standards & Tests']
    ];
    extended.innerHTML = groups.map(([type, title]) => {
      const lines = [...new Set((details.sections || []).filter(section => section.type === type).flatMap(section => section.items || []))];
      const tag = type === 'howToApply' ? 'ol' : 'ul';
      return `<section class="modal-info-box"><h4>${title}</h4>${lines.length
        ? `<${tag} class="modal-detail-points">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</${tag}>`
        : '<p class="modal-unavailable">Not published in the available source.</p>'}</section>`;
    }).join('');
  }
  const additionalTables = document.getElementById('modal-additional-tables');
  if (additionalTables) {
    additionalTables.innerHTML = (details.additionalTables || []).map(table => `<section class="modal-info-box"><h4>${escapeHtml(table.title)}</h4>
      <div class="modal-table-scroll" tabindex="0" role="region" aria-label="${escapeHtml(table.title)}">
        <table class="modal-vacancy-table"><tbody>${table.rows.map((row, index) => `<tr>${row.map(cell => index === 0
          ? `<th scope="col">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div></section>`).join('');
  }

  // 1. Important Dates
  const dates = { ...(item.lastDate ? { 'Last date to apply': item.lastDateFormatted || item.lastDate } : {}), ...(details.importantDates || {}) };
  if (datesListEl) {
    const dateKeys = Object.keys(dates);
    if (dateKeys.length > 0) {
      datesListEl.innerHTML = dateKeys.map(k => `
        <li>
          <span>${escapeHtml(k)}</span>
          <strong>${escapeHtml(dates[k])}</strong>
        </li>
      `).join('');
    } else {
      datesListEl.innerHTML = `
        <li><span>Schedule</span><strong>Not published in the available source</strong></li>
      `;
    }
  }

  // 2. Fees Breakdown
  const fees = item.details?.applicationFee || {};
  if (feeListEl) {
    const feeKeys = Object.keys(fees);
    if (feeKeys.length > 0) {
      feeListEl.innerHTML = feeKeys.map(k => `
        <li>
          <span>${escapeHtml(k)}</span>
          <strong>${escapeHtml(fees[k])}</strong>
        </li>
      `).join('');
    } else {
      feeListEl.innerHTML = `
        <li><span>Application Fee</span><strong>Not published in the available source</strong></li>
      `;
    }
  }

  // 3. Short Info & Vacancies
  if (shortInfoEl) {
    shortInfoEl.textContent = item.details?.shortInfo || `${item.title}. Recruitment notification released by ${item.organization || 'the conducting authority'}. Candidates can check eligibility criteria, age limits, and official guidelines via the direct link below.`;
  }

  if (vacancyEl) {
    vacancyEl.textContent = item.details?.totalVacancies || 'Refer to official advertisement';
  }

  // Helper to determine detailed row match against candidate's active stream
  function getRowEligibility(rowText, discId) {
    const lower = (rowText || '').toLowerCase();
    let isField = false;

    if (discId === 'cs_it') {
      isField = lower.includes('computer') || lower.includes('information technology') || /\b(?:cs|it)\b/.test(lower) || lower.includes('software') || lower.includes('mca') || lower.includes('bca') || lower.includes('programmer');
    } else if (discId === 'civil_eng') {
      isField = lower.includes('civil') || lower.includes('construction') || lower.includes('surveyor') || lower.includes('mining') || lower.includes('b.arch');
    } else if (discId === 'mech_eng') {
      isField = lower.includes('mechanical') || lower.includes('automobile') || lower.includes('metallurg') || lower.includes('production');
    } else if (discId === 'elec_eng') {
      isField = lower.includes('electrical') || lower.includes('electronics') || lower.includes('telecom') || lower.includes('instrumentation') || /\bece\b/.test(lower);
    } else if (discId === 'commerce_finance') {
      isField = lower.includes('commerce') || lower.includes('b.com') || lower.includes('m.com') || lower.includes('account') || /\bca\b/.test(lower) || lower.includes('finance');
    } else if (discId === 'law_legal') {
      isField = lower.includes('law') || lower.includes('llb') || lower.includes('legal');
    } else if (discId === 'science_agriculture') {
      isField = /(?<!computer\s+)\b(?:science|b\.?sc|m\.?sc|physics|chemistry|biology|agriculture|veterinary)\b/i.test(lower);
    } else if (discId === 'medical_healthcare') {
      isField = lower.includes('mbbs') || lower.includes('nursing') || lower.includes('nurse') || lower.includes('pharm') || lower.includes('medical') || lower.includes('doctor');
    } else if (discId === 'education_teaching') {
      isField = /(?<!non[- ]?)\b(?:teacher|teaching|b\.?ed|deled|tet)\b/i.test(lower);
    } else if (discId === 'matric_inter_10_12') {
      isField = lower.includes('10th') || lower.includes('12th') || lower.includes('matric') || lower.includes('iti');
    }

    if (isField) return { type: 'field', label: 'Direct Match' };

    const isAny = (
      lower.includes('any stream') ||
      lower.includes('any discipline') ||
      lower.includes('any recognized university') ||
      lower.includes('bachelor degree in any') ||
      lower.includes('graduate in any') ||
      lower.includes('graduation in any')
    );

    if (isAny && discId !== 'matric_inter_10_12') {
      return { type: 'general', label: 'Any Degree' };
    }

    return { type: 'none', label: 'Other Stream' };
  }

  // 4. Vacancy & Eligibility Breakdown Table
  if (vacancyTableContainer) {
    const vacancyDetails = item.details?.vacancyDetails || [];
    if (vacancyDetails.length > 0) {
      let tableHtml = `
        <div class="vacancy-table-wrapper" style="overflow-x: auto; margin-top: 0.5rem;">
          <table class="modal-vacancy-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="background: var(--bg-surface-elevated, #f1f5f9); text-align: left; border-bottom: 2px solid var(--border-color);">
                <th style="padding: 0.5rem 0.6rem;">Post Name</th>
                <th style="padding: 0.5rem 0.6rem; text-align: center;">Total</th>
                <th style="padding: 0.5rem 0.6rem;">Eligibility Criteria</th>
                ${activeStream && activeStream !== 'all' ? '<th style="padding: 0.5rem 0.6rem; text-align: center;">Eligibility</th>' : ''}
              </tr>
            </thead>
            <tbody>
      `;

      vacancyDetails.forEach((row, idx) => {
        let rowMatch = { type: 'none', label: '' };
        if (activeStream && activeStream !== 'all') {
          rowMatch = getRowEligibility(`${row.postName} ${row.eligibility}`, activeStream);
        }

        const bg = rowMatch.type === 'field'
          ? 'rgba(8, 145, 178, 0.08)'
          : rowMatch.type === 'general'
            ? 'rgba(22, 163, 74, 0.08)'
            : (idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)');

        const badgeClass = rowMatch.type === 'field'
          ? 'badge-row-field'
          : rowMatch.type === 'general'
            ? 'badge-row-general'
            : 'badge-row-other';

        tableHtml += `
          <tr style="background: ${bg}; border-bottom: 1px solid var(--border-color, #e2e8f0);">
            <td style="padding: 0.5rem 0.6rem; font-weight: 600;">${escapeHtml(row.postName)}</td>
            <td style="padding: 0.5rem 0.6rem; text-align: center; color: var(--primary-red, #dc2626); font-weight: 700;">${escapeHtml(row.totalPost)}</td>
            <td style="padding: 0.5rem 0.6rem; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(row.eligibility)}</td>
            ${activeStream && activeStream !== 'all' ? `
              <td style="padding: 0.5rem 0.6rem; text-align: center;">
                <span class="badge ${badgeClass}">
                  ${rowMatch.label}
                </span>
              </td>
            ` : ''}
          </tr>
        `;
      });

      tableHtml += `
            </tbody>
          </table>
        </div>
      `;
      vacancyTableContainer.innerHTML = tableHtml;
    } else {
      vacancyTableContainer.innerHTML = '';
    }
  }

  // 5. Action Links
  if (actionLinksEl) {
    let linksHtml = `
      <a href="${safeLink(item.link)}" target="_blank" rel="noopener" class="btn-primary-action">
        Source Notification &nearr;
      </a>
      <button class="btn-secondary-action" id="btn-copy-link" data-url="${safeLink(item.link)}">
        Copy Link
      </button>
    `;

    // Extra direct links if scraped
    if (item.details?.importantLinks?.length > 0) {
      item.details.importantLinks.forEach(extra => {
        const isApply = extra.label.toLowerCase().includes('apply online');
        const btnClass = isApply ? 'btn-primary-action' : 'btn-secondary-action';
        linksHtml += `
          <a href="${safeLink(extra.url)}" target="_blank" rel="noopener" class="${btnClass}">
            ${escapeHtml(extra.label)} &nearr;
          </a>
        `;
      });
    }

    actionLinksEl.innerHTML = linksHtml;

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      navigator.clipboard.writeText(item.link);
      showToast('Link copied to clipboard!', 'success');
    });
  }
}

/**
 * Shows interactive details modal for an item
 */
let modalRequestId = 0;

export function openModal(item) {
  const modal = document.getElementById('item-detail-modal');
  if (!modal || !item) return;
  const requestId = ++modalRequestId;
  renderModalContent(item);
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const body = modal.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
  const status = document.getElementById('modal-details-status');
  const showStatus = message => { if (status && requestId === modalRequestId) status.textContent = message; };
  showStatus(item.details?.scrapedAt ? `Source information retrieved ${new Date(item.details.scrapedAt).toLocaleString('en-IN')}.` : '');
  let supported = false;
  try {
    const url = new URL(item.link);
    supported = ['http:', 'https:'].includes(url.protocol) && (url.hostname === 'sarkariresult.com'
      || url.hostname.endsWith('.sarkariresult.com') || url.hostname.endsWith('.gov.in') || url.hostname.endsWith('.nic.in'));
  } catch {}
  if (supported && item.details?.schemaVersion !== 2) {
    showStatus('Loading the full notification, eligibility and application instructions?');
    fetchPostingDetails(item.link).then(details => {
      if (details) item.details = details;
      if (requestId !== modalRequestId || !modal.classList.contains('is-open')) return;
      if (details) {
        renderModalContent(item);
        showStatus(`Source information retrieved ${new Date(details.scrapedAt).toLocaleString('en-IN')}.`);
      } else showStatus('Full notification could not be loaded. Available listing information is shown below.');
    }).catch(() => showStatus('Full notification could not be loaded. Available listing information is shown below.'));
  } else if (!item.details) {
    showStatus('Detailed notification is not available from this source yet. Available listing information is shown below.');
  }
}

export function closeModal() {
  modalRequestId++;
  const modal = document.getElementById('item-detail-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

export function openAlertsModal() {
  const modal = document.getElementById('job-alerts-modal');
  if (modal) {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

export function closeAlertsModal() {
  const modal = document.getElementById('job-alerts-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

export function calculateDaysLeft(lastDateStr) {
  if (!lastDateStr) return null;
  const deadline = new Date(lastDateStr + 'T23:59:59');
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function openTrackJobModal(item) {
  const modal = document.getElementById('track-job-modal');
  if (!modal || !item) return;

  const inputJobId = document.getElementById('track-input-job-id');
  const inputJobLink = document.getElementById('track-input-job-link');
  const inputLastDate = document.getElementById('track-input-job-last-date');
  const inputLastDateFmt = document.getElementById('track-input-job-last-date-fmt');
  const jobOrg = document.getElementById('track-job-org');
  const jobName = document.getElementById('track-job-name');
  const jobDeadline = document.getElementById('track-job-deadline');
  const daysBadge = document.getElementById('track-job-days-badge');
  const emailInput = document.getElementById('track-input-email');
  const nameInput = document.getElementById('track-input-name');
  const statusMsg = document.getElementById('track-modal-status-msg');

  if (inputJobId) inputJobId.value = item.id || '';
  if (inputJobLink) inputJobLink.value = item.link || '';
  if (inputLastDate) inputLastDate.value = item.lastDate || '';
  if (inputLastDateFmt) inputLastDateFmt.value = item.lastDateFormatted || item.lastDate || '';
  if (jobOrg) jobOrg.textContent = item.organization || item.sector || 'Government Recruitment';
  if (jobName) jobName.textContent = item.title;
  if (jobDeadline) jobDeadline.textContent = item.lastDateFormatted || item.lastDate || 'Refer Notice';

  const daysLeft = calculateDaysLeft(item.lastDate);
  if (daysBadge) {
    if (daysLeft === null) {
      daysBadge.textContent = 'Active Form';
      daysBadge.className = 'track-days-badge';
    } else if (daysLeft <= 0) {
      daysBadge.textContent = 'Closing Today!';
      daysBadge.className = 'track-days-badge is-urgent';
    } else if (daysLeft === 1) {
      daysBadge.textContent = '1 Day Left';
      daysBadge.className = 'track-days-badge is-urgent';
    } else {
      daysBadge.textContent = `${daysLeft} Days Remaining`;
      daysBadge.className = 'track-days-badge';
    }
  }

  if (emailInput && !emailInput.value) {
    emailInput.value = localStorage.getItem('sr_user_email') || '';
  }
  if (nameInput && !nameInput.value) {
    nameInput.value = localStorage.getItem('sr_user_name') || '';
  }
  if (statusMsg) statusMsg.style.display = 'none';

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeTrackJobModal() {
  const modal = document.getElementById('track-job-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

export function openMyTrackedModal() {
  const modal = document.getElementById('my-tracked-modal');
  if (modal) {
    const emailInput = document.getElementById('tracked-filter-email');
    if (emailInput && !emailInput.value) {
      emailInput.value = localStorage.getItem('sr_user_email') || '';
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

export function closeMyTrackedModal() {
  const modal = document.getElementById('my-tracked-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

export function renderTrackedJobsList(container, trackedList = []) {
  if (!container) return;
  if (!Array.isArray(trackedList) || trackedList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 0.85rem;">
        No active tracked recruitments found for this email address.<br>
        Click "Remind Me" on any job opening to start receiving daily deadline alerts!
      </div>
    `;
    return;
  }

  container.innerHTML = trackedList.map(t => {
    const daysLeft = calculateDaysLeft(t.lastDate);
    const isApplied = t.applied === true;
    const daysText = daysLeft === null ? 'Active' : daysLeft <= 0 ? 'Closes Today' : `${daysLeft}d left`;

    return `
      <div class="tracked-job-row" data-track-id="${escapeHtml(t.id)}">
        <div class="job-main">
          <div class="job-title-text">${escapeHtml(t.jobTitle)}</div>
          <div class="job-meta-row">
            <span><strong>${escapeHtml(t.organization || 'Govt')}</strong></span>
            <span>&bull;</span>
            <span>Deadline: ${escapeHtml(t.lastDateFormatted || 'Check Notice')}</span>
            <span>&bull;</span>
            <span class="${isApplied ? 'badge-status-applied' : 'badge-status-tracking'}">
              ${isApplied ? 'Applied' : `Tracking (${daysText})`}
            </span>
          </div>
          <div class="track-timer-status" id="timer-status-${escapeHtml(t.id)}" style="display:none; font-size: 0.72rem; color: #15803d; margin-top: 4px; font-weight: 600;"></div>
        </div>
        <div class="tracked-job-actions">
          <button type="button" class="btn-test-timer-1m" data-track-id="${escapeHtml(t.id)}" data-email="${escapeHtml(t.email)}" data-title="${escapeHtml(t.jobTitle)}" title="Schedule an automated 1-minute test reminder email to verify delivery">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span class="btn-label">1-Min Test</span>
          </button>
          <button type="button" class="btn-send-now" data-track-id="${escapeHtml(t.id)}" data-email="${escapeHtml(t.email)}" data-title="${escapeHtml(t.jobTitle)}" title="Send reminder email right now to verify immediately">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            <span>Send Now</span>
          </button>
          <button type="button" class="btn-toggle-applied ${isApplied ? 'is-applied' : 'is-pending'}" data-track-id="${escapeHtml(t.id)}" data-current="${isApplied ? 'applied' : 'pending'}">
            ${isApplied ? 'Reactivate' : 'I Applied'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Toast Notification system
 */
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">
      ${type === 'success'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : type === 'error'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    }
    </span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Updates Opportunity Scope pills counter and visibility based on active degree stream
 */
export function updateDegreeScopePills() {
  const container = document.getElementById('degree-scope-container');
  if (!container) return;

  const activeStream = state.filters.degreeStream;
  if (!activeStream || activeStream === 'all') {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  const discInfo = (state.categories.disciplines || []).find(d => d.id === activeStream) || {
    label: activeStream,
    shortLabel: activeStream
  };

  const labelEl = document.getElementById('scope-degree-label');
  const summaryEl = document.getElementById('scope-stat-summary');

  if (labelEl) labelEl.textContent = `${discInfo.shortLabel} Opportunities:`;

  // Tally counts across current fillable jobs
  const allJobs = state.data.latestJobs || [];
  let fieldCount = 0;
  let genCount = 0;
  let totalEligible = 0;

  for (const job of allJobs) {
    const isField = Array.isArray(job.fieldDisciplines) && job.fieldDisciplines.includes(activeStream);
    const isGen = Array.isArray(job.generalDisciplines) && job.generalDisciplines.includes(activeStream);
    const isEligible = Array.isArray(job.eligibleDisciplines) && job.eligibleDisciplines.includes(activeStream);

    if (isField) fieldCount++;
    if (isGen) genCount++;
    if (isEligible) totalEligible++;
  }

  const badgeAll = document.getElementById('badge-count-all');
  const badgeField = document.getElementById('badge-count-field');
  const badgeGen = document.getElementById('badge-count-general');

  if (badgeAll) badgeAll.textContent = totalEligible;
  if (badgeField) badgeField.textContent = fieldCount;
  if (badgeGen) badgeGen.textContent = genCount;

  if (summaryEl) {
    summaryEl.textContent = `${totalEligible} Eligible Jobs (${fieldCount} Direct Branch + ${genCount} Any Degree)`;
  }

  // Update active class on pill buttons
  const pills = container.querySelectorAll('.scope-pill');
  pills.forEach(p => {
    const scope = p.getAttribute('data-scope');
    p.classList.toggle('is-active', scope === (state.filters.degreeScope || 'all'));
  });
}
