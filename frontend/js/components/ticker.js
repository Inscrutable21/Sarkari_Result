/**
 * Live Announcement & Breaking News Ticker Component
 * Renders continuously updating marquee ticker with urgent announcements.
 */

import { escapeHtml } from './utils.js';

/**
 * Renders the top announcement breaking news ticker
 * @param {HTMLElement} container - DOM container element
 * @param {Array} items - List of ticker items
 */
export function renderTicker(container, items) {
  if (!container || !Array.isArray(items) || items.length === 0) return;

  const html = items.map(item => `
    <span class="ticker-item">
      <span class="ticker-badge">${escapeHtml(item.badge || 'UPDATE')}</span>
      <a href="${item.link ? escapeHtml(item.link) : '#item-detail-modal'}" class="ticker-link" data-id="${escapeHtml(item.id || '')}">
        ${escapeHtml(item.text)}
      </a>
      <span class="ticker-sep">&bull;</span>
    </span>
  `).join('');

  container.innerHTML = html + html; // duplicate content for smooth continuous scrolling
}
