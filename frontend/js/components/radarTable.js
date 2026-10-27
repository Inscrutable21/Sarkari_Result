/**
 * Dedicated Special Opportunities Table Component
 * Displays categorized recruitment listings (Research, PSU, Central, State, Internships) with quick tabs and instant search.
 */

import { escapeHtml, safeLink } from './utils.js';

/**
 * Renders the dedicated Opportunities Table
 * @param {HTMLElement} container - Table tbody DOM element
 * @param {Object} portalData - Portal dataset
 * @param {string} activeTab - Sub-category tab filter ('all'|'research'|'psu'|'govt'|'state'|'intern'|'exams')
 * @param {string} searchQuery - Search query string
 */
export function renderRadarTable(container, portalData, activeTab = 'all', searchQuery = '') {
  if (!container) return;

  // Extract all radar items from latestJobs and admissions
  const allLatest = portalData.latestJobs || [];
  const allAdmissions = portalData.admissions || [];

  const radarJobs = allLatest.filter(j => 
    j.source === 'Sarkari Radar' || 
    (j.id && String(j.id).startsWith('sr-')) || 
    Boolean(j.radarCategory)
  );

  const radarExams = allAdmissions.filter(e =>
    e.source === 'Sarkari Radar' ||
    (e.id && String(e.id).startsWith('exam-')) ||
    e.radarCategory === 'exam'
  );

  // Helper: check if opening is tailored for students / scholars
  function isStudentOpportunity(j) {
    if (j.targetAudience === 'student' || j.targetAudience === 'both') return true;
    if (j.radarCategory === 'research' || j.radarCategory === 'intern') return true;
    const corpus = `${j.title || ''} ${j.what || ''} ${j.qualification || ''}`.toLowerCase();
    return /\b(jrf|srf|phd|fellow|intern|apprentice|trainee|gate|graduate)\b/.test(corpus);
  }

  // Helper: check if opening is tailored for experienced professionals
  function isProfessionalOpportunity(j) {
    if (j.targetAudience === 'professional' || j.targetAudience === 'both') return true;
    const corpus = `${j.title || ''} ${j.what || ''} ${j.qualification || ''}`.toLowerCase();
    return /\b(scientist|faculty|professor|lateral|experienced|manager|officer|specialist|postdoc)\b/.test(corpus);
  }

  // Compute sub-tab counts
  const counts = {
    all: radarJobs.length,
    student: 0,
    professional: 0,
    research: 0,
    psu: 0,
    govt: 0,
    state: 0,
    intern: 0,
    exams: radarExams.length
  };

  radarJobs.forEach(j => {
    const k = j.radarCategory || '';
    if (k === 'research') counts.research++;
    else if (k === 'psu') counts.psu++;
    else if (k === 'govt') counts.govt++;
    else if (k === 'intern') counts.intern++;
    else if (k === 'state') counts.state++;

    if (isStudentOpportunity(j)) counts.student++;
    if (isProfessionalOpportunity(j)) counts.professional++;

    // Local / district / state check
    if (j.level === 'state' || j.level === 'district' || j.level === 'block' || (j.state && j.state !== 'Central / All India' && j.state !== 'All India')) {
      if (k !== 'state') counts.state++;
    }
  });

  // Update tab counter DOM badges
  ['all', 'student', 'professional', 'research', 'psu', 'govt', 'state', 'intern', 'exams'].forEach(tab => {
    const el = document.getElementById(`radar-cnt-${tab}`);
    if (el) el.textContent = counts[tab] || 0;
  });

  const totalEl = document.getElementById('radar-total-count');
  if (totalEl) {
    totalEl.innerHTML = `<span><strong>${radarJobs.length}</strong> Active Openings</span>`;
  }

  // Filter items by active tab
  let itemsToDisplay = [];
  if (activeTab === 'exams') {
    itemsToDisplay = radarExams;
  } else if (activeTab === 'student') {
    itemsToDisplay = radarJobs.filter(isStudentOpportunity);
  } else if (activeTab === 'professional') {
    itemsToDisplay = radarJobs.filter(isProfessionalOpportunity);
  } else {
    itemsToDisplay = radarJobs.filter(j => {
      if (activeTab === 'all') return true;
      if (activeTab === 'state') {
        return j.radarCategory === 'state' || j.level === 'state' || j.level === 'district' || j.level === 'block' || (j.state && j.state !== 'Central / All India' && j.state !== 'All India');
      }
      return j.radarCategory === activeTab;
    });
  }

  // Apply search query filter
  const q = String(searchQuery || '').trim().toLowerCase();
  if (q) {
    itemsToDisplay = itemsToDisplay.filter(item => {
      const corpus = `${item.title || ''} ${item.what || ''} ${item.org || ''} ${item.state || ''} ${item.sector || ''} ${item.radarType || ''} ${item.targetAudience || ''} ${item.stipendOrSalary || ''} ${item.qualification || ''}`.toLowerCase();
      return corpus.includes(q);
    });
  }

  if (itemsToDisplay.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" class="radar-empty-cell">
          <div class="radar-empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p class="radar-empty-title">No matching vacancies found</p>
            <p class="radar-empty-desc">${q ? `No results matching "${escapeHtml(q)}". Try searching for "JRF", "PSU", "IIT", or reset search.` : 'No active listings in this category right now.'}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const todayTimestamp = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

  // Sort: closing soonest first
  const sorted = [...itemsToDisplay].sort((a, b) => {
    if (a.lastDate && b.lastDate) return a.lastDate.localeCompare(b.lastDate);
    if (a.lastDate) return -1;
    if (b.lastDate) return 1;
    return 0;
  });

  container.innerHTML = sorted.map(item => {
    const displayTitle = item.what || item.title || 'Government Vacancy';
    const orgName = item.org || item.organization || 'Government Body';
    const sectorName = item.sector || (item.radarCategory === 'research' ? 'Research & Fellowship' : item.radarCategory === 'psu' ? 'Public Sector (PSU)' : 'Government');
    const stateName = item.state || 'Central / All India';
    const levelTag = item.level && item.level !== 'central' ? `<span class="radar-level-badge">${escapeHtml(item.level)}</span>` : '';
    const typeBadge = item.radarType ? `<span class="radar-type-tag">${escapeHtml(item.radarType)}</span>` : '';

    // Deadline badge & countdown
    let dateHtml = '';
    if (item.lastDate) {
      const deadlineTime = new Date(item.lastDate).getTime();
      const diffDays = Math.round((deadlineTime - todayTimestamp) / 86400000);
      let pillClass = 'is-active';
      let pillText = `${diffDays} days left`;

      if (diffDays < 0) {
        pillClass = 'is-expired';
        pillText = 'Closed';
      } else if (diffDays === 0) {
        pillClass = 'is-urgent';
        pillText = 'Last day today!';
      } else if (diffDays <= 3) {
        pillClass = 'is-urgent';
        pillText = `${diffDays} days left`;
      }

      const formatted = item.lastDateFormatted || item.lastDate;
      dateHtml = `
        <div class="radar-date-cell">
          <span class="radar-date-pill ${pillClass}">${pillText}</span>
          <span class="radar-date-val">Until ${escapeHtml(formatted)}</span>
        </div>
      `;
    } else {
      dateHtml = `<span class="radar-date-val text-muted">See Official Notice</span>`;
    }

    const officialUrl = safeLink(item.applyUrl || item.officialSite || item.link);
    const hasOfficial = officialUrl && officialUrl !== '#';

    let audienceBadge = '';
    if (item.targetAudience === 'student') {
      audienceBadge = `<span class="radar-audience-pill pill-student">🎓 Student / Scholar</span>`;
    } else if (item.targetAudience === 'professional') {
      audienceBadge = `<span class="radar-audience-pill pill-professional">💼 Professional</span>`;
    }

    const stipendOrSalary = item.stipendOrSalary || item.details?.stipendOrSalary;
    const salaryBadge = stipendOrSalary ? `<span class="radar-salary-pill">💵 ${escapeHtml(stipendOrSalary)}</span>` : '';

    return `
      <tr class="radar-table-row" data-id="${escapeHtml(item.id)}">
        <td class="td-post">
          <div class="radar-post-title-group">
            <span class="radar-post-title">${escapeHtml(displayTitle)}</span>
            <div class="radar-post-meta-row">
              ${audienceBadge}
              ${typeBadge}
              ${salaryBadge}
              ${item.details?.totalVacancies && item.details.totalVacancies !== 'See Notification' ? `<span class="radar-vac-count">${escapeHtml(item.details.totalVacancies)}</span>` : ''}
              ${item.qualification ? `<span class="radar-qual-tag">${escapeHtml(item.qualification)}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="td-org">
          <div class="radar-org-name">${escapeHtml(orgName)}</div>
        </td>
        <td class="td-sector">
          <span class="badge badge-sector">
            ${escapeHtml(sectorName)}
          </span>
        </td>
        <td class="td-state">
          <div class="radar-state-box">
            <span class="radar-state-text">${escapeHtml(stateName)}</span>
            ${levelTag}
          </div>
        </td>
        <td class="td-date">
          ${dateHtml}
        </td>
        <td class="td-action text-right">
          <div class="radar-action-btn-group">
            <button type="button" class="btn-radar-details" data-id="${escapeHtml(item.id)}">
              Details
            </button>
            ${hasOfficial ? `
              <a href="${officialUrl}" target="_blank" rel="noopener" class="btn-radar-official" onclick="event.stopPropagation();" title="Open official site">
                Apply
              </a>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
