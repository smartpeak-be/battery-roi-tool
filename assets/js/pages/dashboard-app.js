import { escapeHtml, showToast, showState, shortEmail, fmtDate, fmtRelTime, withSpinner, showConfirm } from '../shared-helpers.js';
import { parseSheetConfigs, processDataPure, buildAllDaysFromDailyCompact, serializeDForLastCalcRun } from '../calc-engine.js';
import { attachSpeechToText } from '../speech-to-text.js';

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
  document.querySelectorAll('[data-task-assignee]').forEach(btn => {
    btn.addEventListener('click', () => {
      _taskAssigneeFilter = btn.dataset.taskAssignee || 'mine';
      document.querySelectorAll('[data-task-assignee]').forEach(b => b.classList.toggle('active', b === btn));
      renderTaskInbox();
    });
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
  const nextActionCount = nextActionsForProject(p).length;
  const opsBadge = nextActionCount > 0
    ? `<span class="badge text-bg-info ms-1" title="${nextActionCount} voorgestelde opvolgactie(s)">${nextActionCount}</span>`
    : '';
  const bebat = bebatSummaryForProject(p);
  const bebatWarn = bebat.pending > 0
    ? `<span class="row-warning" role="img" aria-label="Bebat nog te registreren" title="${bebat.pending} batterijserienummer(s) nog Bebat registreren."><i class="fa-solid fa-recycle icon-warn" aria-hidden="true"></i></span>`
    : '';
  return `
    <tr class="${isDeleted ? 'text-muted opacity-50' : ''}" data-id="${p.id}">
      <td>${chat}${warn}${warnOfferte}${bebatWarn}<button type="button" class="btn btn-link p-0 text-decoration-none fw-semibold projectNameBtn" data-id="${p.id}">${escapeHtml(getProjectLabel(p))}</button>${opsBadge}</td>
      <td class="d-none d-sm-table-cell">${escapeHtml(p.customerName || '')}</td>
      <td>${statusChipHTML(p.status, p.id)}</td>
      <td class="d-none d-sm-table-cell text-muted small">${updated}</td>
      <td class="d-none d-md-table-cell text-muted small">${p.lastCalcRun ? fmtDate(p.lastCalcRun.calculatedAt) : '—'}</td>
      <td class="text-end">
        <div class="d-flex gap-1 justify-content-end">
          ${calcBtn}
          ${editBtn}
          ${action}
        </div>
      </td>
    </tr>`;
}

// Cached list of projects from Firestore. Filtering + render happens on this cache.
let _projectsCache = { active: [], deleted: [] };
let _taskAssigneeFilter = 'mine';

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
      renderTaskInbox();
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

function currentTaskAssignee() {
  if (_taskAssigneeFilter === 'mine') return assigneeForEmail(currentUserEmail());
  return _taskAssigneeFilter || 'all';
}

function taskStatusBadge(row) {
  if (row.rowType === 'suggested') return '<span class="badge text-bg-info">Suggestie</span>';
  if (row.status === 'in_progress') return '<span class="badge text-bg-primary">Bezig</span>';
  return '<span class="badge text-bg-secondary">Open</span>';
}

function taskRowHTML(row) {
  const assignee = row.assigneeLabel || assigneeLabel(row.assignee);
  const due = row.dueDate ? ` · deadline ${escapeHtml(fmtDateString(row.dueDate))}` : '';
  const source = row.source === 'assistant' ? 'AmaAi' : row.source === 'suggested' ? 'suggestie' : 'manueel';
  const startLabel = row.rowType === 'suggested' ? 'Maak taak' : row.status === 'in_progress' ? 'Bezig' : 'Start';
  return `
    <div class="border rounded p-2 d-flex flex-column flex-lg-row gap-2 align-items-lg-center" data-task-row-type="${escapeHtml(row.rowType)}" data-project-id="${escapeHtml(row.projectId || '')}" data-task-id="${escapeHtml(row.taskId || '')}" data-task-type="${escapeHtml(row.type || '')}" data-task-title="${escapeHtml(row.title || '')}" data-task-assignee="${escapeHtml(row.assignee || '')}">
      <div class="flex-grow-1">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
          ${taskStatusBadge(row)}
          <span class="fw-semibold">${escapeHtml(row.title || '')}</span>
        </div>
        <div class="small text-muted">
          <a href="project-edit.html?project=${encodeURIComponent(row.projectId)}" class="text-decoration-none">${escapeHtml(row.projectLabel || '(zonder naam)')}</a>
          ${row.customerName ? ` · ${escapeHtml(row.customerName)}` : ''}
          · ${escapeHtml(row.projectStatusLabel || row.projectStatus || '')}
          · ${escapeHtml(assignee)}${due}
          · bron: ${escapeHtml(source)}
        </div>
      </div>
      <div class="d-flex gap-1 justify-content-lg-end">
        <button type="button" class="btn btn-sm btn-outline-primary taskStartBtn" ${row.status === 'in_progress' ? 'disabled' : ''}>${startLabel}</button>
        ${row.rowType === 'task' ? '<button type="button" class="btn btn-sm btn-outline-success taskDoneBtn">Gedaan</button>' : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary taskDrawerBtn">Project</button>
      </div>
    </div>`;
}

function renderTaskInbox() {
  const list = document.getElementById('taskInboxList');
  const count = document.getElementById('taskInboxCount');
  if (!list || !count) return;
  const assignee = currentTaskAssignee();
  const rows = projectTaskRowsForProjects(_projectsCache.active, { assignee }).slice(0, 12);
  count.textContent = rows.length;
  if (!rows.length) {
    const who = assignee === 'all' ? 'iedereen' : assigneeLabel(assignee);
    list.innerHTML = `<p class="sp-empty-state">Geen open taken of voorgestelde acties voor ${escapeHtml(who)}.</p>`;
    return;
  }
  list.innerHTML = `<div class="d-flex flex-column gap-2">${rows.map(taskRowHTML).join('')}</div>`;
  wireTaskInboxActions(list);
}

async function updateTaskFromDashboard(rowEl, targetStatus) {
  const projectId = rowEl.dataset.projectId;
  if (!projectId) return;
  await withSpinner(async () => {
    try {
      const project = await getProject(projectId);
      if (!project) throw new Error('Project niet gevonden');
      const now = new Date().toISOString();
      const tasks = (mergeProjectMetadata(project).tasks || []).map(normalizeProjectTask);
      if (rowEl.dataset.taskRowType === 'suggested') {
        tasks.push(normalizeProjectTask({
          type: rowEl.dataset.taskType,
          title: rowEl.dataset.taskTitle,
          assignee: rowEl.dataset.taskAssignee,
          status: 'in_progress',
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        }));
      } else {
        const task = tasks.find(t => t.id === rowEl.dataset.taskId);
        if (!task) throw new Error('Taak niet gevonden');
        task.status = targetStatus;
        task.updatedAt = now;
        if (targetStatus === 'done') task.completedAt = now;
      }
      await updateProjectMetadata(projectId, { tasks });
      const idx = _projectsCache.active.findIndex(p => p.id === projectId);
      if (idx >= 0) _projectsCache.active[idx] = { ..._projectsCache.active[idx], tasks };
      renderTaskInbox();
      renderCurrent();
      showToast(targetStatus === 'done' ? 'Taak afgewerkt' : 'Taak gestart', 'success');
    } catch (err) {
      showToast('Taak bijwerken mislukt: ' + (err && err.message ? err.message : err), 'danger');
    }
  });
}

function wireTaskInboxActions(root) {
  root.querySelectorAll('.taskStartBtn').forEach(btn => {
    btn.addEventListener('click', () => updateTaskFromDashboard(btn.closest('[data-project-id]'), 'in_progress'));
  });
  root.querySelectorAll('.taskDoneBtn').forEach(btn => {
    btn.addEventListener('click', () => updateTaskFromDashboard(btn.closest('[data-project-id]'), 'done'));
  });
  root.querySelectorAll('.taskDrawerBtn').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.closest('[data-project-id]').dataset.projectId));
  });
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
  const nextActionCount = nextActionsForProject(p).length;
  const opsBadge = nextActionCount > 0 ? `<span class="badge text-bg-info ms-1">${nextActionCount}</span>` : '';
  const bebat = bebatSummaryForProject(p);
  const bebatWarn = bebat.pending > 0 ? `<span class="row-warning" title="Bebat nog te registreren"><i class="fa-solid fa-recycle icon-warn" aria-hidden="true"></i></span>` : '';
  return `
    <div class="kanban-card" draggable="true" data-id="${p.id}">
      <div class="kanban-card-title" data-id="${p.id}">${chat}${warn}${warnOfferte}${bebatWarn}${escapeHtml(getProjectLabel(p))}${opsBadge}</div>
      <div class="kanban-card-customer">${escapeHtml(p.customerName || '')}</div>
      <div class="kanban-card-footer">
        ${statusChipHTML(p.status, p.id)}
      </div>
    </div>
  `;
}

function wireRowActions(el) {
  // Wire project-name buttons → open drawer
  el.querySelectorAll('.projectNameBtn').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.id));
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
  if (_drawerSerialUnsub) {
    try { _drawerSerialUnsub(); } catch {}
    _drawerSerialUnsub = null;
  }
  const el = document.getElementById('drawer');
  bootstrap.Offcanvas.getOrCreateInstance(el).hide();
}

async function refreshDrawerAfterChange() {
  const countEl = document.getElementById('drawerPhotosCount');
  if (!countEl || !_drawerPhotoUploader || !_drawerProjectId) return;
  try {
    const photos = await listProjectPhotos(_drawerProjectId);
    countEl.textContent = photos.length > 0 ? `(${photos.length})` : '';
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
      if (_drawerSerialUnsub) {
        try { _drawerSerialUnsub(); } catch {}
        _drawerSerialUnsub = null;
      }
      _drawerProjectId = null;
      _currentDrawerProject = null;
    });
  }
});


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

  const nextActions = nextActionsForProject(project);
  const openTasks = (m.tasks || []).filter(t => !['done', 'cancelled'].includes(t.status));
  const bebat = bebatSummaryForProject(project);
  const nextActionsHtml = nextActions.length
    ? `<div class="d-flex flex-column gap-1">${nextActions.map(a => `<div class="small"><i class="fa-solid fa-arrow-right text-primary me-1"></i>${escapeHtml(a.label)} <span class="badge text-bg-light">${escapeHtml(a.assignee || '')}</span></div>`).join('')}</div>`
    : '<p class="text-muted small mb-0">Geen automatische suggesties.</p>';
  const tasksHtml = openTasks.length
    ? `<div class="d-flex flex-column gap-1">${openTasks.slice(0, 6).map(t => `<div class="small"><span class="badge ${t.status === 'in_progress' ? 'text-bg-primary' : 'text-bg-secondary'}">${t.status === 'in_progress' ? 'Bezig' : 'Open'}</span> ${escapeHtml(t.title)}${t.assignee ? ` · ${escapeHtml(t.assignee)}` : ''}${t.dueDate ? ` · ${escapeHtml(fmtDateString(t.dueDate))}` : ''}</div>`).join('')}</div>`
    : '<p class="text-muted small mb-0">Geen open taken.</p>';
  sections.push(`
    <section class="border-bottom pb-3 mb-3">
      <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Opvolging</h6>
      <div class="mb-2"><strong class="small">Volgende acties</strong>${nextActionsHtml}</div>
      <div><strong class="small">Open taken</strong>${tasksHtml}</div>
    </section>
  `);
  sections.push(`
    <section class="border-bottom pb-3 mb-3">
      <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-recycle" aria-hidden="true"></i> Bebat</h6>
      <div class="small">Batterijserienummers: <strong>${bebat.total}</strong> · geregistreerd: <strong>${bebat.registered}</strong> · nog te registreren: <strong>${bebat.pending}</strong></div>
    </section>
  `);

  const recentActivities = (m.activities || []).slice().reverse().slice(0, 5);
  if (recentActivities.length) {
    sections.push(`
      <section class="border-bottom pb-3 mb-3">
        <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-timeline" aria-hidden="true"></i> Tijdlijn</h6>
        <div class="d-flex flex-column gap-2">
          ${recentActivities.map(a => `<div class="border-start border-3 ps-2"><div class="text-muted small">${escapeHtml(a.type)} · ${escapeHtml(a.occurredAt || '')} · ${escapeHtml(a.source || 'manual')}</div><div class="small">${escapeHtml(a.title || a.notes || 'Activiteit')}</div></div>`).join('')}
        </div>
      </section>
    `);
  }

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
    <section class="border-bottom pb-3 mb-3" id="drawerPhotosSection">
      <h6 class="mb-2 text-uppercase text-muted"><i class="fa-solid fa-images" aria-hidden="true"></i> Foto's <span id="drawerPhotosCount" class="text-muted fw-normal"></span></h6>
      <div id="drawerPhotoUploader"></div>
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

  renderDrawerSerials(project);

  const commentInput = document.getElementById('drawerCommentInput');
  attachSpeechToText(commentInput, {
    title: 'Opmerking dicteren in het Nederlands',
    ariaLabel: 'Opmerking dicteren',
  });
  commentInput.addEventListener('speech-to-text-error', (e) => {
    showToast(e.detail && e.detail.message ? e.detail.message : 'Dicteren mislukt.', 'warning');
  });

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

