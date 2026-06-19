import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
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

  it('start situatiefotos voor-installatie als afgebakend blok met vaste fotocategorie', () => {
    expect(dashboardSource).toContain('data-workflow-action="photos-before-camera"');
    expect(dashboardSource).toContain('data-workflow-action="photos-before-gallery"');
    expect(dashboardSource).toContain("startUploadForTag('situation_before', 'camera')");
    expect(dashboardSource).toContain("startUploadForTag('situation_before', 'gallery')");
    expect(dashboardSource).toContain('setWorkflowPhotoCounts(photos)');
  });

  it('maakt alle workflowblokjes aanklikbaar met gerichte acties', () => {
    expect(dashboardSource).toContain('data-workflow-action="checks-before"');
    expect(dashboardSource).toContain('openWorkflowChecksModal(project)');
    expect(dashboardSource).toContain('data-workflow-action="measurements"');
    expect(dashboardSource).toContain('openWorkflowMeasurementsModal(project)');
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
    expect(dashboardSource).toContain('hasRemAutomaat: valByName');
    expect(dashboardSource).toContain('lineGroundChecked: lineGround');
    expect(dashboardSource).toContain('technical: {');
    expect(dashboardSource).toContain('voltageMeasurements: {');
    expect(dashboardSource).toContain('inspection: {');
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
