/**
 * Reactive Client State Management for sarkari hith
 */

export const state = {
  data: {
    trending: [],
    results: [],
    admitCards: [],
    latestJobs: [],
    answerKeys: [],
    syllabus: [],
    admissions: [],
    certificates: [],
    important: [],
    meta: {}
  },
  categories: {
    sectors: [],
    states: [],
    qualifications: [],
    disciplines: []
  },
  filters: {
    searchQuery: '',
    sector: 'all',
    state: 'all',
    qualification: 'all',
    degreeStream: localStorage.getItem('sr_degreeStream') || 'all',
    degreeScope: 'all', // 'all' (Field + General) | 'field' (Direct Field Only) | 'general' (General Degree Only)
    activeOnly: true
  },
  activeMobileTab: 'latestJobs', // 'latestJobs' | 'admitCards' | 'results'
  activeSecondaryTab: 'answerKeys', // 'answerKeys' | 'syllabus' | 'admissions' | 'certificates'
  isScraping: false,
  selectedItem: null
};

// Cleanup any legacy theme settings
try {
  localStorage.removeItem('sr_theme');
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.removeAttribute('data-theme');
  }
} catch (e) {
  // Ignore localStorage errors
}

const listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

export function notify() {
  listeners.forEach(fn => fn(state));
}

export function setFilters(newFilters) {
  state.filters = { ...state.filters, ...newFilters };
  if (newFilters.degreeStream !== undefined) {
    localStorage.setItem('sr_degreeStream', newFilters.degreeStream);
  }
  notify();
}

export function resetFilters() {
  localStorage.removeItem('sr_degreeStream');
  state.filters = {
    searchQuery: '',
    sector: 'all',
    state: 'all',
    qualification: 'all',
    degreeStream: 'all',
    degreeScope: 'all',
    activeOnly: true
  };
  notify();
}

export function setScraping(status) {
  state.isScraping = status;
  notify();
}

export function setSelectedItem(item) {
  state.selectedItem = item;
  notify();
}

/**
 * Filter an array of items against the current active filter criteria
 */
export function filterItems(items) {
  if (!Array.isArray(items)) return [];
  const { searchQuery, sector, state: targetState, qualification, degreeStream, degreeScope, activeOnly } = state.filters;
  const todayStr = new Date().toISOString().split('T')[0];

  return items.filter(item => {
    // 0. Active Only / Fillable Job Filter
    // Any job whose application deadline has passed or has been cancelled cannot be filled
    if (activeOnly || item.section === 'latestJobs') {
      if (item.isExpired === true || item.isActive === false) {
        return false;
      }
      if (item.status && (item.status.toLowerCase().includes('expired') || item.status.toLowerCase().includes('cancelled'))) {
        return false;
      }
      if (item.lastDate && item.lastDate < todayStr) {
        return false;
      }
    }

    // 1. Degree / Branch Eligibility & Scope Filter
    if (degreeStream && degreeStream !== 'all') {
      const isDirectField = Array.isArray(item.fieldDisciplines) && item.fieldDisciplines.includes(degreeStream);
      const isGeneral = Array.isArray(item.generalDisciplines) && item.generalDisciplines.includes(degreeStream);
      const isEligible = Array.isArray(item.eligibleDisciplines) && item.eligibleDisciplines.includes(degreeStream);

      if (degreeScope === 'field') {
        if (!isDirectField) return false;
      } else if (degreeScope === 'general') {
        if (!isGeneral) return false;
      } else {
        // 'all' scope: either direct field match or general graduate match
        if (!isEligible) return false;
      }
    }

    // 2. Sector Filter
    if (sector !== 'all') {
      const matchSector = item.sectorBadge === sector ||
        item.sector?.toLowerCase() === sector.toLowerCase();
      if (!matchSector) return false;
    }

    // 3. State Filter
    if (targetState !== 'all') {
      if (item.state !== targetState) return false;
    }

    // 4. Qualification Filter
    if (qualification !== 'all') {
      if (item.qualification !== qualification) return false;
    }

    // 5. Keyword Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = item.title?.toLowerCase().includes(q);
      const orgMatch = item.organization?.toLowerCase().includes(q);
      const sectorMatch = item.sector?.toLowerCase().includes(q);
      const tagMatch = item.tags?.some(t => t.toLowerCase().includes(q));
      if (!titleMatch && !orgMatch && !sectorMatch && !tagMatch) return false;
    }

    return true;
  });
}
