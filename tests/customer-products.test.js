import { describe, expect, it, vi } from 'vitest';
import { customerConfigProducts, customerMediaUrl, loadCustomerProducts } from '../assets/js/index/customer-products.js';
import { customerProductPhotos } from '../assets/js/index/customer-product-dialog.js';
import { customerShareState } from '../assets/js/index/customer-share.js';

function storageUrl(path) {
  return `https://firebasestorage.googleapis.com/v0/b/smartpeak-projects.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media&token=example`;
}

describe('customer product details', () => {
  it('removes private cost and margin fields from the calculation sent with a share link', () => {
    const cfg = {
      type: 'CUSTOM_a', omschrijving: 'Batterij', batCap: 4, batInv: 2.4, eff: .9, price: 1500,
      purchasePrice: 987, basePrice: 987, profit: 513,
      items: [{ productId: 'bat', qty: 1, purchasePrice: 987 }],
      compositionLines: [
        { kind: 'product', productId: 'more', qty: 2, description: 'Module', amountExVat: 99, profit: 10 },
        { kind: 'manual', description: 'Private line', amountExVat: 80 },
      ],
    };
    const share = customerShareState({
      v: 7, form: {}, r: { configResults: [{ cfg, scenWC: { payback: 5 }, profit: 513 }] },
      manualConfigs: { manual: { purchasePrice: 987 } },
      compositionLines: { snapshot: cfg.compositionLines },
    }, []);
    expect(share.r.configResults[0]).toEqual({
      cfg: {
        type: 'CUSTOM_a', omschrijving: 'Batterij', batCap: 4, batInv: 2.4, eff: .9, price: 1500,
        items: [{ productId: 'bat', qty: 1 }, { productId: 'more', qty: 2, description: 'Module' }],
      },
      scenWC: { payback: 5 },
    });
    expect(JSON.stringify(share)).not.toMatch(/purchasePrice|basePrice|profit|manualConfigs|Private line/);
  });

  it('shares only technical specs and media for catalog products used in the calculation', async () => {
    const photo = storageUrl('products/bat/photo.jpg');
    const thumb = storageUrl('products/bat/photo_thumb.jpg');
    const sheet = storageUrl('products/bat/datasheets/datasheet.pdf');
    const productLine = { kind: 'product', productId: 'bat', qty: 2 };
    const getProduct = vi.fn(async id => ({
      id, brand: 'Example', model: 'Battery', purchasePrice: 400, marginValue: 50,
      description: 'Internal notes', specs: { capacityKwh: '5.5', eff: 0.93, purchaseCostExVat: 400 },
    }));
    const listPhotos = vi.fn(async () => [
      { downloadUrl: photo, thumbUrl: thumb, uploadedBy: 'internal@example.test' },
      { downloadUrl: storageUrl('projects/private/photo.jpg') },
    ]);
    const listDatasheets = vi.fn(async id => id === 'bat' ? [
      { name: 'Handleiding', downloadUrl: sheet },
      { name: 'Verkeerd product', downloadUrl: storageUrl('products/other/datasheets/file.pdf') },
    ] : []);
    const cfg = { type: 'CUSTOM_a', items: [{ productId: 'bat', qty: 1 }], compositionLines: [productLine] };
    const data = await loadCustomerProducts([{ cfg }, { cfg }], { getProduct, listPhotos, listDatasheets });
    expect(getProduct).toHaveBeenCalledTimes(1);
    expect(listPhotos).toHaveBeenCalledTimes(1);
    expect(listDatasheets).toHaveBeenCalledTimes(1);
    expect(data).toEqual({
      incomplete: true,
      catalog: [{
        id: 'bat', title: 'Example Battery', specs: { capacityKwh: 5.5, efficiency: 93 },
        photos: [{ url: photo, thumb }], datasheets: [{ name: 'Handleiding', url: sheet }],
      }],
    });
    expect(customerConfigProducts(cfg, new Map([['bat', data.catalog[0]]]))[0].qty).toBe(3);
  });

  it('preserves manufacturer files when a catalog media read fails', async () => {
    const cfg = { items: [{ productId: 'bat', qty: 1 }] };
    const data = await loadCustomerProducts([{ cfg }], {
      getProduct: async id => ({ id, brand: 'Zendure', model: 'SolarFlow 2400 AC+' }),
      listPhotos: async () => { throw new Error('Mislukt'); },
      listDatasheets: async () => [],
    });
    expect(data.incomplete).toBe(true);
    expect(data.catalog[0].photos[0].url).toContain('assets/products/zendure-ac-plus/');
    expect(data.catalog[0].datasheets[0].url).toContain('cdn.shopify.com');
  });

  it('uses stored product names and known legacy types for links created before product snapshots', () => {
    const oldConfig = { type: 'ZSF2400AC+_2X1' };
    const legacy = customerConfigProducts(oldConfig, new Map());
    expect(legacy.map(product => [product.title, product.qty])).toEqual([
      ['Zendure SolarFlow 2400 AC+', 2], ['Zendure AB3000L', 2],
    ]);
    expect(customerProductPhotos(legacy)).toHaveLength(7);

    const cfg = { compositionLines: [{ kind: 'product', productId: 'z', description: 'Zendure AB3000L', qty: 2 }] };
    expect(customerConfigProducts(cfg, new Map())[0].datasheets).not.toHaveLength(0);
  });

  it('accepts local product assets and filters unsafe URLs from the gallery', () => {
    const valid = 'assets/products/zendure-ac-plus/zendure-acplus-1.png';
    expect(customerMediaUrl('javascript:alert(1)')).toBe('');
    expect(customerMediaUrl('assets/products/../project.pdf')).toBe('');
    expect(customerProductPhotos([{ title: 'Example', photos: [null, { url: valid }, { url: valid }, { url: 'http://example.test/photo.jpg' }] }]))
      .toEqual([{ url: valid, thumb: valid, label: 'Example' }]);
  });
});
