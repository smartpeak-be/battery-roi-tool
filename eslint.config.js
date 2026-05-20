import js from '@eslint/js';
import globals from 'globals';

// Globals exported by firebase-init.js onto window (used by other plain scripts)
const firebaseInitGlobals = {
  firebase: 'readonly',
  bootstrap: 'readonly',
  SmartPeakChartLoader: 'readonly',
  // firebase-init.js exports
  FIREBASE_CONFIG_PLACEHOLDER: 'readonly',
  RUBEN_EMAIL_PLACEHOLDER: 'readonly',
  initFirebase: 'readonly',
  currentUserEmail: 'readonly',
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
  groundFaultStatus: 'readonly',
  needsOfferteWarning: 'readonly',
  listProjectPhotos: 'readonly',
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
  softDeleteLead: 'readonly',
  restoreLead: 'readonly',
  hardDeleteLead: 'readonly',
  createMailDoc: 'readonly',
  convertLeadToProject: 'readonly',
  migrateMeerkostMapToLines: 'readonly',
  isMarstekConfig: 'readonly',
  isZendureConfig: 'readonly',
  isSupportedConfig: 'readonly',
  isManualConfig: 'readonly',
  _genSerialId: 'readonly',
  getSettings: 'readonly',
  saveSettings: 'readonly',
  listProductCategories: 'readonly',
  createProductCategory: 'readonly',
  updateProductCategory: 'readonly',
  deleteProductCategory: 'readonly',
  getDefaultCategory: 'readonly',
  listProducts: 'readonly',
  getProduct: 'readonly',
  createProduct: 'readonly',
  updateProduct: 'readonly',
  deleteProduct: 'readonly',
  toggleProductActive: 'readonly',
  uploadProductPhoto: 'readonly',
  listProductPhotos: 'readonly',
  deleteProductPhoto: 'readonly',
  uploadProductDatasheet: 'readonly',
  listProductDatasheets: 'readonly',
  deleteProductDatasheet: 'readonly',
  requestPhotoOcrRerun: 'readonly',
  setPhotoSerialTag: 'readonly',
  // UI helpers exported by non-module/module helper scripts
  statusChipHTML: 'readonly',
  wireStatusChipClicks: 'readonly',
  renderOffertesCards: 'readonly',
  renderOffertesSection: 'readonly',
  wireOffertesClicks: 'readonly',
  ensureOfferteModal: 'readonly',
  mountPhotoUploader: 'readonly',
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
    files: [
      'assets/js/calc-engine.js',
      'assets/js/csv.js',
      'assets/js/shared-helpers.js',
      'assets/js/lead-calc.js',
      'assets/js/serial-extract.js',
      'assets/js/index/scenario-card.js',
      'assets/js/index/energy-chart.js',
      'assets/js/producten-beheer/renderers.js',
    ],
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'off',
    },
  },

  // ── Page entry modules extracted from inline HTML scripts ───────────────
  {
    files: ['assets/js/pages/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...firebaseInitGlobals,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'off',
    },
  },

  // ── Non-module browser scripts (firebase-init, status-chip, offertes-ui) ──
  // These are loaded as plain <script> and rely on globals from each other.
  {
    files: [
      'assets/js/firebase-init.js',
      'assets/js/status-chip.js',
      'assets/js/offertes-ui.js',
      'assets/js/chart-loader.js',
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // page.evaluate() callbacks run in browser context, not Node
      'no-undef': 'off',
    },
  },

  // ── Node/CommonJS utility scripts ──────────────────────────────────────────
  {
    files: ['e2e/**/*.cjs', 'scripts/**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
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
