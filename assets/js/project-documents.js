import { escapeHtml, showConfirm } from './shared-helpers.js';
import {
  DOCUMENT_KINDS,
  defaultDocumentFlags,
  documentKindMeta,
  normalizeDocumentKind,
} from './project-taxonomy.js';

export const NEW_FOLDER_PARENT = '__NEW_FOLDER__';

function safeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? '')).replace(/`/g, '&#96;');
}

function fileBaseName(file) {
  return safeText(file && file.name, 'Document');
}

export function documentUploadPlan(filesLike, meta = {}) {
  const files = Array.from(filesLike || []).filter(Boolean);
  const parentId = meta.parentId || null;
  if (files.length === 0) return { folder: null, files: [] };

  if (files.length === 1) {
    const file = files[0];
    return {
      folder: null,
      files: [{
        type: 'file',
        file,
        name: fileBaseName(file),
        title: safeText(meta.title, fileBaseName(file)),
        description: safeText(meta.description),
        parentId,
        documentKind: normalizeDocumentKind(meta.documentKind),
        includeInCloseoutPdf: !!meta.includeInCloseoutPdf,
        includeInInspectionPack: !!meta.includeInInspectionPack,
      }],
    };
  }

  const folderTitle = safeText(meta.title, `Upload ${new Date().toLocaleDateString('nl-BE')}`);
  return {
    folder: {
      type: 'folder',
      title: folderTitle,
      description: safeText(meta.description),
      parentId,
    },
    files: files.map(file => ({
      type: 'file',
      file,
      name: fileBaseName(file),
      title: fileBaseName(file),
      description: '',
      parentId: NEW_FOLDER_PARENT,
      documentKind: normalizeDocumentKind(meta.documentKind),
      includeInCloseoutPdf: !!meta.includeInCloseoutPdf,
      includeInInspectionPack: !!meta.includeInInspectionPack,
    })),
  };
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNodes(a, b) {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  const aTime = timestampValue(a.createdAt || a.uploadedAt);
  const bTime = timestampValue(b.createdAt || b.uploadedAt);
  if (aTime !== bTime) return aTime - bTime;
  return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), 'nl-BE');
}

export function buildDocumentTree(entries) {
  const nodes = (entries || []).map(entry => ({
    ...entry,
    type: entry.type === 'folder' ? 'folder' : 'file',
    title: safeText(entry.title, entry.name || (entry.type === 'folder' ? 'Map' : 'Document')),
    parentId: entry.parentId || null,
    children: [],
  }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const roots = [];

  nodes.forEach(node => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortRecursive = list => {
    list.sort(sortNodes);
    list.forEach(node => sortRecursive(node.children));
  };
  sortRecursive(roots);

  return { roots, byId };
}

export function iconForDocument(doc) {
  if (doc.type === 'folder') return 'fa-folder';
  const name = String(doc.name || doc.title || '').toLowerCase();
  const type = String(doc.contentType || '').toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'fa-file-pdf';
  if (type.includes('csv') || name.endsWith('.csv')) return 'fa-file-csv';
  if (type.includes('spreadsheet') || /\.(xls|xlsx)$/i.test(name)) return 'fa-file-excel';
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return 'fa-file-image';
  if (type.includes('word') || /\.(doc|docx)$/i.test(name)) return 'fa-file-word';
  return 'fa-file-lines';
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderNode(node, level = 0, collapsedIds = new Set()) {
  const isFolder = node.type === 'folder';
  const isCollapsed = isFolder && collapsedIds.has(node.id);
  const icon = iconForDocument(node);
  const meta = isFolder
    ? `${node.children.length} item${node.children.length === 1 ? '' : 's'}`
    : [node.name, formatBytes(node.sizeBytes)].filter(Boolean).join(' · ');
  const desc = node.description ? `<div class="small text-muted sp-pre-wrap">${escapeHtml(node.description)}</div>` : '';
  const kind = !isFolder ? documentKindMeta(node.documentKind) : null;
  const kindBadge = kind && node.documentKind
    ? `<span class="badge rounded-pill text-bg-light border me-1"><i class="fa-solid ${escapeAttr(kind.icon)} me-1" aria-hidden="true"></i>${escapeHtml(kind.label)}</span>`
    : '';
  const dossierBadges = !isFolder
    ? `${node.includeInCloseoutPdf ? '<span class="badge rounded-pill text-bg-primary-subtle text-primary-emphasis me-1">Opleverdossier</span>' : ''}${node.includeInInspectionPack ? '<span class="badge rounded-pill text-bg-warning-subtle text-warning-emphasis me-1">Keuring</span>' : ''}`
    : '';
  const openActions = (!isFolder && node.downloadUrl)
    ? `
        <a class="btn btn-sm btn-outline-primary" href="${escapeAttr(node.downloadUrl)}" target="_blank" rel="noopener" title="Openen" aria-label="Openen"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        <a class="btn btn-sm btn-outline-secondary" href="${escapeAttr(node.downloadUrl)}" download="${escapeAttr(node.name || node.title || 'document')}" title="Downloaden" aria-label="Downloaden"><i class="fa-solid fa-download"></i></a>
      `
    : '';
  const toggle = isFolder
    ? `<button type="button" class="btn btn-sm btn-link text-secondary sp-doc-toggle" data-doc-action="toggle-folder" aria-expanded="${isCollapsed ? 'false' : 'true'}" title="Map ${isCollapsed ? 'openklappen' : 'toeklappen'}"><i class="fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'}"></i></button>`
    : '<span class="sp-doc-toggle-spacer" aria-hidden="true"></span>';
  const mutableActions = node.virtual ? '' : `
        ${isFolder ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-doc-action="upload-here" title="Upload in deze map"><i class="fa-solid fa-upload"></i></button>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" data-doc-action="edit" title="Titel/beschrijving wijzigen"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-doc-action="move" title="Verplaatsen"><i class="fa-solid fa-folder-tree"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-doc-action="delete" title="Verwijderen"><i class="fa-solid fa-trash"></i></button>
      `;
  return `
    <div class="sp-doc-row" data-doc-id="${escapeAttr(node.id)}" data-doc-type="${escapeAttr(node.type)}" style="--doc-level:${level}">
      <div class="sp-doc-main">
        ${toggle}
        <i class="fa-solid ${escapeAttr(icon)} ${isFolder ? 'text-warning' : 'text-secondary'}" aria-hidden="true"></i>
        <div class="sp-doc-content">
          <div class="fw-semibold sp-doc-title">${escapeHtml(node.title)}</div>
          <div class="small text-muted sp-doc-meta">${escapeHtml(meta)}</div>
          ${kindBadge || dossierBadges ? `<div class="small mt-1">${kindBadge}${dossierBadges}</div>` : ''}
          ${desc}
        </div>
      </div>
      <div class="sp-doc-actions">
        ${openActions}
        ${mutableActions}
      </div>
    </div>
    ${isFolder && node.children.length ? `<div class="sp-doc-children${isCollapsed ? ' d-none' : ''}">${node.children.map(child => renderNode(child, level + 1, collapsedIds)).join('')}</div>` : ''}
  `;
}

export function renderDocumentExplorerHtml(tree, collapsedIds = new Set()) {
  if (!tree || !tree.roots || tree.roots.length === 0) {
    return '<p class="sp-empty-state mb-0">Nog geen documenten.</p>';
  }
  return `<div class="sp-doc-tree">${tree.roots.map(node => renderNode(node, 0, collapsedIds)).join('')}</div>`;
}

function toast(msg, variant = 'danger') {
  if (typeof window.showToast === 'function') window.showToast(msg, variant);
  else console.warn('[project-documents]', msg);
}

function ensureDocumentMetaModal() {
  let el = document.getElementById('spDocumentMetaModal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'spDocumentMetaModal';
  el.className = 'modal fade';
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <form data-doc-meta-form>
          <div class="modal-header">
            <h5 class="modal-title" data-doc-meta-title><i class="fa-solid fa-file-circle-plus me-2" aria-hidden="true"></i>Document</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
          </div>
          <div class="modal-body">
            <p class="small text-muted mb-3" data-doc-meta-help></p>
            <div class="mb-3">
              <label class="form-label" for="spDocumentMetaTitle">Titel</label>
              <input id="spDocumentMetaTitle" type="text" class="form-control" data-doc-meta-input-title required>
              <div class="invalid-feedback">Geef een titel of mapnaam op.</div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="spDocumentMetaDescription">Beschrijving/notitie</label>
              <textarea id="spDocumentMetaDescription" class="form-control" data-doc-meta-input-description rows="3" placeholder="Optioneel"></textarea>
            </div>
            <div data-doc-kind-fields>
              <div class="mb-3">
                <label class="form-label" for="spDocumentMetaKind">Documenttype</label>
                <select id="spDocumentMetaKind" class="form-select" data-doc-meta-kind>
                  ${DOCUMENT_KINDS.map(kind => `<option value="${escapeAttr(kind.value)}">${escapeHtml(kind.label)}</option>`).join('')}
                </select>
              </div>
              <div class="form-check">
                <input id="spDocumentMetaCloseout" type="checkbox" class="form-check-input" data-doc-meta-closeout>
                <label class="form-check-label" for="spDocumentMetaCloseout">Opnemen in opleverdossier</label>
              </div>
              <div class="form-check">
                <input id="spDocumentMetaInspection" type="checkbox" class="form-check-input" data-doc-meta-inspection>
                <label class="form-check-label" for="spDocumentMetaInspection">Nuttig voor keuring</label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuleren</button>
            <button type="submit" class="btn btn-primary" data-doc-meta-save>Opslaan</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function openDocumentMetaModal(options = {}) {
  const {
    modalTitle = 'Documentgegevens',
    helpText = '',
    title = '',
    description = '',
    documentKind = 'other',
    includeInCloseoutPdf = null,
    includeInInspectionPack = null,
    showDocumentFields = false,
    saveText = 'Opslaan',
  } = options;
  if (typeof document === 'undefined' || typeof bootstrap === 'undefined') return Promise.resolve(null);
  const el = ensureDocumentMetaModal();
  const form = el.querySelector('[data-doc-meta-form]');
  const titleEl = el.querySelector('[data-doc-meta-title]');
  const helpEl = el.querySelector('[data-doc-meta-help]');
  const titleInput = el.querySelector('[data-doc-meta-input-title]');
  const descriptionInput = el.querySelector('[data-doc-meta-input-description]');
  const kindFields = el.querySelector('[data-doc-kind-fields]');
  const kindInput = el.querySelector('[data-doc-meta-kind]');
  const closeoutInput = el.querySelector('[data-doc-meta-closeout]');
  const inspectionInput = el.querySelector('[data-doc-meta-inspection]');
  const saveBtn = el.querySelector('[data-doc-meta-save]');

  titleEl.innerHTML = `<i class="fa-solid fa-file-circle-plus me-2" aria-hidden="true"></i>${escapeHtml(modalTitle)}`;
  helpEl.textContent = helpText || '';
  helpEl.classList.toggle('d-none', !helpText);
  titleInput.value = title;
  descriptionInput.value = description;
  const normalizedKind = normalizeDocumentKind(documentKind);
  const defaults = defaultDocumentFlags(normalizedKind);
  if (kindFields) kindFields.hidden = !showDocumentFields;
  if (kindInput) kindInput.value = normalizedKind;
  if (closeoutInput) closeoutInput.checked = includeInCloseoutPdf === null ? defaults.includeInCloseoutPdf : !!includeInCloseoutPdf;
  if (inspectionInput) inspectionInput.checked = includeInInspectionPack === null ? defaults.includeInInspectionPack : !!includeInInspectionPack;
  if (kindInput && !kindInput.dataset.docKindWired) {
    kindInput.dataset.docKindWired = '1';
    kindInput.addEventListener('change', () => {
      const next = defaultDocumentFlags(kindInput.value);
      if (closeoutInput) closeoutInput.checked = next.includeInCloseoutPdf;
      if (inspectionInput) inspectionInput.checked = next.includeInInspectionPack;
    });
  }
  saveBtn.textContent = saveText;
  form.classList.remove('was-validated');

  return new Promise(resolve => {
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    let settled = false;
    const cleanup = () => {
      form.removeEventListener('submit', onSubmit);
      el.removeEventListener('hidden.bs.modal', onHidden);
    };
    const close = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onHidden = () => close(null);
    const onSubmit = (event) => {
      event.preventDefault();
      const nextTitle = titleInput.value.trim();
      if (!nextTitle) {
        form.classList.add('was-validated');
        titleInput.focus();
        return;
      }
      close({
        title: nextTitle,
        description: descriptionInput.value.trim(),
        ...(showDocumentFields ? {
          documentKind: normalizeDocumentKind(kindInput && kindInput.value),
          includeInCloseoutPdf: !!(closeoutInput && closeoutInput.checked),
          includeInInspectionPack: !!(inspectionInput && inspectionInput.checked),
        } : {}),
      });
      modal.hide();
    };
    form.addEventListener('submit', onSubmit);
    el.addEventListener('hidden.bs.modal', onHidden);
    modal.show();
    setTimeout(() => titleInput.focus(), 150);
  });
}

function promptMeta(files, parentTitle = '', defaults = {}) {
  const many = files.length > 1;
  const fallback = defaults.title || (many ? `Upload ${new Date().toLocaleDateString('nl-BE')}` : fileBaseName(files[0]));
  return openDocumentMetaModal({
    modalTitle: many ? 'Documenten uploaden' : 'Document uploaden',
    helpText: many
      ? `Meerdere bestanden worden als map opgeslagen${parentTitle ? ` in ${parentTitle}` : ''}.`
      : `Dit document wordt opgeslagen${parentTitle ? ` in ${parentTitle}` : ''}.`,
    title: fallback,
    description: defaults.description || '',
    documentKind: defaults.documentKind || 'other',
    includeInCloseoutPdf: 'includeInCloseoutPdf' in defaults ? !!defaults.includeInCloseoutPdf : null,
    includeInInspectionPack: 'includeInInspectionPack' in defaults ? !!defaults.includeInInspectionPack : null,
    showDocumentFields: true,
    saveText: 'Uploaden',
  });
}

function promptFolderTitle() {
  return openDocumentMetaModal({
    modalTitle: 'Nieuwe map',
    helpText: 'Maak een map om documenten te groeperen.',
    title: 'Nieuwe map',
    description: '',
    saveText: 'Map maken',
  });
}

function editDocumentMeta(doc) {
  return openDocumentMetaModal({
    modalTitle: doc.type === 'folder' ? 'Map wijzigen' : 'Document wijzigen',
    helpText: 'Pas titel en beschrijving aan.',
    title: doc.title || doc.name || '',
    description: doc.description || '',
    documentKind: doc.documentKind || 'other',
    includeInCloseoutPdf: 'includeInCloseoutPdf' in doc ? !!doc.includeInCloseoutPdf : null,
    includeInInspectionPack: 'includeInInspectionPack' in doc ? !!doc.includeInInspectionPack : null,
    showDocumentFields: doc.type !== 'folder',
    saveText: 'Opslaan',
  });
}

function descendantIds(tree, id) {
  const root = tree.byId.get(id);
  const ids = new Set();
  const walk = node => {
    node.children.forEach(child => {
      ids.add(child.id);
      if (child.type === 'folder') walk(child);
    });
  };
  if (root) walk(root);
  return ids;
}

export function virtualOfferDocuments(project = {}) {
  const offertes = project && project.offertes && typeof project.offertes === 'object' ? project.offertes : {};
  return Object.entries(offertes)
    .filter(([, offer]) => offer && offer.storagePath)
    .map(([configType, offer]) => ({
      id: `virtual-offer-${configType}`,
      type: 'file',
      virtual: true,
      source: 'project.offertes',
      configType,
      parentId: null,
      documentKind: 'offer',
      title: offer.title || offer.filename || `Offerte ${configType}`,
      name: offer.filename || `Offerte ${configType}.pdf`,
      contentType: offer.contentType || 'application/pdf',
      sizeBytes: offer.sizeBytes || 0,
      storagePath: offer.storagePath,
      downloadUrl: offer.downloadUrl || null,
      includeInCloseoutPdf: 'includeInCloseoutPdf' in offer ? !!offer.includeInCloseoutPdf : true,
      includeInInspectionPack: !!offer.includeInInspectionPack,
      createdAt: offer.uploadedAt || offer.createdAt || null,
      uploadedAt: offer.uploadedAt || null,
    }));
}

export function mergeProjectDocuments(entries = [], project = {}) {
  return [...(entries || []), ...virtualOfferDocuments(project)];
}

export function projectDocumentBadgeCount(entries = [], project = {}) {
  return mergeProjectDocuments(entries, project).length;
}

function storageRefForPath(storagePath) {
  if (!storagePath) return null;
  if (typeof window !== 'undefined' && window.firebase && typeof window.firebase.storage === 'function') {
    return window.firebase.storage().ref(storagePath);
  }
  if (typeof globalThis !== 'undefined' && globalThis.firebase && typeof globalThis.firebase.storage === 'function') {
    return globalThis.firebase.storage().ref(storagePath);
  }
  return null;
}

export async function resolveDocumentDownloadUrls(entries = []) {
  return Promise.all((entries || []).map(async entry => {
    if (!entry || entry.downloadUrl || !entry.storagePath || entry.type === 'folder') return entry;
    const ref = storageRefForPath(entry.storagePath);
    if (!ref || typeof ref.getDownloadURL !== 'function') return entry;
    try {
      return { ...entry, downloadUrl: await ref.getDownloadURL() };
    } catch (err) {
      return { ...entry, downloadUrlError: err && err.message ? err.message : String(err) };
    }
  }));
}

function promptMoveTarget(tree, doc) {
  const blocked = doc.type === 'folder' ? descendantIds(tree, doc.id) : new Set();
  blocked.add(doc.id);
  const folders = Array.from(tree.byId.values())
    .filter(node => node.type === 'folder' && !blocked.has(node.id));
  const lines = ['0. Hoofdmap', ...folders.map((folder, idx) => `${idx + 1}. ${folder.title}`)];
  const answer = window.prompt(`Verplaatsen naar:\n${lines.join('\n')}`, '0');
  if (answer === null) return null;
  const idx = Number(answer.trim());
  if (!Number.isInteger(idx) || idx < 0 || idx > folders.length) {
    toast('Ongeldige mapkeuze', 'warning');
    return undefined;
  }
  return idx === 0 ? null : folders[idx - 1].id;
}

export function mountProjectDocuments(containerEl, opts = {}) {
  const options = { projectId: null, project: null, onChange: null, onCountChange: null, ...opts };
  const state = { entries: [], tree: buildDocumentTree([]), busy: false, collapsedIds: new Set() };

  containerEl.innerHTML = `
    <div class="sp-documents" data-doc-root>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <button type="button" class="btn btn-outline-primary btn-sm" data-doc-action="upload-root"><i class="fa-solid fa-upload me-1"></i>Document(en) uploaden</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-doc-action="new-folder"><i class="fa-solid fa-folder-plus me-1"></i>Map maken</button>
        <input type="file" class="d-none" multiple data-doc-file-input />
      </div>
      <div class="small text-muted mb-2">PDF, CSV, Office-bestanden, afbeeldingen en andere projectdocumenten.</div>
      <div data-doc-list><p class="sp-empty-state mb-0">⏳ Laden…</p></div>
      <div class="text-danger small mt-1 d-none" data-doc-error></div>
    </div>`;

  const fileInput = containerEl.querySelector('[data-doc-file-input]');
  const listEl = containerEl.querySelector('[data-doc-list]');
  const errEl = containerEl.querySelector('[data-doc-error]');
  let uploadParentId = null;
  let uploadParentTitle = '';
  let presetUploadMeta = null;

  function setError(message) {
    if (!errEl) return;
    errEl.textContent = message || '';
    errEl.classList.toggle('d-none', !message);
  }

  function setBusy(busy) {
    state.busy = busy;
    containerEl.querySelectorAll('button').forEach(btn => { btn.disabled = busy; });
  }

  function render() {
    state.tree = buildDocumentTree(state.entries);
    const folderIds = new Set(Array.from(state.tree.byId.values()).filter(node => node.type === 'folder').map(node => node.id));
    state.collapsedIds = new Set(Array.from(state.collapsedIds).filter(id => folderIds.has(id)));
    listEl.innerHTML = renderDocumentExplorerHtml(state.tree, state.collapsedIds);
    if (typeof options.onCountChange === 'function') options.onCountChange(state.entries.length, state.entries);
  }

  async function refresh(nextProject) {
    if (nextProject) options.project = nextProject;
    if (!options.projectId) {
      listEl.innerHTML = '<p class="sp-empty-state mb-0">Sla het project eerst op om documenten toe te voegen.</p>';
      if (typeof options.onCountChange === 'function') options.onCountChange(0);
      return;
    }
    try {
      const entries = await window.listProjectDocuments(options.projectId);
      state.entries = await resolveDocumentDownloadUrls(mergeProjectDocuments(entries, options.project || {}));
      render();
    } catch (err) {
      setError('Documenten laden mislukt: ' + (err && err.message ? err.message : err));
    }
  }

  async function handleFiles(filesLike) {
    const files = Array.from(filesLike || []);
    if (!files.length) return;
    const defaultMeta = presetUploadMeta || {};
    const meta = await promptMeta(files, uploadParentTitle, defaultMeta);
    presetUploadMeta = null;
    if (!meta) return;
    const plan = documentUploadPlan(files, { ...meta, parentId: uploadParentId });
    setBusy(true);
    setError('');
    try {
      let parentId = uploadParentId;
      if (plan.folder) {
        const folder = await window.createProjectDocumentFolder(options.projectId, plan.folder);
        parentId = folder.id;
      }
      for (const filePlan of plan.files) {
        const effectiveParentId = filePlan.parentId === NEW_FOLDER_PARENT ? parentId : filePlan.parentId;
        await window.uploadProjectDocument(options.projectId, filePlan.file, { ...filePlan, parentId: effectiveParentId });
      }
      toast(files.length === 1 ? 'Document geüpload' : 'Documenten geüpload', 'success');
      await refresh();
      if (typeof options.onChange === 'function') options.onChange();
    } catch (err) {
      setError('Upload mislukt: ' + (err && err.message ? err.message : err));
    } finally {
      setBusy(false);
      fileInput.value = '';
      uploadParentId = null;
      uploadParentTitle = '';
    }
  }

  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  containerEl.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-doc-action]');
    if (!btn || state.busy) return;
    const action = btn.dataset.docAction;
    const row = btn.closest('[data-doc-id]');
    const doc = row ? state.tree.byId.get(row.dataset.docId) : null;

    if (action === 'upload-root' || action === 'upload-here') {
      uploadParentId = action === 'upload-here' && doc ? doc.id : null;
      uploadParentTitle = action === 'upload-here' && doc ? doc.title : '';
      fileInput.click();
      return;
    }

    if (action === 'new-folder') {
      const meta = await promptFolderTitle();
      if (!meta) return;
      setBusy(true);
      try {
        await window.createProjectDocumentFolder(options.projectId, { ...meta, parentId: null });
        await refresh();
        if (typeof options.onChange === 'function') options.onChange();
      } catch (err) {
        setError('Map maken mislukt: ' + (err && err.message ? err.message : err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'toggle-folder' && doc && doc.type === 'folder') {
      if (state.collapsedIds.has(doc.id)) state.collapsedIds.delete(doc.id);
      else state.collapsedIds.add(doc.id);
      render();
      return;
    }

    if (!doc) return;

    if (action === 'edit') {
      const meta = await editDocumentMeta(doc);
      if (!meta) return;
      setBusy(true);
      try {
        await window.updateProjectDocument(options.projectId, doc.id, meta);
        await refresh();
      } catch (err) {
        setError('Wijzigen mislukt: ' + (err && err.message ? err.message : err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'move') {
      const parentId = promptMoveTarget(state.tree, doc);
      if (parentId === undefined) return;
      setBusy(true);
      try {
        await window.moveProjectDocument(options.projectId, doc.id, parentId);
        await refresh();
      } catch (err) {
        setError('Verplaatsen mislukt: ' + (err && err.message ? err.message : err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'delete') {
      const ok = await showConfirm({
        title: doc.type === 'folder' ? 'Map verwijderen?' : 'Document verwijderen?',
        message: doc.type === 'folder'
          ? 'De map en alle onderliggende documenten worden verwijderd. Dit kan niet ongedaan worden.'
          : 'Het document wordt verwijderd uit Firestore en Storage. Dit kan niet ongedaan worden.',
        confirmText: 'Verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      setBusy(true);
      try {
        await window.deleteProjectDocument(options.projectId, doc.id);
        await refresh();
        if (typeof options.onChange === 'function') options.onChange();
      } catch (err) {
        setError('Verwijderen mislukt: ' + (err && err.message ? err.message : err));
      } finally {
        setBusy(false);
      }
    }
  });

  refresh();
  return {
    refresh,
    startUploadWithMeta(meta = {}, parentId = null) {
      uploadParentId = parentId;
      uploadParentTitle = '';
      const defaults = defaultDocumentFlags(meta.documentKind || 'other');
      presetUploadMeta = { ...defaults, ...meta };
      fileInput.click();
    },
    destroy() {},
  };
}

if (typeof window !== 'undefined') {
  window.SmartPeakProjectDocuments = {
    buildDocumentTree,
    documentUploadPlan,
    iconForDocument,
    mergeProjectDocuments,
    mountProjectDocuments,
    projectDocumentBadgeCount,
    renderDocumentExplorerHtml,
    resolveDocumentDownloadUrls,
    virtualOfferDocuments,
  };
}
