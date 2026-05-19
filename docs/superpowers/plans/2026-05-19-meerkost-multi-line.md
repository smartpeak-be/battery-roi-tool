# Meerkost Multi-Line Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single per-config `meerkost` numeric field with a list of labelled lines (`description` + `amount` ex BTW), persist the new shape under save-format `v: 6`, lazily migrate existing project docs on first open, and render a per-config price breakdown in each scenario card.

**Architecture:** All UI lives in `index.html` (calculator). The disclosure pattern is duplicated for sheet-configs (under each picker row in `#configPickerList`) and manual configs (under each card in `#manualConfigCards`). Both surfaces read into a single `{[type]: MeerkostLine[]}` map keyed by config-type (sheet's `type` field or manual's `MANUAL_<uuid>` key). Persistence flows through `_serializeState` (share-links / JSON saves) and `lastCalcRun.inputs` (project mode). A new `migrateMeerkostMapToLines` helper in `firebase-init.js` performs the one-time write-migration via `projectDoc(id).update(...)` with dotted-path keys.

**Tech Stack:** Plain ES (no build), Firebase compat SDK 10.13.2 (Firestore + Storage), Playwright E2E + Firebase Admin SDK for test setup. No bundler, no lint config.

**Spec:** `docs/superpowers/specs/2026-05-19-meerkost-multi-line-design.md`

---

## File Structure

| File | What changes |
|---|---|
| `index.html` | All input UI (sheet + manual disclosures), `_serializeState` v:6 bump, `_applyLoadedState` v:5 fallback, `_readMeerkostLinesFromDom`, `readAllSelectedConfigObjects` cfg shape, `makeScenCard` breakdown, `renderScenarioGrid` cfg pass-through, config-group-header annotation source, `buildSavedFromProject` shape, `saveLastCalcRun` callsite, write-migration trigger after project hydration, helpers (`_genMeerkostId`, `_emptyMeerkostLine`, `_sumMeerkostLines`, `_migrateMeerkostMapToLines`), CSS for `.meerkost-details` / `.meerkost-row` / `.installprice-details`. |
| `assets/js/firebase-init.js` | Add `migrateMeerkostMapToLines(projectId, lines)` helper using `projectDoc(id).update(...)` + `FieldValue.delete()`, expose on `window` for `index.html`. |
| `e2e/tests/meerkost-lines.spec.js` | NEW. Four Playwright scenarios: (1) add lines + Bereken, (2) project reload, (3) write-migration of legacy `meerkostMap`, (4) share-link breakdown visible read-only. |
| `e2e/helpers/project-helpers.js` | Confirm or extend with a `seedLegacyMeerkostMap(...)` helper for scenario (3) — see Task 13. |
| `CLAUDE.md` | Update the 2026-05-08 meerkost paragraph: schema change, v:6 bump, write-migration. |

---

## Task 1: Write the failing E2E spec (happy path)

**Files:**
- Create: `e2e/tests/meerkost-lines.spec.js`

The test will fail because the UI/persistence changes don't exist yet. We use this as our "done" signal at the end of the plan.

- [ ] **Step 1: Write the spec file**

```javascript
// e2e/tests/meerkost-lines.spec.js
import { test, expect } from '../helpers/auth-fixture.js';
import { createProjectViaAdmin, deleteProjectViaAdmin, getProjectViaAdmin } from '../helpers/project-helpers.js';
import path from 'node:path';

const FIXTURE_CSV = path.join(import.meta.dirname || __dirname, '..', 'fixtures', 'fluvius-full-year.csv');

test.describe('Meerkost multi-line breakdown', () => {
  test('add two lines on config 1, one on config 2, breakdown visible in scenario card', async ({ authedPage }) => {
    const projectId = await createProjectViaAdmin({
      customerName: 'Meerkost Lines Test',
      site: { houseAgeOver10Years: true },
      supplier: { priceDay: 0.30, priceNight: 0.20, isSingleTariff: false },
      solar: { inverters: [{ id: 'inv1', powerKw: 5.0 }] },
    });

    try {
      await authedPage.goto(`/index.html?project=${projectId}`);
      await authedPage.waitForLoadState('networkidle');

      // Upload CSV
      await authedPage.locator('#csvFile').setInputFiles(FIXTURE_CSV);
      await authedPage.waitForSelector('#csvSummary:not(.hidden)', { timeout: 10_000 });

      // Load sheet configs and pick 2
      await authedPage.click('button:has-text("Configuraties laden")');
      await authedPage.waitForFunction(() => document.querySelectorAll('#configPickerList .config-picker-row').length > 0);
      const firstSelect = authedPage.locator('#configPickerList .config-picker-row').nth(0).locator('.config-select');
      const opts = await firstSelect.locator('option').allTextContents();
      const firstChoice = opts.find(t => t && !t.includes('Kies'));
      await firstSelect.selectOption({ label: firstChoice });

      const secondSelect = authedPage.locator('#configPickerList .config-picker-row').nth(1).locator('.config-select');
      const opts2 = await secondSelect.locator('option').allTextContents();
      const secondChoice = opts2.find(t => t && t !== firstChoice && !t.includes('Kies'));
      await secondSelect.selectOption({ label: secondChoice });

      // Open meerkost-details on config 1 and add 2 lines
      const row1 = authedPage.locator('#configPickerList .config-picker-row').nth(0);
      await row1.locator('.meerkost-details summary').click();
      await row1.locator('.meerkost-add-btn').click();
      await row1.locator('.meerkost-row').nth(0).locator('.meerkost-desc').fill('Extra bekabeling');
      await row1.locator('.meerkost-row').nth(0).locator('.meerkost-amount').fill('250');
      await row1.locator('.meerkost-add-btn').click();
      await row1.locator('.meerkost-row').nth(1).locator('.meerkost-desc').fill('Werkuren keuring');
      await row1.locator('.meerkost-row').nth(1).locator('.meerkost-amount').fill('100');

      // 1 line on config 2
      const row2 = authedPage.locator('#configPickerList .config-picker-row').nth(1);
      await row2.locator('.meerkost-details summary').click();
      await row2.locator('.meerkost-add-btn').click();
      await row2.locator('.meerkost-row').nth(0).locator('.meerkost-desc').fill('Stopcontact verplaatsen');
      await row2.locator('.meerkost-row').nth(0).locator('.meerkost-amount').fill('80');

      // Bereken
      await authedPage.click('#calcBtn');
      await authedPage.waitForSelector('#scenariosGrid .scenario-card', { timeout: 30_000 });

      // First config's WC card has a breakdown disclosure
      const wc1 = authedPage.locator('.scenario-card.worst-case').first();
      await expect(wc1.locator('.installprice-details summary')).toBeVisible();
      await wc1.locator('.installprice-details summary').click();
      await expect(wc1.locator('.installprice-details')).toContainText('Extra bekabeling');
      await expect(wc1.locator('.installprice-details')).toContainText('Werkuren keuring');
      await expect(wc1.locator('.installprice-details')).toContainText('Basis configuratie');
      await expect(wc1.locator('.installprice-details')).toContainText('Totaal installatie');

      // Verify Firestore has meerkostLines (not meerkostMap)
      const proj = await getProjectViaAdmin(projectId);
      const inputs = proj.lastCalcRun.inputs;
      expect(inputs.meerkostMap).toBeUndefined();
      expect(Object.keys(inputs.meerkostLines || {}).length).toBe(2);
    } finally {
      await deleteProjectViaAdmin(projectId);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run from `/home/ubuntu/battery-roi-tool`:
```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
npx playwright test e2e/tests/meerkost-lines.spec.js --config=e2e/playwright.config.js
kill $SERVER_PID
```
Expected: FAIL. Either the `.meerkost-details` selector is not found, or `.meerkost-add-btn` click times out — confirms the UI doesn't exist yet.

- [ ] **Step 3: Commit the failing spec**

```bash
git add e2e/tests/meerkost-lines.spec.js
git commit -m "test(e2e): meerkost multi-line happy-path spec (failing — UI not yet built)"
```

---

## Task 2: Add pure helpers and CSS scaffolding

**Files:**
- Modify: `index.html` (helper block + `<style>` block)

These four helpers are pure, used by every later task. The CSS is added now so visual sweeps later don't need a style-block round-trip.

- [ ] **Step 1: Add helpers near `_serializeState`** (around `index.html:1037`)

Insert immediately before `function _serializeState()`:

```javascript
function _genMeerkostId() {
  return 'mk_' + Math.random().toString(36).slice(2, 10);
}
function _emptyMeerkostLine() {
  return { id: _genMeerkostId(), description: '', amount: 0 };
}
// btwPercent is the project BTW (6 or 21). Returns sum incl BTW across all lines.
function _sumMeerkostLines(lines, btwPercent) {
  if (!Array.isArray(lines) || lines.length === 0) return 0;
  const factor = 1 + (Number(btwPercent) || 0) / 100;
  return lines.reduce((s, ln) => s + (Number(ln.amount) || 0) * factor, 0);
}
// Pure converter: { [type]: number } → { [type]: MeerkostLine[] }
// Drops entries with amount === 0 or non-positive.
function _migrateMeerkostMapToLines(map) {
  const out = {};
  for (const [type, amount] of Object.entries(map || {})) {
    const a = Number(amount);
    if (Number.isFinite(a) && a > 0) {
      out[type] = [{ id: _genMeerkostId(), description: 'Meerkost', amount: a }];
    }
  }
  return out;
}
```

- [ ] **Step 2: Replace the meerkost-wrap CSS with the new disclosure CSS** (around `index.html:448`)

Replace these existing rules:

```css
.config-picker-row .meerkost-wrap {
  width: 160px;
  flex-shrink: 0;
}
.config-picker-row .meerkost-wrap label {
  font-size: 0.78rem;
  white-space: nowrap;
  text-transform: none;
}
.config-picker-row .meerkost-wrap input {
  width: 100%;
}
```

with:

```css
.config-picker-row { flex-wrap: wrap; }
.meerkost-details {
  width: 100%;
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f7f9fd;
}
.meerkost-details > summary {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary-dark);
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.meerkost-details > summary::-webkit-details-marker { display: none; }
.meerkost-details > summary::before {
  content: '▸';
  font-size: 0.8rem;
  color: var(--muted);
  transition: transform 0.15s;
}
.meerkost-details[open] > summary::before { content: '▾'; }
.meerkost-summary-sum {
  margin-left: auto;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.82rem;
}
.meerkost-lines-list { padding: 0 12px 8px 12px; }
.meerkost-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}
.meerkost-row .meerkost-desc {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
}
.meerkost-row .meerkost-amount {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
  text-align: right;
}
.meerkost-row .meerkost-del {
  background: none;
  border: none;
  color: var(--danger);
  cursor: pointer;
  font-size: 0.95rem;
  padding: 2px 6px;
}
.meerkost-add-btn {
  margin: 4px 0 0 0;
  padding: 4px 10px;
  font-size: 0.8rem;
  border: 1px dashed var(--primary);
  border-radius: 6px;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
}
.meerkost-add-btn:hover { background: rgba(44,123,229,0.06); }
body.readonly-mode .meerkost-row .meerkost-del,
body.readonly-mode .meerkost-add-btn { display: none; }
body.readonly-mode .meerkost-row input { pointer-events: none; background: #f0f4fa; }
.installprice-details { margin: 4px 0 8px 0; }
.installprice-details > summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.installprice-details > summary::-webkit-details-marker { display: none; }
.installprice-details > summary::before { content: '▸ '; color: var(--muted); margin-right: 4px; }
.installprice-details[open] > summary::before { content: '▾ '; }
.installprice-details .breakdown-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0 3px 12px;
  font-size: 0.82rem;
}
.installprice-details .breakdown-row.totaal {
  border-top: 1px dashed var(--border);
  padding-top: 6px;
  margin-top: 4px;
  font-weight: 600;
}
```

- [ ] **Step 3: Verify in a browser**

Run from `/home/ubuntu/battery-roi-tool`:
```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
echo "Open http://localhost:8000/dashboard.html in browser, login, open any project with a calc-run, confirm no JS console errors on load."
sleep 30   # quick manual check window — replace with explicit kill once verified
kill $SERVER_PID 2>/dev/null
```
Expected: page renders unchanged (the old `.meerkost-wrap` selector is gone but no markup uses the new selectors yet either, so no visual change). No console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): add pure helpers and CSS for multi-line disclosure"
```

---

## Task 3: Replace the sheet-config picker row's single input with the new disclosure

**Files:**
- Modify: `index.html` — `renderConfigPickers`, the picker change-listener, and `_readMeerkostFromDom`

This breaks the old `.meerkost-input` flow; subsequent reads switch over in Task 4.

- [ ] **Step 1: Replace `renderConfigPickers` and its helper** (around `index.html:1283-1320`)

Replace the function and its shim with:

```javascript
// Render N+1 sheet-config pickers. `meerkostLines` is an optional
// { [type]: MeerkostLine[] } map used to seed the disclosure on restore.
// Live DOM lines are preserved across re-renders via _readMeerkostLinesFromDom().
function renderConfigPickers(selectedTypes, meerkostLines) {
  const list = document.getElementById('configPickerList');
  if (!list) return;
  const currentLines = { ..._readMeerkostLinesFromDom(), ...(meerkostLines || {}) };
  const chosen = (selectedTypes || []).filter(v => v);
  list.innerHTML = '';
  for (let i = 0; i <= chosen.length; i++) {
    const currentValue = chosen[i] || '';
    const others = chosen.filter((_, j) => j !== i);
    const row = document.createElement('div');
    row.className = 'config-picker-row';
    if (currentValue) row.dataset.configType = currentValue;
    const isFirst = i === 0;
    const labelTxt = isFirst
      ? 'Configuratie 1 <span style="color:var(--danger);font-size:1rem;">*</span>'
      : `Configuratie ${i + 1} <span style="font-weight:400;text-transform:none;color:var(--muted)">(optioneel)</span>`;
    const linesForRow = (currentValue && currentLines[currentValue]) || [];
    row.innerHTML = `
      <div class="form-group" style="flex:1;">
        <label>${labelTxt}</label>
        <select class="config-select">${_buildConfigOptionsHtml(currentValue, others, isFirst)}</select>
      </div>
      ${currentValue ? _meerkostDisclosureHtml(linesForRow) : ''}
    `;
    row.querySelector('.config-select').addEventListener('change', () => {
      renderConfigPickers(readSelectedConfigs(), _readMeerkostLinesFromDom());
    });
    _wireMeerkostRow(row);
    list.appendChild(row);
  }
}

// Legacy shim — _applyLoadedState calls this name.
function _populateConfigSelects(selectedTypes, meerkostLines) {
  renderConfigPickers(selectedTypes, meerkostLines);
}
```

- [ ] **Step 2: Add the disclosure HTML builder and the wire helper**

Insert immediately after `renderConfigPickers`:

```javascript
// Build the <details> block for one config row. `lines` is the seeded
// MeerkostLine[] (may be empty).
function _meerkostDisclosureHtml(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const btw = parseFloat(document.getElementById('btwSelect')?.value) || 21;
  const sumExBtw = safeLines.reduce((s, ln) => s + (Number(ln.amount) || 0), 0);
  const summaryText = safeLines.length === 0
    ? `Meerprijzen <span class="meerkost-summary-sum">geen</span>`
    : `Meerprijzen (${safeLines.length}) <span class="meerkost-summary-sum">€ ${fmt2(sumExBtw)} ex (BTW ${btw}%)</span>`;
  const isOpen = safeLines.length > 0;
  const rowsHtml = safeLines.map(ln => _meerkostRowHtml(ln)).join('');
  return `
    <details class="meerkost-details" ${isOpen ? 'open' : ''}>
      <summary>${summaryText}</summary>
      <div class="meerkost-lines-list">
        ${rowsHtml}
        <button type="button" class="meerkost-add-btn">+ Regel toevoegen</button>
      </div>
    </details>
  `;
}
function _meerkostRowHtml(line) {
  return `
    <div class="meerkost-row" data-line-id="${escapeHtml(line.id)}">
      <input type="text" class="meerkost-desc" placeholder="Omschrijving" value="${escapeHtml(line.description || '')}">
      <input type="number" class="meerkost-amount" min="0" step="50" value="${Number(line.amount) || 0}">
      <button type="button" class="meerkost-del" title="Verwijder regel">✕</button>
    </div>
  `;
}
// Attach add/delete/input listeners to the meerkost-details inside a row/card.
function _wireMeerkostRow(container) {
  const details = container.querySelector(':scope > .meerkost-details');
  if (!details) return;
  const list = details.querySelector('.meerkost-lines-list');
  const addBtn = details.querySelector('.meerkost-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const newLine = _emptyMeerkostLine();
      addBtn.insertAdjacentHTML('beforebegin', _meerkostRowHtml(newLine));
      _updateMeerkostSummary(details);
    });
  }
  list.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.meerkost-del');
    if (delBtn) {
      delBtn.closest('.meerkost-row')?.remove();
      _updateMeerkostSummary(details);
    }
  });
  list.addEventListener('input', (e) => {
    if (e.target.matches('.meerkost-amount, .meerkost-desc')) {
      _updateMeerkostSummary(details);
    }
  });
  list.addEventListener('blur', (e) => {
    if (e.target.matches('.meerkost-amount')) {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v < 0) e.target.value = 0;
      _updateMeerkostSummary(details);
    }
  }, true);
}
function _updateMeerkostSummary(detailsEl) {
  const rows = detailsEl.querySelectorAll('.meerkost-row');
  const sum = Array.from(rows).reduce((s, r) => {
    const v = parseFloat(r.querySelector('.meerkost-amount')?.value);
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const btw = parseFloat(document.getElementById('btwSelect')?.value) || 21;
  const summary = detailsEl.querySelector('summary');
  if (!summary) return;
  summary.innerHTML = rows.length === 0
    ? `Meerprijzen <span class="meerkost-summary-sum">geen</span>`
    : `Meerprijzen (${rows.length}) <span class="meerkost-summary-sum">€ ${fmt2(sum)} ex (BTW ${btw}%)</span>`;
}
```

- [ ] **Step 3: Replace `_readMeerkostFromDom` with `_readMeerkostLinesFromDom`** (around `index.html:1266`)

Replace:

```javascript
function _readMeerkostFromDom() {
  const map = {};
  document.querySelectorAll('#configPickerList .config-picker-row').forEach(row => {
    const sel = row.querySelector('.config-select');
    const inp = row.querySelector('.meerkost-input');
    if (sel && inp && sel.value) {
      const v = parseFloat(inp.value) || 0;
      if (v > 0) map[sel.value] = v;
    }
  });
  return map;
}
```

with:

```javascript
// Returns { [configType]: MeerkostLine[] } from DOM. Looks at both
// sheet-config picker rows (#configPickerList) and manual-config cards
// (#manualConfigCards). Empty rows (no description + zero amount) are
// dropped at serialize-time, not here — this stays a faithful DOM read
// so live-editing keeps stable ids.
function _readMeerkostLinesFromDom() {
  const out = {};
  function harvest(scope, typeAttr) {
    scope.querySelectorAll(`[${typeAttr}]`).forEach(container => {
      const type = container.getAttribute(typeAttr);
      if (!type) return;
      const rows = container.querySelectorAll('.meerkost-row');
      if (rows.length === 0) return;
      const lines = Array.from(rows).map(r => ({
        id: r.dataset.lineId || _genMeerkostId(),
        description: r.querySelector('.meerkost-desc')?.value || '',
        amount: parseFloat(r.querySelector('.meerkost-amount')?.value) || 0,
      }));
      out[type] = lines;
    });
  }
  const pickerList = document.getElementById('configPickerList');
  if (pickerList) harvest(pickerList, 'data-config-type');
  const manualList = document.getElementById('manualConfigCards');
  if (manualList) harvest(manualList, 'data-config-type');
  return out;
}
```

- [ ] **Step 4: Manual verification**

```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
# Open http://localhost:8000/dashboard.html, login, open a project with CSV.
# Click "Configuraties laden", pick a config.
# Verify: a "▸ Meerprijzen" disclosure appears below the dropdown.
# Click summary: opens, shows "+ Regel toevoegen" button.
# Click button: empty row appears with description + amount + ✕ inputs.
# Type description + 250 in amount; summary line shows "€ 250,00 ex".
# Click ✕: row removed; summary shows "geen".
# Change config in dropdown: disclosure re-renders, previous lines preserved.
```
After verifying the above, kill the server.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): render multi-line disclosure on sheet-config picker rows"
```

---

## Task 4: Update `readAllSelectedConfigObjects` to expose new cfg shape

**Files:**
- Modify: `index.html` — `readAllSelectedConfigObjects` (around line 1235)

- [ ] **Step 1: Replace the function body**

Replace lines 1233-1263 (`function readAllSelectedConfigObjects() { ... }`) with:

```javascript
// Read ALL selected configs: sheet picker selections + manual configs.
// Returns array of resolved config objects ready for processDataPure.
function readAllSelectedConfigObjects() {
  const priceKey = _getPriceKey();
  const btwPercent = parseFloat(document.getElementById('btwSelect').value) || 21;
  const lineMap = _readMeerkostLinesFromDom();
  const btwFactor = 1 + btwPercent / 100;

  function resolveLines(rawLines) {
    return (rawLines || [])
      .filter(ln => (ln && ((ln.amount && Number(ln.amount) > 0) || (ln.description && ln.description.trim() !== ''))))
      .map(ln => ({
        description: ln.description || '',
        amountExBtw: Number(ln.amount) || 0,
        amountInclBtw: (Number(ln.amount) || 0) * btwFactor,
      }));
  }

  // Sheet configs from dropdowns
  const sheetTypes = readSelectedConfigs();
  const sheetResolved = sheetTypes
    .map(type => {
      const c = _sheetConfigs.find(x => x.type === type);
      if (!c) return null;
      const basePrice = c.prices[priceKey];
      const lines = resolveLines(lineMap[type]);
      const meerkostTotalInclBtw = lines.reduce((s, l) => s + l.amountInclBtw, 0);
      return {
        type: c.type, omschrijving: c.omschrijving, batCap: c.batCap, batInv: c.batInv, eff: c.eff,
        basePrice,
        price: basePrice + meerkostTotalInclBtw,
        meerkostLines: lines,
        meerkostTotalInclBtw,
      };
    })
    .filter(Boolean);

  // Manual configs (basePrice is the manual all-in price)
  const manualResolved = Object.values(_manualConfigs).map(mc => {
    const lines = resolveLines(lineMap[mc.type]);
    const meerkostTotalInclBtw = lines.reduce((s, l) => s + l.amountInclBtw, 0);
    return {
      type: mc.type,
      omschrijving: `${mc.merk} ${mc.omschrijving}`,
      batCap: mc.batCap, batInv: mc.batInv, eff: mc.eff,
      basePrice: mc.price,
      price: mc.price + meerkostTotalInclBtw,
      meerkostLines: lines,
      meerkostTotalInclBtw,
      isManual: true,
    };
  });

  return [...sheetResolved, ...manualResolved];
}
```

- [ ] **Step 2: Verify the config-group-header annotation still works** (around `index.html:1776`)

Find:
```javascript
<span class="config-specs-badge">${fmt2(cfg.batCap)} kWh &nbsp;·&nbsp; ${fmt2(cfg.batInv)} kW omv. &nbsp;·&nbsp; ${Math.round(cfg.eff*100)}% eff &nbsp;·&nbsp; ${fmtEur(cfg.price)}${cfg.meerkost > 0 ? ` <span style="font-size:0.75rem;color:var(--muted);">(incl. ${fmtEur(cfg.meerkostInclBtw)} meerkost)</span>` : ''}</span>
```

Replace with:
```javascript
<span class="config-specs-badge">${fmt2(cfg.batCap)} kWh &nbsp;·&nbsp; ${fmt2(cfg.batInv)} kW omv. &nbsp;·&nbsp; ${Math.round(cfg.eff*100)}% eff &nbsp;·&nbsp; ${fmtEur(cfg.price)}${cfg.meerkostTotalInclBtw > 0 ? ` <span style="font-size:0.75rem;color:var(--muted);">(incl. ${fmtEur(cfg.meerkostTotalInclBtw)} meerkost)</span>` : ''}</span>
```

- [ ] **Step 3: Manual verification**

Start server, open a project, pick a config, add a meerkost line (€100), click Bereken. The group header should now say `(incl. €121,00 meerkost)` (at 21% BTW) and `Installatieprijs` in scenario cards should be `basePrice + 121`. No JS console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): resolve cfg.meerkostLines + cfg.basePrice in readAllSelectedConfigObjects"
```

---

## Task 5: Add meerkost disclosure to manual-config cards

**Files:**
- Modify: `index.html` — `renderManualConfigCards` (around line 1417)

- [ ] **Step 1: Replace the function body**

```javascript
function renderManualConfigCards() {
  const container = document.getElementById('manualConfigCards');
  if (!container) return;
  const entries = Object.values(_manualConfigs);
  if (!entries.length) { container.innerHTML = ''; return; }

  // Preserve existing meerkost-lines in DOM before redraw.
  const existingLines = _readMeerkostLinesFromDom();

  container.innerHTML = entries.map(mc => {
    const lines = existingLines[mc.type] || [];
    return `
    <div class="manual-config-card" data-config-type="${escapeHtml(mc.type)}" style="display:flex; flex-direction:column; gap:6px; padding:8px 12px; margin-top:6px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg);">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="background:var(--accent); color:#fff; font-size:0.7rem; padding:2px 8px; border-radius:4px; font-weight:600;">Manueel</span>
        <span style="flex:1; font-size:0.9rem;">
          <strong>${escapeHtml(mc.merk)} ${escapeHtml(mc.omschrijving)}</strong>
          &mdash; ${fmt2(mc.batCap)} kWh / ${fmt2(mc.batInv)} kW &mdash; ${fmtEur(mc.price)}
        </span>
        <button type="button" class="btn btn-secondary" style="font-size:0.8rem; padding:3px 8px;" onclick="editManualConfig('${mc.type}')" title="Bewerken">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" class="btn btn-secondary" style="font-size:0.8rem; padding:3px 8px; color:var(--danger);" onclick="deleteManualConfig('${mc.type}')" title="Verwijderen">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      ${_meerkostDisclosureHtml(lines)}
    </div>
    `;
  }).join('');

  // Wire each card's disclosure handlers.
  container.querySelectorAll('.manual-config-card').forEach(card => _wireMeerkostRow(card));
}
```

- [ ] **Step 2: Manual verification**

Open a project, add a manual config (via "+ Manuele configuratie"), verify a `▸ Meerprijzen` disclosure appears under the card. Add a line, click Bereken, confirm scenario card shows `Installatieprijs` updated. No console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): add disclosure to manual-config cards"
```

---

## Task 6: Bump save format to v:6 in `_serializeState`

**Files:**
- Modify: `index.html` — `_serializeState` (around line 1037)

- [ ] **Step 1: Replace the function body**

```javascript
function _serializeState() {
  if (!_saved) return null;
  const d = _saved;
  // Strip empty lines (no description AND zero amount) at serialize-time.
  const meerkostLines = {};
  (d.configResults || []).forEach(cr => {
    if (!cr.cfg || !Array.isArray(cr.cfg.meerkostLines)) return;
    const keep = cr.cfg.meerkostLines
      .map(ln => ({
        id: ln.id || _genMeerkostId(),
        description: ln.description || '',
        amount: Number(ln.amountExBtw != null ? ln.amountExBtw : ln.amount) || 0,
      }))
      .filter(ln => (ln.description && ln.description.trim() !== '') || ln.amount > 0);
    if (keep.length > 0) meerkostLines[cr.cfg.type] = keep;
  });
  return {
    v: 6,
    form: {
      pvInv:    d.pvInv,
      priceDay: d.priceDay,
      priceNight: (d.dualTariff && !isNaN(d.priceNight)) ? d.priceNight : null,
      selectedConfigTypes: d.configResults.map(cr => cr.cfg.type),
    },
    manualConfigs: Object.keys(_manualConfigs).length > 0 ? _manualConfigs : null,
    meerkostLines: Object.keys(meerkostLines).length > 0 ? meerkostLines : null,
    r: {
      isFullYear: d.isFullYear,
      windowStart: d.windowStart.toISOString().slice(0,10),
      lastDate:    d.lastDate.toISOString().slice(0,10),
      firstDate:   d.firstDate.toISOString().slice(0,10),
      daysInWindow: d.daysInWindow,
      totalDaysCSV: d.allDays.length,
      totalAfname: d.totalAfname, totalInjectie: d.totalInjectie,
      totalAfnamedag: d.totalAfnamedag, totalAfnamenacht: d.totalAfnamenacht,
      totalInjectiedag: d.totalInjectiedag, totalInjectienacht: d.totalInjectienacht,
      dualTariff: d.dualTariff, priceDay: d.priceDay,
      priceNight: d.dualTariff ? d.priceNight : null,
      effectivePrice: d.effectivePrice,
      pvInv: d.pvInv,
      configResults: d.configResults,
      monthMap: d.monthMap,
      eanCode: d.eanCode, meterNr: d.meterNr, meterType: d.meterType,
      capAnalysis: d.capAnalysis,
      numYears:   d.numYears != null ? d.numYears : 1,
      yearsStart: d.yearsStart ? d.yearsStart.toISOString().slice(0,10) : null,
      avgTotals:  d.avgTotals  || null,
      dailyCompact: Array.isArray(d.allDays) ? {
        startDate:     d.allDays[0].date.toISOString().slice(0, 10),
        afname:        d.allDays.map(x => x.afname),
        injectie:      d.allDays.map(x => x.injectie),
        afnamedag:     d.allDays.map(x => x.afnamedag),
        afnamenacht:   d.allDays.map(x => x.afnamenacht),
        injectiedag:   d.allDays.map(x => x.injectiedag),
        injectienacht: d.allDays.map(x => x.injectienacht),
      } : null,
    }
  };
}
```

- [ ] **Step 2: Manual verification**

Open a project with the calc run, open browser devtools console, run:
```javascript
JSON.stringify(_serializeState()).slice(0, 200)
```
Expected: contains `"v":6` and a `meerkostLines` field (or `null` if no lines). No `meerkostMap` key.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): bump save format to v:6 with meerkostLines"
```

---

## Task 7: Teach `_applyLoadedState` to read v:6 and convert v:5

**Files:**
- Modify: `index.html` — `_applyLoadedState` (around line 1156)

- [ ] **Step 1: Update the version-accept check**

Around line 1157, find:
```javascript
if (!state || (state.v !== 1 && state.v !== 2 && state.v !== 3 && state.v !== 4 && state.v !== 5)) { alert('Onbekend of verouderd bestandsformaat.'); return; }
```

Replace with:
```javascript
if (!state || ![1,2,3,4,5,6].includes(state.v)) { alert('Onbekend of verouderd bestandsformaat.'); return; }
```

- [ ] **Step 2: Replace the meerkost restore block**

Around line 1173, find:
```javascript
if ((state.v === 2 || state.v === 3 || state.v === 4 || state.v === 5) && f.selectedConfigTypes && f.selectedConfigTypes.some(t => t)) {
  const mkMap = state.meerkostMap || {};
  loadConfigs().then(() => _populateConfigSelects(f.selectedConfigTypes.filter(t => !isManualConfig(t)), mkMap)).catch(() => {});
}
```

Replace with:
```javascript
if (state.v >= 2 && f.selectedConfigTypes && f.selectedConfigTypes.some(t => t)) {
  const meerkostLines = (state.v === 6)
    ? (state.meerkostLines || {})
    : _migrateMeerkostMapToLines(state.meerkostMap || {});   // v:5 fallback
  loadConfigs().then(() => _populateConfigSelects(f.selectedConfigTypes.filter(t => !isManualConfig(t)), meerkostLines)).catch(() => {});
}
```

- [ ] **Step 3: Manual verification with a legacy share-link**

Run the http server. In the browser console, build a fake v:5 payload and feed it to `_applyLoadedState`:
```javascript
_applyLoadedState({
  v: 5,
  form: { selectedConfigTypes: ['some-real-sheet-type'], pvInv: 5, priceDay: 0.3, priceNight: null },
  manualConfigs: null,
  meerkostMap: { 'some-real-sheet-type': 250 },
  r: null  // we only care that the meerkost branch runs
}, false);
```
Expected: after configs load, the picker shows one row with that config selected and a disclosure `▾ Meerprijzen (1) € 250,00 ex (BTW 21%)`. (The full restore needs `r` to be populated for the result-render to work; that's fine for this isolated check.)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): _applyLoadedState handles v:6 and migrates v:5 meerkostMap"
```

---

## Task 8: Update project-mode save + restore wiring

**Files:**
- Modify: `index.html` — `saveLastCalcRun` callsite (around line 1983) and `buildSavedFromProject` (around line 2498)

- [ ] **Step 1: Update the callsite that writes to `lastCalcRun.inputs`** (around line 1959)

Replace lines 1959-1988 (the block starting `// Build meerkostMap from configResults` through `await saveLastCalcRun(...)`) with:

```javascript
  // Build meerkostLines from configResults (already in the new shape).
  const meerkostLines = {};
  (d.configResults || []).forEach(cr => {
    if (cr.cfg && Array.isArray(cr.cfg.meerkostLines) && cr.cfg.meerkostLines.length > 0) {
      meerkostLines[cr.cfg.type] = cr.cfg.meerkostLines.map(ln => ({
        id: ln.id || _genMeerkostId(),
        description: ln.description || '',
        amount: Number(ln.amountExBtw != null ? ln.amountExBtw : ln.amount) || 0,
      }));
    }
  });

  // Build results: same as _serializeState's `r` block, but strip dailyCompact since it lives
  // separately in csvUpload (otherwise we'd duplicate the per-day arrays in Firestore).
  const r = _serializeState();
  if (!r) throw new Error('Geen berekening om op te slaan.');
  const results = { ...r.r };
  delete results.dailyCompact;

  // Sync any fallback-entered metadata back to the project before saving the calc-run.
  try {
    const freshProj = await getProject(_projectId);
    const patch = buildProjectSyncPatch(freshProj);
    if (patch) {
      await updateProjectMetadata(_projectId, patch);
      _projectDoc = await getProject(_projectId);
      showToast('📋 Projectgegevens aangevuld uit invoer');
    }
  } catch (e) {
    console.warn('project sync-back failed', e);
  }

  await saveLastCalcRun(_projectId, {
    inputs: { pvInv: pvInverter, priceDay, priceNight, selectedConfigTypes,
              meerkostLines: Object.keys(meerkostLines).length > 0 ? meerkostLines : null },
    results,
    manualConfigs: Object.keys(_manualConfigs).length > 0 ? _manualConfigs : null,
  });
  showToast('💾 Opgeslagen in project');
```

- [ ] **Step 2: Update `buildSavedFromProject`** (around line 2498)

Replace the function body:

```javascript
function buildSavedFromProject(proj) {
  const r = (proj.lastCalcRun && proj.lastCalcRun.results) ? { ...proj.lastCalcRun.results } : {};
  r.dailyCompact = proj.csvUpload ? proj.csvUpload.dailyCompact : null;
  if (proj.csvUpload) {
    r.eanCode   = proj.csvUpload.eanCode   || r.eanCode;
    r.meterNr   = proj.csvUpload.meterNr   || r.meterNr;
    r.meterType = proj.csvUpload.meterType || r.meterType;
  }
  const inputs = (proj.lastCalcRun && proj.lastCalcRun.inputs) || {};
  // Prefer new shape; fall back to legacy meerkostMap.
  const meerkostLines = (inputs.meerkostLines && Object.keys(inputs.meerkostLines).length > 0)
    ? inputs.meerkostLines
    : (inputs.meerkostMap ? _migrateMeerkostMapToLines(inputs.meerkostMap) : null);
  return {
    v: 6,
    form: {
      pvInv: inputs.pvInv,
      priceDay: inputs.priceDay,
      priceNight: inputs.priceNight,
      selectedConfigTypes: inputs.selectedConfigTypes,
    },
    manualConfigs: proj.manualConfigs || {},
    meerkostLines: meerkostLines || null,
    r,
  };
}
```

- [ ] **Step 3: Manual verification**

Open a project, add a meerkost line, click Bereken (which calls `saveLastCalcRun`). Reload the page. The disclosure should re-open with the line you typed; the scenario card's `Installatieprijs` should match. Confirm in the Firebase console (or via `getProject` in devtools) that `lastCalcRun.inputs.meerkostLines` exists and `meerkostMap` is absent.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): persist meerkostLines in lastCalcRun.inputs (project mode)"
```

---

## Task 9: Firestore write-migration helper + caller

**Files:**
- Modify: `assets/js/firebase-init.js`
- Modify: `index.html` — `loadProjectIntoUI` (around line 2350)

- [ ] **Step 1: Add the helper in `firebase-init.js`** (insert before `softDeleteProject` at line 299)

```javascript
// One-time schema upgrade: replace lastCalcRun.inputs.meerkostMap with
// lastCalcRun.inputs.meerkostLines. Caller checks shape and only invokes
// this when the legacy field is present. Uses doc.update() with dotted-path
// keys so FieldValue.delete() works (set + merge would write a literal
// dotted property name).
async function migrateMeerkostMapToLines(id, meerkostLines) {
  await projectDoc(id).update({
    'lastCalcRun.inputs.meerkostLines': meerkostLines,
    'lastCalcRun.inputs.meerkostMap': firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}
```

- [ ] **Step 2: Expose on `window`** (around line 1567, near other `window.xxx = xxx;` exports)

```javascript
window.migrateMeerkostMapToLines = migrateMeerkostMapToLines;
```

- [ ] **Step 3: Trigger the migration in `loadProjectIntoUI`** (around `index.html:2376`, immediately after `_applyLoadedState(restored, /*showBanner*/ false);` and before the `#results` hash check)

Insert:

```javascript
      // One-time write-migration: legacy meerkostMap → meerkostLines on first open
      // in a post-v:6 build. Skipped if already migrated. Failure is non-blocking.
      try {
        const inputs = proj.lastCalcRun.inputs || {};
        if (inputs.meerkostMap && !inputs.meerkostLines) {
          const newLines = _migrateMeerkostMapToLines(inputs.meerkostMap);
          await migrateMeerkostMapToLines(_projectId, newLines);
          _projectDoc = await getProject(_projectId);
        }
      } catch (e) {
        console.warn('meerkost write-migration failed (non-blocking)', e);
      }
```

- [ ] **Step 4: Manual verification with a seeded legacy doc**

Use the Firebase console (or a quick Admin script) to set a project's `lastCalcRun.inputs.meerkostMap` to e.g. `{ "<sheet-type>": 250 }`. Open the project in the calculator. Reload Firestore in the console — the field should now be `meerkostLines: { "<sheet-type>": [{id, description: "Meerkost", amount: 250}] }` with `meerkostMap` gone. The disclosure in the UI shows the migrated line.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/js/firebase-init.js
git commit -m "feat(meerkost): one-time write-migration of legacy meerkostMap on project open"
```

---

## Task 10: Render the breakdown disclosure in scenario cards

**Files:**
- Modify: `index.html` — `makeScenCard` (around line 1657) and `renderScenarioGrid` (around line 1762)

- [ ] **Step 1: Update `makeScenCard` signature and the `Installatieprijs` row**

Around line 1657, replace the function signature:
```javascript
function makeScenCard(d, title, badge, badgeClass, cssClass, scen, installPrice, extraInfo, mainColorOverride, scenAvg) {
```
with:
```javascript
function makeScenCard(d, title, badge, badgeClass, cssClass, scen, cfg, extraInfo, mainColorOverride, scenAvg) {
```

Around line 1699, replace:
```javascript
<div class="stat-row"><span class="stat-label">Installatieprijs</span><span class="stat-value">${fmtEur(installPrice)}</span></div>
```
with:
```javascript
${(() => {
  const installPrice = cfg.price;
  const lines = Array.isArray(cfg.meerkostLines) ? cfg.meerkostLines : [];
  if (lines.length === 0) {
    return `<div class="stat-row"><span class="stat-label">Installatieprijs</span><span class="stat-value">${fmtEur(installPrice)}</span></div>`;
  }
  const lineRows = lines.map((ln, i) => {
    const label = (ln.description && ln.description.trim() !== '') ? escapeHtml(ln.description) : `Meerkost #${i+1}`;
    return `<div class="breakdown-row"><span>${label}</span><span>${fmtEur(ln.amountInclBtw)}</span></div>`;
  }).join('');
  return `
    <details class="installprice-details">
      <summary><span class="stat-label">Installatieprijs</span><span class="stat-value">${fmtEur(installPrice)}</span></summary>
      <div class="breakdown-row"><span>Basis configuratie</span><span>${fmtEur(cfg.basePrice)}</span></div>
      ${lineRows}
      <div class="breakdown-row totaal"><span>Totaal installatie</span><span>${fmtEur(installPrice)}</span></div>
    </details>
  `;
})()}
```

- [ ] **Step 2: Update `renderScenarioGrid` to pass `cfg` instead of `cfg.price`**

Around line 1783-1796, replace:
```javascript
    gridHTML += makeScenCard(d,
      'Worst Case', '⚠️ Worst Case', 'badge-orange', 'worst-case',
      scenWC, cfg.price, subWC, 'orange',
      cr.scenWCAvg
    );
    if (scenOpt) {
      const subOpt = pvGtBat
        ? `Zelfde installatie — aanname: batterij laadt volledig (drempel = ${fmt2(cfg.batCap)} kWh) en wordt elke dag volledig verbruikt.`
        : `Aanname: batterij laadt volledig en wordt elke dag volledig verbruikt.`;
      gridHTML += makeScenCard(d,
        'Realistisch', '✨ Realistisch', 'badge-blue', 'optimistic',
        scenOpt, cfg.price, subOpt, 'blue',
```
with:
```javascript
    gridHTML += makeScenCard(d,
      'Worst Case', '⚠️ Worst Case', 'badge-orange', 'worst-case',
      scenWC, cfg, subWC, 'orange',
      cr.scenWCAvg
    );
    if (scenOpt) {
      const subOpt = pvGtBat
        ? `Zelfde installatie — aanname: batterij laadt volledig (drempel = ${fmt2(cfg.batCap)} kWh) en wordt elke dag volledig verbruikt.`
        : `Aanname: batterij laadt volledig en wordt elke dag volledig verbruikt.`;
      gridHTML += makeScenCard(d,
        'Realistisch', '✨ Realistisch', 'badge-blue', 'optimistic',
        scenOpt, cfg, subOpt, 'blue',
```

- [ ] **Step 3: Manual verification**

Reload a project with a meerkost line. Each scenario card's `Installatieprijs` should show a chevron; clicking it expands to show `Basis configuratie €X`, each line with description + bedrag, and `Totaal installatie`. A config with zero lines should still show the plain (no chevron) row.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(meerkost): render install-price breakdown disclosure in scenario cards"
```

---

## Task 11: Add an E2E migration test

**Files:**
- Modify: `e2e/tests/meerkost-lines.spec.js` — append a second test
- Modify (if needed): `e2e/helpers/project-helpers.js` — add `setProjectInputsViaAdmin`

- [ ] **Step 1: Check whether project-helpers needs extending**

Run from `/home/ubuntu/battery-roi-tool`:
```bash
grep -n "createProjectViaAdmin\|setProjectInputs\|admin" e2e/helpers/project-helpers.js | head -20
```

If `setProjectInputsViaAdmin` does NOT exist, add it (use the admin SDK pattern already present in the file — typically `admin.firestore().collection('projects').doc(id).update(...)`):

```javascript
export async function setLegacyMeerkostMapViaAdmin(projectId, meerkostMap) {
  const admin = (await import('./firebase-admin-init.js')).adminApp;
  await admin.firestore().collection('projects').doc(projectId).update({
    'lastCalcRun.inputs.meerkostMap': meerkostMap,
  });
}
```

(Adapt the admin-import to whatever pattern the file already uses — read the file first.)

- [ ] **Step 2: Append migration test to the spec**

```javascript
test('legacy meerkostMap is migrated to meerkostLines on first open', async ({ authedPage }) => {
  // Seed a project that already has a full calc-run with legacy meerkostMap.
  // The fastest path is: create + run a calc end-to-end through UI (Task 1's
  // setup), then via admin overwrite inputs to look like a legacy doc.
  const projectId = await createProjectViaAdmin({
    customerName: 'Meerkost Migration Test',
    site: { houseAgeOver10Years: true },
    supplier: { priceDay: 0.30, priceNight: 0.20, isSingleTariff: false },
    solar: { inverters: [{ id: 'inv1', powerKw: 5.0 }] },
  });
  try {
    // Run a full calc to populate lastCalcRun, then overwrite inputs to a legacy shape.
    await authedPage.goto(`/index.html?project=${projectId}`);
    await authedPage.waitForLoadState('networkidle');
    await authedPage.locator('#csvFile').setInputFiles(FIXTURE_CSV);
    await authedPage.waitForSelector('#csvSummary:not(.hidden)', { timeout: 10_000 });
    await authedPage.click('button:has-text("Configuraties laden")');
    await authedPage.waitForFunction(() => document.querySelectorAll('#configPickerList .config-picker-row').length > 0);
    const firstSelect = authedPage.locator('#configPickerList .config-picker-row').nth(0).locator('.config-select');
    const opts = await firstSelect.locator('option').allTextContents();
    const firstChoice = opts.find(t => t && !t.includes('Kies'));
    await firstSelect.selectOption({ label: firstChoice });
    await authedPage.click('#calcBtn');
    await authedPage.waitForSelector('#scenariosGrid .scenario-card', { timeout: 30_000 });

    // Now we know which sheet-type was chosen. Read it back from the Firestore doc.
    let proj = await getProjectViaAdmin(projectId);
    const chosenType = proj.lastCalcRun.inputs.selectedConfigTypes[0];

    // Overwrite to legacy shape via admin.
    await setLegacyMeerkostMapViaAdmin(projectId, { [chosenType]: 250 });
    // (Optional but realistic: drop meerkostLines from the doc to simulate pre-migration state.)
    // Open project again — write-migration should run.
    await authedPage.goto(`/index.html?project=${projectId}`);
    await authedPage.waitForSelector('#scenariosGrid .scenario-card', { timeout: 30_000 });

    proj = await getProjectViaAdmin(projectId);
    expect(proj.lastCalcRun.inputs.meerkostMap).toBeUndefined();
    expect(proj.lastCalcRun.inputs.meerkostLines[chosenType]).toBeDefined();
    expect(proj.lastCalcRun.inputs.meerkostLines[chosenType][0].amount).toBe(250);
    expect(proj.lastCalcRun.inputs.meerkostLines[chosenType][0].description).toBe('Meerkost');
  } finally {
    await deleteProjectViaAdmin(projectId);
  }
});
```

- [ ] **Step 3: Run both E2E tests**

```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
npx playwright test e2e/tests/meerkost-lines.spec.js --config=e2e/playwright.config.js
kill $SERVER_PID 2>/dev/null
```
Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(e2e): meerkost migration + happy-path passing"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — the 2026-05-08 meerkost paragraph

- [ ] **Step 1: Replace the existing paragraph**

Find the paragraph that begins `**Meerkost (extra cost) per sheet config (2026-05-08)**` and replace it with:

```markdown
**Meerkost (extra cost) — multi-line breakdown per config (2026-05-19, supersedes
2026-05-08 single-amount)** — Elke configuratie heeft een uitklap "Meerprijzen"
onder zijn picker-rij (sheet) of card (manueel) met een lijst van regels, elk
met omschrijving + bedrag (ex BTW). Sum incl BTW wordt opgeteld bij de
basisprijs: `cfg.price = cfg.basePrice + Σ(line.amount * (1 + btw/100))`. Sheet-
en manuele configs gebruiken hetzelfde model — keyed op `cfg.type`. Bij Bereken
wordt elke regel weergegeven in een uitklap onder `Installatieprijs` in elke
scenario-card: `Basis configuratie €X`, elke regel, `Totaal installatie`. Bij
0 regels: geen uitklap, gewone regel. Lege omschrijving rendert als
`Meerkost #N`. `_serializeState` filtert regels weg waarbij omschrijving leeg
is én bedrag 0. Persistentie: `meerkostLines: { [type]: MeerkostLine[] }` op
v:6 top-level + `lastCalcRun.inputs.meerkostLines` in project-mode. Legacy
`meerkostMap` wordt bij eerste open van een project lazy gemigreerd via
`migrateMeerkostMapToLines` (Firestore `.update()` met dotted-path keys +
`FieldValue.delete()`); `_applyLoadedState` accepteert v:1..6 met
in-memory fallback. Helpers in index.html: `_genMeerkostId`,
`_emptyMeerkostLine`, `_sumMeerkostLines`, `_migrateMeerkostMapToLines`.
Read-only mode (share-link) verbergt ✕/+ knoppen via CSS maar laat de uitklap
zichtbaar zodat de klant de breakdown ziet.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for meerkost multi-line + v:6 + write-migration"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full E2E suite** to make sure no regression elsewhere

```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
npx playwright test --config=e2e/playwright.config.js
kill $SERVER_PID 2>/dev/null
```
Expected: previously-passing tests stay passing; new meerkost-lines tests pass. The 3 pre-existing failures (lead-delete, lead-conversion, calculator share link, per `feat/product-media` PR description) may still fail — confirm they are unchanged.

- [ ] **Step 2: Final manual smoke**

```bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
echo "Open http://localhost:8000/dashboard.html. Check:"
echo "1. Open project with calc run — meerkost disclosure visible per config."
echo "2. Add 2 lines, Bereken, scenario card shows breakdown."
echo "3. Reload — lines persist."
echo "4. Copy share-link, open in incognito — breakdown visible, ✕/+ hidden."
echo "5. Download save JSON, open new project, upload JSON — lines restore."
echo "6. Switch BTW (woning-leeftijd toggle in project-edit) — re-Bereken — bedragen in breakdown updaten."
sleep 30
kill $SERVER_PID 2>/dev/null
```

- [ ] **Step 3: Create the PR**

```bash
git push -u origin feat/meerkost-multi-line   # if not already on this branch
gh pr create --title "feat(meerkost): multi-line breakdown per config" --body "$(cat <<'EOF'
## Summary
- Replace single `meerkost` numeric field per config with a list of labelled lines (description + amount ex BTW).
- Render the breakdown in each scenario card under a `<details>` disclosure.
- Bump save format to `v: 6`; `_applyLoadedState` accepts v:1..6 with in-memory v:5 fallback.
- One-time write-migration of legacy `meerkostMap` → `meerkostLines` on first project open.

## Test plan
- [x] New E2E spec `e2e/tests/meerkost-lines.spec.js` (happy path + migration).
- [ ] Manual: add lines, Bereken, scenario card shows breakdown; reload persists.
- [ ] Manual: share-link customer view shows breakdown, hides edit affordances.
- [ ] Manual: legacy share-links (`?data=` v:5) keep working.

Spec: `docs/superpowers/specs/2026-05-19-meerkost-multi-line-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the implementer

- The codebase has **no unit-test runner**. Pure helpers are checked via the browser console in the manual-verification steps; behaviour is verified end-to-end via Playwright.
- `index.html` is the calculator; `dashboard.html` and `project-edit.html` do not render meerkost at all and are not touched.
- `escapeHtml` and `fmt2` / `fmtEur` are already defined in `index.html` and used heavily — reuse, don't redefine.
- `_buildConfigOptionsHtml`, `readSelectedConfigs`, `_sheetConfigs`, `_getPriceKey`, `_manualConfigs` exist and stay unchanged.
- The disclosure-summary inside `<details>` does NOT need `pointer-events: none` in read-only mode — it must stay clickable so the customer can expand. Only the inner `<input>` and `✕`/`+` controls are disabled (handled in the CSS in Task 2).
- For Step "Manual verification" sections, kill the http server immediately when you're done — the shell sample uses `sleep 30` as a placeholder so the script doesn't end while you check, replace with whatever timing works for you.
