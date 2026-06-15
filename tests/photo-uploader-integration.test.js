import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const photoUploaderSource = readFileSync(new URL('../assets/js/photo-uploader.js', import.meta.url), 'utf8');
const firebaseSource = readFileSync(new URL('../assets/js/firebase-init.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../assets/css/smartpeak.css', import.meta.url), 'utf8');

describe('project photo category editing integration', () => {
  it('toont categorie metadata in de lightbox en voorziet retag-actie', () => {
    expect(photoUploaderSource).toContain('data-pu-lightbox-meta');
    expect(photoUploaderSource).toContain('data-pu-lightbox-tag-label');
    expect(photoUploaderSource).toContain('aria-label="Fotocategorie wijzigen"');
    expect(photoUploaderSource).toContain('_updateLightboxMeta');
    expect(photoUploaderSource).toContain('_openEditTagModal(photo)');
  });

  it('kan bestaande fotos hercategoriseren via een gedeelde Firestore helper', () => {
    expect(firebaseSource).toContain('async function updateProjectPhotoTag(projectId, photoId, tag, serialCategory)');
    expect(firebaseSource).toContain('window.updateProjectPhotoTag = updateProjectPhotoTag;');
    expect(photoUploaderSource).toContain('await updateProjectPhotoTag(options.projectId, photo.id, tag, category);');
    expect(photoUploaderSource).toContain("await updateProjectPhotoTag(options.projectId, photo.id, tag, null);");
  });

  it('heeft styling voor zichtbaar categorielabel en modal boven de lightbox', () => {
    expect(cssSource).toContain('.pu-lightbox-meta');
    expect(cssSource).toContain('.pu-lightbox-tag');
    expect(cssSource).toContain('.sp-lightbox .retag');
    expect(cssSource).toContain('#pu-tag-modal');
    expect(cssSource).toContain('z-index: 1095');
  });
});
