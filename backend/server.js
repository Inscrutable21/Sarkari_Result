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
  getSentJobHistory,
  getSubscribersDispatchStatus,
  sendIndividualReminder,
  deleteSubscriberOrTrackedJob,
  clearAllSubscribersAndTracked
} = require("./src/services/notificationService");

const {
  ROLE_PERMISSIONS,
  checkPermission,
  isAdminRegistered,
  registerAdmin,
  loginWithCredentials,
  loginWithMasterKey,
  validateSessionToken,
  rotateToken,
  revokeAllSessions
} = require("./src/services/authService");

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

// Authenticates administrative requests and verifies granular RBAC permissions
async function verifyAdminPermission(request, url, requiredPermission = null) {
  const authHeader = request.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("token");

  // 1. Bearer Token Verification
  if (token) {
    const validation = await validateSessionToken(token);
    if (validation.valid) {
      request.adminSession = validation;
      if (requiredPermission) {
        const allowed = checkPermission(validation.role, validation.permissions, requiredPermission);
        if (!allowed) {
          return {
            authorized: false,
            reason: "forbidden",
            permission: requiredPermission,
            role: validation.role || "unknown"
          };
        }
      }
      return { authorized: true, session: validation };
    }
  }

  // 2. Direct Master Key Fallback (Always granted superadmin / wildcard permissions)
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey && adminKey.trim()) {
    const headerKey = request.headers["x-admin-key"] || authHeader;
    const queryKey = url.searchParams.get("adminKey");
    if ((headerKey && headerKey === adminKey) || (queryKey && queryKey === adminKey)) {
      request.adminSession = {
        adminId: "master_admin",
        username: "Master Administrator",
        role: "superadmin",
        permissions: ["*"]
      };
      return { authorized: true, session: request.adminSession };
    }
  }

  return { authorized: false, reason: "unauthorized" };
}

// Unified middleware helper to enforce authorization and permissions with automated HTTP error responses
async function enforceAdminPermission(request, response, url, requiredPermission = null) {
  const check = await verifyAdminPermission(request, url, requiredPermission);
  if (!check.authorized) {
    if (check.reason === "forbidden") {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: false,
        error: `403 Forbidden: Account with role '${check.role}' lacks permission '${check.permission}' for this operation.`
      }));
    } else {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: false,
        error: "401 Unauthorized: Valid Admin Session Token or Master Authorization Key required."
      }));
    }
    return false;
  }
  return true;
}

// Backward-compatible helper for boolean permission checks
async function isAdminAuthorized(request, url, requiredPermission = null) {
  const check = await verifyAdminPermission(request, url, requiredPermission);
  return check.authorized;
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

  // Trigger live scraping of all data on demand (Admin Protected with RBAC)
  if (url.pathname === "/api/scrape") {
    if (!(await enforceAdminPermission(request, response, url, "scrape:run"))) {
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

  // --- Single Admin Tokenization & Rotation Endpoints ---

  // 1. Authenticate Single Admin Key & Issue Signed Cryptographic Token
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const clientMeta = {
      ip: request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.socket.remoteAddress || "unknown",
      userAgent: request.headers["user-agent"] || "unknown"
    };

    try {
      const body = await parseBody(request);
      const key = (body.apiKey || body.adminKey || body.key || body.password || '').trim();
      if (!key) {
        throw new Error("Admin Authorization Key required");
      }
      const result = await loginWithMasterKey(key, clientMeta);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 4. Token Rotation (Requires Master Authorization Key to prevent unauthorized session extension)
  if (url.pathname === "/api/auth/rotate" && request.method === "POST") {
    try {
      const body = await parseBody(request).catch(() => ({}));
      const authHeader = request.headers["authorization"] || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim() || body.token;
      const masterKey = body.masterKey || request.headers["x-admin-key"];
      const expectedKey = process.env.ADMIN_API_KEY;

      if (!expectedKey || masterKey !== expectedKey) {
        throw new Error("Master Authorization Key required to rotate token");
      }
      if (!token) throw new Error("Active session token required for rotation");

      const clientMeta = {
        ip: request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.socket.remoteAddress || "unknown",
        userAgent: request.headers["user-agent"] || "unknown"
      };

      const result = await rotateToken(token, clientMeta);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 5. Emergency Revocation of All Sessions (Requires Master Authorization Key)
  if (url.pathname === "/api/auth/revoke-all" && request.method === "POST") {
    try {
      const body = await parseBody(request).catch(() => ({}));
      const masterKey = body.masterKey || request.headers["x-admin-key"];
      const expectedKey = process.env.ADMIN_API_KEY;

      if (!expectedKey || masterKey !== expectedKey) {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: false, error: "Master Authorization Key required to revoke all sessions" }));
        return;
      }

      const result = await revokeAllSessions();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 6. Verify Current Token Session & Lifetime
  if (url.pathname === "/api/auth/verify" || url.pathname === "/api/admin/verify") {
    if (!(await isAdminAuthorized(request, url))) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Invalid Admin Authorization Key or Token" }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      success: true,
      message: "Admin authorization verified",
      session: request.adminSession || null
    }));
    return;
  }

  // Database Telemetry & Admin Overview Endpoint
  if (url.pathname === "/api/mongodb/status" || url.pathname === "/api/admin/status") {
    const { getMongoStatus } = require("./src/services/mongoService");
    try {
      const status = await getMongoStatus();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, isScraping: isScrapingInProgress, ...status }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
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

  // 5. Trigger batch dispatch for all subscribers (Admin Protected with RBAC)
  if (url.pathname === "/api/notifications/send" && request.method === "POST") {
    if (!(await enforceAdminPermission(request, response, url, "notifications:dispatch"))) {
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

  // 6. View recent notification logs (Admin Protected with RBAC)
  if (url.pathname === "/api/notifications/logs" && request.method === "GET") {
    if (!(await enforceAdminPermission(request, response, url, "notifications:view_logs"))) {
      return;
    }

    const logs = await getEmailLogs();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: true, data: logs }));
    return;
  }

  // 6a. View candidate sent-job notification history (Rate Limited / Admin Protected with RBAC)
  if (url.pathname === "/api/notifications/sent-history" && request.method === "GET") {
    const email = url.searchParams.get("email");
    if (!email) {
      if (!(await enforceAdminPermission(request, response, url, "notifications:view_logs"))) {
        return;
      }
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

  // 9. List tracked jobs for an email address (Prevents PII dumping without email or admin permission)
  if (url.pathname === "/api/track-job/list" && request.method === "GET") {
    const email = url.searchParams.get("email");
    if (!email) {
      if (!(await enforceAdminPermission(request, response, url, "track_job:view"))) {
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

  // 11. Trigger batch daily job reminders (Admin Protected with RBAC)
  if (url.pathname === "/api/notifications/reminders/send" && request.method === "POST") {
    if (!(await enforceAdminPermission(request, response, url, "reminders:dispatch"))) {
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
    const isCronSecretValid = cronSecret && authHeader === `Bearer ${cronSecret}`;
    if (!isCronSecretValid && !(await isAdminAuthorized(request, url, "reminders:dispatch"))) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Unauthorized cron or admin trigger" }));
      return;
    }

    try {
      console.log("[Vercel Cron] 6:00 PM IST scheduled reminder job running via Vercel Cron...");
      const summary = await sendDailyJobReminders();
      const alertSummary = await dispatchAllNotifications();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: "Daily 6:00 PM reminders and alerts processed successfully via Vercel Cron",
        summary,
        alertSummary
      }));
    } catch (err) {
      console.error("[Vercel Cron] Daily reminder execution failed:", err.message);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 11c. Unified Subscriber & 6:00 PM Reminder Dispatch Status (Admin Protected with RBAC)
  if (url.pathname === "/api/admin/subscribers-status" && request.method === "GET") {
    if (!(await enforceAdminPermission(request, response, url, "notifications:view_logs"))) {
      return;
    }
    try {
      const data = await getSubscribersDispatchStatus();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, ...data }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 11d. Manually dispatch reminder/alert to an individual recipient on demand (Admin Protected with RBAC)
  if (url.pathname === "/api/admin/subscribers/send-reminder" && request.method === "POST") {
    if (!(await enforceAdminPermission(request, response, url, "reminders:dispatch"))) {
      return;
    }
    try {
      const body = await parseBody(request);
      const result = await sendIndividualReminder(body.id, body.email);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 11e. Force Dispatch Reminders to ALL Pending Recipients Right Now (Admin Protected with RBAC)
  if (url.pathname === "/api/admin/subscribers/send-all-reminders" && request.method === "POST") {
    if (!(await enforceAdminPermission(request, response, url, "reminders:dispatch"))) {
      return;
    }
    try {
      const reminderSummary = await sendDailyJobReminders(true);
      const alertSummary = await dispatchAllNotifications();
      const updatedStatus = await getSubscribersDispatchStatus();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: `Dispatched ${reminderSummary.dispatched} deadline reminders and ${alertSummary.dispatched || 0} job alert digests.`,
        summary: {
          reminders: reminderSummary,
          alerts: alertSummary
        },
        ...updatedStatus
      }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 11f. Delete individual subscriber or tracked job record (Admin Protected with RBAC)
  if (url.pathname === "/api/admin/subscribers/delete" && request.method === "POST") {
    if (!(await enforceAdminPermission(request, response, url, "notifications:dispatch"))) {
      return;
    }
    try {
      const body = await parseBody(request);
      const result = await deleteSubscriberOrTrackedJob(body.id, body.email);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 11g. Clear ALL subscribers and tracked applications (Admin Protected with RBAC)
  if (url.pathname === "/api/admin/subscribers/clear-all" && request.method === "POST") {
    if (!(await enforceAdminPermission(request, response, url, "notifications:dispatch"))) {
      return;
    }
    try {
      const result = await clearAllSubscribersAndTracked();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 12. MongoDB Atlas Status & Collection Telemetry
  if (url.pathname === "/api/mongodb/status" && request.method === "GET") {
    const { getMongoStatus } = require("./src/services/mongoService");
    try {
      const status = await getMongoStatus();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: true, ...status }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 13. Force Sync Local Seed Datasets into MongoDB Atlas (Admin Protected with RBAC)
  if (url.pathname === "/api/sync-mongo" && (request.method === "GET" || request.method === "POST")) {
    if (!(await enforceAdminPermission(request, response, url, "database:sync"))) {
      return;
    }
    try {
      const { syncAllDataToMongo } = require("./src/services/pushAllDataToMongo");
      const result = await syncAllDataToMongo();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        message: "All datasets, subscribers, tracked jobs, and logs successfully synced to MongoDB Atlas",
        ...result
      }));
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Endpoints to serve scraped SarkariResult datasets exclusively from MongoDB Atlas
  const apiDataMap = {
    "/api/all": "all",
    "/api/jobs": "jobs",
    "/api/results": "results",
    "/api/admit-cards": "admitCards",
    "/api/trending": "trending",
    "/api/categories": "categories"
  };

  if (apiDataMap[url.pathname]) {
    const {
      isMongoEnabled,
      getPortalDatasetFromMongo,
      getAllPortalDataFromMongo,
      getCategorySummaryFromMongo
    } = require("./src/services/mongoService");

    if (!isMongoEnabled()) {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Database not configured. MONGODB_URI is required." }));
      return;
    }

    try {
      if (url.pathname === "/api/all") {
        const allFromMongo = await getAllPortalDataFromMongo();
        if (allFromMongo) {
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(allFromMongo));
          return;
        }
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: false, error: "Portal data not found in database. Run sync:mongo or scraper first." }));
        return;
      }

      if (url.pathname === "/api/categories") {
        const catFromMongo = await getCategorySummaryFromMongo();
        if (catFromMongo) {
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ success: true, data: catFromMongo, source: "mongodb" }));
          return;
        }
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: false, error: "Categories metadata not found in database." }));
        return;
      }

      const datasetKey = url.pathname.replace(/^\/api\//, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      let items = await getPortalDatasetFromMongo(datasetKey);

      if (!Array.isArray(items) || items.length === 0) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: false, error: `Dataset ${datasetKey} not found in database.` }));
        return;
      }

      const sectorFilter = url.searchParams.get("sector")?.toLowerCase();
      const stateFilter = url.searchParams.get("state")?.toLowerCase();
      const qualFilter = url.searchParams.get("qualification")?.toLowerCase();
      const disciplineFilter = url.searchParams.get("discipline")?.toLowerCase() || url.searchParams.get("degree")?.toLowerCase();
      const scopeFilter = url.searchParams.get("scope")?.toLowerCase() || url.searchParams.get("degreeScope")?.toLowerCase();
      const queryFilter = url.searchParams.get("q")?.toLowerCase();
      const activeOnly = url.searchParams.get("activeOnly") === "true";

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

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        data: items,
        meta: {
          total: items.length,
          source: "mongodb",
          filters: { activeOnly, discipline: disciplineFilter, sector: sectorFilter, state: stateFilter, qualification: qualFilter, q: queryFilter }
        }
      }));
      return;
    } catch (err) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "Database error: " + err.message }));
      return;
    }
  }

  let requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  if (requestedPath === "/admin" || requestedPath === "/admin/") {
    requestedPath = "/admin.html";
  }
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
          console.log(`[Reminder Scheduler] 6:00 PM Daily Trigger reached for ${timeInfo.dateStr}! Dispatching reminders for tracked jobs and subscriber alerts...`);
          const reminderSummary = await sendDailyJobReminders();
          const alertSummary = await dispatchAllNotifications();
          console.log(`[Reminder Scheduler] 6:00 PM Dispatch complete: ${reminderSummary.dispatched} deadline reminders sent, ${alertSummary.dispatched || 0} job alert digests sent.`);
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