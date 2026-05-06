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
| `dashboard.html` | Login-gated werkruimte (lijst + kanban-bord) voor projectbeheer |
| `project-edit.html` | Project aanmaken/bewerken: klantgegevens, technische opmeting, foto's |
| `index.html` | De calculator zelf (project-mode via `?project=<id>`, share-links via `?s=<id>`) |
| `producten.html` | Productspecificaties per batterijtype |

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
npx playwright test --config=e2e/playwright.config.js
```

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
docs/                       # Design specs en implementatieplannen
```

## Deploy

Push naar `gh-pages`. GitHub Pages serveert de bestanden as-is; ~1 min voor CDN refresh.

```bash
git push origin gh-pages
```
