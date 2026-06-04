import { escapeHtml, showState, showToast, fmtDate } from '../shared-helpers.js';

let _projects = [];
let _rows = [];

function fmtDateString(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function currentAssigneeFilter() {
  const selected = document.getElementById('assigneeFilter').value || 'mine';
  if (selected === 'mine') return assigneeForEmail(currentUserEmail());
  if (selected === 'unassigned') return 'unassigned';
  return selected;
}

function statusBadge(row) {
  if (row.rowType === 'suggested') return '<span class="badge text-bg-info">Suggestie</span>';
  if (row.status === 'in_progress') return '<span class="badge text-bg-primary">Bezig</span>';
  return '<span class="badge text-bg-secondary">Open</span>';
}

function rowMatches(row, query, typeFilter) {
  if (typeFilter !== 'all' && row.rowType !== typeFilter) return false;
  if (!query) return true;
  const hay = [row.title, row.notes, row.projectLabel, row.customerName, row.projectStatusLabel, row.assigneeLabel]
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

function groupTitle(groupKey) {
  if (groupKey === 'kevin') return 'Open voor Kevin';
  if (groupKey === 'ruben') return 'Open voor Ruben';
  return 'Algemene openstaande taken';
}

function groupRows(rows) {
  return {
    kevin: rows.filter(row => row.assignee === 'kevin'),
    ruben: rows.filter(row => row.assignee === 'ruben'),
    general: rows.filter(row => !row.assignee),
  };
}

function rowHTML(row) {
  const due = row.dueDate ? ` · deadline ${escapeHtml(fmtDateString(row.dueDate))}` : '';
  const source = row.source === 'assistant' ? 'AmaAi' : row.source === 'suggested' ? 'suggestie' : 'manueel';
  const updated = row.updatedAt ? ` · gewijzigd ${escapeHtml(fmtDate(row.updatedAt))}` : '';
  const created = row.createdAt ? ` · aangemaakt ${escapeHtml(fmtDate(row.createdAt))}` : '';
  const notes = row.notes ? `<div class="small mt-1">${escapeHtml(row.notes)}</div>` : '';
  const startLabel = row.rowType === 'suggested' ? 'Maak taak' : row.status === 'in_progress' ? 'Bezig' : 'Start';
  return `
    <div class="border rounded p-3 d-flex flex-column flex-lg-row gap-2 align-items-lg-center" data-task-row-type="${escapeHtml(row.rowType)}" data-project-id="${escapeHtml(row.projectId || '')}" data-task-id="${escapeHtml(row.taskId || '')}" data-task-type="${escapeHtml(row.type || '')}" data-task-title="${escapeHtml(row.title || '')}" data-task-assignee="${escapeHtml(row.assignee || '')}">
      <div class="flex-grow-1">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
          ${statusBadge(row)}
          <span class="fw-semibold">${escapeHtml(row.title || '')}</span>
        </div>
        <div class="small text-muted">
          <a href="project-edit.html?project=${encodeURIComponent(row.projectId)}" class="text-decoration-none">${escapeHtml(row.projectLabel || '(zonder naam)')}</a>
          ${row.customerName ? ` · ${escapeHtml(row.customerName)}` : ''}
          · ${escapeHtml(row.projectStatusLabel || row.projectStatus || '')}
          · ${escapeHtml(row.assigneeLabel || assigneeLabel(row.assignee))}${due}${created}${updated}
          · bron: ${escapeHtml(source)}
        </div>
        ${notes}
      </div>
      <div class="d-flex gap-1 justify-content-lg-end">
        <button type="button" class="btn btn-sm btn-outline-primary taskStartBtn" ${row.status === 'in_progress' ? 'disabled' : ''}>${startLabel}</button>
        ${row.rowType === 'task' ? '<button type="button" class="btn btn-sm btn-outline-success taskDoneBtn">Gedaan</button>' : ''}
        <button type="button" class="btn btn-sm btn-outline-warning taskIgnoreBtn">Negeer</button>
        <a class="btn btn-sm btn-outline-secondary" href="project-edit.html?project=${encodeURIComponent(row.projectId)}">Project</a>
      </div>
    </div>`;
}

function renderRows() {
  const list = document.getElementById('taskInboxList');
  const count = document.getElementById('taskCount');
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('typeFilter').value || 'all';
  const selectedAssignee = document.getElementById('assigneeFilter').value || 'mine';
  const rows = _rows.filter(row => rowMatches(row, query, typeFilter));
  count.textContent = rows.length;
  if (!rows.length) {
    list.innerHTML = '<p class="sp-empty-state">Geen open taken of voorgestelde acties voor deze filter.</p>';
    return;
  }
  if (selectedAssignee === 'all') {
    const grouped = groupRows(rows);
    list.innerHTML = ['kevin', 'ruben', 'general']
      .map(key => `<section class="mb-3"><h2 class="h6 mb-2">${groupTitle(key)} <span class="badge text-bg-light">${grouped[key].length}</span></h2>${grouped[key].length ? `<div class="d-flex flex-column gap-2">${grouped[key].map(rowHTML).join('')}</div>` : '<p class="text-muted small mb-0">Geen open taken.</p>'}</section>`)
      .join('');
    return;
  }
  list.innerHTML = `<div class="d-flex flex-column gap-2">${rows.map(rowHTML).join('')}</div>`;
}

async function loadTasks(showToastOnSuccess = false) {
  const list = document.getElementById('taskInboxList');
  list.innerHTML = '<p class="sp-empty-state">⏳ Laden…</p>';
  try {
    _projects = await listActiveProjects();
    _rows = projectTaskRowsForProjects(_projects, { assignee: currentAssigneeFilter() });
    renderRows();
    if (showToastOnSuccess) showToast('Taken vernieuwd', 'success');
  } catch (e) {
    list.innerHTML = `<div class="alert alert-danger mb-0">Kon taken niet laden: ${escapeHtml(e && e.message ? e.message : String(e))}</div>`;
  }
}

async function updateTask(rowEl, targetStatus) {
  const projectId = rowEl.dataset.projectId;
  if (!projectId) return;
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
        status: targetStatus === 'cancelled' ? 'cancelled' : 'in_progress',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
        notes: targetStatus === 'cancelled' ? 'Genegeerd vanuit takenoverzicht.' : null,
      }));
    } else {
      const task = tasks.find(t => t.id === rowEl.dataset.taskId);
      if (!task) throw new Error('Taak niet gevonden');
      task.status = targetStatus;
      task.updatedAt = now;
      if (targetStatus === 'done') task.completedAt = now;
      if (targetStatus === 'cancelled') task.cancelledAt = now;
    }
    await updateProjectMetadata(projectId, { tasks });
    const message = targetStatus === 'done'
      ? 'Taak afgewerkt'
      : targetStatus === 'cancelled'
        ? 'Taak/suggestie genegeerd'
        : 'Taak gestart';
    showToast(message, 'success');
    await loadTasks(false);
  } catch (e) {
    showToast('Taak bijwerken mislukt: ' + (e && e.message ? e.message : String(e)), 'danger');
  }
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
  document.getElementById('btnRefresh').addEventListener('click', () => loadTasks(true));
  document.getElementById('searchInput').addEventListener('input', renderRows);
  document.getElementById('typeFilter').addEventListener('change', renderRows);
  document.getElementById('assigneeFilter').addEventListener('change', () => loadTasks(false));
  document.getElementById('taskInboxList').addEventListener('click', event => {
    const startBtn = event.target.closest('.taskStartBtn');
    if (startBtn) updateTask(startBtn.closest('[data-project-id]'), 'in_progress');
    const doneBtn = event.target.closest('.taskDoneBtn');
    if (doneBtn) updateTask(doneBtn.closest('[data-project-id]'), 'done');
    const ignoreBtn = event.target.closest('.taskIgnoreBtn');
    if (ignoreBtn) updateTask(ignoreBtn.closest('[data-project-id]'), 'cancelled');
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
    document.getElementById('assigneeFilter').value = 'mine';
    showState('stateAuthorized');
    loadTasks(false);
  });
});
