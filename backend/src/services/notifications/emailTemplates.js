const { escapeHtml, safeHttpUrl } = require('./constants');

/**
 * Builds HTML template for Job Alerts
 */
function buildJobAlertEmailHtml({ subscriber, jobs, isTest = false, isConfirmation = false }) {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
  const degreeText = Array.isArray(subscriber.disciplines) && !subscriber.disciplines.includes('all')
    ? subscriber.disciplines.join(', ').toUpperCase().replace(/_/g, ' ')
    : 'All Streams';

  const qualText = subscriber.qualification !== 'all' ? subscriber.qualification : 'Any Eligibility';
  const cleanPortalUrl = escapeHtml(safeHttpUrl(portalUrl, 'https://www.sarkariresult.com'));
  const candidateName = escapeHtml(subscriber.name || 'Job Aspirant');

  const jobsListHtml = jobs.map((job, idx) => {
    const applyLink = escapeHtml(safeHttpUrl(job.link, portalUrl));
    const lastDate = escapeHtml(job.lastDateFormatted || job.lastDate || 'Check Notification');
    const org = escapeHtml(job.organization || 'Government of India');
    const sectorBadge = escapeHtml(job.sector || 'Central / State');
    const jobTitle = escapeHtml(job.title || 'Government Recruitment Vacancy');
    const jobQual = escapeHtml(job.qualification || 'Check official advertisement');
    const vacancies = job.details?.totalVacancies ? escapeHtml(String(job.details.totalVacancies)) : null;

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 16px; box-shadow: 0 2px 5px rgba(15, 23, 42, 0.04); overflow: hidden;">
        <tr>
          <td style="padding: 18px 20px;">
            <!-- Badges Row -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
              <tr>
                <td align="left" style="vertical-align: middle;">
                  <span style="display: inline-block; background-color: #fee2e2; color: #991b1b; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.5px; border: 1px solid #fecaca;">
                    🏛️ ${org} &bull; ${sectorBadge}
                  </span>
                </td>
                <td align="right" style="vertical-align: middle;">
                  <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px; border: 1px solid #fde68a;">
                    📅 Last Date: <strong>${lastDate}</strong>
                  </span>
                </td>
              </tr>
            </table>

            <!-- Job Title -->
            <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;">
              <span style="color: #b30000; font-weight: 800;">${idx + 1}.</span> ${jobTitle}
            </h3>

            <!-- Details Chips / Summary -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #edf2f7; border-radius: 6px; margin-bottom: 14px;">
              <tr>
                <td style="padding: 10px 14px; font-size: 13px; color: #475569; line-height: 1.5;">
                  <span style="color: #64748b; font-weight: 600;">🎓 Eligibility:</span> <strong style="color: #1e293b;">${jobQual}</strong>
                  ${vacancies ? `<span style="color: #cbd5e1; margin: 0 8px;">|</span><span style="color: #64748b; font-weight: 600;">👥 Vacancies:</span> <strong style="color: #047857; background-color: #ecfdf5; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0;">${vacancies} Posts</strong>` : ''}
                </td>
              </tr>
            </table>

            <!-- Action Button -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius: 6px; background-color: #b30000;">
                  <a href="${applyLink}" target="_blank" rel="noopener noreferrer" style="border: 1px solid #b30000; border-radius: 6px; display: inline-block; padding: 9px 20px; font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.2px;">
                    Apply Online / View Notification &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sarkari Hith Job Alert</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 24px 8px;">
    <tr>
      <td align="center">
        <!-- Main Email Container (620px max) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Indian Tricolor Accent Top Bar -->
          <tr>
            <td style="line-height: 0; font-size: 0; padding: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height: 4px;">
                <tr>
                  <td width="33%" style="background-color: #ff9933; height: 4px;"></td>
                  <td width="34%" style="background-color: #ffffff; height: 4px;"></td>
                  <td width="33%" style="background-color: #138808; height: 4px;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Header Masthead -->
          <tr>
            <td style="background-color: #990000; padding: 24px 28px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 20px; padding: 4px 14px; margin-bottom: 10px;">
                      <span style="color: #fef08a; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
                        🏛️ OFFICIAL GOVERNMENT RECRUITMENT ALERTS
                      </span>
                    </div>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: 0.6px; line-height: 1.2;">
                      SARKARI HITH
                    </h1>
                    <p style="margin: 6px 0 0 0; font-size: 13px; color: #fecaca; font-weight: 500; line-height: 1.4;">
                      National Government Examination &amp; Recruitment Notification Portal
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notification Context & Personalization Banner -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 24px; border-bottom: 1px solid #e2e8f0;">
              ${isTest ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; margin-bottom: 14px;">
                  <tr>
                    <td style="padding: 10px 14px; color: #3730a3; font-size: 13px; font-weight: 600;">
                      🧪 <strong>TEST NOTIFICATION PREVIEW:</strong> Your email alert configuration is verified and functioning normally.
                    </td>
                  </tr>
                </table>
              ` : ''}

              ${isConfirmation ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ecfdf5; border: 1px solid #86efac; border-radius: 8px; margin-bottom: 14px;">
                  <tr>
                    <td style="padding: 12px 14px; color: #166534; font-size: 13px; line-height: 1.45;">
                      <div style="font-weight: 800; margin-bottom: 2px;">🎉 SUBSCRIPTION ACTIVATED SUCCESSFULLY</div>
                      You are now subscribed to Sarkari Job Alerts! You will automatically receive verified alerts as new eligible vacancies are officially announced.
                    </td>
                  </tr>
                </table>
              ` : ''}

              <div style="font-size: 14px; color: #1e293b; line-height: 1.5; margin-bottom: 10px;">
                <strong>Namaste ${candidateName},</strong><br>
                ${isConfirmation 
                  ? 'Your notification preferences are active. Below are currently open recruitment notifications matching your profile:' 
                  : `We identified <strong>${jobs.length} government vacancies</strong> aligned with your educational qualifications:`}
              </div>

              <!-- Filter Tags -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #334155; margin-right: 6px; margin-bottom: 6px;">
                      <strong>Stream:</strong> ${escapeHtml(degreeText)}
                    </span>
                    <span style="display: inline-block; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #334155; margin-right: 6px; margin-bottom: 6px;">
                      <strong>Qualification:</strong> ${escapeHtml(qualText)}
                    </span>
                    <span style="display: inline-block; background-color: #ecfdf5; border: 1px solid #86efac; padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #166534; font-weight: 700; margin-bottom: 6px;">
                      ✓ Status: Active &amp; Verified
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Jobs List Content -->
          <tr>
            <td style="padding: 22px 24px; background-color: #f1f5f9;">
              ${jobsListHtml || `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 32px 20px; text-align: center;">
                  <tr>
                    <td align="center">
                      <div style="font-size: 32px; margin-bottom: 8px;">🔔</div>
                      <div style="font-size: 15px; font-weight: 700; color: #334155; margin-bottom: 4px;">No New Vacancies Today</div>
                      <div style="font-size: 13px; color: #64748b; max-width: 420px; margin: 0 auto; line-height: 1.5;">
                        We are continuously monitoring official commissions and boards. You will receive an alert as soon as fresh matching vacancies are announced!
                      </div>
                    </td>
                  </tr>
                </table>
              `}

              <!-- Candidate Verification Advisory Notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin-top: 10px;">
                <tr>
                  <td style="padding: 14px 16px; font-size: 12px; color: #92400e; line-height: 1.5;">
                    ⚠️ <strong>Candidate Advisory:</strong> Always verify the official notification PDF, reservation rules, exam fee deadlines, and educational eligibility criteria on the official commission/board website before submitting application forms or fee payments.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Portal Quick Links Bar -->
          <tr>
            <td style="background-color: #ffffff; padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-size: 12px; font-weight: 600; color: #475569;">
                    <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; padding: 0 6px;">Home</a> &bull;
                    <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; padding: 0 6px;">Latest Jobs</a> &bull;
                    <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; padding: 0 6px;">Admit Cards</a> &bull;
                    <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; padding: 0 6px;">Answer Keys</a> &bull;
                    <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; padding: 0 6px;">Results</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Professional Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
                Sarkari Hith &bull; National Employment &amp; Examination Information Portal
              </p>
              <p style="margin: 0 0 8px 0;">
                You received this notification because you subscribed to custom recruitment alerts on <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; font-weight: 700;">sarkari hith</a>.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Free Candidate Welfare &amp; Notification Service &bull; 100% Free &amp; Open Access &bull; All Rights Reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds HTML template for Job Specific Reminders & Confirmation
 */
function buildJobReminderEmailHtml({ track, daysLeft, isConfirmation = false, isTestReminder = false }) {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
  const applyLink = escapeHtml(safeHttpUrl(track.link, portalUrl));
  const deadlineFormatted = escapeHtml(track.lastDateFormatted || track.lastDate || 'Check official advertisement');
  const org = escapeHtml(track.organization || 'Government of India');
  const jobTitle = escapeHtml(track.jobTitle || 'Government Recruitment');
  const cleanPortalUrl = escapeHtml(safeHttpUrl(portalUrl, 'https://www.sarkariresult.com'));

  const emailParam = encodeURIComponent(track.email || '');
  const jobParam = encodeURIComponent(track.jobId || track.jobTitle || '');
  const statusBaseUrl = `${portalUrl}/api/track-job/status?trackId=${encodeURIComponent(track.id || '')}&email=${emailParam}&job=${jobParam}`;
  const appliedUrl = `${statusBaseUrl}&status=applied`;
  const pendingUrl = `${statusBaseUrl}&status=pending`;

  let headline = '';
  let subheadline = '';
  let badgeText = '';
  let badgeBg = '#dbeafe';
  let badgeColor = '#1e40af';
  let bannerBg = '#eff6ff';
  let bannerBorder = '#bfdbfe';

  if (isTestReminder) {
    headline = '1-Minute Test Reminder: ' + (daysLeft !== null && daysLeft > 0 ? `${daysLeft} Days Remaining` : 'Deadline Countdown Alert');
    subheadline = 'This confirms your deadline countdown alerts are fully active. You will receive scheduled daily updates at 6:00 PM IST until you submit your form.';
    badgeText = daysLeft !== null && daysLeft > 0 ? `${daysLeft} Days Left (Test Passed)` : '1-Min Test Passed';
    badgeBg = '#dcfce7';
    badgeColor = '#15803d';
    bannerBg = '#f0fdf4';
    bannerBorder = '#bbf7d0';
  } else if (isConfirmation) {
    headline = 'Application Reminders Activated';
    subheadline = 'You are successfully subscribed to daily deadline countdown reminders for this recruitment.';
    badgeText = daysLeft !== null && daysLeft >= 0 ? `${daysLeft} Days Remaining` : 'Active Recruitment';
    bannerBg = '#ecfdf5';
    bannerBorder = '#86efac';
  } else if (daysLeft === 0) {
    headline = 'FINAL DAY TO APPLY TODAY';
    subheadline = 'The application window closes TONIGHT. Please submit your online form and fees before the deadline expires.';
    badgeText = 'Closes Today';
    badgeBg = '#fee2e2';
    badgeColor = '#b91c1c';
    bannerBg = '#fef2f2';
    bannerBorder = '#fecaca';
  } else if (daysLeft === 1) {
    headline = '1 DAY REMAINING: Deadline Tomorrow';
    subheadline = 'Only 1 day left before the application portal closes. Complete and submit your registration promptly.';
    badgeText = '1 Day Left';
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
    bannerBg = '#fffbeb';
    bannerBorder = '#fde68a';
  } else if (daysLeft !== null && daysLeft > 1) {
    headline = `${daysLeft} DAYS LEFT: Please Fill The Form`;
    subheadline = 'Daily deadline countdown reminder for your tracked government recruitment.';
    badgeText = `${daysLeft} Days Left`;
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
    bannerBg = '#fffbeb';
    bannerBorder = '#fde68a';
  } else {
    headline = 'Application Deadline Notification';
    subheadline = 'Please verify closing dates and complete your application promptly before the deadline.';
    badgeText = 'Check Closing Date';
    badgeBg = '#e0f2fe';
    badgeColor = '#0369a1';
    bannerBg = '#f0f9ff';
    bannerBorder = '#bae6fd';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sarkari Hith Job Reminder</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 24px 8px;">
    <tr>
      <td align="center">
        <!-- Main Container (600px max) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Indian Tricolor Accent Top Bar -->
          <tr>
            <td style="line-height: 0; font-size: 0; padding: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height: 4px;">
                <tr>
                  <td width="33%" style="background-color: #ff9933; height: 4px;"></td>
                  <td width="34%" style="background-color: #ffffff; height: 4px;"></td>
                  <td width="33%" style="background-color: #138808; height: 4px;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Header Masthead -->
          <tr>
            <td style="background-color: #990000; padding: 22px 26px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 20px; padding: 3px 12px; margin-bottom: 8px;">
                      <span style="color: #fef08a; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;">
                        ⏱️ CANDIDATE DEADLINE TRACKER
                      </span>
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2;">
                      SARKARI HITH
                    </h1>
                    <p style="margin: 4px 0 0 0; color: #fecaca; font-size: 12px; font-weight: 500;">
                      Candidate Deadline Tracking &amp; Application Countdown Service
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding: 24px 26px;">
              
              <!-- Urgency Hero / Status Banner -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${bannerBg}; border: 1px solid ${bannerBorder}; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <div style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 3px 10px; border-radius: 4px; letter-spacing: 0.5px; margin-bottom: 8px;">
                      ${badgeText}
                    </div>
                    <h2 style="margin: 0 0 6px 0; font-size: 19px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                      ${headline}
                    </h2>
                    <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
                      ${subheadline}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Tracked Job Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 22px; overflow: hidden;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                      🏛️ ${org}
                    </div>
                    <h3 style="margin: 0 0 14px 0; font-size: 17px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                      ${jobTitle}
                    </h3>

                    <!-- Deadline Specs Grid -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #edf2f7; border-radius: 6px; margin-bottom: 16px;">
                      <tr>
                        <td style="padding: 12px 14px; font-size: 13px; color: #334155; line-height: 1.5;">
                          <div style="margin-bottom: 4px;">
                            <span style="color: #64748b; font-weight: 600;">📅 Application Deadline:</span>
                            <strong style="color: #b91c1c; font-size: 14px; margin-left: 4px;">${deadlineFormatted}</strong>
                          </div>
                          ${daysLeft !== null && daysLeft >= 0 ? `
                            <div>
                              <span style="color: #64748b; font-weight: 600;">⏱️ Time Remaining:</span>
                              <strong style="color: #0369a1; margin-left: 4px;">${daysLeft} calendar day(s) left</strong>
                            </div>
                          ` : ''}
                        </td>
                      </tr>
                    </table>

                    <!-- Official Apply CTA Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-radius: 6px; background-color: #b30000;">
                          <a href="${applyLink}" target="_blank" rel="noopener noreferrer" style="border: 1px solid #b30000; border-radius: 6px; display: inline-block; padding: 10px 22px; font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.2px;">
                            Apply Online &amp; Official Notification &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Interactive Application Status Check -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 10px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 22px 20px; text-align: center;">
                    <div style="display: inline-block; background-color: #eff6ff; color: #1e40af; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 3px 10px; border-radius: 20px; margin-bottom: 8px;">
                      1-TAP STATUS UPDATE
                    </div>
                    <h4 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                      Have you submitted your application for this post?
                    </h4>
                    <p style="margin: 0 0 18px 0; font-size: 13px; color: #64748b; line-height: 1.45; max-width: 440px; margin-left: auto; margin-right: auto;">
                      Click an option below to update your status instantly with one tap (no password required):
                    </p>

                    <!-- Green Applied Button -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 360px;">
                            <tr>
                              <td align="center" style="background-color: #16a34a; border-radius: 8px;">
                                <a href="${appliedUrl}" style="display: block; padding: 12px 18px; font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; border: 1px solid #16a34a; text-align: center;">
                                  ✓ Yes, I Have Applied &mdash; Stop Reminders
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- White / Gray Pending Button -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 360px;">
                            <tr>
                              <td align="center" style="background-color: #ffffff; border-radius: 8px;">
                                <a href="${pendingUrl}" style="display: block; padding: 10px 18px; font-size: 13px; font-weight: 600; color: #475569; text-decoration: none; border-radius: 8px; border: 1px solid #cbd5e1; text-align: center;">
                                  ⏳ Not Yet Applied &mdash; Remind Me Tomorrow
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 14px 0 0 0; font-size: 11px; color: #94a3b8; line-height: 1.4;">
                      If no option is clicked, we will continue delivering daily countdown alerts until the closing date.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Advisory Notice -->
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                You received this tracking reminder because you enabled deadline countdown alerts for <strong>${jobTitle}</strong> on Sarkari Hith.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.6;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">
                Sarkari Hith &bull; Official Indian Government Employment &amp; Examination Portal
              </p>
              <p style="margin: 0;">
                <a href="${cleanPortalUrl}" style="color: #b30000; text-decoration: none; font-weight: 600;">Visit Sarkari Hith Portal</a> &bull; Free Candidate Welfare Alert Service
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders user-facing HTML response when candidate clicks "I Applied" / "Not Yet" in email
 */
function renderStatusPageHtml(result, requestedStatus) {
  const isFound = result && result.found;
  const isApplied = requestedStatus === 'applied' && isFound;
  const track = (result && result.track) || {};
  const portalUrl = process.env.PORTAL_URL || '/';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${!isFound ? 'Tracking Record Not Located' : (isApplied ? 'Application Recorded' : 'Reminder Active')} | Sarkari Hith</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 90vh;
    }
    .status-card {
      background: #ffffff;
      max-width: 520px;
      width: 100%;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .header {
      background: #b30000;
      color: #ffffff;
      padding: 24px 28px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .header p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #fecaca;
    }
    .content {
      padding: 32px 28px;
      text-align: center;
    }
    .icon-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }
    .icon-applied {
      background: #dcfce7;
      color: #16a34a;
    }
    .icon-pending {
      background: #e0f2fe;
      color: #0284c7;
    }
    .icon-error {
      background: #fee2e2;
      color: #dc2626;
    }
    .job-title {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .desc {
      font-size: 14px;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-portal {
      display: block;
      background: #b30000;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      text-align: center;
    }
    .btn-apply-job {
      display: block;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #334155;
      text-decoration: none;
      font-weight: 600;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="status-card">
    <div class="header">
      <h1>SARKARI HITH</h1>
      <p>Government Recruitment &amp; Student Welfare Portal</p>
    </div>
    <div class="content">
      ${!isFound ? `
        <div class="icon-circle icon-error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <div class="job-title">Tracking Record Not Located</div>
        <div style="display: inline-block; background: #fee2e2; color: #991b1b; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase;">
          Record Not Found
        </div>
        <p class="desc">
          We could not locate this active recruitment tracking record. It may have expired, or the tracking link is outdated.<br><br>
          You can check and manage all your active application reminders anytime directly from the Sarkari Hith portal.
        </p>
        <div class="actions">
          <a href="${escapeHtml(safeHttpUrl(portalUrl, '/'))}" class="btn-portal">
            Open Sarkari Hith Portal
          </a>
        </div>
      ` : `
        <div class="icon-circle ${isApplied ? 'icon-applied' : 'icon-pending'}">
          ${isApplied
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
          }
        </div>

        <div class="job-title">
          ${escapeHtml(track.jobTitle || 'Government Recruitment Post')}
        </div>

        ${isApplied ? `
          <div style="display: inline-block; background: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase;">
            Application Recorded
          </div>
          <p class="desc">
            You marked that you have submitted your online application for this post. <strong>Daily deadline reminders for this job have been stopped.</strong><br><br>
            Best wishes from Sarkari Hith for your upcoming exam and final selection!
          </p>
        ` : `
          <div style="display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase;">
            Reminder Active
          </div>
          <p class="desc">
            Your reminder is active. We will send you tomorrow's daily update with the remaining days.<br><br>
            Don't forget to submit your application before <strong>${escapeHtml(track.lastDateFormatted || 'the closing deadline')}</strong>.
          </p>
        `}

        <div class="actions">
          ${safeHttpUrl(track.link) ? `
            <a href="${escapeHtml(safeHttpUrl(track.link))}" target="_blank" rel="noopener noreferrer" class="btn-apply-job">
              Open Official Form Page &rarr;
            </a>
          ` : ''}
          <a href="${escapeHtml(safeHttpUrl(portalUrl, '/'))}" class="btn-portal">
            Return to Sarkari Hith Portal
          </a>
        </div>
      `}
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  buildJobAlertEmailHtml,
  buildJobReminderEmailHtml,
  renderStatusPageHtml
};
