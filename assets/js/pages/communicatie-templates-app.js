import { escapeHtml, showState, showToast } from '../shared-helpers.js';
import {
  defaultCommunicationTemplates,
  normalizeBlock,
  normalizeTemplate,
  projectVariableDefinitionsByCategory,
  renderTemplateHtml,
  renderTemplatePlainText,
} from '../communication-templates.js';

let _settings = {};
let _templates = [];
let _activeId = null;
let _dirty = false;

function activeTemplate() {
  return normalizeTemplate(_templates.find(t => t.id === _activeId) || _templates[0]);
}

function setDirty(value = true) {
  _dirty = value;
  const btn = document.getElementById('btnSaveTemplate');
  if (btn) btn.classList.toggle('btn-warning', _dirty);
}

function templateStorageFromSettings(settings = {}) {
  const stored = Array.isArray(settings.communicationTemplates) ? settings.communicationTemplates : [];
  const byId = new Map(defaultCommunicationTemplates().map(t => [t.id, normalizeTemplate(t)]));
  stored.forEach(t => byId.set(t.id, normalizeTemplate(t)));
  return [...byId.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nl-BE'));
}

async function loadTemplates() {
  _settings = await getSettings();
  _templates = templateStorageFromSettings(_settings);
  _activeId = _activeId || (_templates[0] && _templates[0].id);
  renderTemplateList();
  renderEditor();
  renderPreview();
  setDirty(false);
}

function persistActiveFromForm() {
  const template = activeTemplate();
  template.name = document.getElementById('templateName').value.trim() || 'Naamloos template';
  template.subject = document.getElementById('templateSubject').value.trim() || 'Onderwerp';
  template.description = document.getElementById('templateDescription').value.trim();
  template.style.brandColor = document.getElementById('styleBrandColor').value;
  template.style.accentColor = document.getElementById('styleAccentColor').value;
  template.style.backgroundColor = document.getElementById('styleBackgroundColor').value;
  template.style.cardColor = document.getElementById('styleCardColor').value;
  template.style.textColor = document.getElementById('styleTextColor').value;
  template.style.borderRadius = parseInt(document.getElementById('styleBorderRadius').value, 10) || 18;
  template.style.customCss = document.getElementById('styleCustomCss').value;
  template.blocks = [...document.querySelectorAll('[data-block-id]')].map((el, index) => normalizeBlock({
    id: el.dataset.blockId,
    type: el.querySelector('[data-block-field="type"]').value,
    title: el.querySelector('[data-block-field="title"]').value,
    text: el.querySelector('[data-block-field="text"]').value,
    items: (el.querySelector('[data-block-field="items"]')?.value || '')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean),
  }, index));
  const idx = _templates.findIndex(t => t.id === template.id);
  if (idx >= 0) _templates[idx] = template;
  else _templates.push(template);
  return template;
}

function renderTemplateList() {
  const list = document.getElementById('templateList');
  if (!_templates.length) {
    list.innerHTML = '<div class="list-group-item text-muted">Geen templates.</div>';
    return;
  }
  list.innerHTML = _templates.map(t => `
    <button type="button" class="list-group-item list-group-item-action ${t.id === _activeId ? 'active' : ''}" data-template-id="${escapeHtml(t.id)}">
      <div class="fw-semibold">${escapeHtml(t.name)}</div>
      <div class="small ${t.id === _activeId ? 'text-white-50' : 'text-muted'}">${escapeHtml(t.subject || '')}</div>
    </button>
  `).join('');
  list.querySelectorAll('[data-template-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_dirty) persistActiveFromForm();
      _activeId = btn.dataset.templateId;
      renderTemplateList();
      renderEditor();
      renderPreview();
      setDirty(false);
    });
  });
}

function renderVariableList() {
  const container = document.getElementById('projectVariableList');
  if (!container) return;
  const groups = projectVariableDefinitionsByCategory();
  container.innerHTML = Object.entries(groups).map(([category, variables]) => `
    <details class="communication-variable-group mb-2" open>
      <summary class="fw-semibold small text-muted">${escapeHtml(category)} <span class="badge text-bg-light">${variables.length}</span></summary>
      <div class="list-group list-group-flush mt-1">
        ${variables.map(variable => {
          const placeholder = `{{${variable.key}}}`;
          return `
            <button type="button" class="list-group-item list-group-item-action py-2" data-copy-variable="${escapeHtml(placeholder)}">
              <div class="d-flex justify-content-between gap-2 align-items-start">
                <span>${escapeHtml(variable.label)}</span>
                <code>${escapeHtml(placeholder)}</code>
              </div>
              ${variable.example ? `<div class="small text-muted">bv. ${escapeHtml(variable.example)}</div>` : ''}
            </button>
          `;
        }).join('')}
      </div>
    </details>
  `).join('');
  container.querySelectorAll('[data-copy-variable]').forEach(btn => {
    btn.addEventListener('click', async () => copyToClipboard(btn.dataset.copyVariable, 'Variabele'));
  });
}

function blockEditorHtml(block, index) {
  const items = (block.items || []).join('\n');
  return `
    <div class="communication-block-editor border rounded-3 p-3 mb-3" data-block-id="${escapeHtml(block.id)}">
      <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div class="d-flex gap-2 flex-wrap flex-grow-1">
          <select class="form-select form-select-sm communication-block-type" data-block-field="type" aria-label="Bloktype">
            <option value="paragraph" ${block.type === 'paragraph' ? 'selected' : ''}>Tekstblok</option>
            <option value="callout" ${block.type === 'callout' ? 'selected' : ''}>Kader / aandachtspunt</option>
            <option value="checklist" ${block.type === 'checklist' ? 'selected' : ''}>Checklist</option>
            <option value="spacer" ${block.type === 'spacer' ? 'selected' : ''}>Ruimte</option>
          </select>
          <input type="text" class="form-control form-control-sm" data-block-field="title" value="${escapeHtml(block.title)}" placeholder="Bloktitel">
        </div>
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary" data-block-move="up" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-block-move="down" ${index === activeTemplate().blocks.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" class="btn btn-outline-danger" data-block-delete><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <label class="form-label small text-muted">Tekst</label>
      <textarea class="form-control mb-2" data-block-field="text" rows="${block.type === 'paragraph' ? 5 : 3}">${escapeHtml(block.text)}</textarea>
      <div class="communication-block-items ${block.type === 'checklist' ? '' : 'hide'}">
        <label class="form-label small text-muted">Checklist items — één per lijn</label>
        <textarea class="form-control" data-block-field="items" rows="5">${escapeHtml(items)}</textarea>
      </div>
    </div>
  `;
}

function renderEditor() {
  const template = activeTemplate();
  document.getElementById('templateName').value = template.name || '';
  document.getElementById('templateSubject').value = template.subject || '';
  document.getElementById('templateDescription').value = template.description || '';
  document.getElementById('styleBrandColor').value = template.style.brandColor;
  document.getElementById('styleAccentColor').value = template.style.accentColor;
  document.getElementById('styleBackgroundColor').value = template.style.backgroundColor;
  document.getElementById('styleCardColor').value = template.style.cardColor;
  document.getElementById('styleTextColor').value = template.style.textColor;
  document.getElementById('styleBorderRadius').value = template.style.borderRadius;
  document.getElementById('styleCustomCss').value = template.style.customCss || '';
  document.getElementById('blockEditor').innerHTML = template.blocks.map(blockEditorHtml).join('');
  wireBlockEditor();
}

function renderPreview() {
  const template = persistActiveFromForm();
  const iframe = document.getElementById('templatePreview');
  iframe.srcdoc = renderTemplateHtml(template);
  renderTemplateList();
}

function wireBlockEditor() {
  document.querySelectorAll('#blockEditor input, #blockEditor textarea, #blockEditor select').forEach(input => {
    input.addEventListener('input', () => {
      const row = input.closest('[data-block-id]');
      if (input.dataset.blockField === 'type' && row) {
        row.querySelector('.communication-block-items').classList.toggle('hide', input.value !== 'checklist');
      }
      setDirty(true);
      renderPreview();
    });
    input.addEventListener('change', () => {
      setDirty(true);
      renderPreview();
    });
  });
  document.querySelectorAll('[data-block-delete]').forEach(btn => btn.addEventListener('click', () => {
    persistActiveFromForm();
    const id = btn.closest('[data-block-id]').dataset.blockId;
    const template = activeTemplate();
    template.blocks = template.blocks.filter(block => block.id !== id);
    _templates[_templates.findIndex(t => t.id === template.id)] = template;
    renderEditor();
    renderPreview();
    setDirty(true);
  }));
  document.querySelectorAll('[data-block-move]').forEach(btn => btn.addEventListener('click', () => {
    persistActiveFromForm();
    const id = btn.closest('[data-block-id]').dataset.blockId;
    const template = activeTemplate();
    const idx = template.blocks.findIndex(block => block.id === id);
    const dir = btn.dataset.blockMove === 'up' ? -1 : 1;
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= template.blocks.length) return;
    [template.blocks[idx], template.blocks[next]] = [template.blocks[next], template.blocks[idx]];
    _templates[_templates.findIndex(t => t.id === template.id)] = template;
    renderEditor();
    renderPreview();
    setDirty(true);
  }));
}

function addBlock(type) {
  persistActiveFromForm();
  const template = activeTemplate();
  template.blocks.push(normalizeBlock({
    id: `block_${Date.now()}`,
    type,
    title: type === 'checklist' ? 'Nieuw checklistblok' : 'Nieuw tekstblok',
    text: '',
    items: type === 'checklist' ? ['Nieuw item'] : [],
  }, template.blocks.length));
  _templates[_templates.findIndex(t => t.id === template.id)] = template;
  renderEditor();
  renderPreview();
  setDirty(true);
}

async function saveTemplates() {
  persistActiveFromForm();
  await saveSettings({
    ..._settings,
    communicationTemplates: _templates.map(t => normalizeTemplate(t)),
    communicationTemplatesUpdatedAt: new Date().toISOString(),
  });
  showToast('Template opgeslagen', 'success');
  setDirty(false);
}

function newTemplate() {
  if (_dirty) persistActiveFromForm();
  const base = normalizeTemplate(defaultCommunicationTemplates()[0]);
  base.id = `template_${Date.now()}`;
  base.name = 'Nieuw template';
  base.subject = 'Nieuw onderwerp';
  base.isSystemDefault = false;
  _templates.push(base);
  _activeId = base.id;
  renderTemplateList();
  renderEditor();
  renderPreview();
  setDirty(true);
}

function duplicateTemplate() {
  persistActiveFromForm();
  const copy = normalizeTemplate(activeTemplate());
  copy.id = `template_${Date.now()}`;
  copy.name = `${copy.name} kopie`;
  copy.isSystemDefault = false;
  _templates.push(copy);
  _activeId = copy.id;
  renderTemplateList();
  renderEditor();
  renderPreview();
  setDirty(true);
}

async function copyToClipboard(text, label) {
  await navigator.clipboard.writeText(text);
  showToast(`${label} gekopieerd`, 'success');
}

function wireEvents() {
  document.getElementById('btnSignIn').addEventListener('click', async () => {
    const errEl = document.getElementById('signInError');
    errEl.classList.add('hide');
    try { await signInWithGoogle(); }
    catch (e) {
      errEl.textContent = 'Aanmelden mislukt: ' + (e && e.message ? e.message : e);
      errEl.classList.remove('hide');
    }
  });
  document.getElementById('btnSignOut').addEventListener('click', () => signOut());
  document.getElementById('btnSignOutNW').addEventListener('click', () => signOut());
  document.getElementById('btnSaveTemplate').addEventListener('click', () => saveTemplates().catch(e => showToast('Opslaan mislukt: ' + e.message, 'danger')));
  document.getElementById('btnNewTemplate').addEventListener('click', newTemplate);
  document.getElementById('btnDuplicateTemplate').addEventListener('click', duplicateTemplate);
  document.getElementById('btnExportHtml').addEventListener('click', () => copyToClipboard(renderTemplateHtml(persistActiveFromForm()), 'HTML'));
  document.getElementById('btnCopyText').addEventListener('click', () => copyToClipboard(renderTemplatePlainText(persistActiveFromForm()), 'Tekst'));
  document.querySelectorAll('[data-add-block]').forEach(btn => btn.addEventListener('click', () => addBlock(btn.dataset.addBlock)));
  document.querySelectorAll('#templateName,#templateSubject,#templateDescription,#styleBrandColor,#styleAccentColor,#styleBackgroundColor,#styleCardColor,#styleTextColor,#styleBorderRadius,#styleCustomCss').forEach(input => {
    input.addEventListener('input', () => { setDirty(true); renderPreview(); });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
  onAuthStateChanged(user => {
    if (!user) {
      showState('stateLoggedOut');
      return;
    }
    if (!isWhitelisted(user)) {
      document.getElementById('notWhitelistedEmail').textContent = user.email || '(onbekend)';
      showState('stateNotWhitelisted');
      return;
    }
    document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    showState('stateAuthorized');
    renderVariableList();
    loadTemplates().catch(e => showToast('Templates laden mislukt: ' + e.message, 'danger'));
  });
});
