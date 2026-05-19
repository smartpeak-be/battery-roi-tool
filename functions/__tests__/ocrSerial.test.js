import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @google-cloud/vision before importing the function module.
const mockTextDetection = vi.fn();
vi.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: vi.fn().mockImplementation(() => ({
    textDetection: mockTextDetection,
  })),
}));

// Mock firebase-admin Storage + Firestore.
const mockDownload = vi.fn();
const mockRunTransaction = vi.fn();
const mockProjectDocGet = vi.fn();
const mockProjectDocUpdate = vi.fn();
const mockPhotoDocUpdate = vi.fn();
vi.mock('firebase-admin', () => {
  const admin = {
    initializeApp: vi.fn(),
    apps: [],
    firestore: () => ({
      runTransaction: mockRunTransaction,
      collection: () => ({
        doc: () => ({
          get: mockProjectDocGet,
          update: mockProjectDocUpdate,
          collection: () => ({
            doc: () => ({ update: mockPhotoDocUpdate }),
          }),
        }),
      }),
    }),
    storage: () => ({
      bucket: () => ({
        file: () => ({ download: mockDownload }),
      }),
    }),
  };
  admin.firestore.FieldValue = {
    arrayUnion: (x) => ({ __op: 'arrayUnion', value: x }),
    arrayRemove: (x) => ({ __op: 'arrayRemove', value: x }),
    delete: () => ({ __op: 'delete' }),
    serverTimestamp: () => ({ __op: 'serverTimestamp' }),
  };
  admin.firestore.Timestamp = { now: () => ({ __ts: Date.now() }) };
  return { default: admin, ...admin };
});

// Re-import after mocks are in place.
const { handleOcrSerial, shouldRun, shouldCleanup } = await import('../index.js');

function makeEvent({ before, after, projectId = 'P', photoId = 'PH' }) {
  return {
    data: {
      before: before ? { data: () => before } : null,
      after: after ? { data: () => after } : null,
    },
    params: { projectId, photoId },
  };
}

describe('handleOcrSerial — happy path', () => {
  beforeEach(() => {
    mockTextDetection.mockReset();
    mockDownload.mockReset();
    mockRunTransaction.mockReset();
    mockProjectDocGet.mockReset();
    mockProjectDocUpdate.mockReset();
    mockPhotoDocUpdate.mockReset();
  });

  it('detects serial, appends entry, updates photo-doc ocrStatus=ok', async () => {
    mockDownload.mockResolvedValue([Buffer.from('fake-jpeg-bytes')]);
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [
        { description: 'FULL TEXT\nMARSTEK\nSN: ABCD1234\nMODEL X' },
        { description: 'MARSTEK' },
        { description: 'SN' },
        { description: 'ABCD1234' },
        { description: 'MODEL' },
        { description: 'X' },
      ],
    }]);
    mockRunTransaction.mockImplementation(async (fn) => {
      // Simulate transaction by giving the callback a fake txn object.
      const txn = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ serialNumbers: [] }),
        }),
        update: vi.fn(),
      };
      return fn(txn);
    });

    const event = makeEvent({
      before: null,
      after: {
        tag: 'serial',
        serialCategory: 'batterij',
        ocrStatus: 'pending',
        storagePath: 'projects/P/123_foto.jpg',
        uploadedBy: 'kevin@bloxit.be',
      },
    });
    await handleOcrSerial(event);

    expect(mockTextDetection).toHaveBeenCalled();
    expect(mockRunTransaction).toHaveBeenCalled();
  });
});

describe('shouldRun / shouldCleanup guards', () => {
  it('runs when fresh tag→serial', () => {
    expect(shouldRun(null, { tag: 'serial', storagePath: 'x' })).toBe(true);
    expect(shouldRun({ tag: 'situatie' }, { tag: 'serial', storagePath: 'x' })).toBe(true);
  });

  it('runs when category changes on already-serial photo', () => {
    expect(shouldRun(
      { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'ok', storagePath: 'x' },
      { tag: 'serial', serialCategory: 'omvormer', ocrStatus: 'ok', storagePath: 'x' },
    )).toBe(true);
  });

  it('runs when ocrStatus transitions to null (re-run requested)', () => {
    expect(shouldRun(
      { tag: 'serial', ocrStatus: 'failed', storagePath: 'x' },
      { tag: 'serial', ocrStatus: null, storagePath: 'x' },
    )).toBe(true);
  });

  it('does not run on cosmetic update (same category, same status)', () => {
    expect(shouldRun(
      { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'ok' },
      { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'ok' },
    )).toBe(false);
  });

  it('does not run when after has no storagePath', () => {
    expect(shouldRun(null, { tag: 'serial' })).toBe(false);
  });

  it('cleanup fires when retag serial→situatie', () => {
    expect(shouldCleanup(
      { tag: 'serial', serialEntryId: 'sn_1' },
      { tag: 'situatie' },
    )).toBe(true);
  });

  it('cleanup fires when serial photo is deleted', () => {
    expect(shouldCleanup({ tag: 'serial', serialEntryId: 'sn_1' }, null)).toBe(true);
  });

  it('cleanup does not fire on first-time create', () => {
    expect(shouldCleanup(null, { tag: 'serial' })).toBe(false);
  });
});

describe('handleOcrSerial — failure paths', () => {
  beforeEach(() => {
    mockTextDetection.mockReset();
    mockDownload.mockReset();
    mockRunTransaction.mockReset();
    mockPhotoDocUpdate.mockReset();
  });

  it('writes ocrStatus=failed when Vision throws AND inserts placeholder entry', async () => {
    mockDownload.mockResolvedValue([Buffer.from('x')]);
    mockTextDetection.mockRejectedValue(new Error('vision-down'));

    const txnUpdateCalls = [];
    mockRunTransaction.mockImplementation(async (fn) => {
      const txn = {
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ serialNumbers: [] }) }),
        update: vi.fn((ref, payload) => txnUpdateCalls.push({ ref, payload })),
      };
      return fn(txn);
    });

    const event = makeEvent({
      before: null,
      after: { tag: 'serial', serialCategory: 'omvormer_batterij', ocrStatus: 'pending', storagePath: 'p.jpg' },
    });
    await handleOcrSerial(event);

    // Project-doc must get a failed placeholder entry so the renderer shows a
    // re-run knop instead of nothing.
    const projectUpdate = txnUpdateCalls.find(c => Array.isArray(c.payload.serialNumbers));
    expect(projectUpdate).toBeTruthy();
    expect(projectUpdate.payload.serialNumbers).toHaveLength(1);
    expect(projectUpdate.payload.serialNumbers[0]).toMatchObject({
      value: '',
      ocrStatus: 'failed',
      category: 'omvormer_batterij',
      source: 'ocr',
      photoId: 'PH',
    });

    // Photo-doc must get ocrStatus=failed + ocrError + serialEntryId so
    // cleanup-on-retag can find the placeholder later.
    const photoUpdate = txnUpdateCalls.find(c => c.payload.ocrError !== undefined);
    expect(photoUpdate).toBeTruthy();
    expect(photoUpdate.payload.ocrStatus).toBe('failed');
    expect(photoUpdate.payload.ocrError).toBe('vision-down');
    expect(photoUpdate.payload.serialEntryId).toBe(projectUpdate.payload.serialNumbers[0].id);
  });

  it('writes failed when Vision returns no candidates', async () => {
    mockDownload.mockResolvedValue([Buffer.from('x')]);
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [
        { description: 'FULL\nABC\nXYZ' },
        { description: 'ABC' },
        { description: 'XYZ' },
      ], // none ≥ 6 alphanumeric
    }]);
    const txnUpdateCalls = [];
    mockRunTransaction.mockImplementation(async (fn) => {
      const txn = {
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ serialNumbers: [] }) }),
        update: vi.fn((ref, payload) => txnUpdateCalls.push({ ref, payload })),
      };
      return fn(txn);
    });

    const event = makeEvent({
      before: null,
      after: { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'pending', storagePath: 'p.jpg' },
    });
    await handleOcrSerial(event);

    // Transaction should have been called even with no detected serial,
    // writing the placeholder failed-entry on the project-doc AND the failure
    // metadata on the photo-doc.
    expect(mockRunTransaction).toHaveBeenCalled();

    const projectUpdate = txnUpdateCalls.find(c => Array.isArray(c.payload.serialNumbers));
    expect(projectUpdate).toBeTruthy();
    expect(projectUpdate.payload.serialNumbers).toHaveLength(1);
    expect(projectUpdate.payload.serialNumbers[0]).toMatchObject({
      value: '',
      ocrStatus: 'failed',
      category: 'batterij',
      source: 'ocr',
      photoId: 'PH',
    });

    const photoUpdate = txnUpdateCalls.find(c => c.payload.ocrCandidates !== undefined);
    expect(photoUpdate).toBeTruthy();
    expect(photoUpdate.payload.ocrStatus).toBe('failed');
    expect(photoUpdate.payload.ocrError).toBe('no-text-detected');
  });
});

describe('handleOcrSerial — idempotency', () => {
  it('updates existing serial entry when fired twice for same photoId', async () => {
    mockDownload.mockResolvedValue([Buffer.from('x')]);
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [
        { description: 'FULL\nXYZ123456' },
        { description: 'XYZ123456' },
      ],
    }]);
    let txnUpdateCalls = [];
    mockRunTransaction.mockImplementation(async (fn) => {
      const txn = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            serialNumbers: [
              { id: 'sn_old', value: 'OLD', photoId: 'PH', source: 'ocr' },
            ],
          }),
        }),
        update: vi.fn((ref, payload) => txnUpdateCalls.push(payload)),
      };
      return fn(txn);
    });

    // Re-run scenario: client sets ocrStatus from 'failed' back to null to
    // request a fresh OCR pass; an entry from the previous run already exists.
    const event = makeEvent({
      before: { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'failed', storagePath: 'p.jpg' },
      after: { tag: 'serial', serialCategory: 'batterij', ocrStatus: null, storagePath: 'p.jpg' },
    });
    await handleOcrSerial(event);

    const projectUpdate = txnUpdateCalls.find(p => Array.isArray(p.serialNumbers));
    expect(projectUpdate.serialNumbers).toHaveLength(1);
    expect(projectUpdate.serialNumbers[0].id).toBe('sn_old');
    expect(projectUpdate.serialNumbers[0].value).toBe('XYZ123456');
  });
});
