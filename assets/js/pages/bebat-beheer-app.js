import { escapeHtml, showState, showToast } from '../shared-helpers.js';

let _projects = [];
let _rows = [];

const STATUS_LABELS = {
  pending: 'Nog te registreren',
  registered: 'Geregistreerd',
  not_required: 'Niet nodig',
};

function statusBadge(status) {
  if (status === 'registered') return '<span class="badge text-bg-success">Geregistreerd</span>';
  if (status === 'not_required') return '<span class="badge text-bg-secondary">Niet nodig</span>';
  return '<span class="badge text-bg-warning text-dark">Nog te registreren</span>';
}

function rowMatches(row, query, status) {
  if (status !== 'all' && row.status !== status) return false;
  if (!query) return true;
  const hay = [row.projectLabel, row.customerName, row.serial, row.reference, row.projectStatus]
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

function updateSummary() {
  document.getElementById('summaryTotal').textContent = _rows.length;
  document.getElementById('summaryPending').textContent = _rows.filter(r => r.status === 'pending').length;
  document.getElementById('summaryRegistered').textContent = _rows.filter(r => r.status === 'registered').length;
  document.getElementById('summaryNotRequired').textContent = _rows.filter(r => r.status === 'not_required').length;
}

function renderRows() {
  const tbody = document.getElementById('bebatTableBody');
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const status = document.getElementById('statusFilter').value || 'pending';
  const rows = _rows.filter(row => rowMatches(row, query, status));
  updateSummary();

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Geen Bebat-registraties gevonden voor deze filter.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr data-project-id="${escapeHtml(row.projectId || '')}" data-serial-id="${escapeHtml(row.serialId || '')}">
      <td>
        <a href="project-edit.html?project=${encodeURIComponent(row.projectId)}" class="fw-semibold text-decoration-none">${escapeHtml(row.projectLabel || '(zonder naam)')}</a>
        <div class="text-muted small">${escapeHtml(row.projectStatus || '')}</div>
      </td>
      <td>${escapeHtml(row.customerName || '')}</td>
      <td><code>${escapeHtml(row.serial || '')}</code></td>
      <td>
        <div class="mb-1">${statusBadge(row.status)}</div>
        <select class="form-select form-select-sm bebat-status-input" aria-label="Bebat status">
          ${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${row.status === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </td>
      <td><input type="date" class="form-control form-control-sm bebat-date-input" value="${escapeHtml(row.registeredAt || '')}"></td>
      <td><input type="text" class="form-control form-control-sm bebat-ref-input" value="${escapeHtml(row.reference || '')}" placeholder="Bebat referentie"></td>
      <td class="text-end">
        <button type="button" class="btn btn-sm btn-primary save-bebat-row"><i class="fa-solid fa-floppy-disk me-1"></i> Opslaan</button>
      </td>
    </tr>
  `).join('');
}

async function loadBebatRows(showToastOnSuccess = false) {
  const tbody = document.getElementById('bebatTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Laden…</td></tr>';
  try {
    _projects = await listActiveProjects();
    _rows = bebatRowsForProjects(_projects);
    renderRows();
    if (showToastOnSuccess) showToast('Bebat-overzicht vernieuwd', 'success');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger mb-0">Kon Bebat-overzicht niet laden: ${escapeHtml(e && e.message ? e.message : String(e))}</div></td></tr>`;
  }
}

async function saveRow(rowEl) {
  const projectId = rowEl.dataset.projectId;
  const serialId = rowEl.dataset.serialId;
  const status = rowEl.querySelector('.bebat-status-input').value || 'pending';
  const registeredAt = rowEl.querySelector('.bebat-date-input').value || null;
  const reference = rowEl.querySelector('.bebat-ref-input').value.trim() || null;
  const patch = {
    bebatStatus: status,
    bebatRegisteredAt: status === 'registered' ? registeredAt : null,
    bebatReference: status === 'registered' ? reference : null,
  };

  const btn = rowEl.querySelector('.save-bebat-row');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Opslaan';
  try {
    await updateProjectSerial(projectId, serialId, patch);
    showToast('Bebat-status opgeslagen', 'success');
    await loadBebatRows(false);
  } catch (e) {
    showToast('Opslaan mislukt: ' + (e && e.message ? e.message : String(e)), 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i> Opslaan';
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
  document.getElementById('btnRefresh').addEventListener('click', () => loadBebatRows(true));
  document.getElementById('searchInput').addEventListener('input', renderRows);
  document.getElementById('statusFilter').addEventListener('change', renderRows);
  document.getElementById('bebatTableBody').addEventListener('click', event => {
    const btn = event.target.closest('.save-bebat-row');
    if (btn) saveRow(btn.closest('tr'));
  });
  document.getElementById('bebatTableBody').addEventListener('change', event => {
    const input = event.target.closest('.bebat-status-input');
    if (!input) return;
    const row = input.closest('tr');
    if (input.value === 'registered' && !row.querySelector('.bebat-date-input').value) {
      row.querySelector('.bebat-date-input').value = new Date().toISOString().slice(0, 10);
    }
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
    loadBebatRows(false);
  });
});
