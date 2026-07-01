import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../bebat-beheer.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../assets/js/pages/bebat-beheer-app.js', import.meta.url), 'utf8');
const projectEditSource = readFileSync(new URL('../assets/js/pages/project-edit-app.js', import.meta.url), 'utf8');

describe('Bebat beheer statussen en bulk save', () => {
  it('toont de extra Bebat-statussen in beheer en project-edit', () => {
    expect(pageSource).toContain('<option value="paid">Betaald</option>');
    expect(pageSource).toContain('<option value="external_fulfilled">Extern voldaan</option>');
    expect(appSource).toContain("paid: 'Betaald'");
    expect(appSource).toContain("external_fulfilled: 'Extern voldaan'");
    expect(projectEditSource).toContain('<option value="paid"');
    expect(projectEditSource).toContain('<option value="external_fulfilled"');
  });

  it('voorziet een knop die alle zichtbare gewijzigde Bebat-rijen opslaat', () => {
    expect(pageSource).toContain('id="btnSaveVisibleChanges"');
    expect(pageSource).toContain('Alle zichtbare wijzigingen opslaan');
    expect(appSource).toContain('function saveVisibleChanges()');
    expect(appSource).toContain("document.querySelectorAll('#bebatTableBody tr[data-project-id][data-serial-id]')");
    expect(appSource).toContain('.filter(rowHasChanges)');
    expect(appSource).toContain('await Promise.all(rows.map(row => updateProjectSerial(');
    expect(appSource).toContain("document.getElementById('btnSaveVisibleChanges').addEventListener('click', saveVisibleChanges)");
  });

  it('bewaart referentie/datum voor geregistreerd, betaald en extern voldaan', () => {
    expect(appSource).toContain("['registered', 'paid', 'external_fulfilled'].includes(values.status)");
    expect(appSource).toContain("['registered', 'paid', 'external_fulfilled'].includes(input.value)");
    expect(appSource).toContain('bebatRegisteredAt: keepsRegistrationMeta');
    expect(appSource).toContain('bebatReference: keepsRegistrationMeta');
  });
});
