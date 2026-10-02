const { createReadStream, existsSync, readFileSync } = require("node:fs");
const { readFile, stat } = require("node:fs/promises");
const { createServer } = require("node:http");
const { extname, resolve, sep } = require("node:path");

function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf8");
      content.split("\n").forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          let val = match[2] || "";
          val = val.trim().replace(/^['"](.*)['"]$/, "$1");
          if (!process.env[match[1]]) {
            process.env[match[1]] = val;
          }
        }
      });
    } catch { }
  }
}
loadEnv();

const frontendRoot = resolve(__dirname, "../frontend");
const port = Number(process.env.PORT) || 3000;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

const {
  subscribeUser,
  unsubscribeUser,
  getSubscribers,
  sendTestNotification,
  dispatchAllNotifications,
  getEmailLogs,
  getTrackedJobs,
  trackJob,
  updateJobApplicationStatus,
  sendDailyJobReminders,
  scheduleReminderTimer,
  sendImmediateReminder,
  getActiveReminderTimers,
  renderStatusPageHtml,
  getSentJobHistory
} = require("./src/services/notificationService");

let isScrapingInProgress = false;
const detailsCache = new Map();

function parseBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 2e6) {
        request.destroy();
        rejectBody(new Error("Payload too large"));
      }
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        rejectBody(new Error("Invalid JSON body"));
      }
    });
    request.on("error", rejectBody);
  });
}

// In-memory IP rate limiter to protect public endpoints from spam & DoS
const ipRateLimitMap = new Map();
function isRateLimited(ip, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const entry = ipRateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowMs;
    ipRateLimitMap.set(ip, entry);
    return false;
  }
  entry.count++;
  ipRateLimitMap.set(ip, entry);
  return entry.count > maxRequests;
}

// Authenticates administrative requests using ADMIN_API_KEY (Fail-Closed)
function isAdminAuthorized(request, url) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !adminKey.trim()) return false;
  const headerKey = request.headers["x-admin-key"] || request.headers["authorization"]?.replace(/^Bearer\s+/i, "");
  const queryKey = url.searchParams.get("adminKey");
  return (headerKey && headerKey === adminKey) || (queryKey && queryKey === adminKey);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  // Defensive HTTP Security Headers
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");

  // Global CORS headers for cross-origin requests
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-key");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  const dataDir = resolve(__dirname, "src/data");

  if (url.pathname === "/api/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", message: "Node.js is running", isScraping: isScrapingInProgress }));
    return;
  }

  // Fetch or scrape posting specs on demand (SSRF Protected)
  if (url.pathname === "/api/details") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Missing url query parameter" }));
      return;
    }

    // SSRF Validation: Only allow legitimate external sarkari hith / official gov domains
    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Invalid target URL format" }));
      return;
    }

    const isHttp = parsedTarget.protocol === "http:" || parsedTarget.protocol === "https:";
    const hostname = parsedTarget.hostname.toLowerCase();
    const isAllowedDomain = hostname === "sarkariresult.com" ||
      hostname.endsWith(".sarkariresult.com") ||
      hostname.endsWith(".gov.in") ||
      hostname.endsWith(".nic.in");

    // Block localhost and private IP addresses
    const isPrivateIp = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0|::1)/i.test(hostname);

    if (!isHttp || !isAllowedDomain || isPrivateIp) {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Access denied: Target URL domain is not permitted" }));
      return;
    }

    if (detailsCache.has(targetUrl)) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, data: detailsCache.get(targetUrl), cached: true }));
      return;
    }

    try {
      const { scrapePostingDetails } = require("./src/services/scraper/sarkariScraper");
      const details = await scrapePostingDetails(targetUrl);
      if (details) {
        detailsCache.set(targetUrl, details);
      }
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, data: details }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Trigger live scraping of all data on demand (Admin Protected)
  if (url.pathname === "/api/scrape") {
    if (!isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "401 Unauthorized: Admin API key required" }));
      return;
    }

    if (isScrapingInProgress) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, message: "A scraping job is already running in background. Please wait." }));
      return;
    }

    isScrapingInProgress = true;
    try {
      const { runScraperPipeline } = require("./src/services/scraper/runScraper");
      const summary = await runScraperPipeline();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, message: "Successfully scraped and categorized all data", summary }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    } finally {
      isScrapingInProgress = false;
    }
    return;
  }

  // --- Job Alert & Email Notification Endpoints ---

  // 1. Subscribe to custom email job alerts (Rate Limited)
  if (url.pathname === "/api/subscribe" && request.method === "POST") {
    const clientIp = request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.socket.remoteAddress || "unknown";
    if (isRateLimited(clientIp, 10)) {
      response.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Rate limit exceeded. Please wait a minute before subscribing again." }));
      return;
    }

    try {
      const body = await parseBody(request);
      const result = await subscribeUser(body);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      const confirmMsg = result.isNew
        ? (result.emailDispatched
          ? `Subscribed successfully! Dispatched ${result.matchedCount || 0} matching jobs directly to ${result.subscriber.email}.`
          : "Subscribed successfully! You will receive email alerts when new jobs match your degree and qualification.")
        : (result.emailDispatched
          ? `Alert preferences updated! Dispatched ${result.matchedCount || 0} matching jobs to ${result.subscriber.email}.`
          : "Subscription preferences updated successfully!");

      response.end(JSON.stringify({
        success: true,
        message: confirmMsg,
        emailDispatched: Boolean(result.emailDispatched),
        matchedCount: result.matchedCount || 0,
        data: result.subscriber
      }));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 2. Check subscription status by email
  if (url.pathname === "/api/subscriptions" && request.method === "GET") {
    const email = url.searchParams.get("email");
    const subscribers = await getSubscribers();
    if (email) {
      const found = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, data: found || null }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: true, count: subscribers.length }));
    return;
  }

  // 3. Unsubscribe from email job alerts
  if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
    try {
      const body = await parseBody(request);
      const result = await unsubscribeUser(body.email);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 4. Send instant test notification matching profile (Rate Limited)
  if (url.pathname === "/api/notifications/test" && request.method === "POST") {
    const clientIp = request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.socket.remoteAddress || "unknown";
    if (isRateLimited(clientIp, 5)) {
      response.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Rate limit exceeded. Please wait a minute before requesting another test email." }));
      return;
    }

    try {
      const body = await parseBody(request);
      const result = await sendTestNotification(body);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: `Dispatched test email to ${body.email} with ${result.matchedCount} matching jobs!`,
        data: result
      }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 5. Trigger batch dispatch for all subscribers (Admin Protected)
  if (url.pathname === "/api/notifications/send" && request.method === "POST") {
    if (!isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "401 Unauthorized: Admin API key required" }));
      return;
    }

    try {
      const summary = await dispatchAllNotifications();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, message: "Notification cycle completed", summary }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 6. View recent notification logs (Admin Protected to prevent PII leak)
  if (url.pathname === "/api/notifications/logs" && request.method === "GET") {
    if (!isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "401 Unauthorized: Admin API key required to view dispatch logs" }));
      return;
    }

    const logs = await getEmailLogs();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: true, data: logs }));
    return;
  }

  // 6a. View candidate sent-job notification history (Rate Limited / Admin Protected)
  if (url.pathname === "/api/notifications/sent-history" && request.method === "GET") {
    const email = url.searchParams.get("email");
    if (!email && !isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "401 Unauthorized: Candidate email or Admin API key required" }));
      return;
    }

    const history = await getSentJobHistory();
    if (email) {
      const userHistory = history[email.trim().toLowerCase()] || { jobIds: [], jobLinks: [], jobTitles: [], history: [] };
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, email: email.trim().toLowerCase(), data: userHistory }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: true, data: history }));
    return;
  }

  // 7. Track specific job opening for daily deadline countdown reminders (Rate Limited)
  if (url.pathname === "/api/track-job" && request.method === "POST") {
    const clientIp = request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.socket.remoteAddress || "unknown";
    if (isRateLimited(clientIp, 10)) {
      response.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Rate limit exceeded. Please wait a minute before tracking another job." }));
      return;
    }

    try {
      const body = await parseBody(request);
      const result = await trackJob(body);

      // If user requested 1-minute test reminder upon tracking
      if (body.testTimer === true || body.testTimer === 'true' || body.delaySeconds) {
        scheduleReminderTimer({
          trackId: result.track.id,
          email: result.track.email,
          delaySeconds: body.delaySeconds || 60
        }).catch(tErr => console.warn('[Job Tracker] Auto-test timer schedule error:', tErr.message));
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: result.isNew
          ? `Daily deadline reminders activated! Confirmation email sent to ${result.track.email}.`
          : `Reminders refreshed for ${result.track.jobTitle}!`,
        data: result.track,
        daysLeft: result.daysLeft,
        testTimerScheduled: Boolean(body.testTimer || body.delaySeconds)
      }));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8. Handle candidate response from reminder email ("applied" or "pending")
  if (url.pathname === "/api/track-job/status" && request.method === "GET") {
    try {
      const trackId = url.searchParams.get("trackId");
      const status = url.searchParams.get("status") || "applied";
      const email = url.searchParams.get("email") || "";
      const job = url.searchParams.get("job") || url.searchParams.get("jobId") || "";
      const result = await updateJobApplicationStatus(trackId, status, { email, jobId: job, job });
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(renderStatusPageHtml(result, status));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<h3>Status Update Failed: ${err.message}</h3><p><a href="/">Return to Sarkari Hith</a></p>`);
    }
    return;
  }

  // 9. List tracked jobs for an email address (Prevents PII dumping without email or admin key)
  if (url.pathname === "/api/track-job/list" && request.method === "GET") {
    const email = url.searchParams.get("email");
    if (!email) {
      if (!isAdminAuthorized(request, url)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: false, error: "Candidate email query parameter is required to view tracked jobs" }));
        return;
      }
      const trackedList = await getTrackedJobs();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, count: trackedList.length, data: trackedList }));
      return;
    }
    const trackedList = await getTrackedJobs();
    const filtered = trackedList.filter(t => t.email.toLowerCase() === email.toLowerCase());
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: true, data: filtered }));
    return;
  }

  // 10. Update applied status via API
  if (url.pathname === "/api/track-job/apply" && request.method === "POST") {
    try {
      const body = await parseBody(request);
      const result = await updateJobApplicationStatus(body.trackId, body.status || "applied", {
        email: body.email,
        jobId: body.jobId,
        job: body.jobTitle
      });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, data: result }));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 10a. Schedule 1-minute test reminder for candidate's tracked job
  if (url.pathname === "/api/track-job/schedule-timer" && request.method === "POST") {
    try {
      const body = await parseBody(request);
      const result = await scheduleReminderTimer({
        trackId: body.trackId,
        email: body.email,
        delaySeconds: body.delaySeconds || 60
      });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 10b. Immediately dispatch reminder email for candidate's tracked job
  if (url.pathname === "/api/track-job/send-reminder-now" && request.method === "POST") {
    try {
      const body = await parseBody(request);
      const result = await sendImmediateReminder({
        trackId: body.trackId,
        email: body.email
      });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 10c. Get active reminder timers
  if (url.pathname === "/api/track-job/active-timers" && request.method === "GET") {
    const email = url.searchParams.get("email");
    const timers = getActiveReminderTimers(email);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: true, count: timers.length, data: timers }));
    return;
  }

  // 11. Trigger batch daily job reminders (Admin Protected)
  if (url.pathname === "/api/notifications/reminders/send" && request.method === "POST") {
    if (!isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "401 Unauthorized: Admin API key required" }));
      return;
    }

    try {
      const summary = await sendDailyJobReminders();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, message: "Daily reminders dispatched", summary }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 11b. Vercel Cron Scheduled Daily Trigger (Triggers automatically every day at 6:00 PM IST / 12:30 UTC)
  if (url.pathname === "/api/cron/reminders" && (request.method === "GET" || request.method === "POST")) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers["authorization"];
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Unauthorized cron trigger" }));
      return;
    }

    try {
      console.log("[Vercel Cron] 6:00 PM IST scheduled reminder job running via Vercel Cron...");
      const summary = await sendDailyJobReminders();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: "Daily 6:00 PM reminders processed successfully via Vercel Cron",
        summary
      }));
    } catch (err) {
      console.error("[Vercel Cron] Daily reminder execution failed:", err.message);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 12. Google Sheets Status & Live Refresh
  if (url.pathname === "/api/google-sheets/status" && request.method === "GET") {
    const { isGoogleSheetEnabled } = require("./src/services/googleSheetService");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      success: true,
      enabled: isGoogleSheetEnabled(),
      configured: Boolean(process.env.GOOGLE_SHEET_WEBAPP_URL)
    }));
    return;
  }

  // 13. Force Sync / Reload Data from Google Sheets (Admin Protected)
  if (url.pathname === "/api/sync-sheets" && (request.method === "GET" || request.method === "POST")) {
    if (!isAdminAuthorized(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "401 Unauthorized: Admin API key required" }));
      return;
    }
    try {
      const { getAllPortalDataFromSheet, isGoogleSheetEnabled } = require("./src/services/googleSheetService");
      if (!isGoogleSheetEnabled()) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: false, error: "Google Sheets integration is not configured in .env" }));
        return;
      }
      const data = await getAllPortalDataFromSheet(true); // force refresh
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: "Portal data refreshed from Google Sheets",
        counts: {
          latestJobs: data?.latestJobs?.length || 0,
          results: data?.results?.length || 0,
          admitCards: data?.admitCards?.length || 0,
          answerKeys: data?.answerKeys?.length || 0,
          syllabus: data?.syllabus?.length || 0,
          admissions: data?.admissions?.length || 0,
          certificates: data?.certificates?.length || 0
        }
      }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Endpoints to serve scraped SarkariResult datasets
  const apiDataMap = {
    "/api/all": "allData.json",
    "/api/jobs": "jobs.json",
    "/api/results": "results.json",
    "/api/admit-cards": "admitCards.json",
    "/api/trending": "trending.json",
    "/api/categories": "categories.json"
  };

  if (apiDataMap[url.pathname]) {
    const jsonPath = resolve(dataDir, apiDataMap[url.pathname]);
    try {
      const fileInfo = await stat(jsonPath);
      if (fileInfo.isFile()) {
        const sectorFilter = url.searchParams.get("sector")?.toLowerCase();
        const stateFilter = url.searchParams.get("state")?.toLowerCase();
        const qualFilter = url.searchParams.get("qualification")?.toLowerCase();
        const disciplineFilter = url.searchParams.get("discipline")?.toLowerCase() || url.searchParams.get("degree")?.toLowerCase();
        const scopeFilter = url.searchParams.get("scope")?.toLowerCase() || url.searchParams.get("degreeScope")?.toLowerCase();
        const queryFilter = url.searchParams.get("q")?.toLowerCase();
        const activeOnly = url.searchParams.get("activeOnly") === "true";

        // If no filter query params, pipe the raw JSON stream directly for maximum speed
        if (!sectorFilter && !stateFilter && !qualFilter && !disciplineFilter && !scopeFilter && !queryFilter && !activeOnly) {
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          createReadStream(jsonPath).pipe(response);
          return;
        }

        const rawContent = await readFile(jsonPath, "utf-8");
        const parsed = JSON.parse(rawContent);
        let items = Array.isArray(parsed) ? parsed : (parsed.data || []);

        if (Array.isArray(items)) {
          const todayIso = new Date().toISOString().split('T')[0];
          if (url.pathname === "/api/jobs" || activeOnly) {
            items = items.filter(it => it.isActive !== false && it.isExpired !== true && (!it.lastDate || it.lastDate >= todayIso));
          }
          if (disciplineFilter && disciplineFilter !== "all") {
            if (scopeFilter === "field") {
              items = items.filter(it => it.fieldDisciplines?.includes(disciplineFilter));
            } else if (scopeFilter === "general") {
              items = items.filter(it => it.generalDisciplines?.includes(disciplineFilter));
            } else {
              items = items.filter(it => it.eligibleDisciplines?.includes(disciplineFilter));
            }
          }
          if (sectorFilter) {
            items = items.filter(it => it.sector?.toLowerCase().includes(sectorFilter) || it.sectorBadge?.toLowerCase().includes(sectorFilter));
          }
          if (stateFilter) {
            items = items.filter(it => it.state?.toLowerCase().includes(stateFilter));
          }
          if (qualFilter) {
            items = items.filter(it => it.qualification?.toLowerCase().includes(qualFilter));
          }
          if (queryFilter) {
            items = items.filter(it =>
              it.title?.toLowerCase().includes(queryFilter) ||
              it.organization?.toLowerCase().includes(queryFilter) ||
              it.tags?.some(t => t.toLowerCase().includes(queryFilter))
            );
          }
        }

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: items,
          meta: { total: items.length, filters: { activeOnly, discipline: disciplineFilter, sector: sectorFilter, state: stateFilter, qualification: qualFilter, q: queryFilter } }
        }));
        return;
      }
    } catch {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Dataset not found. Run scraper first." }));
      return;
    }
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(frontendRoot, `.${requestedPath}`);
  if (filePath !== frontendRoot && !filePath.startsWith(`${frontendRoot}${sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

let listenAttempts = 0;
const MAX_ATTEMPTS = 5;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    if (listenAttempts < MAX_ATTEMPTS) {
      listenAttempts++;
      console.warn(`[Port ${port} busy, waiting for release (retry ${listenAttempts}/${MAX_ATTEMPTS})...]`);
      setTimeout(() => {
        try { server.close(); } catch { }
        server.listen(port);
      }, 700);
    } else {
      console.error(`\n[Server Error]: Port ${port} is permanently in use by another process.`);
      console.error(`To release port ${port}, stop the other process or run: PORT=${port + 1} npm run dev\n`);
      process.exit(1);
    }
  } else {
    console.error("Server error:", err);
  }
});

// Automated Background Reminder Scheduler (Configured for 6:00 PM daily trigger)
let reminderSchedulerInterval = null;
let lastReminderTriggerDate = null;

function getCurrentScheduledTime() {
  try {
    const now = new Date();
    // Resolve Indian Standard Time (Asia/Kolkata)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: process.env.TIMEZONE || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type) => parts.find(p => p.type === type)?.value;
    const hour = parseInt(getPart("hour"), 10);
    const minute = parseInt(getPart("minute"), 10);
    const dateStr = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    return { hour, minute, dateStr };
  } catch {
    const now = new Date();
    return {
      hour: now.getHours(),
      minute: now.getMinutes(),
      dateStr: now.toISOString().split("T")[0]
    };
  }
}

function startReminderScheduler() {
  if (reminderSchedulerInterval) return;
  const targetHour = Number(process.env.REMINDER_TRIGGER_HOUR) || 18; // 6:00 PM (18:00)
  const targetMinute = Number(process.env.REMINDER_TRIGGER_MINUTE) || 0;
  console.log(`[Reminder Scheduler] Automated reminder engine active: scheduled to trigger daily at 6:00 PM (${targetHour.toString().padStart(2, '0')}:${targetMinute.toString().padStart(2, '0')} IST)...`);

  // Check every 30 seconds to guarantee the 6:00 PM trigger window is captured
  reminderSchedulerInterval = setInterval(async () => {
    try {
      const timeInfo = getCurrentScheduledTime();
      // Target trigger: 6:00 PM (window: 18:00 - 18:02)
      if (timeInfo.hour === targetHour && timeInfo.minute >= targetMinute && timeInfo.minute <= (targetMinute + 2)) {
        if (lastReminderTriggerDate !== timeInfo.dateStr) {
          lastReminderTriggerDate = timeInfo.dateStr;
          console.log(`[Reminder Scheduler] 6:00 PM Daily Trigger reached for ${timeInfo.dateStr}! Dispatching reminders for tracked jobs...`);
          const summary = await sendDailyJobReminders();
          console.log(`[Reminder Scheduler] 6:00 PM Dispatch complete: ${summary.dispatched} reminders sent (${summary.skippedApplied} applied, ${summary.skippedExpired} expired).`);
        }
      }
    } catch (err) {
      console.warn('[Reminder Scheduler] Periodic check error:', err.message);
    }
  }, 30 * 1000);
}

process.on("SIGINT", () => {
  if (reminderSchedulerInterval) clearInterval(reminderSchedulerInterval);
  try { server.close(); } catch { }
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (reminderSchedulerInterval) clearInterval(reminderSchedulerInterval);
  try { server.close(); } catch { }
  process.exit(0);
});

if (require.main === module) {
  server.listen(port, () => {
    listenAttempts = 0;
    console.log(`sarkari hith is running at http://localhost:${port}`);
    startReminderScheduler();
  });
}

module.exports = server;