const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isGovernmentEntity,
  normalizeContextItem,
  formatLastDate,
  getApiKey
} = require('../src/services/scraper/contextDevScraper');

test('isGovernmentEntity strictly accepts government institutions & councils and rejects private firms', () => {
  // Positive matches (Premier Indian Govt Institutions, Councils, PSUs)
  assert.equal(isGovernmentEntity('IIT Delhi', 'Junior Research Fellow (JRF)'), true);
  assert.equal(isGovernmentEntity('CSIR - National Chemical Laboratory', 'Project Associate I'), true);
  assert.equal(isGovernmentEntity('DRDO - INMAS Delhi', 'Junior Research Fellow in Biotechnology'), true);
  assert.equal(isGovernmentEntity('AIIMS New Delhi', 'Scientist B Non-Medical'), true);
  assert.equal(isGovernmentEntity('ISRO - URSC Bengaluru', 'Scientist / Engineer SC'), true);
  assert.equal(isGovernmentEntity('Oil and Natural Gas Corporation (ONGC)', 'Executive Trainee'), true);
  assert.equal(isGovernmentEntity('BHEL Haridwar', 'Artisan Apprentice'), true);
  assert.equal(isGovernmentEntity('Central University of Punjab', 'Assistant Professor in Biochemistry'), true);

  // Negative matches (Private commercial companies & tech firms)
  assert.equal(isGovernmentEntity('Infosys Technologies Private Limited', 'Software Engineer'), false);
  assert.equal(isGovernmentEntity('Amazon Web Services India', 'Research Scientist Intern'), false);
  assert.equal(isGovernmentEntity('Tata Consultancy Services', 'Systems Engineer Trainee'), false);
  assert.equal(isGovernmentEntity('Acme Corp Pvt Ltd', 'Data Analyst'), false);
});

test('formatLastDate converts YYYY-MM-DD into readable Indian date format', () => {
  assert.equal(formatLastDate('2026-06-30'), '30 Jun 2026');
  assert.equal(formatLastDate('2026-12-15'), '15 Dec 2026');
  assert.equal(formatLastDate(''), 'Active 2026');
  assert.equal(formatLastDate(null), 'Active 2026');
});

test('normalizeContextItem structures raw Context.dev opening into portal schema', () => {
  const rawItem = {
    title: 'Junior Research Fellow (JRF) in Quantum Technologies',
    organization: 'IIT Madras',
    category: 'research',
    qualification: 'M.Tech / M.Sc with valid GATE or CSIR-NET',
    state: 'Tamil Nadu',
    lastDate: '2026-12-31',
    totalVacancies: '02 Posts',
    link: 'https://www.iitm.ac.in/careers/jrf-quantum-2026',
    shortInfo: 'IIT Madras invites applications for JRF position in Quantum Computing.'
  };

  const normalized = normalizeContextItem(rawItem);

  assert.ok(normalized);
  assert.ok(normalized.id.startsWith('cd-iit-madras-'));
  assert.equal(normalized.title, 'Junior Research Fellow (JRF) in Quantum Technologies');
  assert.equal(normalized.organization, 'IIT Madras');
  assert.equal(normalized.radarCategory, 'research');
  assert.equal(normalized.sector, 'Research & Fellowship');
  assert.equal(normalized.category, 'latestJobs');
  assert.equal(normalized.type, 'job');
  assert.equal(normalized.state, 'Tamil Nadu');
  assert.equal(normalized.lastDate, '2026-12-31');
  assert.equal(normalized.lastDateFormatted, '31 Dec 2026');
  assert.equal(normalized.link, 'https://www.iitm.ac.in/careers/jrf-quantum-2026');
  assert.equal(normalized.source, 'Government Institute (Context)');

  // Deep details verification
  assert.ok(normalized.details);
  assert.equal(normalized.details.totalVacancies, '02 Posts');
  assert.equal(normalized.details.qualification, 'M.Tech / M.Sc with valid GATE or CSIR-NET');
  assert.equal(normalized.details.importantDates['Application Deadline'], '31 Dec 2026');
  assert.equal(normalized.details.importantLinks[0].url, 'https://www.iitm.ac.in/careers/jrf-quantum-2026');
});

test('normalizeContextItem assigns PSU and Engineering sectors appropriately', () => {
  const psuItem = {
    title: 'Executive Trainee Mechanical Through GATE 2026',
    organization: 'ONGC India',
    category: 'psu',
    lastDate: '2026-12-15',
    link: 'https://ongcindia.com/recruitment-2026'
  };

  const normalizedPSU = normalizeContextItem(psuItem);
  assert.equal(normalizedPSU.radarCategory, 'psu');
  assert.equal(normalizedPSU.sector, 'Public Sector (PSU)');

  const internItem = {
    title: 'Summer Research Internship 2027',
    organization: 'IISc Bengaluru',
    category: 'intern',
    lastDate: '2027-03-01',
    link: 'https://iisc.ac.in/summer-internship'
  };

  const normalizedIntern = normalizeContextItem(internItem);
  assert.equal(normalizedIntern.radarCategory, 'intern');
});

test('normalizeContextItem drops expired openings', () => {
  const expiredItem = {
    title: 'Project Assistant - Expired Post',
    organization: 'CSIR NPL',
    lastDate: '2024-01-01',
    link: 'https://nplindia.org/closed'
  };

  const normalized = normalizeContextItem(expiredItem);
  assert.equal(normalized, null);
});

test('getApiKey retrieves key from Contextdev environment variable', () => {
  const originalEnv = process.env.Contextdev;
  try {
    process.env.Contextdev = 'ctxt_secret_test_key_123';
    assert.equal(getApiKey(), 'ctxt_secret_test_key_123');
  } finally {
    process.env.Contextdev = originalEnv;
  }
});

test('detectAudience correctly differentiates student vs professional opportunities', () => {
  const { detectAudience } = require('../src/services/scraper/contextDevScraper');
  
  // Student & research scholar targets
  assert.equal(detectAudience(null, 'Junior Research Fellow (JRF) in Materials Science', 'IIT Bombay'), 'student');
  assert.equal(detectAudience(null, 'Graduate Apprentice Trainee (Mechanical)', 'BHEL Haridwar'), 'student');
  assert.equal(detectAudience(null, 'Summer Research Fellowship 2026', 'IISc Bengaluru'), 'student');
  assert.equal(detectAudience(null, 'Management Trainee through GATE 2026', 'ONGC'), 'student');

  // Professional & experienced targets
  assert.equal(detectAudience(null, 'Assistant Professor in Computer Science', 'IIT Kanpur'), 'professional');
  assert.equal(detectAudience(null, 'Scientist B Non-Medical', 'AIIMS New Delhi'), 'professional');
  assert.equal(detectAudience(null, 'Lateral Engineer (Contracts & Materials) - 5 yrs exp', 'NTPC'), 'professional');
  assert.equal(detectAudience(null, 'Deputy General Manager (Finance)', 'IOCL'), 'professional');
});

test('normalizeContextItem parses DD-MM-YYYY dates and extracts stipend/salary', () => {
  const itemWithIndianDate = {
    title: 'Junior Research Fellow – DRDO SAG',
    organization: 'DRDO',
    category: 'research',
    lastDate: '15-11-2026',
    stipendOrSalary: 'Rs 37,000 + HRA',
    link: 'https://drdo.gov.in/advt.pdf'
  };

  const normalized = normalizeContextItem(itemWithIndianDate);
  assert.ok(normalized);
  assert.equal(normalized.lastDate, '2026-11-15');
  assert.equal(normalized.lastDateFormatted, '15 Nov 2026');
  assert.equal(normalized.stipendOrSalary, 'Rs 37,000 + HRA');
  assert.equal(normalized.targetAudience, 'student');
  assert.equal(normalized.audienceLabel, 'Student / Fresher / Scholar');
});

