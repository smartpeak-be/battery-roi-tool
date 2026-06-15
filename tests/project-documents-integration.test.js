import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
const firebaseSource = readFileSync(new URL('../assets/js/firebase-init.js', import.meta.url), 'utf8');
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

describe('project documents dashboard integration', () => {
  it('voorziet een documenten-tab naast fotos in de projectdrawer', () => {
    expect(dashboardSource).toContain('mountProjectDocuments');
    expect(dashboardSource).toContain('onCountChange: setDrawerDocumentsCount');
    expect(dashboardSource).toContain('function setDrawerDocumentsCount(count)');
    expect(dashboardSource).toContain('id="drawerMediaTabs"');
    expect(dashboardSource).toContain('data-bs-target="#drawerDocumentsPane"');
    expect(dashboardSource).toContain('id="drawerDocumentsMount"');
    expect(dashboardSource).toContain('mountProjectDocuments(document.getElementById(\'drawerDocumentsMount\')');
    expect(dashboardSource).toContain('project,');
  });

  it('heeft Firestore/Storage helpers voor mappen, upload, verplaatsen, verwijderen en cascade-delete', () => {
    expect(firebaseSource).toContain('async function createProjectDocumentFolder(projectId, meta = {})');
    expect(firebaseSource).toContain('async function uploadProjectDocument(projectId, file, meta = {})');
    expect(firebaseSource).toContain('async function moveProjectDocument(projectId, documentId, parentId)');
    expect(firebaseSource).toContain('async function deleteProjectDocument(projectId, documentId)');
    expect(firebaseSource).toContain('projects/${projectId}/documents/${ts}_${safeName}');
    expect(firebaseSource).toContain("documentKind: String(meta.documentKind || 'other').trim() || 'other'");
    expect(firebaseSource).toContain("if ('documentKind' in patch) data.documentKind");
    expect(firebaseSource).toContain('window.listProjectDocuments = listProjectDocuments;');
    expect(firebaseSource).toContain('const documentsSnap = await projectDoc(id).collection(\'documents\').get();');
    expect(firebaseSource).toContain('Document storage delete failed');
  });

  it('laat de documents subcollectie toe in Firestore rules', () => {
    expect(firestoreRules).toContain('match /documents/{documentId}');
    expect(firestoreRules).toContain('allow read, write: if isWhitelisted();');
  });
});
