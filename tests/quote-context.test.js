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
    expect(context.extraProducts).toEqual([{ productId: 'extra-meter', qty: 2, vat: 21 }]);
    expect(context.manualLines).toEqual([{ kind: 'line', description: 'Extra kabel', priceExVat: 75, vat: 6 }]);
    expect(context.discount).toEqual({ type: 'fixed', value: 50 });
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
