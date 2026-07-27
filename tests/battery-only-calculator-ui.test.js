import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const calculatorSource = fs.readFileSync(new URL('../assets/js/pages/index-app.js', import.meta.url), 'utf8');
const calculatorHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scenarioSource = fs.readFileSync(new URL('../assets/js/index/scenario-card.js', import.meta.url), 'utf8');

describe('battery-only calculator UX', () => {
  it('loads compositions automatically and keeps refresh as a fallback', () => {
    expect(calculatorHtml).toContain('Samenstellingen worden automatisch geladen');
    expect(calculatorHtml).toContain('Samenstellingen vernieuwen');
    expect(calculatorSource).toContain('await loadConfigs().catch(() => {})');
  });

  it('offers an explicit battery-only toggle in the existing-composition modal', () => {
    expect(calculatorSource).toContain('id="toggleBatteryOnlyConfigs"');
    expect(calculatorSource).toContain('Ook samenstellingen zonder AC-vermogen tonen');
    expect(calculatorSource).toContain('allowBatteryOnly: true');
    expect(calculatorSource).toContain('requiresExistingInverterPower');
  });

  it('passes the entered inverter total into battery-only calculations', () => {
    expect(calculatorSource).toContain('existingInverterPowerKw');
    expect(calculatorSource).toContain("document.getElementById('pvInverter')");
  });

  it('labels displayed prices as indicative', () => {
    expect(scenarioSource).toContain('Prijzen zijn indicatief');
    expect(scenarioSource).toContain('definitieve prijs wordt vastgelegd in de offerte');
  });
});