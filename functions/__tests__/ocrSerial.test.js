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
const { handleOcrSerial } = await import('../index.js');

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
