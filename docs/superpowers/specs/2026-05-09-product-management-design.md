# Product Management — Design Spec

**Datum:** 2026-05-09
**Status:** Draft
**Doel:** De Google Sheet als productbron vervangen door een Firestore-gebaseerd productbeheersysteem met CRUD, prijslogica, specs, foto's en datasheets.

---

## 1. Context & scope

### Wat we bouwen

Een **producten-beheer pagina** (`producten-beheer.html`) waar Kevin en Ruben individuele toestellen en materialen beheren: aankoopprijs, winstmarge, korting, gewicht, technische specs, foto's en datasheets. Daarnaast een **instellingen-sectie** voor defaults (marge, korting, Bebat, installatie/keuringskost).

### Wat NIET in scope is (toekomstige fases)

- **Combinaties-pagina** — producten samenvoegen tot configuraties (fase 2)
- **Calculator-integratie** — combo's gebruiken i.p.v. de Google Sheet (fase 2)
- **Billit-koppeling** — offerte/factuur-generatie (fase 3)
- **Voorschot/eindfactuur flow** (fase 3)

### Relatie met bestaand systeem

De producten-pagina staat volledig op zichzelf. De calculator (`index.html`) blijft ongewijzigd de Google Sheet lezen via `config/products.csvUrl`. Geen breaking changes, geen migratie nodig in deze fase.

---

## 2. Datamodel (Firestore)

### 2.1 `config/settings` document

Algemene instellingen, opgeslagen als een enkel document.

```
config/settings {
  // Prijsberekening defaults
  defaultMarginType:       'percent' | 'fixed',   // 'percent' = %, 'fixed' = vast bedrag
  defaultMarginValue:      30,                     // 30% of €30
  defaultDiscountType:     'percent' | 'fixed',
  defaultDiscountValue:    10,                     // 10% of €10
  defaultDiscountFromUnit: 2,                      // korting vanaf eenheid X

  // Installatie
  defaultInstallationCost: 250,                    // € ex BTW
  defaultInspectionCost:   250,                    // € ex BTW (keuring)

  // Bebat
  bebatPricePerKg:         0.50,                   // €/kg, altijd 21% BTW

  // Facturatie (toekomstig, alvast voorzien)
  defaultDepositType:      'percent',
  defaultDepositValue:     30,

  updatedAt:               Timestamp,
  updatedBy:               string                  // email
}
```

### 2.2 `productCategories/{id}` collectie

Dynamische categorieën met CRUD. Eén categorie is gemarkeerd als default (vangnet bij verwijderen).

```
productCategories/{id} {
  name:       'Batterijen',
  slug:       'batterijen',           // URL-safe identifier
  isDefault:  false,                  // max 1 is default
  sortOrder:  0,                      // voor weergavevolgorde
  createdAt:  Timestamp,
  updatedAt:  Timestamp
}
```

**Vooraf aangemaakt:**

| Naam | slug | isDefault |
|------|------|-----------|
| Batterijen | batterijen | false |
| Omvormers | omvormers | false |
| Materiaal | materiaal | **true** |

**Delete-cascade:** bij verwijderen van een categorie verhuizen alle producten met die `categoryId` naar de default-categorie.

### 2.3 `products/{id}` collectie

```
products/{id} {
  // Basis
  categoryId:      string,              // ref naar productCategories/{id}
  brand:           string,              // uit dropdown of handmatig
  model:           string,
  description:     string,              // vrije omschrijving

  // Prijzen
  purchasePrice:   number,              // aankoopprijs ex BTW
  marginType:      'percent' | 'fixed', // overgenomen uit settings bij creatie
  marginValue:     number,              // 30 (%) of 300 (€)
  discountType:    'percent' | 'fixed',
  discountValue:   number,              // korting op verkoopprijs
  discountFromUnit: number,             // default 2

  // Technische specs — benoemde velden (getypt, berekenbaar)
  specs: {
    // === Batterij-specifiek ===
    capacityKwh:         number | null,  // nuttige opslagcapaciteit
    nominalVoltage:      number | null,  // V DC
    chemistry:           string | null,  // 'LiFePO4', 'NMC', 'LTO', ...
    cycleLife:           number | null,  // aantal cycli bij X% DoD
    maxChargePowerW:     number | null,  // max laadvermogen (W)
    maxDischargePowerW:  number | null,  // max ontlaadvermogen (W)
    depthOfDischarge:    number | null,  // % (bv. 90)
    selfHeating:         boolean | null, // vorstbescherming

    // === Omvormer-specifiek ===
    inverterPowerKw:     number | null,  // nominaal AC-vermogen
    peakPowerKw:         number | null,  // piekvermogen (bv. 10s)
    maxAcInputKw:        number | null,  // max AC input
    maxPvInputKw:        number | null,  // max PV input (indien hybride)
    mpptCount:           number | null,  // aantal MPPT-trackers
    phases:              number | null,  // 1 of 3

    // === Gedeeld ===
    efficiency:          number | null,  // % (bv. 93)
    weightKg:            number | null,  // voor Bebat + transport
    heightMm:            number | null,  // afmetingen
    widthMm:             number | null,
    depthMm:             number | null,
    ipRating:            string | null,  // 'IP65', 'IP55', ...
    operatingTempMin:    number | null,  // °C
    operatingTempMax:    number | null,  // °C
    connectivity:        string | null,  // 'WiFi, RS485', 'WiFi 4, Bluetooth 5.0'
    warrantyYears:       number | null,  // garantie in jaren
    mountType:           string | null,  // 'wall', 'floor', 'rack'
    noiseLevel:          number | null,  // dB

    // === Vrije extra specs ===
    custom: {                            // key/value map voor niet-voorgedefinieerde specs
      [key: string]: string | number
    }
  },

  // Status
  isActive:        boolean,             // soft deactivatie
  sortOrder:       number,              // voor weergavevolgorde
  createdAt:       Timestamp,
  updatedAt:       Timestamp,
  createdBy:       string,              // email
  updatedBy:       string
}
```

**Spec-velden zichtbaarheid per categorie:**

| Veld | Batterijen | Omvormers | Materiaal |
|------|-----------|-----------|-----------|
| capacityKwh | x | | |
| nominalVoltage | x | | |
| chemistry | x | | |
| cycleLife | x | | |
| maxChargePowerW | x | | |
| maxDischargePowerW | x | | |
| depthOfDischarge | x | | |
| selfHeating | x | | |
| inverterPowerKw | | x | |
| peakPowerKw | | x | |
| maxAcInputKw | | x | |
| maxPvInputKw | | x | |
| mpptCount | | x | |
| phases | | x | |
| efficiency | x | x | |
| weightKg | x | x | x |
| heightMm | x | x | x |
| widthMm | x | x | x |
| depthMm | x | x | x |
| ipRating | x | x | |
| operatingTempMin | x | x | |
| operatingTempMax | x | x | |
| connectivity | x | x | |
| warrantyYears | x | x | |
| mountType | x | x | |
| noiseLevel | x | x | |
| custom | x | x | x |

Nieuwe categorieën tonen standaard enkel de gedeelde velden + custom map. De mapping wordt in JS beheerd (geen Firestore-schema per categorie nodig in deze fase).

### 2.4 Subcollecties onder `products/{id}/`

**`products/{id}/photos/{photoId}`**
```
{
  storagePath:      string,    // 'products/{id}/{ts}_{name}'
  thumbStoragePath: string,    // 'products/{id}/{ts}_{name}_thumb.jpg'
  width:            number,
  height:           number,
  uploadedAt:       Timestamp,
  uploadedBy:       string
}
```

**`products/{id}/datasheets/{dsId}`**
```
{
  storagePath:   string,       // 'products/{id}/datasheets/{ts}_{filename}'
  filename:      string,       // originele bestandsnaam
  sizeBytes:     number,
  contentType:   string,       // 'application/pdf'
  uploadedAt:    Timestamp,
  uploadedBy:    string
}
```

### 2.5 Berekende waarden (client-side JS, niet opgeslagen)

```javascript
// Verkoopprijs per eenheid
function sellPrice(product) {
  if (product.marginType === 'percent') {
    return product.purchasePrice * (1 + product.marginValue / 100);
  }
  return product.purchasePrice + product.marginValue;
}

// Eenheidsprijs voor eenheid n (1-based)
function unitPrice(product, n) {
  const base = sellPrice(product);
  if (n < product.discountFromUnit) return base;
  if (product.discountType === 'percent') {
    return base * (1 - product.discountValue / 100);
  }
  return base - product.discountValue;
}

// Totaalprijs voor qty eenheden
function totalProductPrice(product, qty) {
  let total = 0;
  for (let i = 1; i <= qty; i++) {
    total += unitPrice(product, i);
  }
  return total;
}

// Bebat-bijdrage (altijd 21% BTW)
function bebatContribution(product, qty, bebatPricePerKg) {
  const weight = product.specs.weightKg || 0;
  return qty * weight * bebatPricePerKg * 1.21;
}
```

---

## 3. Merk-dropdown

Vooraf ingevulde merken voor de brand-dropdown, gebaseerd op de Belgische/Nederlandse markt 2025-2026. Gegroepeerd in de dropdown met optgroups.

### Plug & Play merken

| Merk | Notitie |
|------|---------|
| Marstek | Venus E V3, Venus D — populairste plug-in in BE |
| Zendure | SolarFlow 2400 AC / AC+ — SmartPeak hoofdproduct |
| Growatt | Noah 2000 (plug-in) + APX HV (installatie) |
| EcoFlow | STREAM, Delta Pro Ultra |
| Anker Solix | Solarbank 3 Pro, X1 |
| Hoymiles | MS-A2 |
| Sunpura | S2400 — budget instapmodel |
| Bluetti | EP760/800 |

### Installatie merken

| Merk | Notitie |
|------|---------|
| Huawei | Luna 2000 — meest geinstalleerd in BE |
| BYD | Battery-Box HVS/HVM |
| Dyness | Tower T10/T21, DL5.0C |
| Sigenergy | SigenStor — modulair tot 48.9 kWh |
| Enphase | IQ Battery — premium |
| Tesla | Powerwall 2/3 — premium |
| Sonnen | sonnenBatterie 10 — premium DE |
| LG | RESU — gevestigd merk |
| Solarwatt | Battery flex — DE |
| Pylontech | Force L1/L2 — breed compatibel |
| Alpha ESS | SMILE — smart scheduling |
| SAJ | H2 — middenklasse |
| Sungrow | SBR — middenklasse |
| Sessy | NL-merk, smart grid focus |

### Altijd beschikbaar

| Optie | Gedrag |
|-------|--------|
| **Andere** | Toont een vrij tekstveld voor handmatige invoer |

---

## 4. UI: producten-beheer pagina

### 4.1 Pagina-structuur

**Bestand:** `producten-beheer.html` (nieuw, auth-gated)

Volgt het bestaande backoffice-patroon:
- Bootstrap 5.3.3 + Font Awesome 6.5.2 + `smartpeak.css`
- Firebase compat SDK + `firebase-init.js`
- 3-state auth flow (`stateLoggedOut` / `stateNotWhitelisted` / `stateAuthorized`)
- Sticky navbar met SmartPeak branding + navigatie

**Navigatie:** link in `dashboard.html` navbar (bv. `fa-boxes-stacked` icoon + "Producten") en breadcrumb terug naar dashboard.

### 4.2 Instellingen-kaart (bovenaan)

Inklapbare `.card` "Instellingen" boven de productlijst. Default ingeklapt (localStorage voorkeur).

**Velden:**

| Groep | Veld | Input type | Default |
|-------|------|-----------|---------|
| Prijsberekening | Default winstmarge | Toggle %/vast + number | 30% |
| | Default korting | Toggle %/vast + number | 10% |
| | Korting vanaf eenheid | number | 2 |
| Installatie | Standaard installatiekost | number (€ ex BTW) | 250 |
| | Standaard keuringskost | number (€ ex BTW) | 250 |
| Bebat | Prijs per kg | number (€) | — |
| | BTW Bebat | readonly "21%" | 21% |
| Facturatie | Voorschot | Toggle %/vast + number | 30% |

**Gedrag:**
- Opslaan schrijft naar `config/settings`
- Wijzigingen hebben geen retroactief effect op bestaande producten
- Toast feedback bij opslaan

### 4.3 Categorie-beheer

Tandwiel-icoon (`fa-gear`) naast de categorie-tabs → opent Bootstrap modal.

**Modal inhoud:**
- Lijst van categorieën met naam-input + drag-handle voor volgorde
- Default-markering (radio, niet verwijderbaar)
- "Toevoegen" knop onderaan
- Verwijderen: confirm-dialog met melding "X producten verhuizen naar [default]"
- Opslaan: batch-write naar `productCategories`

### 4.4 Productlijst (linkerkolom)

**Layout:**
- Op desktop (`>= lg`): ~40% breedte links, ~60% detail rechts
- Op mobile (`< lg`): volle breedte, detail opent als offcanvas-drawer

**Elementen:**
- **Categorie-tabs**: horizontaal scrollbaar, dynamisch uit `productCategories` + "Alle" tab
- **Zoekbalk**: filtert op merk + model + omschrijving (client-side)
- **`+ Nieuw product` knop**: opent detail-paneel in create-mode
- **Productkaarten**: thumbnail (eerste foto of placeholder), merk + model, verkoopprijs (berekend), actief/inactief badge
- **Sortering**: `sortOrder` dan `brand + model` alfabetisch
- **Inactieve producten**: grijze kaart, default verborgen, toggle "Toon inactieve" om ze te zien

### 4.5 Detail-/bewerkpaneel (rechterkolom)

Twee modes: **bekijken** (readonly samenvatting) en **bewerken** (formulier). Toggle via `fa-pen-to-square` knop.

**Blok A — Basis:**
- Categorie (dropdown uit `productCategories`)
- Merk (dropdown met optgroups + "Andere" → vrij tekstveld)
- Model (tekst)
- Omschrijving (textarea)

**Blok B — Prijzen:**
- Aankoopprijs ex BTW (number, required)
- Winstmarge: toggle-button `%` / `€` + number input (default uit settings)
- → Berekende verkoopprijs tonen (readonly, live preview)
- Korting: toggle-button `%` / `€` + number input (default uit settings)
- Korting vanaf eenheid (number, default uit settings)
- → Berekende prijs 2e eenheid tonen (readonly, live preview)

**Blok C — Specs:**
- Dynamisch: velden tonen/verbergen op basis van geselecteerde categorie
- Zie spec-velden tabel in sectie 2.3
- Custom specs: key/value lijst met `+ Toevoegen` knop

**Blok D — Media:**
- **Foto's**: hergebruik `photo-uploader.js` component (zonder tag-modal — geen situatie/serial onderscheid bij producten)
- **Datasheets**: upload-zone voor PDF's (max 10 MB), lijst met filename + download + delete

**Acties (sticky footer of bovenaan paneel):**
- **Opslaan** — create of update
- **Deactiveren / Heractiveren** — toggle `isActive`
- **Verwijderen** — hard delete met confirm. Geblokkeerd als product in een combinatie zit (toekomstig; in fase 1 altijd toegestaan). Cascade: verwijdert foto's + datasheets uit Storage + subcollecties.

---

## 5. Firestore security rules

Toevoegen aan bestaande `firestore.rules`:

```javascript
// ─── Product categories ────────────────────────────────────
match /productCategories/{catId} {
  allow read:   if isWhitelisted();
  allow write:  if isWhitelisted();
}

// ─── Products ──────────────────────────────────────────────
match /products/{productId} {
  allow read:   if isWhitelisted();
  allow write:  if isWhitelisted();

  match /photos/{photoId} {
    allow read:   if isWhitelisted();
    allow write:  if isWhitelisted();
  }
  match /datasheets/{dsId} {
    allow read:   if isWhitelisted();
    allow write:  if isWhitelisted();
  }
}

// ─── Config/settings (VERVANGT bestaande config match) ─────
// De bestaande regel is `allow write: if false` voor alle config docs.
// Die wordt vervangen door onderstaande, die 'settings' schrijfbaar maakt
// voor whitelisted users terwijl 'products' en overige docs read-only blijven.
match /config/{docId} {
  allow read:  if docId == 'products' || isWhitelisted();
  allow write: if docId == 'settings' && isWhitelisted();
}
```

**Storage rules** — toevoegen aan bestaande `storage.rules`:

```javascript
match /products/{productId}/{allPaths=**} {
  allow read:   if request.auth != null;
  allow write:  if request.auth != null
                && request.auth.token.email in ['kevin@bloxit.be', 'ledsrepair@gmail.com'];
}
```

**Noot:** Storage rules gebruiken `request.auth.token.email` i.p.v. de Firestore
`isWhitelisted()` custom function — Storage rules hebben een eigen syntax.
Het email-whitelist moet consistent gehouden worden met `firestore.rules`.

---

## 6. Firebase-init.js uitbreidingen

Nieuwe helpers toe te voegen aan `assets/js/firebase-init.js`:

### Settings CRUD
```
getSettings()                              → config/settings doc
saveSettings(data)                         → merge-write config/settings
```

### Category CRUD
```
listProductCategories()                    → alle categorieën, sorted by sortOrder
createProductCategory(data)                → nieuw doc
updateProductCategory(id, data)            → update
deleteProductCategory(id)                  → cascade producten naar default + delete
getDefaultCategory()                       → de categorie met isDefault: true
```

### Product CRUD
```
listProducts(filters?)                     → query met optionele categoryId, isActive filter
getProduct(id)                             → enkel doc
createProduct(data)                        → nieuw doc, defaults uit settings
updateProduct(id, data)                    → update
deleteProduct(id)                          → hard delete + cascade photos/datasheets/storage
toggleProductActive(id, isActive)          → update isActive
```

### Product media
```
uploadProductPhoto(productId, file)        → Storage upload + Firestore photo doc + thumb
deleteProductPhoto(productId, photoId)     → Storage delete + Firestore delete
listProductPhotos(productId)               → subcollection query
uploadProductDatasheet(productId, file)    → Storage upload + Firestore doc
deleteProductDatasheet(productId, dsId)    → Storage delete + Firestore delete
listProductDatasheets(productId)           → subcollection query
```

### Prijsberekening helpers (pure functions)
```
sellPrice(product)                         → aankoopprijs + marge
unitPrice(product, unitNumber)             → prijs voor eenheid N
totalProductPrice(product, qty)            → som van alle eenheden
bebatContribution(product, qty, pricePerKg) → Bebat incl. 21% BTW
```

---

## 7. Agile feature-opkapping

### Feature 1: Instellingen + categorieën (gedetailleerd)

**Scope:**
- `config/settings` document schema + CRUD helpers
- `productCategories` collectie + CRUD helpers (incl. delete-cascade)
- Firestore security rules voor `config/settings` (write) en `productCategories`
- UI: `producten-beheer.html` boilerplate (auth, navbar, 3-state)
- UI: instellingen-kaart met alle velden + opslaan
- UI: categorie-tabs (lezen) + categorie-modal (CRUD)
- **Unit tests** (in `e2e/tests/` of apart `tests/` dir, draait zonder browser):
  - `sellPrice()` met marginType `percent` (bv. 1000 × 1.30 = 1300)
  - `sellPrice()` met marginType `fixed` (bv. 1000 + 300 = 1300)
  - `unitPrice()` met korting `percent` — eenheid 1 = geen korting, eenheid 2+ = korting
  - `unitPrice()` met korting `fixed` — eenheid 1 = geen korting, eenheid 2+ = korting
  - `unitPrice()` met custom `discountFromUnit` (bv. 3 → korting pas vanaf 3e)
  - `totalProductPrice()` voor qty=1, qty=2, qty=5 (mix van vol + korting)
  - `bebatContribution()` met gewicht en prijs per kg, controle 21% BTW
  - `bebatContribution()` met gewicht 0 of null → 0
  - Edge cases: marginValue=0, discountValue=0, qty=0

- **E2E tests** (Playwright):
  - **Instellingen:**
    - Navigeer naar producten-beheer.html, login
    - Open instellingen-kaart, vul alle velden in, klik opslaan → toast "Opgeslagen"
    - Herlaad pagina → waarden zijn behouden (Firestore persistentie)
    - Wijzig marge van % naar vast bedrag → toggle werkt correct
  - **Categorieën:**
    - Open categorie-modal, maak nieuwe categorie "Accessoires" aan → verschijnt als tab
    - Hernoem categorie → tab-label wijzigt
    - Verwijder categorie die producten bevat → confirm-dialog toont aantal, producten verhuizen naar default
    - Probeer default-categorie te verwijderen → geblokkeerd
    - Wijzig volgorde → tabs herschikken na opslaan

**Branch:** `feat/product-settings`

### Feature 2: Product CRUD basis (gedetailleerd)

**Scope:**
- `products` collectie + CRUD helpers
- Firestore security rules voor `products`
- UI: productlijst met categorie-filtering en zoeken
- UI: detail-paneel met Blok A (basis) + Blok B (prijzen) in bewerk-mode
- Defaults uit settings voorvullen bij nieuw product
- Live preview verkoopprijs + korting-prijs
- Deactiveren/heractiveren + verwijderen (hard delete)
- Merk-dropdown met vooraf ingevulde merken + "Andere"

- **Unit tests:**
  - Product validatie: verplichte velden (categoryId, brand, model, purchasePrice) → error bij ontbreken
  - Default-invulling: nieuw product krijgt marge/korting/kortingVanafEenheid uit settings
  - Product CRUD helpers: createProduct retourneert ID, getProduct haalt correct doc op, updateProduct merged correct, deleteProduct verwijdert doc

- **E2E tests** (Playwright):
  - **Product aanmaken:**
    - Klik "+ Nieuw product" → detail-paneel opent in create-mode
    - Controleer dat marge/korting/kortingVanafEenheid vooraf ingevuld zijn uit settings
    - Vul basis-velden in (categorie: Batterijen, merk: Marstek, model: Test V1, aankoopprijs: 1000)
    - Controleer live preview: verkoopprijs toont €1300 (bij 30% marge)
    - Klik opslaan → toast, product verschijnt in lijst
  - **Product bewerken:**
    - Klik op product in lijst → detail-paneel toont readonly view
    - Klik edit-knop → formulier verschijnt met bestaande waarden
    - Wijzig aankoopprijs → live preview update
    - Opslaan → toast, lijst toont bijgewerkte verkoopprijs
  - **Merk-dropdown:**
    - Open merk-dropdown → optgroups "Plug & Play" en "Installatie" zichtbaar
    - Selecteer "Andere" → vrij tekstveld verschijnt
    - Typ merk in → opslaan behoudt handmatig merk
  - **Korting toggle:**
    - Stel korting in op 10% → prijs 2e eenheid toont €1170
    - Toggle naar vast bedrag €200 → prijs 2e eenheid toont €1100
  - **Filteren:**
    - Klik categorie-tab "Batterijen" → enkel batterijen zichtbaar
    - Klik "Alle" → alle producten zichtbaar
    - Typ in zoekbalk → lijst filtert op merk/model/omschrijving
  - **Deactiveren:**
    - Klik deactiveren op product → badge wordt "Inactief", product verdwijnt uit standaardlijst
    - Toggle "Toon inactieve" → product verschijnt (grijs)
    - Klik heractiveren → badge verdwijnt, product terug in standaardlijst
  - **Verwijderen:**
    - Klik verwijderen → confirm-dialog
    - Bevestig → product verdwijnt uit lijst, Firestore doc verwijderd
    - Annuleer → product blijft

**Branch:** `feat/product-crud`

### Feature 3: Spec-velden per categorie (high-level)

- Blok C in detail-paneel: benoemde spec-velden tonen/verbergen per categorie
- Custom specs key/value lijst
- Spec-data opslaan bij product create/update
- Spec-velden in readonly-view tonen
- **Unit tests:** spec-veld mapping per categorie (juiste velden zichtbaar), custom specs CRUD
- **E2E tests:** spec-velden invullen bij product, categorie wisselen → velden tonen/verbergen, custom spec toevoegen/verwijderen, opslaan + herladen → waarden behouden

**Branch:** `feat/product-specs`

### Feature 4: Product media — foto's + datasheets (high-level)

- Blok D in detail-paneel
- Foto-upload via `photo-uploader.js` (hergebruik, zonder tag-modal)
- Datasheet PDF upload/download/delete
- Firebase Storage onder `products/{id}/...`
- Subcollecties `photos` en `datasheets`
- **Unit tests:** file validatie (type, grootte), Storage path-generatie
- **E2E tests:** foto uploaden → thumbnail in grid, foto verwijderen → verdwijnt, datasheet PDF uploaden → in lijst met download-link, datasheet verwijderen, product verwijderen → cascade (alle media mee verwijderd)

**Branch:** `feat/product-media`

### Werkwijze per feature

1. Feature branch aanmaken vanuit `gh-pages`
2. Implementatie + unit tests + E2E tests
3. Alle tests groen
4. PR aanmaken
5. **Expliciete goedkeuring van Kevin** afwachten
6. Pas na go: merge naar `gh-pages`

---

## 8. Navigatie-integratie

- **Dashboard navbar**: nieuw item `fa-boxes-stacked` "Producten" → `producten-beheer.html`
- **Producten-beheer navbar**: `fa-arrow-left` "Dashboard" terug naar `dashboard.html`
- De bestaande `producten.html` (publieke specs-pagina) blijft ongewijzigd en onafhankelijk

---

## 9. Niet-functionele vereisten

- **Responsive**: mobile-first, offcanvas-drawer voor detail op `< lg`
- **Taal**: alle UI-tekst in Nederlands (`nl-BE`)
- **Performance**: productlijst client-side gefilterd (verwacht < 100 producten)
- **Beveiliging**: auth-gated, enkel whitelisted emails
- **Geen build step**: puur HTML/JS/CSS, CDN-dependencies
- **Browser support**: moderne browsers (Chrome, Firefox, Safari, Edge — laatste 2 versies)
