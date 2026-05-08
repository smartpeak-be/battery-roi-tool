# Meerkost (Extra Cost) per Sheet Config

**Date:** 2026-05-08
**Status:** Design
**Scope:** `index.html`, `assets/js/firebase-init.js`, `CLAUDE.md`

## Problem

When a salesperson knows upfront that additional work or materials will be needed beyond the standard installation, there's no way to factor that extra cost into the ROI calculation. The user currently has to mentally adjust the numbers or create a manual config with an all-in price.

## Solution

Add a "Meerkost (ex BTW)" number input next to each sheet-config dropdown. The meerkost value is **ex BTW** — it gets BTW added (using the existing BTW dropdown) before being summed with the sheet config's installation price.

**Formula:**
```
effectiveInstallPrice = sheetPrice + meerkost * (1 + btwPercent / 100)
```

**Scope exclusions:**
- Manual configs do NOT get a meerkost input — their price is already all-in (user enters the total incl. BTW).
- `lead-result.html` — no config picker, no meerkost.
- `calc-engine.js` — unchanged; the price adjustment happens before data reaches the engine.

## UI Changes

### Layout change: stacked config pickers

Current: CSS grid with `repeat(auto-fill, minmax(280px, 1fr))` — pickers appear side-by-side on wide screens.

New: flex column layout. Each picker row is a horizontal flex container with the select on the left (flex: 1) and the meerkost input on the right (fixed width ~160px).

```css
.config-picker-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.config-picker-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.config-picker-row .form-group { flex: 1; margin-bottom: 0; }
.config-picker-row .meerkost-wrap {
  width: 160px;
  flex-shrink: 0;
}
.config-picker-row .meerkost-wrap label {
  font-size: 0.78rem;
  white-space: nowrap;
}
```

### Meerkost input

Each config picker row gets:
```html
<div class="meerkost-wrap">
  <label>Meerkost (ex BTW)</label>
  <input type="number" class="meerkost-input" min="0" step="50" value="0">
</div>
```

- Default value: `0`
- Step: 50 (convenient for common amounts, user can type any value)
- Only shown for rows with a selected config (the trailing empty picker shows the input but it's inert)
- The `(ex BTW)` label makes it clear the value is exclusive of VAT

### Result card annotation

When `meerkost > 0`, the config-group-header's price badge shows:
```
€ 8.500 (incl. € 605 meerkost)
```

And the "Installatieprijs" line in the scenario card shows the effective total (sheetPrice + meerkost incl. BTW) — no separate annotation needed there since the meerkost is already baked in.

## Data Model

### `meerkostMap` — new field in serialization

A map from config type to meerkost value (ex BTW, number). Only types with `meerkost > 0` are stored.

```typescript
// Type shape (for documentation, not actual TS)
type MeerkostMap = { [configType: string]: number }; // ex BTW
```

### Where it lives

| Context | Location | Notes |
|---------|----------|-------|
| In-memory (calc view) | Read from DOM `.meerkost-input` elements | Ephemeral |
| `_serializeState()` output | `state.meerkostMap` (top-level, sibling of `form`, `r`, `manualConfigs`) | Only if non-empty |
| Share link (`?s=<id>`) | Firestore `shares/<id>` doc contains the serialized state | Transparent |
| Project save | `lastCalcRun.inputs.meerkostMap` | Persisted |
| `buildSavedFromProject()` | Reads from `lastCalcRun.inputs.meerkostMap` → places in `state.meerkostMap` | Restore path |
| `_applyLoadedState()` | Reads `state.meerkostMap` → populates `.meerkost-input` elements after `loadConfigs().then(renderConfigPickers)` | |

### No schema version bump

`meerkostMap` is optional. Older saves without it work fine — missing map means all meerkost = 0. No version bump needed.

## Implementation Tasks

### Task 1: CSS layout change
**File:** `index.html` (inline `<style>`)
- Replace `.config-picker-grid` CSS from grid to flex column
- Add `.config-picker-row`, `.meerkost-wrap` styles

### Task 2: Update `renderConfigPickers()`
**File:** `index.html`
- Each picker row becomes a `.config-picker-row` flex container
- Add meerkost input next to each select
- Meerkost change triggers no re-render (it's just a number input, read at calc time)
- Accept optional `meerkostMap` parameter for restore; set input values from map

### Task 3: Update `readAllSelectedConfigObjects()`
**File:** `index.html`
- Read `.meerkost-input` values from the DOM, paired with their sibling `.config-select`
- Compute `effectivePrice = sheetPrice + meerkost * (1 + btwPercent / 100)`
- Set `cfg.price = effectivePrice` and `cfg.meerkost = meerkostExBtw` (raw value for serialization)
- `cfg.meerkostInclBtw = meerkost * (1 + btwPercent / 100)` (for display annotation)

### Task 4: Update `renderScenarioGrid()` — config header annotation
**File:** `index.html`
- In the config-group-header, when `cfg.meerkost > 0`, append `(incl. ${fmtEur(cfg.meerkostInclBtw)} meerkost)` to the price badge

### Task 5: Serialization — `_serializeState()`
**File:** `index.html`
- Build `meerkostMap` from `_saved.configResults`: for each `cr.cfg` where `cr.cfg.meerkost > 0`, store `{ [type]: meerkost }`
- Add `meerkostMap` to the serialized state object (top-level, alongside `manualConfigs`)

### Task 6: Restore — `_applyLoadedState()`
**File:** `index.html`
- After the existing `loadConfigs().then(() => _populateConfigSelects(...))` call, pass `state.meerkostMap` so the meerkost inputs can be populated
- Update `renderConfigPickers` / `_populateConfigSelects` to accept and apply the map

### Task 7: Project persistence — `saveProjectCalcRun()`
**File:** `index.html`
- Read meerkost values from `_saved.configResults` and build `meerkostMap`
- Pass `meerkostMap` inside `lastCalcRun.inputs`

### Task 8: Project restore — `buildSavedFromProject()`
**File:** `index.html`
- Read `proj.lastCalcRun.inputs.meerkostMap` and place it in `state.meerkostMap`

### Task 9: Update `CLAUDE.md`
- Document the meerkost feature in the config-picker section
- Add the formula and data model to the relevant architecture sections

## Edge Cases

1. **Meerkost = 0 (default):** No effect on price. Not stored in meerkostMap. No annotation shown.
2. **User changes BTW after entering meerkost:** The meerkost is ex BTW, so the effective price recalculates at Bereken-time. No issue.
3. **User changes config selection:** `renderConfigPickers` re-renders all rows. Before re-render, read current meerkost values into a `{ [type]: number }` map; after re-render, restore values for configs that are still selected. New/changed configs default to 0.
4. **Share link restore with meerkost:** The meerkostMap in the serialized state is used to populate the inputs after config load. The result cards already contain the baked-in price.
5. **Old saves without meerkostMap:** Missing = all meerkost 0. No degradation.
6. **Meerkost on the trailing empty picker:** Input is present but inert — no config selected means no price to add to. `readAllSelectedConfigObjects` skips empty selections.

## Testing

- Manual: upload CSV, load configs, select 2 configs, enter meerkost on one, verify price in results includes the meerkost + BTW
- Manual: share link round-trip — verify meerkost values persist
- Manual: project save/load — verify meerkost values persist
- Manual: change BTW dropdown, recalculate — verify meerkost adjusts
- Unit tests in `tests/`: `readAllSelectedConfigObjects` is DOM-dependent, not easily unit-testable. The price formula is trivial (`a + b * (1 + c/100)`).
