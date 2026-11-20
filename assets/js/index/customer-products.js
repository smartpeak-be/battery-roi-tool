import { calculatorConfigSpecItems } from '../product-spec-links.js';
import { staticProductDatasheets, staticProductPhotos } from '../product-static-media.js';

export const CUSTOMER_SPEC_FIELDS = {
  capacityKwh: ['Nuttige capaciteit', 'kWh'],
  inverterPowerKw: ['Nominaal AC-vermogen', 'kW'],
  efficiency: ['Rendement', '%'],
  weightKg: ['Gewicht', 'kg'],
  warrantyYears: ['Garantie', 'jaar'],
  cycleLife: ['Levensduur', 'cycli'],
};

export function customerMediaUrl(value) {
  const url = String(value || '').trim();
  if (/^assets\/products\/[a-z0-9_/-]+\.(?:jpe?g|png|webp|pdf)$/i.test(url)) return url;
  try {
    const parsed = new globalThis.URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {
    return '';
  }
}

function productFileUrl(value, productId) {
  const url = customerMediaUrl(value);
  if (!url.startsWith('https://firebasestorage.googleapis.com/v0/b/')) return '';
  try {
    const parsed = new globalThis.URL(url);
    const [, file] = parsed.pathname.split('/o/');
    const prefix = '/v0/b/smartpeak-projects.firebasestorage.app/o/';
    return parsed.pathname.startsWith(prefix)
      && decodeURIComponent(file).startsWith(`products/${productId}/`)
      && parsed.searchParams.get('alt') === 'media'
      && parsed.searchParams.has('token') ? url : '';
  } catch {
    return '';
  }
}

function uniqueByUrl(rows) {
  return Array.from(new Map(rows.filter(row => row.url).map(row => [row.url, row])).values());
}

function customerProduct(product, photos = [], datasheets = []) {
  const title = [product.brand, product.model].filter(Boolean).join(' ').trim() || 'Product';
  const specs = {};
  for (const key of Object.keys(CUSTOMER_SPEC_FIELDS)) {
    const raw = key === 'efficiency' ? (product.specs?.efficiency ?? product.specs?.eff) : product.specs?.[key];
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) specs[key] = key === 'efficiency' && value <= 1 ? value * 100 : value;
  }
  return {
    id: product.id,
    title,
    specs,
    photos: uniqueByUrl([
      ...photos.map(photo => {
        const thumb = productFileUrl(photo.thumbUrl, product.id);
        return { url: productFileUrl(photo.downloadUrl, product.id) || thumb, thumb };
      }),
      ...staticProductPhotos({ brand: product.brand, model: product.model })
        .map(photo => ({ url: customerMediaUrl(photo.downloadUrl), thumb: customerMediaUrl(photo.thumbUrl) })),
    ]),
    datasheets: uniqueByUrl([
      ...datasheets.map(sheet => ({ name: sheet.name || 'Datasheet', url: productFileUrl(sheet.downloadUrl, product.id) })),
      ...staticProductDatasheets({ brand: product.brand, model: product.model })
        .map(sheet => ({ name: sheet.name, url: customerMediaUrl(sheet.downloadUrl) })),
    ]),
  };
}

export async function loadCustomerProducts(configResults, { getProduct, listPhotos, listDatasheets }) {
  const ids = new Set(configResults.flatMap(({ cfg }) => calculatorConfigSpecItems(cfg).map(({ productId }) => productId)));
  const products = await Promise.all([...ids].map(async id => {
    const [product, photos, datasheets] = await Promise.allSettled([getProduct(id), listPhotos(id), listDatasheets(id)]);
    const photoRows = photos.status === 'fulfilled' ? photos.value : [];
    const docRows = datasheets.status === 'fulfilled' ? datasheets.value : [];
    const incomplete = !product.value || [photos, datasheets].some(result => result.status === 'rejected')
      || photoRows.some(photo => !productFileUrl(photo.downloadUrl, id) && !productFileUrl(photo.thumbUrl, id))
      || docRows.some(doc => !productFileUrl(doc.downloadUrl, id));
    const entry = product.status === 'fulfilled' && product.value
      ? customerProduct(product.value, photoRows, docRows)
      : null;
    return { entry, incomplete };
  }));
  return {
    catalog: products.flatMap(({ entry }) => entry ? [entry] : []),
    incomplete: products.some(product => product.incomplete),
  };
}

export function customerConfigProducts(cfg, catalog) {
  const items = calculatorConfigSpecItems(cfg);
  if (items.length) {
    const source = [
      ...(Array.isArray(cfg.items) ? cfg.items : []),
      ...(Array.isArray(cfg.compositionLines) ? cfg.compositionLines.filter(line => line?.kind === 'product') : []),
    ];
    const labels = new Map(source.filter(line => line?.description).map(line => [line.productId, String(line.description).trim()]));
    return items.flatMap(({ productId, qty }) => {
      const product = catalog.get(productId);
      if (product) return [{ ...product, qty }];
      const title = labels.get(productId);
      return title ? [{ ...customerProduct({ id: productId, model: title }), qty }] : [];
    });
  }

  const marstek = /^MARVE03_X(\d+)$/.exec(cfg.type);
  if (marstek) return [{ ...customerProduct({ id: cfg.type, model: 'Marstek Venus E' }), qty: Number(marstek[1]) }];
  const zendure = /^ZSF2400AC(\+)?_(\d+)X(\d+)$/.exec(cfg.type);
  if (!zendure) return [];
  const units = Number(zendure[2]);
  const products = [{ ...customerProduct({ id: cfg.type, model: `Zendure SolarFlow 2400 AC${zendure[1] || ''}` }), qty: units }];
  if (zendure[1] && Number(zendure[3]) > 0) {
    products.push({ ...customerProduct({ id: 'AB3000L', model: 'Zendure AB3000L' }), qty: units * Number(zendure[3]) });
  }
  return products;
}
