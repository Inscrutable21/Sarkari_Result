/**
 * Three-Column Core Matrix Component
 * Renders Results, Admit Cards, and Latest Jobs with degree match indicators and countdown timers.
 */

import { state, filterItems } from '../state.js';
import { escapeHtml, getSectorIcon } from './utils.js';

/**
 * Renders an item card inside a Matrix column (Results, Admit Cards, Latest Jobs)
 * @param {Object} item - Portal posting item
 * @returns {string} Card HTML string
 */
export function createMatrixItemHtml(item) {
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
      <div class="matrix-item-avatar" aria-hidden="true">
        <span>${sectorIcon}</span>
      </div>

      <div class="matrix-item-content">
        <div class="matrix-item-title">
          ${escapeHtml(item.title)}
          ${isRecentNew ? '<span class="matrix-badge-new">New</span>' : ''}
        </div>

        <div class="matrix-item-badges">
          <span class="badge badge-sector">
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
 * Renders the 3-column sarkari hith Matrix (Results, Admit Cards, Latest Jobs)
 * @param {HTMLElement} resultsContainer - Results column DOM element
 * @param {HTMLElement} admitCardsContainer - Admit Cards column DOM element
 * @param {HTMLElement} jobsContainer - Latest Jobs column DOM element
 * @param {Object} data - Portal dataset containing results, admitCards, latestJobs
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
