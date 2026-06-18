import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
const photoUploaderSource = readFileSync(new URL('../assets/js/photo-uploader.js', import.meta.url), 'utf8');
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

  it('laat de photo-uploader een upload rechtstreeks aan een workflow-tag koppelen', () => {
    expect(photoUploaderSource).toContain('defaultTag:');
    expect(photoUploaderSource).toContain('nextUploadTag:');
    expect(photoUploaderSource).toContain('skipTagModalOnce:');
    expect(photoUploaderSource).toContain('function startUploadForTag(tag, source =');
    expect(photoUploaderSource).toContain('return { refresh, destroy, openByPhotoId, startUploadForTag }');
  });

  it('heeft styling hooks voor de workflow cards en status badges', () => {
    expect(cssSource).toContain('.sp-workflow-grid');
    expect(cssSource).toContain('.sp-workflow-card');
    expect(cssSource).toContain('.sp-workflow-card.is-done');
    expect(cssSource).toContain('.sp-workflow-status');
  });
});
