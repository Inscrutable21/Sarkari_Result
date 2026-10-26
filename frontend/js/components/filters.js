/**
 * Multi-Dimensional Filter Controls Component
 * Handles Sector category chips, State & Qualification dropdowns, and Candidate Degree Scope pills.
 */

import { state } from '../state.js';
import { escapeHtml } from './utils.js';

/**
 * Renders sector filter chips with active state and count badges
 * @param {HTMLElement} container - Chip container DOM element
 * @param {Array} sectors - Sector metadata list
 * @param {string} activeSector - Current active sector identifier
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
 * @param {HTMLSelectElement} stateSelect - State dropdown element
 * @param {HTMLSelectElement} qualSelect - Qualification dropdown element
 * @param {Object} categories - Available category listings
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
