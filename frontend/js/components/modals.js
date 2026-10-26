/**
 * Interactive Modals & Dialogs Component
 * Manages Posting Details Modal, Job Alerts Subscription, Daily Deadline Tracking, and My Tracked Jobs Dashboard.
 */

import { state } from '../state.js';
import { fetchPostingDetails } from '../api.js';
import { escapeHtml, safeLink, calculateDaysLeft } from './utils.js';
import { showToast } from './toast.js';

let modalRequestId = 0;

/**
 * Helper to determine detailed vacancy row match against candidate's active stream
 */
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

/**
 * Renders details into the modal DOM elements
 * @param {Object} item - Portal posting item
 */
export function renderModalContent(item) {
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
 * @param {Object} item - Portal posting item
 */
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

/**
 * Closes the item detail modal dialog
 */
export function closeModal() {
  modalRequestId++;
  const modal = document.getElementById('item-detail-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/**
 * Opens email job alerts subscription modal
 */
export function openAlertsModal() {
  const modal = document.getElementById('job-alerts-modal');
  if (modal) {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Closes email job alerts subscription modal
 */
export function closeAlertsModal() {
  const modal = document.getElementById('job-alerts-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/**
 * Opens the application deadline tracking modal
 * @param {Object} item - Portal posting item
 */
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

/**
 * Closes the deadline tracking modal
 */
export function closeTrackJobModal() {
  const modal = document.getElementById('track-job-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/**
 * Opens candidate's personal tracked recruitments dashboard
 */
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

/**
 * Closes candidate's tracked recruitments dashboard
 */
export function closeMyTrackedModal() {
  const modal = document.getElementById('my-tracked-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/**
 * Renders candidate's list of active tracked recruitments inside dashboard modal
 * @param {HTMLElement} container - DOM container element
 * @param {Array} trackedList - List of tracked records
 */
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
