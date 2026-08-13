import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('eendraadschema MVP integration', () => {
  const html = read('schema/index.html');
  const app = read('assets/js/pages/electrical-schema-app.js');
  const css = read('assets/css/electrical-schema.css');
  const firebase = read('assets/js/firebase-init.js');
  const rules = read('firestore.rules');

  it('has touch-first controls for the three basic block types', () => {
    expect(html).toContain('Differentieel toevoegen');
    expect(app).toContain("data-action=\"add-breaker\"");
    expect(app).toContain("data-action=\"add-circuit\"");
    expect(css).toContain('--schema-touch: 48px');
    expect(css).toContain('@media (max-width: 575.98px)');
  });

  it('uses unique drawing IDs and optional project links in the URL', () => {
    expect(app).toContain("params.get('drawing')");
    expect(app).toContain("params.get('project')");
    expect(app).toContain("next.searchParams.set('drawing', drawingId)");
    expect(firebase).toContain("collection('electricalDrawings')");
    expect(firebase).toContain("where('projectId', '==', projectId)");
  });

  it('protects drawing data with the existing whitelist', () => {
    expect(rules).toMatch(/match \/electricalDrawings\/\{drawingId\}[\s\S]*allow read, write: if isWhitelisted\(\)/);
  });

  it('is linked beside the existing dashboard tools', () => {
    expect(read('dashboard.html')).toContain('href="schema/"');
  });
});
