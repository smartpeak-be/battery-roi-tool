import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
const projectEditSource = readFileSync(new URL('../assets/js/pages/project-edit-app.js', import.meta.url), 'utf8');
const photoUploaderSource = readFileSync(new URL('../assets/js/photo-uploader.js', import.meta.url), 'utf8');
const documentSource = readFileSync(new URL('../assets/js/project-documents.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../assets/css/smartpeak.css', import.meta.url), 'utf8');

describe('project workflow quick menu', () => {
  it('voorziet een mobile-friendly werkflow tab in de projectdrawer', () => {
    expect(dashboardSource).toContain('id="drawerWorkflowTab"');
    expect(dashboardSource).toContain('data-bs-target="#drawerWorkflowPane"');
    expect(dashboardSource).toContain('id="drawerWorkflowMount"');
    expect(dashboardSource).toContain('renderProjectWorkflowQuickMenu(project)');
    expect(dashboardSource).toContain('wireProjectWorkflowQuickMenu(project)');
  });

  it('laat bij situatiefotos eerst de concrete fotocategorie kiezen', () => {
    expect(dashboardSource).toContain('data-workflow-action="photos-before-camera"');
    expect(dashboardSource).toContain('data-workflow-action="photos-before-gallery"');
    expect(dashboardSource).toContain('openWorkflowPhotoTypeModal(\'camera\')');
    expect(dashboardSource).toContain('openWorkflowPhotoTypeModal(\'gallery\')');
    expect(dashboardSource).toContain('WORKFLOW_BEFORE_PHOTO_TAGS');
    expect(dashboardSource).toContain('electrical_cabinet');
    expect(dashboardSource).toContain('meter_cabinet');
    expect(dashboardSource).toContain('inverter_before');
    expect(dashboardSource).toContain('setWorkflowPhotoCounts(photos)');
  });

  it('maakt alle workflowblokjes aanklikbaar met gerichte acties', () => {
    expect(dashboardSource).toContain('data-workflow-action="checks-before"');
    expect(dashboardSource).toContain('openWorkflowChecksModal(project)');
    expect(dashboardSource).toContain('data-workflow-action="solar-inverters"');
    expect(dashboardSource).toContain('openWorkflowSolarModal(project)');
    expect(dashboardSource).toContain("startUploadForTag('equipment_after', 'camera')");
    expect(dashboardSource).toContain("startUploadForTag('situation_after', 'camera')");
    expect(dashboardSource).toContain("startUploadForTag('situation_after', 'gallery')");
    expect(dashboardSource).toContain('openWorkflowInspectionModal(project)');
    expect(dashboardSource).toContain('startUploadWithMeta');
  });

  it('slaat workflow formulieren op in echte projectmetadata', () => {
    expect(dashboardSource).toContain('Aansluiting & voorinstallatie');
    expect(dashboardSource).toContain('name="connectionType"');
    expect(dashboardSource).toContain('fuseRatingA: numberOrNull');
    expect(dashboardSource).toContain('freeUnits: numberOrNull');
    expect(dashboardSource).toContain('wiringDiameterMm2: numberOrNull');
    expect(dashboardSource).toContain("hasRemAutomaat: triValue(valByName(form, 'hasRemAutomaat'))");
    expect(dashboardSource).toContain('Plaats voor batterijen?');
    expect(dashboardSource).toContain("batteryPlacementRoom: triValue(valByName(form, 'batteryPlacementRoom'))");
    expect(dashboardSource).toContain('lineGroundChecked: lineGround');
    expect(dashboardSource).toContain('technical: {');
    expect(dashboardSource).toContain('voltageMeasurements: collectWorkflowVoltages(form, connectionType)');
    expect(dashboardSource).toContain('workflowVoltageFieldsHtml(el.connectionType, voltage)');
    expect(dashboardSource).toContain('solar: { inverters: nextInverters }');
    expect(dashboardSource).toContain('panelBrand');
    expect(dashboardSource).toContain('data-workflow-add-inverter');
    expect(dashboardSource).toContain('data-workflow-remove-inverter');
    expect(dashboardSource).toContain('const circuitCount = workflowSolarCircuitCount(inv)');
    expect(dashboardSource).toContain('Array.from({ length: circuitCount }');
    expect(dashboardSource).toContain('inspection: {');
  });

  it('toont workflow checks en voorinstallatie-notities opnieuw in project bewerken', () => {
    expect(dashboardSource).toContain('const triValue = (value) =>');
    expect(dashboardSource).toContain("value === true || value === 'true' || value === 'yes'");
    expect(projectEditSource).toContain('function normalizeTriState(value)');
    expect(projectEditSource).toContain("value === true || value === 'true' || value === 'yes'");
    expect(projectEditSource).toContain('id="fPreInstallationNotes"');
    expect(projectEditSource).toContain('c.preInstallationNotes ||');
    expect(projectEditSource).toContain('_project.cabinet.preInstallationNotes = e.target.value || null');
  });

  it('laat de photo-uploader een upload rechtstreeks aan een workflow-tag koppelen', () => {
    expect(photoUploaderSource).toContain('defaultTag:');
    expect(photoUploaderSource).toContain('nextUploadTag:');
    expect(photoUploaderSource).toContain('skipTagModalOnce:');
    expect(photoUploaderSource).toContain('function startUploadForTag(tag, source =');
    expect(photoUploaderSource).toContain('return { refresh, destroy, openByPhotoId, startUploadForTag }');
  });

  it('laat de documentverkenner een workflowupload met vaste metadata starten', () => {
    expect(documentSource).toContain('startUploadWithMeta(meta = {}, parentId = null)');
    expect(documentSource).toContain('presetUploadMeta = { ...defaults, ...meta }');
    expect(documentSource).toContain('const meta = presetUploadMeta || await promptMeta(files, uploadParentTitle)');
  });

  it('heeft styling hooks voor de workflow cards en status badges', () => {
    expect(cssSource).toContain('.sp-workflow-grid');
    expect(cssSource).toContain('.sp-workflow-card');
    expect(cssSource).toContain('.sp-workflow-card.is-done');
    expect(cssSource).toContain('.sp-workflow-status');
  });
});
