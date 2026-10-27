/**
 * Dedicated Context.dev Institutional & PSU Opportunities Section Component
 * Renders verified research fellowships, scientist openings, and PSU recruitments
 * extracted from premier Indian institutions (IITs, NITs, IISc, CSIR, DRDO, ISRO, PSUs).
 */

import { escapeHtml, safeLink } from './utils.js';
import { openModal } from './modals.js';

/**
 * Derives a clean monogram / acronym for an institution (e.g. "DRDO", "IITK", "BHEL")
 */
function getOrgInitials(org = '', title = '') {
  const corpus = `${org} ${title}`.toUpperCase();
  const known = ['DRDO', 'ISRO', 'CSIR', 'BARC', 'ICMR', 'ICAR', 'TIFR', 'AIIMS', 'BHEL', 'ONGC', 'NTPC', 'IOCL', 'GAIL', 'SAIL', 'BEL', 'HAL', 'POWERGRID', 'CDAC', 'IISC', 'IIT', 'NIT'];
  for (const k of known) {
    if (corpus.includes(k)) return k;
  }
  // Fallback: first 2-4 letters of org
  const words = org.replace(/[^A-Za-z\s]/g, '').trim().split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return org.slice(0, 3).toUpperCase() || 'GOV';
}

/**
 * Deterministic color gradient for institution badges
 */
function getOrgGradient(initials) {
  const gradients = [
    'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', // Blue
    'linear-gradient(135deg, #059669 0%, #047857 100%)', // Emerald
    'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', // Purple
    'linear-gradient(135deg, #d97706 0%, #b45309 100%)', // Amber
    'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)', // Cyan
    'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', // Rose
    'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)'  // Indigo
  ];
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = (hash << 5) - hash + initials.charCodeAt(i);
  }
  const idx = Math.abs(hash) % gradients.length;
  return gradients[idx];
}

/**
 * Checks if an item is suited for students and scholars
 */
function isStudentOpening(item) {
  if (item.targetAudience === 'student' || item.targetAudience === 'both') return true;
  if (item.radarCategory === 'research' || item.radarCategory === 'intern') return true;
  const corpus = `${item.title || ''} ${item.qualification || ''} ${item.radarType || ''}`.toLowerCase();
  return /\b(jrf|srf|phd|fellow|intern|apprentice|trainee|gate|graduate|m\.?tech|m\.?sc)\b/.test(corpus);
}

/**
 * Checks if an item is suited for experienced professionals
 */
function isProfessionalOpening(item) {
  if (item.targetAudience === 'professional' || item.targetAudience === 'both') return true;
  const corpus = `${item.title || ''} ${item.qualification || ''} ${item.radarType || ''}`.toLowerCase();
  return /\b(scientist|faculty|professor|lateral|experienced|manager|specialist|officer|postdoc|executive)\b/.test(corpus);
}

/**
 * Renders the dedicated Context.dev section
 * @param {HTMLElement} container - Card grid DOM element
 * @param {Object} portalData - Entire portal dataset
 * @param {string} activeTab - Active sub-tab ('all'|'student'|'professional'|'research'|'psu')
 * @param {string} searchQuery - Search query string
 */
export function renderContextDevSection(container, portalData, activeTab = 'all', searchQuery = '') {
  if (!container) return;

  const allJobs = portalData.latestJobs || [];
  const allTrending = portalData.trending || [];
  const mergedPool = [...allJobs, ...allTrending];

  // 1. Gather all Context.dev extracted openings
  let contextItems = mergedPool.filter(j =>
    j.source === 'Government Institute (Context)' ||
    (j.id && String(j.id).startsWith('cd-'))
  );

  // If Context.dev items are few (e.g. before initial live sync), supplement with premier institutional & research vacancies
  if (contextItems.length < 6) {
    const seen = new Set(contextItems.map(i => i.id || i.link));
    const premierItems = mergedPool.filter(j => {
      if (seen.has(j.id || j.link)) return false;
      const corpus = `${j.organization || ''} ${j.title || ''}`.toLowerCase();
      return (
        j.radarCategory === 'research' ||
        j.radarCategory === 'psu' ||
        corpus.includes('iit') ||
        corpus.includes('drdo') ||
        corpus.includes('isro') ||
        corpus.includes('csir') ||
        corpus.includes('ongc') ||
        corpus.includes('bhel') ||
        corpus.includes('ntpc')
      );
    });
    contextItems = [...contextItems, ...premierItems];
  }

  // De-duplicate by link or ID
  const uniqueItemsMap = new Map();
  for (const item of contextItems) {
    const key = item.link && item.link !== '#' ? item.link : item.id;
    if (key && !uniqueItemsMap.has(key)) {
      uniqueItemsMap.set(key, item);
    }
  }
  const allContextOpenings = Array.from(uniqueItemsMap.values());

  // 2. Compute tab counts
  let studentCount = 0;
  let professionalCount = 0;
  let researchCount = 0;
  let psuCount = 0;

  allContextOpenings.forEach(item => {
    if (isStudentOpening(item)) studentCount++;
    if (isProfessionalOpening(item)) professionalCount++;
    if (item.radarCategory === 'research' || item.sector === 'Research & Fellowship') researchCount++;
    if (item.radarCategory === 'psu' || item.sector === 'Public Sector (PSU)') psuCount++;
  });

  // Update top metrics card
  const statTotal = document.getElementById('ctx-stat-total');
  const statStudents = document.getElementById('ctx-stat-students');
  const statProf = document.getElementById('ctx-stat-professionals');
  if (statTotal) statTotal.textContent = allContextOpenings.length;
  if (statStudents) statStudents.textContent = studentCount;
  if (statProf) statProf.textContent = professionalCount;

  // Update tab counter badges
  const counts = {
    all: allContextOpenings.length,
    student: studentCount,
    professional: professionalCount,
    research: researchCount,
    psu: psuCount
  };
  ['all', 'student', 'professional', 'research', 'psu'].forEach(tab => {
    const el = document.getElementById(`ctx-cnt-${tab}`);
    if (el) el.textContent = counts[tab] || 0;
  });

  // 3. Filter items by active tab
  let filtered = allContextOpenings.filter(item => {
    if (activeTab === 'student') return isStudentOpening(item);
    if (activeTab === 'professional') return isProfessionalOpening(item);
    if (activeTab === 'research') return item.radarCategory === 'research' || item.sector === 'Research & Fellowship';
    if (activeTab === 'psu') return item.radarCategory === 'psu' || item.sector === 'Public Sector (PSU)';
    return true;
  });

  // 4. Apply search query filter
  const q = String(searchQuery || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(item => {
      const corpus = `${item.title || ''} ${item.organization || ''} ${item.sector || ''} ${item.qualification || ''} ${item.state || ''} ${item.stipendOrSalary || ''} ${item.radarType || ''}`.toLowerCase();
      return corpus.includes(q);
    });
  }

  // 5. Handle empty state
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="ctx-empty-state">
        <div class="ctx-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h4 class="ctx-empty-title">No matching institutional openings found</h4>
        <p class="ctx-empty-desc">
          ${q ? `No openings matching "${escapeHtml(q)}". Try searching for "DRDO", "JRF", "BHEL", "NTPC", or "IIT".` : 'No active openings in this category right now. Check back soon for fresh Context.dev scrapes.'}
        </p>
      </div>
    `;
    return;
  }

  // 6. Sort: closing soonest first
  const todayTimestamp = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const sorted = [...filtered].sort((a, b) => {
    if (a.lastDate && b.lastDate) return a.lastDate.localeCompare(b.lastDate);
    if (a.lastDate) return -1;
    if (b.lastDate) return 1;
    return 0;
  });

  // 7. Render interactive cards
  container.innerHTML = sorted.map(item => {
    const title = item.title || 'Government Institutional Opening';
    const org = item.organization || 'Government Institution';
    const initials = getOrgInitials(org, title);
    const gradient = getOrgGradient(initials);
    const sector = item.sector || (item.radarCategory === 'research' ? 'Research & Fellowship' : 'Public Sector (PSU)');
    const state = item.state || 'Central / All India';
    const qual = item.qualification || 'As per official notification';
    const vacancies = item.details?.totalVacancies || item.totalVacancies;
    const stipend = item.stipendOrSalary || item.details?.stipendOrSalary;

    // Audience Tag
    let audienceHtml = '';
    if (item.targetAudience === 'student' || isStudentOpening(item)) {
      audienceHtml = `<span class="ctx-tag-audience tag-student">🎓 Student / Scholar</span>`;
    } else if (item.targetAudience === 'professional' || isProfessionalOpening(item)) {
      audienceHtml = `<span class="ctx-tag-audience tag-professional">💼 Professional / Lateral</span>`;
    }

    // Opportunity Type
    const typeTag = item.radarType ? `<span class="ctx-tag-type">${escapeHtml(item.radarType)}</span>` : '';

    // Stipend Badge
    const stipendHtml = stipend ? `<span class="ctx-tag-stipend">💵 ${escapeHtml(stipend)}</span>` : '';

    // Deadline pill
    let deadlineHtml = '';
    if (item.lastDate) {
      const deadlineTime = new Date(item.lastDate).getTime();
      const diffDays = Math.round((deadlineTime - todayTimestamp) / 86400000);
      let pillClass = 'pill-active';
      let pillText = `${diffDays} days left`;

      if (diffDays < 0) {
        pillClass = 'pill-closed';
        pillText = 'Closed';
      } else if (diffDays === 0) {
        pillClass = 'pill-urgent';
        pillText = 'Closing Today!';
      } else if (diffDays <= 3) {
        pillClass = 'pill-urgent';
        pillText = `${diffDays} days left`;
      }

      const formatted = item.lastDateFormatted || item.lastDate;
      deadlineHtml = `
        <div class="ctx-deadline-wrapper">
          <span class="ctx-deadline-badge ${pillClass}">${pillText}</span>
          <span class="ctx-deadline-date">Deadline: <strong>${escapeHtml(formatted)}</strong></span>
        </div>
      `;
    } else {
      deadlineHtml = `<span class="ctx-deadline-date text-muted">Deadline: Active Notification</span>`;
    }

    const officialUrl = safeLink(item.link || item.applyUrl || item.officialSite);
    const hasOfficial = officialUrl && officialUrl !== '#';

    return `
      <article class="ctx-opening-card" data-id="${escapeHtml(item.id)}">
        <!-- Card Top Bar: Monogram, Org Name, Region -->
        <div class="ctx-card-header">
          <div class="ctx-org-group">
            <div class="ctx-monogram" style="background: ${gradient};">
              ${escapeHtml(initials)}
            </div>
            <div class="ctx-org-details">
              <h4 class="ctx-org-name" title="${escapeHtml(org)}">${escapeHtml(org)}</h4>
              <span class="ctx-region-text">${escapeHtml(state)}</span>
            </div>
          </div>
          <div class="ctx-sector-badge">
            ${escapeHtml(sector)}
          </div>
        </div>

        <!-- Card Title -->
        <div class="ctx-card-body">
          <h3 class="ctx-opening-title" title="${escapeHtml(title)}">
            ${escapeHtml(title)}
          </h3>

          <!-- Tags & Badges Row -->
          <div class="ctx-tags-row">
            ${audienceHtml}
            ${typeTag}
            ${stipendHtml}
            ${vacancies && vacancies !== 'Refer Notification' ? `<span class="ctx-tag-vacancies">${escapeHtml(vacancies)}</span>` : ''}
          </div>

          <!-- Qualification Snippet -->
          <p class="ctx-qual-text" title="${escapeHtml(qual)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ctx-qual-icon">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
              <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"></path>
            </svg>
            <span><strong>Eligibility:</strong> ${escapeHtml(qual)}</span>
          </p>
        </div>

        <!-- Card Footer: Deadline & Action Buttons -->
        <div class="ctx-card-footer">
          ${deadlineHtml}
          
          <div class="ctx-card-actions">
            <button type="button" class="btn-ctx-details" data-id="${escapeHtml(item.id)}" title="View complete notification details">
              Details
            </button>
            ${hasOfficial ? `
              <a href="${officialUrl}" target="_blank" rel="noopener" class="btn-ctx-apply" onclick="event.stopPropagation();" title="Open official institution notice / application">
                Apply Official &rarr;
              </a>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  // 8. Attach click listeners for "Details" buttons to launch the details modal
  container.querySelectorAll('.btn-ctx-details').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const item = allContextOpenings.find(i => String(i.id) === String(id));
      if (item) openModal(item);
    });
  });

  // Also make the whole card clickable for details
  container.querySelectorAll('.ctx-opening-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('button')) return;
      const id = card.getAttribute('data-id');
      const item = allContextOpenings.find(i => String(i.id) === String(id));
      if (item) openModal(item);
    });
  });
}
