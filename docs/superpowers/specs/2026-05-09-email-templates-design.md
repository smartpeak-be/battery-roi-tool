# Email Templates Redesign

**Date:** 2026-05-09
**Status:** Approved

## Goal

Upgrade the two lead-flow emails (customer result email + admin notification) from plain text to branded HTML emails matching the SmartPeak results page look & feel. Add a defaults-disclaimer, customer-friendly copy, and a footer with contact details.

## Scope

Two emails, both using a shared layout helper:

1. **Customer email** — sent from `lead.html` after CSV analysis completes (step 7)
2. **Admin notification email** — sent from `lead-result.html` when customer clicks "Plan een gesprek"

Out of scope: transactional emails, project-mode emails, Handlebar templates in Firestore.

## Shared Layout

All emails use a single `buildEmailHtml(options)` function in `lead.html` / `lead-result.html` (inline, not in `firebase-init.js` — these pages already have the lead data in scope). The function produces a complete HTML document with inline CSS (no external stylesheets — email clients strip `<link>`).

### Structure

```
┌─────────────────────────────────────────┐  #f4f6f8 bg
│  ┌───────────────────────────────────┐  │
│  │  HEADER                           │  │  white bg
│  │  "SmartPeak" (bold, #2c7be5)      │  │
│  │  "Slim omgaan met jouw energie"   │  │  #6b7a8d tagline
│  │  ─────────────────────────────── │  │  1px #e2e8f0 hr
│  ├───────────────────────────────────┤  │
│  │  BODY (varies per email)          │  │  white bg
│  │  - Greeting                       │  │
│  │  - Message text                   │  │
│  │  - CTA button                     │  │
│  ├───────────────────────────────────┤  │
│  │  DEFAULTS DISCLAIMER (optional)   │  │  #f8f9fa bg
│  │  "Deze berekening is gebaseerd    │  │  12px border-radius
│  │   op jouw verbruiksdata,          │  │  #495057 text, 13px
│  │   aangevuld met gemiddelde        │  │
│  │   waarden voor:"                  │  │
│  │  - Omvormervermogen (3,5 kW)      │  │
│  │  - Energiekost (0,34 EUR/kWh)    │  │
│  │  - BTW-tarief (21%)              │  │
│  ├───────────────────────────────────┤  │
│  │  FOOTER                           │  │  #f0f2f5 bg
│  │  SmartPeak                        │  │  #6b7a8d text
│  │  +32 485 60 68 40                │  │
│  │  info@smartpeak.be               │  │
│  │  smartpeak.be                    │  │
│  │  ───────────────────────────     │  │
│  │  Blox-it BV · BE0730.696.050    │  │  #adb5bd smaller
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### CSS tokens (inline)

| Element | Property | Value |
|---|---|---|
| Outer wrapper | background | `#f4f6f8` |
| Inner container | max-width | `600px`, centered |
| Inner container | background | `#ffffff` |
| Brand name | color, weight | `#2c7be5`, `700` |
| Tagline | color, size | `#6b7a8d`, `14px` |
| Divider | border-top | `1px solid #e2e8f0` |
| Body text | color, size, font | `#333`, `15px`, `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| CTA button | bg, color, radius, padding | `#2c7be5`, `#fff`, `8px`, `14px 28px` |
| Disclaimer box | bg, radius, color, size | `#f8f9fa`, `10px`, `#495057`, `13px` |
| Footer bg | background | `#f0f2f5` |
| Footer text | color, size | `#6b7a8d`, `13px` |
| Legal line | color, size | `#adb5bd`, `12px` |

### Defaults disclaimer logic

Read `lead.defaultsUsed` (or the equivalent local object). Build a list of items:

- `defaultsUsed.pvInverterKw === true` -> "omvormervermogen (3,5 kW)"
- `defaultsUsed.pricePerKwh === true` -> "energiekost (0,34 EUR/kWh)"
- `defaultsUsed.houseAgeOver10Years === true` -> "BTW-tarief (21%)"

If list is empty, omit the disclaimer block entirely. If 1+ items:

> "Deze berekening is gebaseerd op jouw verbruiksdata, aangevuld met gemiddelde waarden voor **[komma-separated list]**. Voor een nauwkeurigere analyse op maat van jouw situatie nemen we graag contact op."

## Email 1: Customer Result Email

**Sent from:** `lead.html`, step 7 (after `createLead`)
**To:** `leadDoc.email`
**Subject:** `Je batterij-analyse is klaar — SmartPeak`

**Body content:**

```
Hallo [customerName],

Bedankt dat je gebruik hebt gemaakt van onze gratis
batterij-analyse tool! Op basis van jouw Fluvius-data
hebben we een persoonlijke analyse voor je klaarstaan.

        [ Bekijk mijn resultaat ]          <- CTA button

[DEFAULTS DISCLAIMER if applicable]

Heb je vragen of wil je meer weten? Aarzel niet om
contact met ons op te nemen!

Met vriendelijke groeten,
Het SmartPeak team
```

**Data available:** `leadDoc` (contains `customerName`, `email`, `defaultsUsed`)

## Email 2: Admin Notification Email

**Sent from:** `lead-result.html`, "Plan een gesprek" click handler
**To:** `['kevin@bloxit.be', 'ledsrepair@gmail.com']`
**Subject:** `Nieuwe contactaanvraag: [customerName]`

**Body content:**

```
Er is een nieuwe contactaanvraag via de batterij-analyse tool:

  Naam:     [customerName]
  Email:    [email]                       <- mailto: link

  [if any defaults used:]
  Standaardwaarden: omvormervermogen (3,5 kW),
                    energiekost (0,34 EUR/kWh)

        [ Open dashboard ]                <- CTA button
```

**Footer:** Simplified — no social links, just company line.

**Data available:** `lead` object (fetched from Firestore, contains `customerName`, `email`, `defaultsUsed`)

## Implementation Notes

- No new JS files. Both `lead.html` and `lead-result.html` already have inline `<script>` blocks that call `createMailDoc`. The HTML template strings get replaced in-place.
- The `buildEmailHtml` helper can be a shared function in a `<script>` tag in each file, or duplicated (they're short). Given these are two separate pages with no shared JS, duplicating is simpler. A small `buildEmailLayout(bodyHtml, opts)` function in each file keeps it DRY within each page.
- All CSS is inline on elements (email-compatible). No `<style>` blocks (Gmail strips them from non-AMP emails).
- `escapeHtml` is already available in both pages.
- `defaultsUsed` is already stored on the lead document and accessible in both contexts.
