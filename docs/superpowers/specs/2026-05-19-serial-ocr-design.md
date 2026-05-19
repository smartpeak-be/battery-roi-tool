# Serial-OCR — Design Spec

**Date**: 2026-05-19
**Branch**: `feat/serial-ocr` (base: `gh-pages`)
**Status**: approved, ready for implementation plan

## Doelstelling

Foto's van toestel-stickers automatisch laten verwerken zodat het serienummer
in `project.serialNumbers` belandt zonder manueel typen. Categorisering per
foto (batterij / omvormer / omvormer+batterij) zodat downstream rapportering
mogelijk wordt — primair voor **Bebat**-aangifte (batterij-bevattende
toestellen), secundair voor factuur-traceability.

## Achtergrond

De huidige photo-uploader (`assets/js/photo-uploader.js`) labelt foto's met
één van twee tags: `'situatie'` of `'serial'`. Serial-tagged photos hebben
nu enkel een tag maar geen verdere verwerking; serial-nummers worden los
ingetypt in een textinput-lijst in Blok D van `project-edit.html`.

Deze feature splitst `'serial'` op naar 3 toestel-categorieën en voegt een
Cloud-Function pipeline toe die met Google Cloud Vision het serienummer uit
de foto haalt en als entry aan `project.serialNumbers` toevoegt.

## Architectuur

```
[Photo upload]                                     [Browser]
      │
      ▼ store blob in Storage + photo-doc in Firestore (tag pending)
[Tag-modal]
      │
      ▼ user picks Serial + category → write to photo-doc
                                       (tag='serial', serialCategory=X,
                                        ocrStatus='pending')
                                                   │
─────────────────────────────────────────────────  │  Cloud  ─────────
                                                   ▼
                          [Firestore onWrite trigger: ocrSerial]
                                                   │
                                                   ▼ read blob via Admin SDK
                                          [Cloud Vision TEXT_DETECTION
                                            (europe-west1 endpoint)]
                                                   │
                                                   ▼ extract candidates,
                                                     pick longest match
                                                   ▼
                          [Transaction: update photo-doc ocrStatus,
                                        append entry to project.serialNumbers]
─────────────────────────────────────────────────  │  ──────────────
                                                   ▼
                            [Browser onSnapshot]   ─── Blok D fills in
```

## Datamodel

### Photo doc (`projects/{id}/photos/{photoId}`)

Bestaande velden ongewijzigd. Nieuw:

| Veld             | Type                              | Aanwezig wanneer        |
|------------------|-----------------------------------|-------------------------|
| `tag`            | `'situatie' \| 'serial'`         | altijd (bestaand)       |
| `serialCategory` | `'batterij' \| 'omvormer' \| 'omvormer_batterij'` | enkel bij `tag='serial'` |
| `ocrStatus`      | `'pending' \| 'ok' \| 'failed' \| null` | enkel bij `tag='serial'`; `null` = re-run aangevraagd |
| `ocrCandidates`  | `string[]`                        | na OCR-run              |
| `ocrError`       | `string`                          | enkel bij `ocrStatus='failed'` (debug) |
| `serialEntryId`  | `string`                          | na succesvolle append; link naar `project.serialNumbers[].id` |

### Serial-entry (`project.serialNumbers[]`)

Bestaande shape `{id, value}` uitgebreid. Verplichte nieuwe velden voor
nieuwe entries; legacy entries worden bij read gemerged.

| Veld         | Type                                                              | Notitie                                |
|--------------|-------------------------------------------------------------------|----------------------------------------|
| `id`         | `string`                                                          | bestaand                               |
| `value`      | `string`                                                          | leeg bij `ocrStatus='failed'` of pending |
| `category`   | `'batterij' \| 'omvormer' \| 'omvormer_batterij' \| null`        | null = legacy/uncategorized            |
| `source`     | `'manual' \| 'ocr'`                                              | nieuw                                  |
| `photoId`    | `string \| undefined`                                            | enkel bij `source='ocr'`               |
| `ocrStatus`  | `'pending' \| 'ok' \| 'failed' \| undefined`                     | gespiegeld vanuit photo-doc voor UI    |
| `uploadedAt` | `Timestamp`                                                       | bestaand                               |
| `uploadedBy` | `string`                                                          | bestaand                               |

### Backwards-compat (lazy merge in `mergeProjectMetadata`)

```js
merged.serialNumbers = (project.serialNumbers || []).map(e => ({
  ...e,
  category: e.category ?? null,
  source: e.source ?? 'manual',
}));
```

Geen schrijf-migratie — pre-feature entries blijven `category: null` tot een
gebruiker ze handmatig categoriseert (toekomstige UX, out-of-scope voor
deze release).

## Cloud Function `ocrSerial`

**Trigger**: Firestore `onWrite` op `projects/{projectId}/photos/{photoId}`.

**Guard** (fire-or-skip):
- Skip als `before.tag === 'serial' && after.tag === 'serial'` én andere velden onveranderd (geen retrigger op cosmetic updates)
- Skip als `after` deleted
- Run als `after.tag === 'serial'` én (`before.tag !== 'serial'` óf `before.serialCategory !== after.serialCategory` óf `after.ocrStatus === null`)
- Cleanup als `before.tag === 'serial' && after.tag !== 'serial'` → verwijder gekoppelde serial-entry uit `project.serialNumbers`

**Run-flow**:
1. Update photo-doc: `ocrStatus: 'pending'`
2. Lees blob uit Storage via `bucket.file(after.storagePath).download()`
3. Roep Vision aan: `client.textDetection({ image: { content: buffer.toString('base64') }})`
4. Extract candidates van `result.textAnnotations` (skip de "full text"-eerste entry, gebruik per-block strings)
5. Heuristiek: filter regex `/^[A-Z0-9-]{6,}$/i`, sorteer op lengte desc, neem `[0]`
6. **Idempotency**: lees current `project.serialNumbers`; als entry met `photoId === photoId` bestaat, update die entry; anders append nieuwe entry
7. Transaction: update photo-doc (`ocrStatus: 'ok'`, `ocrCandidates: [...]`, `serialEntryId: ...`) + project-doc (`serialNumbers`-array)
8. Bij Vision-error of empty candidates: `ocrStatus: 'failed'`, `ocrError: '<msg>'`, entry-stub met `value: ''` zodat de Failed-rij verschijnt in Blok D

**Infra**:
- Nieuw `functions/` directory aan repo-root: `package.json`, `index.js`,
  `.gitignore` (node_modules)
- Node 20 runtime, region `europe-west1`
- Permissions: service-account krijgt `roles/cloudfunctions.invoker`,
  `roles/storage.objectViewer` op de project bucket, en
  `roles/serviceusage.serviceUsageConsumer` voor Vision API. Firestore-toegang
  via default Admin SDK credentials van de function.
- Deploy: `firebase deploy --only functions:ocrSerial`
- Kosten: $1.50/1000 photos (1000/maand gratis); verwachte volume <100/maand → ruim gratis

**Cleanup-flow** (re-tag serial → situatie):
1. Lees `before.serialEntryId` van photo-doc
2. `arrayRemove` de entry met `id === serialEntryId` uit `project.serialNumbers`
3. Update photo-doc: unset `serialCategory`, `ocrStatus`, `serialEntryId`,
   `ocrCandidates`, `ocrError`

## Client UX

### Tag-modal redesign (`photo-uploader.js`)

Per foto:
- Bovenste radio-row: Situatie / Serieel (bestaand)
- Onder Serieel: collapse-row met radio Batterij / Omvormer / Omvormer+Batterij (default Batterij)
- Layout: Bootstrap btn-group, wrap-friendly voor mobiel

Bulk-knoppen bovenaan:
- `Alles → Situatie`
- `Alles → Serieel · Batterij` (meest voorkomende batch)

Mixed batches → per-foto controls.

### Serial-list rendering (Blok D in `project-edit.html` + drawer in `dashboard.html`)

Per rij van links naar rechts:
- **Category-badge**: `Batterij` (blue) / `Omvormer` (purple) / `Omvormer+Batterij` (green) / `?` (grey) voor `category: null`
- **Source-icoon**: `fa-image` voor OCR-entries (klik → lightbox van bron-foto), `fa-keyboard` voor manuele entries
- **Status-indicator**:
  - pending: spinner `fa-spinner fa-spin`, input read-only met placeholder "OCR bezig..."
  - ok: input editable met value ingevuld
  - failed: `fa-triangle-exclamation` (orange), input editable met placeholder "OCR niet gelukt, vul manueel in"
- **Tekstinput**: zelfde plek/styling als nu
- **Re-run knop** (alleen bij ocrStatus='failed', source='ocr'): `fa-rotate` → schrijft `ocrStatus: null` op photo-doc, triggert function opnieuw
- **Delete knop**: zelfde als nu (bestaand)

Geen secties/groepering — flat-list gesorteerd op `uploadedAt` (zelfde als nu).
Bebat-filter komt in een latere feature.

### Real-time sync upgrade

Drawer heeft al `onSnapshot` op het project-doc. **Project-edit Blok D moet
ge-upgrade worden** van one-shot `getProject(id)` naar `onSnapshot`-subscriptie
voor de serial-list specifiek. Andere velden in project-edit blijven
one-shot read (geen race met de form-state daar).

Implementatie: in `project-edit.html`'s `loadAndRender(projectId)`, na de
initial render een `onSnapshot` opzetten die de serial-list re-renderet
wanneer `data.serialNumbers` wijzigt. Subscribe-cleanup bij page-unload.

### Re-tag van bestaande foto's

De bestaande tag-modal opent enkel direct na een nieuwe upload. Voor
re-tagging van een al getagde foto (later van situatie → serial of vice versa)
zit nog geen UX in place — out-of-scope voor deze feature. Workaround: foto
deleten en opnieuw uploaden.

## Testing

### Unit (vitest)

- `tests/serial-ocr-extract.test.js`: pure-function `extractSerialFromOcr(textAnnotations)` met fixtures:
  - Marstek-sticker (multi-line, model + serial visible)
  - Zendure-sticker (single-line, prefix "SN: ...")
  - Vage foto (geen text annotations)
  - Foto met enkel model-nummer (geen serial-match in regex)
  - Foto met meerdere kandidaten (kies de langste)
- `tests/firebase-init-serials.test.js`: `mergeProjectMetadata` voor pre-feature
  entries (defaults `category: null`, `source: 'manual'`)

### Cloud Function (vitest, naast `functions/`)

- `functions/__tests__/ocrSerial.test.js` met `@google-cloud/vision` gemockt:
  - Happy path: nieuwe foto → photo-doc + serial-entry geschreven
  - Idempotency: tweede invocation met zelfde `photoId` → geen dubbele append
  - Failed-path: Vision throws → `ocrStatus: 'failed'`, `value: ''`-entry
  - Retag cleanup: serial → situatie → entry verwijderd
  - Skip-path: cosmetic update → niets gebeurt

### E2E (Playwright)

- `e2e/tests/serial-ocr.spec.js`:
  - Happy: upload foto via test-fixture → tag als Serial · Batterij → mock
    Vision response via test-only doc-write die de function's gemockte path
    aanslaat (eenvoudiger: stub `ocrStatus` direct naar 'ok' met een testvalue
    in plaats van de echte function draaien) → verifieer rij verschijnt in
    Blok D
  - Failed: zelfde flow maar mock-stub schrijft `ocrStatus: 'failed'` → Re-run
    knop zichtbaar, klik → status resets naar pending
  - Manuele toevoeging blijft werken (geen regressie)

### Manueel

Eén echte upload met een echte Marstek-batterij sticker op staging
(`gh-pages`) na deploy.

## Scope & out-of-scope

**In scope**:
- Photo + serial-entry datamodel-uitbreiding
- Tag-modal 2-level redesign
- Cloud Function `ocrSerial` met EU Vision endpoint
- Pending/OK/Failed UI in Blok D + drawer met badges, icons, re-run
- onSnapshot-upgrade voor serial-list in project-edit
- Lazy backwards-compat voor pre-feature serial-entries
- Cleanup bij re-tag serial → situatie
- E2E happy-path + failure-path tests

**Out of scope** (expliciet, follow-ups):
- Bebat-export UI/CSV — datamodel is er klaar voor, export-feature later
- Multi-candidate picker UI — candidates worden wel opgeslagen
- Re-tag UX voor reeds-getagde foto's
- Barcode/QR-decoding
- Vendor-specifieke serial-regex (algemene heuristiek voor MVP)
- I18n van category-labels (Nederlands-only)

## Branch + deploy

- Implementeer in `feat/serial-ocr`, base `gh-pages`
- Cloud Function deploy is een aparte stap (niet onderdeel van `gh-pages`
  push), vereist eenmalig `firebase deploy --only functions:ocrSerial`
- Firestore/Storage rules: geen wijziging nodig (bestaande
  `if isWhitelisted()` rule dekt de nieuwe velden; function gebruikt Admin
  SDK)
- CLAUDE.md update: nieuwe sectie "Serial OCR pipeline" + verwijzing naar
  `functions/` directory en hoe te deployen
