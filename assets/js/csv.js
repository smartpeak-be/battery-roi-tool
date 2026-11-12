// Shared CSV parsing — ES module.
// Used by calc-engine.js (parseCSV, parseDate, parsVolume)
// and directly by HTML pages (extractCsvForStorage).
//
// Also exposed on window for non-module scripts that depend on globals.

// Required column headers for a valid Fluvius CSV export.
const REQUIRED_HEADERS = ['Van (datum)', 'Register', 'Volume'];

/**
 * Parse a semicolon-separated Fluvius CSV into an array of row objects.
 * Skips data rows with fewer columns than the header.
 *
 * @param {string} text — raw CSV text
 * @returns {{ rows: object[], headers: string[] } | object[]}
 *   Returns plain array of row objects (backward-compatible).
 */
export function parseCSV(text) {
  if (!text || !text.trim()) return [];
  const lines = text.trim().split('\n');
  if (lines.length === 0) return [];
  const header = lines[0].split(';').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty lines
    const cols = line.split(';');
    if (cols.length < header.length) continue; // skip truncated rows
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

/**
 * Validate that CSV text contains the required Fluvius headers.
 * Returns an object with `{ valid, errors, headers }`.
 *
 * @param {string} csvText — raw CSV text
 * @returns {{ valid: boolean, errors: string[], headers: string[] }}
 */
export function validateCsvHeaders(csvText) {
  const errors = [];
  if (!csvText || !csvText.trim()) {
    return { valid: false, errors: ['Het CSV bestand is leeg.'], headers: [] };
  }
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(';').map(h => h.trim());

  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    errors.push(
      `Verplichte kolommen ontbreken: ${missing.join(', ')}. ` +
      'Controleer of dit een geldig Fluvius CSV-export is.'
    );
  }
  return { valid: errors.length === 0, errors, headers };
}

/**
 * Parse a date string from a Fluvius CSV export.
 * Handles multiple formats:
 *  - dd-mm-yyyy  (standard Fluvius)
 *  - d/mm/yyyy   (slash separator, no leading zeros)
 *  - dd/mm/yyyy  (slash separator, with leading zeros)
 *  - mm-dd-yyyy / mm/dd/yyyy  (if detectable — when first part > 12 it must be day)
 *
 * Auto-detects day vs month position:
 *  - Default assumption: first part = day, second = month (Belgian convention)
 *  - If first part > 12 → first is day (confirms default)
 *  - If second part > 12 → second is day, first is month (swap)
 *  - If both ≤ 12 → assume Belgian convention (day first)
 *
 * Returns null for unparseable input.
 */
export function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  // Support both '-' and '/' separators
  const parts = str.split(/[-/]/);
  if (parts.length !== 3) return null;

  let a = +parts[0], b = +parts[1], y = +parts[2];
  if (!a || !b || !y) return null;

  // Third part must be a 4-digit year; reject yyyy-mm-dd
  if (y < 1900 || y > 2100) return null;
  // Also reject if first part looks like a 4-digit year (yyyy-mm-dd)
  if (a > 999) return null;

  let day, month;
  if (a > 12) {
    // First part > 12 → must be day
    day = a;
    month = b;
  } else if (b > 12) {
    // Second part > 12 → must be day, first is month
    day = b;
    month = a;
  } else {
    // Both ≤ 12 → Belgian convention: day first
    day = a;
    month = b;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(y, month - 1, day);
  // Guard against NaN dates (e.g. from overflow or bad input)
  if (isNaN(date.getTime())) return null;
  return date;
}

// Use calendar fields instead of toISOString(): midnight in Belgium is the
// previous UTC date for most of the year, which used to shift every Fluvius day
// one day backwards in the UI.
export function localDateKey(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseTimeMinutes(str) {
  if (str == null || str === '') return null;
  const parts = String(str).trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  const second = parts.length === 3 ? Number(parts[2]) : 0;
  if (![hour, minute, second].every(Number.isFinite)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return hour * 60 + minute + second / 60;
}

function utcDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function tariffFromRow(row, register) {
  const combined = `${register} ${row['Tarief'] || ''}`.toLowerCase();
  if (combined.includes('nacht')) return 'night';
  if (combined.includes('dag')) return 'day';
  return 'single';
}

function intervalDurationHours(row, startDate, startMinutes) {
  const endDate = parseDate(row['Tot (datum)'] || '') || startDate;
  const endMinutes = parseTimeMinutes(row['Tot (tijdstip)']);
  if (startMinutes == null || endMinutes == null) return null;
  const minutes = (utcDayNumber(endDate) - utcDayNumber(startDate)) * 1440 + endMinutes - startMinutes;
  return minutes > 0 ? minutes / 60 : null;
}

/** Build measured interval blocks when the CSV contains sub-daily timestamps. */
export function rowsToTimeBlocks(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const date = parseDate(row['Van (datum)']);
    const minutes = parseTimeMinutes(row['Van (tijdstip)']);
    const durationHours = date && minutes != null ? intervalDurationHours(row, date, minutes) : null;
    // Daily Fluvius exports also contain 00:00 → next day 00:00. Do not treat
    // those rows as measured interval data.
    if (!date || minutes == null || durationHours == null || durationHours >= 23) continue;
    const key = `${localDateKey(date)}|${minutes}`;
    if (!map.has(key)) {
      map.set(key, {
        start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), Math.floor(minutes % 60)),
        durationHours,
        afname: 0,
        injectie: 0,
        tariff: 'single',
        measuredInterval: true,
      });
    }
    const block = map.get(key);
    block.durationHours = Math.min(block.durationHours, durationHours);
    const register = (row['Register'] || '').toLowerCase();
    const volume = parsVolume(row['Volume']);
    if (register.includes('afname')) block.afname += volume;
    if (register.includes('injectie')) block.injectie += volume;
    const tariff = tariffFromRow(row, register);
    if (tariff !== 'single') block.tariff = tariff;
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

function uint16ToBase64(values) {
  const bytes = new Uint8Array(values.buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint16(base64) {
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Uint16Array(bytes.buffer);
}

export function buildQuarterCompact(blocks) {
  const measured = (blocks || []).filter(b => b.measuredInterval && Math.abs(b.durationHours - 0.25) < 0.01);
  if (!measured.length) return null;
  const first = measured[0].start;
  const last = measured[measured.length - 1].start;
  const firstDay = utcDayNumber(first);
  const days = utcDayNumber(last) - firstDay + 1;
  const slotsPerDay = 96;
  const values = new Uint16Array(days * slotsPerDay * 2);
  for (const block of measured) {
    const dayOffset = utcDayNumber(block.start) - firstDay;
    const minute = block.start.getHours() * 60 + block.start.getMinutes();
    const slot = Math.floor(minute / 15);
    if (dayOffset < 0 || dayOffset >= days || slot < 0 || slot >= slotsPerDay) continue;
    const index = (dayOffset * slotsPerDay + slot) * 2;
    // Store Wh as compact unsigned integers. Multiple rows for a slot are
    // already aggregated by rowsToTimeBlocks.
    values[index] = Math.min(65535, Math.round((block.afname || 0) * 1000));
    values[index + 1] = Math.min(65535, Math.round((block.injectie || 0) * 1000));
  }
  return {
    version: 1,
    startDate: localDateKey(first),
    days,
    slotMinutes: 15,
    whBase64: uint16ToBase64(values),
  };
}

export function buildTimeBlocksFromQuarterCompact(compact) {
  if (!compact || compact.version !== 1 || !compact.whBase64) return [];
  const start = new Date(`${compact.startDate}T00:00:00`);
  const values = base64ToUint16(compact.whBase64);
  const slotsPerDay = Math.round(1440 / compact.slotMinutes);
  const blocks = [];
  for (let day = 0; day < compact.days; day++) {
    for (let slot = 0; slot < slotsPerDay; slot++) {
      const index = (day * slotsPerDay + slot) * 2;
      const afname = (values[index] || 0) / 1000;
      const injectie = (values[index + 1] || 0) / 1000;
      if (afname === 0 && injectie === 0) continue;
      const blockStart = new Date(start);
      blockStart.setDate(start.getDate() + day);
      blockStart.setMinutes(slot * compact.slotMinutes);
      blocks.push({
        start: blockStart,
        durationHours: compact.slotMinutes / 60,
        afname,
        injectie,
        tariff: 'single',
        measuredInterval: true,
      });
    }
  }
  return blocks;
}

export function parsVolume(str) {
  if (!str || str === '') return 0;
  return parseFloat(str.replace(',', '.')) || 0;
}

// Build the dailyCompact + meta object that the dashboard's "new project" flow stores in
// Firestore (and that index.html's project-mode reads back). Same per-day shape as v:5
// share-link saves, so the existing restore-path in index.html can decode it.
//
// Returns: { eanCode, meterNr, meterType, dailyCompact: { startDate, afname[], injectie[],
//            afnamedag[], afnamenacht[], injectiedag[], injectienacht[] } }
//
// Throws descriptive Error if the CSV is invalid or has no usable data rows.
export function extractCsvForStorage(csvText) {
  // Validate headers first
  const validation = validateCsvHeaders(csvText);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const rows = parseCSV(csvText);

  let eanCode = '', meterNr = '', meterType = '';
  for (const row of rows) {
    if (row['EAN-code'] && !eanCode) {
      eanCode   = row['EAN-code'].replace(/^="?|"?=$/g, '').replace(/"/g, '').replace(/=/g, '');
      meterNr   = row['Meter']     || '';
      meterType = row['Metertype'] || '';
      break;
    }
  }

  const dayMap = {};
  let skippedDates = 0;
  for (const row of rows) {
    const dateStr = row['Van (datum)'];
    if (!dateStr) continue;
    const date = parseDate(dateStr);
    if (!date) { skippedDates++; continue; }
    const key = localDateKey(date);
    if (!dayMap[key]) dayMap[key] = { date, afname: 0, injectie: 0, afnamedag: 0, afnamenacht: 0, injectiedag: 0, injectienacht: 0 };
    const register = (row['Register'] || '').toLowerCase();
    const vol = parsVolume(row['Volume']);
    if (register.includes('afname'))   dayMap[key].afname   += vol;
    if (register.includes('injectie')) dayMap[key].injectie += vol;
    const tariff = tariffFromRow(row, register);
    if (register.includes('afname') && tariff === 'day') dayMap[key].afnamedag += vol;
    if (register.includes('afname') && tariff === 'night') dayMap[key].afnamenacht += vol;
    if (register.includes('injectie') && tariff === 'day') dayMap[key].injectiedag += vol;
    if (register.includes('injectie') && tariff === 'night') dayMap[key].injectienacht += vol;
  }

  const allDays = Object.values(dayMap).sort((a, b) => a.date - b.date);

  if (!allDays.length) {
    const detail = skippedDates > 0
      ? ` ${skippedDates} rij(en) hadden een ongeldig datumformaat (verwacht: dd-mm-jjjj of d/mm/jjjj).`
      : '';
    throw new Error('Geen bruikbare data gevonden in het CSV bestand.' + detail);
  }

  const startDate = localDateKey(allDays[0].date);
  const timeBlocks = rowsToTimeBlocks(rows);
  return {
    eanCode, meterNr, meterType,
    dataGranularity: timeBlocks.length ? 'quarter' : 'daily',
    quarterCompact: buildQuarterCompact(timeBlocks),
    dailyCompact: {
      startDate,
      afname:        allDays.map(d => d.afname),
      injectie:      allDays.map(d => d.injectie),
      afnamedag:     allDays.map(d => d.afnamedag),
      afnamenacht:   allDays.map(d => d.afnamenacht),
      injectiedag:   allDays.map(d => d.injectiedag),
      injectienacht: allDays.map(d => d.injectienacht),
    },
  };
}

// Expose on window so non-module scripts (firebase-init.js, offertes-ui.js) can access them
if (typeof window !== 'undefined') {
  window.parseCSV = parseCSV;
  window.parseDate = parseDate;
  window.parsVolume = parsVolume;
  window.extractCsvForStorage = extractCsvForStorage;
  window.validateCsvHeaders = validateCsvHeaders;
}
