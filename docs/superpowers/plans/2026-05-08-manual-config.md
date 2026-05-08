# Manual Battery Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to define custom battery configurations with manually entered specs and price, alongside the existing Google Sheet configs.

**Architecture:** Manual configs are stored as a `manualConfigs` map on the project doc. They get the same in-memory shape as resolved sheet configs (`{ type, batCap, batInv, eff, price, ... }`) so the calc engine processes them identically. A `MANUAL_` prefix on the type string distinguishes them. The UI shows a "+ Manuele configuratie" button below the config pickers; adding a manual config renders it as a compact card with edit/delete actions.

**Tech Stack:** Vanilla JS (no build step), Firebase Firestore (compat SDK), existing CSS variables from index.html.

**Spec:** `docs/superpowers/specs/2026-05-08-manual-config-design.md`

---

### Task 1: `isManualConfig` helper in firebase-init.js

**Files:**
- Modify: `assets/js/firebase-init.js:495-497` (add helper next to existing isMarstekConfig/isZendureConfig)
- Modify: `assets/js/firebase-init.js:136-138` (add `manualConfigs` default in mergeProjectMetadata)

- [ ] **Step 1: Add `isManualConfig` function after existing helpers**

In `assets/js/firebase-init.js`, right after line 497 (`function isSupportedConfig(type) { ... }`), add:

```javascript
function isManualConfig(type) { return typeof type === 'string' && type.startsWith('MANUAL_'); }
```

- [ ] **Step 2: Add `manualConfigs` default to `mergeProjectMetadata`**

In `assets/js/firebase-init.js`, right after line 137 (`merged.serialNumbers = ...;`), add:

```javascript
  merged.manualConfigs = project.manualConfigs || {};
```

- [ ] **Step 3: Expose `isManualConfig` on window**

Find the block near the bottom of `firebase-init.js` where functions are assigned to `window` (search for `window.isMarstekConfig` or `window.isZendureConfig`). Add:

```javascript
window.isManualConfig = isManualConfig;
```

- [ ] **Step 4: Commit**

```bash
git add assets/js/firebase-init.js
git commit -m "feat: add isManualConfig helper + manualConfigs default in mergeProjectMetadata"
```

---

### Task 2: Extend `deleteProjectConfig` for manual configs

**Files:**
- Modify: `assets/js/firebase-init.js:796-834`

- [ ] **Step 1: Add `manualConfigs` cleanup to deleteProjectConfig**

In `assets/js/firebase-init.js`, inside `deleteProjectConfig`, after the existing `updates` object is built (after line 810), add a line that also deletes the manual config entry if the type is manual:

```javascript
  // Also remove manual config definition if this is a manual type.
  if (isManualConfig(type)) {
    updates[`manualConfigs.${type}`] = firebase.firestore.FieldValue.delete();
  }
```

This goes right before the `const oldResults = ...` line (before line 812).

- [ ] **Step 2: Commit**

```bash
git add assets/js/firebase-init.js
git commit -m "feat: deleteProjectConfig cleans up manualConfigs entry for manual types"
```

---

### Task 3: Save `manualConfigs` in `saveLastCalcRun`

**Files:**
- Modify: `assets/js/firebase-init.js:365-409`

- [ ] **Step 1: Accept and persist manualConfigs in saveLastCalcRun**

In `saveLastCalcRun`, the `saved` parameter already has `saved.inputs` and `saved.results`. The caller will now also pass `saved.manualConfigs`. After the `const update = { lastCalcRun, updatedAt }` block (after line 397), add:

```javascript
  // Persist manual config definitions (full replace — always reflect current state).
  if (saved.manualConfigs && Object.keys(saved.manualConfigs).length > 0) {
    update.manualConfigs = saved.manualConfigs;
  } else {
    // Clear any previous manual configs if none are selected anymore.
    update.manualConfigs = firebase.firestore.FieldValue.delete();
  }
```

Also, inside the PDF cascade loop (lines 398-400), add manual config cleanup for removed manual types:

```javascript
  // Also clean up manualConfigs entries for removed manual types.
  const removedManual = prevSelected.filter(t =>
    !newSelected.includes(t) && isManualConfig(t));
  for (const t of removedManual) {
    update[`manualConfigs.${t}`] = firebase.firestore.FieldValue.delete();
  }
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/firebase-init.js
git commit -m "feat: saveLastCalcRun persists and cleans up manualConfigs"
```

---

### Task 4: Manual config in-memory store + HTML button in index.html

**Files:**
- Modify: `index.html:731-733` (HTML: add button after configPickerList)
- Modify: `index.html:1161` (JS: add _manualConfigs store)

- [ ] **Step 1: Add the in-memory manual configs store**

In `index.html`, right after line 1161 (`let _sheetConfigs = null;`), add:

```javascript
// Manual configs — keyed by type ('MANUAL_<timestamp>'). Same resolved shape as sheet configs.
let _manualConfigs = {};
```

- [ ] **Step 2: Add HTML button and containers after configPickerList**

In `index.html`, right after the closing `</div>` of `#configSelectorsArea` (after line 733), add:

```html
  <div id="manualConfigArea">
    <div id="manualConfigCards"></div>
    <div id="manualConfigFormContainer" style="display:none;"></div>
    <button type="button" id="addManualConfigBtn" class="btn btn-secondary" style="margin-top:8px; display:none;" onclick="showManualConfigForm()">
      <i class="fa-solid fa-plus"></i> Manuele configuratie
    </button>
  </div>
```

- [ ] **Step 3: Make the button visible when configs are loaded**

In the `loadConfigs()` function (around line 1224-1240), after the line that shows `#configSelectorsArea` (search for `configSelectorsArea`), add:

```javascript
      document.getElementById('addManualConfigBtn').style.display = '';
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add manual config in-memory store + HTML button/containers"
```

---

### Task 5: Manual config form (show/hide/validate/add)

**Files:**
- Modify: `index.html` (JS section, after the renderConfigPickers function block)

- [ ] **Step 1: Add the form rendering and handling functions**

After the `_populateConfigSelects` shim (after line 1222), add these functions:

```javascript
// ─── MANUAL CONFIG FORM ──────────────────────────────────────────────────────

function _buildManualConfigFormHtml(existing) {
  const e = existing || {};
  return `
    <div class="manual-config-form card" style="padding:16px; margin-top:10px; border:2px solid var(--accent);">
      <h4 style="margin:0 0 12px 0; font-size:1rem;">Manuele configuratie${e.type ? ' bewerken' : ''}</h4>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Merk *</label>
          <input type="text" id="mcfMerk" value="${e.merk || ''}" placeholder="bv. Huawei" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Omschrijving *</label>
          <input type="text" id="mcfOmschrijving" value="${e.omschrijving || ''}" placeholder="bv. Luna 2000 10kWh" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Opslag capaciteit (kWh) *</label>
          <input type="number" id="mcfBatCap" value="${e.batCap || ''}" min="0.1" step="0.01" placeholder="bv. 10" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Omvormer capaciteit (kW) *</label>
          <input type="number" id="mcfBatInv" value="${e.batInv || ''}" min="0.1" step="0.01" placeholder="bv. 5" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Totaalprijs incl. BTW (&euro;) *</label>
          <input type="number" id="mcfPrice" value="${e.price || ''}" min="1" step="1" placeholder="bv. 8500" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>BTW %</label>
          <input type="number" id="mcfBtw" value="${e.btwPercent != null ? e.btwPercent : 21}" min="0" max="100" step="1">
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button type="button" class="btn btn-calculate" onclick="submitManualConfigForm('${e.type || ''}')" style="font-size:0.9rem; padding:6px 16px;">
          ${e.type ? 'Opslaan' : 'Toevoegen'}
        </button>
        <button type="button" class="btn btn-secondary" onclick="hideManualConfigForm()" style="font-size:0.9rem; padding:6px 16px;">
          Annuleren
        </button>
      </div>
    </div>
  `;
}

function showManualConfigForm(existingType) {
  const container = document.getElementById('manualConfigFormContainer');
  const existing = existingType ? _manualConfigs[existingType] : null;
  container.innerHTML = _buildManualConfigFormHtml(existing);
  container.style.display = '';
  document.getElementById('addManualConfigBtn').style.display = 'none';
  document.getElementById('mcfMerk').focus();
}

function hideManualConfigForm() {
  const container = document.getElementById('manualConfigFormContainer');
  container.innerHTML = '';
  container.style.display = 'none';
  document.getElementById('addManualConfigBtn').style.display = '';
}

function submitManualConfigForm(editType) {
  const merk         = document.getElementById('mcfMerk').value.trim();
  const omschrijving = document.getElementById('mcfOmschrijving').value.trim();
  const batCap       = parseFloat(document.getElementById('mcfBatCap').value);
  const batInv       = parseFloat(document.getElementById('mcfBatInv').value);
  const price        = parseFloat(document.getElementById('mcfPrice').value);
  const btwPercent   = parseInt(document.getElementById('mcfBtw').value, 10) || 21;

  // Validation
  const errors = [];
  if (!merk) errors.push('Merk is verplicht.');
  if (!omschrijving) errors.push('Omschrijving is verplicht.');
  if (!batCap || batCap <= 0) errors.push('Opslag capaciteit moet > 0 zijn.');
  if (!batInv || batInv <= 0) errors.push('Omvormer capaciteit moet > 0 zijn.');
  if (!price || price <= 0) errors.push('Totaalprijs moet > 0 zijn.');
  if (errors.length) { alert(errors.join('\n')); return; }

  const type = editType || `MANUAL_${Date.now()}`;
  _manualConfigs[type] = {
    type,
    omschrijving,
    merk,
    batCap,
    batInv,
    eff: 0.90,
    price,
    btwPercent,
    isManual: true,
  };

  hideManualConfigForm();
  renderManualConfigCards();
}
```

- [ ] **Step 2: Expose form functions on window**

Add near the bottom of the `<script>` block, next to the existing `window.loadConfigs = loadConfigs;` lines:

```javascript
window.showManualConfigForm  = showManualConfigForm;
window.hideManualConfigForm  = hideManualConfigForm;
window.submitManualConfigForm = submitManualConfigForm;
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: manual config inline form with validation"
```

---

### Task 6: Manual config card rendering + edit/delete

**Files:**
- Modify: `index.html` (JS section, right after the submitManualConfigForm function)

- [ ] **Step 1: Add renderManualConfigCards function**

```javascript
function renderManualConfigCards() {
  const container = document.getElementById('manualConfigCards');
  if (!container) return;
  const entries = Object.values(_manualConfigs);
  if (!entries.length) { container.innerHTML = ''; return; }

  container.innerHTML = entries.map(mc => `
    <div class="manual-config-card" style="display:flex; align-items:center; gap:10px; padding:8px 12px; margin-top:6px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg);">
      <span style="background:var(--accent); color:#fff; font-size:0.7rem; padding:2px 8px; border-radius:4px; font-weight:600;">Manueel</span>
      <span style="flex:1; font-size:0.9rem;">
        <strong>${_escHtml(mc.merk)} ${_escHtml(mc.omschrijving)}</strong>
        &mdash; ${fmt2(mc.batCap)} kWh / ${fmt2(mc.batInv)} kW &mdash; ${fmtEur(mc.price)}
      </span>
      <button type="button" class="btn btn-secondary" style="font-size:0.8rem; padding:3px 8px;" onclick="editManualConfig('${mc.type}')" title="Bewerken">
        <i class="fa-solid fa-pen-to-square"></i>
      </button>
      <button type="button" class="btn btn-secondary" style="font-size:0.8rem; padding:3px 8px; color:var(--danger);" onclick="deleteManualConfig('${mc.type}')" title="Verwijderen">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `).join('');
}

function editManualConfig(type) {
  showManualConfigForm(type);
}

function deleteManualConfig(type) {
  if (!confirm('Manuele configuratie verwijderen?')) return;
  delete _manualConfigs[type];
  renderManualConfigCards();
}

// Simple HTML escape (reuse if there's an existing one, otherwise define here)
function _escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
```

- [ ] **Step 2: Expose edit/delete on window**

```javascript
window.editManualConfig   = editManualConfig;
window.deleteManualConfig = deleteManualConfig;
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: manual config card rendering with edit/delete"
```

---

### Task 7: Extend `readSelectedConfigs` and `calculate` to include manual configs

**Files:**
- Modify: `index.html:1185-1189` (readSelectedConfigs)
- Modify: `index.html:1260-1266` (calculate — config resolution block)

- [ ] **Step 1: Create `readAllSelectedConfigs` that merges sheet + manual**

Replace the existing `readSelectedConfigs` function (lines 1185-1189) with:

```javascript
// Read the currently-selected config types from dropdown pickers (sheet configs only).
function readSelectedConfigs() {
  return [...document.querySelectorAll('#configPickerList .config-select')]
    .map(s => s.value)
    .filter(v => v);
}

// Read ALL selected configs: sheet picker selections + manual configs.
// Returns array of resolved config objects ready for processDataPure.
function readAllSelectedConfigObjects() {
  const priceKey = _getPriceKey();
  // Sheet configs from dropdowns
  const sheetTypes = readSelectedConfigs();
  const sheetResolved = sheetTypes
    .map(type => {
      const c = _sheetConfigs.find(x => x.type === type);
      return c ? { type: c.type, omschrijving: c.omschrijving, batCap: c.batCap, batInv: c.batInv, eff: c.eff, price: c.prices[priceKey] } : null;
    })
    .filter(Boolean);

  // Manual configs (already have price resolved)
  const manualResolved = Object.values(_manualConfigs).map(mc => ({
    type: mc.type, omschrijving: `${mc.merk} ${mc.omschrijving}`, batCap: mc.batCap, batInv: mc.batInv, eff: mc.eff, price: mc.price, isManual: true,
  }));

  return [...sheetResolved, ...manualResolved];
}
```

- [ ] **Step 2: Update the `calculate` function to use `readAllSelectedConfigObjects`**

In the `calculate()` function, replace the config resolution block (lines 1260-1266):

```javascript
  const priceKey = _getPriceKey();
  const selectedConfigs = readSelectedConfigs()
    .map(type => {
      const c = _sheetConfigs.find(x => x.type === type);
      return c ? { type: c.type, omschrijving: c.omschrijving, batCap: c.batCap, batInv: c.batInv, eff: c.eff, price: c.prices[priceKey] } : null;
    })
    .filter(Boolean);
```

with:

```javascript
  const selectedConfigs = readAllSelectedConfigObjects();
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: calculate() includes manual configs in selectedConfigs"
```

---

### Task 8: Persist manual configs in `saveProjectCalcRun`

**Files:**
- Modify: `index.html:1722-1756` (saveProjectCalcRun)

- [ ] **Step 1: Pass `manualConfigs` to `saveLastCalcRun`**

In `saveProjectCalcRun` (around line 1751), change the `saveLastCalcRun` call from:

```javascript
  await saveLastCalcRun(_projectId, {
    inputs: { pvInv: pvInverter, priceDay, priceNight, selectedConfigTypes },
    results,
  });
```

to:

```javascript
  await saveLastCalcRun(_projectId, {
    inputs: { pvInv: pvInverter, priceDay, priceNight, selectedConfigTypes },
    results,
    manualConfigs: Object.keys(_manualConfigs).length > 0 ? _manualConfigs : null,
  });
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: saveProjectCalcRun passes manualConfigs to saveLastCalcRun"
```

---

### Task 9: Restore manual configs from project on load

**Files:**
- Modify: `index.html:2264-2284` (buildSavedFromProject — add manualConfigs to restored state)
- Modify: `index.html` (_applyLoadedState — restore manualConfigs into _manualConfigs store)

- [ ] **Step 1: Include manualConfigs in buildSavedFromProject**

In `buildSavedFromProject` (line 2264-2284), add `manualConfigs` to the returned object. Change the return statement from:

```javascript
  return {
    v: 5,
    form: (proj.lastCalcRun && proj.lastCalcRun.inputs) ? {
      pvInv: proj.lastCalcRun.inputs.pvInv,
      priceDay: proj.lastCalcRun.inputs.priceDay,
      priceNight: proj.lastCalcRun.inputs.priceNight,
      selectedConfigTypes: proj.lastCalcRun.inputs.selectedConfigTypes,
    } : {},
    r,
  };
```

to:

```javascript
  return {
    v: 5,
    form: (proj.lastCalcRun && proj.lastCalcRun.inputs) ? {
      pvInv: proj.lastCalcRun.inputs.pvInv,
      priceDay: proj.lastCalcRun.inputs.priceDay,
      priceNight: proj.lastCalcRun.inputs.priceNight,
      selectedConfigTypes: proj.lastCalcRun.inputs.selectedConfigTypes,
    } : {},
    r,
    manualConfigs: proj.manualConfigs || {},
  };
```

- [ ] **Step 2: Restore _manualConfigs in _applyLoadedState**

Find the `_applyLoadedState` function. Near the beginning (after the version check / form restoration), add:

```javascript
  // Restore manual configs if present
  if (saved.manualConfigs && typeof saved.manualConfigs === 'object') {
    _manualConfigs = { ...saved.manualConfigs };
    renderManualConfigCards();
  }
```

Also, inside the block where `_populateConfigSelects` is called (which restores the sheet config dropdown pickers), ensure it filters out manual types so they don't try to appear in dropdowns:

Find the call to `_populateConfigSelects(saved.form.selectedConfigTypes)` and change to:

```javascript
  _populateConfigSelects((saved.form.selectedConfigTypes || []).filter(t => !isManualConfig(t)));
```

- [ ] **Step 3: Make the manual config button visible when restoring from project**

In the project-mode load path (around line 2140-2155), after `_applyLoadedState(restored, false)`, add:

```javascript
      // Show manual config button (configs are loaded in this path)
      const mcBtn = document.getElementById('addManualConfigBtn');
      if (mcBtn) mcBtn.style.display = '';
```

Also in the `pendingConfigTypes` branch (line 2154-2156), add the same after `loadConfigs().then(...)`:

```javascript
      // Also show manual config button
      const mcBtn = document.getElementById('addManualConfigBtn');
      if (mcBtn) mcBtn.style.display = '';
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: restore manual configs from project on load"
```

---

### Task 10: Manual config label in offerte cards (dashboard drawer)

**Files:**
- Modify: `assets/js/offertes-ui.js:98-104` (renderOffertesCards — config title display)

- [ ] **Step 1: Show "(Manueel)" badge and use omschrijving for manual types**

In `renderOffertesCards`, change line 103 from:

```javascript
            <span class="offerte-row-title">${escapeHtml(cfg.type)}</span>
```

to:

```javascript
            <span class="offerte-row-title">${isManualConfig(t) ? '<span class="badge bg-primary" style="font-size:0.65rem; vertical-align:middle; margin-right:4px;">Manueel</span>' : ''}${escapeHtml(isManualConfig(t) && cfg.omschrijving ? cfg.omschrijving : cfg.type)}</span>
```

This shows the `omschrijving` (e.g., "Huawei Luna 2000 10kWh") instead of the raw `MANUAL_1715...` type for manual configs, with a blue "Manueel" badge.

- [ ] **Step 2: Commit**

```bash
git add assets/js/offertes-ui.js
git commit -m "feat: show Manueel badge + omschrijving in offerte cards for manual configs"
```

---

### Task 11: Result card labelling for manual configs

**Files:**
- Modify: `index.html` (renderResults / makeScenCard — wherever the config type is displayed in result cards)

- [ ] **Step 1: Find where config type is rendered in result cards**

Search `index.html` for where `cfg.type` or `cr.cfg.type` is rendered in the result section. Update the heading to show `omschrijving` for manual types:

Where the card title shows the config type (typically in `makeScenCard` or similar), replace the raw type display with:

```javascript
const cfgLabel = cr.cfg.isManual
  ? `${cr.cfg.omschrijving} <span style="background:var(--accent);color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:4px;vertical-align:middle;">Manueel</span>`
  : cr.cfg.type;
```

Use `cfgLabel` where `cr.cfg.type` was previously displayed in the card header.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: result cards show omschrijving + Manueel badge for manual configs"
```

---

### Task 12: Share-link support for manual configs

**Files:**
- Modify: `index.html` (_serializeState — include manualConfigs in the v:5 payload)
- Modify: `index.html` (_applyLoadedState — handle manualConfigs from share payloads)

- [ ] **Step 1: Include manualConfigs in _serializeState**

Find `_serializeState()` and add `manualConfigs` to the returned object:

After the `form` and `r` fields in the return statement, add:

```javascript
    manualConfigs: Object.keys(_manualConfigs).length > 0 ? _manualConfigs : undefined,
```

This ensures share links (`?s=` and `?data=`) carry manual config definitions.

- [ ] **Step 2: Verify _applyLoadedState already handles it**

The code added in Task 9 Step 2 (`if (saved.manualConfigs && ...)`) already covers this — both project-load and share-link-load go through `_applyLoadedState`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: share links carry manual config definitions"
```

---

### Task 13: Final integration test

- [ ] **Step 1: Run existing tests to verify nothing broke**

```bash
npx vitest run
```

Expected: All 116+ tests pass (manual configs don't touch calc-engine or csv logic).

- [ ] **Step 2: Manual E2E verification checklist**

Open `http://localhost:8000/index.html` and:

1. Load configs (click button)
2. Click "+ Manuele configuratie"
3. Fill in: Merk=Huawei, Omschrijving=Luna 2000, batCap=10, batInv=5, Price=8500, BTW=21
4. Click "Toevoegen" — verify card appears with "Manueel" badge
5. Also select a sheet config (e.g., ZSF10-H3) from the dropdown
6. Upload CSV and click "Bereken ROI"
7. Verify TWO result card sets appear (one for ZSF10-H3, one for Huawei Luna 2000 with "Manueel" badge)
8. If in project-mode: reload the page, verify manual config is restored
9. Edit the manual config (click edit icon on card), change price, save
10. Delete the manual config (click trash icon)

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration fixes for manual config feature"
```

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin feat/manual-config
gh pr create --base gh-pages --title "feat: manual battery configuration support" --body "$(cat <<'EOF'
## Summary
- Add "+ Manuele configuratie" button to the calculator config picker area
- Manual configs: user enters brand, description, capacity (kWh), inverter (kW), total price (incl BTW), BTW%
- Manual configs are treated identically to sheet configs by the calc engine
- Stored in project.manualConfigs (Firestore), carried through share links
- Cards show edit/delete actions; "Manueel" badge in results and offerte views
- Dashboard drawer offerte cards show omschrijving instead of raw type for manual configs

## Test plan
- [ ] Add manual config, run Bereken, verify results
- [ ] Mix manual + sheet configs in same calculation
- [ ] Project save/load preserves manual configs
- [ ] Edit manual config (type ID preserved)
- [ ] Delete manual config
- [ ] Share link carries manual config data
- [ ] Dashboard offerte cards show correct label
- [ ] All existing tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
