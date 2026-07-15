import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const productsSource = readFileSync(new URL('../assets/js/pages/producten-beheer-app.js', import.meta.url), 'utf8');
const projectEditSource = readFileSync(new URL('../assets/js/pages/project-edit-app.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
const calculatorSource = readFileSync(new URL('../assets/js/pages/index-app.js', import.meta.url), 'utf8');

describe('grid compatibility UI integration', () => {
  it('renders and persists product grid compatibility checkboxes', () => {
    expect(productsSource).toContain('GRID_CONNECTION_TYPES');
    expect(productsSource).toContain('data-grid-connection');
    expect(productsSource).toContain('gridCompatibility: readGridCompatibilityFromForm(container)');
  });

  it('supports the delta-derived single-phase project connection on both project screens', () => {
    expect(projectEditSource).toContain("'1x230-delta'");
    expect(dashboardSource).toContain("'1x230-delta'");
  });

  it('passes the project connection type to the composition resolver', () => {
    expect(calculatorSource).toContain('const connectionType = _projectDoc?.electrical?.connectionType || null');
    expect(calculatorSource).toMatch(/productConfigsToCalcConfigs\([\s\S]*?\{\s*connectionType,\s*\}\)/);
  });
});
