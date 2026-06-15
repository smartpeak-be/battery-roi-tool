/* global firebase, bootstrap, uploadProjectPhotoWithThumb, listProjectPhotos,
          deleteProjectPhoto, backfillThumbnail, saveProjectPhotoAnnotation,
          deleteProjectPhotoAnnotation, showToast, showSpinner, updateSpinner, hideSpinner */

import { escapeHtml, showConfirm } from './shared-helpers.js';
import {
  getDistanceBetweenTouches,
  midpointBetweenTouches,
  nextPinchZoomTransform,
  nextZoomTransform,
  panZoomTransform,
} from './photo-lightbox-zoom.js';
import {
  PHOTO_TAGS,
  SERIAL_CATEGORIES,
  defaultPhotoFlags,
  normalizePhotoTag,
  normalizeSerialCategory,
  photoTagMeta,
  serialCategoryMeta,
} from './project-taxonomy.js';

// assets/js/photo-uploader.js
// Shared photo-uploader component — used in dashboard.html drawer and
// project-edit.html Blok D.  Mounted per-container; multiple instances on
// the same page are safe.

(function (global) {
  'use strict';

  function _toast(msg, variant) {
    if (typeof showToast === 'function') return showToast(msg, variant || 'danger');
    console.warn('[photo-uploader]', msg);
  }

  function _ensureModalEl() {
    let el = document.getElementById('pu-tag-modal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pu-tag-modal';
    el.className = 'modal fade';
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-tags me-2"></i>Foto's taggen</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluit"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex gap-2 mb-3 flex-wrap">
              <button type="button" class="btn btn-sm btn-outline-primary" data-pu-bulk="situation_before">
                <i class="fa-solid fa-camera me-1"></i> Alles → Vóór
              </button>
              <button type="button" class="btn btn-sm btn-outline-primary" data-pu-bulk="situation_after">
                <i class="fa-solid fa-camera-retro me-1"></i> Alles → Na
              </button>
              <button type="button" class="btn btn-sm btn-outline-primary" data-pu-bulk="serial">
                <i class="fa-solid fa-barcode me-1"></i> Alles → Serieel · Batterij
              </button>
            </div>
            <div data-pu-modal-list></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuleren</button>
            <button type="button" class="btn btn-primary" data-pu-modal-save>Opslaan</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  // Module-scope reference to the currently-active mount's lightbox helpers.
  // Used by the singleton #pu-lightbox's document-level keydown handler so
  // the latest mount always drives the lightbox, never the first mount that
  // happened to create the element.
  let _activeLightboxMount = null;

  const ANNOTATION_COLORS = [
    { label: 'Rood', value: '#ff2d2d' },
    { label: 'Geel', value: '#ffd400' },
    { label: 'Blauw', value: '#0077ff' },
  ];
  const ANNOTATION_SIZES = [
    { label: 'Small', value: 4 },
    { label: 'Normal', value: 9 },
    { label: 'Large', value: 16 },
  ];

  function _tagOptionsHtml(selectedValue = 'situation_before') {
    const selected = normalizePhotoTag(selectedValue);
    return PHOTO_TAGS.map(tag => `
      <option value="${escapeHtml(tag.value)}" ${tag.value === selected ? 'selected' : ''}>${escapeHtml(tag.label)}</option>
    `).join('');
  }

  function _serialCategoryOptionsHtml(selectedValue = 'battery') {
    const selected = normalizeSerialCategory(selectedValue);
    return SERIAL_CATEGORIES.map(cat => `
      <option value="${escapeHtml(cat.value)}" ${cat.value === selected ? 'selected' : ''}>${escapeHtml(cat.label)}</option>
    `).join('');
  }

  function _renderSkeleton(opts) {
    const canCam  = !!opts.allowCamera;
    const canFile = !!opts.allowFileUpload;
    const canDrop = !!opts.allowDropZone;
    return `
      <div class="pu-root" data-pu-root>
        ${opts.readOnly ? '' : `
          <div class="pu-buttons mb-2 d-flex flex-wrap gap-2">
            ${canCam  ? `
              <label class="btn btn-outline-primary mb-0" data-pu-camera-label>
                <i class="fa-solid fa-camera me-1"></i> Foto maken
                <input type="file" accept="image/*" capture="environment" class="d-none" data-pu-camera />
              </label>` : ''}
            ${canFile ? `
              <label class="btn btn-outline-secondary mb-0" data-pu-gallery-label>
                <i class="fa-solid fa-folder-open me-1"></i> Uit galerij kiezen
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple class="d-none" data-pu-gallery />
              </label>` : ''}
          </div>
        `}
        <div class="d-flex align-items-center gap-2 mb-2" data-pu-filter-wrap hidden>
          <label class="small text-muted mb-0" for="pu-photo-filter">Filter</label>
          <select id="pu-photo-filter" class="form-select form-select-sm w-auto" data-pu-filter>
            <option value="all">Alle foto's</option>
          </select>
        </div>
        <div class="photo-grid" data-pu-grid><p class="sp-empty-state">&#x23F3; Laden&hellip;</p></div>
        ${(!opts.readOnly && canDrop) ? `
          <div class="sp-drop-zone d-none d-md-block mt-2" data-pu-drop hidden>
            <div class="pu-drop-prompt">
              <i class="fa-solid fa-cloud-arrow-up me-1"></i>
              <strong>Sleep foto's hierheen</strong>
              <span class="text-muted">of gebruik de knoppen.</span>
              <div class="text-muted small mt-1">Max 15 MB per foto.</div>
            </div>
          </div>` : ''}
        <div class="pu-progress d-none mt-2" data-pu-progress>
          <div class="progress" style="height:6px;">
            <div class="progress-bar" role="progressbar" style="width:0%;"></div>
          </div>
          <div class="text-muted small mt-1">Uploaden <span data-pu-count>0/0</span>&hellip;</div>
        </div>
        <div class="text-danger small mt-1 d-none" data-pu-err></div>
      </div>
    `;
  }

  function mountPhotoUploader(containerEl, opts) {
    const options = Object.assign({
      projectId:      null,
      onChange:       null,
      allowCamera:    true,
      allowFileUpload:true,
      allowDropZone:  true,
      readOnly:       false,
    }, opts || {});

    containerEl.innerHTML = _renderSkeleton(options);

    // State
    const state = {
      photos:         [],
      photoFilter:    'all',
      lightboxIdx:    0,
      backfillBusy:   false,
      backfillQueue:  [],
      uploadBusy:     false,
      annotationMode:  false,
      annotationDirty: false,
      annotationHasContent: false,
      annotationColor: ANNOTATION_COLORS[0].value,
      annotationSize:  ANNOTATION_SIZES[1].value,
      annotationDrawing: false,
      annotationLastPoint: null,
      lightboxSeq:    0,
      zoom:           { scale: 1, x: 0, y: 0 },
      zoomPointers:   new Map(),
      zoomPanLast:    null,
      zoomPinchStart: null,
    };

    const filterSelect = containerEl.querySelector('[data-pu-filter]');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => {
        state.photoFilter = filterSelect.value || 'all';
        _renderGrid();
      });
    }

    async function refresh() {
      if (!options.projectId) {
        const grid = containerEl.querySelector('[data-pu-grid]');
        if (!grid) return;
        grid.innerHTML = '<p class="sp-empty-state">Sla het project eerst op om foto\'s te kunnen toevoegen.</p>';
        return;
      }
      try { state.photos = await listProjectPhotos(options.projectId); }
      catch (e) { _toast('Foto\'s laden mislukt: ' + (e && e.message ? e.message : e), 'danger'); return; }
      _renderFilterControls();
      _renderGrid();
    }

    function _visiblePhotos() {
      if (state.photoFilter === 'all') return state.photos;
      return state.photos.filter(p => normalizePhotoTag(p.tag) === state.photoFilter);
    }

    function _renderFilterControls() {
      const wrap = containerEl.querySelector('[data-pu-filter-wrap]');
      const select = containerEl.querySelector('[data-pu-filter]');
      if (!wrap || !select) return;
      wrap.hidden = state.photos.length === 0;
      select.innerHTML = '<option value="all">Alle foto\'s</option>' + PHOTO_TAGS.map(tag => {
        const count = state.photos.filter(p => normalizePhotoTag(p.tag) === tag.value).length;
        return `<option value="${escapeHtml(tag.value)}">${escapeHtml(tag.label)}${count ? ` (${count})` : ''}</option>`;
      }).join('');
      if (state.photoFilter !== 'all' && !PHOTO_TAGS.some(tag => tag.value === state.photoFilter)) state.photoFilter = 'all';
      select.value = state.photoFilter;
    }

    function _renderGrid() {
      const grid = containerEl.querySelector('[data-pu-grid]');
      if (!grid) return;
      if (state.photos.length === 0) {
        grid.innerHTML = '<p class="sp-empty-state">Nog geen foto\'s geüpload.</p>';
        return;
      }
      const visiblePhotos = _visiblePhotos();
      if (visiblePhotos.length === 0) {
        grid.innerHTML = '<p class="sp-empty-state">Geen foto\'s voor deze filter.</p>';
        return;
      }
      grid.innerHTML = visiblePhotos.map((p) => {
        const i = state.photos.findIndex(photo => photo.id === p.id);
        const src = p.annotatedThumbUrl || p.thumbUrl || p.downloadUrl;
        if (!src) {
          return `<div class="photo-tile broken" title="${escapeHtml(p.fetchError || 'Kon foto niet laden')}">${escapeHtml(p.name || 'onbekend')}</div>`;
        }
        const meta = photoTagMeta(p.tag);
        const tagIcon  = meta.icon || 'fa-camera';
        const tagLabel = p.tag === 'serial' && p.serialCategory
          ? `${meta.label} · ${serialCategoryMeta(p.serialCategory).label}`
          : meta.label;
        return `<div class="photo-tile" data-pu-tile data-idx="${i}">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(p.name || '')}" />
          <span class="pu-tag-indicator" title="${escapeHtml(tagLabel)}"><i class="fa-solid ${escapeHtml(tagIcon)}"></i></span>
        </div>`;
      }).join('');
      grid.querySelectorAll('[data-pu-tile]').forEach(tile => {
        tile.addEventListener('click', () => _openLightbox(parseInt(tile.dataset.idx, 10)));
      });
      // Queue backfills for any photo rendering from the full-size URL.
      state.photos.forEach(p => {
        if (!p.thumbStoragePath && p.downloadUrl && !state.backfillQueue.includes(p.id)) {
          state.backfillQueue.push(p.id);
        }
      });
      _drainBackfillQueue();
    }

    function _openLightbox(startIdx) {
      state.lightboxIdx = startIdx;

      // Expose THIS mount's close/nav helpers module-wide so the singleton
      // keydown handler dispatches to the correct mount.
      _activeLightboxMount = {
        close: _closeLightbox,
        nav:   _navLightbox,
        layout:_layoutAnnotationStage,
      };

      let lb = document.getElementById('pu-lightbox');
      if (!lb) {
        lb = document.createElement('div');
        lb.id = 'pu-lightbox';
        lb.className = 'sp-lightbox';
        lb.setAttribute('role', 'dialog');
        lb.setAttribute('aria-label', 'Foto lightbox');
        lb.innerHTML = `
          <button type="button" class="sp-lightbox-btn close" title="Sluit" aria-label="Sluit lightbox">×</button>
          <button type="button" class="sp-lightbox-btn prev" title="Vorige" aria-label="Vorige foto">‹</button>
          <button type="button" class="sp-lightbox-btn next" title="Volgende" aria-label="Volgende foto">›</button>
          <button type="button" class="sp-lightbox-btn del" title="Verwijder foto" aria-label="Verwijder foto"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
          <button type="button" class="sp-lightbox-btn annotate" title="Aantekenen" aria-label="Aantekenen"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button>
          <button type="button" class="sp-lightbox-btn zoom" title="Zoom in/uit" aria-label="Zoom in of uit"><i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i></button>
          <div class="pu-annotation-stage" data-pu-annotation-stage>
            <img data-pu-lightbox-img alt="Foto" />
            <canvas data-pu-annotation-canvas aria-label="Aantekeningenlaag"></canvas>
          </div>
          <div class="pu-lightbox-hint" data-pu-zoom-hint>Knijp met twee vingers of gebruik Ctrl + scroll om in te zoomen. Sleep om te verplaatsen.</div>
          <div class="pu-annotation-toolbar" data-pu-annotation-toolbar hidden>
            <div class="pu-annotation-tools" role="group" aria-label="Kleur">
              ${ANNOTATION_COLORS.map((c, i) => `
                <button type="button" class="pu-annotation-swatch${i === 0 ? ' active' : ''}" data-pu-annotation-color="${escapeHtml(c.value)}" title="${escapeHtml(c.label)}" style="--swatch:${escapeHtml(c.value)}"></button>
              `).join('')}
            </div>
            <div class="pu-annotation-tools" role="group" aria-label="Dikte">
              ${ANNOTATION_SIZES.map(s => `
                <button type="button" class="btn btn-sm btn-outline-light${s.value === ANNOTATION_SIZES[1].value ? ' active' : ''}" data-pu-annotation-size="${s.value}">${escapeHtml(s.label)}</button>
              `).join('')}
            </div>
            <button type="button" class="btn btn-sm btn-primary" data-pu-annotation-save disabled><i class="fa-solid fa-floppy-disk me-1"></i>Opslaan</button>
            <button type="button" class="btn btn-sm btn-outline-light" data-pu-annotation-clear hidden><i class="fa-solid fa-eraser me-1"></i>Wissen</button>
          </div>
        `;
        document.body.appendChild(lb);

        // Document-level keydown: add ONCE, dispatch via _activeLightboxMount
        document.addEventListener('keydown', e => {
          const el = document.getElementById('pu-lightbox');
          if (!el || !el.classList.contains('open') || !_activeLightboxMount) return;
          if      (e.key === 'Escape')     _activeLightboxMount.close();
          else if (e.key === 'ArrowLeft')  _activeLightboxMount.nav(-1);
          else if (e.key === 'ArrowRight') _activeLightboxMount.nav(+1);
        });
        window.addEventListener('resize', () => {
          const el = document.getElementById('pu-lightbox');
          if (!el || !el.classList.contains('open') || !_activeLightboxMount) return;
          _activeLightboxMount.layout();
        });
      }

      // Per-call rewiring of button handlers — each open binds THIS mount's
      // closures via `.onclick = ...`, which overwrites any prior handler.
      lb.querySelector('.close').onclick = () => _closeLightbox();
      lb.querySelector('.prev').onclick  = e => { e.stopPropagation(); _navLightbox(-1); };
      lb.querySelector('.next').onclick  = e => { e.stopPropagation(); _navLightbox(+1); };
      const annotateBtn = lb.querySelector('.annotate');
      if (annotateBtn) {
        annotateBtn.hidden = !!options.readOnly;
        annotateBtn.onclick = e => {
          e.stopPropagation();
          _setAnnotationMode(!state.annotationMode);
        };
      }
      const zoomBtn = lb.querySelector('.zoom');
      if (zoomBtn) {
        zoomBtn.onclick = e => {
          e.stopPropagation();
          _toggleLightboxZoom();
        };
      }
      _wireAnnotationToolbar(lb);
      _wireLightboxZoom(lb);
      lb.querySelector('.del').onclick   = async e => {
        e.stopPropagation();
        const photo = state.photos[state.lightboxIdx];
        if (!photo) return;
        const isSerialPhoto = photo.tag === 'serial' || photo.serialEntryId || photo.ocrStatus;
        const choice = await showConfirm({
          title: 'Foto verwijderen?',
          message: isSerialPhoto
            ? 'Deze foto is gekoppeld aan een OCR-serienummer. Wat wil je verwijderen?'
            : 'Deze foto wordt permanent verwijderd.',
          cancelValue: 'cancel',
          actions: isSerialPhoto
            ? [
                { value: 'cancel', label: 'Annuleren' },
                { value: 'photo-only', label: 'Alleen foto verwijderen', variant: 'primary' },
                { value: 'all', label: 'Alles verwijderen', variant: 'danger', autofocus: true },
              ]
            : [
                { value: 'cancel', label: 'Annuleren' },
                { value: 'all', label: 'Foto verwijderen', variant: 'danger', autofocus: true },
              ],
        });
        if (choice === 'cancel') return;
        showSpinner();
        try {
          await deleteProjectPhoto(options.projectId, photo.id, photo.storagePath, photo.thumbStoragePath || null, {
            preserveSerial: choice === 'photo-only',
            annotationStoragePath: photo.annotationStoragePath || null,
            annotatedThumbStoragePath: photo.annotatedThumbStoragePath || null,
          });
          await refresh();
          if (state.photos.length === 0) _closeLightbox();
          else {
            state.lightboxIdx = Math.min(state.lightboxIdx, state.photos.length - 1);
            _refreshLightboxImg();
          }
          if (typeof options.onChange === 'function') { try { await options.onChange(); } catch {} }
        } catch (err) {
          _toast('Verwijderen mislukt: ' + (err && err.message ? err.message : err), 'danger');
        } finally {
          hideSpinner();
        }
      };
      lb.onclick = e => { if (e.target === lb) _closeLightbox(); };

      _refreshLightboxImg();
      lb.classList.add('open');
      // Focus management: move focus into lightbox on open
      lb.querySelector('.close').focus();
    }
    async function _refreshLightboxImg() {
      const seq = ++state.lightboxSeq;
      state.annotationDirty = false;
      state.annotationDrawing = false;
      state.annotationLastPoint = null;
      state.annotationMode = false;
      state.annotationHasContent = false;

      const lb = document.getElementById('pu-lightbox');
      const img = document.querySelector('#pu-lightbox [data-pu-lightbox-img]');
      const canvas = document.querySelector('#pu-lightbox [data-pu-annotation-canvas]');
      const p   = state.photos[state.lightboxIdx];
      if (!img || !canvas || !lb) return;
      _resetLightboxZoom();
      const width = Number(p && p.width) || img.naturalWidth || 1;
      const height = Number(p && p.height) || img.naturalHeight || 1;
      canvas.width = width;
      canvas.height = height;
      _clearCanvas(canvas);
      _layoutAnnotationStage();
      _updateAnnotationControls();
      img.crossOrigin = 'anonymous';
      img.src = (p && (p.downloadUrl || p.thumbUrl)) || '';
      img.alt = (p && p.name) || '';
      if (p && p.annotationUrl) {
        try {
          const bitmap = await _loadBitmapFromUrl(p.annotationUrl);
          if (seq !== state.lightboxSeq) {
            _releaseBitmap(bitmap);
            return;
          }
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          _releaseBitmap(bitmap);
          state.annotationHasContent = true;
        } catch (e) {
          console.warn('[photo-uploader] annotation load failed', e);
        }
      }
      _setAnnotationMode(false);
      _updateAnnotationControls();
    }
    async function _navLightbox(delta) {
      if (!state.photos.length) return;
      if (!await _confirmDiscardAnnotation()) return;
      state.lightboxIdx = (state.lightboxIdx + delta + state.photos.length) % state.photos.length;
      _refreshLightboxImg();
    }
    async function _closeLightbox() {
      if (!await _confirmDiscardAnnotation()) return;
      const lb = document.getElementById('pu-lightbox');
      if (lb) lb.classList.remove('open');
    }

    function _resetLightboxZoom() {
      state.zoom = { scale: 1, x: 0, y: 0 };
      state.zoomPointers.clear();
      state.zoomPanLast = null;
      state.zoomPinchStart = null;
      _applyLightboxZoom();
    }

    function _applyLightboxZoom() {
      const lb = document.getElementById('pu-lightbox');
      const stage = document.querySelector('#pu-lightbox [data-pu-annotation-stage]');
      if (!stage) return;
      const scale = state.zoom.scale || 1;
      stage.style.transform = `translate3d(${state.zoom.x || 0}px, ${state.zoom.y || 0}px, 0) scale(${scale})`;
      stage.style.cursor = state.annotationMode ? 'crosshair' : (scale > 1 ? 'grab' : 'zoom-in');
      if (lb) lb.classList.toggle('is-zoomed', scale > 1);
      const zoomBtn = lb && lb.querySelector('.zoom');
      if (zoomBtn) {
        zoomBtn.classList.toggle('active', scale > 1);
        zoomBtn.innerHTML = scale > 1
          ? '<i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>'
          : '<i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>';
      }
    }

    function _zoomViewport() {
      const stage = document.querySelector('#pu-lightbox [data-pu-annotation-stage]');
      return {
        width: Math.max(1, stage?.offsetWidth || window.innerWidth),
        height: Math.max(1, stage?.offsetHeight || window.innerHeight),
      };
    }

    function _stageViewportOrigin(stage) {
      const rect = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 };
      return {
        left: rect.left - (state.zoom.x || 0),
        top: rect.top - (state.zoom.y || 0),
      };
    }

    function _pointWithinStage(clientX, clientY) {
      const stage = document.querySelector('#pu-lightbox [data-pu-annotation-stage]');
      const viewportOrigin = _stageViewportOrigin(stage);
      return {
        x: (Number(clientX) || viewportOrigin.left + _zoomViewport().width / 2) - viewportOrigin.left,
        y: (Number(clientY) || viewportOrigin.top + _zoomViewport().height / 2) - viewportOrigin.top,
      };
    }

    function _eventOriginWithinStage(e) {
      return _pointWithinStage(e.clientX, e.clientY);
    }

    function _setLightboxZoom(nextScale, origin) {
      state.zoom = nextZoomTransform({
        current: state.zoom,
        nextScale,
        origin: origin || { x: _zoomViewport().width / 2, y: _zoomViewport().height / 2 },
        viewport: _zoomViewport(),
      });
      _applyLightboxZoom();
    }

    function _toggleLightboxZoom() {
      if (state.annotationMode) return;
      if ((state.zoom.scale || 1) > 1) _resetLightboxZoom();
      else _setLightboxZoom(2);
    }

    function _wireLightboxZoom(lb) {
      const stage = lb.querySelector('[data-pu-annotation-stage]');
      if (!stage) return;

      stage._puZoomHandlers = {
        wheel: e => {
          if (state.annotationMode || !(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          const direction = e.deltaY < 0 ? 1 : -1;
          const multiplier = direction > 0 ? 1.25 : 0.8;
          _setLightboxZoom((state.zoom.scale || 1) * multiplier, _eventOriginWithinStage(e));
        },
        dblclick: e => {
          if (state.annotationMode) return;
          e.preventDefault();
          if ((state.zoom.scale || 1) > 1) _resetLightboxZoom();
          else _setLightboxZoom(2.5, _eventOriginWithinStage(e));
        },
        pointerdown: e => {
          if (state.annotationMode) return;
          state.zoomPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
          if (state.zoomPointers.size === 1 && (state.zoom.scale || 1) > 1) {
            e.preventDefault();
            state.zoomPanLast = { x: e.clientX, y: e.clientY };
            try { stage.setPointerCapture(e.pointerId); } catch {}
          } else if (state.zoomPointers.size === 2) {
            e.preventDefault();
            const touches = Array.from(state.zoomPointers.values());
            const midpoint = midpointBetweenTouches(touches);
            state.zoomPinchStart = {
              distance: getDistanceBetweenTouches(touches),
              zoom: { ...state.zoom },
              origin: midpoint ? _pointWithinStage(midpoint.x, midpoint.y) : null,
            };
          }
        },
        pointermove: e => {
          if (state.annotationMode || !state.zoomPointers.has(e.pointerId)) return;
          state.zoomPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
          if (state.zoomPointers.size >= 2 && state.zoomPinchStart) {
            e.preventDefault();
            const touches = Array.from(state.zoomPointers.values()).slice(0, 2);
            const distance = getDistanceBetweenTouches(touches);
            if (distance > 0 && state.zoomPinchStart.distance > 0) {
              const midpoint = midpointBetweenTouches(touches);
              state.zoom = nextPinchZoomTransform({
                start: state.zoomPinchStart.zoom,
                startDistance: state.zoomPinchStart.distance,
                distance,
                startOrigin: state.zoomPinchStart.origin,
                origin: midpoint ? _pointWithinStage(midpoint.x, midpoint.y) : state.zoomPinchStart.origin,
              });
              _applyLightboxZoom();
            }
          } else if ((state.zoom.scale || 1) > 1 && state.zoomPanLast) {
            e.preventDefault();
            state.zoom = panZoomTransform(state.zoom, {
              dx: e.clientX - state.zoomPanLast.x,
              dy: e.clientY - state.zoomPanLast.y,
            });
            state.zoomPanLast = { x: e.clientX, y: e.clientY };
            _applyLightboxZoom();
          }
        },
        endPointer: e => {
          state.zoomPointers.delete(e.pointerId);
          state.zoomPanLast = null;
          state.zoomPinchStart = null;
        },
      };

      if (stage.dataset.puZoomWired === '1') return;
      stage.dataset.puZoomWired = '1';
      stage.addEventListener('wheel', e => stage._puZoomHandlers?.wheel(e), { passive: false });
      stage.addEventListener('dblclick', e => stage._puZoomHandlers?.dblclick(e));
      stage.addEventListener('pointerdown', e => stage._puZoomHandlers?.pointerdown(e));
      stage.addEventListener('pointermove', e => stage._puZoomHandlers?.pointermove(e));
      stage.addEventListener('pointerup', e => stage._puZoomHandlers?.endPointer(e));
      stage.addEventListener('pointercancel', e => stage._puZoomHandlers?.endPointer(e));
      stage.addEventListener('lostpointercapture', e => stage._puZoomHandlers?.endPointer(e));
    }

    function _layoutAnnotationStage() {
      const stage = document.querySelector('#pu-lightbox [data-pu-annotation-stage]');
      const canvas = document.querySelector('#pu-lightbox [data-pu-annotation-canvas]');
      if (!stage || !canvas || !canvas.width || !canvas.height) return;
      const maxW = Math.max(240, window.innerWidth - (window.innerWidth < 576 ? 32 : 96));
      const maxH = Math.max(240, window.innerHeight - (state.annotationMode ? 168 : 96));
      const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
      stage.style.width = Math.max(1, Math.round(canvas.width * scale)) + 'px';
      stage.style.height = Math.max(1, Math.round(canvas.height * scale)) + 'px';
      _applyLightboxZoom();
    }

    function _wireAnnotationToolbar(lb) {
      const canvas = lb.querySelector('[data-pu-annotation-canvas]');
      if (!canvas || canvas.dataset.puAnnotationWired === '1') return;
      canvas.dataset.puAnnotationWired = '1';

      canvas.addEventListener('pointerdown', _annotationPointerDown);
      canvas.addEventListener('pointermove', _annotationPointerMove);
      canvas.addEventListener('pointerup', _annotationPointerUp);
      canvas.addEventListener('pointercancel', _annotationPointerUp);
      canvas.addEventListener('lostpointercapture', _annotationPointerUp);

      lb.querySelectorAll('[data-pu-annotation-color]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          state.annotationColor = btn.getAttribute('data-pu-annotation-color') || ANNOTATION_COLORS[0].value;
          lb.querySelectorAll('[data-pu-annotation-color]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });
      lb.querySelectorAll('[data-pu-annotation-size]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          state.annotationSize = parseInt(btn.getAttribute('data-pu-annotation-size'), 10) || ANNOTATION_SIZES[1].value;
          lb.querySelectorAll('[data-pu-annotation-size]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });
      const saveBtn = lb.querySelector('[data-pu-annotation-save]');
      if (saveBtn) saveBtn.addEventListener('click', e => {
        e.stopPropagation();
        _saveAnnotation();
      });
      const clearBtn = lb.querySelector('[data-pu-annotation-clear]');
      if (clearBtn) clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        _clearAnnotation();
      });
    }

    function _setAnnotationMode(enabled) {
      state.annotationMode = !!enabled;
      const lb = document.getElementById('pu-lightbox');
      if (!lb) return;
      lb.classList.toggle('annotation-mode', state.annotationMode);
      const toolbar = lb.querySelector('[data-pu-annotation-toolbar]');
      if (toolbar) toolbar.hidden = !state.annotationMode;
      const annotateBtn = lb.querySelector('.annotate');
      if (annotateBtn) annotateBtn.classList.toggle('active', state.annotationMode);
      _layoutAnnotationStage();
      _updateAnnotationControls();
    }

    function _updateAnnotationControls() {
      const lb = document.getElementById('pu-lightbox');
      if (!lb) return;
      const saveBtn = lb.querySelector('[data-pu-annotation-save]');
      const clearBtn = lb.querySelector('[data-pu-annotation-clear]');
      if (saveBtn) saveBtn.disabled = !state.annotationDirty;
      if (clearBtn) clearBtn.hidden = !(state.annotationHasContent || state.annotationDirty);
    }

    function _annotationPointerDown(e) {
      if (!state.annotationMode) return;
      e.preventDefault();
      const canvas = e.currentTarget;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      state.annotationDrawing = true;
      state.annotationLastPoint = _eventToCanvasPoint(canvas, e);
    }

    function _annotationPointerMove(e) {
      if (!state.annotationMode || !state.annotationDrawing || !state.annotationLastPoint) return;
      e.preventDefault();
      const canvas = e.currentTarget;
      const next = _eventToCanvasPoint(canvas, e);
      const prev = state.annotationLastPoint;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width > 0 ? canvas.width / rect.width : 1;
      ctx.strokeStyle = state.annotationColor;
      ctx.lineWidth = state.annotationSize * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      state.annotationLastPoint = next;
      state.annotationDirty = true;
      state.annotationHasContent = true;
      _updateAnnotationControls();
    }

    function _annotationPointerUp(e) {
      if (!state.annotationDrawing) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      state.annotationDrawing = false;
      state.annotationLastPoint = null;
    }

    function _eventToCanvasPoint(canvas, e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    async function _confirmDiscardAnnotation() {
      if (!state.annotationDirty) return true;
      const choice = await showConfirm({
        title: 'Aantekening niet opgeslagen',
        message: 'Je hebt nog niet opgeslagen aantekeningen. Wat wil je doen?',
        cancelValue: 'cancel',
        actions: [
          { value: 'cancel', label: 'Verder tekenen' },
          { value: 'discard', label: 'Niet opslaan', variant: 'danger' },
          { value: 'save', label: 'Opslaan en sluiten', variant: 'primary', autofocus: true },
        ],
      });
      if (choice === 'cancel') return false;
      if (choice === 'discard') {
        state.annotationDirty = false;
        return true;
      }
      if (choice === 'save') return _saveAnnotation();
      return false;
    }

    async function _saveAnnotation() {
      const photo = state.photos[state.lightboxIdx];
      const canvas = document.querySelector('#pu-lightbox [data-pu-annotation-canvas]');
      if (!photo || !canvas || !state.annotationDirty) return true;
      showSpinner();
      try {
        const annotationBlob = await _canvasToBlob(canvas, 'image/png');
        const annotatedThumbBlob = await _makeAnnotatedThumbBlob(photo, annotationBlob);
        await saveProjectPhotoAnnotation(options.projectId, photo, annotationBlob, annotatedThumbBlob);
        state.annotationDirty = false;
        state.annotationHasContent = true;
        await _refreshAfterAnnotationChange(photo.id);
        _toast('Aantekening opgeslagen.', 'success');
        return true;
      } catch (e) {
        _toast('Aantekening opslaan mislukt: ' + (e && e.message ? e.message : e), 'danger');
        return false;
      } finally {
        hideSpinner();
      }
    }

    async function _clearAnnotation() {
      const photo = state.photos[state.lightboxIdx];
      const canvas = document.querySelector('#pu-lightbox [data-pu-annotation-canvas]');
      if (!photo || !canvas || !(state.annotationHasContent || state.annotationDirty)) return;
      const ok = await showConfirm({
        title: 'Aantekeningen wissen?',
        message: 'Alle aantekeningen op deze foto worden verwijderd. De originele foto blijft behouden.',
        confirmLabel: 'Aantekeningen wissen',
        confirmVariant: 'danger',
        cancelLabel: 'Annuleren',
      });
      if (!ok) return;
      showSpinner();
      try {
        _clearCanvas(canvas);
        state.annotationDirty = false;
        state.annotationHasContent = false;
        if (photo.annotationStoragePath || photo.annotatedThumbStoragePath) {
          await deleteProjectPhotoAnnotation(options.projectId, photo);
          await _refreshAfterAnnotationChange(photo.id);
        }
        _updateAnnotationControls();
        _toast('Aantekeningen gewist.', 'success');
      } catch (e) {
        _toast('Aantekeningen wissen mislukt: ' + (e && e.message ? e.message : e), 'danger');
      } finally {
        hideSpinner();
      }
    }

    async function _refreshAfterAnnotationChange(photoId) {
      await refresh();
      const idx = state.photos.findIndex(p => p.id === photoId);
      if (idx >= 0) state.lightboxIdx = idx;
      await _refreshLightboxImg();
      if (typeof options.onChange === 'function') { try { await options.onChange(); } catch {} }
    }

    function _clearCanvas(canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    async function _loadBitmapFromUrl(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Afbeelding laden mislukt (${res.status})`);
      const blob = await res.blob();
      return _loadBitmapFromBlob(blob);
    }

    async function _makeAnnotatedThumbBlob(photo, annotationBlob) {
      const baseBitmap = await _loadBitmapFromUrl(photo.thumbUrl || photo.downloadUrl);
      const annotationBitmap = await _loadBitmapFromBlob(annotationBlob);
      try {
        const baseWidth = _bitmapWidth(baseBitmap);
        const baseHeight = _bitmapHeight(baseBitmap);
        const longest = Math.max(baseWidth, baseHeight);
        const scale = longest > 400 ? 400 / longest : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(baseWidth * scale));
        canvas.height = Math.max(1, Math.round(baseHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context niet beschikbaar');
        ctx.drawImage(baseBitmap, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(annotationBitmap, 0, 0, canvas.width, canvas.height);
        return _canvasToBlob(canvas, 'image/jpeg', 0.82);
      } finally {
        _releaseBitmap(baseBitmap);
        _releaseBitmap(annotationBitmap);
      }
    }

    function _canvasToBlob(canvas, type, quality) {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas export mislukt'));
        }, type, quality);
      });
    }

    async function _loadBitmapFromBlob(blob) {
      if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
      return _loadImageElementFromBlob(blob);
    }

    async function _loadImageElementFromBlob(blob) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img._puObjectUrl = url;
      img.src = url;
      if (typeof img.decode === 'function') await img.decode();
      else await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      return img;
    }

    function _bitmapWidth(bitmap) {
      return bitmap.width || bitmap.naturalWidth || 1;
    }

    function _bitmapHeight(bitmap) {
      return bitmap.height || bitmap.naturalHeight || 1;
    }

    function _releaseBitmap(bitmap) {
      if (!bitmap) return;
      if (typeof bitmap.close === 'function') bitmap.close();
      if (bitmap._puObjectUrl) {
        try { URL.revokeObjectURL(bitmap._puObjectUrl); } catch {}
      }
    }

    function openByPhotoId(photoId) {
      const idx = state.photos.findIndex(p => p.id === photoId);
      if (idx >= 0) _openLightbox(idx);
    }

    // Lazy backfill — one at a time, fail-soft.
    async function _drainBackfillQueue() {
      if (state.backfillBusy) return;
      state.backfillBusy = true;
      try {
        while (state.backfillQueue.length > 0) {
          const photoId = state.backfillQueue.shift();
          const photo = state.photos.find(p => p.id === photoId);
          if (!photo || photo.thumbStoragePath) continue;
          try {
            await backfillThumbnail(options.projectId, photo);
            // re-load URLs for this photo only
            const updated = await listProjectPhotos(options.projectId);
            state.photos = updated;
            _renderGrid();
          } catch (e) {
            console.warn('[photo-uploader] backfill failed for', photoId, e);
          }
        }
      } finally {
        state.backfillBusy = false;
      }
    }

    function _setErr(msg) {
      const el = containerEl.querySelector('[data-pu-err]');
      if (!el) return;
      if (msg) { el.textContent = msg; el.classList.remove('d-none'); }
      else      { el.textContent = '';  el.classList.add('d-none');    }
    }

    function _setProgress(done, total, filename, step) {
      const wrap = containerEl.querySelector('[data-pu-progress]');
      if (!wrap) return;
      if (total <= 0) { wrap.classList.add('d-none'); return; }
      wrap.classList.remove('d-none');
      const pct  = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
      const bar  = wrap.querySelector('.progress-bar');
      const lbl  = wrap.querySelector('[data-pu-count]');
      if (bar) bar.style.width = pct + '%';
      const fileLabel = filename ? ` — ${filename}` : '';
      const stepLabel = step ? ` · ${step}` : '';
      if (lbl) lbl.textContent = `${done}/${total}${fileLabel}${stepLabel}`;
    }

    async function _handleFiles(fileList) {
      if (state.uploadBusy) {
        _toast('Even wachten — vorige upload nog bezig.', 'warning');
        return;
      }
      state.uploadBusy = true;
      try {
        if (!options.projectId) {
          _toast('Sla het project eerst op.', 'warning');
          return;
        }
        // Accept anything that looks like an image: MIME type OR filename suffix.
        // Some Android Chrome variants serve HEIC files with an empty file.type,
        // so falling back to the extension lets those through.
        const files = Array.from(fileList || []).filter(f => {
          if (!f) return false;
          if (f.type && f.type.startsWith('image/')) return true;
          return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name || '');
        });
        if (files.length === 0) return;
        _setErr('');

        const uploadedIds = [];
        const localThumbs = [];
        _setProgress(0, files.length, files[0].name);

        showSpinner({ progress: true, current: 0, total: files.length, message: 'Foto\'s uploaden...' });

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          _setProgress(i, files.length, file.name);
          try {
            // Surface each upload phase in the progress label so the user can
            // see what's happening (HEIC conversion can take 5-15s).
            const reportStep = (step) => {
              _setProgress(i, files.length, file.name, step);
              if (typeof updateSpinner === 'function') {
                updateSpinner({ current: i, total: files.length, message: `${file.name} · ${step}` });
              }
            };
            // uploadProjectPhotoWithThumb returns { id, thumbBlob, displayName } —
            // reuse the thumbBlob for the local preview so we don't decode the
            // (possibly HEIC) source twice.
            const res = await uploadProjectPhotoWithThumb(options.projectId, file, { tag: 'situation_before', onStep: reportStep });
            uploadedIds.push(res.id);
            localThumbs.push({ id: res.id, blobUrl: URL.createObjectURL(res.thumbBlob), name: res.displayName || file.name });
            updateSpinner({ current: i + 1, total: files.length });
          } catch (e) {
            hideSpinner();
            _toast('Foto upload mislukt: ' + (e && e.message ? e.message : e), 'danger');
            _setErr('Foto upload mislukt: ' + (e && e.message ? e.message : e));
            break;
          }
        }
        _setProgress(uploadedIds.length, files.length);
        setTimeout(() => _setProgress(0, 0), 800);

        await refresh();
        hideSpinner();

        if (uploadedIds.length > 0) {
          _openTagModal(uploadedIds, localThumbs);
        }

        if (typeof options.onChange === 'function') {
          try { await options.onChange(); } catch {}
        }
      } finally {
        state.uploadBusy = false;
      }
    }

    function _openTagModal(uploadedIds, localThumbs) {
      if (!uploadedIds || uploadedIds.length === 0) return;
      const el = _ensureModalEl();
      const list = el.querySelector('[data-pu-modal-list]');
      const thumbByIdMap = new Map(localThumbs.map(t => [t.id, t]));

      // Render rows — one per uploaded photo
      list.innerHTML = uploadedIds.map(id => {
        const t = thumbByIdMap.get(id) || { blobUrl: '', name: '' };
        return `
          <div class="d-flex align-items-center gap-3 mb-2 pb-2 border-bottom" data-pu-modal-row data-photo-id="${escapeHtml(id)}">
            <img src="${escapeHtml(t.blobUrl)}" alt="${escapeHtml(t.name)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;" />
            <div class="flex-grow-1">
              <div class="small text-muted text-truncate" style="max-width:200px;">${escapeHtml(t.name)}</div>
              <div class="row g-2 mt-1">
                <div class="col-12 col-md-7">
                  <label class="form-label small mb-1" for="tag-${escapeHtml(id)}">Categorie</label>
                  <select class="form-select form-select-sm" id="tag-${escapeHtml(id)}" data-pu-tag-select>
                    ${_tagOptionsHtml('situation_before')}
                  </select>
                </div>
                <div class="col-12 col-md-5" data-pu-cat-row hidden>
                  <label class="form-label small mb-1" for="cat-${escapeHtml(id)}">Serieel type</label>
                  <select class="form-select form-select-sm" id="cat-${escapeHtml(id)}" data-pu-cat-select>
                    ${_serialCategoryOptionsHtml('battery')}
                  </select>
                </div>
              </div>
            </div>
          </div>`;
      }).join('');

      // Show category row only when this photo is tagged as serial.
      list.querySelectorAll('[data-pu-modal-row]').forEach(row => {
        row.querySelectorAll('[data-pu-tag-select]').forEach(select => {
          select.addEventListener('change', () => {
            _syncSerialCategoryVisibility(row);
          });
        });
        _syncSerialCategoryVisibility(row);
      });

      // Bulk handlers
      el.querySelectorAll('[data-pu-bulk]').forEach(btn => {
        btn.onclick = () => {
          const target = btn.getAttribute('data-pu-bulk');
          list.querySelectorAll('[data-pu-modal-row]').forEach(row => {
            const select = row.querySelector('[data-pu-tag-select]');
            if (select) select.value = target;
            _syncSerialCategoryVisibility(row);
          });
          // When bulk-tagging as serial, also reveal the category row and reset
          // each one to the default Batterij selection.
          if (target === 'serial') {
            list.querySelectorAll(`[data-pu-cat-row]`).forEach(catRow => {
              catRow.hidden = false;
              const def = catRow.querySelector('[data-pu-cat-select]');
              if (def) def.value = 'battery';
            });
          } else {
            list.querySelectorAll(`[data-pu-cat-row]`).forEach(catRow => {
              catRow.hidden = true;
            });
          }
        };
      });

      // Save handler — Firestore WriteBatch, only patch non-default tags
      const saveBtn = el.querySelector('[data-pu-modal-save]');
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        const btnOrig = saveBtn.textContent;
        saveBtn.textContent = 'Opslaan…';
        showSpinner();
        try {
          const db = firebase.firestore();
          const batch = db.batch();
          let patches = 0;
          uploadedIds.forEach(id => {
            const row = list.querySelector(`[data-photo-id="${CSS.escape(id)}"]`);
            const tagSelect = row && row.querySelector('[data-pu-tag-select]');
            const tag = normalizePhotoTag(tagSelect && tagSelect.value);
            const ref = db.collection('projects').doc(options.projectId).collection('photos').doc(id);
            const flags = defaultPhotoFlags(tag);
            if (tag === 'serial') {
              const catSelect = row.querySelector('[data-pu-cat-select]');
              const category = normalizeSerialCategory(catSelect && catSelect.value);
              batch.update(ref, {
                tag: 'serial',
                serialCategory: category,
                ocrStatus: 'pending',
                ...flags,
              });
            } else {
              batch.update(ref, {
                tag,
                serialCategory: firebase.firestore.FieldValue.delete(),
                ocrStatus: firebase.firestore.FieldValue.delete(),
                ...flags,
              });
            }
            patches++;
          });
          if (patches > 0) await batch.commit();
          bootstrap.Modal.getOrCreateInstance(el).hide();
          await refresh();
        } catch (e) {
          _toast('Tags opslaan mislukt: ' + (e && e.message ? e.message : e), 'danger');
        } finally {
          hideSpinner();
          saveBtn.disabled = false;
          saveBtn.textContent = btnOrig;
        }
      };

      // Cleanup blob URLs when modal closes (either via save or dismiss)
      const onHidden = () => {
        localThumbs.forEach(t => { try { URL.revokeObjectURL(t.blobUrl); } catch {} });
        el.removeEventListener('hidden.bs.modal', onHidden);
      };
      el.addEventListener('hidden.bs.modal', onHidden);

      bootstrap.Modal.getOrCreateInstance(el).show();
    }

    function _syncSerialCategoryVisibility(row) {
      const tagSelect = row.querySelector('[data-pu-tag-select]');
      const catRow = row.querySelector('[data-pu-cat-row]');
      if (!catRow) return;
      const isSerial = tagSelect && tagSelect.value === 'serial';
      catRow.hidden = !isSerial;
      if (isSerial) {
        const def = catRow.querySelector('[data-pu-cat-select]');
        if (def && !def.value) def.value = 'battery';
      }
    }

    function destroy() {
      _closeLightbox();
      _activeLightboxMount = null;
      // Hide the tag modal if one is currently visible from this (or a prior) mount.
      // Uses getInstance (not getOrCreateInstance) so we don't create an instance
      // on an element that might not exist yet.
      const tagModalEl = document.getElementById('pu-tag-modal');
      if (tagModalEl && window.bootstrap) {
        const inst = bootstrap.Modal.getInstance(tagModalEl);
        if (inst) inst.hide();
      }
      containerEl.innerHTML = '';
    }

    // Camera input
    const camInput = containerEl.querySelector('[data-pu-camera]');
    if (camInput) {
      camInput.addEventListener('change', async e => {
        if (e.target.files && e.target.files.length) await _handleFiles(e.target.files);
        camInput.value = '';
      });
    }

    // Gallery input
    const galInput = containerEl.querySelector('[data-pu-gallery]');
    if (galInput) {
      galInput.addEventListener('change', async e => {
        if (e.target.files && e.target.files.length) await _handleFiles(e.target.files);
        galInput.value = '';
      });
    }

    // Drop-zone (desktop only; hidden under md via Bootstrap `d-md-block`).
    const drop = containerEl.querySelector('[data-pu-drop]');
    if (drop) {
      drop.removeAttribute('hidden');
      drop.addEventListener('dragover', e => {
        e.preventDefault(); drop.classList.add('drag-over');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
      drop.addEventListener('drop', async e => {
        e.preventDefault(); drop.classList.remove('drag-over');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) await _handleFiles(files);
      });
      drop.addEventListener('click', () => {
        if (galInput) galInput.click();
      });
    }

    refresh();

    return { refresh, destroy, openByPhotoId };
  }

  global.mountPhotoUploader = mountPhotoUploader;
})(window);
