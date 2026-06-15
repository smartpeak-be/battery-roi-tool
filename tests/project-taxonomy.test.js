import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_KINDS,
  PHOTO_TAGS,
  SERIAL_CATEGORIES,
  defaultDocumentFlags,
  defaultPhotoFlags,
  documentKindMeta,
  normalizeDocumentKind,
  normalizePhotoTag,
  normalizeSerialCategory,
  photoTagMeta,
  serialCategoryMeta,
} from '../assets/js/project-taxonomy.js';

describe('project photo/document taxonomy', () => {
  it('normaliseert legacy fototags en serieelcategorieën', () => {
    expect(normalizePhotoTag('situatie')).toBe('situation_before');
    expect(photoTagMeta('situatie').label).toBe('Situatie vóór installatie');
    expect(normalizeSerialCategory('batterij')).toBe('battery');
    expect(serialCategoryMeta('omvormer_batterij').label).toBe('Omvormer+batterij');
  });

  it('bevat vaste fotocategorieën voor filter en dossiers', () => {
    expect(PHOTO_TAGS.map(tag => tag.value)).toEqual([
      'situation_before',
      'inverter_before',
      'situation_after',
      'equipment_after',
      'electrical_cabinet',
      'meter_cabinet',
      'serial',
      'inspection',
      'other',
    ]);
    expect(defaultPhotoFlags('electrical_cabinet')).toEqual({
      includeInCloseoutPdf: true,
      includeInInspectionPack: true,
    });
    expect(defaultPhotoFlags('other')).toEqual({
      includeInCloseoutPdf: false,
      includeInInspectionPack: false,
    });
  });

  it('bevat uitgebreide serienummertypes', () => {
    expect(SERIAL_CATEGORIES.map(cat => cat.value)).toContain('p1_meter');
    expect(SERIAL_CATEGORIES.map(cat => cat.value)).toContain('gateway');
  });

  it('normaliseert documenttypes en dossierdefaults', () => {
    expect(normalizeDocumentKind('electrical_schema')).toBe('electrical_schema');
    expect(normalizeDocumentKind('onbekend')).toBe('other');
    expect(documentKindMeta('inspection_certificate').label).toBe('Keuringsverslag');
    expect(defaultDocumentFlags('electrical_schema')).toEqual({
      includeInCloseoutPdf: true,
      includeInInspectionPack: true,
    });
    expect(defaultDocumentFlags('internal')).toEqual({
      includeInCloseoutPdf: false,
      includeInInspectionPack: false,
    });
    expect(DOCUMENT_KINDS.map(kind => kind.value)).toContain('offer');
  });
});
