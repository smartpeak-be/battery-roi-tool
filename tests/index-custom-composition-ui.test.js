import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../assets/js/pages/index-app.js', import.meta.url), 'utf8');

describe('index custom composition UI', () => {
  it('shows only two starter buttons and moves existing-config search into a modal', () => {
    const renderStartPanel = source.slice(source.indexOf('function renderConfigPickers'), source.indexOf('// Legacy shim'));
    expect(renderStartPanel).toContain('id="startEmptyComposition"');
    expect(renderStartPanel).toContain('Leeg starten');
    expect(renderStartPanel).toContain('id="startFromComposition"');
    expect(renderStartPanel).toContain('Starten van bestaande');
    expect(renderStartPanel).not.toContain('id="compositionSearch"');
    expect(renderStartPanel).not.toContain('id="baseCompositionSelect"');

    expect(source).toContain('function _ensureBaseCompositionModal');
    expect(source).toContain('id="compositionSearch"');
    expect(source).toContain('id="baseCompositionSelect"');
    expect(source).toContain('id="baseCompositionUse"');
    expect(source).toContain('_openBaseCompositionModal();');
  });

  it('lets custom compositions keep an explicit name, customer explanation and supports installation extra lines', () => {
    expect(source).toContain('id="composerCompositionName"');
    expect(source).toContain('id="composerCompositionDescription"');
    expect(source).toContain('Uitleg voor klant');
    expect(source).toContain("_customCompositions[type].description = (modal.querySelector('#composerCompositionDescription')?.value || '').trim();");
    expect(source).toContain('function renderCompositionDescriptionHtml');
    expect(source).toContain('composition-description');
    expect(source).toContain('const explicitName = (modal.querySelector(\'#composerCompositionName\')?.value || \'\').trim();');
    expect(source).toContain('value="installation_extra"');
    expect(source).toContain("kindValue === 'installation_extra'");
    expect(source).toContain("ln.kind === 'installation_extra'");
    expect(source).toContain('const compositionNames = {};');
    expect(source).toContain('const compositionDescriptions = {};');
    expect(source).toContain('compositionNames[cr.cfg.type] = name;');
    expect(source).toContain('compositionDescriptions[cr.cfg.type] = description;');
    expect(source).toContain('compositionNames: Object.keys(compositionNames).length > 0 ? compositionNames : null');
    expect(source).toContain('compositionDescriptions: Object.keys(compositionDescriptions).length > 0 ? compositionDescriptions : null');
    expect(source).toContain('_restoredCompositionNames = state.v === 6 && state.compositionNames');
    expect(source).toContain('_restoredCompositionDescriptions = state.v === 6 && state.compositionDescriptions');
  });

  it('renders a project-mode quote button for calculated custom compositions without clearing project context on restore', () => {
    expect(source).toContain('function quotePreviewUrlForCalculatedConfig');
    expect(source).toContain('buildQuoteContextFromProjectConfig(project, configType');
    expect(source).toContain('buildQuoteContextUrl(context, \'producten-beheer.html\')');
    expect(source).toContain('Offerte maken ↗');
    expect(source).toContain('${quoteBtn}');
    expect(source).toContain('let _suppressProjectCalcAutoSave = false;');
    expect(source).toContain('if (_projectId && _projectDoc && !_suppressProjectCalcAutoSave)');
    expect(source).not.toContain('_projectDoc = null;\n      _applyLoadedState(restored, /*showBanner*/ false);');
  });
});
