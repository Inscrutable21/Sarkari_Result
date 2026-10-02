/**
 * API Service for sarkari hith Frontend
 * Communicates with the Node.js backend endpoints with automatic cross-origin and offline fallback
 */

const candidates = [
  ...(typeof window !== 'undefined' && window.location.port === '3000' ? ['/api'] : []),
  `http://${typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost'}:3000/api`,
  'http://localhost:3000/api',
  'http://127.0.0.1:3000/api',
  '/api'
];

// Deduplicate candidates
const API_BASE_CANDIDATES = Array.from(new Set(candidates));
let resolvedApiBase = null;

async function fetchWithFallback(endpoint, options = {}) {
  // If we already know the working backend API base, try it first
  if (resolvedApiBase) {
    try {
      const res = await fetch(`${resolvedApiBase}${endpoint}`, options);
      return res;
    } catch {
      resolvedApiBase = null;
    }
  }

  // Probe candidates sequentially
  let lastError = null;
  for (const candidate of API_BASE_CANDIDATES) {
    try {
      const url = `${candidate}${endpoint}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      resolvedApiBase = candidate;
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Unable to reach the backend server. Please ensure the backend is running on http://localhost:3000 (npm start). Detail: ${lastError?.message || 'Connection refused'}`);
}

export async function fetchHealth() {
  const response = await fetchWithFallback('/health');
  return response.json();
}

export async function fetchAllData() {
  const response = await fetchWithFallback('/all');
  return await response.json();
}

export async function fetchCategories() {
  const response = await fetchWithFallback('/categories');
  return await response.json();
}

export async function triggerLiveScrape() {
  const response = await fetchWithFallback('/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Scrape failed');
  }
  return result;
}

export async function fetchPostingDetails(url) {
  if (!url) return null;
  try {
    const response = await fetchWithFallback(`/details?url=${encodeURIComponent(url)}`);
    const json = await response.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function subscribeToJobAlerts(data) {
  const response = await fetchWithFallback('/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Subscription failed');
  }
  return result;
}

export async function getSubscriptionStatus(email) {
  if (!email) return null;
  try {
    const response = await fetchWithFallback(`/subscriptions?email=${encodeURIComponent(email)}`);
    const result = await response.json();
    return result.data || null;
  } catch {
    return null;
  }
}

export async function unsubscribeFromJobAlerts(email) {
  const response = await fetchWithFallback('/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Unsubscribe failed');
  }
  return result;
}

export async function sendTestJobAlert(data) {
  const response = await fetchWithFallback('/notifications/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Failed to dispatch test alert');
  }
  return result;
}

export async function trackJobOpening(data) {
  const response = await fetchWithFallback('/track-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Failed to track job');
  }
  return result;
}

export async function fetchTrackedJobs(email) {
  if (!email) return [];
  try {
    const response = await fetchWithFallback(`/track-job/list?email=${encodeURIComponent(email)}`);
    const result = await response.json();
    return result.data || [];
  } catch {
    return [];
  }
}

export async function updateTrackedJobStatus(trackId, status = 'applied') {
  const response = await fetchWithFallback('/track-job/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, status })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Failed to update application status');
  }
  return result;
}

export async function scheduleJobReminderTimer({ trackId, email, delaySeconds = 60 }) {
  const response = await fetchWithFallback('/track-job/schedule-timer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, email, delaySeconds })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Failed to schedule 1-minute reminder');
  }
  return result;
}

export async function sendJobReminderNow({ trackId, email }) {
  const response = await fetchWithFallback('/track-job/send-reminder-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, email })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Failed to send reminder now');
  }
  return result;
}

export async function fetchActiveReminderTimers(email = '') {
  try {
    const query = email ? `?email=${encodeURIComponent(email)}` : '';
    const response = await fetchWithFallback(`/track-job/active-timers${query}`);
    const result = await response.json();
    return result.data || [];
  } catch {
    return [];
  }
}

export async function triggerDailyReminders() {
  const response = await fetchWithFallback('/notifications/reminders/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Failed to trigger reminders');
  }
  return result;
}

/**
 * Sends custom events to Vercel Web Analytics if available
 * @param {string} eventName - Name of the event (e.g. 'search', 'subscribe_alerts')
 * @param {Record<string, string|number|boolean>} [data] - Event metadata properties
 */
export function trackAnalyticsEvent(eventName, data = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.va === 'function') {
      window.va('event', { name: eventName, data });
    }
  } catch (err) {
    console.debug('[Vercel Analytics] Track event error:', err);
  }
}

export async function fetchMongoStatus() {
  try {
    const response = await fetchWithFallback('/mongodb/status');
    return await response.json();
  } catch (err) {
    return { success: false, connected: false, error: err.message };
  }
}

export async function triggerLiveScrape(adminKey = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }
  const query = adminKey ? `?adminKey=${encodeURIComponent(adminKey)}` : '';
  const response = await fetchWithFallback(`/scrape${query}`, {
    method: 'POST',
    headers
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Scraping failed');
  }
  return result;
}

