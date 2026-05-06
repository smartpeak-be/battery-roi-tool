// Lead-specific calculation logic: resolve defaults, select best config, build result.
// Pure functions — no DOM, no Firestore.

import { processDataPure, parseSheetConfigs } from './calc-engine.js';

export const LEAD_DEFAULTS = {
  pvInverterKw: 3.5,
  pricePerKwh: 0.34,
  btw: 21
};

export function resolveLeadInputs(raw) {
  throw new Error('Not implemented');
}

export function selectBestConfig(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw) {
  throw new Error('Not implemented');
}

export function buildLeadResult(configResult) {
  throw new Error('Not implemented');
}

export function buildDefaultsNotes(defaultsUsed) {
  throw new Error('Not implemented');
}
