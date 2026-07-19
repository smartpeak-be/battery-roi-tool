import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/offertes-ui.js', import.meta.url), 'utf8');
const dashboardHtml = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const quotePreviewSource = readFileSync(new URL('../assets/js/quote-preview.js', import.meta.url), 'utf8');
const functionsSource = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

describe('offertes-ui quote preview action', () => {
  it('opent de volledige Billit/offerte-preview op het dashboard zonder redirect of iframe', () => {
    expect(dashboardHtml).toContain('assets/js/quote-preview.js');
    expect(source).toContain('window.SmartPeakQuotePreview.openQuoteModal(context');
    expect(source).not.toMatch(/window\.location\.href\s*=\s*quoteTools\.buildQuoteContextUrl/);
    expect(source).not.toContain('quotePreviewFrame');
    expect(quotePreviewSource).toContain('id="quoteModal"');
    expect(quotePreviewSource).toContain('id="btnCreateBillitOffer"');
    expect(quotePreviewSource).toContain('function createBillitOfferFromPreview');
    expect(quotePreviewSource).toContain('context.calculatedLine');
    expect(quotePreviewSource).toContain('function billitOfferSubject');
    expect(quotePreviewSource).toContain('.slice(0, 250)');
    expect(source).toContain('const hasCalculatedLine = Number(context.calculatedLine?.amountInclVat) > 0;');
    expect(source).toContain('&& !hasCalculatedLine');
    expect(quotePreviewSource).toContain('amountInclVat / (1 + vat / 100)');
    expect(quotePreviewSource).not.toContain('<iframe');
    expect(functionsSource).toContain('Description: cleanString(source.Description, 250)');
    expect(functionsSource).toContain('OrderTitle: cleanString(source.OrderTitle, 250)');
  });

  it('toont ook een offerteknop voor custom calculator-configs in project/drawer lijst', () => {
    expect(source).toContain("const isCustomCalculatorConfig = typeof t === 'string' && t.startsWith('CUSTOM_');");
    expect(source).toContain('const canCreateOffer = !isManual && (cfg.productConfigId || isProductConfig || isCustomCalculatorConfig);');
    expect(source).toContain('offerte-create-btn');
    expect(source).toContain('buildQuoteContextFromProjectConfig(project, type');
  });

  it('weigert een vorige Billit-offerte voordat de drawer-knop een vervangende offerte maakt', () => {
    const quoteContextSource = readFileSync(new URL('../assets/js/quote-context.js', import.meta.url), 'utf8');
    const functionsSource = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

    expect(source).toContain("title: 'Nieuwe Billit-offerte maken?'");
    expect(source).toContain('Vorige weigeren + nieuwe maken');
    expect(quoteContextSource).toContain('previousBillitOrderId: existingOffer?.billitOrderId ? String(existingOffer.billitOrderId) :');
    expect(quotePreviewSource).toContain('if (explicitType) return explicitType;');
    expect(quotePreviewSource).toContain("action: 'decline-offer'");
    expect(quotePreviewSource).toContain('await declinePreviousBillitOffer(endpoint, token, _currentContext.previousBillitOrderId);');
    expect(quotePreviewSource.indexOf('await declinePreviousBillitOffer(endpoint, token, _currentContext.previousBillitOrderId);'))
      .toBeLessThan(quotePreviewSource.indexOf('body: JSON.stringify({ order })'));
    expect(functionsSource).toContain("method: 'PATCH'");
    expect(functionsSource).toContain("OrderStatus: 'Declined'");
    expect(functionsSource).toContain("OrderStatus: 'Refused'");
    expect(functionsSource).toContain("ApprovalStatus: 'Rejected'");
    expect(functionsSource).toContain('async function deleteBillitOrder');
    expect(functionsSource).toContain("fallback: 'deleted'");
  });

  it('ververst de drawer en documenten opnieuw met de verse projectdata na offerte-upload', () => {
    const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
    const projectDocumentsSource = readFileSync(new URL('../assets/js/project-documents.js', import.meta.url), 'utf8');

    expect(dashboardSource).toContain('renderDrawer(fresh);');
    expect(dashboardSource).toContain("_drawerDocumentsExplorer = mountProjectDocuments(document.getElementById('drawerDocumentsMount'), {");
    expect(dashboardSource).toContain('project: fresh,');
    expect(projectDocumentsSource).toContain('async function refresh(nextProject)');
    expect(projectDocumentsSource).toContain('if (nextProject) options.project = nextProject;');
  });

  it('kan vanuit een gekoppelde Billit-offerte een voorschotfactuur maken en als document koppelen', () => {
    const functionsSource = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

    expect(source).toContain('offerte-invoice-btn');
    expect(source).toContain('function openBillitInvoiceModal');
    expect(source).toContain('Voorschotfactuur');
    expect(source).toContain('Afrekening');
    expect(source).toContain('Totaal offerte');
    expect(source).toContain('Reeds gefactureerd');
    expect(source).toContain('Openstaand');
    expect(source).toContain('_sumBillitInvoiceAmountExVat');
    expect(source).toContain('_recordBillitInvoiceForConfig');
    expect(source).toContain('billitInvoices');
    expect(source).toContain('_setBillitInvoicePaidForConfig');
    expect(source).toContain('data-billit-paid-toggle');
    expect(source).toContain('Betaald');
    expect(source).toContain('Serienummers vermelden op factuur');
    expect(source).toContain('_serialNumbersForInvoice');
    expect(source).toContain('includeSerialNumbers');
    expect(source).toContain("radio.value === 'final'");
    expect(source).toContain('serialCheckbox.checked = true');
    expect(source).toContain('paid: false');
    expect(source).toContain('paidCount');
    expect(source).toContain('Openstaand bedrag ex. BTW');
    expect(source).toContain("invoiceKind: kind");
    expect(source).toContain("documentKind: 'invoice'");
    expect(quotePreviewSource).toContain('id="btnCreateAdvanceInvoice"');
    expect(quotePreviewSource).toContain("action: 'advance-invoice'");
    expect(quotePreviewSource).toContain("window.prompt('Voorschotpercentage?', '30')");
    expect(quotePreviewSource).toContain('attachBillitPdfToProjectDocuments(computed, pdf, invoiceId');
    expect(quotePreviewSource).toContain("documentKind: 'invoice'");
    expect(functionsSource).toContain('function buildBillitAdvanceInvoicePayload');
    expect(functionsSource).toContain('function formatSerialNumbersForInvoice');
    expect(functionsSource).toContain('Serienummers: ${serialLines.join');
    expect(functionsSource).toContain('UnitPriceExcl: 0');
    expect(functionsSource).toContain('includeSerialNumbers: req.body.includeSerialNumbers === true');
    expect(functionsSource).toContain("OrderType: 'Invoice'");
    expect(functionsSource).toContain('AboutInvoiceNumber: offerNumber');
    expect(functionsSource).toContain('Voorschot ${pct}% op offerte ${offerNumber}');
    expect(functionsSource).toContain('Afrekening op offerte ${offerNumber}');
    expect(functionsSource).toContain("kind: req.body.invoiceKind === 'final' ? 'final' : 'advance'");
  });

  it('gebruikt de opgegeven custom samenstellingsnaam als titel in de project/offerte-lijst', () => {
    expect(source).toContain('const displayName = cfg.omschrijving || cfg.type;');
    expect(source).toContain('isCustomCalculatorConfig\n        ? escapeHtml(displayName)');
    expect(source).toContain("? (cfg.type && cfg.type !== displayName ? cfg.type : '')");
    expect(source).toContain('<div class="offerte-row-desc">${escapeHtml(descriptionLabel)}</div>');
    expect(source).toContain('const storedName = inputs && inputs.compositionNames && inputs.compositionNames[configType];');
    expect(source).toContain("const cfg = match ? match.cfg : { type: configType, omschrijving: storedName || '' };");
    expect(source).toContain('omschrijving:cfg.omschrijving || storedName ||');
  });
});
