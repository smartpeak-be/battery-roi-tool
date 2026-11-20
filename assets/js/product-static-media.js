const STATIC_PRODUCT_MEDIA = {
  marstekVenusE: {
    photos: Array.from({ length: 6 }, (_, index) => 'assets/products/marstek/marstek-' + (index + 1) + '.jpg'),
    datasheets: [
      {
        name: 'Marstek Venus E 3.0 — Productfiche',
        url: 'https://cdn.shopify.com/s/files/1/0746/1575/0952/files/MARSTEK_VENUS_E3.0_Brochure_EU_EN.pdf?v=1776130081',
      },
      {
        name: 'Marstek Venus E 3.0 — Handleiding',
        url: 'https://cdn.shopify.com/s/files/1/0746/1575/0952/files/43A212010001_BIE5_01_140mmx210mm_120g_80g_VENUS-E_3.0_2025.05.08.29_compressed.pdf?v=1758512012',
      },
    ],
  },
  zendureAc: {
    photos: Array.from({ length: 5 }, (_, index) => 'assets/products/zendure/zendure-' + (index + 1) + '.webp'),
    datasheets: [{
      name: 'SolarFlow 2400 AC — Officiële specificaties',
      url: 'https://be.zendure.com/en/products/zendure-solarflow-2400-ac',
    }],
  },
  acplus: {
    photos: [
      'assets/products/zendure-ac-plus/zendure-acplus-1.png',
      'assets/products/zendure-ac-plus/zendure-acplus-2.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-3.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-4.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-5.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-6.jpg',
    ],
    datasheets: [{
      name: 'SolarFlow 2400 AC+ — Handleiding (EN/NL)',
      url:  'https://cdn.shopify.com/s/files/1/0722/0956/3903/files/SolarFlow_2400_AC__User_Manual_EN_NL.pdf?v=1770794779',
    }],
  },
  ab3000l: {
    photos: [
      'assets/products/zendure-ac-plus/zendure-acplus-ab3000l.jpg',
    ],
    datasheets: [
      {
        name: 'AB3000L — Handleiding',
        url:  'https://cdn.shopify.com/s/files/1/0722/0956/3903/files/ZDB2503_AB3000L_6_20260104_removed_removed.pdf?v=1770795311',
      },
      {
        name: 'AB3000L — Handleiding EN/FR',
        url:  'https://cdn.shopify.com/s/files/1/0720/4379/0616/files/AB3000L_User_Manual_20260422_EN_FR.pdf?v=1779959908',
      },
    ],
  },
  dynessDl5: {
    photos: ['https://www.dyness.com/Public/Uploads/uploadfile/images/20250428/DL5.0cprojpg.jpg'],
    datasheets: [{
      name: 'Dyness DL5.0C Pro — Datasheet',
      url:  'https://www.dyness.com/Public/Uploads/uploadfile/files/20250901/DL5.0CProDatasheetEN20250702.pdf',
    }],
  },
  dynessPowerBrick: {
    photos: ['https://www.dyness.com/Public/Uploads/uploadfile/images/20241211/powerbrickbanner.jpg'],
    datasheets: [{
      name: 'Dyness PowerBrick — Datasheet',
      url:  'https://www.dyness.com/Public/Uploads/uploadfile/files/20250901/PowerBrickdatasheetEN20250701-201.pdf',
    }],
  },
  dynessPowerboxG2: {
    photos: ['https://www.dyness.com/Public/Uploads/uploadfile/images/20250605/powerboxG2hei.jpg'],
    datasheets: [
      {
        name: 'Dyness Powerbox G2 — Datasheet',
        url:  'https://www.dyness.com/Public/Uploads/uploadfile/files/20250901/PowerboxG2DatasheetEN20250627.pdf',
      },
      {
        name: 'Dyness Powerbox G2 — User manual',
        url:  'https://nastechsolar.com/content/STORAGE/DYNESS/PRODUCT%20CATALOGUE/Dyness%20Powerbox%20G2%20User%20Manual.pdf',
      },
    ],
  },
  huaweiLunaS1: {
    datasheets: [
      {
        name: 'Huawei LUNA2000-S1 — Officiële specs',
        url:  'https://solar.huawei.com/en/products/LUNA2000-7-14-21-S1/specs/',
      },
      {
        name: 'Huawei LUNA2000-S1 — Datasheet PDF',
        url:  'https://solar.huawei.com/admin/asset/v1/pro/view/36414e3c762a4e508d6fde579866c4c0.pdf',
      },
    ],
  },
  sigenergyStor: {
    photos: [
      'https://wwwstatic.sigenergy.com/upload/2026-06-03/1780466922268_f5aaf949-2f73-4d39-be6a-a5c9351173d1.webp',
    ],
    datasheets: [
      { name: 'Sigenergy SigenStor — Officiële specificaties', url: 'https://www.sigenergy.com/be/products/sigenstor/spec' },
      { name: 'Sigenergy SigenStor — Download center', url: 'https://www.sigenergy.com/be/support/download' },
    ],
  },
};

function staticProductMediaKey(product) {
  const haystack = [product?.brand, product?.model, product?.description].filter(Boolean).join(' ').toLowerCase();
  if (/\bvenus\s*e(?:\s*v?3(?:\.0)?)?\s*$/.test(haystack)) return 'marstekVenusE';
  if (haystack.includes('ab3000l')) return 'ab3000l';
  if (/2400\s*ac\s*(?:\+|plus)/.test(haystack)) return 'acplus';
  if (/2400\s*ac\b/.test(haystack)) return 'zendureAc';
  if (/dl5\.0c\s*pro/.test(haystack)) return 'dynessDl5';
  if (haystack.includes('powerbrick')) return 'dynessPowerBrick';
  if (haystack.includes('powerbox g2')) return 'dynessPowerboxG2';
  if (/luna2000.*(?:-s1|\bs1\b)/.test(haystack)) return 'huaweiLunaS1';
  if (/sigen\s*stor/.test(haystack)) return 'sigenergyStor';
  return null;
}

export function staticProductPhotos(product) {
  const media = STATIC_PRODUCT_MEDIA[staticProductMediaKey(product)];
  return (media?.photos || []).map((url, idx) => ({
    id:          `static-${idx}`,
    name:        url.split('/').pop() || 'Productfoto',
    downloadUrl: url,
    thumbUrl:    url,
    isStatic:    true,
  }));
}

export function staticProductDatasheets(product) {
  const media = STATIC_PRODUCT_MEDIA[staticProductMediaKey(product)];
  return (media?.datasheets || []).map((doc, idx) => ({
    id:          `static-${idx}`,
    name:        doc.name,
    downloadUrl: doc.url,
    sizeBytes:   null,
    isStatic:    true,
  }));
}
