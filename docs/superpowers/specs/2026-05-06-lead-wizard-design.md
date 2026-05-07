# Lead Wizard & Resultaatpagina — Design Spec

Publieke pagina's voor potentiele klanten, embedbaar in WordPress. Wizard verzamelt verbruiksdata en contactgegevens, berekent de beste batterij-ROI, en stuurt het resultaat per email.

---

## 1. Pagina-structuur & flow

### Bestanden

| Bestand | Doel |
|---------|------|
| `lead.html` | Multi-step wizard (3 stappen + bevestiging), embedbaar via iframe |
| `lead-result.html` | Resultaatpagina (permalink via `?r=<id>`), ook embedbaar |
| `assets/js/lead-calc.js` | Lead-specifieke logica: config-selectie, best-ROI, Firestore write, email-trigger |

### Gebruikersstroom

```
WordPress pagina (iframe -> lead.html)
  |
  +-- Stap 1: CSV uploaden  (uitleg + Fluvius instructies)
  +-- Stap 2: Contactgegevens  (naam + email, vereist)
  +-- Stap 3: Extra gegevens  (omvormer kW, energiekost, woning leeftijd)
  |
  +-- Stap 4: Bevestiging
       "Bedankt! We sturen je resultaten naar <email>."
       |
       +-- Project aangemaakt in Firestore (status: cold_lead)
       +-- Berekening opgeslagen in lead doc
       +-- Email verzonden met link naar lead-result.html?r=<id>

Klant opent email -> klikt link -> lead-result.html?r=<id>
  |
  +-- Resultaatkaart: opslagcapaciteit, omvormvermogen, ROI jaren
  +-- Recuperatie progress bars (vol/deels geladen)
  +-- Disclaimer (defaults, full-package uitleg)
  |
  +-- CTA: "Contacteer mij voor een vrijblijvend gesprek"
       |
       +-- Status -> hot_lead
       +-- Notificatie-email naar Kevin/Ruben
```

### Lead-statussen

- `cold_lead` — wizard ingevuld, berekening verstuurd per email
- `hot_lead` — klant heeft "Contacteer mij" geklikt

---

## 2. Wizard stappen

### Stap 1 — CSV uploaden

- **Kop:** "Upload je verbruiksgegevens"
- **Uitlegblok** met instructies hoe het CSV-bestand bij Fluvius te verkrijgen:
  1. Ga naar mijn.fluvius.be
  2. Log in met eID/itsme
  3. Ga naar "Mijn verbruik" -> "Exporteer gegevens"
  4. Kies periode (minstens 1 jaar aanbevolen) en download als CSV
- **Drag-drop zone + file-input** voor CSV
- Na upload: directe validatie via `validateCsvHeaders()` met feedback
- Succes-indicatie: "CSV geladen — X dagen verbruiksdata gevonden" (via `csvToAllDaysAndMeta`)
- Als < 365 dagen: waarschuwing "Minder dan 1 jaar data — resultaat wordt geschat op basis van beschikbare periode"
- **Knop:** "Volgende" (disabled tot valid CSV)

### Stap 2 — Contactgegevens

- **Kop:** "Jouw gegevens"
- **Velden:**
  - Naam (required, tekstveld)
  - Email (required, email-type met client-side validatie)
- Korte tekst: "We sturen je persoonlijk resultaat naar dit emailadres."
- **Knop:** "Volgende"

### Stap 3 — Extra gegevens

- **Kop:** "Optionele gegevens voor een nauwkeuriger resultaat"
- **Velden:**
  - Woning ouder dan 10 jaar? (twee radio-knoppen: "Ja, 10 jaar of ouder" / "Nee, jonger dan 10 jaar", default niet geselecteerd -> 21% BTW als niet gekozen)
  - Totaal omvormervermogen in kW (number input, placeholder "bv. 3.5", label met uitleg: "Het piekvermogen van je zonnepanelen-omvormer. Staat vermeld op je omvormer of in de specificaties van je installatie.")
  - Energiekost per kWh (number input, placeholder "bv. 0.34", label: "Je totale elektriciteitsprijs per kWh, inclusief alle kosten. Vind je op je energiefactuur.")
- Per optioneel veld een subtiele hint: "Niet ingevuld? We rekenen met een standaardwaarde."
- **Knop:** "Bereken mijn resultaat"

### Stap 4 — Bevestiging (eindscherm, geen wizard-stap)

- **Kop:** "Je resultaat is onderweg!"
- **Tekst:** "We hebben je persoonlijke batterij-analyse verstuurd naar **[email]**. Controleer ook je spam-map."
- Secundaire tekst: "Je resultaat blijft beschikbaar via de link in je email."

### Wizard-navigatie

- Stappen-indicator bovenaan (drie dots/bolletjes met actieve markering)
- "Terug"-knop op stap 2 en 3
- Progress is puur visueel (geen URL-updates, alles in-page)

---

## 3. Resultaatpagina (`lead-result.html?r=<id>`)

Publiek toegankelijk (geen auth nodig).

### Layout

1. **Resultaatkaart** (centraal, prominent)
   - Kop: "Jouw batterij-analyse"
   - Drie headline-waarden:
     - Opslagcapaciteit: bv. "10 kWh"
     - Omvormvermogen: bv. "5 kW"
     - Terugverdientijd: bv. "6,2 jaar"
   - Recuperatie progress bars daaronder:
     - "Volledige lading" — % van injectie benut op dagen dat de batterij volledig oplaadt
     - "Gedeeltelijke lading" — % inclusief deels geladen dagen

2. **Disclaimerblok** (transparant, onder de kaart)
   - Vaste tekst: "Deze berekening is gebaseerd op jouw eigen verbruiksdata en omvat het volledige SmartPeak-pakket: plaatsing, aansluiting in de kast, Bebat-bijdragen, elektriciteitsschema's en keuring. Andere opties zijn mogelijk."
   - Als defaults gebruikt werden, extra regel per default:
     - "Omvormervermogen: standaardwaarde 3,5 kW gebruikt"
     - "Energiekost: standaardwaarde 0,34 EUR/kWh gebruikt"
     - "BTW: 21% (woningtype niet opgegeven)"
   - Afsluiter: "Dit resultaat is een indicatie op basis van de beschikbare gegevens. Voor een nauwkeurige berekening op maat nemen we graag contact met je op."

3. **CTA-knop** (groot, opvallend)
   - "Contacteer mij voor een vrijblijvend gesprek"
   - Na klik: status wordt `hot_lead`, knop verandert naar "Aanvraag ontvangen — we nemen snel contact op!"
   - Email-notificatie naar Kevin/Ruben met klantnaam, email, en link naar het lead-doc

4. **Niet getoond:**
   - Batterij-merk of -model
   - Prijzen of kosten
   - Technische specs (efficientie, type, etc.)
   - Naam van de berekenmethode

### Edge case: niet-rendabel

Als alle configs `Infinity` payback geven: toon "Op basis van je verbruiksdata is een thuisbatterij momenteel niet rendabel" i.p.v. een resultaatkaart. CTA "Contacteer mij" blijft beschikbaar.

---

## 4. Datamodel — Firestore `leads` collectie

Aparte collectie van `projects`. Bij conversie naar klant maakt Kevin/Ruben handmatig een project aan vanuit het dashboard.

### Document structuur `leads/{autoId}`

```javascript
{
  // Contactgegevens
  customerName: "Jan Janssen",
  email: "jan@example.com",

  // Wizard-input
  csvDailyCompact: { startDate, afname[], injectie[], ... },
  pvInverterKw: 3.5,
  pricePerKwh: 0.34,
  houseAgeOver10Years: null,   // true | false | null

  // Welke defaults gebruikt
  defaultsUsed: {
    pvInverterKw: true,
    pricePerKwh: false,
    houseAgeOver10Years: true
  },

  // Notities (auto-gegenereerd, voor dashboard)
  notes: "Standaardwaarden gebruikt:\n- Omvormervermogen: 3,5 kW (niet opgegeven)\n- BTW: 21% (woningtype niet opgegeven)",

  // Berekeningsresultaat (enkel wat de resultaatpagina nodig heeft)
  result: {
    bestConfigType: "Zendure-10",     // intern, niet getoond
    batteryCapKwh: 10,
    batteryInverterKw: 5,
    roiYears: 6.2,
    recoveryPctFull: 78.5,
    recoveryPctPartial: 94.2,
    qualifyingDays: 187,
    partialDays: 312,
    annualSavingEur: 485.20,          // intern, niet getoond
    daysInWindow: 365,
    isFullYear: true
  },

  // Status & timestamps
  status: "cold_lead",                // cold_lead | hot_lead
  createdAt: Timestamp,
  hotLeadAt: null,                    // Timestamp wanneer CTA geklikt

  // Meta
  effectiveBtw: 21,                   // 6 of 21
  keuring: true                       // altijd true
}
```

### Firestore security rules

```
match /leads/{leadId} {
  allow read: if true;
  allow create: if isValidLead(request.resource);
  allow update: if isHotLeadUpdate(request);
  allow delete: if isWhitelisted();
}
```

- `isValidLead`: checkt required velden aanwezig, status == `cold_lead`
- `isHotLeadUpdate`: alleen `status` en `hotLeadAt` mogen wijzigen, alleen `cold_lead` -> `hot_lead`

### Overige rule-wijzigingen

- `config/products`: read-rule uitbreiden naar `allow read: if true` (publiek)
- `mail/{id}`: `allow create: if true` (voor email-trigger extension)

---

## 5. Berekeningslogica

### Config-selectie: "beste ROI" bepalen

1. Haal alle product-configs op via `getProductsConfig()` -> fetch Google Sheet CSV -> `parseSheetConfigs()`
2. Bepaal priceKey: altijd `{btw}_yes` (keuring = true, btw = 6 of 21 op basis van `houseAgeOver10Years`)
3. Parse CSV via `csvToAllDaysAndMeta(csvText)` -> `allDays`
4. Voor elke config: draai `processDataPure()` met:
   - `pvInv` = ingevoerd of 3.5 kW default
   - `priceDay` = `priceNight` = ingevoerd of 0.34 (enkelvoudig tarief)
   - `selectedConfigs` = `[cfg]` (telkens 1 config)
5. Gebruik het **optimistische scenario** (`scenOpt`, `useCap=false`) — niet zo benoemd naar de klant
6. Selecteer de config met de kortste `scenOpt.payback` (laagste terugverdientijd)
7. Bij gelijke payback: neem de config met lagere capaciteit (goedkoper = beter advies)
8. Sla het resultaat op (enkel de winnende config-metrics, geen prijzen getoond)

### Defaults

| Parameter | Default | Wanneer |
|-----------|---------|---------|
| `pvInverterKw` | 3.5 kW | Niet ingevuld in stap 3 |
| `pricePerKwh` | 0.34 EUR/kWh | Niet ingevuld in stap 3 |
| `houseAgeOver10Years` | `null` -> 21% BTW | Niet geselecteerd in stap 3 |
| `keuring` | `true` (altijd) | Niet configureerbaar |
| Tarief-type | Enkelvoudig | Altijd; `priceDay = priceNight = pricePerKwh` |

### Edge cases

- Alle configs geven `Infinity` payback -> niet-rendabel bericht (zie sectie 3)
- < 365 dagen CSV-data -> `scaleFactor` extrapoleert automatisch (bestaand gedrag), disclaimer vermeldt dit
- Ongeldige CSV -> wizard stap 1 blokkeert, foutmelding via `validateCsvHeaders()`

---

## 6. Email

Firebase Extension "Trigger Email from Firestore". Client schrijft een doc naar de `mail` collectie; de extension verstuurt het automatisch via geconfigureerde SMTP.

### Twee email-triggers

1. **Resultaat-email** (bij lead creatie)
   - Naar: klant-email
   - Onderwerp: "Je batterij-analyse is klaar — SmartPeak"
   - Inhoud: korte intro + link naar `lead-result.html?r=<id>`

2. **Hot-lead notificatie** (bij CTA klik)
   - Naar: Kevin + Ruben
   - Onderwerp: "Nieuwe contactaanvraag: [klantnaam]"
   - Inhoud: klantnaam, email, link naar lead in dashboard

---

## 7. Dashboard-integratie

- Nieuwe sectie "Leads" in het dashboard (apart van projectlijst, onder de toolbar)
- Lead-rijen: naam, email, status (cold/hot), datum, link naar resultaatpagina
- Actie-knop: "Maak project aan" -> kopieert relevante data (naam, email, CSV-data, omvormer kW, tarief, BTW, notities) naar een nieuw project in `projects` collectie
- Leads zijn read-only in het dashboard (geen edit/delete via UI, behalve "Maak project aan")

---

## 8. Styling & embedding

- Bootstrap 5.3.3 (zelfde CDN als rest van de app) + `smartpeak.css`
- SmartPeak-branding (kleuren, border-radius, fonts)
- Geen navbar/footer — clean standalone pages, optimaal voor iframe
- Responsive: mobile-first
- Stappen-indicator: drie dots met actieve markering (CSS in `smartpeak.css`)
- CSV drop-zone: hergebruikt bestaand `.sp-drop-zone` patroon

### WordPress embedding

```html
<iframe src="https://smartpeak-be.github.io/battery-roi-tool/lead.html"
        style="width:100%;min-height:600px;border:none;"></iframe>
```

Resultaatpagina ook embedbaar: `lead-result.html?r=<id>`.

---

## 9. Hergebruikte modules

| Module | Functies |
|--------|----------|
| `assets/js/calc-engine.js` | `csvToAllDaysAndMeta`, `processDataPure`, `parseSheetConfigs` |
| `assets/js/csv.js` | `validateCsvHeaders` |
| `assets/js/shared-helpers.js` | `escapeHtml`, `showToast`, `withSpinner` |
| `assets/js/firebase-init.js` | `getProductsConfig`, Firebase compat SDK init |

---

## 10. Testen

### Unit tests (Vitest)

`tests/lead-calc.test.js`:
- Best-ROI selectie (kortste payback wint)
- Gelijke payback -> lagere capaciteit wint
- Default-waarden correct toegepast
- Notes-generatie bij defaults
- Edge case: Infinity payback -> niet-rendabel
- Edge case: < 365 dagen data

### E2E tests (Playwright)

`e2e/tests/lead-wizard.spec.js`:
- Wizard doorlopen: CSV upload, validatie, contactgegevens, bevestigingsscherm
- Stap-navigatie (terug-knop, disabled-state)
- Validatie: ongeldig CSV, ontbrekende vereiste velden

`e2e/tests/lead-result.spec.js`:
- Resultaatpagina laden via permalink
- Resultaatkaart toont correcte waarden
- CTA klikken -> status-wijziging naar hot_lead
- Niet-rendabel edge case

---

*Aangemaakt: 2026-05-06*
