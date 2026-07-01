import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
const projectEditSource = readFileSync(new URL('../assets/js/pages/project-edit-app.js', import.meta.url), 'utf8');
const photoUploaderSource = readFileSync(new URL('../assets/js/photo-uploader.js', import.meta.url), 'utf8');
const documentSource = readFileSync(new URL('../assets/js/project-documents.js', import.meta.url), 'utf8');
const taxonomySource = readFileSync(new URL('../assets/js/project-taxonomy.js', import.meta.url), 'utf8');
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
    expect(dashboardSource).toContain("openWorkflowPhotoTypeModal('camera', WORKFLOW_INSTALLATION_PHOTO_TAGS, 'equipment_after')");
    expect(dashboardSource).toContain("openWorkflowPhotoTypeModal('camera', WORKFLOW_AFTER_PHOTO_TAGS, 'situation_after')");
    expect(dashboardSource).toContain("openWorkflowPhotoTypeModal('gallery', WORKFLOW_AFTER_PHOTO_TAGS, 'situation_after')");
    expect(dashboardSource).toContain('WORKFLOW_INSTALLATION_PHOTO_TAGS');
    expect(dashboardSource).toContain('WORKFLOW_AFTER_PHOTO_TAGS');
    expect(dashboardSource).toContain('openWorkflowInspectionModal(project)');
    expect(dashboardSource).toContain('data-workflow-action="pre-inspection-docs"');
    expect(dashboardSource).toContain("documentKind: 'pre_inspection_report'");
    expect(dashboardSource).toContain("documentKind: 'inspection_certificate'");
    expect(dashboardSource).toContain('startUploadWithMeta');
  });

  it('houdt voor-documenten en keuringsverslag na keuring apart', () => {
    expect(taxonomySource).toContain("value: 'pre_inspection_report'");
    expect(taxonomySource).toContain('Bestaand keuringsverslag (vóór SmartPeak)');
    expect(taxonomySource).toContain('Keuringsverslag na onze keuring');
    expect(taxonomySource).toContain('Elektrisch schema / plan voor keuring');
    expect(dashboardSource).toContain("['pre_inspection_report', 'electrical_schema', 'inspection_support']");
    expect(dashboardSource).toContain("doc.documentKind === 'inspection_certificate'");
    expect(dashboardSource).toContain('hasCompletedInspection(_currentDrawerProject) && postInspectionCount > 0');
  });

  it('zet voorinstallatiechecks pas groen wanneer alle verplichte velden en metingen ingevuld zijn', () => {
    expect(dashboardSource).toContain('function hasCompleteWorkflowChecks(project)');
    expect(dashboardSource).toContain('function hasAnyWorkflowChecks(project)');
    expect(dashboardSource).toContain('checksBeforePartial: hasAnyWorkflowChecks(project) && !hasCompleteWorkflowChecks(project)');
    expect(dashboardSource).toContain('Deels ingevuld');
    expect(dashboardSource).toContain('fa-circle-half-stroke');
    expect(dashboardSource).toContain('if (!connectionType || requiredVoltageKeys.length === 0) return false;');
    expect(dashboardSource).toContain('isWorkflowFilled(electrical.fuseRatingA)');
    expect(dashboardSource).toContain('isWorkflowTriFilled(cabinet.hasRemAutomaat)');
    expect(dashboardSource).toContain('isWorkflowFilled(measurements.earthResistanceOhm)');
    expect(dashboardSource).toContain('...requiredVoltageKeys.map(key => isWorkflowFilled(voltage[key]))');
    expect(dashboardSource).not.toContain('measurements.technicalNotes || Object.values(voltage).some');
  });

  it('toont een tussenstatus wanneer workflowdata gestart maar nog niet volledig is', () => {
    expect(dashboardSource).toContain('partial = false');
    expect(dashboardSource).toContain("!status.done && status.partial ? 'is-partial' : ''");
    expect(dashboardSource).toContain('status: { done: done.checksBefore, partial: done.checksBeforePartial }');
    expect(dashboardSource).toContain('inspectionPartial: hasAnyInspectionInfo(project)');
    expect(dashboardSource).toContain('partial: hasAnyInspectionInfo(_currentDrawerProject) || postInspectionCount > 0');
    expect(cssSource).toContain('.sp-workflow-card.is-partial');
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

  it('voorkomt dubbele serienummers wanneer input en blur/change dezelfde nieuwe rij afvuren', () => {
    expect(projectEditSource).toContain('let _newSerialAddTimer');
    expect(projectEditSource).toContain('clearTimeout(_newSerialAddTimer);');
    expect(projectEditSource).toContain('_newSerialAddTimer = setTimeout(async () => {');
    expect(projectEditSource).toContain("if (row.dataset.serialAdding === 'true') return;");
    expect(projectEditSource).toContain("const latestValue = (e.target.value || '').trim();");
    expect(projectEditSource).toContain('const entry = await addProjectSerial(PROJECT_ID, latestValue);');
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
    expect(documentSource).toContain('const defaultMeta = presetUploadMeta || {}');
    expect(documentSource).toContain('const meta = await promptMeta(files, uploadParentTitle, defaultMeta)');
    expect(documentSource).toContain("documentKind: defaults.documentKind || 'other'");
    expect(documentSource).toContain("includeInInspectionPack: 'includeInInspectionPack' in defaults");
    expect(documentSource).toContain('options.onCountChange(state.entries.length, state.entries)');
  });

  it('heeft styling hooks voor de workflow cards en status badges', () => {
    expect(cssSource).toContain('.sp-workflow-grid');
    expect(cssSource).toContain('.sp-workflow-card');
    expect(cssSource).toContain('.sp-workflow-card.is-done');
    expect(cssSource).toContain('.sp-workflow-card.is-partial');
    expect(cssSource).toContain('.sp-workflow-status');
  });
});
