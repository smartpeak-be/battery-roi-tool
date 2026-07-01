// Central controlled taxonomy for SmartPeak project photos/documents.
// Keep values stable: they are stored in Firestore and used for filtering/PDF packs.

export const PHOTO_TAGS = [
  {
    value: 'situation_before',
    label: 'Situatie vóór installatie',
    icon: 'fa-camera',
    legacyValues: ['situatie'],
    includeInCloseoutPdf: true,
    includeInInspectionPack: false,
    sortOrder: 10,
  },
  {
    value: 'inverter_before',
    label: 'Bestaande omvormer(s)',
    icon: 'fa-solar-panel',
    includeInCloseoutPdf: true,
    includeInInspectionPack: false,
    sortOrder: 20,
  },
  {
    value: 'situation_after',
    label: 'Situatie na installatie',
    icon: 'fa-camera-retro',
    includeInCloseoutPdf: true,
    includeInInspectionPack: true,
    sortOrder: 30,
  },
  {
    value: 'equipment_after',
    label: 'Toestellen na installatie',
    icon: 'fa-car-battery',
    includeInCloseoutPdf: true,
    includeInInspectionPack: true,
    sortOrder: 40,
  },
  {
    value: 'electrical_cabinet',
    label: 'Elektrische kast',
    icon: 'fa-bolt',
    includeInCloseoutPdf: true,
    includeInInspectionPack: true,
    sortOrder: 50,
  },
  {
    value: 'meter_cabinet',
    label: 'Meterkast / digitale meter',
    icon: 'fa-gauge-high',
    includeInCloseoutPdf: true,
    includeInInspectionPack: true,
    sortOrder: 60,
  },
  {
    value: 'serial',
    label: 'Serienummer',
    icon: 'fa-barcode',
    includeInCloseoutPdf: true,
    includeInInspectionPack: true,
    sortOrder: 70,
  },
  {
    value: 'inspection',
    label: 'Keuring / bewijs',
    icon: 'fa-clipboard-check',
    includeInCloseoutPdf: true,
    includeInInspectionPack: true,
    sortOrder: 80,
  },
  {
    value: 'review',
    label: 'Reviewfoto klant',
    icon: 'fa-star',
    includeInCloseoutPdf: true,
    includeInInspectionPack: false,
    sortOrder: 85,
  },
  {
    value: 'other',
    label: 'Overig',
    icon: 'fa-image',
    includeInCloseoutPdf: false,
    includeInInspectionPack: false,
    sortOrder: 90,
  },
];

export const SERIAL_CATEGORIES = [
  { value: 'battery', label: 'Batterij', legacyValues: ['batterij'] },
  { value: 'inverter', label: 'Omvormer', legacyValues: ['omvormer'] },
  { value: 'battery_inverter', label: 'Omvormer+batterij', legacyValues: ['omvormer_batterij'] },
  { value: 'p1_meter', label: 'P1-meter' },
  { value: 'meter', label: 'Digitale meter / teller' },
  { value: 'gateway', label: 'Gateway/controller' },
  { value: 'other', label: 'Ander toestel' },
];

export const DOCUMENT_KINDS = [
  { value: 'offer', label: 'Offerte', icon: 'fa-file-invoice', includeInCloseoutPdf: true, includeInInspectionPack: false, sortOrder: 10 },
  { value: 'invoice', label: 'Factuur', icon: 'fa-file-invoice-dollar', includeInCloseoutPdf: true, includeInInspectionPack: false, sortOrder: 20 },
  { value: 'pre_inspection_report', label: 'Bestaand keuringsverslag (vóór SmartPeak)', icon: 'fa-file-shield', includeInCloseoutPdf: false, includeInInspectionPack: true, sortOrder: 28 },
  { value: 'inspection_certificate', label: 'Keuringsverslag na onze keuring', icon: 'fa-file-circle-check', includeInCloseoutPdf: true, includeInInspectionPack: true, sortOrder: 30, legacyValues: ['inspection_report'] },
  { value: 'electrical_schema', label: 'Elektrisch schema / plan voor keuring', icon: 'fa-diagram-project', includeInCloseoutPdf: true, includeInInspectionPack: true, sortOrder: 40 },
  { value: 'inspection_support', label: 'Document voor keuring', icon: 'fa-clipboard-check', includeInCloseoutPdf: false, includeInInspectionPack: true, sortOrder: 50 },
  { value: 'datasheet', label: 'Datasheet / technische fiche', icon: 'fa-file-lines', includeInCloseoutPdf: true, includeInInspectionPack: true, sortOrder: 60 },
  { value: 'manual', label: 'Handleiding', icon: 'fa-book', includeInCloseoutPdf: true, includeInInspectionPack: false, sortOrder: 70 },
  { value: 'warranty', label: 'Garantie/documentatie', icon: 'fa-shield-halved', includeInCloseoutPdf: true, includeInInspectionPack: false, sortOrder: 80 },
  { value: 'delivery_note', label: 'Leverbon / pakbon', icon: 'fa-truck-ramp-box', includeInCloseoutPdf: false, includeInInspectionPack: false, sortOrder: 90 },
  { value: 'payment_proof', label: 'Betaalbewijs', icon: 'fa-money-check', includeInCloseoutPdf: false, includeInInspectionPack: false, sortOrder: 100 },
  { value: 'fluvius_data', label: 'Fluvius-data / CSV', icon: 'fa-file-csv', includeInCloseoutPdf: false, includeInInspectionPack: false, sortOrder: 110 },
  { value: 'customer_document', label: 'Document van klant', icon: 'fa-file-user', includeInCloseoutPdf: false, includeInInspectionPack: false, sortOrder: 120 },
  { value: 'internal', label: 'Intern document', icon: 'fa-lock', includeInCloseoutPdf: false, includeInInspectionPack: false, sortOrder: 130 },
  { value: 'other', label: 'Overig', icon: 'fa-file', includeInCloseoutPdf: false, includeInInspectionPack: false, sortOrder: 140 },
];

function normalizeFromList(list, value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const found = list.find(item => item.value === raw || (item.legacyValues || []).includes(raw));
  return found ? found.value : fallback;
}

export function normalizePhotoTag(value) {
  return normalizeFromList(PHOTO_TAGS, value, 'situation_before');
}

export function normalizeSerialCategory(value) {
  return normalizeFromList(SERIAL_CATEGORIES, value, 'battery');
}

export function normalizeDocumentKind(value) {
  return normalizeFromList(DOCUMENT_KINDS, value, 'other');
}

export function photoTagMeta(value) {
  const normalized = normalizePhotoTag(value);
  return PHOTO_TAGS.find(item => item.value === normalized) || PHOTO_TAGS[0];
}

export function serialCategoryMeta(value) {
  const normalized = normalizeSerialCategory(value);
  return SERIAL_CATEGORIES.find(item => item.value === normalized) || SERIAL_CATEGORIES[0];
}

export function documentKindMeta(value) {
  const normalized = normalizeDocumentKind(value);
  return DOCUMENT_KINDS.find(item => item.value === normalized) || DOCUMENT_KINDS[DOCUMENT_KINDS.length - 1];
}

export function defaultDocumentFlags(kind) {
  const meta = documentKindMeta(kind);
  return {
    includeInCloseoutPdf: !!meta.includeInCloseoutPdf,
    includeInInspectionPack: !!meta.includeInInspectionPack,
  };
}

export function defaultPhotoFlags(tag) {
  const meta = photoTagMeta(tag);
  return {
    includeInCloseoutPdf: !!meta.includeInCloseoutPdf,
    includeInInspectionPack: !!meta.includeInInspectionPack,
  };
}
