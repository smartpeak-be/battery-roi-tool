# Manual Battery Configuration

Date: 2026-05-08

## Problem

The calculator only supports pre-defined configs from the Google Sheet (Zendure ZSF / Marstek MARVE products). When Kevin or Ruben want to quote a third-party battery (e.g., Huawei Luna, BYD, SolarEdge), they cannot run an ROI calculation for it.

## Solution

Add a "manual config" capability: a button in the calculator that lets the user define a custom battery configuration with brand, description, capacity, inverter power, and total price. The manual config is treated identically to a sheet config by the calc engine — same data shape, same ROI calculation, same result rendering.

## Design Decisions

- **Approach A (virtual sheet-config)**: Manual configs get the same data shape as resolved sheet configs. The calc engine sees no difference. This minimises changes across the pipeline.
- **Price model**: Single total price (incl. BTW, keuring, installation — everything). The existing keuring/BTW dropdowns do not affect manual config prices.
- **Efficiency**: Fixed at 90% (0.90). No user-facing field.
- **Mixing**: Manual and sheet configs can coexist in the same calculation.
- **Edit**: Each manual config card has an edit button that re-opens the form with existing values, preserving the type ID (so offerte links survive).
- **Lead wizard**: Out of scope — leads use auto-selected configs only.

## Data Model

### In-memory config object (same shape as resolved sheet config)

```javascript
{
  type: 'MANUAL_1715200000000',    // 'MANUAL_' + Date.now()
  omschrijving: 'Huawei Luna 10',  // user-entered label
  merk: 'Huawei',                   // user-entered brand
  batCap: 10,                       // kWh
  batInv: 5,                        // kW
  eff: 0.90,                        // fixed default
  price: 8500,                      // total price incl BTW (EUR)
  btwPercent: 21,                   // BTW % (informational only)
  isManual: true                    // UI differentiation flag
}
```

### Firestore project document

New top-level field `manualConfigs` on the project doc:

```javascript
project.manualConfigs: {
  'MANUAL_1715200000000': {
    omschrijving: 'Huawei Luna 10',
    merk: 'Huawei',
    batCap: 10,
    batInv: 5,
    eff: 0.90,
    price: 8500,
    btwPercent: 21
  }
}
```

`mergeProjectMetadata()` defaults `manualConfigs: {}` for pre-existing projects.

`selectedConfigTypes` contains both sheet types and manual types:
```javascript
['ZSF10-H3', 'MANUAL_1715200000000']
```

## UI: Calculator (index.html)

### Config picker area

Below the existing N+1 config dropdowns, add:

**Button**: `+ Manuele configuratie` (with `fa-plus` icon)

Clicking opens an **inline form** (not modal) with:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Merk | text | yes | — | Brand name |
| Omschrijving | text | yes | — | Display name, e.g. "Luna 2000 10kWh" |
| Opslag capaciteit (kWh) | number | yes | — | `batCap` |
| Omvormer capaciteit (kW) | number | yes | — | `batInv` |
| Totaalprijs incl. BTW (EUR) | number | yes | — | `price` |
| BTW % | number | no | 21 | Informational |

Buttons: **Toevoegen** / **Annuleren** (or **Opslaan** / **Annuleren** when editing)

### Manual config cards

After adding, the config appears as a compact card in the picker area:

```
[Manueel]  Huawei Luna 2000 10kWh — 10 kWh / 5 kW — EUR 8.500
                                              [edit] [delete]
```

- Visually distinct from dropdown pickers (badge label "(Manueel)")
- Edit button (`fa-pen-to-square`): re-opens form with existing values, same type ID preserved
- Delete button (`fa-trash`): removes the manual config

### In-memory storage

Manual configs are stored in a module-level `Map` or plain object (`_manualConfigs`) keyed by type. This is read alongside dropdown selections by an extended `readSelectedConfigs()`.

### Bereken flow

1. `readSelectedConfigs()` reads dropdown-selected sheet configs AND appends all manual configs from the in-memory store
2. Manual configs already have `price` resolved — skip `_getPriceKey` for them
3. Array of all configs is passed to `processDataPure()` unchanged

### Result rendering

- Result scenario cards for manual configs look identical to sheet-config cards
- The config name shows `omschrijving` (e.g., "Huawei Luna 2000 10kWh") instead of the type code
- An "(Manueel)" badge appears on the card header
- No "Bekijk specificaties" link (manual configs have no spec page)

## Project-Mode Integration

### Save (Bereken with `?project=<id>`)

When `saveProjectCalcRun` runs:
1. `manualConfigs` map is written to the project doc (alongside existing fields)
2. `selectedConfigTypes` includes manual type strings
3. `lastCalcRun.results.configResults` contains the full `cfg` object as usual

### Load (opening `?project=<id>`)

When `buildSavedFromProject` / `applyProjectToCalcForm` runs:
1. Read `project.manualConfigs` (defaulted to `{}` by `mergeProjectMetadata`)
2. Populate the in-memory `_manualConfigs` store
3. Render manual config cards in the picker area
4. Sheet configs are restored via dropdown pickers as before

### Delete config

`deleteProjectConfig(id, type)`:
- If type starts with `MANUAL_`: also remove from `project.manualConfigs`
- Existing cascade (selectedConfigTypes, configResults, offertes + Storage blob) applies unchanged

## Dashboard / Drawer

### Config display

- Offerte rows for manual configs use `omschrijving` as the label + "(Manueel)" badge
- All offerte actions (upload PDF, download, replace, delete config) work identically — keyed by `type`

### `needsOfferteWarning`

Works unchanged — it checks whether selected types have PDFs, regardless of prefix.

### `precomputeLastCalcRunForLead`

Not affected — leads don't use manual configs.

## Share Links

### `?s=<id>` (Firestore share)

The share payload stores full `configResults` including `cfg` objects. Manual configs are fully represented. The read-only view renders them without changes.

### `?data=<b64>` (legacy)

Same — `cfg` is in the payload. No changes needed.

## Out of Scope

- Lead wizard (`lead.html`) — leads auto-select configs
- `lead-result.html` — no manual config support needed
- `calc-engine.js` (`processDataPure`) — no changes, manual configs have the standard shape
- Product spec pages — manual configs have no spec page
- Efficiency field — fixed at 90%

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Add manual config button, inline form, card rendering, extend `readSelectedConfigs()`, project save/load integration |
| `assets/js/firebase-init.js` | `mergeProjectMetadata` default `manualConfigs: {}`, `deleteProjectConfig` cleanup, `isManualConfig(type)` helper |
| `dashboard.html` | Display `omschrijving` + "(Manueel)" badge for manual config types in drawer/offerte rows |

## Testing

- Unit tests for `isManualConfig(type)` helper
- Manual E2E: add manual config, run Bereken, verify results, save project, reload, verify manual config persists, share link, verify read-only view
