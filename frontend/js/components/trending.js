/**
 * Trending Highlights Component
 * Renders priority featured notifications and top recruitment announcements.
 */

import { filterItems } from '../state.js';
import { escapeHtml } from './utils.js';

const TRENDING_THEMES = [
  { numBg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', watermark: '' },
  { numBg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', watermark: '' },
  { numBg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', watermark: '' },
  { numBg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', watermark: '' },
  { numBg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', watermark: '' }
];

/**
 * Renders Trending Highlight Cards
 * @param {HTMLElement} container - DOM grid container
 * @param {Array} items - List of trending items
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
      <article class="trending-card" data-id="${escapeHtml(item.id)}">
        <div class="trending-card-top-row">
          <div class="trending-num-badge" style="background: ${theme.numBg};">
            ${itemNum}
          </div>
          <span class="badge badge-sector">
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
