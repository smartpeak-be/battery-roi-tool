# Offerte-scherm als Config Composer Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Het bestaande offerte-preview/meerkosten-scherm evolueren naar het centrale scherm om klantconfiguraties samen te stellen, op te slaan als datahouder, en daarna van daaruit effectief een offerte te sturen/uploaden.

**Architecture:** De calculator mag niet langer de plaats zijn waar definitieve configuraties ontstaan. Product-samenstellingen uit Firestore vormen de basis; het offerte/config-composer scherm laat daarop producten, manuele lijnen en kortingen toevoegen. Legacy sheet-configs en de aparte manuele calculator-configs blijven hoogstens tijdelijk als migratie/backward-compat bestaan, maar moeten uit de normale flow verdwijnen.

**Tech Stack:** Static HTML/CSS/JS, Firebase/Firestore, bestaande `index.html`, `assets/js/offertes-ui.js`, `assets/js/product-configs.js`, Vitest en Playwright.

---

## Productbeslissingen uit Kevin's feedback

- Het huidige offerte-preview scherm is niet enkel een preview: het moet de **config composer** worden.
- De config composer is een **datahouder vóór de officiële offerte**.
- De gebruiker kiest eerst een product-samenstelling/configuratie.
- Daarna kan hij in hetzelfde scherm extra regels toevoegen:
  - bestaande producten uit productbeheer;
  - manuele lijnen;
  - kortingen;
  - eventueel installatie-/materiaal-/schap-/kabel-lijnen.
- De calculator gebruikt de samengestelde config voor ROI-impact.
- De oude sheet-configs moeten op termijn uit de normale flow verdwijnen.
- De aparte manuele config-flow moet verdwijnen; manueel toevoegen gebeurt dan in de composer/offerte-view.

## High-level issues

### Issue 1 — Config composer als bron voor berekenbare configs

Als Kevin wil ik een gekozen product-samenstelling kunnen aanvullen met productlijnen, manuele lijnen en kortingen zodat de ROI-berekening dezelfde totaalprijs gebruikt als de voorbereidende offerte.

Acceptatiecriteria:
- Een Firestore productconfig kan geopend worden in de composer.
- Extra productlijnen verhogen/verlagen de berekenbare configuratieprijs correct.
- Manuele lijnen kunnen bedrag, btw-context en omschrijving bevatten.
- Kortingen kunnen als negatieve lijn worden toegevoegd.
- De berekening gebruikt de composer-totalen.

### Issue 2 — Composer-data bewaren op projectniveau

Als Kevin wil ik samengestelde configuraties bij het project bewaren zodat ze later opnieuw geopend, aangepast en gebruikt kunnen worden voor offerte-opmaak.

Acceptatiecriteria:
- Project bewaart een `configuredOffers` of vergelijkbare datastructuur per config.
- Data bevat basisconfig-id, lijnen, totalen, btw-context, timestamps en status.
- Bestaande `lastCalcRun` kan verwijzen naar deze samengestelde configs.
- Heropenen toont exact dezelfde lijnen en totalen.

### Issue 3 — Normale flow weg van legacy sheet/manueel

Als Kevin wil ik niet langer kiezen uit oude sheet-configs of aparte manuele calculator-configs zodat de tool consistenter werkt rond productbeheer en offertevoorbereiding.

Acceptatiecriteria:
- Normale projectflow toont product-samenstellingen als primaire keuze.
- Sheet-configs zitten achter een legacy/migratie fallback of feature flag.
- Aparte manuele calculator-config UI wordt verborgen of uitgefaseerd.
- Manuele toevoegingen gebeuren via composer-lijnen.

### Issue 4 — Offerte versturen/uploaden vertrekt vanuit composer

Als Kevin wil ik vanuit de samengestelde config kunnen doorgaan naar effectieve offerte zodat voorbereiding en verzenden/uploaden één logische flow vormen.

Acceptatiecriteria:
- Composer-status kan bv. `draft`, `ready_for_quote`, `sent/uploaded` worden.
- Bestaande PDF-upload per config blijft werken of wordt gekoppeld aan composer-id.
- Dashboard/drawer toont de status van samengestelde configs.

## Implementation tasks

### Task 1: Inventariseer huidige offerte-preview en meerkosten-flow

**Objective:** Exact bepalen welke functies vandaag al bruikbaar zijn voor de composer.

**Files:**
- Inspect: `index.html`
- Inspect: `assets/js/offertes-ui.js`
- Inspect: `assets/js/product-configs.js`
- Inspect: `assets/js/firebase-init.js`
- Inspect tests rond meerkosten/product-configs

**Steps:**
1. Zoek alle functies rond meerkostlijnen, offerte-preview en productconfigs.
2. Noteer welke functies UI-only zijn en welke berekeningsdata teruggeven.
3. Bepaal welke data nu in `lastCalcRun`, `selectedConfigTypes`, `meerkostLines` of `offertes` zit.
4. Voeg geen code toe in deze taak.

**Verification:**
- Korte technische notitie in PR-comment of plan-update met bestaande functies en gewenste hergebruikpunten.

### Task 2: Schrijf failing unit-tests voor composer-line totalen

**Objective:** Berekeningslogica los testen vóór UI-wijzigingen.

**Files:**
- Create/modify: `tests/config-composer.test.js`
- Modify/create helper module indien nodig: `assets/js/config-composer.js`

**Expected tests:**
- basisconfig + productlijn telt materiaal/installatie correct op;
- basisconfig + manuele lijn telt correct op;
- korting verlaagt totaal;
- 6%/21% context blijft expliciet;
- output kan naar calculator-config shape geresolved worden.

**Verification command:**
```bash
npm test -- tests/config-composer.test.js
```
Expected first run: FAIL because helper does not exist or behavior ontbreekt.

### Task 3: Implementeer pure composer-helper

**Objective:** Eén pure module maken die composer-data omzet naar berekenbare config.

**Files:**
- Create: `assets/js/config-composer.js`
- Modify tests from Task 2

**Steps:**
1. Definieer een minimale composer-shape.
2. Implementeer `calculateComposerTotals(composer, productLookup, options)`.
3. Implementeer `resolveComposerToCalculatorConfig(composer, baseConfig, productLookup, options)`.
4. Houd backward-compat met bestaande config-shape waar mogelijk.

**Verification:**
```bash
npm test -- tests/config-composer.test.js
npm test
```

### Task 4: Koppel bestaande offerte-preview/meerkost UI aan composer-data

**Objective:** Het scherm gebruikt composer-lines in plaats van losse tijdelijke meerkostregels.

**Files:**
- Modify: `index.html`
- Modify: mogelijk `assets/js/offertes-ui.js`
- Modify: tests rond meerkosten/offerte-preview

**Steps:**
1. Zoek het huidige scherm waar meerprijzen/offerte-preview worden beheerd.
2. Vervang tijdelijke state door composer-state per config.
3. Laat bestaande UI-regels product/manueel/korting toevoegen.
4. Zorg dat de berekening de composer-resolved config gebruikt.

**Verification:**
```bash
npm test
npm run lint
```

### Task 5: Bewaar composer-data op projectniveau

**Objective:** Samengestelde configs persistenter maken dan een berekeningsrun.

**Files:**
- Modify: `assets/js/firebase-init.js`
- Modify: `index.html`
- Modify: tests rond project save/load indien aanwezig

**Steps:**
1. Kies datastructuur, bij voorkeur top-level `configuredOffers` of `configCompositions`.
2. Bewaar per composer: id, baseProductConfigId, lines, totals, status, updatedAt.
3. Zorg dat `saveLastCalcRun()` niet de enige bron van deze data is.
4. Migreer oude `meerkostLines` read-only waar nodig.

**Verification:**
- Project openen, composer aanpassen, opslaan, heropenen: lijnen blijven behouden.
- `npm test` en relevante e2e.

### Task 6: Normaliseer keuze-flow richting product-samenstellingen

**Objective:** Legacy sheet/manueel uit de hoofdflow halen zonder bestaande projecten/share-links te breken.

**Files:**
- Modify: `index.html`
- Modify: `assets/js/product-configs.js`
- Modify tests

**Steps:**
1. Toon Firestore productconfigs als primaire keuze.
2. Verberg sheet-configs achter legacy fallback of alleen wanneer project oude data bevat.
3. Verberg aparte manuele config-knoppen in normale projectflow.
4. Zorg dat legacy share-links en bestaande `lastCalcRun` blijven renderen.

**Verification:**
- Nieuw project: enkel product-samenstellingen + composer-flow zichtbaar.
- Oud project/share-link: blijft leesbaar.
- `npm test`, `npm run lint`, relevante Playwright.

### Task 7: Dashboard/offerte-status koppelen aan composer

**Objective:** Dashboard toont voorbereid/offerte-status op basis van composer-data.

**Files:**
- Modify: `dashboard.html`
- Modify: `assets/js/offertes-ui.js`
- Modify: `assets/js/firebase-init.js`

**Steps:**
1. Bepaal mapping tussen composer-id/config en bestaande PDF-offerte metadata.
2. Toon composer-status in drawer/offerte-cards.
3. Behoud upload/vervang/download/delete gedrag.

**Verification:**
- Dashboard toont ontbrekende offerte wanneer composer klaar is maar PDF ontbreekt.
- PDF upload blijft gekoppeld aan de juiste samengestelde config.

## Rollout notes

- Niet in één keer legacy-data verwijderen.
- Eerste fase: de nieuwe composer-flow **parallel naast de bestaande sheet-configs en manuele calculator-configs** laten draaien.
- In die parallelle fase valideren we dat:
  - bestaande sheet-configs exact hetzelfde blijven rekenen;
  - bestaande manuele config-flow niet breekt;
  - nieuwe productconfig/composer-flow correcte totalen en ROI geeft;
  - bestaande projecten en share-links blijven werken;
  - offerte-preview/PDF-status niet regressief verandert.
- Pas nadat die parallelle flow functioneel gevalideerd is, faseren we de oude sheet-configs en aparte manuele calculator-configs uit de normale nieuwe flow.
- Legacy-data blijft daarna nog leesbaar voor oude projecten/share-links; verwijderen/migreren is een aparte latere stap.
- PR #48 was een nuttige tussenstap, maar moet inhoudelijk heroriënteren naar deze composer-flow met parallelle validatiefase vóór uitfasering.
