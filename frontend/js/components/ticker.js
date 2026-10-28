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

  const html = items.map(item => {
    const isExternal = item.link && item.link.startsWith('http');
    const relAttr = isExternal ? 'rel="nofollow noopener"' : '';
    const linkText = item.text && item.text.trim() ? escapeHtml(item.text) : 'Important Recruitment Announcement';
    return `
      <span class="ticker-item">
        <span class="ticker-badge">${escapeHtml(item.badge || 'UPDATE')}</span>
        <a href="${item.link ? escapeHtml(item.link) : '#item-detail-modal'}" class="ticker-link" data-id="${escapeHtml(item.id || '')}" aria-label="${linkText}" ${relAttr}>
          ${linkText}
        </a>
        <span class="ticker-sep">&bull;</span>
      </span>
    `;
  }).join('');

  container.innerHTML = html + html; // duplicate content for smooth continuous scrolling
}
