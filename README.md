# SmartPeak — Batterij ROI Calculator

Interne tool voor SmartPeak om de terugverdientijd van thuisbatterijen te berekenen op basis van Fluvius CSV-data. UI en copy zijn in het Nederlands (nl-BE).

## Wat doet het?

1. Upload een Fluvius CSV-export (kwartierwaarden afname/injectie)
2. Kies een of meerdere batterijconfiguraties uit het productassortiment (Google Sheet)
3. De calculator toont per configuratie twee scenario's (**Worst Case** en **Optimistisch**) met jaarlijkse besparing, terugverdientijd, en capaciteitsanalyse
4. Resultaten kunnen gedeeld worden via een publieke link of opgeslagen als project in Firestore

## Pagina's

| Pagina | Doel |
|---|---|
| `dashboard.html` | Login-gated werkruimte (lijst + kanban-bord) voor projectbeheer + leads |
| `project-edit.html` | Project aanmaken/bewerken: klantgegevens, technische opmeting, foto's |
| `index.html` | De calculator zelf (project-mode via `?project=<id>`, share-links via `?s=<id>`) |
| `producten.html` | Productspecificaties per batterijtype |

## Leads

Inkomende leads worden publiek aangemaakt (bijv. via een extern formulier) en
verschijnen onderaan het dashboard in een aparte leads-tabel. Elke lead bevat
klantgegevens, eventueel CSV-data, omvormer-kW, tarief en BTW-percentage.

Vanuit het dashboard kan een lead met één klik omgezet worden naar een project:
de klantdata wordt overgenomen, een nieuw project wordt aangemaakt, en de lead
krijgt status `converted`. Geconverteerde leads verdwijnen automatisch uit de
lijst.

Op desktop neemt de projectenlijst ~2/3 van het scherm en de leads ~1/3 onderaan;
op mobiel staan ze gestapeld.

## Tech stack

- Vanilla JS (ES modules), geen build step, geen bundler
- Firebase (Firestore + Storage + Auth) via compat SDK 10.13.2 (CDN)
- Bootstrap 5.3.3 (backoffice), Font Awesome 6.5.2
- Chart.js (lazy-loaded voor energiegrafiek)
- GitHub Pages deployment (push naar `gh-pages`)

## Lokaal draaien

```bash
python3 -m http.server 8000
# of: npx serve .
```

Ga naar `http://localhost:8000`. Firebase auth is vereist voor dashboard/project-edit; share-links (`?s=<id>`) werken zonder login.

## Tests

```bash
# Unit tests (Vitest)
npx vitest run

# E2E tests (Playwright + Firebase Admin)
# Vereist: e2e/service-account-key.json + lokale server op poort 8000
npx playwright test --config=e2e/playwright.config.js
```

## Firestore rules deployen

`firebase deploy --only firestore:rules` (CLI v15) deployt **niet** naar de
named database (`smartpeak-battery-roi-be`). Gebruik in plaats daarvan:

```bash
node e2e/deploy-rules-default.cjs
```

Dit deployt `firestore.rules` naar zowel de default als named database release
via de REST API.

## Bestandsstructuur

```
index.html                  # Calculator
dashboard.html              # Projectoverzicht (lijst + kanban)
project-edit.html           # Project aanmaken/bewerken
producten.html              # Productspecs
assets/
  js/
    calc-engine.js          # Pure rekenlogica (ES module, testbaar)
    csv.js                  # CSV parsing helpers
    firebase-init.js        # Firebase init, auth, Firestore CRUD
    shared-helpers.js       # UI utilities (spinner, toast, escapeHtml)
    offertes-ui.js          # Offerte PDF upload/download UI
    photo-uploader.js       # Foto-upload component (drag-drop, lightbox)
  css/
    smartpeak.css            # Backoffice styling (Bootstrap overrides)
tests/                      # Vitest unit tests
e2e/                        # Playwright E2E tests
  deploy-rules-default.cjs  # Firestore rules deployer (REST API)
docs/                       # Design specs en implementatieplannen
```

## Deploy

Push naar `gh-pages`. GitHub Pages serveert de bestanden as-is; ~1 min voor CDN refresh.

```bash
git push origin gh-pages
```
