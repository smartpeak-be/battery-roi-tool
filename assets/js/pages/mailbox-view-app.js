import { escapeHtml, showState, showToast } from '../shared-helpers.js';
import {
  filterMailboxRows,
  listMailboxMessages,
  mailboxProviderStatus,
  makeMailboxPlaceholderRows,
  normalizeMailboxSettings,
} from '../mailbox-view.js';
import {
  defaultCommunicationTemplates,
  renderTemplatePlainText,
} from '../communication-templates.js';

let _settings = normalizeMailboxSettings({});
let _rows = [];
let _filters = { mailboxKey: 'all', folderKey: 'all', query: '' };
let _selectedId = null;
let _templates = [];

function accountByKey(key) {
  return _settings.accounts.find(account => account.key === key) || {};
}

function providerStatusHtml() {
  const status = mailboxProviderStatus(_settings);
  const cls = status.available ? 'alert-success' : 'alert-warning';
  const icon = status.available ? 'fa-circle-check' : 'fa-plug-circle-exclamation';
  return `
    <div class="alert ${cls} small mb-3 mailbox-provider-status">
      <i class="fa-solid ${icon} me-1"></i>
      <strong>${escapeHtml(status.label)}:</strong> ${escapeHtml(status.message)}
    </div>
  `;
}

function renderMailboxFilters() {
  const mailboxSelect = document.getElementById('mailboxFilter');
  const folderSelect = document.getElementById('folderFilter');
  mailboxSelect.innerHTML = '<option value="all">Alle mailboxen</option>' + _settings.accounts.map(account => `
    <option value="${escapeHtml(account.key)}" ${_filters.mailboxKey === account.key ? 'selected' : ''}>${escapeHtml(account.label)} — ${escapeHtml(account.email)}</option>
  `).join('');
  folderSelect.innerHTML = '<option value="all">Alle mappen</option>' + _settings.folders.map(folder => `
    <option value="${escapeHtml(folder.key)}" ${_filters.folderKey === folder.key ? 'selected' : ''}>${escapeHtml(folder.label)}</option>
  `).join('');
}

function renderMailboxCards() {
  const container = document.getElementById('mailboxCards');
  container.innerHTML = _settings.accounts.map(account => {
    const count = _rows.filter(row => row.mailboxKey === account.key).length;
    return `
      <button type="button" class="mailbox-account-card ${_filters.mailboxKey === account.key ? 'active' : ''}" data-mailbox-key="${escapeHtml(account.key)}" style="--mailbox-color:${escapeHtml(account.color || '#0d6efd')}">
        <span class="mailbox-account-dot"></span>
        <span class="mailbox-account-main">
          <strong>${escapeHtml(account.label)}</strong>
          <small>${escapeHtml(account.email)}</small>
        </span>
        <span class="badge text-bg-light">${count}</span>
      </button>
    `;
  }).join('');
  container.querySelectorAll('[data-mailbox-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      _filters.mailboxKey = _filters.mailboxKey === btn.dataset.mailboxKey ? 'all' : btn.dataset.mailboxKey;
      renderAll();
    });
  });
}

function rowHtml(row) {
  const account = accountByKey(row.mailboxKey);
  return `
    <button type="button" class="list-group-item list-group-item-action mailbox-row ${row.id === _selectedId ? 'active' : ''} ${row.unread ? 'mailbox-row-unread' : ''}" data-message-id="${escapeHtml(row.id)}">
      <div class="d-flex justify-content-between gap-2">
        <span class="mailbox-row-account" style="--mailbox-color:${escapeHtml(account.color || '#0d6efd')}">${escapeHtml(row.mailboxLabel)}</span>
        <small class="${row.id === _selectedId ? 'text-white-50' : 'text-muted'}">${escapeHtml(row.dateLabel)}</small>
      </div>
      <div class="fw-semibold text-truncate">${escapeHtml(row.subject)}</div>
      <div class="small ${row.id === _selectedId ? 'text-white-50' : 'text-muted'} text-truncate">${escapeHtml(row.from)}</div>
      <div class="small ${row.id === _selectedId ? 'text-white-50' : 'text-muted'} text-truncate">${escapeHtml(row.preview)}</div>
    </button>
  `;
}

function renderRows() {
  const rows = filterMailboxRows(_rows, _filters);
  const list = document.getElementById('messageList');
  document.getElementById('messageCount').textContent = String(rows.length);
  if (!rows.length) {
    list.innerHTML = '<div class="list-group-item text-muted">Geen berichten voor deze filter.</div>';
    renderSelectedMessage(null);
    return;
  }
  if (!_selectedId || !rows.some(row => row.id === _selectedId)) _selectedId = rows[0].id;
  list.innerHTML = rows.map(rowHtml).join('');
  list.querySelectorAll('[data-message-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedId = btn.dataset.messageId;
      renderRows();
      renderSelectedMessage(_rows.find(row => row.id === _selectedId));
    });
  });
  renderSelectedMessage(_rows.find(row => row.id === _selectedId));
}

function renderSelectedMessage(row) {
  const panel = document.getElementById('messagePreview');
  if (!row) {
    panel.innerHTML = '<div class="text-muted p-4">Selecteer een bericht.</div>';
    return;
  }
  const bodyText = row.body || row.preview || '';
  panel.innerHTML = `
    <div class="mailbox-message-header">
      <div class="d-flex justify-content-between gap-2 align-items-start">
        <div>
          <div class="small text-muted">${escapeHtml(row.mailboxLabel)} · ${escapeHtml(row.folderLabel)}</div>
          <h2 class="h5 mb-1">${escapeHtml(row.subject)}</h2>
        </div>
        ${row.placeholder ? '<span class="badge text-bg-warning">Placeholder</span>' : ''}
      </div>
      <dl class="row small mb-0 mt-3">
        <dt class="col-sm-2">Van</dt><dd class="col-sm-10">${escapeHtml(row.from || '—')}</dd>
        <dt class="col-sm-2">Aan</dt><dd class="col-sm-10">${escapeHtml(row.to || '—')}</dd>
        <dt class="col-sm-2">Datum</dt><dd class="col-sm-10">${escapeHtml(row.dateLabel || '—')}</dd>
      </dl>
    </div>
    <div class="mailbox-message-body">
      ${row.placeholder ? `
        <p>Deze mailbox-view is voorbereid voor meerdere mailboxen, maar de echte mailbox-provider is nog niet gekoppeld.</p>
        <p>Er worden bewust geen IMAP/SMTP credentials of tokens in deze frontend opgeslagen. Koppel later een veilige backend/plugin die <code>window.SmartPeakMailboxPlugin.listMessages()</code> aanbiedt.</p>
      ` : `<p>${escapeHtml(bodyText).replaceAll('\n', '<br>')}</p>`}
    </div>
  `;
}

function renderTemplateSelect() {
  _templates = defaultCommunicationTemplates();
  const select = document.getElementById('templateSelect');
  select.innerHTML = _templates.map(template => `
    <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>
  `).join('');
}

function selectedTemplate() {
  const id = document.getElementById('templateSelect').value;
  return _templates.find(template => template.id === id) || _templates[0];
}

function prepareDraftFromTemplate() {
  const template = selectedTemplate();
  if (!template) return;
  const row = _rows.find(message => message.id === _selectedId);
  const projectContext = {
    customerName: row && !row.placeholder ? row.from : '',
    customer: { email: row && !row.placeholder ? row.from : '' },
  };
  document.getElementById('draftText').value = renderTemplatePlainText(template, projectContext);
  showToast('Concepttekst voorbereid vanuit template', 'success');
}

function renderAll() {
  document.getElementById('providerStatusSlot').innerHTML = providerStatusHtml();
  renderMailboxFilters();
  renderMailboxCards();
  renderTemplateSelect();
  renderRows();
}

async function loadSettingsAndMessages() {
  const settings = await getSettings();
  _settings = normalizeMailboxSettings(settings || {});
  const status = mailboxProviderStatus(_settings);
  if (!status.available) {
    _rows = makeMailboxPlaceholderRows(_settings.accounts, _settings.folders);
    renderAll();
    return;
  }
  const rows = [];
  const foldersToLoad = _settings.folders;
  for (const account of _settings.accounts) {
    for (const folder of foldersToLoad) {
      const messages = await listMailboxMessages({ account, folder, query: _filters.query, limit: 50 });
      rows.push(...messages);
    }
  }
  _rows = rows;
  renderAll();
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
  document.getElementById('btnRefreshMailboxes').addEventListener('click', () => {
    loadSettingsAndMessages().catch(e => showToast('Mailboxen laden mislukt: ' + e.message, 'danger'));
  });
  document.getElementById('mailboxFilter').addEventListener('change', e => {
    _filters.mailboxKey = e.target.value;
    renderAll();
  });
  document.getElementById('folderFilter').addEventListener('change', e => {
    _filters.folderKey = e.target.value;
    renderAll();
  });
  document.getElementById('mailboxSearch').addEventListener('input', e => {
    _filters.query = e.target.value;
    renderRows();
  });
  document.getElementById('btnPrepareTemplateText').addEventListener('click', prepareDraftFromTemplate);
  document.getElementById('btnCopyDraftText').addEventListener('click', async () => {
    const text = document.getElementById('draftText').value;
    if (!text.trim()) {
      showToast('Geen concepttekst om te kopiëren', 'warning');
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Concept gekopieerd', 'success');
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
    loadSettingsAndMessages().catch(e => showToast('Mailboxen laden mislukt: ' + e.message, 'danger'));
  });
});
