export const ALL_TIME = 'all';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_BY_NAME = new Map([
  ['jan', 1], ['january', 1],
  ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4],
  ['may', 5],
  ['jun', 6], ['june', 6],
  ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8],
  ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12]
]);

const YEAR_SOURCE_FIELDS = [
  'eta', 'ata', 'validated_manifest_date', 'lodgement', 'assessed', 'paid',
  'releasing_date', 'received_folder', 'billed_date', 'dispatch', 'dt_computation'
];

function monthKey(year, month) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return '';
  if (!Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseDateMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(19\d{2}|20\d{2})[-/]([01]?\d)(?:[-/]\d{1,2})?/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return { year: Number(iso[1]), month };
  }
  return null;
}

function normalizeTwoDigitYear(year) {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function parseServiceMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }

  const text = String(value ?? '').trim();
  if (!text || /^(?:n\/?a|na|tba|tbd|nil|none|[-—.]*)$/i.test(text)) return null;

  const compact = text.match(/^(19\d{2}|20\d{2})(0[1-9]|1[0-2])$/);
  if (compact) return { year: Number(compact[1]), month: Number(compact[2]) };

  const iso = text.match(/^(19\d{2}|20\d{2})[-/]([01]?\d)(?:[-/]\d{1,2})?$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };

  const numeric = text.match(/^([01]?\d)[/-](\d{2}|\d{4})$/);
  if (numeric) return { year: normalizeTwoDigitYear(Number(numeric[2])), month: Number(numeric[1]) };

  const named = text.match(/^([A-Za-z]+)(?:[\s/-]+(\d{2}|\d{4}))?$/);
  if (named) {
    const month = MONTH_BY_NAME.get(named[1].toLowerCase());
    if (!month) return null;
    return { month, year: named[2] ? normalizeTwoDigitYear(Number(named[2])) : null };
  }

  return null;
}

function inferYear(row, now = new Date()) {
  for (const field of YEAR_SOURCE_FIELDS) {
    const parsed = parseDateMonth(row?.[field]);
    if (parsed?.year) return parsed.year;
  }
  return now.getFullYear();
}

export function currentMonthKey(now = new Date()) {
  return monthKey(now.getFullYear(), now.getMonth() + 1);
}

export function getOfficialShipmentMonthKey(row, now = new Date()) {
  const service = parseServiceMonth(row?.service_month);
  if (service?.month) {
    return monthKey(service.year || inferYear(row, now), service.month);
  }

  const eta = parseDateMonth(row?.eta);
  if (eta) return monthKey(eta.year, eta.month);
  return '';
}

export function filterRowsByMonth(rows, selectedMonth, now = new Date()) {
  if (!selectedMonth || selectedMonth === ALL_TIME) return [...(rows || [])];
  return (rows || []).filter((row) => getOfficialShipmentMonthKey(row, now) === selectedMonth);
}

export function getAvailableMonthKeys(rows, now = new Date()) {
  const keys = new Set([currentMonthKey(now)]);
  for (const row of rows || []) {
    const key = getOfficialShipmentMonthKey(row, now);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

export function formatMonthLabel(key) {
  if (key === ALL_TIME) return 'All Time';
  const match = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Unknown Month';
  const month = Number(match[2]);
  return `${MONTH_NAMES[month - 1] || 'Unknown'} ${match[1]}`;
}
