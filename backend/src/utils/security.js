const { createHash, timingSafeEqual } = require('node:crypto');

function secretEquals(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected.trim()) return false;
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

function clientIp(request) {
  // Only Vercel's overwritten header is trusted on Vercel. Local clients cannot
  // bypass limits by supplying arbitrary X-Forwarded-For values.
  return (process.env.VERCEL === '1' && request.headers['x-vercel-forwarded-for']?.split(',')[0].trim())
    || request.socket.remoteAddress || 'unknown';
}

module.exports = { secretEquals, clientIp };
