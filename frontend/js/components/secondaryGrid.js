/**
 * Secondary Information Services Component
 * Handles Answer Keys, Syllabus, Admissions, and Certificate Verification grids.
 */

import { filterItems } from '../state.js';
import { escapeHtml, safeLink } from './utils.js';

/**
 * Renders Secondary Service Grid (Answer Keys, Syllabus, Admissions, Certificates)
 * @param {HTMLElement} container - Grid container DOM element
 * @param {Array} items - List of secondary items
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
