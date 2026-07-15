import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../assets/css/smartpeak.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('../assets/js/pages/producten-beheer-app.js', import.meta.url), 'utf8');

describe('product master-detail scrolling', () => {
  it('uses independent desktop scroll containers for list and metadata', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*992px\)[\s\S]*?#productLayout[\s\S]*?overflow:\s*hidden/);
    expect(css).toMatch(/#productList\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(css).toMatch(/#productDetailBody\s*\{[\s\S]*?overflow-y:\s*auto/);
  });

  it('keeps product actions visible and resets detail scroll on selection', () => {
    expect(source).toContain('class="detail-actions');
    expect(css).toMatch(/\.detail-actions\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/);
    expect(source).toContain('desktopBody.scrollTop = 0');
  });
});
