import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../producten-beheer.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../assets/js/pages/producten-beheer-app.js', import.meta.url), 'utf8');

describe('producten-beheer settings tab', () => {
  it('does not render legacy or unused settings controls', () => {
    expect(html).not.toContain('settingsInstallCost');
    expect(html).not.toContain('settingsInspectCost');
    expect(html).not.toContain('settingsDepositValue');
    expect(html).not.toContain('Standaard installatiekost');
    expect(html).not.toContain('Standaard keuringskost');
    expect(html).not.toContain('Voorschot');
    expect(html).toContain('id="settingsDiscountValue" min="0" step="0.01"');
  });

  it('does not load or annotate removed legacy service settings', () => {
    expect(appSource).not.toContain('defaultInstallCost');
    expect(appSource).not.toContain('defaultInspectCost');
    expect(appSource).not.toContain('markLegacyServiceSettings');
    expect(appSource).toContain('class="form-control detail-discount-value" min="0" step="0.01"');
  });
});
