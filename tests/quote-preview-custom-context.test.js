import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../assets/js/quote-preview.js', import.meta.url), 'utf8');

describe('quote preview custom calculator context', () => {
  it('maakt een virtuele quote-config voor CUSTOM calculator-samenstellingen', () => {
    expect(source).toContain("String(context.configType).startsWith('CUSTOM_')");
    expect(source).toContain('id: context.configType');
    expect(source).toContain("name: customName || 'Samenstelling uit calculator'");
    expect(source).toContain('items: []');
  });

  it('neemt productlijnen, manuele lijnen en korting uit de calculatorcontext over', () => {
    expect(source).toContain('const hasContextCompositionLines = (Array.isArray(context.extraProducts) && context.extraProducts.length > 0)');
    expect(source).toContain('const useCalculatedLine = Boolean(context.calculatedLine?.amountInclVat) && !hasContextCompositionLines;');
    expect(source).toContain('const sourceExtraProducts = useCalculatedLine ? [] : (Array.isArray(context.extraProducts) ? context.extraProducts : []);');
    expect(source).toContain('const sourceManualLines = useCalculatedLine ? [] : (Array.isArray(context.manualLines) ? context.manualLines : []);');
    expect(source).toContain("context.configId || (String(context.configType || '').startsWith('CUSTOM_') ? context.configType : '')");
  });
});
