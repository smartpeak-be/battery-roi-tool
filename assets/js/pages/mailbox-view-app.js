import { escapeHtml, showState, showToast } from '../shared-helpers.js';
import {
  filterMailboxRows,
  linkMailboxToProjectsViaFirebaseFunction,
  listFoldersViaFirebaseFunction,
  listMailboxMessages,
  mailboxProviderStatus,
  makeMailboxPlaceholderRows,
  normalizeMailboxSettings,
  syncMailboxViaFirebaseFunction,
} from '../mailbox-view.js';
import {
  defaultCommunicationTemplates,
  renderTemplatePlainText,
} from '../communication-templates.js';

let _settings = normalizeMailboxSettings({});
let _rows = [];
let _accountFolderKeys = new Map();
const _initialParams = new URLSearchParams(window.location.search);
let _filters = {
  mailboxKey: _initialParams.get('account') || 'all',
  folderKey: _initialParams.get('folder') || 'inbox',
  query: '',
};
let _selectedId = _initialParams.get('message') || null;
let _templates = [];

function accountByKey(key) {
  return _settings.accounts.find(account => account.key === key) || {};
}

function selectedMessage() {
  return _rows.find(row => row.id === _selectedId) || null;
}

function mailboxFrameSrcdoc(row) {
  return `<!doctype html><html><head><base target="_blank"><style>body{margin:0;padding:16px;background:#fff;color:#111827;font-family:Arial,sans-serif;overflow-wrap:anywhere;}img{max-width:100%;height:auto;}table{max-width:100%;}a{color:#0d6efd;}</style></head><body>${row.bodyHtml}</body></html>`;
}

function setMailboxFrame(frame, row) {
  if (frame && row && row.bodyHtml) frame.srcdoc = mailboxFrameSrcdoc(row);
}

function openFullMessage(row = selectedMessage()) {
  if (!row) return;
  document.getElementById('mailboxFullModalTitle').textContent = row.subject || 'Bericht';
  document.getElementById('mailboxFullModalMeta').textContent = `${row.mailboxLabel || ''} · ${row.folderLabel || ''} · ${row.dateLabel || ''}`;
  const body = document.getElementById('mailboxFullModalBody');
  if (row.bodyHtml) {
    body.innerHTML = '<iframe class="mailbox-html-frame mailbox-html-frame-full" title="Mailinhoud" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>';
    setMailboxFrame(body.querySelector('.mailbox-html-frame'), row);
  } else {
    body.innerHTML = `<div class="p-4">${escapeHtml(row.body || row.preview || '').replaceAll('\n', '<br>')}</div>`;
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('mailboxFullModal')).show();
}

function mergeMailboxFolders(defaultFolders = [], serverFolders = []) {
  const byKey = new Map(defaultFolders.map(folder => [folder.key, { ...folder }]));
  (Array.isArray(serverFolders) ? serverFolders : []).forEach(folder => {
    if (!folder || !folder.key) return;
    byKey.set(folder.key, { ...(byKey.get(folder.key) || {}), ...folder });
  });
  return [...byKey.values()];
}

async function hydrateProviderFolders() {
  _accountFolderKeys = new Map();
  for (const account of activeMailboxAccounts()) {
    try {
      const folders = await listFoldersViaFirebaseFunction({ account });
      if (!folders.length) continue;
      _accountFolderKeys.set(account.key, new Set(folders.map(folder => folder.key)));
      _settings.folders = mergeMailboxFolders(_settings.folders, folders);
    } catch (err) {
      console.warn(`Mailboxmappen laden mislukt voor ${account.key}`, err);
    }
  }
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
  const hasHtml = Boolean(row.bodyHtml);
  panel.innerHTML = `
    <div class="mailbox-message-header">
      <div class="d-flex justify-content-between gap-2 align-items-start">
        <div>
          <div class="small text-muted">${escapeHtml(row.mailboxLabel)} · ${escapeHtml(row.folderLabel)}</div>
          <h2 class="h5 mb-1">${escapeHtml(row.subject)}</h2>
        </div>
        ${row.placeholder ? '<span class="badge text-bg-warning">Placeholder</span>' : '<button type="button" class="btn btn-sm btn-outline-primary" id="btnOpenFullMessage"><i class="fa-solid fa-up-right-and-down-left-from-center me-1"></i> Volle breedte</button>'}
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
      ` : hasHtml
        ? '<iframe class="mailbox-html-frame" title="Mailinhoud" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>'
        : `<p>${escapeHtml(bodyText).replaceAll('\n', '<br>')}</p>`}
    </div>
  `;
  const frame = panel.querySelector('.mailbox-html-frame');
  setMailboxFrame(frame, row);
  panel.querySelector('#btnOpenFullMessage')?.addEventListener('click', () => openFullMessage(row));
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

function updateSyncStatus(message, variant = 'light') {
  const el = document.getElementById('mailboxSyncStatus');
  if (!el) return;
  el.className = `alert alert-${variant} border small d-flex align-items-center gap-2 mb-3`;
  el.querySelector('span').textContent = message;
}

function activeMailboxAccounts() {
  return _settings.accounts.filter(account => account && account.key && account.enabled !== false);
}

async function syncAllMailboxes() {
  const btn = document.getElementById('btnSyncAllMailboxes');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Synchroniseren…';
  const accounts = activeMailboxAccounts();
  updateSyncStatus(`Volledige sync gestart voor ${accounts.length} mailboxen. Dit kan even duren; alleen mails van de laatste 3 maanden worden bewaard.`, 'info');
  try {
    const results = [];
    for (const account of accounts) {
      const result = await syncMailboxViaFirebaseFunction({ account, folderKey: 'all', mode: 'all' });
      results.push({ account, result });
    }
    const stored = results.reduce((sum, item) => sum + (item.result.stored || 0), 0);
    const deleted = results.reduce((sum, item) => sum + (item.result.deleted || 0), 0);
    const labels = results.map(item => `${item.account.label || item.account.key}: ${item.result.stored || 0}`).join(' · ');
    updateSyncStatus(`Mailbox-cache bijgewerkt: ${stored} mails opgeslagen/bijgewerkt, ${deleted} oude mails opgeruimd. ${labels}`, 'success');
    showToast('Mailbox-cache bijgewerkt', 'success');
    await loadSettingsAndMessages();
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function linkAllMailboxMessagesToProjects() {
  const btn = document.getElementById('btnLinkMailboxProjects');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Koppelen…';
  const accounts = activeMailboxAccounts();
  updateSyncStatus(`Mailbox-cache van ${accounts.length} mailboxen wordt gekoppeld aan projecten op basis van klantmailadres/naam. In projecten bewaren we alleen onderwerp, datum, richting en open-link.`, 'info');
  try {
    const results = [];
    for (const account of accounts) {
      const result = await linkMailboxToProjectsViaFirebaseFunction({ account, folderKey: 'all' });
      results.push(result);
    }
    const linkedMessages = results.reduce((sum, item) => sum + (item.linkedMessages || 0), 0);
    const linkedProjects = results.reduce((sum, item) => sum + (item.linkedProjects || 0), 0);
    updateSyncStatus(`Projectkoppeling klaar: ${linkedMessages} mails bij ${linkedProjects} projecten.`, 'success');
    showToast('Mails gekoppeld aan projecten', 'success');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
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
  await hydrateProviderFolders();
  const rows = [];
  const foldersToLoad = _filters.folderKey === 'all'
    ? _settings.folders
    : _settings.folders.filter(folder => folder.key === _filters.folderKey);
  const perFolderLimit = foldersToLoad.length > 1 ? 10 : 50;
  for (const account of _settings.accounts) {
    const availableFolderKeys = _accountFolderKeys.get(account.key);
    const accountFoldersToLoad = availableFolderKeys
      ? foldersToLoad.filter(folder => availableFolderKeys.has(folder.key))
      : foldersToLoad;
    for (const folder of accountFoldersToLoad) {
      try {
        const messages = await listMailboxMessages({ account, folder, query: _filters.query, limit: perFolderLimit });
        rows.push(...messages);
      } catch (err) {
        console.warn(`Mailboxberichten laden mislukt voor ${account.key}/${folder.key}`, err);
      }
    }
  }
  _rows = rows;
  renderAll();
  if (_selectedId && _initialParams.get('message')) {
    const row = _rows.find(item => item.id === _selectedId || item.cacheId === _selectedId);
    if (row) {
      _selectedId = row.id;
      renderRows();
      setTimeout(() => openFullMessage(row), 0);
    }
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
  document.getElementById('btnRefreshMailboxes').addEventListener('click', () => {
    loadSettingsAndMessages().catch(e => showToast('Mailboxen laden mislukt: ' + e.message, 'danger'));
  });
  document.getElementById('btnSyncAllMailboxes').addEventListener('click', () => {
    syncAllMailboxes().catch(e => {
      updateSyncStatus('Mailbox-sync mislukt: ' + e.message, 'danger');
      showToast('Mailbox-sync mislukt: ' + e.message, 'danger');
    });
  });
  document.getElementById('btnLinkMailboxProjects').addEventListener('click', () => {
    linkAllMailboxMessagesToProjects().catch(e => {
      updateSyncStatus('Projectkoppeling mislukt: ' + e.message, 'danger');
      showToast('Projectkoppeling mislukt: ' + e.message, 'danger');
    });
  });
  document.getElementById('mailboxFilter').addEventListener('change', e => {
    _filters.mailboxKey = e.target.value;
    renderAll();
  });
  document.getElementById('folderFilter').addEventListener('change', e => {
    _filters.folderKey = e.target.value;
    _selectedId = null;
    loadSettingsAndMessages().catch(err => showToast('Mailboxen laden mislukt: ' + err.message, 'danger'));
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
