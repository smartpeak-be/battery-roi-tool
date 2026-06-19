# AmaAi SmartPeak onboarding — battery-roi-tool

Laatste contextscan: 2026-05-22
Repo: `smartpeak-be/battery-roi-tool`
Lokaal pad: `/root/repos/battery-roi-tool`
Default branch: `gh-pages`

## Wat deze repo is

Deze repo is de belangrijkste operationele SmartPeak-tool. De naam klinkt als een eenvoudige batterij-ROI-calculator, maar de applicatie is intussen een lichte backoffice voor thuisbatterij-installaties:

- ROI-berekening op basis van Fluvius CSV-verbruiksdata.
- Projecten en klanten opvolgen.
- Leads ontvangen en omzetten naar projecten.
- Offertes per batterijconfiguratie beheren.
- Producten, categorieën, configuraties en prijzen beheren.
- Foto’s, serienummers en OCR-flow bijhouden.
- Statusflow/kanban voor commerciële en installatie-opvolging.

De UI en copy zijn Nederlandstalig (`nl-BE`). De oude `README.md` is niet de echte bron van waarheid; `CLAUDE.md`, specs onder `docs/superpowers/specs/` en de code zijn belangrijker.

## Deployment en stack

- Static HTML/CSS/JS, zonder build-step voor de hoofdapp.
- Publicatie: push naar `gh-pages`; GitHub Pages serveert de bestanden as-is.
- Netlify-config bestaat alleen voor static deploy previews: `netlify.toml` met publish `.` en lege command.
- Firebase project: `smartpeak-projects`.
- Firebase SDK compat 10.13.2 via CDN.
- Firestore, Storage en Functions worden gebruikt.
- Cloud Functions runtime: Node.js 20, source `functions/`.
- Tests:
  - Unit/component: Vitest via `npm test`.
  - E2E: Playwright via `npm run test:e2e` of `npx playwright test --config=e2e/playwright.config.js`.
  - E2E vereist `e2e/service-account-key.json` en een lokale server op poort 8000.

Belangrijke commando’s:

```bash
cd /root/repos/battery-roi-tool
python3 -m http.server 8000
npm test
npm run lint
npm run test:e2e
firebase deploy --only firestore:rules
node scripts/deploy-rules-smartpeak-projects.cjs
cd functions && npm install && firebase deploy --only functions:ocrSerial
```

## Belangrijkste pagina’s

- `dashboard.html`
  - Login-gated workspace voor Kevin en Ruben.
  - Projectlijst, zoek/filter, statuschips, lijst/kanban-toggle.
  - Leads-sectie onderaan.
  - Projectdrawer rechts met klantcontact, offertes, foto’s, opmerkingen en acties.

- `project-edit.html`
  - Nieuw project of bestaand project bewerken.
  - Vier hoofdblokken: berekening, klant/situatie, technische opmeting, foto’s/serienummers.
  - Sticky actionbar met “Opslaan” en “Opslaan & Bereken”.

- `index.html`
  - Calculator.
  - Bare URL redirect naar dashboard.
  - `?project=<id>` voor projectmodus.
  - `?s=<id>` voor huidige publieke share-link uit Firestore `shares`.
  - `?data=<b64>` voor legacy share-links.

- `lead.html`
  - Publieke lead-wizard / batterij-analyse.

- `lead-result.html`
  - Publieke resultaatpagina voor lead-analyse.

- `producten-beheer.html` / `producten.html`
  - Beheer van producten, categorieën, productconfiguraties, prijzen en specs.

## Belangrijkste JS-modules

- `assets/js/firebase-init.js`
  - Firebase init, auth, whitelist, Firestore/Storage helpers.
  - Project CRUD, lead CRUD, share-links, comments, photos, offertes, products, categories, product configs, settings.
  - Belangrijke helpers: `mergeProjectMetadata`, `effectiveBtwFor`, `totalInverterPowerKw`, `getProjectLabel`, `saveLastCalcRun`, `createShare`, `convertLeadToProject`.

- `assets/js/calc-engine.js`
  - Pure berekeningslogica.
  - Wordt gebruikt voor calculator en lead precompute/testen.

- `assets/js/csv.js`
  - Fluvius CSV parsing en validatie.
  - Semicolon-separated, datum `dd-mm-yyyy`, decimalen met komma.

- `assets/js/pages/dashboard-app.js`
  - Dashboard UI, projectlijst, kanban, leads, drawer en acties.

- `assets/js/pages/project-edit-app.js`
  - Projectformulier, validatie, save-flow, technische velden.

- `assets/js/pages/index-app.js`
  - Calculator page orchestration rond project/share/legacy modes.

- `assets/js/pages/lead-app.js`
  - Lead-wizard.

- `assets/js/pages/lead-result-app.js`
  - Lead-resultaatpagina.

- `assets/js/offertes-ui.js`
  - Gedeelde offerte-PDF UI voor dashboard drawer en project-edit.

- `assets/js/photo-uploader.js`
  - Gedeelde foto-uploader, thumbnails, tagging, annotation/lightbox, serial-tagging.

- `assets/js/product-configs.js`, `product-pricing.js`, `product-specs.js`
  - Product/config/offerte prijsberekening, specs en winstlogica.

- `functions/index.js`
  - Cloud Function `ocrSerial` voor serienummer-OCR via Google Cloud Vision.

## AmaAi project-agent toegang

AmaAi kan de SmartPeak Firestore benaderen via een lokaal service account en intern script:

- Service account: `/root/.secrets/smartpeak-projects-service-account.json`
- Script: `/root/.hermes/scripts/smartpeak-project-agent.mjs`
- Firebase project: `smartpeak-projects`

Beschikbare commando’s:

```bash
/root/.hermes/scripts/smartpeak-project-agent.mjs list-recent --limit 10
/root/.hermes/scripts/smartpeak-project-agent.mjs search "David" --limit 5
/root/.hermes/scripts/smartpeak-project-agent.mjs show <projectId>
/root/.hermes/scripts/smartpeak-project-agent.mjs comments <projectId> --limit 20
/root/.hermes/scripts/smartpeak-project-agent.mjs add-comment <projectId> "tekst"
/root/.hermes/scripts/smartpeak-project-agent.mjs update-status <projectId> wachten_op_data --comment "..."
/root/.hermes/scripts/smartpeak-project-agent.mjs update-field <projectId> planning.visitPlannedDate '"2026-06-01"' --comment "..."
```

Telegram-werkwijze:

- Kevin kan projectinfo via Telegram doorgeven.
- AmaAi zoekt het project op klantnaam/e-mail/telefoon/adres/status.
- Bij één duidelijke match mag AmaAi comments toevoegen en expliciete status/planning/veld-updates uitvoeren.
- Bij meerdere matches vraagt AmaAi eerst welke.
- Projecten, offertes, foto’s en Storage-bestanden worden niet verwijderd via Telegram.
- Schrijfacties/comments van de project-agent gebruiken standaard auteur `Assistent Kevin` als herkenbaar auditspoor.

## Domeinmodel in Firestore

### Access

Whitelist is hardcoded in code en rules:

- `kevin@bloxit.be`
- `ledsrepair@gmail.com`

Firestore helper `isWhitelisted()` bepaalt private toegang.

### Collecties

- `projects/{projectId}`
  - Private read/write voor whitelisted users.
  - Hoofdobject voor klant/project/installatie-opvolging.
  - Subcollecties:
    - `comments/{commentId}`
    - `photos/{photoId}`

- `shares/{shareId}`
  - Publiek leesbaar tot `expiresAt`.
  - Create/delete alleen whitelisted.
  - Bevat snapshot payload voor klant-facing read-only calculatorlink.

- `leads/{leadId}`
  - Publiek create.
  - Publiek get per ID zolang niet deleted/expired.
  - List/update/delete door whitelisted users.
  - Statussen: `cold_lead`, `hot_lead`, `converted`.

- `mail/{mailId}`
  - Alleen create voor gevalideerde mail-envelopes.
  - Bedoeld voor Firebase email extension.
  - Kinds: `lead_result`, `lead_contact`.

- `config/products`
  - Publiek leesbaar omdat lead-wizard productconfig nodig heeft.

- `config/settings`
  - Whitelisted read/write.

- `productCategories/{catId}`
  - Whitelisted read/write.

- `productConfigs/{configId}`
  - Whitelisted read/write.

- `products/{productId}`
  - Whitelisted read/write.
  - Subcollecties:
    - `photos/{photoId}`
    - `datasheets/{dsId}`

### Project metadata

`newEmptyProjectMetadata()` definieert defaults voor:

- `customer`: adres, gestructureerd adres, telefoon, e-mail.
- `situation`, `notes`.
- `planning`: bezoek, installatie, keuring data.
- `site`: leeftijd woning, bepaalt BTW.
- `electrical`: aansluitingstype, zekering.
- `cabinet`: vrije modules, rem-automaat, wifi/stopcontact, plaats batterij, fase-aarde check.
- `solar.inverters[]`: per omvormer o.a. `powerKw`.
- `technical`: aardings-/spanningsmetingen en technische notities.
- `inspection`: keuringsbedrijf/ref/notities.
- `supplier`: leverancier/tarief/prijzen.
- `calcDefaults`: o.a. keuring-default.
- `serialNumbers[]`.
- `offertes`, `manualConfigs` via merge.

Altijd via `mergeProjectMetadata(project)` lezen zodat oude projecten veilig defaults krijgen.

BTW-regel:

- `site.houseAgeOver10Years === true` => 6%.
- `false`, `null` of ontbrekend => 21%.
- Legacy `calcDefaults.btw` wordt genegeerd.

Projectlabel:

- `projectName || customerName || '(zonder naam)'` via `getProjectLabel()`.

## Statusflow

`PROJECT_STATUSES` bevat o.a.:

- `nieuw_contact`
- `wachten_op_data`
- `klaar_voor_bezoek`
- `bezoek_gepland`
- `bezoek_gedaan`
- `klaar_voor_offerte`
- `offerte_uit`
- `wacht_op_beslissing`
- `akkoord`
- `installatie_gepland`
- `in_uitvoering`
- `klaar_voor_inplannen_keuring`
- `keuring_aangevraagd`
- `keuring_gepland`
- `keuring_gedaan`
- `facturatie`
- `afgesloten`
- `niet_akkoord`

Kanban-fasen:

- Nieuw
- Bezoek
- Offerte
- Uitvoering
- Afgesloten

`afgesloten` en `niet_akkoord` worden standaard uit dashboard gefilterd.

## Lead-flow

1. Publieke gebruiker vult lead-wizard in.
2. `createLead()` schrijft `leads` met status `cold_lead`, CSV dailyCompact, prijs/kW/BTW/notes/result.
3. Lead-result kan mail laten aanmaken in `mail` met subject `Je batterij-analyse is klaar — SmartPeak`.
4. Dashboard toont leads behalve `converted`.
5. `convertLeadToProject(lead, opts)`:
   - Maakt project met klantnaam, e-mail, CSV, omvormer-kW, supplier-prijs, BTW-afleiding.
   - Prependeert `[Lead-analyse] Beste config: ...` aan notes als result bestaat.
   - Zet `pendingConfigTypes` op beste config.
   - Kan `lastCalcRun` precomputed opslaan zodat calculator meteen resultaten toont.
   - Zet lead op `converted` met `projectId`.

## Berekeningsflow

- CSV wordt verwerkt naar per-dag verbruik/injectie.
- Rolling 365 dagen eindigend op laatste CSV-datum is canoniek.
- Bij minder dan 1 jaar wordt geëxtrapoleerd via `365 / daysInWindow` en UI toont waarschuwing.
- Bij meerdere jaren kan multi-year average worden weergegeven.
- Per config worden altijd twee scenario’s getoond:
  - Worst Case: cap op dagelijkse afname, besparing kan niet boven werkelijke netafname van die dag.
  - Realistisch: idealere bovengrens zonder cap.
- Capaciteitsanalyse zoekt grootste capaciteit met minstens 100 volledig geladen dagen/jaar.
- Resultaten worden via `saveLastCalcRun(projectId, saved)` op project opgeslagen met inputs/results.
- `csvUpload.dailyCompact` leeft op top-level projectdoc om duplicatie te vermijden.

## Share/save-state

- Huidige save/share versie in docs is v5/v6-achtig afhankelijk van featurepad; check `_serializeState` en `_applyLoadedState` bij wijzigingen.
- Belangrijk principe: wijzig je de serialized shape, bump de versie en behoud backward compatibility.
- `?s=<id>` gebruikt Firestore `shares` met TTL 180 dagen.
- `?data=<b64>` blijft legacy ondersteund.
- Read-only share-links verbergen bereken/config/share acties en maken inputs niet interactief.

## Offertes

- Offertes staan top-level op project: `offertes: { [configType]: { storagePath, filename, sizeBytes, contentType, uploadedAt, uploadedBy } }`.
- PDF-blobs in Storage: `projects/{id}/offertes/{configType}_{ts}.pdf`.
- Upload/vervang/delete via helpers in `firebase-init.js` en UI in `offertes-ui.js`.
- Verwijdering van config kan cascade doen naar offerte-PDF en Storage.
- Missing-offerte warning via `needsOfferteWarning(project)`.

## Foto’s, serienummers en OCR

- Foto’s in `projects/{id}/photos` + Storage onder `projects/{id}/...`.
- Client maakt thumbnail max 400px JPEG.
- Foto-tag: `situatie` of `serial`.
- Serial-tag kan categorie hebben: `batterij`, `omvormer`, `omvormer_batterij`.
- Cloud Function `ocrSerial` luistert op photo document writes.
- OCR via Google Cloud Vision EU endpoint.
- Resultaat wordt in `project.serialNumbers[]` gezet met `source: 'ocr'`, `category`, `photoId`, `ocrStatus`.
- Failed OCR kan via re-run knop opnieuw gestart worden door `ocrStatus: null` te schrijven.
- Retag serial -> situatie ruimt gekoppelde serial-entry/OCR velden op.

## Productbeheer en prijzen

- Productbeheer zit in Firestore collecties `productCategories`, `products`, `productConfigs` en `config/settings`.
- `product-configs.js` bevat prijs/winst/helpers:
  - subtotalen ex BTW
  - service products
  - batterijgewicht en Bebat
  - offertegroepen
  - kortingen en bedragen per BTW-groep
- Producten kunnen foto’s en datasheets hebben.
- Storage product assets onder `products/{productId}/...`.

## Security rules aandachtspunten

Firestore:

- `projects` private voor whitelist.
- `shares` public read tot expiry.
- `leads` public create/get, whitelisted list/update/delete.
- `mail` alleen create met strikte envelope-validatie.
- `config/products` public read.
- Productbeheer private.

Storage:

- `projects/{projectId}/**`: read/write enkel whitelist.
- `products/{productId}/**`: read voor elke authenticated user, write whitelist.

Let op: wijzig je whitelisted e-mails in code, pas ook Firestore/Storage rules aan.

## Teststrategie en werkwijze

Algemene afspraak met Kevin:

- Featurewerk gebeurt agile: eerst een high-level feature, daaronder issues in “Als `<rol/gebruiker>` wil ik dat `<gedrag/mogelijkheid>` zodat `<waarde/doel>`”-vorm.
- Elk issue heeft duidelijke acceptatiecriteria.
- Standaard mikken op 80% nuttige oplevering: eerst de kernwaarde, niet disproportioneel veel tijd verliezen op de laatste 20% als die niet cruciaal is.
- Codewerk start op een aparte branch.
- We werken test-driven waar zinvol: verwacht gedrag eerst vastleggen in tests, dan implementeren, daarna refactoren.
- Voorzie unit-tests én end-to-end tests voor alle verwachte gedrag dat door de wijziging geraakt wordt.
- Finaal maken we een PR zodat Netlify automatisch een preview-URL kan genereren.

Voor kleine pure logica:

```bash
npm test
```

Voor UI-flows:

```bash
python3 -m http.server 8000
npm run test:e2e
```

E2E vereist service-account-key buiten repo.

Bij featurewerk:

- Eerst relevante spec in `docs/superpowers/specs/` lezen.
- Zoek bestaande unit/e2e test voor gelijkaardige flow.
- Voeg of pas tests aan vóór of samen met de implementatie.
- Verifieer minstens met unit/lint; E2E wanneer flow UI/Firebase raakt.
- Push branch en open PR voor Netlify-preview.

## Belangrijke valkuilen

- `README.md` is niet betrouwbaar als productcontext; gebruik `CLAUDE.md` en specs.
- Geen app-logica toevoegen aan oude/dead `style.css` of `script.js`.
- Geen build-step introduceren zonder duidelijke reden; app is static-first.
- Altijd `mergeProjectMetadata()` gebruiken voor projectdata.
- Wijziging aan share/save-state vereist versie- en migratiepad.
- Gmail/Firebase config is public-by-design, maar security moet in rules zitten.
- Whitelist moet synchroon blijven tussen JS, Firestore rules en Storage rules.
- Voor product/config/offerte wijzigingen rekening houden met PDF cascade en missing-offerte waarschuwingen.
- Voor Zendure/non-Marstek configs rekening houden met verplichte fase-aarde meting (`cabinet.lineGroundChecked`).
- Cloud Function OCR draait niet in E2E; tests mocken de Firestore feedback-loop.

## Gerelateerde repo’s

- `smartpeak-be/ems-presentatie`: Reveal.js presentatie over EMS/thuisbatterijen.
- `smartpeak-be/smartpeak-crm`: private maar momenteel vrijwel leeg; vermoedelijk toekomstige CRM.
