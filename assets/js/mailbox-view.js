export const MAILBOX_VIEW_VERSION = 1;

export const DEFAULT_MAILBOX_ACCOUNTS = [
  {
    key: 'kevin',
    label: 'Kevin',
    email: 'kevin@smartpeak.be',
    role: 'persoonlijk',
    color: '#0d6efd',
    enabled: true,
  },
  {
    key: 'ruben',
    label: 'Ruben',
    email: 'ruben@smartpeak.be',
    role: 'persoonlijk',
    color: '#00b478',
    enabled: true,
  },
  {
    key: 'smartpeak',
    label: 'SmartPeak algemeen',
    email: 'info@smartpeak.be',
    role: 'algemeen',
    color: '#f59e0b',
    enabled: true,
  },
];

export const DEFAULT_MAILBOX_FOLDERS = [
  { key: 'inbox', label: 'Inbox', providerFolder: 'INBOX' },
  { key: 'follow-up', label: 'Opvolgen', providerFolder: 'INBOX.Opvolgen' },
  { key: 'to-answer', label: 'Te beantwoorden', providerFolder: 'INBOX.Te Beantwoorden' },
  { key: 'review', label: 'Te bekijken', providerFolder: 'INBOX.Te Bekijken' },
  { key: 'sent', label: 'Verzonden', providerFolder: 'INBOX.Sent' },
];

export function normalizeMailboxAccounts(accounts = []) {
  const byKey = new Map(DEFAULT_MAILBOX_ACCOUNTS.map(account => [account.key, { ...account }]));
  (Array.isArray(accounts) ? accounts : []).forEach(account => {
    if (!account || !account.key) return;
    byKey.set(account.key, {
      ...(byKey.get(account.key) || {}),
      ...account,
      enabled: account.enabled !== false,
    });
  });
  return [...byKey.values()].filter(account => account.enabled !== false);
}

export function normalizeMailboxSettings(settings = {}) {
  return {
    accounts: normalizeMailboxAccounts(settings.mailboxAccounts),
    folders: Array.isArray(settings.mailboxFolders) && settings.mailboxFolders.length
      ? settings.mailboxFolders
      : DEFAULT_MAILBOX_FOLDERS.map(folder => ({ ...folder })),
    provider: settings.mailboxProvider || { type: 'plugin', name: 'SmartPeakMailboxPlugin' },
  };
}

export function getMailboxProvider() {
  if (typeof globalThis === 'undefined') return null;
  const plugin = globalThis.SmartPeakMailboxPlugin;
  if (!plugin || typeof plugin !== 'object') return null;
  if (typeof plugin.listMessages !== 'function') return null;
  return plugin;
}

export function mailboxProviderStatus(settings = {}) {
  const provider = getMailboxProvider();
  if (provider) {
    return {
      available: true,
      label: provider.label || settings.provider?.name || 'SmartPeakMailboxPlugin',
      message: 'Mailbox-plugin actief.',
    };
  }
  if (typeof globalThis !== 'undefined' && globalThis.firebase && globalThis.firebase.auth) {
    return {
      available: true,
      label: 'Firebase mailbox provider',
      message: 'Mailboxdata wordt veilig server-side via Firebase Functions opgehaald.',
    };
  }
  return {
    available: false,
    label: settings.provider?.name || 'SmartPeakMailboxPlugin',
    message: 'Nog geen mailbox-provider gekoppeld. De view is klaar; echte mailboxdata kan later via plugin/API aangesloten worden.',
  };
}

export function makeMailboxPlaceholderRows(accounts = [], folders = []) {
  const inboxFolder = folders.find(folder => folder.key === 'inbox') || folders[0] || { key: 'inbox', label: 'Inbox' };
  return accounts.map(account => ({
    id: `placeholder-${account.key}`,
    mailboxKey: account.key,
    mailboxLabel: account.label,
    folderKey: inboxFolder.key,
    folderLabel: inboxFolder.label,
    from: account.email,
    subject: `Mailbox ${account.label} klaar voor koppeling`,
    preview: 'Deze rij is een placeholder tot de mailbox-provider actief is. Er worden geen mails of credentials in de frontend opgeslagen.',
    dateLabel: 'Nog niet gekoppeld',
    unread: false,
    placeholder: true,
  }));
}

export function normalizeMailboxMessage(message = {}, account = {}, folder = {}) {
  return {
    id: String(message.id || message.uid || `${account.key}-${folder.key}-${Date.now()}`),
    mailboxKey: account.key,
    mailboxLabel: account.label,
    folderKey: folder.key,
    folderLabel: folder.label,
    from: message.from || '',
    to: message.to || '',
    subject: message.subject || '(geen onderwerp)',
    preview: message.preview || message.snippet || message.text || '',
    body: message.body || message.text || message.preview || message.snippet || '',
    bodyHtml: message.bodyHtml || message.html || '',
    dateLabel: message.dateLabel || message.date || '',
    unread: Boolean(message.unread),
    flagged: Boolean(message.flagged),
    raw: message,
  };
}

export async function listMessagesViaFirebaseFunction({ account, folder, limit }) {
  if (!account || account.key !== 'kevin') return [];
  if (typeof globalThis === 'undefined' || !globalThis.firebase) return [];
  const user = globalThis.firebase.auth().currentUser;
  if (!user) throw new Error('Niet ingelogd.');
  const token = await user.getIdToken();
  const projectId = globalThis.firebase.app().options.projectId;
  const response = await globalThis.fetch(`https://europe-west1-${projectId}.cloudfunctions.net/mailboxListMessages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountKey: account.key, folderKey: folder.key, folderPath: folder.providerFolder, limit }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Mailbox ophalen mislukt.');
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function listFoldersViaFirebaseFunction({ account }) {
  if (!account || account.key !== 'kevin') return [];
  if (typeof globalThis === 'undefined' || !globalThis.firebase) return [];
  const user = globalThis.firebase.auth().currentUser;
  if (!user) throw new Error('Niet ingelogd.');
  const token = await user.getIdToken();
  const projectId = globalThis.firebase.app().options.projectId;
  const response = await globalThis.fetch(`https://europe-west1-${projectId}.cloudfunctions.net/mailboxListMessages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'folders', accountKey: account.key }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Mailboxmappen ophalen mislukt.');
  return Array.isArray(data.folders) ? data.folders : [];
}

export async function listMailboxMessages({ account, folder, query = '', limit = 50 }) {
  const provider = getMailboxProvider();
  const messages = provider
    ? await provider.listMessages({ account, folder, query, limit })
    : await listMessagesViaFirebaseFunction({ account, folder, query, limit });
  return (Array.isArray(messages) ? messages : []).map(message => normalizeMailboxMessage(message, account, folder));
}

export function filterMailboxRows(rows = [], { mailboxKey = 'all', folderKey = 'all', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter(row => {
    if (mailboxKey !== 'all' && row.mailboxKey !== mailboxKey) return false;
    if (folderKey !== 'all' && row.folderKey !== folderKey) return false;
    if (!q) return true;
    return [row.mailboxLabel, row.from, row.to, row.subject, row.preview]
      .some(value => String(value || '').toLowerCase().includes(q));
  });
}
