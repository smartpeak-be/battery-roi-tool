import { escapeHtml } from '../shared-helpers.js';

export function escapeAttr(value) {
  return escapeHtml(String(value == null ? '' : value));
}

export function productPhotosHtml(photos) {
  return photos.map(p => `
    <div class="photo-item" data-photo-id="${escapeAttr(p.id)}" data-storage-path="${escapeAttr(p.storagePath || '')}" data-thumb-storage-path="${escapeAttr(p.thumbStoragePath || '')}">
      <img class="photo-thumb" src="${escapeAttr(p.thumbUrl || p.downloadUrl || '')}" alt="${escapeAttr(p.name || '')}" data-full-url="${escapeAttr(p.downloadUrl || '')}">
      ${p.isStatic ? '' : '<button type="button" class="photo-delete-btn" title="Verwijderen"><i class="fa-solid fa-xmark"></i></button>'}
    </div>
  `).join('');
}

export function productDatasheetsHtml(docs) {
  return docs.map(d => {
    const sizeKb = d.sizeBytes ? Math.round(d.sizeBytes / 1024) : '?';
    const deleteButton = d.isStatic ? '' : `
        <button type="button" class="btn btn-sm btn-outline-danger ds-delete-btn" title="Verwijderen">
          <i class="fa-solid fa-trash-can"></i>
        </button>`;
    return `
      <div class="ds-row" data-ds-id="${escapeAttr(d.id)}" data-storage-path="${escapeAttr(d.storagePath || '')}">
        <i class="fa-solid fa-file-pdf text-danger"></i>
        <a href="${escapeAttr(d.downloadUrl || '#')}" target="_blank" rel="noopener" class="ds-name" title="${escapeAttr(d.name || '')}">${escapeHtml(d.name || 'Datasheet')}</a>
        <span class="ds-size">${sizeKb} KB</span>
        ${deleteButton}
      </div>
    `;
  }).join('');
}
