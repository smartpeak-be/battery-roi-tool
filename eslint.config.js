import js from '@eslint/js';
import globals from 'globals';

// Globals exported by firebase-init.js onto window (used by other plain scripts)
const firebaseInitGlobals = {
  firebase: 'readonly',
  bootstrap: 'readonly',
  // firebase-init.js exports
  FIREBASE_CONFIG_PLACEHOLDER: 'readonly',
  RUBEN_EMAIL_PLACEHOLDER: 'readonly',
  PROJECT_STATUSES: 'readonly',
  FINISHED_STATUSES: 'readonly',
  CONNECTION_TYPES: 'readonly',
  DEFAULT_STATUS: 'readonly',
  PROJECT_PHASES: 'readonly',
  phaseForStatus: 'readonly',
  newEmptyProjectMetadata: 'readonly',
  mergeProjectMetadata: 'readonly',
  effectiveBtwFor: 'readonly',
  totalInverterPowerKw: 'readonly',
  getStatusMeta: 'readonly',
  getProjectLabel: 'readonly',
  signInWithGoogle: 'readonly',
  signOut: 'readonly',
  onAuthStateChanged: 'readonly',
  isWhitelisted: 'readonly',
  projectDoc: 'readonly',
  createProject: 'readonly',
  listActiveProjects: 'readonly',
  listDeletedProjects: 'readonly',
  getProject: 'readonly',
  updateProjectStatus: 'readonly',
  updateProjectMetadata: 'readonly',
  softDeleteProject: 'readonly',
  restoreProject: 'readonly',
  hardDeleteProject: 'readonly',
  setProjectCsv: 'readonly',
  saveLastCalcRun: 'readonly',
  getProductsConfig: 'readonly',
  createShare: 'readonly',
  getShare: 'readonly',
  listComments: 'readonly',
  addComment: 'readonly',
  markCommentsRead: 'readonly',
  hasAnyComments: 'readonly',
  hasUnreadComments: 'readonly',
  needsGroundFaultCheck: 'readonly',
  needsOfferteWarning: 'readonly',
  uploadProjectPhotoWithThumb: 'readonly',
  backfillThumbnail: 'readonly',
  deleteProjectPhoto: 'readonly',
  uploadProjectOfferte: 'readonly',
  deleteProjectOfferte: 'readonly',
  deleteProjectConfig: 'readonly',
  addProjectSerial: 'readonly',
  updateProjectSerial: 'readonly',
  deleteProjectSerial: 'readonly',
  createLead: 'readonly',
  listLeads: 'readonly',
  getLead: 'readonly',
  updateLeadToHot: 'readonly',
  createMailDoc: 'readonly',
  convertLeadToProject: 'readonly',
  // shared-helpers.js exports (loaded as module but exposes to window)
  escapeHtml: 'readonly',
  showToast: 'readonly',
  showSpinner: 'readonly',
  updateSpinner: 'readonly',
  hideSpinner: 'readonly',
  withSpinner: 'readonly',
};

export default [
  // ── Shared base: recommended rules ────────────────────────────────────────
  js.configs.recommended,

  // ── Browser ES-module source files (calc-engine, csv, shared-helpers) ─────
  {
    files: ['assets/js/calc-engine.js', 'assets/js/csv.js', 'assets/js/shared-helpers.js', 'assets/js/lead-calc.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        firebase: 'readonly',
        bootstrap: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'off',
    },
  },

  // ── Non-module browser scripts (firebase-init, status-chip, offertes-ui) ──
  // These are loaded as plain <script> and rely on globals from each other.
  {
    files: [
      'assets/js/firebase-init.js',
      'assets/js/status-chip.js',
      'assets/js/offertes-ui.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...firebaseInitGlobals,
      },
    },
    rules: {
      'no-unused-vars': 'off',        // these files export via window assignment
      'no-console': 'off',
      'no-constant-condition': 'off',
      'no-redeclare': 'off',          // intentional re-declarations across script files
    },
  },

  // ── photo-uploader.js — module but uses globals from firebase-init etc. ───
  {
    files: ['assets/js/photo-uploader.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...firebaseInitGlobals,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'off',
      'no-redeclare': 'off',          // firebase global from CDN + import
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // ── Vitest unit tests ─────────────────────────────────────────────────────
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // ── Playwright E2E tests ──────────────────────────────────────────────────
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // page.evaluate() callbacks run in browser context, not Node
      'no-undef': 'off',
    },
  },

  // ── Config files (this file, vitest.config, playwright.config) ────────────
  {
    files: ['*.config.js', 'e2e/*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // ── Ignore patterns ───────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/',
      'style.css',
      'script.js',
    ],
  },
];
