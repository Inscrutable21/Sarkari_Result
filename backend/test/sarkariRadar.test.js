const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRadarItem, normalizeRadarExam } = require('../src/services/scraper/sarkariRadarScraper');
const { categorizeItem, categorizeCollection } = require('../src/services/scraper/classifier');

test('normalizeRadarItem normalizes Sarkari Radar vacancy data correctly', () => {
  const raw = {
    id: "166912",
    k: "research",
    org: "DIAT (Defence Institute of Advanced Technology)",
    what: "6 SRF and JRF posts",
    type: "JRF / SRF",
    d: "2026-10-31",
    site: "https://www.diat.ac.in",
    notice: "https://www.mysarkarinaukri.com/find/defence-institute-of-advanced-technology-jobs/166912",
    official: "https://diat.ac.in/careers-and-job-openings/",
    apply: "https://diat.ac.in/apply-online"
  };

  const normalized = normalizeRadarItem(raw);
  assert.equal(normalized.id, 'sr-166912');
  assert.equal(normalized.org, 'DIAT (Defence Institute of Advanced Technology)');
  assert.equal(normalized.title, 'DIAT (Defence Institute of Advanced Technology): 6 SRF and JRF posts');
  assert.equal(normalized.link, 'https://diat.ac.in/apply-online');
  assert.equal(normalized.radarCategory, 'research');
  assert.equal(normalized.radarType, 'JRF / SRF');
  assert.equal(normalized.deadline, '2026-10-31');
  assert.equal(normalized.details.importantDates['Last Date for Apply Online'], '2026-10-31');
  assert.equal(normalized.details.importantLinks.length, 4);
});

test('categorizeItem properly categorizes Sarkari Radar research, PSU, and state posts', () => {
  const researchItem = normalizeRadarItem({
    id: "166912",
    k: "research",
    org: "DIAT (Defence Institute of Advanced Technology)",
    what: "6 SRF and JRF posts in Chemical Engineering",
    type: "JRF / SRF",
    d: "2026-10-31",
    official: "https://diat.ac.in/careers"
  });

  const categorizedResearch = categorizeItem(researchItem, 'latestJobs');
  assert.equal(categorizedResearch.sector, 'Research & Fellowship');
  assert.equal(categorizedResearch.sectorBadge, 'research');
  assert.equal(categorizedResearch.qualification, 'Post Graduate (PG / Master)');
  assert.equal(categorizedResearch.lastDate, '2026-10-31');
  assert.equal(categorizedResearch.status, 'Till 31/10/2026');

  const psuItem = normalizeRadarItem({
    id: "166204",
    k: "psu",
    org: "Coal India Limited",
    what: "3 General Manager (E8) - Apply Online @ coalindia.in",
    type: "PSU",
    d: "2026-11-11",
    site: "https://coalindia.in"
  });

  const categorizedPsu = categorizeItem(psuItem, 'latestJobs');
  assert.equal(categorizedPsu.sector, 'Public Sector (PSU)');
  assert.equal(categorizedPsu.sectorBadge, 'psu');
  assert.ok(categorizedPsu.organization.includes('Coal India'));
  assert.equal(categorizedPsu.lastDate, '2026-11-11');

  const stateItem = normalizeRadarItem({
    id: "167067",
    k: "govt",
    org: "West Bengal Police Force",
    what: "70 Driver Posts in Kolkata",
    type: "Police",
    d: "2026-11-05",
    site: "https://wbpolice.gov.in"
  });

  const categorizedState = categorizeItem(stateItem, 'latestJobs');
  assert.equal(categorizedState.sector, 'Police & Security');
  assert.equal(categorizedState.state, 'West Bengal');
});

test('normalizeRadarExam normalizes national exams into admissions catalog', () => {
  const rawExam = {
    name: "UGC NET December 2026",
    use: "JRF, Assistant Professor and PhD admission",
    d: "2026-10-28",
    rows: [
      ["Apply", "8 Oct to 28 Oct 2026"],
      ["Exam", "14 to 21 Dec 2026"]
    ],
    site: "https://ugcnet.nta.nic.in",
    src: "https://news.careers360.com/ugc-net"
  };

  const normalized = normalizeRadarExam(rawExam);
  assert.equal(normalized.category, 'admissions');
  assert.equal(normalized.deadline, '2026-10-28');
  assert.equal(normalized.details.importantDates['Apply'], '8 Oct to 28 Oct 2026');
  assert.equal(normalized.details.importantDates['Exam'], '14 to 21 Dec 2026');

  const categorized = categorizeItem(normalized, 'admissions');
  assert.equal(categorized.category, 'admissions');
  assert.equal(categorized.qualification, 'Post Graduate (PG / Master)');
});
