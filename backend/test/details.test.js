const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extractAdditionalDetails } = require('../src/services/scraper/detailExtractor');

test('extracts application guidance, age rules, fees and category-wise tables', () => {
  const html = `<article><table>
    <tr><td><h3>Important Dates</h3><ul><li>Application Begin: 01/10/2026</li><li>Last Date: 31/10/2026</li></ul></td>
      <td><h3>Application Fee</h3><ul><li>General: 500</li><li>SC / ST: 0</li><li>Payment Mode: Online</li></ul></td></tr>
    <tr><td colspan="2"><h3>Age Limit</h3><ul><li>Minimum Age: 18 years</li><li>Maximum Age: 30 years</li><li>Age relaxation: SC/ST 5 years</li></ul></td></tr>
    <tr><td colspan="2">Selection Process</td></tr>
    <tr><td colspan="2"><ul><li>Written examination</li><li>Document verification</li></ul></td></tr>
  </table><h2>How to Apply</h2><ol><li>Register on the official portal.</li><li>Upload the signed photograph.</li></ol>
    <h2>Salary / Pay Scale</h2><p>Pay Level 6: ₹35,400 – ₹1,12,400</p>
    <h2>Required Documents</h2><ul><li>Degree certificate</li><li>Photo identification</li></ul>
    <table><tr><td colspan="5">Category Wise Vacancy Details</td></tr>
      <tr><th>Post</th><th>UR</th><th>OBC</th><th>SC</th><th>Total</th></tr>
      <tr><td>Assistant</td><td>10</td><td>5</td><td>3</td><td>18</td></tr></table>
    <table><tr><td>Apply Online</td><td><a href="/apply">Click Here</a></td></tr></table>
    <a href="javascript:alert(1)">Download Notification</a><script>secret script</script></article>`;
  const details = extractAdditionalDetails(html, 'https://example.gov.in/jobs/assistant');
  assert.equal(details.schemaVersion, 2);
  assert.equal(details.importantDates['Last Date'], '31/10/2026');
  assert.equal(details.applicationFee['SC / ST'], '0');
  assert.equal(details.ageLimit['Maximum Age'], '30 years');
  assert.equal(details.sections.find(section => section.type === 'selectionProcess').items.length, 2);
  assert.equal(details.sections.find(section => section.type === 'howToApply').items.length, 2);
  assert.match(details.sections.find(section => section.type === 'salary').items[0], /35,400/);
  assert.equal(details.additionalTables[0].rows[0].length, 5);
  assert.equal(details.extractedLinks[0].url, 'https://example.gov.in/apply');
  assert.equal(details.extractedLinks.length, 1);
  assert.equal(JSON.stringify(details).includes('secret script'), false);
});

test('details API helper unwraps data rather than returning the response envelope', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/api.js'), 'utf8');
  const start = source.indexOf('export async function fetchPostingDetails(');
  const end = source.indexOf('\n}', start) + 2;
  const context = vm.createContext({
    fetchWithFallback: async () => ({ ok: true, json: async () => ({ success: true, data: { ageLimit: { Maximum: '30' } } }) })
  });
  vm.runInContext(source.slice(start, end).replace('export ', ''), context);
  assert.equal((await context.fetchPostingDetails('https://example.gov.in')).ageLimit.Maximum, '30');
});

function modalContext(fetchDetails) {
  const elements = new Map();
  for (const id of ['modal-title', 'modal-short-info', 'modal-overview', 'modal-age-list', 'modal-extended-details', 'modal-additional-tables', 'modal-details-status', 'modal-dates-list', 'modal-fee-list', 'modal-vacancies']) {
    elements.set(id, { innerHTML: '', textContent: '', style: {} });
  }
  const classes = new Set();
  elements.set('item-detail-modal', {
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    setAttribute() {}, querySelector: () => ({ scrollTop: 0 })
  });
  const context = vm.createContext({
    URL, console, state: { filters: { degreeStream: 'all' } }, fetchPostingDetails: fetchDetails,
    document: { getElementById: id => elements.get(id) || null, body: { style: {} } }
  });
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/components.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { context, elements };
}

test('popup renders comprehensive data and ignores a previous job response', async () => {
  const pending = [];
  const { context, elements } = modalContext(() => new Promise(resolve => pending.push(resolve)));
  const first = { title: 'First Job', link: 'https://example.gov.in/first' };
  const second = { title: 'Second Job', link: 'https://example.gov.in/second', lastDate: '2026-10-31' };
  context.openModal(first);
  context.openModal(second);
  pending[0]({ schemaVersion: 2, shortInfo: 'Wrong job content', scrapedAt: new Date().toISOString() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('modal-title').textContent, 'Second Job');
  assert.notEqual(elements.get('modal-short-info').textContent, 'Wrong job content');
  pending[1]({ schemaVersion: 2, shortInfo: 'Correct job content', ageLimit: { Maximum: '30 years' },
    sections: [{ type: 'howToApply', items: ['Upload certificate <script>'] }], additionalTables: [], scrapedAt: new Date().toISOString() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('modal-short-info').textContent, 'Correct job content');
  assert.match(elements.get('modal-age-list').innerHTML, /30 years/);
  assert.match(elements.get('modal-extended-details').innerHTML, /Upload certificate &lt;script&gt;/);
  assert.match(elements.get('modal-dates-list').innerHTML, /2026-10-31/);
});
