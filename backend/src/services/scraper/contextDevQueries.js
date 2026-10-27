/**
 * Context.dev query catalogue.
 * Each entry is one Answers API task. Add organisations here to widen coverage;
 * the scraper runs them sequentially (account allows 1 in-flight request).
 *
 * category must be 'research' or 'psu' (the two tabs the frontend renders).
 * audience: 'student' | 'professional' | undefined (auto-detected per item).
 */

const FIELDS = 'Provide official title, organization, qualification, stipend/salary, lastDate (YYYY-MM-DD), total vacancies, state, and the official notification or apply link.';

function buildTask(count, what, orgs, year) {
  return `Find ${count} active official ${what} from ${orgs} with application deadlines after today, in ${year} or later. Only include real notifications published on the organisation's official website. ${FIELDS}`;
}

function getQueryTasks(year = new Date().getFullYear()) {
  const t = (count, what, orgs) => buildTask(count, what, orgs, year);

  return [
    // ── Research & academic institutions ─────────────────────────────
    {
      name: 'Research councils: CSIR / ICMR / ICAR / DBT / DST labs',
      category: 'research',
      opportunityType: 'Research Fellowship',
      task: t(15, 'recruitment notifications (JRF, SRF, Project Associate, Project Scientist, Research Associate, Technical Assistant)', 'CSIR labs, ICMR institutes, ICAR institutes, DBT and DST institutes')
    },
    {
      name: 'Space, atomic & defence research: ISRO / DRDO / BARC / DAE',
      category: 'research',
      opportunityType: 'Research Fellowship',
      task: t(15, 'recruitment notifications (Scientist/Engineer, JRF, Apprentice, Technician, Project staff)', 'ISRO centres, DRDO labs, BARC, DAE units, NPCIL')
    },
    {
      name: 'Technical institutes: IITs / NITs / IIITs / IISc / IISER',
      category: 'research',
      opportunityType: 'Institute Opening',
      task: t(15, 'recruitment notifications (faculty, non-teaching staff, project staff, JRF, PhD admissions with fellowship)', 'IITs, NITs, IIITs, IISc and IISERs')
    },
    {
      name: 'Medical institutes: AIIMS / PGIMER / JIPMER / ESIC',
      category: 'research',
      opportunityType: 'Institute Opening',
      task: t(15, 'recruitment notifications (Senior Resident, Junior Resident, Nursing Officer, Faculty, Technician, Scientist)', 'AIIMS campuses, PGIMER, JIPMER, ESIC hospitals and central government medical institutes')
    },
    {
      name: 'Central & state universities and IIMs',
      category: 'research',
      opportunityType: 'University Opening',
      task: t(15, 'recruitment notifications (Assistant Professor, Associate Professor, Registrar, non-teaching staff, project fellows)', 'Central Universities, state universities, IIMs and UGC-recognised government institutions')
    },
    {
      name: 'Government internships, apprenticeships & fellowships',
      category: 'research',
      opportunityType: 'Internship / Apprenticeship',
      audience: 'student',
      task: t(15, 'internship, apprenticeship and fellowship programmes (including NATS/NAPS apprentices and summer research fellowships)', 'central government ministries, departments, research bodies and PSUs')
    },

    // ── PSUs ─────────────────────────────────────────────────────────
    {
      name: 'Oil, gas & energy PSUs',
      category: 'psu',
      opportunityType: 'PSU Recruitment',
      task: t(15, 'recruitment notifications (Executive Trainee, Engineer, Officer, Apprentice, Non-executive)', 'ONGC, IOCL, BPCL, HPCL, GAIL, Oil India, NTPC, NHPC, POWERGRID, SJVN, Coal India and its subsidiaries')
    },
    {
      name: 'Steel, mining & heavy industry PSUs',
      category: 'psu',
      opportunityType: 'PSU Recruitment',
      task: t(15, 'recruitment notifications (Management Trainee, Engineer, Operator, Apprentice)', 'SAIL, NMDC, NALCO, MOIL, BHEL, HAL, BEL, BEML, Mazagon Dock, Cochin Shipyard, GRSE and Bharat Dynamics')
    },
    {
      name: 'Railway PSUs & transport bodies',
      category: 'psu',
      opportunityType: 'PSU Recruitment',
      task: t(15, 'recruitment notifications (Engineer, Manager, Executive, Apprentice, Technician)', 'RVNL, IRCON, RITES, CONCOR, IRCTC, IRFC, Konkan Railway, Airports Authority of India, NHAI and DFCCIL')
    },
    {
      name: 'Banks, insurers & financial PSUs',
      category: 'psu',
      opportunityType: 'Banking / Financial',
      task: t(15, 'recruitment notifications (Probationary Officer, Specialist Officer, Clerk, Apprentice, Assistant Manager)', 'public sector banks, RBI, NABARD, SIDBI, LIC, New India Assurance, GIC Re and other government financial institutions')
    },
    {
      name: 'Telecom, IT & other central PSUs',
      category: 'psu',
      opportunityType: 'PSU Recruitment',
      task: t(15, 'recruitment notifications (Junior Telecom Officer, Engineer, Manager, Executive, Apprentice)', 'BSNL, MTNL, ECIL, C-DAC, NIC, NICSI, EPFO, FCI, CWC, HMT, MECON and other Central Public Sector Enterprises')
    },
    {
      name: 'State-owned PSUs, boards & corporations',
      category: 'psu',
      opportunityType: 'State PSU / Board',
      task: t(15, 'recruitment notifications (Engineer, Junior Engineer, Officer, Technician, Assistant)', 'state electricity boards and transmission corporations, state road transport corporations, state PSUs and state development corporations')
    }
  ];
}

module.exports = { getQueryTasks };
