import { escapeHtml, showConfirm } from './shared-helpers.js';

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

function renderNode(node, level = 0) {
  const isFolder = node.type === 'folder';
  const icon = iconForDocument(node);
  const meta = isFolder
    ? `${node.children.length} item${node.children.length === 1 ? '' : 's'}`
    : [node.name, formatBytes(node.sizeBytes)].filter(Boolean).join(' · ');
  const desc = node.description ? `<div class="small text-muted sp-pre-wrap">${escapeHtml(node.description)}</div>` : '';
  const download = (!isFolder && node.downloadUrl)
    ? `<a class="btn btn-sm btn-outline-primary" href="${escapeAttr(node.downloadUrl)}" target="_blank" rel="noopener" title="Openen"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
    : '';
  return `
    <div class="sp-doc-row" data-doc-id="${escapeAttr(node.id)}" data-doc-type="${escapeAttr(node.type)}" style="--doc-level:${level}">
      <div class="sp-doc-main">
        <i class="fa-solid ${escapeAttr(icon)} ${isFolder ? 'text-warning' : 'text-secondary'}" aria-hidden="true"></i>
        <div class="min-w-0 flex-grow-1">
          <div class="fw-semibold text-truncate">${escapeHtml(node.title)}</div>
          <div class="small text-muted text-truncate">${escapeHtml(meta)}</div>
          ${desc}
        </div>
      </div>
      <div class="sp-doc-actions">
        ${download}
        ${isFolder ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-doc-action="upload-here" title="Upload in deze map"><i class="fa-solid fa-upload"></i></button>` : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" data-doc-action="edit" title="Titel/beschrijving wijzigen"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-doc-action="move" title="Verplaatsen"><i class="fa-solid fa-folder-tree"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-doc-action="delete" title="Verwijderen"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
    ${isFolder && node.children.length ? `<div class="sp-doc-children">${node.children.map(child => renderNode(child, level + 1)).join('')}</div>` : ''}
  `;
}

export function renderDocumentExplorerHtml(tree) {
  if (!tree || !tree.roots || tree.roots.length === 0) {
    return '<p class="sp-empty-state mb-0">Nog geen documenten.</p>';
  }
  return `<div class="sp-doc-tree">${tree.roots.map(node => renderNode(node)).join('')}</div>`;
}

function toast(msg, variant = 'danger') {
  if (typeof window.showToast === 'function') window.showToast(msg, variant);
  else console.warn('[project-documents]', msg);
}

function promptMeta(files, parentTitle = '') {
  const many = files.length > 1;
  const titleLabel = many ? 'Mapnaam voor deze upload' : 'Titel voor dit document';
  const fallback = many ? `Upload ${new Date().toLocaleDateString('nl-BE')}` : fileBaseName(files[0]);
  const title = window.prompt(`${titleLabel}${parentTitle ? ` in ${parentTitle}` : ''}:`, fallback);
  if (title === null) return null;
  const description = window.prompt('Beschrijving/notitie (optioneel):', '') || '';
  return { title, description };
}

function promptFolderTitle() {
  const title = window.prompt('Nieuwe mapnaam:', 'Nieuwe map');
  if (title === null) return null;
  const description = window.prompt('Beschrijving/notitie (optioneel):', '') || '';
  return { title, description };
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
  const options = { projectId: null, onChange: null, ...opts };
  const state = { entries: [], tree: buildDocumentTree([]), busy: false };

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
    listEl.innerHTML = renderDocumentExplorerHtml(state.tree);
  }

  async function refresh() {
    if (!options.projectId) {
      listEl.innerHTML = '<p class="sp-empty-state mb-0">Sla het project eerst op om documenten toe te voegen.</p>';
      return;
    }
    try {
      state.entries = await window.listProjectDocuments(options.projectId);
      render();
    } catch (err) {
      setError('Documenten laden mislukt: ' + (err && err.message ? err.message : err));
    }
  }

  async function handleFiles(filesLike) {
    const files = Array.from(filesLike || []);
    if (!files.length) return;
    const meta = promptMeta(files, uploadParentTitle);
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
      const meta = promptFolderTitle();
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

    if (!doc) return;

    if (action === 'edit') {
      const title = window.prompt('Titel:', doc.title || doc.name || '');
      if (title === null) return;
      const description = window.prompt('Beschrijving/notitie:', doc.description || '') || '';
      setBusy(true);
      try {
        await window.updateProjectDocument(options.projectId, doc.id, { title, description });
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
    destroy() {},
  };
}

if (typeof window !== 'undefined') {
  window.SmartPeakProjectDocuments = {
    buildDocumentTree,
    documentUploadPlan,
    iconForDocument,
    mountProjectDocuments,
    renderDocumentExplorerHtml,
  };
}
