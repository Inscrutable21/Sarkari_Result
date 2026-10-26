/**
 * Core UI Utilities & Sanitizers
 * Pure helper functions for XSS prevention, safe link validation, and icon rendering.
 */

/**
 * Escapes HTML characters to prevent XSS injection
 * @param {*} str - Input string to sanitize
 * @returns {string} Sanitized string
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

/**
 * Allow only valid web URLs (http/https) without embedded credentials before inserting into href attributes.
 * @param {string} value - Candidate URL string
 * @returns {string} Safe escaped URL or '#' fallback
 */
export function safeLink(value) {
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
      return escapeHtml(url.href);
    }
  } catch { }
  return '#';
}

/**
 * Sector icon helper for reference-style avatar icons (SVG only, zero emojis)
 * @param {string} sector - Department or sector name
 * @param {string} title - Job or notice title
 * @returns {string} SVG icon markup
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

/**
 * Calculates remaining days until deadline date
 * @param {string} lastDateStr - Date string (YYYY-MM-DD)
 * @returns {number|null} Days left or null if invalid
 */
export function calculateDaysLeft(lastDateStr) {
  if (!lastDateStr) return null;
  const deadline = new Date(lastDateStr + 'T23:59:59');
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
