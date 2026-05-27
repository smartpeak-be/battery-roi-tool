import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/pages/producten-beheer-app.js', import.meta.url), 'utf8');
const firebaseSource = readFileSync(new URL('../assets/js/firebase-init.js', import.meta.url), 'utf8');

describe('producten-beheer Billit offerte koppeling', () => {
  it('bewaart de finale Billit-PDF op het project onder de gekozen configuratie', () => {
    expect(source).toContain('async function attachBillitPdfToProjectConfig');
    expect(source).toContain('await attachBillitPdfToProjectConfig(computed, pdf, billitId);');
    expect(source).toContain('uploadProjectOfferte(computed.project.id, configType, file, {');
    expect(source).toContain("source: 'billit'");
    expect(source).toContain('billitOrderId: String(billitId)');
  });

  it('geeft de configType mee via de quote context zodat dashboard-configs correct gelinkt blijven', () => {
    expect(source).toContain('id="quoteConfigType"');
    expect(source).toContain('billitConfigTypeForComputed(computed)');
    expect(source).toContain("`PC_${computed.cfg.id}`");
  });

  it('laat offerte-upload extra metadata bewaren zonder de bestaande uploadflow te breken', () => {
    expect(firebaseSource).toContain('async function uploadProjectOfferte(projectId, configType, file, extraMetadata = {})');
    expect(firebaseSource).toContain('...extraMetadata,');
  });
});
