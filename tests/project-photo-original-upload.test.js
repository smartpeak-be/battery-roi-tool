import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const firebaseSource = readFileSync(new URL('../assets/js/firebase-init.js', import.meta.url), 'utf8');

describe('project photo original upload', () => {
  it('bewaart de full foto als origineel bestand en comprimeert alleen de thumbnail', () => {
    expect(firebaseSource).toContain('const originalForUpload = workFile;');
    expect(firebaseSource).toContain('putWithProgress(fullPath,  originalForUpload, originalContentType, \'full\'');
    expect(firebaseSource).toContain('makeThumbnail(originalForUpload)');
    expect(firebaseSource).toContain('contentType:      originalContentType,');
    expect(firebaseSource).toContain('sizeBytes:        originalForUpload.size,');
    expect(firebaseSource).not.toContain('const r = await makeFullSizedJpeg(workFile);');
    expect(firebaseSource).not.toContain('fullForUpload = r.blob;');
  });
});
