# SmartPeak — Verbeterbacklog

Overzicht van alle verbeterpunten, te behandelen stuk voor stuk.
Status: `[ ]` open · `[~]` bezig · `[x]` klaar

---

## A. JS-extractie & tests (huidige focus)

- [x] **A1. Calc-engine extraheren uit `index.html`**
      ~1.850 regels inline JS → `assets/js/calc-engine.js`.
      Pure functies: `calcScenario`, `processData`, `capAnalysis`,
      `computePerYearStats`, `averageStats`, schalingsfactor-logica.
- [x] **A2. Logische tests schrijven voor calc-engine**
      47 Vitest tests (calc-engine: 22, csv: 15, shared-helpers: 10).
      13 E2E Playwright tests (project-crud, calculator, dashboard-ui).
- [x] **A3. Shared helpers extraheren**
      `escapeHtml`, `showToast`, datumformattering, `shortEmail`
      → `assets/js/shared-helpers.js`. Geïmporteerd door alle 3 HTML-bestanden.
- [x] **A4. Dashboard inline JS verkleinen**
      ~670 regels geanalyseerd: nul duplicatie met bestaande modules, alle
      shared helpers correct geïmporteerd. Code is pagina-specifiek en goed
      gestructureerd — geen extractie nodig.
- [x] **A5. Project-edit inline JS verkleinen**
      ~504 regels dead accordion-code verwijderd.
      File van 1.592 → 1.088 regels.

## B. Componentisering & hergebruik

- [x] **B1. Upload-component generaliseren**
      `mountPhotoUploader(containerEl, opts)` factory in
      `assets/js/photo-uploader.js`. Gebruikt in dashboard drawer + project-edit.
- [x] **B2. Spinner/loading-component**
      Globale overlay spinner in `shared-helpers.js`:
      `showSpinner(opts)`, `updateSpinner(opts)`, `hideSpinner()`, `withSpinner(fn)`.
      CSS in `smartpeak.css` + inline in `index.html`.
      Geïntegreerd in alle 5 bestanden (dashboard, project-edit, index,
      photo-uploader, offertes-ui). Foto-uploads tonen voortgangsbalk
      met "X van Y geüpload".
- [x] **B3. Status-chip component**
      `statusChipHTML(statusKey, projectId)` en `wireStatusChipClicks(el, onChange)`
      geëxtraheerd naar `assets/js/status-chip.js`. Gebruikt door dashboard
      lijst, bord, en drawer via één gedeeld bestand.
- [x] **B4. Toast-component consolideren**
      Backoffice: `showToast` in `shared-helpers.js` (Bootstrap 5 toast).
      Calculator: eigen lichtgewicht `showToast` (geen Bootstrap, eigen #toast).
- [ ] **B5. Form-validatie helpers**
      `showFieldError`/`clearFieldError`/`collectFromForm` patronen
      herhalen zich — kandidaat voor een gedeeld form-utils bestand.

## C. Code-kwaliteit & robuustheid

- [x] **C1. CSV-parsing hardenen**
      `validateCsvHeaders()` controleert verplichte Fluvius kolommen
      (Van (datum), Register, Volume). `parseDate()` retourneert `null`
      i.p.v. NaN Date bij ongeldige input. `extractCsvForStorage()` en
      `csvToAllDaysAndMeta()` skippen rijen met ongeldige datums en
      geven duidelijke Nederlandse foutmeldingen. 17 nieuwe unit tests.
- [x] **C2. Input-validatie bounds**
      `VALIDATION_BOUNDS` en `validateCalcInputs()` in `calc-engine.js`.
      Bounds: inverter kW (0.1–100), tariefprijzen (0.01–2.00 €/kWh),
      capaciteit (0.5–200 kWh), rendement (0.5–1.0). Defensieve guard
      in `processDataPure` voor division-by-zero (batInv === 0).
      Geïntegreerd in `index.html` calculate() en `project-edit.html`
      collectFromForm(). 22 nieuwe unit tests (86 totaal).
- [x] **C3. Dashboard drawer race condition**
      Stale-guard patroon in `openDrawer()`, `_refreshCurrentDrawer()`,
      en null-guard in `refreshDrawerAfterChange()`. Na elke `await`
      wordt `_drawerProjectId` vergeleken met het captured ID; bij
      mismatch wordt de stale response weggegooid.
- [x] **C4. Magic numbers → constanten**
      `100`, `2.5`, `200` → `CALC_CONSTANTS` in `calc-engine.js`.
- [x] **C5. `renderResults()` opsplitsen**
      305 regels → 6 helpers: `renderPeriodAlert`, `renderScenarioAlert`,
      `renderSummaryCard`, `makeScenCard` (module-level), `renderScenarioGrid`,
      `renderMonthlyTable`. `renderResults()` nu ~20-regel orchestrator.

## D. Opruiming

- [x] **D1. Dead code verwijderen**
      `style.css`, `script.js`, `background.jpg`, `logo.jpg` verwijderd.
- [x] **D2. Dead code in project-edit.html**
      ~504 regels ongebruikte accordion-functies verwijderd (zie A5).
- [x] **D3. Analyse-bestanden opruimen**
      Geen analyse-bestanden in repo root aangetroffen.

## E. Toekomstig (nice-to-have)

- [x] **E1. Lint-configuratie toevoegen** (ESLint basis)
      ESLint 9 flat config met secties voor ES modules, non-module browser
      scripts, photo-uploader, Vitest tests, en Playwright E2E. `npm run lint`
      en `npm run lint:fix` scripts. 0 errors, 0 warnings na code fixes
      (error cause chaining, unused vars, regex escapes, empty catches).
- [x] **E2. Accessibility verbeteren** (ARIA labels, keyboard-nav)
      `aria-label` op alle icon-only buttons (dashboard, offertes-ui,
      photo-uploader lightbox). `role="img"` + `aria-label` op warning/chat
      indicatoren. `role="dialog"` + focus management op lightbox.
      `role="alert"` op drawer warning banners. `aria-current` op view toggle.
      Visually-hidden labels voor search input en offerte file input.
      `:focus-visible` styles voor custom buttons in `smartpeak.css`.
- [x] **E3. Lazy-load Chart.js** (alleen op calc-pagina)
      Eager `<script>` tag verwijderd (~206 KB). `_loadChartJs()` laadt
      Chart.js dynamisch bij eerste aanroep van `renderEnergyChart()`.
      Deduplicatie via `_chartJsPromise`. Graceful fallback bij CDN-fout.
- [ ] **E4. Pagination in projectlijst** (bij groei > 50 projecten)

---

*Aangemaakt: 2026-05-04 — wordt bijgewerkt naarmate items afgewerkt worden.*
