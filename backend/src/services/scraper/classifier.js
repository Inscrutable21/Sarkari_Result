/**
 * Enhanced Classification & Categorization Engine for Sarkari Result
 * Extracts sector, conducting organization, jurisdiction/state,
 * qualification tier, status, and theme badge colors.
 */

const SECTOR_RULES = [
  {
    name: 'Banking & Financial',
    badge: 'banking',
    color: '#0284c7', // Sky / Blue
    keywords: [/\bbank\b/i, /\bbob\b/i, /\bbank of baroda\b/i, /\bsbi\b/i, /\bibps\b/i, /\brbi\b/i, /\bnabard\b/i, /\bcanara\b/i, /\bpnb\b/i, /\bboi\b/i, /\brrb (?:officer|scale|clerk|office assistant)/i, /apprentice.*bank/i, /\bwealth management\b/i]
  },
  {
    name: 'Staff Selection (SSC)',
    badge: 'ssc',
    color: '#ea580c', // Orange
    keywords: [/\bssc\b/i, /\bcgl\b/i, /\bchsl\b/i, /\bmts\b/i, /\bcpo\b/i, /\bsteno/i, /\bselection post/i, /\bgd constable/i]
  },
  {
    name: 'Railway (RRB)',
    badge: 'railway',
    color: '#b91c1c', // Deep Red
    keywords: [/\brailway\b/i, /\brrb\b/i, /\brrc\b/i, /\bntpc\b/i, /\bgroup d\b/i, /\balp\b/i, /\btechnician\b/i, /\bticket (?:collector|examiner)/i]
  },
  {
    name: 'Engineering & Technical',
    badge: 'engineering',
    color: '#0891b2', // Cyan
    keywords: [/\bengineer/i, /\bjunior engineer\b/i, /\bje\b/i, /\bgate\b/i, /\bpolytechnic\b/i, /\biti\b/i, /\bapprentice\b/i, /\btechnical\b/i, /\btechnician\b/i, /\bjam\b/i, /\biit\b/i, /\biit[- ]bhu\b/i]
  },
  {
    name: 'Teaching & Education',
    badge: 'teaching',
    color: '#7c3aed', // Purple
    keywords: [
      /(?<!non[- ]?)\bteacher\b/i,
      /(?<!non[- ]?)\bteaching\b/i,
      /\bpgt\b/i, /\btgt\b/i, /\bprt\b/i, /\bctet\b/i, /\buptet\b/i,
      /\bstet\b/i, /\bdeled\b/i, /\bb\.?ed\b/i, /\bprofessor\b/i,
      /\blecturer\b/i, /\btre\b/i, /\bnet\b/i, /\bset\b/i, /\becc\b/i, /\beducator\b/i
    ]
  },
  {
    name: 'Defense & Armed Forces',
    badge: 'defense',
    color: '#15803d', // Green
    keywords: [/\bagniveer/i, /\bairforce\b/i, /\bair force\b/i, /\barmy\b/i, /\bnavy\b/i, /\bdefence\b/i, /\bdefense\b/i, /\bnda\b/i, /\bcds\b/i, /\bafcat\b/i, /\bcoast guard\b/i, /\bitbp\b/i, /\bbsf\b/i, /\bcisf\b/i, /\bcrpf\b/i, /\bssb\b/i]
  },
  {
    name: 'Police & Security',
    badge: 'police',
    color: '#0f766e', // Teal
    keywords: [/\bpolice\b/i, /\bconstable\b/i, /\bsi\b/i, /\bsub inspector\b/i, /\bhead constable\b/i, /\bjail warder\b/i, /\bhome guard\b/i]
  },
  {
    name: 'Civil Services & State PSC',
    badge: 'civil-services',
    color: '#4338ca', // Indigo
    keywords: [/\bupsc\b/i, /\bias\b/i, /\bips\b/i, /\bifs\b/i, /\buppsc\b/i, /\bbpsc\b/i, /\bmppsc\b/i, /\brpsc\b/i, /\bukpsc\b/i, /\bjpsc\b/i, /\bopsc\b/i, /\bcivil services\b/i]
  },
  {
    name: 'Medical & Healthcare',
    badge: 'medical',
    color: '#db2777', // Pink/Rose
    keywords: [/\bmedical\b/i, /\bdoctor\b/i, /\bnurse\b/i, /\bnursing\b/i, /\bcho\b/i, /\baiims\b/i, /\bneet\b/i, /\bpharmacist\b/i, /\bhealth\b/i, /\bveterinary\b/i]
  },
  {
    name: 'Judiciary & Law',
    badge: 'judiciary',
    color: '#9333ea', // Violet
    keywords: [/\bcourt\b/i, /\bhigh court\b/i, /\bjudge\b/i, /\bjudicial\b/i, /\blaw\b/i, /\blegal\b/i]
  },
  {
    name: 'State Subordinate & Welfare',
    badge: 'state-subordinate',
    color: '#d97706', // Amber
    keywords: [/\bupsssc\b/i, /\bmpesb\b/i, /\bhssc\b/i, /\bdsssb\b/i, /\brsmssb\b/i, /\banganwadi\b/i, /\bscholarship\b/i, /\blekhpal\b/i, /\bpatwari\b/i, /\boutsourcing\b/i]
  }
];

const STATE_RULES = [
  { state: 'Uttar Pradesh (UP)', keywords: [/\bup\b/i, /\buppsc\b/i, /\bupsssc\b/i, /\bupessc\b/i, /\buttar pradesh\b/i, /\blucknow\b/i, /\bbareilly\b/i, /\brampur\b/i, /\buptet\b/i, /\biit[- ]bhu\b/i, /\bvaranasi\b/i] },
  { state: 'Bihar', keywords: [/\bbihar\b/i, /\bbpsc\b/i, /\bbssc\b/i, /\bbseb\b/i, /\bbtsc\b/i, /\bpatna\b/i] },
  { state: 'Madhya Pradesh (MP)', keywords: [/\bmp\b/i, /\bmpesb\b/i, /\bmppsc\b/i, /\bmadhya pradesh\b/i, /\bbhopal\b/i] },
  { state: 'Rajasthan', keywords: [/\brajasthan\b/i, /\brpsc\b/i, /\brsmssb\b/i, /\bjaipur\b/i] },
  { state: 'Delhi', keywords: [/\bdelhi\b/i, /\bdsssb\b/i] },
  { state: 'Chhattisgarh', keywords: [/\bchhattisgarh\b/i, /\bcgpsc\b/i, /\bvyapam\b/i] },
  { state: 'Haryana', keywords: [/\bharyana\b/i, /\bhssc\b/i, /\bhpsc\b/i] },
  { state: 'Uttarakhand', keywords: [/\buttarakhand\b/i, /\bukpsc\b/i, /\buksssc\b/i] },
  { state: 'Jharkhand', keywords: [/\bjharkhand\b/i, /\bjpsc\b/i, /\bjssc\b/i] },
  { state: 'Central / All India', keywords: [/\bssc\b/i, /\bupsc\b/i, /\bibps\b/i, /\brrb\b/i, /\bnta\b/i, /\bairforce\b/i, /\barmy\b/i, /\bnavy\b/i, /\bcanara bank\b/i, /\bbank of india\b/i, /\bbank of baroda\b/i, /\bbob\b/i, /\bsbi\b/i, /\biit\b/i, /\bgate\b/i, /\bcsir\b/i, /\bugc\b/i, /\bcentral\b/i, /\ball india\b/i] }
];

const QUALIFICATION_RULES = [
  { level: '10th / Matric Pass', keywords: [/\b10th\b/i, /\bmatric\b/i, /\bhigh school\b/i, /\bchsl\b/i, /\bmts\b/i, /\bgroup d\b/i, /\banganwadi\b/i] },
  { level: '12th / Intermediate', keywords: [/\b12th\b/i, /\b10\+2\b/i, /\bintermediate\b/i, /\binter\b/i, /\bconstable\b/i] },
  { level: 'Teaching Degree (B.Ed / D.El.Ed)', keywords: [/(?<!non[- ]?)\bteacher\b/i, /\bdeled\b/i, /\bb\.?ed\b/i, /\btet\b/i, /\bctet\b/i, /\bpgt\b/i, /\btgt\b/i, /\btre\b/i] },
  { level: 'Engineering / Diploma / ITI', keywords: [/\bengineer/i, /\bje\b/i, /\bgate\b/i, /\bdiploma\b/i, /\biti\b/i, /\bpolytechnic\b/i, /\bapprentice\b/i, /\btechnician\b/i] },
  { level: 'Medical / Nursing Degree', keywords: [/\bnurse\b/i, /\bnursing\b/i, /\bmedical\b/i, /\bmbbs\b/i, /\bcho\b/i, /\bveterinary\b/i] },
  { level: 'Graduate / Degree', keywords: [/\bgraduate\b/i, /\bdegree\b/i, /\bbachelor\b/i, /\bofficer\b/i, /\bcgl\b/i, /\bpo\b/i, /\bso\b/i, /\bclerk\b/i, /\bbank\b/i, /\bupsc\b/i, /\bpsc\b/i, /\bwealth management\b/i, /\bsuperintendent\b/i] },
  { level: 'Post Graduate (PG / Master)', keywords: [/\bpg\b/i, /\bpost graduate\b/i, /\bmaster\b/i, /\bpgt\b/i, /\bnet\b/i, /\bphd\b/i] }
];

/**
 * Extracts organization name abbreviation or full name from title and link
 */
function extractOrganization(title, link = '') {
  const text = `${title} ${link}`;
  const orgs = [
    'Bank of Baroda', 'BOB', 'Canara Bank', 'Bank of India', 'SBI', 'IBPS', 'SSC', 'UPSC',
    'UPPSC', 'UPSSSC', 'UPESSC', 'BPSC', 'BSEB', 'BTSC', 'MPESB', 'MPPSC',
    'RPSC', 'NTA', 'IIT BHU', 'IIT', 'UIIC', 'ITBP', 'CISF', 'CRPF', 'BSF',
    'Indian Airforce', 'Indian Army', 'Indian Navy',
    'RRB', 'RRC', 'CSIR', 'UGC', 'DSSSB', 'HSSC', 'CG Vyapam'
  ];

  for (const org of orgs) {
    const regex = new RegExp(`\\b${org}\\b`, 'i');
    if (regex.test(text)) return org;
  }
  return 'Government of India';
}

/**
 * Extracts and parses deadline date from text and importantDates object
 */
function parseDateParts(d, m, y) {
  const day = parseInt(d, 10);
  const month = parseInt(m, 10);
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    iso,
    formatted: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    timestamp: new Date(year, month - 1, day, 23, 59, 59).getTime()
  };
}

function extractLastDate(text, importantDates = {}) {
  if (importantDates && typeof importantDates === 'object') {
    for (const [k, v] of Object.entries(importantDates)) {
      if (k.toLowerCase().includes('last date') || k.toLowerCase().includes('apply online') || k.toLowerCase().includes('closing date')) {
        const match = String(v).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
        if (match) return parseDateParts(match[1], match[2], match[3]);
      }
    }
  }

  // Common patterns in SarkariResult titles like "Last Date : 27/10/2026", "Last : 18/08/2026", "Till 25/09/2026", "by 10/10/2026"
  const matchLast = text.match(/(?:last\s*date|last\s*day|last\s*time|last|till|upto|before|by)\s*[:\-]?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i);
  if (matchLast) return parseDateParts(matchLast[1], matchLast[2], matchLast[3]);

  // Matches piped date at the end of title, e.g. "... | 27/10/2026" or "... | Last Date : 27/10/2026"
  const matchPiped = text.match(/\|\s*(?:.*?)\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (matchPiped) return parseDateParts(matchPiped[1], matchPiped[2], matchPiped[3]);

  const matchTo = text.match(/\bto\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i);
  if (matchTo) return parseDateParts(matchTo[1], matchTo[2], matchTo[3]);

  return null;
}

/**
 * Determines current event/action status and active validity
 */
function extractStatus(title, section = '', deadline = null, isExtended = false) {
  const lower = title.toLowerCase();
  const todayTimestamp = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

  if (lower.includes('cancelled') || lower.includes('canceled')) {
    return { label: 'Cancelled', type: 'error', isExpired: true, isActive: false };
  }

  if (deadline) {
    if (deadline.timestamp < todayTimestamp) {
      return { label: `Expired (${deadline.formatted})`, type: 'error', isExpired: true, isActive: false };
    }
    if (isExtended) {
      return { label: `Extended till ${deadline.formatted}`, type: 'warning', isExpired: false, isActive: true };
    }
    return { label: `Till ${deadline.formatted}`, type: 'success', isExpired: false, isActive: true };
  }

  if (isExtended || lower.includes('date extended') || lower.includes('extended')) {
    return { label: 'Date Extended', type: 'warning', isExpired: false, isActive: true };
  }

  if (lower.includes('admit card') || section === 'admitCards') return { label: 'Admit Card Out', type: 'info', isExpired: false, isActive: true };
  if (lower.includes('result') || section === 'results') return { label: 'Result Declared', type: 'success', isExpired: false, isActive: true };
  if (lower.includes('answer key') || section === 'answerKeys') return { label: 'Answer Key Out', type: 'info', isExpired: false, isActive: true };
  if (lower.includes('syllabus') || section === 'syllabus') return { label: 'Syllabus', type: 'neutral', isExpired: false, isActive: true };
  if (lower.includes('apply online') || lower.includes('online form')) return { label: 'Apply Online', type: 'primary', isExpired: false, isActive: true };
  if (lower.includes('certificate')) return { label: 'Download Certificate', type: 'info', isExpired: false, isActive: true };

  return { label: 'Active', type: 'neutral', isExpired: false, isActive: true };
}

/**
 * Determines whether a job posting can currently be filled (not expired, not cancelled)
 */
function isFillableJob(item) {
  if (!item) return false;
  if (item.isExpired === true || item.isActive === false) return false;
  if (item.status && (item.status.toLowerCase().includes('expired') || item.status.toLowerCase().includes('cancelled'))) return false;
  if (item.lastDate) {
    const todayIso = new Date().toISOString().split('T')[0];
    if (item.lastDate < todayIso) return false;
  }
  return true;
}

const DEGREE_DISCIPLINES = [
  { id: 'cs_it', label: 'Computer Science & IT (B.Tech/BE/BCA/MCA/B.Sc CS)', shortLabel: 'CS & IT', isGraduate: true },
  { id: 'civil_eng', label: 'Civil Engineering (B.Tech/Diploma)', shortLabel: 'Civil Engg', isGraduate: true },
  { id: 'mech_eng', label: 'Mechanical Engineering (B.Tech/Diploma)', shortLabel: 'Mechanical Engg', isGraduate: true },
  { id: 'elec_eng', label: 'Electrical & Electronics (B.Tech/Diploma/ECE)', shortLabel: 'Electrical / ECE', isGraduate: true },
  { id: 'any_bachelor', label: 'Any Bachelor Degree (BA/B.Sc/B.Com/Any Graduate)', shortLabel: 'Any Bachelor Degree', isGraduate: true },
  { id: 'commerce_finance', label: 'Commerce, Accounts & CA (B.Com/M.Com/MBA)', shortLabel: 'Commerce / Accounts', isGraduate: true },
  { id: 'law_legal', label: 'Law & Legal (LLB / LLM)', shortLabel: 'Law (LLB)', isGraduate: true },
  { id: 'science_agriculture', label: 'Science & Agriculture (B.Sc / M.Sc)', shortLabel: 'Science / Agri', isGraduate: true },
  { id: 'medical_healthcare', label: 'Medical, Nursing & Pharmacy (MBBS/GNM/B.Pharm)', shortLabel: 'Medical / Nursing', isGraduate: true },
  { id: 'education_teaching', label: 'Teaching Degree (B.Ed / D.El.Ed / TET)', shortLabel: 'Teaching / B.Ed', isGraduate: true },
  { id: 'matric_inter_10_12', label: '10th / 12th Pass / ITI', shortLabel: '10th / 12th Pass', isGraduate: false }
];

/**
 * Standard Indian competitive examination rules dictionary
 */
const STANDARD_EXAM_PATTERNS = [
  // Civil Services / State PSC (Open to Any Graduate)
  {
    regex: /\b(?:civil services|ias|ips|ifs|upsc cse|state civil|upper subordinate|pcs pre|bpsc 70th|ukpsc pre|mppsc)\b/i,
    anyGraduate: true
  },
  // UPSC Engineering Services (ESE/IES) - Strictly Civil, Mech, Electrical, Electronics (Excludes CS)
  {
    regex: /\b(?:engineering service|ese|ies)\b/i,
    directFields: ['civil_eng', 'mech_eng', 'elec_eng'],
    excludeFields: [{ id: 'cs_it', message: 'UPSC ESE strictly excludes Computer Science (Only Civil, Mechanical, Electrical, Electronics allowed).' }],
    anyGraduate: false
  },
  // SSC CGL (Any Graduate)
  {
    regex: /\bssc\s*cgl\b/i,
    anyGraduate: true,
    directFields: ['commerce_finance']
  },
  // SSC CPO / SI / Police Sub Inspector / Company Commander
  {
    regex: /\b(?:ssc\s*cpo|cpo\s*si|sub\s*inspector|police\s*si|company\s*commander)\b/i,
    anyGraduate: true
  },
  // Banking PO / Clerk / Apprentice / Local Bank Officer (SBI, IBPS, BOB, Canara, etc.)
  {
    regex: /\b(?:probationary officer|bank\s*po|clerk|local\s*bank\s*officer|lbo|apprentices?|assistant\s*officer|uiic\s*ao|insurance\s*ao)\b/i,
    anyGraduate: true
  },
  // Specialist Officer (SO / SCO) in Banks (IT Officer, Accounts, Law)
  {
    regex: /\b(?:specialist\s*officer|bank\s*so|sco|wealth\s*management)\b/i,
    directFields: ['cs_it', 'commerce_finance', 'law_legal'],
    anyGraduate: true
  },
  // Technical & Computing (NIC, NIELIT, ISRO, Computer Operator, Programmer)
  {
    regex: /\b(?:nic\s*scientific|technical\s*assistant\s*a|programmer|computer\s*operator|software)\b/i,
    directFields: ['cs_it', 'elec_eng'],
    anyGraduate: false
  },
  // 10+2 Intermediate / 10th Pass (CHSL, RRB NTPC Under Graduate, Constable GD, ITBP Head Constable)
  {
    regex: /\b(?:10\+2|chsl|under\s*graduate|constable\s*gd|head\s*constable|scaler|inter\s*level)\b/i,
    directFields: ['matric_inter_10_12'],
    anyGraduate: false
  },
  // Teaching & Academic (Primary Teacher, PGT, TGT, B.Ed, Assistant Professor)
  {
    regex: /\b(?:primary\s*teacher|pgt|tgt|prt|b\.?ed|assistant\s*professor|mspstet|special\s*tet|ctet|blet)\b/i,
    directFields: ['education_teaching'],
    anyGraduate: false
  },
  // Medical & Healthcare (Medical Officer, Staff Nurse, Pharmacist, Veterinary)
  {
    regex: /\b(?:medical\s*officer|staff\s*nurse|gims|veterinary|pharmacist|paramedical|food\s*safety)\b/i,
    directFields: ['medical_healthcare', 'science_agriculture'],
    anyGraduate: false
  },
  // Junior Engineer / AE in Engineering
  {
    regex: /\b(?:junior\s*engineer|assistant\s*engineer|\bje\b|\bae\b)\b/i,
    directFields: ['civil_eng', 'mech_eng', 'elec_eng', 'science_agriculture'],
    anyGraduate: false
  },
  // Law & Public Prosecutor
  {
    regex: /\b(?:public\s*prosecutor|advocate|judicial|legal\s*officer)\b/i,
    directFields: ['law_legal'],
    anyGraduate: false
  }
];

/**
 * Checks whether text specifies an open requirement for ANY bachelor degree / graduate stream
 */
function isGeneralGraduateMatch(text) {
  const lower = (text || '').toLowerCase();
  return (
    lower.includes('any stream') ||
    lower.includes('any discipline') ||
    lower.includes('degree in any discipline') ||
    lower.includes('degree in any stream') ||
    lower.includes('bachelor degree in any') ||
    lower.includes('graduate in any') ||
    lower.includes('graduation in any') ||
    lower.includes('any recognized university') ||
    lower.includes('any university in india')
  );
}

/**
 * Checks if a specific degree discipline meets the direct field/branch requirement of a post
 */
function isDirectFieldMatch(discId, text) {
  const lower = (text || '').toLowerCase();

  // Explicit UPSC ESE exclusion for CS
  if (discId === 'cs_it' && lower.includes('upsc') && (lower.includes('engineering service') || lower.includes('ese') || lower.includes('ies'))) {
    return false;
  }

  switch (discId) {
    case 'cs_it': {
      return (
        lower.includes('computer science') ||
        lower.includes('information technology') ||
        /\b(?:cs|it)\b/i.test(lower) ||
        lower.includes('software') ||
        lower.includes('mca') ||
        lower.includes('bca') ||
        lower.includes('programmer') ||
        lower.includes('computer operator') ||
        lower.includes('data entry') ||
        lower.includes('system analyst') ||
        (lower.includes('be / b.tech') && !lower.includes('civil') && !lower.includes('mechanical') && !lower.includes('electrical'))
      );
    }

    case 'civil_eng':
      return lower.includes('civil') || lower.includes('construction') || lower.includes('surveyor') || lower.includes('b.arch') || lower.includes('mining') ||
        (lower.includes('be / b.tech') && !lower.includes('mechanical') && !lower.includes('electrical') && !lower.includes('computer'));

    case 'mech_eng':
      return lower.includes('mechanical') || lower.includes('automobile') || lower.includes('metallurg') || lower.includes('production') ||
        (lower.includes('be / b.tech') && !lower.includes('civil') && !lower.includes('electrical') && !lower.includes('computer'));

    case 'elec_eng':
      return lower.includes('electrical') || lower.includes('electronics') || lower.includes('telecom') || lower.includes('instrumentation') || /\b(?:ece|eee)\b/i.test(lower) ||
        (lower.includes('be / b.tech') && !lower.includes('civil') && !lower.includes('mechanical') && !lower.includes('computer'));

    case 'commerce_finance':
      return (
        lower.includes('commerce') ||
        lower.includes('b.com') ||
        lower.includes('m.com') ||
        lower.includes('account') ||
        /\bca\b/i.test(lower) ||
        lower.includes('icwa') ||
        lower.includes('audit') ||
        lower.includes('finance')
      );

    case 'law_legal':
      return (
        lower.includes('law') ||
        /\b(?:ll\.?b|ll\.?m)\b/i.test(lower) ||
        lower.includes('legal') ||
        lower.includes('advocate') ||
        lower.includes('judicial') ||
        lower.includes('prosecutor')
      );

    case 'science_agriculture':
      return /(?<!computer\s+)\b(?:science|b\.?sc|m\.?sc|physics|chemistry|biology|botany|zoology|agriculture|fishery|horticulture|forestry|veterinary)\b/i.test(lower);

    case 'medical_healthcare':
      return lower.includes('mbbs') || lower.includes('bds') || lower.includes('nursing') || lower.includes('nurse') || lower.includes('pharm') || lower.includes('pharmacist') || lower.includes('doctor') || lower.includes('medical') || lower.includes('cho') || lower.includes('bams') || lower.includes('bhms');

    case 'education_teaching':
      return /(?<!non[- ]?)\b(?:teacher|teaching|b\.?ed|deled|d\.?el\.?ed|btc|tet|ctet|stet|uptet|pgt|tgt|prt)\b/i.test(lower) || lower.includes('assistant professor');

    case 'matric_inter_10_12':
      return lower.includes('10th') || lower.includes('12th') || lower.includes('10+2') || lower.includes('matric') || lower.includes('intermediate') || lower.includes('iti') || lower.includes('constable') || lower.includes('high school') || lower.includes('mts') || lower.includes('peon');

    case 'any_bachelor':
      return isGeneralGraduateMatch(lower) || lower.includes('bachelor degree') || lower.includes('graduate');

    default:
      return false;
  }
}

/**
 * Legacy compatibility wrapper: checks if discipline meets requirement (either direct or via open stream)
 */
function isDisciplineEligibleForText(discId, text) {
  if (isDirectFieldMatch(discId, text)) return true;
  if (discId !== 'matric_inter_10_12' && isGeneralGraduateMatch(text)) return true;
  return false;
}

/**
 * Deep multi-discipline eligibility evaluation for a notification
 * Produces direct field matches, universal degree matches, post counts, and warnings.
 */
function evaluateDegreeEligibility(item) {
  const fullText = `${item.title || ''} ${item.details?.shortInfo || ''} ${JSON.stringify(item.details?.vacancyDetails || '')}`;
  const vacancies = item.details?.vacancyDetails || [];

  const eligibleIds = new Set();
  const fieldIds = new Set();
  const generalIds = new Set();
  const eligibleMeta = [];
  const ineligibleWarnings = [];

  // Check explicit exclusion: UPSC Engineering Services
  if (fullText.toLowerCase().includes('upsc') && (fullText.toLowerCase().includes('engineering service') || fullText.toLowerCase().includes('ese') || fullText.toLowerCase().includes('ies'))) {
    ineligibleWarnings.push({
      disciplineId: 'cs_it',
      message: 'Computer Science & IT graduates are NOT eligible for UPSC ESE (Only Civil, Mech, Electrical, Electronics allowed).'
    });
  }

  // Check against standard examination dictionary
  let matchedExamRule = null;
  for (const rule of STANDARD_EXAM_PATTERNS) {
    if (rule.regex.test(fullText)) {
      matchedExamRule = rule;
      if (rule.excludeFields) {
        for (const ef of rule.excludeFields) {
          if (!ineligibleWarnings.some(w => w.disciplineId === ef.id)) {
            ineligibleWarnings.push({ disciplineId: ef.id, message: ef.message });
          }
        }
      }
      break;
    }
  }

  // Overall check for general graduation open stream
  const hasOverallGeneralGraduate = isGeneralGraduateMatch(fullText) || Boolean(matchedExamRule?.anyGraduate);

  for (const disc of DEGREE_DISCIPLINES) {
    // Skip if explicitly disqualified
    if (ineligibleWarnings.some(w => w.disciplineId === disc.id)) {
      continue;
    }

    const matchedPosts = [];
    let hasFieldMatchInVacancies = false;
    let hasGeneralMatchInVacancies = false;

    if (vacancies.length > 0) {
      for (const v of vacancies) {
        const rowText = `${v.postName} ${v.eligibility}`;
        const isField = isDirectFieldMatch(disc.id, rowText);
        const isGen = disc.isGraduate && isGeneralGraduateMatch(rowText);

        if (isField || isGen) {
          if (isField) hasFieldMatchInVacancies = true;
          if (isGen) hasGeneralMatchInVacancies = true;

          matchedPosts.push({
            postName: v.postName,
            totalPost: v.totalPost,
            matchType: isField ? 'field' : 'general',
            reason: isField ? `Direct field requirement for ${disc.shortLabel}` : 'Open to Any Bachelor Degree stream'
          });
        }
      }
    }

    // Direct field match check from text/dictionary
    const hasFieldOverall = isDirectFieldMatch(disc.id, fullText) || Boolean(matchedExamRule?.directFields?.includes(disc.id));
    const isDirectMatch = hasFieldMatchInVacancies || hasFieldOverall;

    // General graduate match check
    const isGeneralMatch = disc.isGraduate && (hasGeneralMatchInVacancies || hasOverallGeneralGraduate);

    if (isDirectMatch || isGeneralMatch) {
      eligibleIds.add(disc.id);
      if (isDirectMatch) fieldIds.add(disc.id);
      if (isGeneralMatch) generalIds.add(disc.id);

      const matchType = (isDirectMatch && isGeneralMatch) ? 'both' : (isDirectMatch ? 'field' : 'general');
      const description = matchType === 'field'
        ? `Direct Field Match: Specifically requires ${disc.shortLabel}`
        : matchType === 'both'
        ? `Direct Field Match (${matchedPosts.filter(p => p.matchType === 'field').length} posts) + Open to Any Graduate`
        : `Eligible via Any Bachelor Degree (Open to all streams)`;

      eligibleMeta.push({
        id: disc.id,
        label: disc.label,
        shortLabel: disc.shortLabel,
        icon: disc.icon,
        matchType,
        matchedPostsCount: matchedPosts.length,
        matchingPosts: matchedPosts,
        description
      });
    }
  }

  return {
    eligibleDisciplines: Array.from(eligibleIds),
    fieldDisciplines: Array.from(fieldIds),
    generalDisciplines: Array.from(generalIds),
    eligibleDisciplinesMeta: eligibleMeta,
    ineligibleWarnings
  };
}

/**
 * Enriches and categorizes a single item with multi-dimensional metadata
 */
function categorizeItem(item, defaultSection = '') {
  const section = item.category || item.section || defaultSection;
  const searchCorpus = `${item.title || ''} ${item.link || ''} ${item.details?.shortInfo || ''}`;

  // 1. Sector
  let matchedSector = SECTOR_RULES.find(r => r.keywords.some(k => k.test(searchCorpus)));
  if (!matchedSector) {
    matchedSector = { name: 'General & Others', badge: 'general', color: '#475569' };
  }

  // 2. State
  let matchedState = STATE_RULES.find(r => r.keywords.some(k => k.test(searchCorpus)));
  const state = matchedState ? matchedState.state : 'Central / All India';

  // 3. Qualification
  let matchedQual = QUALIFICATION_RULES.find(r => r.keywords.some(k => k.test(searchCorpus)));
  const qualification = matchedQual ? matchedQual.level : 'Graduate / Check Notice';

  // 4. Organization
  const organization = extractOrganization(item.title, item.link);

  // 5. Deadline & Validity (Active relative to today's date)
  const isExtended = item.title.toLowerCase().includes('extended') ||
    Boolean(item.details?.importantDates && Object.values(item.details.importantDates).some(v => String(v).toLowerCase().includes('extended')));
  const deadline = extractLastDate(item.title, item.details?.importantDates);

  // 6. Status
  const status = extractStatus(item.title, section, deadline, isExtended);

  // 7. Degree Discipline Eligibility
  const eligibility = evaluateDegreeEligibility(item);

  // 8. Search tags
  const tags = new Set([
    matchedSector.name,
    state.split(' ')[0],
    organization,
    status.label,
    status.isActive ? 'Active' : 'Expired',
    ...eligibility.eligibleDisciplinesMeta.map(m => m.shortLabel)
  ]);

  if (item.tag) tags.add(item.tag);

  return {
    ...item,
    section: section || 'general',
    sector: matchedSector.name,
    sectorBadge: matchedSector.badge,
    sectorColor: matchedSector.color,
    state,
    qualification,
    organization,
    lastDate: deadline ? deadline.iso : null,
    lastDateFormatted: deadline ? deadline.formatted : null,
    isExpired: status.isExpired,
    isActive: status.isActive,
    status: status.label,
    statusType: status.type,
    eligibleDisciplines: eligibility.eligibleDisciplines,
    fieldDisciplines: eligibility.fieldDisciplines,
    generalDisciplines: eligibility.generalDisciplines,
    eligibleDisciplinesMeta: eligibility.eligibleDisciplinesMeta,
    ineligibleWarnings: eligibility.ineligibleWarnings,
    tags: Array.from(tags).filter(Boolean)
  };
}

/**
 * Categorizes an entire dataset collection
 */
function categorizeCollection(items, section = '') {
  if (!Array.isArray(items)) return [];
  return items.map(item => categorizeItem(item, section));
}

module.exports = {
  categorizeItem,
  categorizeCollection,
  evaluateDegreeEligibility,
  isDisciplineEligibleForText,
  isDirectFieldMatch,
  isGeneralGraduateMatch,
  isFillableJob,
  DEGREE_DISCIPLINES,
  SECTOR_RULES,
  STATE_RULES,
  QUALIFICATION_RULES
};
