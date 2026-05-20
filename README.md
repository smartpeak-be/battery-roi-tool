# SmartPeak — Batterij ROI Calculator

Interne tool voor SmartPeak om de terugverdientijd van thuisbatterijen te berekenen op basis van Fluvius CSV-data. UI en copy zijn in het Nederlands (nl-BE).

## Wat doet het?

1. Upload een Fluvius CSV-export (kwartierwaarden afname/injectie)
2. Kies een of meerdere batterijconfiguraties uit het productassortiment (Google Sheet)
3. De calculator toont per configuratie twee scenario's (**Worst Case** en **Realistisch**) met jaarlijkse besparing, terugverdientijd, en capaciteitsanalyse
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

## Firebase security hardening

Deze site draait volledig statisch op GitHub Pages. Alles in de browser
(`assets/js/firebase-init.js`, inclusief de Firebase `apiKey`) is publiek
zichtbaar. De web `apiKey` is geen secret; beveiliging moet gebeuren via
Firestore/Storage rules, Google Auth, domeinrestricties en abuse-limieten.

Aanbevolen Firebase/Google Cloud instellingen:

1. Beperk de **Browser key** in Google Cloud Console met HTTP referrers:
   `https://smartpeak-be.github.io/battery-roi-tool/*`, eventuele preview-
   domeinen die bewust gebruikt worden, en lokale development origins alleen
   indien nodig.
2. Beperk de key tot de Firebase APIs die deze app nodig heeft
   (Identity Toolkit/Firebase Auth, Firestore, Storage en Firebase Installations
   wanneer App Check actief is).
3. Houd Firebase Auth authorized domains minimaal: `smartpeak-be.github.io` en
   expliciete test/preview-domeinen. Verwijder ongebruikte domeinen.
4. Schakel **Firebase App Check** voor Web in (bijv. reCAPTCHA Enterprise) en
   start in monitor-mode. Enforce daarna minstens Firestore en Storage zodra de
   legitieme clients stabiel groen zijn.
5. Publieke writes blijven beperkt tot de lead-flow:
   - `/leads` create is in rules gevalideerd op shape, types, status en TTL.
   - `/mail` create accepteert alleen vaste lead-result/contact mailvormen met
     deterministische document-ID per lead/type.
   - share-links en nieuwe lead-result links hebben een expiry timestamp.
6. Voor echte rate limiting/CAPTCHA op lead-submit is een backendlaag nodig
   (Cloud Function/Callable of eigen endpoint). De huidige rules beperken shape
   en misbruikimpact, maar kunnen geen IP-based quotas afdwingen.
7. GitHub Pages publiceert via Jekyll met `_config.yml`; dev-bestanden zoals
   `docs/`, `e2e/`, `scripts/`, Firebase rules en package metadata worden niet
   mee gepubliceerd.

## Firestore rules deployen

Gebruik het project-specifieke deployscript zodat Firestore én Storage rules naar
`smartpeak-projects` gaan:

```bash
node scripts/deploy-rules-smartpeak-projects.cjs
```

Het script vereist `scripts/sa-dest.json` lokaal. Dat bestand is gitignored en
mag nooit gecommit worden.

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
