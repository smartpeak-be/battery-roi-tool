import { calculatorConfigSpecItems } from '../product-spec-links.js';

const CONFIG_FIELDS = new Set([
  'type', 'omschrijving', 'compositionDescription', 'batCap', 'batInv', 'eff', 'price', 'isManual',
]);

function customerConfig(cfg) {
  const result = Object.fromEntries(Object.entries(cfg).filter(([key]) => CONFIG_FIELDS.has(key)));
  const labels = new Map((Array.isArray(cfg.compositionLines) ? cfg.compositionLines : [])
    .filter(line => line?.kind === 'product' && typeof line.description === 'string' && line.description.trim())
    .map(({ productId, description }) => [productId, description]));
  result.items = calculatorConfigSpecItems(cfg).map(item => {
    const description = labels.get(item.productId);
    return description ? { ...item, description } : item;
  });
  return result;
}

export function customerShareState(state, catalog) {
  const { v, form, r } = state;
  return {
    v,
    form,
    r: {
      ...r,
      configResults: r.configResults.map(result => ({
        ...Object.fromEntries(Object.entries(result).filter(([key]) =>
          ['scenWC', 'scenOpt', 'scenWCAvg', 'scenOptAvg', 'pvGtBat'].includes(key))),
        cfg: customerConfig(result.cfg),
      })),
    },
    ...(catalog.length ? { customerProducts: catalog } : {}),
  };
}
