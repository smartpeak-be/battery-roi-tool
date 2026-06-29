import { describe, expect, it } from 'vitest';
import {
  buildQuoteContextFromProjectConfig,
  decodeQuoteContext,
  encodeQuoteContext,
  productConfigIdFromType,
} from '../assets/js/quote-context.js';

describe('quote context handoff', () => {
  it('maps product config types to product config IDs', () => {
    expect(productConfigIdFromType('PC_zendure_5kwh')).toBe('zendure_5kwh');
    expect(productConfigIdFromType('ZSF2400')).toBe('');
  });

  it('builds quote context from a calculated project config and keeps composer inputs', () => {
    const project = {
      id: 'project-1',
      lastCalcRun: {
        results: {
          configResults: [{
            cfg: {
              type: 'PC_cfg-1',
              productConfigId: 'cfg-1',
              omschrijving: 'Zendure Solarflow 2400 AC+ & Installatiekost & Zendure Slimme Meter P1',
              price: 1797.125396,
              compositionLines: [
                { id: 'p1', kind: 'product', productId: 'extra-meter', qty: 2, vat: 21, amountExVat: 100 },
                { id: 'm1', kind: 'manual', description: 'Extra kabel', amountExVat: 75, vat: 6 },
                { id: 'd1', kind: 'discount', description: 'Actiekorting', amountExVat: -50, vat: 21 },
                { id: 'i1', kind: 'inspection', productId: 'inspection', qty: 1, vat: 21, automatic: true },
              ],
            },
          }],
        },
      },
    };

    const context = buildQuoteContextFromProjectConfig(project, 'PC_cfg-1', { vat: 6 });

    expect(context).toMatchObject({ projectId: 'project-1', configId: 'cfg-1', configType: 'PC_cfg-1', vat: 6 });
    expect(context.calculatedLine).toEqual({
      description: 'Zendure Solarflow 2400 AC+ & Installatiekost & Zendure Slimme Meter P1',
      amountInclVat: 1797.13,
      vat: 6,
    });
    expect(context.extraProducts).toEqual([{ productId: 'extra-meter', qty: 2, vat: 21 }]);
    expect(context.manualLines).toEqual([{ kind: 'line', description: 'Extra kabel', priceExVat: 75, vat: 6 }]);
    expect(context.discount).toEqual({ type: 'fixed', value: 50 });
  });

  it('hands custom calculator compositions to quote preview without a stored base config', () => {
    const project = {
      id: 'project-1',
      lastCalcRun: {
        results: {
          configResults: [{
            cfg: {
              type: 'CUSTOM_123',
              omschrijving: '2x Zendure AB3000X & Zendure Solarflow 2400 AC',
              price: 2400,
              compositionLines: [
                { id: 'battery', kind: 'product', productId: 'battery', qty: 2, vat: 6, amountExVat: 600 },
                { id: 'inverter', kind: 'product', productId: 'inverter', qty: 1, vat: 6, amountExVat: 1000 },
                { id: 'manual', kind: 'manual', description: 'Extra kabel', amountExVat: 75, vat: 6 },
                { id: 'install-extra', kind: 'installation_extra', description: 'Extra plaatsing', amountExVat: 125, vat: 6 },
              ],
            },
          }],
        },
      },
    };

    const context = buildQuoteContextFromProjectConfig(project, 'CUSTOM_123', { vat: 6 });

    expect(context.configId).toBe('');
    expect(context.customConfigName).toBe('2x Zendure AB3000X & Zendure Solarflow 2400 AC');
    expect(context.configType).toBe('CUSTOM_123');
    expect(context.extraProducts).toEqual([
      { productId: 'battery', qty: 2, vat: 6 },
      { productId: 'inverter', qty: 1, vat: 6 },
    ]);
    expect(context.manualLines).toEqual([
      { kind: 'line', description: 'Extra kabel', priceExVat: 75, vat: 6 },
      { kind: 'installation_extra', description: 'Extra plaatsing', priceExVat: 125, vat: 6 },
    ]);
  });

  it('round-trips quote context through URL-safe base64', () => {
    const input = {
      projectId: 'p-ä',
      configId: 'cfg-1',
      vat: 21,
      manualLines: [{ kind: 'line', description: 'Kabel é', priceExVat: 12.5, vat: 21 }],
    };

    expect(decodeQuoteContext(encodeQuoteContext(input))).toEqual(input);
  });
});
