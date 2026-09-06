import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');

describe('dashboard electrical schema action', () => {
  it('opens the schema tool with the selected project id from the project drawer', () => {
    expect(app).toContain('href="schema/?project=${encodeURIComponent(project.id)}"');
    expect(app).toContain("Elektrische schema's");
  });
});