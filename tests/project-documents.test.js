import { describe, expect, it } from 'vitest';
import {
  buildDocumentTree,
  documentUploadPlan,
  iconForDocument,
  renderDocumentExplorerHtml,
  virtualOfferDocuments,
} from '../assets/js/project-documents.js';

describe('project documents explorer helpers', () => {
  it('maakt bij één upload één bestandrecord zonder automatische map', () => {
    const files = [{ name: 'fluvius.csv', type: 'text/csv', size: 1234 }];

    const plan = documentUploadPlan(files, {
      title: 'Fluvius data',
      description: 'CSV van klant',
      documentKind: 'fluvius_data',
      includeInCloseoutPdf: false,
      includeInInspectionPack: false,
    });

    expect(plan.folder).toBeNull();
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]).toMatchObject({
      title: 'Fluvius data',
      description: 'CSV van klant',
      name: 'fluvius.csv',
      parentId: null,
      documentKind: 'fluvius_data',
    });
  });

  it('maakt bij meerdere uploads één map met de bestanden daaronder', () => {
    const files = [
      { name: 'factuur.pdf', type: 'application/pdf', size: 2000 },
      { name: 'meetdata.csv', type: 'text/csv', size: 1000 },
    ];

    const plan = documentUploadPlan(files, { title: 'Plaatsbezoek', description: 'Alle documenten', parentId: 'root-folder' });

    expect(plan.folder).toMatchObject({
      type: 'folder',
      title: 'Plaatsbezoek',
      description: 'Alle documenten',
      parentId: 'root-folder',
    });
    expect(plan.files.map(f => f.parentId)).toEqual(['__NEW_FOLDER__', '__NEW_FOLDER__']);
    expect(plan.files.map(f => f.title)).toEqual(['factuur.pdf', 'meetdata.csv']);
  });

  it('bouwt een Explorer-boom met mappen en losse bestanden', () => {
    const tree = buildDocumentTree([
      { id: 'f1', type: 'folder', title: 'CSV pakket', parentId: null },
      { id: 'd1', type: 'file', title: 'fluvius.csv', parentId: 'f1' },
      { id: 'd2', type: 'file', title: 'contract.pdf', parentId: null },
    ]);

    expect(tree.roots.map(n => n.id)).toEqual(['f1', 'd2']);
    expect(tree.byId.get('f1').children.map(n => n.id)).toEqual(['d1']);
  });

  it('rendert mappen, pdf/csv iconen, verplaats-acties en inklapknop', () => {
    const tree = buildDocumentTree([
      { id: 'f1', type: 'folder', title: 'CSV pakket', description: 'MyFluvius', parentId: null },
      { id: 'd1', type: 'file', title: 'fluvius.csv', name: 'fluvius.csv', contentType: 'text/csv', parentId: 'f1' },
      { id: 'd2', type: 'file', title: 'offerte.pdf', name: 'offerte.pdf', contentType: 'application/pdf', parentId: null },
    ]);

    const html = renderDocumentExplorerHtml(tree);

    expect(iconForDocument({ contentType: 'application/pdf' })).toBe('fa-file-pdf');
    expect(iconForDocument({ name: 'data.csv' })).toBe('fa-file-csv');
    expect(html).toContain('CSV pakket');
    expect(html).toContain('fluvius.csv');
    expect(html).toContain('data-doc-action="move"');
    expect(html).toContain('data-doc-action="toggle-folder"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('fa-folder');
  });

  it('rendert ingeklapte mappen zonder kinderen zichtbaar te tonen', () => {
    const tree = buildDocumentTree([
      { id: 'f1', type: 'folder', title: 'CSV pakket', parentId: null },
      { id: 'd1', type: 'file', title: 'fluvius.csv', name: 'fluvius.csv', parentId: 'f1' },
    ]);

    const html = renderDocumentExplorerHtml(tree, new Set(['f1']));

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('sp-doc-children d-none');
    expect(html).toContain('fa-chevron-right');
  });

  it('rendert lange documentnamen met wrap-klassen voor mobiele layout', () => {
    const longName = '1780594218136916574385092287590.jpg';
    const tree = buildDocumentTree([
      { id: 'd1', type: 'file', title: longName, name: longName, contentType: 'image/jpeg', parentId: null },
    ]);

    const html = renderDocumentExplorerHtml(tree);

    expect(html).toContain('sp-doc-content');
    expect(html).toContain('sp-doc-title');
    expect(html).toContain('sp-doc-meta');
    expect(html).not.toContain('text-truncate');
  });

  it('rendert documenttype en dossierbadges', () => {
    const tree = buildDocumentTree([
      {
        id: 'd1',
        type: 'file',
        title: 'Schema.pdf',
        name: 'schema.pdf',
        contentType: 'application/pdf',
        documentKind: 'electrical_schema',
        includeInCloseoutPdf: true,
        includeInInspectionPack: true,
        parentId: null,
      },
    ]);

    const html = renderDocumentExplorerHtml(tree);

    expect(html).toContain('Elektrisch schema');
    expect(html).toContain('Opleverdossier');
    expect(html).toContain('Keuring');
  });

  it('zet offertes als read-only virtuele documenten klaar', () => {
    const docs = virtualOfferDocuments({
      offertes: {
        zendure_2x2: {
          filename: 'offerte.pdf',
          storagePath: 'projects/p1/offertes/zendure_2x2.pdf',
          sizeBytes: 123,
        },
      },
    });

    expect(docs).toEqual([
      expect.objectContaining({
        id: 'virtual-offer-zendure_2x2',
        virtual: true,
        source: 'project.offertes',
        documentKind: 'offer',
        includeInCloseoutPdf: true,
      }),
    ]);

    const html = renderDocumentExplorerHtml(buildDocumentTree(docs));
    expect(html).toContain('Offerte');
    expect(html).not.toContain('data-doc-action="delete"');
  });
});
