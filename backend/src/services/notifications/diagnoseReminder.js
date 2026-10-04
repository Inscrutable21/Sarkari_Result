// Read-only diagnostic. Never sends email or changes candidate records.
require('./constants');

async function main() {
  const [site, email] = process.argv.slice(2);
  if (!site || !email) throw new Error('Usage: node diagnoseReminder.js <site-url> <email>');
  const url = new URL('/api/admin/subscribers-status', site);
  const response = await fetch(url, {
    headers: { 'x-admin-key': process.env.ADMIN_API_KEY || '' },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json();
  const data = body.data || body;
  console.log(JSON.stringify({
    status: response.status,
    success: body.success,
    summary: data.summary,
    records: (data.items || []).filter(item => item.email === email.toLowerCase()).map(item => ({
      type: item.type, status: item.status, reason: item.statusReason,
      lastSentAt: item.lastSentAt, jobTitle: item.jobTitle
    }))
  }, null, 2));
  if (!response.ok) process.exitCode = 1;
}

main().catch(error => { console.error('Live diagnostic failed:', error.message); process.exitCode = 1; });
