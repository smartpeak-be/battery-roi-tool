import { escapeHtml, showToast, showState, shortEmail, fmtDate, fmtRelTime, withSpinner, showConfirm } from '../shared-helpers.js';
import { parseSheetConfigs, processDataPure, buildAllDaysFromDailyCompact, serializeDForLastCalcRun } from '../calc-engine.js';
import { mountProjectDocuments, mergeProjectDocuments, resolveDocumentDownloadUrls } from '../project-documents.js';
import { buildClosingDossierModel, buildClosingDossierDraftTexts, openClosingDossierPrintWindow, renderClosingDossierEditorModalHtml } from '../project-closing-dossier.js';

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Wire sign-in button
  document.getElementById('btnSignIn').addEventListener('click', async () => {
    const errEl = document.getElementById('signInError');
    errEl.classList.add('hide');
    try {
      await signInWithGoogle();
      // onAuthStateChanged will pick up the new user and switch state.
    } catch (e) {
      errEl.textContent = 'Aanmelden mislukt: ' + (e && e.message ? e.message : e);
      errEl.classList.remove('hide');
    }
  });
  document.getElementById('btnSignOut').addEventListener('click', () => signOut());
  document.getElementById('btnSignOutNW').addEventListener('click', () => signOut());

  // New-project button → redirect to project-edit page.
  document.getElementById('btnNewProject').addEventListener('click', () => {
    window.location.href = 'project-edit.html?new=1';
  });

  // Listen for auth state changes
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
    refreshProjectList(true);
    refreshLeads();
  });

  document.getElementById('toggleShowDeleted').addEventListener('change', refreshProjectList);
  document.getElementById('toggleShowFinished').addEventListener('change', refreshProjectList);
  document.getElementById('projectSearch').addEventListener('input', () => {
    // Debounce: re-render only (already-loaded list) without re-fetching Firestore.
    renderCurrent(true);
  });
  // Leads "Toon verwijderde" toggle: persisted, re-render only (cache already loaded).
  const leadsToggle = document.getElementById('toggleShowDeletedLeads');
  try {
    leadsToggle.checked = localStorage.getItem('smartpeak.showDeletedLeads') === '1';
  } catch {}
  leadsToggle.addEventListener('change', () => {
    try { localStorage.setItem('smartpeak.showDeletedLeads', leadsToggle.checked ? '1' : '0'); } catch {}
    renderLeads();
  });
  // View toggle (Lijst / Bord). Remembers choice in localStorage.
  document.querySelectorAll('#viewToggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      try { localStorage.setItem('smartpeak.dashboardView', v); } catch {}
      document.querySelectorAll('#viewToggle button').forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        if (isActive) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      renderCurrent();
    });
  });
  // Restore view choice on load (default = list).
  try {
    const saved = localStorage.getItem('smartpeak.dashboardView') || 'list';
    document.querySelectorAll('#viewToggle button').forEach(b => {
      const isActive = b.dataset.view === saved;
      b.classList.toggle('active', isActive);
      if (isActive) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  } catch {}

  // Reset drawer state when Bootstrap hides it (hidden.bs.offcanvas also handled above)
});

const VOLTAGE_MEASUREMENT_LABELS = {
  l1N: 'L1 - N',
  l2N: 'L2 - N',
  l3N: 'L3 - N',
  l1L2: 'L1 - L2',
  l1L3: 'L1 - L3',
  l2L3: 'L2 - L3',
  l1Pe: 'L1 - PE',
  l2Pe: 'L2 - PE',
  l3Pe: 'L3 - PE',
  nPe: 'N - PE',
};

function fmtDateString(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function detailRowsHtml(rows) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!visible.length) return '';
  return `
    <dl class="row g-2 mb-0">
      ${visible.map(([label, value]) => `
        <dt class="col-sm-5 text-muted fw-normal">${escapeHtml(label)}</dt>
        <dd class="col-sm-7 mb-0">${escapeHtml(value)}</dd>
      `).join('')}
    </dl>
  `;
}

// ─── PROJECT LIST ───────────────────────────────────────────────────────────
// statusChipHTML() lives in assets/js/status-chip.js (shared component)

function rowHTML(p, isDeleted) {
  const updated = fmtDate(p.updatedAt);
  const editBtn = isDeleted
    ? ''
    : `<a class="btn btn-sm btn-outline-secondary editBtn" data-id="${p.id}" href="project-edit.html?project=${p.id}" title="Bewerk" aria-label="Bewerk project"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></a>`;
  const calcBtn = (!isDeleted && p.lastCalcRun && p.lastCalcRun.calculatedAt)
    ? `<a class="btn btn-sm btn-outline-secondary calcBtn" data-id="${p.id}" href="index.html?project=${p.id}#results" title="Open berekening" aria-label="Open berekening"><i class="fa-solid fa-calculator" aria-hidden="true"></i></a>`
    : '';
  const reviewBtn = isDeleted
    ? ''
    : `<button type="button" class="btn btn-sm btn-outline-primary reviewLinkBtn" data-id="${p.id}" title="Reviewlink maken/kopiëren" aria-label="Reviewlink maken/kopiëren"><i class="fa-solid fa-star" aria-hidden="true"></i></button>`;
  const action  = isDeleted
    ? `<button type="button" class="btn btn-sm btn-outline-secondary restoreBtn" data-id="${p.id}" title="Herstellen" aria-label="Herstellen"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
       <button type="button" class="btn btn-sm btn-outline-danger permdelBtn"   data-id="${p.id}" data-name="${escapeHtml(getProjectLabel(p))}" title="Definitief verwijderen" aria-label="Definitief verwijderen"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i></button>`
    : `<button type="button" class="btn btn-sm btn-outline-danger deleteBtn"    data-id="${p.id}" title="Verwijderen" aria-label="Verwijderen"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
  const email  = currentUserEmail();
  const chat   = hasUnreadComments(p, email)
    ? `<span class="chat-indicator unread" role="img" aria-label="Nieuwe opmerking(en) van collega" title="Nieuwe opmerking(en) van collega"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i></span>`
    : '';
  const gfStatus = groundFaultStatus(p);
  const warn   = gfStatus === 'unsupported'
    ? `<span class="row-warning" role="img" aria-label="Niet-ondersteund producttype in configuratie" title="Niet-ondersteund producttype in configuratie — enkel Zendure en Marstek worden herkend."><i class="fa-solid fa-triangle-exclamation icon-danger" aria-hidden="true"></i></span>`
    : gfStatus === 'no-measurement'
    ? `<span class="row-warning" role="img" aria-label="Meting fase-aarde nog niet uitgevoerd" title="Meting fase↔aarde nog niet uitgevoerd. Voer de meting uit en registreer het resultaat in het project."><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i></span>`
    : '';
  const warnOfferte = needsOfferteWarning(p)
    ? `<span class="row-warning row-warning-offerte" role="img" aria-label="Offertes ontbreken" title="Offertes ontbreken — klant zit in offerte-fase maar er zijn configs zonder PDF."><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i></span>`
    : '';
  const bebat = bebatSummaryForProject(p);
  const bebatWarn = bebat.pending > 0
    ? `<span class="row-warning" role="img" aria-label="Bebat nog te registreren" title="${bebat.pending} batterijserienummer(s) nog Bebat registreren."><i class="fa-solid fa-recycle icon-warn" aria-hidden="true"></i></span>`
    : '';
  return `
    <tr class="${isDeleted ? 'text-muted opacity-50' : ''}" data-id="${p.id}">
      <td>${chat}${warn}${warnOfferte}${bebatWarn}<button type="button" class="btn btn-link p-0 text-decoration-none fw-semibold projectNameBtn" data-id="${p.id}">${escapeHtml(getProjectLabel(p))}</button></td>
      <td class="d-none d-sm-table-cell">${escapeHtml(p.customerName || '')}</td>
      <td>${statusChipHTML(p.status, p.id)}</td>
      <td class="d-none d-sm-table-cell text-muted small">${updated}</td>
      <td class="d-none d-md-table-cell text-muted small">${p.lastCalcRun ? fmtDate(p.lastCalcRun.calculatedAt) : '—'}</td>
      <td class="text-end">
        <div class="d-flex gap-1 justify-content-end">
          ${calcBtn}
          ${reviewBtn}
          ${editBtn}
          ${action}
        </div>
      </td>
    </tr>`;
}

// Cached list of projects from Firestore. Filtering + render happens on this cache.
let _projectsCache = { active: [], deleted: [] };

// Pagination state (list view only; board view shows all projects).
const PAGE_SIZE = 25;
let _currentPage = 1;

async function refreshProjectList(showSpinnerOverlay = false) {
  _currentPage = 1;
  const el = document.getElementById('projectList');
  el.innerHTML = '<p class="sp-empty-state">⏳ Laden…</p>';
  const showDeleted = document.getElementById('toggleShowDeleted').checked;

  const doRefresh = async () => {
    try {
      _projectsCache.active  = await listActiveProjects();
      _projectsCache.deleted = showDeleted ? await listDeletedProjects() : [];
      renderCurrent();
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger">Kon projecten niet laden: ${escapeHtml(e && e.message ? e.message : String(e))}</div>`;
    }
  };

  if (showSpinnerOverlay) {
    await withSpinner(doRefresh);
  } else {
    await doRefresh();
  }
}

function currentView() {
  if (window.innerWidth < 992) return 'list';
  return localStorage.getItem('smartpeak.dashboardView') || 'list';
}

// Apply filters (search + show-finished) to the cached projects and render in the
// currently-active view mode (list or board).
function renderCurrent(resetPage = false) {
  if (resetPage) _currentPage = 1;

  const el = document.getElementById('projectList');
  const searchQ = (document.getElementById('projectSearch').value || '').trim().toLowerCase();
  const showFinished = document.getElementById('toggleShowFinished').checked;

  const matchesFilters = p => {
    if (!p.deletedAt && !showFinished && FINISHED_STATUSES.includes(p.status)) return false;
    if (searchQ) {
      const hay = ((p.projectName || '') + ' ' + (p.customerName || '')).toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }
    return true;
  };

  const active  = _projectsCache.active.filter(matchesFilters);
  const deleted = _projectsCache.deleted.filter(matchesFilters);

  if (active.length + deleted.length === 0) {
    el.innerHTML = '<p class="sp-empty-state">Geen projecten die voldoen aan de filters.</p>';
    return;
  }

  const viewMode = currentView();
  if (viewMode === 'board') {
    renderBoard(active, el);
  } else {
    // Combine active + deleted into one list for pagination.
    const allFiltered = [...active, ...deleted];
    const totalPages  = Math.ceil(allFiltered.length / PAGE_SIZE);
    // Clamp current page to valid range.
    if (_currentPage > totalPages) _currentPage = totalPages;
    if (_currentPage < 1) _currentPage = 1;
    const start = (_currentPage - 1) * PAGE_SIZE;
    const page  = allFiltered.slice(start, start + PAGE_SIZE);
    // Split page slice back into active/deleted for row styling.
    const activeIds  = new Set(active.map(p => p.id));
    const pageActive = page.filter(p => activeIds.has(p.id));
    const pageDeleted = page.filter(p => !activeIds.has(p.id));
    renderList(pageActive, pageDeleted, el, _currentPage, totalPages, allFiltered.length);
  }
}

function renderList(active, deleted, el, page, totalPages, totalCount) {
  const rows = [
    ...active.map(p => rowHTML(p, false)),
    ...deleted.map(p => rowHTML(p, true)),
  ].join('');

  // Pagination bar — only shown when there are multiple pages.
  const paginationHTML = totalPages > 1
    ? `<nav class="sp-pagination" aria-label="Projectlijst paginering">
        <button type="button" class="btn btn-sm btn-outline-primary pageBtn" data-dir="prev" ${page <= 1 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Vorige
        </button>
        <span class="sp-pagination-info">${page} / ${totalPages} <span class="text-muted">(${totalCount} projecten)</span></span>
        <button type="button" class="btn btn-sm btn-outline-primary pageBtn" data-dir="next" ${page >= totalPages ? 'disabled' : ''}>
          Volgende <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </nav>`
    : '';

  el.innerHTML = `
    <div class="sp-project-list">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Project</th>
            <th class="d-none d-sm-table-cell">Klant</th>
            <th>Status</th>
            <th class="d-none d-sm-table-cell">Gewijzigd</th>
            <th class="d-none d-md-table-cell">Laatste calc</th>
            <th class="text-end">Acties</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${paginationHTML}`;
  wireRowActions(el);

  // Wire pagination buttons.
  el.querySelectorAll('.pageBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.dir === 'prev' && _currentPage > 1) _currentPage--;
      else if (btn.dataset.dir === 'next' && _currentPage < totalPages) _currentPage++;
      renderCurrent();
      // Scroll project list card into view after page change.
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderBoard(active, el) {
  // Only non-deleted projects in the board view.
  const byPhase = new Map(PROJECT_PHASES.map(p => [p.key, []]));
  for (const proj of active) {
    const phase = phaseForStatus(proj.status);
    byPhase.get(phase.key).push(proj);
  }
  el.innerHTML = `
    <div class="kanban-board">
      ${PROJECT_PHASES.map(phase => {
        const items = byPhase.get(phase.key);
        return `
          <div class="kanban-col" data-phase="${phase.key}">
            <div class="kanban-col-header">
              <span><span class="phase-dot" style="background:${phase.color};"></span>${phase.label}</span>
              <span class="count">${items.length}</span>
            </div>
            <div class="kanban-col-body">
        ${items.map(p => kanbanCardHTML(p)).join('') || '<p class="sp-empty-state sp-text-body-xs">—</p>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  wireBoard(el);
}

function kanbanCardHTML(p) {
  const email = currentUserEmail();
  const chat  = hasUnreadComments(p, email)
    ? `<span class="chat-indicator unread" role="img" aria-label="Nieuwe opmerking(en)" title="Nieuwe opmerking(en)"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i></span>`
    : '';
  const gfSt  = groundFaultStatus(p);
  const warn  = gfSt === 'unsupported'
    ? `<span class="row-warning" role="img" aria-label="Niet-ondersteund producttype" title="Niet-ondersteund producttype."><i class="fa-solid fa-triangle-exclamation icon-danger" aria-hidden="true"></i></span>`
    : gfSt === 'no-measurement'
    ? `<span class="row-warning" role="img" aria-label="Meting fase-aarde nog niet uitgevoerd" title="Meting fase↔aarde nog niet uitgevoerd."><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i></span>`
    : '';
  const warnOfferte = needsOfferteWarning(p)
    ? `<span class="row-warning row-warning-offerte" role="img" aria-label="Offertes ontbreken" title="Offertes ontbreken — klant zit in offerte-fase maar er zijn configs zonder PDF."><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i></span>`
    : '';
  const bebat = bebatSummaryForProject(p);
  const bebatWarn = bebat.pending > 0 ? `<span class="row-warning" title="Bebat nog te registreren"><i class="fa-solid fa-recycle icon-warn" aria-hidden="true"></i></span>` : '';
  return `
    <div class="kanban-card" draggable="true" data-id="${p.id}">
      <div class="kanban-card-title" data-id="${p.id}">${chat}${warn}${warnOfferte}${bebatWarn}${escapeHtml(getProjectLabel(p))}</div>
      <div class="kanban-card-customer">${escapeHtml(p.customerName || '')}</div>
      <div class="kanban-card-footer">
        ${statusChipHTML(p.status, p.id)}
      </div>
    </div>
  `;
}

async function createAndCopyReviewLink(projectId, btn) {
  if (!projectId || typeof createReviewRequestForProject !== 'function') return;
  const oldHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
  }
  try {
    const request = await createReviewRequestForProject(projectId);
    const url = request.url;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Reviewlink gekopieerd.', 'success');
    } catch {
      window.prompt('Reviewlink kopiëren:', url);
    }
  } catch (err) {
    showToast('Reviewlink maken mislukt: ' + (err && err.message ? err.message : err), 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

function wireRowActions(el) {
  // Wire project-name buttons → open drawer
  el.querySelectorAll('.projectNameBtn').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.id));
  });
  el.querySelectorAll('.reviewLinkBtn').forEach(btn => {
    btn.addEventListener('click', async () => createAndCopyReviewLink(btn.dataset.id, btn));
  });
  el.querySelectorAll('.deleteBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: 'Project verwijderen?',
        message: 'Het project wordt soft-deleted en blijft herstelbaar via "Toon verwijderde".',
        confirmText: 'Project verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      await withSpinner(async () => {
        try { await softDeleteProject(btn.dataset.id); await refreshProjectList(); }
        catch (err) { showToast('Kon niet verwijderen: ' + (err && err.message ? err.message : err), 'danger'); }
      });
    });
  });
  el.querySelectorAll('.restoreBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await withSpinner(async () => {
        try { await restoreProject(btn.dataset.id); await refreshProjectList(); }
        catch (err) { showToast('Kon niet herstellen: ' + (err && err.message ? err.message : err), 'danger'); }
      });
    });
  });
  el.querySelectorAll('.permdelBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name || '(project)';
      const ok = await showConfirm({
        title: 'Project definitief verwijderen?',
        message: `Alle gegevens, opmerkingen en foto's van "${name}" worden permanent gewist. Dit kan niet ongedaan worden.`,
        confirmText: 'Definitief verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      btn.disabled = true;
      await withSpinner(async () => {
        try {
          await hardDeleteProject(id);
          await refreshProjectList();
        } catch (err) {
          showToast('Definitief verwijderen mislukt: ' + (err && err.message ? err.message : err), 'danger');
          btn.disabled = false;
        }
      });
    });
  });
}

function wireBoard(el) {
  // Name-click → drawer
  el.querySelectorAll('.kanban-card-title').forEach(t => {
    t.addEventListener('click', () => openDrawer(t.dataset.id));
  });
  // Drag & drop: cards draggable, columns are drop targets.
  el.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  el.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => {
      // Only clear highlight when leaving the column entirely.
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id       = e.dataTransfer.getData('text/plain');
      const phaseKey = col.dataset.phase;
      if (!id || !phaseKey) return;
      const phase = PROJECT_PHASES.find(p => p.key === phaseKey);
      if (!phase) return;
      // No-op if already in this phase.
      const proj = _projectsCache.active.find(p => p.id === id);
      if (proj && phaseForStatus(proj.status).key === phaseKey) return;
      await withSpinner(async () => {
        try {
          await updateProjectStatus(id, phase.statuses[0]);
          await refreshProjectList();
        } catch (err) {
          showToast('Status wijzigen mislukt: ' + (err && err.message ? err.message : err), 'danger');
        }
      });
    });
  });
}

// ─── DRAWER ──────────────────────────────────────────────────────────────────
let _drawerProjectId    = null;
let _currentDrawerProject = null;
let _drawerPhotoUploader = null;
let _drawerDocumentsExplorer = null;
// Firestore onSnapshot unsubscribe for the open drawer's project doc. Used to
// live-update the serial-list (Task 10). Scoped to the drawer-open lifecycle:
// subscribe in openDrawer, unsubscribe in closeDrawer + on hidden.bs.offcanvas.
let _drawerSerialUnsub = null;

// Offerte upload modal + config-row rendering + click delegation all live in
// assets/js/offertes-ui.js — shared between dashboard.html and project-edit.html.
// Init is done near the page bootstrap (ensureOfferteModal + wireOffertesClicks
// on the drawer element).

async function _refreshCurrentDrawer() {
  if (!_currentDrawerProject || !_drawerProjectId) return;
  const id = _currentDrawerProject.id;
  // Stale guard: if the drawer switches to a different project while we
  // are awaiting Firestore, discard the outdated response.
  const refreshId = _drawerProjectId;
  const snap = await firebase.firestore().collection('projects').doc(id).get();
  if (_drawerProjectId !== refreshId) return;
  if (!snap.exists) return;
  // Keep the raw doc shape (id + all top-level fields: projectName, customerName,
  // status, lastCalcRun, offertes, ...). renderDrawer internally
  // calls mergeProjectMetadata() to normalize the nested metadata sections;
  // wrapping here would strip the top-level fields and break warnings + configs.
  const fresh = { id: snap.id, ...snap.data() };
  _currentDrawerProject = fresh;
  renderDrawer(fresh);
  // Re-populate the async sections (comments + photo uploader) that renderDrawer reset
  // to their loading placeholders. Without this the drawer is stuck mid-reload.
  try {
    const [comments] = await Promise.all([
      listComments(id).catch(err => { console.warn('listComments failed', err); return []; }),
    ]);
    if (_drawerProjectId !== refreshId) return;
    renderComments(fresh, comments);
    if (_drawerPhotoUploader) await _drawerPhotoUploader.refresh();
    if (_drawerDocumentsExplorer) await _drawerDocumentsExplorer.refresh();
  } catch (err) {
    console.warn('drawer refresh async sections failed', err);
  }
}

async function openDrawer(projectId) {
  // Guard: if a different drawer is already loading, the stale response must
  // not overwrite the new one. We capture the ID at call-time and compare
  // after every await to detect a superseded open.
  _drawerProjectId = projectId;
  const openId = projectId;

  const drawerEl = document.getElementById('drawer');
  const body     = document.getElementById('drawerBody');
  const header   = document.getElementById('drawerHeader');

  body.innerHTML   = '<p class="sp-empty-state">⏳ Laden…</p>';
  header.innerHTML = `
    <div class="flex-grow-1">
      <h5 class="offcanvas-title mb-0" id="drawerHeaderTitle">…</h5>
    </div>
    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Sluit"></button>
  `;

  bootstrap.Offcanvas.getOrCreateInstance(drawerEl).show();

  await withSpinner(async () => {
    try {
      const project = await getProject(projectId);
      // Stale guard: drawer was re-opened for a different project while we awaited
      if (_drawerProjectId !== openId) return;
      if (!project || project.deletedAt) {
        body.innerHTML = '<div class="alert alert-danger">Project niet gevonden of verwijderd.</div>';
        return;
      }
      _currentDrawerProject = project;
      renderDrawer(project);
      // Load comments in parallel; mount the photo uploader component.
      const [comments] = await Promise.all([
        listComments(projectId).catch(e => { console.warn('listComments failed', e); return []; }),
      ]);
      // Stale guard after async comments fetch
      if (_drawerProjectId !== openId) return;
      renderComments(project, comments);
      _drawerPhotoUploader = mountPhotoUploader(document.getElementById('drawerPhotoUploader'), {
        projectId: project.id,
        onChange: refreshDrawerAfterChange,
      });
      _drawerDocumentsExplorer = mountProjectDocuments(document.getElementById('drawerDocumentsMount'), {
        projectId: project.id,
        project,
        onCountChange: setDrawerDocumentsCount,
        onChange: refreshDrawerAfterChange,
      });
      // Populate the count header once the initial refresh lands.
      refreshDrawerAfterChange();

      // Live-update the serial-list while the drawer is open. The OCR-callable
      // mutates serialNumbers[] from a backend Function, so a one-shot read
      // would miss those updates. Scoped to the drawer-open lifecycle.
      if (_drawerSerialUnsub) { try { _drawerSerialUnsub(); } catch {} _drawerSerialUnsub = null; }
      _drawerSerialUnsub = firebase.firestore().collection('projects').doc(project.id).onSnapshot(snap => {
        if (!snap.exists) return;
        // Stale guard: drawer may have switched to a different project.
        if (_drawerProjectId !== openId) return;
        // Preserve raw doc shape on _currentDrawerProject so top-level fields
        // (id, projectName, customerName, lastCalcRun, offertes, etc.) survive —
        // mergeProjectMetadata only returns the nested metadata sections and
        // would strip them. Pass the merged shape only to the serial renderer.
        const raw = { id: snap.id, ...snap.data() };
        _currentDrawerProject = raw;
        renderDrawerSerials(mergeProjectMetadata(raw));
      }, err => {
        console.warn('drawer serial onSnapshot error', err);
      });
      // Mark read (non-blocking). Refresh list so the pulse dot disappears.
      markCommentsRead(projectId).then(() => {
        setTimeout(refreshProjectList, 400);
      }).catch(err => console.warn('markCommentsRead failed', err));
    } catch (e) {
      if (_drawerProjectId !== openId) return;
      body.innerHTML = `<div class="alert alert-danger">Kon project niet laden: ${escapeHtml(e && e.message ? e.message : String(e))}</div>`;
    }
  });
}

function closeDrawer() {
  if (_drawerPhotoUploader) {
    try { _drawerPhotoUploader.destroy(); } catch {}
    _drawerPhotoUploader = null;
  }
  if (_drawerDocumentsExplorer) {
    try { _drawerDocumentsExplorer.destroy(); } catch {}
    _drawerDocumentsExplorer = null;
  }
  if (_drawerSerialUnsub) {
    try { _drawerSerialUnsub(); } catch {}
    _drawerSerialUnsub = null;
  }
  const el = document.getElementById('drawer');
  bootstrap.Offcanvas.getOrCreateInstance(el).hide();
}

function setDrawerDocumentsCount(count, entries = []) {
  const docCountEl = document.getElementById('drawerDocumentsCount');
  if (docCountEl) docCountEl.textContent = count > 0 ? `(${count})` : '';
  setWorkflowDocumentCounts(entries);
}

async function refreshDrawerAfterChange() {
  const countEl = document.getElementById('drawerPhotosCount');
  if (!countEl || !_drawerPhotoUploader || !_drawerProjectId) return;
  try {
    const photos = await listProjectPhotos(_drawerProjectId);
    countEl.textContent = photos.length > 0 ? `(${photos.length})` : '';
    setWorkflowPhotoCounts(photos);
  } catch {}
}

// Reset drawer state when Bootstrap hides it (backdrop click, Escape key, data-bs-dismiss)
document.addEventListener('DOMContentLoaded', () => {
  const drawerEl = document.getElementById('drawer');
  if (drawerEl) {
    drawerEl.addEventListener('hidden.bs.offcanvas', () => {
      if (_drawerPhotoUploader) {
        try { _drawerPhotoUploader.destroy(); } catch {}
        _drawerPhotoUploader = null;
      }
      if (_drawerDocumentsExplorer) {
        try { _drawerDocumentsExplorer.destroy(); } catch {}
        _drawerDocumentsExplorer = null;
      }
      if (_drawerSerialUnsub) {
        try { _drawerSerialUnsub(); } catch {}
        _drawerSerialUnsub = null;
      }
      _drawerProjectId = null;
      _currentDrawerProject = null;
    });
  }
});


function workflowStatusHtml({ count = 0, done = false, partial = false, required = false } = {}) {
  if (done || count > 0) return '<span class="sp-workflow-status text-bg-success"><i class="fa-solid fa-check" aria-hidden="true"></i> Klaar</span>';
  if (partial) return '<span class="sp-workflow-status text-bg-info"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i> Deels ingevuld</span>';
  if (required) return '<span class="sp-workflow-status text-bg-warning"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Nodig</span>';
  return '<span class="sp-workflow-status text-bg-secondary"><i class="fa-regular fa-circle" aria-hidden="true"></i> Open</span>';
}

function isWorkflowFilled(value) {
  return value !== null && value !== undefined && value !== '';
}

function isWorkflowTriFilled(value) {
  return value === true || value === false || value === 'true' || value === 'false' || value === 'yes' || value === 'no';
}

function hasAnyWorkflowChecks(project) {
  const p = mergeProjectMetadata(project || {});
  const measurements = p.technical || {};
  const voltage = measurements.voltageMeasurements || {};
  const electrical = p.electrical || {};
  const cabinet = p.cabinet || {};
  return !!(
    electrical.connectionType || isWorkflowFilled(electrical.fuseRatingA) ||
    isWorkflowFilled(cabinet.freeUnits) || isWorkflowFilled(cabinet.wiringDiameterMm2) ||
    isWorkflowTriFilled(cabinet.hasRemAutomaat) || isWorkflowTriFilled(cabinet.hasOutletNearFluvius) ||
    isWorkflowTriFilled(cabinet.hasWifiNearFluvius) || isWorkflowTriFilled(cabinet.hasWifiNearCabinet) ||
    isWorkflowTriFilled(cabinet.batteryPlacementRoom) || isWorkflowFilled(cabinet.lineGroundChecked) ||
    isWorkflowFilled(measurements.earthResistanceOhm) || measurements.technicalNotes || cabinet.preInstallationNotes ||
    Object.values(voltage).some(isWorkflowFilled)
  );
}

function hasCompleteWorkflowChecks(project) {
  const p = mergeProjectMetadata(project || {});
  const measurements = p.technical || {};
  const voltage = measurements.voltageMeasurements || {};
  const electrical = p.electrical || {};
  const cabinet = p.cabinet || {};
  const connectionType = electrical.connectionType || '';
  const requiredVoltageKeys = workflowVoltageFieldsForConnection(connectionType).map(([key]) => key);
  if (!connectionType || requiredVoltageKeys.length === 0) return false;
  return [
    isWorkflowFilled(electrical.fuseRatingA),
    isWorkflowFilled(cabinet.freeUnits),
    isWorkflowFilled(cabinet.wiringDiameterMm2),
    isWorkflowTriFilled(cabinet.hasRemAutomaat),
    isWorkflowTriFilled(cabinet.hasOutletNearFluvius),
    isWorkflowTriFilled(cabinet.hasWifiNearFluvius),
    isWorkflowTriFilled(cabinet.hasWifiNearCabinet),
    isWorkflowTriFilled(cabinet.batteryPlacementRoom),
    isWorkflowFilled(cabinet.lineGroundChecked),
    isWorkflowFilled(measurements.earthResistanceOhm),
    ...requiredVoltageKeys.map(key => isWorkflowFilled(voltage[key])),
  ].every(Boolean);
}

function hasCompletedInspection(project) {
  const p = mergeProjectMetadata(project || {});
  return !!(p.planning.inspectionDoneDate || project?.status === 'keuring_gedaan' || project?.status === 'facturatie' || project?.status === 'afgesloten');
}

function hasAnyInspectionInfo(project) {
  const p = mergeProjectMetadata(project || {});
  const inspection = p.inspection || {};
  return !!(inspection.company || inspection.reference || inspection.notes || p.planning.inspectionPlannedDate || p.planning.inspectionDoneDate || hasCompletedInspection(project));
}

function workflowDoneState(project) {
  const p = mergeProjectMetadata(project || {});
  const serials = Array.isArray(p.serialNumbers) ? p.serialNumbers : [];
  return {
    checksBefore: hasCompleteWorkflowChecks(project),
    checksBeforePartial: hasAnyWorkflowChecks(project) && !hasCompleteWorkflowChecks(project),
    solarInverters: Array.isArray(p.solar?.inverters) && p.solar.inverters.some(inv => inv.powerKw || inv.brand || inv.model || inv.panelCount || inv.circuitCount || (Array.isArray(inv.circuits) && inv.circuits.length > 0)),
    installation: serials.length > 0,
    inspection: false,
    inspectionPartial: hasAnyInspectionInfo(project),
  };
}

function workflowCardClasses(status = {}) {
  return [
    'sp-workflow-card',
    status.done ? 'is-done' : '',
    !status.done && status.partial ? 'is-partial' : '',
  ].filter(Boolean).join(' ');
}

function workflowCardHtml({ id, kicker, title, text, icon, status, actions }) {
  return `
    <article class="${workflowCardClasses(status)}" data-workflow-block="${escapeHtml(id)}">
      <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
        <div>
          <div class="sp-workflow-kicker">${escapeHtml(kicker)}</div>
          <h6 class="mb-1"><i class="fa-solid ${escapeHtml(icon)} me-1" aria-hidden="true"></i> ${escapeHtml(title)}</h6>
        </div>
        <span data-workflow-status="${escapeHtml(id)}">${workflowStatusHtml(status)}</span>
      </div>
      <p class="small text-muted mb-3">${escapeHtml(text)}</p>
      <div class="d-grid gap-2">${actions}</div>
    </article>
  `;
}

function renderProjectWorkflowQuickMenu(project) {
  const projectName = getProjectLabel(project);
  const done = workflowDoneState(project);
  return `
    <div class="sp-workflow-intro mb-3">
      <div class="fw-semibold">Snelle plaatsingsflow</div>
      <div class="small text-muted">Mobiel menu per afgebakend blok. Start wat je nodig hebt, zonder verplichte wizard.</div>
    </div>
    <div class="sp-workflow-grid" aria-label="Werkflow voor ${escapeHtml(projectName)}">
      ${workflowCardHtml({
        id: 'photos-before',
        kicker: 'Vooraf / intake',
        title: 'Situatiefoto’s vóór',
        text: 'Trek of upload een reeks foto’s. Ze worden direct opgeslagen als “Situatie vóór installatie”.',
        icon: 'fa-camera',
        status: { required: true },
        actions: `
          <button type="button" class="btn btn-primary" data-workflow-action="photos-before-camera"><i class="fa-solid fa-camera me-1" aria-hidden="true"></i> Foto’s trekken</button>
          <button type="button" class="btn btn-outline-primary" data-workflow-action="photos-before-gallery"><i class="fa-solid fa-folder-open me-1" aria-hidden="true"></i> Uit galerij</button>
          <div class="form-text w-100">Kies bij upload wat de foto is: situatie, elektrische kast, meterkast of bestaande omvormer.</div>
        `,
      })}
      ${workflowCardHtml({
        id: 'checks-before',
        kicker: 'Voorinstallatie',
        title: 'Checks & metingen',
        text: 'Registreer aansluiting, zekeringkast, aarding en spanningsmetingen volgens het gekozen aansluitingstype.',
        icon: 'fa-clipboard-check',
        status: { done: done.checksBefore, partial: done.checksBeforePartial },
        actions: '<button type="button" class="btn btn-outline-primary" data-workflow-action="checks-before"><i class="fa-solid fa-clipboard-check me-1" aria-hidden="true"></i> Checks & metingen invullen</button>',
      })}
      ${workflowCardHtml({
        id: 'solar-inverters',
        kicker: 'Techniek',
        title: 'Zonnepanelen & omvormer',
        text: 'Noteer omvormer(s), paneel-aantallen en kringdetails met spanning per kring.',
        icon: 'fa-solar-panel',
        status: { done: done.solarInverters },
        actions: '<button type="button" class="btn btn-outline-primary" data-workflow-action="solar-inverters"><i class="fa-solid fa-solar-panel me-1" aria-hidden="true"></i> PV/omvormers invullen</button>',
      })}
      ${workflowCardHtml({
        id: 'pre-inspection-docs',
        kicker: 'Voor keuring',
        title: 'Bestaande documenten',
        text: 'Upload bestaande keuringsverslagen, elektrische schema’s of plannen die de keurder vooraf nodig heeft.',
        icon: 'fa-folder-open',
        status: { required: true },
        actions: `
          <button type="button" class="btn btn-outline-primary" data-workflow-action="pre-inspection-docs"><i class="fa-solid fa-upload me-1" aria-hidden="true"></i> Bestaande documenten uploaden</button>
          <div class="form-text w-100">Gebruik “bestaand keuringsverslag” voor oude rapporten en “schema/plan” voor vooraf mee te nemen plannen.</div>
        `,
      })}
      ${workflowCardHtml({
        id: 'installation',
        kicker: 'Installatie',
        title: 'Toestellen & serienummers',
        text: 'Leg toestellen vast en scroll naar de serienummers/OCR-lijst.',
        icon: 'fa-screwdriver-wrench',
        status: { done: done.installation },
        actions: `
          <button type="button" class="btn btn-outline-primary" data-workflow-action="installation-camera"><i class="fa-solid fa-camera me-1" aria-hidden="true"></i> Toestelfoto’s trekken</button>
          <button type="button" class="btn btn-outline-secondary" data-workflow-action="installation-serials"><i class="fa-solid fa-barcode me-1" aria-hidden="true"></i> Naar serienummers</button>
        `,
      })}
      ${workflowCardHtml({
        id: 'photos-after',
        kicker: 'Na installatie',
        title: 'Eindfoto’s',
        text: 'Upload eindfoto’s als bewijs van propere afwerking.',
        icon: 'fa-camera-retro',
        status: {},
        actions: `
          <button type="button" class="btn btn-outline-primary" data-workflow-action="photos-after-camera"><i class="fa-solid fa-camera me-1" aria-hidden="true"></i> Eindfoto’s trekken</button>
          <button type="button" class="btn btn-outline-secondary" data-workflow-action="photos-after-gallery"><i class="fa-solid fa-folder-open me-1" aria-hidden="true"></i> Uit galerij</button>
        `,
      })}
      ${workflowCardHtml({
        id: 'inspection',
        kicker: 'Keuring / oplevering',
        title: 'Keuring & dossier',
        text: 'Wordt pas klaar wanneer de keuring uitgevoerd is én het keuringsverslag na onze keuring geüpload is.',
        icon: 'fa-file-circle-check',
        status: { done: done.inspection, partial: done.inspectionPartial },
        actions: `
          <button type="button" class="btn btn-outline-primary" data-workflow-action="inspection-info"><i class="fa-solid fa-file-circle-check me-1" aria-hidden="true"></i> Keuringsinfo invullen</button>
          <button type="button" class="btn btn-outline-secondary" data-workflow-action="inspection-docs"><i class="fa-solid fa-upload me-1" aria-hidden="true"></i> Keuringsverslag na keuring uploaden</button>
        `,
      })}
    </div>
  `;
}

function setWorkflowPhotoCounts(photos) {
  const counts = { before: 0, after: 0, equipment: 0, inspection: 0 };
  (photos || []).forEach(p => {
    const tag = p && p.tag ? String(p.tag) : 'situatie';
    if (tag === 'situatie' || tag === 'situation_before') counts.before += 1;
    if (tag === 'situation_after') counts.after += 1;
    if (tag === 'equipment_after' || tag === 'serial') counts.equipment += 1;
    if (tag === 'inspection') counts.inspection += 1;
  });
  const apply = (block, count, required = false) => {
    const card = document.querySelector(`[data-workflow-block="${block}"]`);
    const status = document.querySelector(`[data-workflow-status="${block}"]`);
    if (card) {
      card.classList.toggle('is-done', count > 0);
      card.classList.remove('is-partial');
    }
    if (status && count > 0) status.innerHTML = workflowStatusHtml({ count, required });
    else if (status && required) status.innerHTML = workflowStatusHtml({ required });
  };
  apply('photos-before', counts.before, true);
  apply('photos-after', counts.after);
  apply('installation', counts.equipment);
}

function isProjectDocumentEntry(entry) {
  return entry && entry.type !== 'folder';
}

function setWorkflowDocumentCounts(entries = []) {
  const docs = (Array.isArray(entries) ? entries : []).filter(isProjectDocumentEntry);
  const preInspectionCount = docs.filter(doc => ['pre_inspection_report', 'electrical_schema', 'inspection_support'].includes(doc.documentKind)).length;
  const postInspectionCount = docs.filter(doc => doc.documentKind === 'inspection_certificate').length;
  const apply = (block, statusState) => {
    const card = document.querySelector(`[data-workflow-block="${block}"]`);
    const status = document.querySelector(`[data-workflow-status="${block}"]`);
    if (card) {
      card.classList.toggle('is-done', !!statusState.done);
      card.classList.toggle('is-partial', !statusState.done && !!statusState.partial);
    }
    if (status) status.innerHTML = workflowStatusHtml(statusState);
  };
  apply('pre-inspection-docs', { done: preInspectionCount > 0, required: true });
  apply('inspection', {
    done: hasCompletedInspection(_currentDrawerProject) && postInspectionCount > 0,
    partial: hasAnyInspectionInfo(_currentDrawerProject) || postInspectionCount > 0,
  });
}

function showDrawerTab(targetSelector) {
  const trigger = document.querySelector(`[data-bs-target="${targetSelector}"]`);
  if (trigger && window.bootstrap) bootstrap.Tab.getOrCreateInstance(trigger).show();
}

function scrollDrawerSection(selector) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function valByName(form, name) {
  const el = form.elements[name];
  return el ? String(el.value || '').trim() : '';
}

function numberOrNull(value) {
  const raw = String(value || '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const WORKFLOW_CONNECTION_TYPES = ['1x230', '3x230', '3x400+N'];
const WORKFLOW_VOLTAGE_MEASUREMENT_FIELDS = {
  '1x230': [
    ['l1N',  'L1 - N'],
    ['l1Pe', 'L1 - PE'],
    ['nPe',  'N - PE'],
  ],
  '3x230': [
    ['l1L2', 'L1 - L2'],
    ['l1L3', 'L1 - L3'],
    ['l2L3', 'L2 - L3'],
    ['l1Pe', 'L1 - PE'],
    ['l2Pe', 'L2 - PE'],
    ['l3Pe', 'L3 - PE'],
  ],
  '3x400+N': [
    ['l1L2', 'L1 - L2'],
    ['l1L3', 'L1 - L3'],
    ['l2L3', 'L2 - L3'],
    ['l1N',  'L1 - N'],
    ['l2N',  'L2 - N'],
    ['l3N',  'L3 - N'],
    ['l1Pe', 'L1 - PE'],
    ['l2Pe', 'L2 - PE'],
    ['l3Pe', 'L3 - PE'],
    ['nPe',  'N - PE'],
  ],
};

function workflowVoltageFieldsForConnection(connectionType) {
  return WORKFLOW_VOLTAGE_MEASUREMENT_FIELDS[connectionType] || [];
}

function workflowVoltageFieldsHtml(connectionType, voltage = {}) {
  const fields = workflowVoltageFieldsForConnection(connectionType);
  if (!fields.length) {
    return '<div class="col-12"><p class="text-muted small mb-0">Kies eerst het type aansluiting om de juiste spanningsmetingen te tonen.</p></div>';
  }
  return fields.map(([key, label]) => `
    <div class="col-6 col-md-4">
      <label class="form-label" for="wf-voltage-${key}">${escapeHtml(label)}</label>
      <div class="input-group">
        <input id="wf-voltage-${key}" name="voltage_${key}" data-workflow-voltage-field="${key}" type="number" min="0" step="0.1" class="form-control" value="${escapeHtml(voltage[key] ?? '')}">
        <span class="input-group-text">V</span>
      </div>
    </div>
  `).join('');
}

function collectWorkflowVoltages(form, connectionType) {
  const voltage = {};
  workflowVoltageFieldsForConnection(connectionType).forEach(([key]) => {
    const value = numberOrNull(valByName(form, `voltage_${key}`));
    if (value != null) voltage[key] = value;
  });
  return voltage;
}

const WORKFLOW_BEFORE_PHOTO_TAGS = [
  ['situation_before', 'Situatie vóór installatie'],
  ['electrical_cabinet', 'Elektrische kast'],
  ['meter_cabinet', 'Meterkast / digitale meter'],
  ['inverter_before', 'Bestaande omvormer(s)'],
];

const WORKFLOW_INSTALLATION_PHOTO_TAGS = [
  ['equipment_after', 'Toestellen na installatie'],
  ['serial', 'Serienummer / typeplaatje'],
  ['electrical_cabinet', 'Elektrische kast'],
  ['meter_cabinet', 'Meterkast / digitale meter'],
];

const WORKFLOW_AFTER_PHOTO_TAGS = [
  ['situation_after', 'Situatie na installatie'],
  ['equipment_after', 'Toestellen na installatie'],
  ['electrical_cabinet', 'Elektrische kast'],
  ['meter_cabinet', 'Meterkast / digitale meter'],
  ['inspection', 'Keuring / bewijs'],
];

function ensureWorkflowPhotoTypeModal() {
  let el = document.getElementById('spWorkflowPhotoTypeModal');
  if (el) return el;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="spWorkflowPhotoTypeModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <form class="modal-content" data-workflow-photo-type-form>
          <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-camera me-2"></i>Fototype kiezen</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
          </div>
          <div class="modal-body">
            <label class="form-label" for="workflowPhotoTag">Wat staat er op deze foto’s?</label>
            <select id="workflowPhotoTag" name="photoTag" class="form-select"></select>
            <div class="form-text">Alle geselecteerde foto’s krijgen deze categorie. Je kan dit later nog wijzigen in de fotogalerij.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuleren</button>
            <button type="submit" class="btn btn-primary" data-workflow-photo-submit>Verder</button>
          </div>
        </form>
      </div>
    </div>
  `);
  return document.getElementById('spWorkflowPhotoTypeModal');
}

function openWorkflowPhotoTypeModal(source = 'camera', tagOptions = WORKFLOW_BEFORE_PHOTO_TAGS, fallbackTag = 'situation_before') {
  if (!_drawerPhotoUploader) return;
  const modalEl = ensureWorkflowPhotoTypeModal();
  const form = modalEl.querySelector('[data-workflow-photo-type-form]');
  const select = form.elements.photoTag;
  const options = Array.isArray(tagOptions) && tagOptions.length ? tagOptions : WORKFLOW_BEFORE_PHOTO_TAGS;
  select.innerHTML = options.map(([value, label]) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
  ).join('');
  const submit = modalEl.querySelector('[data-workflow-photo-submit]');
  submit.innerHTML = source === 'gallery'
    ? '<i class="fa-solid fa-folder-open me-1"></i>Foto’s kiezen'
    : '<i class="fa-solid fa-camera me-1"></i>Camera openen';
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  form.onsubmit = (e) => {
    e.preventDefault();
    const tag = select.value || fallbackTag;
    modal.hide();
    _drawerPhotoUploader.startUploadForTag(tag, source);
  };
  modal.show();
}

function ensureWorkflowModal() {
  let el = document.getElementById('spWorkflowModal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'spWorkflowModal';
  el.className = 'modal fade';
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <form data-workflow-form>
          <div class="modal-header">
            <h5 class="modal-title" data-workflow-title>Werkflow</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
          </div>
          <div class="modal-body" data-workflow-body></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuleren</button>
            <button type="submit" class="btn btn-primary" data-workflow-save>Opslaan</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

async function openWorkflowChecksModal(project) {
  const modalEl = ensureWorkflowModal();
  const form = modalEl.querySelector('[data-workflow-form]');
  const m = mergeProjectMetadata(project);
  const el = m.electrical || {};
  const c = m.cabinet || {};
  const tech = m.technical || {};
  const voltage = tech.voltageMeasurements || {};
  const connTypes = ['', ...WORKFLOW_CONNECTION_TYPES].map(t =>
    `<option value="${t}" ${t === (el.connectionType || '') ? 'selected' : ''}>${t === '' ? '— Niet bepaald —' : t}</option>`
  ).join('');
  const triValue = (value) => {
    if (value === true || value === 'true' || value === 'yes') return 'yes';
    if (value === false || value === 'false' || value === 'no') return 'no';
    return '';
  };
  const tri = (name, value) => `
    <div class="btn-group w-100" role="group" aria-label="${escapeHtml(name)}">
      ${[['', 'Onbekend'], ['yes', 'Ja'], ['no', 'Nee']].map(([raw, label]) => `
        <input type="radio" class="btn-check" name="${escapeHtml(name)}" id="wf-${escapeHtml(name)}-${raw || 'unknown'}" value="${raw}" ${triValue(value) === raw ? 'checked' : ''}>
        <label class="btn btn-outline-secondary" for="wf-${escapeHtml(name)}-${raw || 'unknown'}">${escapeHtml(label)}</label>
      `).join('')}
    </div>`;
  modalEl.querySelector('[data-workflow-title]').innerHTML = '<i class="fa-solid fa-clipboard-check me-2"></i>Aansluiting & voorinstallatie';
  modalEl.querySelector('[data-workflow-body]').innerHTML = `
    <div class="row g-3">
      <div class="col-12 col-md-6">
        <label class="form-label" for="wf-connection-type">Type aansluiting</label>
        <select id="wf-connection-type" name="connectionType" class="form-select">${connTypes}</select>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label" for="wf-fuse-rating">Zekeringsterkte Fluvius-zijde (A)</label>
        <input id="wf-fuse-rating" name="fuseRatingA" type="number" min="0" step="1" class="form-control" value="${escapeHtml(el.fuseRatingA ?? '')}" placeholder="bv. 40">
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label" for="wf-free-units">Vrije modules in kast</label>
        <input id="wf-free-units" name="freeUnits" type="number" min="0" step="1" class="form-control" value="${escapeHtml(c.freeUnits ?? '')}">
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label" for="wf-wiring-diameter">Diameter bekabeling (mm²)</label>
        <input id="wf-wiring-diameter" name="wiringDiameterMm2" type="number" min="0" step="0.5" class="form-control" value="${escapeHtml(c.wiringDiameterMm2 ?? '')}">
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Rem-automaat aanwezig?</label>
        ${tri('hasRemAutomaat', c.hasRemAutomaat)}
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Stopcontact bij Fluvius?</label>
        ${tri('hasOutletNearFluvius', c.hasOutletNearFluvius)}
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Wifi bij Fluvius?</label>
        ${tri('hasWifiNearFluvius', c.hasWifiNearFluvius)}
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Wifi bij zekeringkast?</label>
        ${tri('hasWifiNearCabinet', c.hasWifiNearCabinet)}
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Plaats voor batterijen?</label>
        ${tri('batteryPlacementRoom', c.batteryPlacementRoom)}
      </div>
      <div class="col-12">
        <label class="form-label mb-1">Meting fase ↔ aarde</label>
        <div class="d-flex flex-wrap gap-3">
          <div class="form-check"><input class="form-check-input" type="radio" name="lineGround" id="wf-lg-none" value="" ${!c.lineGroundChecked ? 'checked' : ''}><label class="form-check-label" for="wf-lg-none">Niet gemeten</label></div>
          <div class="form-check"><input class="form-check-input" type="radio" name="lineGround" id="wf-lg-under30" value="under30" ${c.lineGroundChecked === 'under30' || c.lineGroundChecked === true ? 'checked' : ''}><label class="form-check-label" for="wf-lg-under30">Uitgevoerd — onder 30 V</label></div>
          <div class="form-check"><input class="form-check-input" type="radio" name="lineGround" id="wf-lg-over30" value="over30" ${c.lineGroundChecked === 'over30' ? 'checked' : ''}><label class="form-check-label" for="wf-lg-over30">Uitgevoerd — boven 30 V</label></div>
        </div>
      </div>
      <div class="col-12"><hr class="my-1"></div>
      <div class="col-12 col-md-4">
        <label class="form-label" for="wf-earth">Aarding (Ω)</label>
        <input id="wf-earth" name="earthResistanceOhm" type="number" step="0.01" class="form-control" value="${escapeHtml(tech.earthResistanceOhm ?? '')}">
      </div>
      <div class="col-12 col-md-8">
        <label class="form-label" for="wf-technical-notes">Technische notities</label>
        <input id="wf-technical-notes" name="technicalNotes" class="form-control" value="${escapeHtml(tech.technicalNotes || '')}" placeholder="bv. aarding OK, opmerking kast…">
      </div>
      <div class="col-12">
        <h6 class="text-muted mb-2">Spanningsmetingen</h6>
        <div class="row g-2" data-workflow-voltage-fields>${workflowVoltageFieldsHtml(el.connectionType, voltage)}</div>
      </div>
      <div class="col-12">
        <label class="form-label" for="wf-checks-notes">Voorinstallatie-notities</label>
        <textarea id="wf-checks-notes" name="notes" class="form-control" rows="3" placeholder="bv. extra automaat nodig, kabeltraject via garage…">${escapeHtml(c.preInstallationNotes || '')}</textarea>
      </div>
    </div>`;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  form.elements.connectionType?.addEventListener('change', () => {
    const currentVoltage = { ...voltage };
    form.querySelectorAll('[data-workflow-voltage-field]').forEach(input => {
      const key = input.getAttribute('data-workflow-voltage-field');
      const value = numberOrNull(input.value);
      if (value == null) delete currentVoltage[key];
      else currentVoltage[key] = value;
    });
    const mount = form.querySelector('[data-workflow-voltage-fields]');
    if (mount) mount.innerHTML = workflowVoltageFieldsHtml(valByName(form, 'connectionType'), currentVoltage);
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const lineGround = valByName(form, 'lineGround') || null;
    const connectionType = valByName(form, 'connectionType') || null;
    const earthResistance = numberOrNull(valByName(form, 'earthResistanceOhm'));
    await withSpinner(async () => {
      await updateProjectMetadata(project.id, {
        electrical: {
          connectionType,
          fuseRatingA: numberOrNull(valByName(form, 'fuseRatingA')),
        },
        cabinet: {
          freeUnits: numberOrNull(valByName(form, 'freeUnits')),
          wiringDiameterMm2: numberOrNull(valByName(form, 'wiringDiameterMm2')),
          hasRemAutomaat: triValue(valByName(form, 'hasRemAutomaat')) || null,
          hasOutletNearFluvius: triValue(valByName(form, 'hasOutletNearFluvius')) || null,
          hasWifiNearFluvius: triValue(valByName(form, 'hasWifiNearFluvius')) || null,
          hasWifiNearCabinet: triValue(valByName(form, 'hasWifiNearCabinet')) || null,
          batteryPlacementRoom: triValue(valByName(form, 'batteryPlacementRoom')) || null,
          lineGroundChecked: lineGround,
          preInstallationNotes: valByName(form, 'notes') || null,
        },
        technical: {
          ...tech,
          earthResistanceMeasured: earthResistance != null,
          earthResistanceOhm: earthResistance,
          earthResistanceMeasuredDate: earthResistance != null ? new Date().toISOString().slice(0, 10) : (tech.earthResistanceMeasuredDate || null),
          voltageMeasurements: collectWorkflowVoltages(form, connectionType),
          technicalNotes: valByName(form, 'technicalNotes') || null,
        },
      });
      showToast('Aansluiting, voorinstallatie en metingen opgeslagen', 'success');
      modal.hide();
      await _refreshCurrentDrawer();
    });
  };
  modal.show();
}

function workflowSolarInverterSeed() {
  return { id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, powerKw: null, brand: '', model: '', panelCount: null, circuitCount: 1, circuits: [{}], orientation: '' };
}

function workflowSolarCircuitCount(inv) {
  const explicit = Math.trunc(Number(inv?.circuitCount) || 0);
  if (explicit > 0) return explicit;
  return Array.isArray(inv?.circuits) && inv.circuits.length ? inv.circuits.length : 1;
}

function workflowSolarInverterHtml(inv, idx) {
  const circuitCount = workflowSolarCircuitCount(inv);
  const circuits = Array.from({ length: circuitCount }, (_, circuitIdx) => (Array.isArray(inv.circuits) ? inv.circuits[circuitIdx] : null) || {});
  const circuitRows = circuits.map((circuit, circuitIdx) => `
    <div class="card bg-light border-0 mt-2">
      <div class="card-body py-2">
        <div class="fw-semibold small mb-2">Kring ${circuitIdx + 1}</div>
        <div class="row g-2">
          <div class="col-6 col-md-3"><label class="form-label">Panelen</label><input name="inv_${idx}_circuit_${circuitIdx}_panelCount" type="number" min="0" step="1" class="form-control" value="${escapeHtml(circuit.panelCount ?? '')}"></div>
          <div class="col-6 col-md-3"><label class="form-label">Spanning (V)</label><input name="inv_${idx}_circuit_${circuitIdx}_voltage" type="number" min="0" step="0.1" class="form-control" value="${escapeHtml(circuit.voltage ?? '')}"></div>
          <div class="col-12 col-md-3"><label class="form-label">Merk panelen</label><input name="inv_${idx}_circuit_${circuitIdx}_panelBrand" class="form-control" maxlength="60" value="${escapeHtml(circuit.panelBrand || '')}"></div>
          <div class="col-12 col-md-3"><label class="form-label">Type panelen</label><input name="inv_${idx}_circuit_${circuitIdx}_panelModel" class="form-control" maxlength="80" value="${escapeHtml(circuit.panelModel || '')}"></div>
        </div>
      </div>
    </div>
  `).join('');
  return `
    <div class="card mb-3" data-workflow-inverter-index="${idx}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h6 class="mb-0">Omvormer ${idx + 1}</h6>
          <button type="button" class="btn btn-sm btn-outline-danger" data-workflow-remove-inverter="${idx}"><i class="fa-solid fa-trash me-1"></i>Verwijder</button>
        </div>
        <div class="row g-2">
          <div class="col-12 col-md-4"><label class="form-label">Vermogen (kW)</label><input name="inv_${idx}_powerKw" type="number" min="0" step="0.1" class="form-control" value="${escapeHtml(inv.powerKw ?? '')}"></div>
          <div class="col-12 col-md-4"><label class="form-label">Merk omvormer</label><input name="inv_${idx}_brand" class="form-control" maxlength="60" value="${escapeHtml(inv.brand || '')}"></div>
          <div class="col-12 col-md-4"><label class="form-label">Model omvormer</label><input name="inv_${idx}_model" class="form-control" maxlength="60" value="${escapeHtml(inv.model || '')}"></div>
          <div class="col-6 col-md-4"><label class="form-label">Totaal panelen</label><input name="inv_${idx}_panelCount" type="number" min="0" step="1" class="form-control" value="${escapeHtml(inv.panelCount ?? '')}"></div>
          <div class="col-6 col-md-4"><label class="form-label">Aantal kringen</label><input name="inv_${idx}_circuitCount" data-workflow-circuit-count="${idx}" type="number" min="1" step="1" class="form-control" value="${escapeHtml(circuitCount)}"></div>
          <div class="col-12 col-md-4"><label class="form-label">Ligging</label><input name="inv_${idx}_orientation" class="form-control" maxlength="40" value="${escapeHtml(inv.orientation || '')}"></div>
        </div>
        <div class="mt-3"><div class="small text-muted mb-1">Details per kring</div>${circuitRows}</div>
      </div>
    </div>
  `;
}

function collectWorkflowSolarInverters(form, sourceInverters) {
  return sourceInverters.map((inv, idx) => {
    const circuitCount = Math.max(1, Math.trunc(numberOrNull(valByName(form, `inv_${idx}_circuitCount`)) || workflowSolarCircuitCount(inv)));
    const circuits = [];
    for (let circuitIdx = 0; circuitIdx < circuitCount; circuitIdx += 1) {
      circuits.push({
        panelCount: numberOrNull(valByName(form, `inv_${idx}_circuit_${circuitIdx}_panelCount`)),
        voltage: numberOrNull(valByName(form, `inv_${idx}_circuit_${circuitIdx}_voltage`)),
        panelBrand: valByName(form, `inv_${idx}_circuit_${circuitIdx}_panelBrand`) || '',
        panelModel: valByName(form, `inv_${idx}_circuit_${circuitIdx}_panelModel`) || '',
      });
    }
    return {
      id: inv.id || `inv_${Date.now()}_${idx}`,
      powerKw: numberOrNull(valByName(form, `inv_${idx}_powerKw`)),
      brand: valByName(form, `inv_${idx}_brand`) || '',
      model: valByName(form, `inv_${idx}_model`) || '',
      panelCount: numberOrNull(valByName(form, `inv_${idx}_panelCount`)),
      circuitCount,
      circuits,
      orientation: valByName(form, `inv_${idx}_orientation`) || '',
    };
  }).filter(inv => inv.powerKw || inv.brand || inv.model || inv.panelCount || inv.circuits.some(c => c.panelCount != null || c.voltage != null || c.panelBrand || c.panelModel) || inv.orientation);
}

async function openWorkflowSolarModal(project) {
  const modalEl = ensureWorkflowModal();
  const form = modalEl.querySelector('[data-workflow-form]');
  const m = mergeProjectMetadata(project);
  let draftInverters = Array.isArray(m.solar?.inverters) && m.solar.inverters.length
    ? m.solar.inverters.map(inv => ({ ...inv, circuits: Array.isArray(inv.circuits) ? inv.circuits.map(c => ({ ...c })) : [] }))
    : [workflowSolarInverterSeed()];

  const renderSolarBody = () => {
    modalEl.querySelector('[data-workflow-title]').innerHTML = '<i class="fa-solid fa-solar-panel me-2"></i>Zonnepanelen & omvormer';
    modalEl.querySelector('[data-workflow-body]').innerHTML = `
      <p class="small text-muted">Voeg één of meerdere omvormers toe. Het aantal kringvelden volgt exact het ingevulde aantal kringen.</p>
      <div data-workflow-inverters>${draftInverters.map((inv, idx) => workflowSolarInverterHtml(inv, idx)).join('')}</div>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-workflow-add-inverter><i class="fa-solid fa-plus me-1"></i>Omvormer toevoegen</button>
    `;
    form.querySelectorAll('[data-workflow-circuit-count]').forEach(input => {
      input.addEventListener('change', () => {
        draftInverters = collectWorkflowSolarInverters(form, draftInverters);
        const idx = Number(input.getAttribute('data-workflow-circuit-count'));
        if (draftInverters[idx]) draftInverters[idx].circuitCount = Math.max(1, Math.trunc(numberOrNull(input.value) || 1));
        renderSolarBody();
      });
    });
    form.querySelectorAll('[data-workflow-remove-inverter]').forEach(btn => {
      btn.addEventListener('click', () => {
        draftInverters = collectWorkflowSolarInverters(form, draftInverters);
        const idx = Number(btn.getAttribute('data-workflow-remove-inverter'));
        draftInverters.splice(idx, 1);
        if (draftInverters.length === 0) draftInverters.push(workflowSolarInverterSeed());
        renderSolarBody();
      });
    });
    form.querySelector('[data-workflow-add-inverter]')?.addEventListener('click', () => {
      draftInverters = collectWorkflowSolarInverters(form, draftInverters);
      draftInverters.push(workflowSolarInverterSeed());
      renderSolarBody();
    });
  };

  renderSolarBody();
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const nextInverters = collectWorkflowSolarInverters(form, draftInverters);
    await withSpinner(async () => {
      await updateProjectMetadata(project.id, { solar: { inverters: nextInverters } });
      showToast('Zonnepanelen en omvormer opgeslagen', 'success');
      modal.hide();
      await _refreshCurrentDrawer();
    });
  };
  modal.show();
}

async function openWorkflowInspectionModal(project) {
  const modalEl = ensureWorkflowModal();
  const form = modalEl.querySelector('[data-workflow-form]');
  const m = mergeProjectMetadata(project);
  const inspection = m.inspection || {};
  modalEl.querySelector('[data-workflow-title]').innerHTML = '<i class="fa-solid fa-file-circle-check me-2"></i>Keuring / oplevering';
  modalEl.querySelector('[data-workflow-body]').innerHTML = `
    <div class="mb-3"><label class="form-label" for="wf-inspection-company">Keuringsbedrijf</label><input id="wf-inspection-company" name="company" class="form-control" value="${escapeHtml(inspection.company || '')}"></div>
    <div class="mb-3"><label class="form-label" for="wf-inspection-reference">Referentie / dossiernr.</label><input id="wf-inspection-reference" name="reference" class="form-control" value="${escapeHtml(inspection.reference || '')}"></div>
    <div class="row g-2">
      <div class="col-6"><label class="form-label" for="wf-inspection-planned">Gepland</label><input id="wf-inspection-planned" name="inspectionPlannedDate" type="date" class="form-control" value="${escapeHtml(m.planning.inspectionPlannedDate || '')}"></div>
      <div class="col-6"><label class="form-label" for="wf-inspection-done">Uitgevoerd</label><input id="wf-inspection-done" name="inspectionDoneDate" type="date" class="form-control" value="${escapeHtml(m.planning.inspectionDoneDate || '')}"></div>
    </div>
    <div class="mt-3"><label class="form-label" for="wf-inspection-notes">Notities</label><textarea id="wf-inspection-notes" name="notes" class="form-control" rows="3">${escapeHtml(inspection.notes || '')}</textarea></div>`;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  form.onsubmit = async (e) => {
    e.preventDefault();
    await withSpinner(async () => {
      await updateProjectMetadata(project.id, {
        inspection: {
          company: valByName(form, 'company') || null,
          reference: valByName(form, 'reference') || null,
          notes: valByName(form, 'notes') || null,
        },
        planning: {
          ...m.planning,
          inspectionPlannedDate: valByName(form, 'inspectionPlannedDate') || null,
          inspectionDoneDate: valByName(form, 'inspectionDoneDate') || null,
        },
      });
      showToast('Keuringsinfo opgeslagen', 'success');
      modal.hide();
      await _refreshCurrentDrawer();
    });
  };
  modal.show();
}

function startWorkflowDocumentUpload(meta) {
  showDrawerTab('#drawerDocumentsPane');
  setTimeout(() => _drawerDocumentsExplorer?.startUploadWithMeta(meta), 80);
}

function wireProjectWorkflowQuickMenu(project) {
  void project;
  const mount = document.getElementById('drawerWorkflowMount');
  if (!mount) return;
  mount.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-workflow-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-workflow-action');
    if (action === 'photos-before-camera') {
      showDrawerTab('#drawerPhotosPane');
      openWorkflowPhotoTypeModal('camera');
    } else if (action === 'photos-before-gallery') {
      showDrawerTab('#drawerPhotosPane');
      openWorkflowPhotoTypeModal('gallery');
    } else if (action === 'checks-before') {
      openWorkflowChecksModal(project);
    } else if (action === 'solar-inverters') {
      openWorkflowSolarModal(project);
    } else if (action === 'pre-inspection-docs') {
      startWorkflowDocumentUpload({
        title: 'Bestaand document voor keuring',
        documentKind: 'pre_inspection_report',
        includeInInspectionPack: true,
      });
    } else if (action === 'installation-camera') {
      showDrawerTab('#drawerPhotosPane');
      openWorkflowPhotoTypeModal('camera', WORKFLOW_INSTALLATION_PHOTO_TAGS, 'equipment_after');
    } else if (action === 'installation-serials') {
      scrollDrawerSection('#drawerSerialsSection');
    } else if (action === 'photos-after-camera') {
      showDrawerTab('#drawerPhotosPane');
      openWorkflowPhotoTypeModal('camera', WORKFLOW_AFTER_PHOTO_TAGS, 'situation_after');
    } else if (action === 'photos-after-gallery') {
      showDrawerTab('#drawerPhotosPane');
      openWorkflowPhotoTypeModal('gallery', WORKFLOW_AFTER_PHOTO_TAGS, 'situation_after');
    } else if (action === 'inspection-info') {
      openWorkflowInspectionModal(project);
    } else if (action === 'inspection-docs') {
      startWorkflowDocumentUpload({
        title: 'Keuringsverslag na onze keuring',
        documentKind: 'inspection_certificate',
        includeInCloseoutPdf: true,
        includeInInspectionPack: true,
      });
    }
  });
}

function renderDrawer(project) {
  const header = document.getElementById('drawerHeader');
  const body   = document.getElementById('drawerBody');
  const m      = mergeProjectMetadata(project);

  header.innerHTML = `
    <div class="flex-grow-1">
      <h5 class="offcanvas-title mb-0" id="drawerHeaderTitle">${escapeHtml(getProjectLabel(project))}</h5>
      <div class="text-muted small mt-1">${escapeHtml(project.customerName || '')} · ${statusChipHTML(project.status, project.id)}</div>
    </div>
    <button type="button" class="btn-close ms-2" data-bs-dismiss="offcanvas" aria-label="Sluit"></button>
  `;

  // Build sections conditionally.
  const sections = [];

  // Ground-fault / unsupported-product banners (top-of-drawer)
  const drawerGfStatus = groundFaultStatus(project);
  if (drawerGfStatus === 'unsupported') {
    sections.push(`
      <div class="alert alert-danger d-flex gap-2 mb-3" role="alert">
        <i class="fa-solid fa-triangle-exclamation icon-danger flex-shrink-0 mt-1" aria-hidden="true"></i>
        <div><strong>Niet-ondersteund producttype.</strong>
          Dit project bevat configuraties die geen Zendure of Marstek zijn. Controleer de geselecteerde configuraties.</div>
      </div>
    `);
  } else if (drawerGfStatus === 'no-measurement') {
    sections.push(`
      <div class="alert alert-warning d-flex gap-2 mb-3" role="alert">
        <i class="fa-solid fa-triangle-exclamation icon-warn flex-shrink-0 mt-1" aria-hidden="true"></i>
        <div><strong>Meting fase↔aarde nog niet uitgevoerd.</strong>
          Voer de meting uit en registreer het resultaat (onder of boven 30 V) in <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Bewerk project.</div>
      </div>
    `);
  }
  if (needsOfferteWarning(project)) {
    const missingCount = (project.lastCalcRun && project.lastCalcRun.inputs && Array.isArray(project.lastCalcRun.inputs.selectedConfigTypes))
      ? project.lastCalcRun.inputs.selectedConfigTypes.filter(t => !(project.offertes || {})[t]).length
      : 0;
    sections.push(`
      <div class="alert alert-warning d-flex gap-2 mb-3" role="alert">
        <i class="fa-solid fa-triangle-exclamation icon-warn flex-shrink-0 mt-1" aria-hidden="true"></i>
        <div>
          <strong>Offertes ontbreken.</strong>
          Dit project staat in offerte-fase maar ${missingCount} config(s) hebben nog geen offerte PDF.
        </div>
      </div>
    `);
  }

  // Contact
  const contactLines = [];
  const addressText = formatCustomerAddress(m.customer);
  if (addressText) {
    const mapsUrl = googleMapsUrlForCustomerAddress(m.customer);
    const wazeUrl = wazeUrlForCustomerAddress(m.customer);
    const safeMapsUrl = mapsUrl && /^https:\/\//.test(mapsUrl) ? mapsUrl : '';
    const safeWazeUrl = wazeUrl && /^https:\/\//.test(wazeUrl) ? wazeUrl : '';
    contactLines.push(`
      <div class="d-flex gap-2 align-items-start mb-2">
        <i class="fa-solid fa-location-dot text-primary flex-shrink-0 mt-1" aria-hidden="true"></i>
        <div class="min-w-0">
          <div class="sp-pre-wrap">${escapeHtml(addressText)}</div>
          <div class="d-flex flex-wrap gap-2 mt-2">
            ${safeMapsUrl ? `<a href="${escapeHtml(safeMapsUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-map-location-dot me-1" aria-hidden="true"></i>Maps</a>` : ''}
            ${safeWazeUrl ? `<a href="${escapeHtml(safeWazeUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-route me-1" aria-hidden="true"></i>Waze</a>` : ''}
          </div>
        </div>
      </div>`);
  }
  if (m.customer.phone)   contactLines.push(`<div class="mb-1">📞 <a href="tel:${escapeHtml(m.customer.phone)}">${escapeHtml(m.customer.phone)}</a></div>`);
  if (m.customer.email)   contactLines.push(`<div class="mb-1">✉️ <a href="mailto:${escapeHtml(m.customer.email)}">${escapeHtml(m.customer.email)}</a></div>`);
  if (contactLines.length > 0) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted">Contact</h6>
        ${contactLines.join('')}
      </section>
    `);
  }

  const planningHtml = detailRowsHtml([
    ['Plaatsbezoek ingepland', fmtDateString(m.planning.visitPlannedDate)],
    ['Plaatsbezoek uitgevoerd', fmtDateString(m.planning.visitDoneDate)],
    ['Installatie ingepland', fmtDateString(m.planning.installationPlannedDate)],
    ['Installatie uitgevoerd', fmtDateString(m.planning.installationDoneDate)],
    ['Keuring ingepland', fmtDateString(m.planning.inspectionPlannedDate)],
    ['Keuring uitgevoerd', fmtDateString(m.planning.inspectionDoneDate)],
  ]);
  if (planningHtml) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted">Planning</h6>
        ${planningHtml}
      </section>
    `);
  }

  const bebat = bebatSummaryForProject(project);
  sections.push(`
    <section class="border-bottom pb-3 mb-3">
      <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-recycle" aria-hidden="true"></i> Bebat</h6>
      <div class="small">Batterijserienummers: <strong>${bebat.total}</strong> · geregistreerd: <strong>${bebat.registered}</strong> · nog te registreren: <strong>${bebat.pending}</strong></div>
    </section>
  `);

  const voltageRows = Object.entries(m.technical.voltageMeasurements || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [`Spanning ${VOLTAGE_MEASUREMENT_LABELS[key] || key}`, `${value} V`]);
  const technicalHtml = detailRowsHtml([
    ['Aardweerstand gemeten', m.technical.earthResistanceMeasured === true ? 'Ja' : m.technical.earthResistanceMeasured === false ? 'Nee' : ''],
    ['Aardweerstand', m.technical.earthResistanceOhm != null ? `${m.technical.earthResistanceOhm} Ω` : ''],
    ['Meetdatum aardweerstand', fmtDateString(m.technical.earthResistanceMeasuredDate)],
    ...voltageRows,
    ['Technische opmerkingen', m.technical.technicalNotes],
  ]);
  if (technicalHtml) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted">Techniek</h6>
        ${technicalHtml}
      </section>
    `);
  }

  const inspectionHtml = detailRowsHtml([
    ['Keuringsfirma', m.inspection.company],
    ['Referentie', m.inspection.reference],
    ['Opmerkingen keuring', m.inspection.notes],
  ]);
  if (inspectionHtml) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted">Keuring</h6>
        ${inspectionHtml}
      </section>
    `);
  }

  // Actions
  const calcHref = project.lastCalcRun && project.lastCalcRun.calculatedAt
    ? `index.html?project=${project.id}#results`
    : `index.html?project=${project.id}`;
  sections.push(`
    <section class="border-bottom pb-3 mb-3">
      <div class="d-grid d-md-flex gap-2">
        <a class="btn btn-primary flex-md-grow-1" href="${calcHref}"><i class="fa-solid fa-calculator me-1" aria-hidden="true"></i> Open berekening</a>
        <button type="button" class="btn btn-outline-primary flex-md-grow-1" id="drawerReviewLinkBtn"><i class="fa-solid fa-star me-1" aria-hidden="true"></i> Reviewlink</button>
        <button type="button" class="btn btn-outline-primary flex-md-grow-1" id="drawerClosingDossierBtn"><i class="fa-solid fa-file-pdf me-1" aria-hidden="true"></i> Afsluitdossier</button>
        <a class="btn btn-outline-primary flex-md-grow-1" href="project-edit.html?project=${project.id}"><i class="fa-solid fa-pen-to-square me-1" aria-hidden="true"></i> Bewerk project</a>
        <button type="button" class="btn btn-outline-danger flex-md-grow-1" id="drawerDeleteBtn"><i class="fa-solid fa-trash me-1" aria-hidden="true"></i> Verwijderen</button>
      </div>
    </section>
  `);

  // Configs / offertes per type
  sections.push(renderOffertesSection(project));

  // Situation
  if (m.situation) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted">Situatie</h6>
          <div class="sp-pre-wrap sp-text-body-sm">${escapeHtml(m.situation)}</div>
      </section>
    `);
  }
  // Notes
  if (m.notes) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted">Notities</h6>
          <div class="sp-pre-wrap sp-text-body-sm">${escapeHtml(m.notes)}</div>
      </section>
    `);
  }

  sections.push(`
    <section class="border-bottom pb-3 mb-3" id="drawerMediaSection">
      <ul class="nav nav-tabs mb-3" id="drawerMediaTabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="drawerWorkflowTab" data-bs-toggle="tab" data-bs-target="#drawerWorkflowPane" type="button" role="tab" aria-controls="drawerWorkflowPane" aria-selected="true">
            <i class="fa-solid fa-list-check" aria-hidden="true"></i> Werkflow
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="drawerPhotosTab" data-bs-toggle="tab" data-bs-target="#drawerPhotosPane" type="button" role="tab" aria-controls="drawerPhotosPane" aria-selected="false">
            <i class="fa-solid fa-images" aria-hidden="true"></i> Foto's <span id="drawerPhotosCount" class="text-muted fw-normal"></span>
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="drawerDocumentsTab" data-bs-toggle="tab" data-bs-target="#drawerDocumentsPane" type="button" role="tab" aria-controls="drawerDocumentsPane" aria-selected="false">
            <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Documenten <span id="drawerDocumentsCount" class="text-muted fw-normal"></span>
          </button>
        </li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="drawerWorkflowPane" role="tabpanel" aria-labelledby="drawerWorkflowTab" tabindex="0">
          <div id="drawerWorkflowMount">${renderProjectWorkflowQuickMenu(project)}</div>
        </div>
        <div class="tab-pane fade" id="drawerPhotosPane" role="tabpanel" aria-labelledby="drawerPhotosTab" tabindex="0">
          <div id="drawerPhotoUploader"></div>
        </div>
        <div class="tab-pane fade" id="drawerDocumentsPane" role="tabpanel" aria-labelledby="drawerDocumentsTab" tabindex="0">
          <div id="drawerDocumentsMount"></div>
        </div>
      </div>
    </section>
  `);

  // Serienummers (read-mostly; live-updated via onSnapshot while drawer is open)
  sections.push(`
    <section class="border-bottom pb-3 mb-3" id="drawerSerialsSection">
      <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-barcode" aria-hidden="true"></i> Serienummers <span id="drawerSerialsCount" class="text-muted fw-normal"></span></h6>
      <div id="drawerSerialsList" class="d-flex flex-column gap-1"></div>
    </section>
  `);

  // Comments placeholder (filled by renderComments)
  sections.push(`
    <section id="drawerCommentsSection">
      <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-comments" aria-hidden="true"></i> Opmerkingen <span id="drawerCommentsCount" class="text-muted fw-normal"></span></h6>
      <div class="d-flex flex-column gap-2 mb-3" id="drawerCommentsList"><p class="sp-empty-state">⏳ Laden…</p></div>
      <div class="input-group mt-2">
        <textarea id="drawerCommentInput" class="form-control" rows="2" placeholder="Opmerking toevoegen…" maxlength="4000"></textarea>
        <button type="button" class="btn btn-primary" id="drawerCommentSubmit">Versturen</button>
      </div>
      <div class="text-danger small mt-1" id="drawerCommentErr"></div>
    </section>
  `);

  body.innerHTML = sections.join('');

  wireProjectWorkflowQuickMenu(project);
  renderDrawerSerials(project);

  // Wire delete button (soft-delete from drawer)
  const delBtn = document.getElementById('drawerDeleteBtn');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: 'Project verwijderen?',
        message: 'Het project wordt soft-deleted en blijft herstelbaar via "Toon verwijderde".',
        confirmText: 'Project verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      await withSpinner(async () => {
        try {
          await softDeleteProject(project.id);
          closeDrawer();
          await refreshProjectList();
        } catch (err) {
          showToast('Verwijderen mislukt: ' + (err && err.message ? err.message : err), 'danger');
        }
      });
    });
  }

  const reviewBtn = document.getElementById('drawerReviewLinkBtn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', async () => createAndCopyReviewLink(project.id, reviewBtn));
  }

  const closingBtn = document.getElementById('drawerClosingDossierBtn');
  if (closingBtn) {
    closingBtn.addEventListener('click', async () => {
      closingBtn.disabled = true;
      const oldHtml = closingBtn.innerHTML;
      closingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Dossier voorbereiden…';
      await withSpinner(async () => {
        try {
          const dossierProject = _currentDrawerProject || project;
          const [photos, rawDocuments] = await Promise.all([
            listProjectPhotos(project.id).catch(err => { console.warn('closing dossier photos failed', err); return []; }),
            listProjectDocuments(project.id).catch(err => { console.warn('closing dossier documents failed', err); return []; }),
          ]);
          const dossierInputs = await loadClosingDossierInputs(dossierProject, rawDocuments);
          const reviewRequest = typeof createReviewRequestForProject === 'function'
            ? await createReviewRequestForProject(project.id)
            : null;
          const model = buildClosingDossierModel(dossierProject, { photos, reviewRequest, ...dossierInputs });
          const drafts = buildClosingDossierDraftTexts(model);
          document.getElementById('spClosingDossierModal')?.remove();
          document.body.insertAdjacentHTML('beforeend', renderClosingDossierEditorModalHtml(drafts));
          const modalEl = document.getElementById('spClosingDossierModal');
          const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
          modalEl.querySelector('[data-closing-generate]').addEventListener('click', () => {
            const texts = {};
            modalEl.querySelectorAll('[data-closing-text]').forEach(input => {
              texts[input.getAttribute('data-closing-text')] = input.value;
            });
            const result = openClosingDossierPrintWindow(model, null, { texts });
            if (!result.ok) showToast('Popup geblokkeerd. Sta popups toe om het afsluitdossier te openen.', 'warning');
            else modal.hide();
          }, { once: true });
          modal.show();
        } catch (err) {
          showToast('Afsluitdossier maken mislukt: ' + (err && err.message ? err.message : err), 'danger');
        } finally {
          closingBtn.disabled = false;
          closingBtn.innerHTML = oldHtml;
        }
      });
    });
  }

  // Wire comment submit
  document.getElementById('drawerCommentSubmit').addEventListener('click', async () => {
    const errEl = document.getElementById('drawerCommentErr');
    const btn   = document.getElementById('drawerCommentSubmit');
    const input = document.getElementById('drawerCommentInput');
    errEl.textContent = '';
    const text = input.value;
    if (!text.trim()) { errEl.textContent = 'Leeg.'; return; }
    btn.disabled = true; btn.textContent = 'Bezig…';
    await withSpinner(async () => {
      try {
        await addComment(project.id, text);
        input.value = '';
        // Refresh comments list
        const fresh = await listComments(project.id);
        renderComments(project, fresh);
      } catch (e) {
        errEl.textContent = e && e.message ? e.message : String(e);
      } finally {
        btn.disabled = false; btn.textContent = 'Versturen';
      }
    });
  });

  // Serial re-run knop (Task 10) — delegated click handler on the serial-list.
  const serialsList = document.getElementById('drawerSerialsList');
  if (serialsList) {
    serialsList.addEventListener('click', async (e) => {
      const rerunBtn = e.target.closest('.serial-rerun-btn');
      if (!rerunBtn) return;
      const photoId = rerunBtn.getAttribute('data-photo-id');
      if (!photoId) return;
      rerunBtn.disabled = true;
      try {
        await window.requestPhotoOcrRerun(project.id, photoId);
        showToast('OCR opnieuw gestart', 'primary');
      } catch (err) {
        showToast('Re-run mislukt: ' + (err && err.message ? err.message : err), 'danger');
      } finally {
        rerunBtn.disabled = false;
      }
    });
  }
}

function mapById(list = []) {
  return Object.fromEntries((list || []).filter(item => item && item.id).map(item => [item.id, item]));
}

async function loadClosingDossierInputs(project, rawDocuments = []) {
  const safe = (promise, fallback, label) => promise.catch(err => {
    console.warn(`closing dossier ${label} failed`, err);
    return fallback;
  });
  const [products, productConfigs] = await Promise.all([
    typeof window.listProducts === 'function' ? safe(window.listProducts(), [], 'products') : [],
    typeof window.listProductConfigs === 'function' ? safe(window.listProductConfigs(), [], 'product configs') : [],
  ]);
  const productsById = mapById(products);
  const productConfigsById = mapById(productConfigs);
  const mergedDocuments = await resolveDocumentDownloadUrls(mergeProjectDocuments(rawDocuments, project));
  const cfg = project?.lastCalcRun?.results?.configResults?.[0]?.cfg || {};
  const configId = cfg.productConfigId || (typeof cfg.type === 'string' && cfg.type.startsWith('PC_') ? cfg.type.slice(3) : '') || cfg.composition?.baseProductConfigId || '';
  const configItems = (Array.isArray(cfg.items) && cfg.items.length)
    ? cfg.items
    : (Array.isArray(productConfigsById[configId]?.items) ? productConfigsById[configId].items : []);
  const installedItems = Array.isArray(project?.installedSolution?.items) ? project.installedSolution.items : [];
  const productIds = [...new Set([
    ...configItems.map(item => item && item.productId),
    ...installedItems.map(item => item && item.productId),
  ].filter(Boolean))];
  const productDocumentsById = {};
  if (typeof window.listProductDatasheets === 'function') {
    await Promise.all(productIds.map(async productId => {
      productDocumentsById[productId] = await safe(window.listProductDatasheets(productId), [], `product documents ${productId}`);
    }));
  }
  return { documents: mergedDocuments, productsById, productConfigsById, productDocumentsById };
}

function _renderDrawerSerial(entry) {
  // Drawer is read-mostly — no add-new row. Skip the _new branch entirely.
  const cat = entry.category || 'null';
  const catLabels = {
    batterij: 'Batterij',
    omvormer: 'Omvormer',
    omvormer_batterij: 'Omvormer+Batterij',
    'null': '?',
  };
  const status = entry.ocrStatus || 'ok';
  const isPending = status === 'pending';
  const isFailed  = status === 'failed';
  const isOcr     = entry.source === 'ocr';
  const placeholder = isPending
    ? 'OCR bezig...'
    : (isFailed ? 'OCR niet gelukt' : 'Serienummer');

  const statusIconHtml = isPending
    ? `<i class="fa-solid fa-spinner fa-spin serial-status-icon" title="OCR bezig"></i>`
    : (isFailed
        ? `<i class="fa-solid fa-triangle-exclamation serial-status-icon icon-warn" title="OCR niet gelukt"></i>`
        : `<i class="fa-solid fa-circle-check serial-status-icon icon-ok" title="OK"></i>`);

  const sourceIconHtml = isOcr
    ? `<span class="serial-status-icon"><i class="fa-solid fa-image text-muted" title="Uit foto"></i></span>`
    : `<span class="serial-status-icon"><i class="fa-solid fa-keyboard text-muted" title="Manueel ingevoerd"></i></span>`;

  const rerunBtnHtml = (isOcr && isFailed)
    ? `<button type="button" class="serial-action-btn serial-rerun-btn" data-photo-id="${escapeHtml(entry.photoId || '')}" title="OCR opnieuw proberen"><i class="fa-solid fa-rotate"></i></button>`
    : '';

  return `
    <div class="serial-row" data-serial-id="${escapeHtml(entry.id)}">
      <span class="serial-cat-badge serial-cat-${escapeHtml(cat)}">${escapeHtml(catLabels[cat])}</span>
      ${statusIconHtml}
      ${sourceIconHtml}
      <input type="text" class="form-control form-control-sm serial-value"
             value="${escapeHtml(entry.value || '')}"
             placeholder="${escapeHtml(placeholder)}"
             readonly />
      ${rerunBtnHtml}
    </div>
  `;
}

function renderDrawerSerials(project) {
  const list = document.getElementById('drawerSerialsList');
  const count = document.getElementById('drawerSerialsCount');
  if (!list) return;
  const serials = (project && project.serialNumbers) || [];
  if (count) count.textContent = serials.length > 0 ? `(${serials.length})` : '';
  if (serials.length === 0) {
    list.innerHTML = '<p class="sp-empty-state mb-0">Nog geen serienummers.</p>';
    return;
  }
  list.innerHTML = serials.map(_renderDrawerSerial).join('');
}

function renderComments(project, comments) {
  const list = document.getElementById('drawerCommentsList');
  const count = document.getElementById('drawerCommentsCount');
  if (!list) return;
  count.textContent = comments.length > 0 ? `(${comments.length})` : '';
  if (comments.length === 0) {
    list.innerHTML = '<p class="sp-empty-state">Nog geen opmerkingen. Plaats er één hieronder.</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="bg-light rounded p-2">
      <div class="d-flex justify-content-between gap-2 mb-1">
        <span class="fw-semibold text-primary-emphasis small">${escapeHtml(shortEmail(c.author))}</span>
        <span class="text-muted small">${fmtRelTime(c.createdAt)}</span>
      </div>
      <div class="sp-pre-wrap sp-text-body-sm">${escapeHtml(c.text || '')}</div>
    </div>
  `).join('');
}

// Offerte modal + click delegation — wired once against the drawer element.
(function bindOffertesShared() {
  ensureOfferteModal();
  const drawer = document.getElementById('drawer');
  if (drawer) wireOffertesClicks(drawer, () => _currentDrawerProject, _refreshCurrentDrawer);
})();

// Status-dropdown delegation via shared component (assets/js/status-chip.js)
wireStatusChipClicks(document, () => refreshProjectList());

// ─── LEADS SECTION ──────────────────────────────────────────────────────

let _leadsCache = { active: [], deleted: [] };

async function refreshLeads() {
  const card = document.getElementById('leadsCard');
  try {
    const all = await listLeads();
    _leadsCache.active  = all.filter(l => !l.deletedAt);
    _leadsCache.deleted = all.filter(l =>  l.deletedAt);
    // Card stays visible even when empty so deleted leads remain restorable
    // via the "Toon verwijderde" toggle.
    card.style.display = '';
    renderLeads();
  } catch (e) {
    console.error('refreshLeads failed:', e);
    card.style.display = 'none';
  }
}

function renderLeads() {
  const el    = document.getElementById('leadsList');
  const badge = document.getElementById('leadsCount');
  const showDeleted = document.getElementById('toggleShowDeletedLeads').checked;

  badge.textContent = _leadsCache.active.length;

  const rows = [
    ..._leadsCache.active.map(l => leadRowHTML(l, false)),
    ...(showDeleted ? _leadsCache.deleted.map(l => leadRowHTML(l, true)) : []),
  ].join('');

  if (!rows) {
    const hint = (!showDeleted && _leadsCache.deleted.length)
      ? ` Vink <em>Toon verwijderde</em> aan om verwijderde leads (${_leadsCache.deleted.length}) te zien.`
      : '';
    el.innerHTML = `<p class="sp-empty-state">Geen openstaande leads.${hint}</p>`;
    return;
  }
  el.innerHTML = `
    <table class="table table-hover align-middle mb-0">
      <thead>
        <tr>
          <th>Naam</th>
          <th class="d-none d-sm-table-cell">Email</th>
          <th>Status</th>
          <th class="d-none d-sm-table-cell">Datum</th>
          <th class="text-end">Acties</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  wireLeadActions(el);
}

function leadRowHTML(l, isDeleted) {
  const date = l.createdAt ? fmtDate(l.createdAt) : '—';
  const statusLabel = l.status === 'hot_lead' ? 'Hot lead' : 'Cold lead';
  const statusColor = l.status === 'hot_lead' ? '#dc2626' : '#6b7a8d';
  const resultLink = l.result
    ? `<a href="lead-result.html?r=${l.id}" class="btn btn-sm btn-outline-secondary" title="Bekijk resultaat" aria-label="Bekijk resultaat" target="_blank"><i class="fa-solid fa-chart-line" aria-hidden="true"></i></a>`
    : '';
  const action = isDeleted
    ? `<button type="button" class="btn btn-sm btn-outline-secondary restoreLeadBtn" data-id="${l.id}" title="Herstellen" aria-label="Herstellen"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
       <button type="button" class="btn btn-sm btn-outline-danger permdelLeadBtn" data-id="${l.id}" data-name="${escapeHtml(l.customerName || '')}" title="Definitief verwijderen" aria-label="Definitief verwijderen"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i></button>`
    : `<button type="button" class="btn btn-sm btn-outline-primary convertLeadBtn" data-id="${l.id}" title="Maak project aan" aria-label="Maak project aan"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i></button>
       <button type="button" class="btn btn-sm btn-outline-danger deleteLeadBtn" data-id="${l.id}" title="Verwijderen" aria-label="Verwijderen"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
  return `
    <tr class="${isDeleted ? 'text-muted opacity-50' : ''}" data-id="${l.id}">
      <td>${escapeHtml(l.customerName || '')}</td>
      <td class="d-none d-sm-table-cell text-break"><a href="mailto:${escapeHtml(l.email || '')}">${escapeHtml(l.email || '')}</a></td>
      <td><span class="badge" style="background:${statusColor};">${statusLabel}</span></td>
      <td class="d-none d-sm-table-cell text-muted small">${date}</td>
      <td class="text-end">
        <div class="d-flex gap-1 justify-content-end">
          ${resultLink}
          ${action}
        </div>
      </td>
    </tr>`;
}

// Re-run the wizard's chosen-config calc on the dashboard side and serialize
// it into a project-shaped lastCalcRun, so the converted project opens with
// results already rendered. Returns null on any failure — the caller treats
// that as "no precompute" and falls back to pendingConfigTypes preselection.
async function precomputeLastCalcRunForLead(lead) {
  if (!lead.csvDailyCompact || !lead.result) return null;
  // Support both legacy (bestConfigType) and new (configTypes array) result shapes
  const resultTypes = lead.result.configTypes
    ? lead.result.configTypes
    : lead.result.bestConfigType
      ? [lead.result.bestConfigType]
      : null;
  if (!resultTypes || !resultTypes.length) return null;

  let configs;
  try {
    const cfg  = await getProductsConfig();
    if (!cfg || !cfg.csvUrl) return null;
    const resp = await fetch(cfg.csvUrl);
    if (!resp.ok) return null;
    configs = parseSheetConfigs(await resp.text());
  } catch (e) {
    console.warn('[lead-precompute] config fetch failed:', e);
    return null;
  }

  const btw      = (lead.effectiveBtw === 6) ? 6 : 21;
  const priceKey = `${btw}_yes`;

  // Resolve all config types from the lead result
  const selectedConfigs = [];
  for (const typeName of resultTypes) {
    const found = configs.find(c => c.type === typeName);
    if (!found) continue;
    const price = found.prices[priceKey];
    if (!price || price <= 0) continue;
    selectedConfigs.push({ ...found, price });
  }
  if (!selectedConfigs.length) return null;

  const pvKw    = (typeof lead.pvInverterKw === 'number' && lead.pvInverterKw > 0)
    ? lead.pvInverterKw : 3.5;
  const tariff  = (typeof lead.pricePerKwh  === 'number' && lead.pricePerKwh  > 0)
    ? lead.pricePerKwh  : 0.34;

  let d;
  try {
    const allDays = buildAllDaysFromDailyCompact(lead.csvDailyCompact);
    // Single tariff: pass null for priceNight so dualTariff resolves to false
    // and effectivePrice == priceDay. Empty meter metadata (lead form doesn't
    // capture EAN/meter info) — explicit '' so serializeDForLastCalcRun
    // doesn't emit undefined fields, which Firestore rejects.
    d = processDataPure(
      { allDays, eanCode: '', meterNr: '', meterType: '' },
      pvKw, selectedConfigs, tariff, null
    );
  } catch (e) {
    console.warn('[lead-precompute] processDataPure threw:', e);
    return null;
  }
  if (!d) return null;

  return {
    lastCalcRun: {
      calculatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      calculatedBy: currentUserEmail() || 'lead-conversion',
      inputs: {
        pvInv:      pvKw,
        priceDay:   tariff,
        priceNight: null,
        selectedConfigTypes: selectedConfigs.map(c => c.type),
      },
      results: serializeDForLastCalcRun(d),
    },
  };
}

function wireLeadActions(el) {
  el.querySelectorAll('.convertLeadBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: 'Lead omzetten?',
        message: 'Er wordt een nieuw project aangemaakt met de leadgegevens.',
        confirmText: 'Omzetten',
        variant: 'primary',
      });
      if (!ok) return;
      await withSpinner(async () => {
        try {
          const lead = await getLead(btn.dataset.id);
          if (!lead) { showToast('Lead niet gevonden.', 'danger'); return; }
          const precomputed = await precomputeLastCalcRunForLead(lead);
          const projectId = await convertLeadToProject(lead, precomputed || {});
          // Navigate directly (window.open gets blocked by popup blockers after async)
          window.location.href = `project-edit.html?project=${projectId}`;
        } catch (e) {
          showToast('Fout: ' + (e.message || e), 'danger');
        }
      });
    });
  });
  el.querySelectorAll('.deleteLeadBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: 'Lead verwijderen?',
        message: 'De lead wordt soft-deleted en blijft herstelbaar via "Toon verwijderde".',
        confirmText: 'Lead verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      await withSpinner(async () => {
        try { await softDeleteLead(btn.dataset.id); await refreshLeads(); }
        catch (err) { showToast('Kon niet verwijderen: ' + (err && err.message ? err.message : err), 'danger'); }
      });
    });
  });
  el.querySelectorAll('.restoreLeadBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await withSpinner(async () => {
        try { await restoreLead(btn.dataset.id); await refreshLeads(); }
        catch (err) { showToast('Kon niet herstellen: ' + (err && err.message ? err.message : err), 'danger'); }
      });
    });
  });
  el.querySelectorAll('.permdelLeadBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name || '(lead)';
      const ok = await showConfirm({
        title: 'Lead definitief verwijderen?',
        message: `Lead "${name}" wordt permanent gewist. Dit kan niet ongedaan worden.`,
        confirmText: 'Definitief verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      btn.disabled = true;
      await withSpinner(async () => {
        try { await hardDeleteLead(id); await refreshLeads(); }
        catch (err) {
          showToast('Definitief verwijderen mislukt: ' + (err && err.message ? err.message : err), 'danger');
          btn.disabled = false;
        }
      });
    });
  });
}

// Responsive view: re-render on breakpoint cross (992px)
let _wasDesktop = window.innerWidth >= 992;
window.addEventListener('resize', () => {
  const nowDesktop = window.innerWidth >= 992;
  if (nowDesktop !== _wasDesktop) {
    _wasDesktop = nowDesktop;
    renderCurrent();
  }
});

