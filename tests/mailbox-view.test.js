import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MAILBOX_ACCOUNTS,
  filterMailboxRows,
  getMailboxMessageViaFirebaseFunction,
  listMailboxMessages,
  mailboxOpenUrl,
  mailboxProviderStatus,
  makeMailboxPlaceholderRows,
  normalizeMailboxAccounts,
  normalizeMailboxMessage,
  normalizeMailboxSettings,
  normalizeProjectMailLink,
} from '../assets/js/mailbox-view.js';

const pageSource = readFileSync(new URL('../mailbox-view.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../assets/js/pages/mailbox-view-app.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../assets/css/smartpeak.css', import.meta.url), 'utf8');
const projectEditSource = readFileSync(new URL('../assets/js/pages/project-edit-app.js', import.meta.url), 'utf8');
const dashboardAppSource = readFileSync(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8');
const functionsSource = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const mailboxModuleSource = readFileSync(new URL('../assets/js/mailbox-view.js', import.meta.url), 'utf8');

describe('mailbox view', () => {
  it('voorziet Kevin, Ruben en algemene SmartPeak mailbox als defaults', () => {
    expect(DEFAULT_MAILBOX_ACCOUNTS.map(account => account.key)).toEqual(['kevin', 'ruben', 'contact']);
    expect(DEFAULT_MAILBOX_ACCOUNTS.map(account => account.email)).toEqual([
      'kevin@smartpeak.be',
      'ruben@smartpeak.be',
      'contact@smartpeak.be',
    ]);
  });

  it('normaliseert mailboxsettings en laat later mailboxen overschrijven/toevoegen', () => {
    const settings = normalizeMailboxSettings({
      mailboxAccounts: [
        { key: 'kevin', label: 'Kevin B.', email: 'kevin@smartpeak.be' },
        { key: 'planning', label: 'Planning', email: 'planning@smartpeak.be' },
      ],
    });
    expect(settings.accounts.map(account => account.key)).toEqual(['kevin', 'ruben', 'contact', 'planning']);
    expect(settings.accounts.find(account => account.key === 'kevin').label).toBe('Kevin B.');
    expect(settings.folders.map(folder => folder.key)).toContain('to-answer');
    expect(settings.folders.map(folder => folder.key)).toContain('sent');
    expect(normalizeMailboxAccounts([{ key: 'contact', enabled: false }]).map(account => account.key)).not.toContain('contact');
  });

  it('heeft een veilige plugin/provider boundary en placeholders zonder provider', () => {
    vi.stubGlobal('window', {});
    const settings = normalizeMailboxSettings({});
    expect(mailboxProviderStatus(settings)).toMatchObject({ available: false, label: 'SmartPeakMailboxPlugin' });
    const placeholders = makeMailboxPlaceholderRows(settings.accounts, settings.folders);
    expect(placeholders).toHaveLength(3);
    expect(placeholders[0]).toMatchObject({ placeholder: true, folderKey: 'inbox' });
    vi.unstubAllGlobals();
  });

  it('herkent Firebase als veilige mailbox-provider fallback', () => {
    vi.stubGlobal('firebase', { auth: () => ({ currentUser: null }) });
    expect(mailboxProviderStatus(normalizeMailboxSettings({}))).toMatchObject({
      available: true,
      label: 'Firebase mailbox provider',
    });
    vi.unstubAllGlobals();
  });

  it('kan berichten via plugin ophalen en normaliseren', async () => {
    vi.stubGlobal('SmartPeakMailboxPlugin', {
      label: 'Test plugin',
      listMessages: vi.fn().mockResolvedValue([{ id: 'm1', from: 'klant@example.test', subject: 'Vraag', preview: 'Hallo', unread: true }]),
    });
    const account = { key: 'kevin', label: 'Kevin' };
    const folder = { key: 'inbox', label: 'Inbox' };
    const rows = await listMailboxMessages({ account, folder });
    expect(rows[0]).toMatchObject({ id: 'm1', mailboxKey: 'kevin', folderKey: 'inbox', body: 'Hallo', unread: true });
    vi.unstubAllGlobals();
  });

  it('toont de echte body en laadt alle standaardmappen inclusief verzonden', () => {
    const row = normalizeMailboxMessage(
      { id: 'm2', from: 'klant@example.test', subject: 'Vraag', preview: 'Korte preview', body: 'Volledige mailbody' },
      { key: 'kevin', label: 'Kevin' },
      { key: 'sent', label: 'Verzonden' },
    );
    expect(row.body).toBe('Volledige mailbody');
    expect(normalizeMailboxMessage({ bodyHtml: '<strong>HTML</strong>' }, { key: 'kevin', label: 'Kevin' }, { key: 'inbox', label: 'Inbox' }).bodyHtml).toContain('<strong>HTML</strong>');
    expect(appSource).toContain('listFoldersViaFirebaseFunction');
    expect(appSource).toContain('hydrateProviderFolders');
    expect(appSource).toContain("_filters.folderKey === 'all'");
    expect(appSource).toContain('const bodyText = row.body || row.preview ||');
    expect(appSource).toContain('mailbox-html-frame');
    expect(appSource).toContain('frame.srcdoc');
    expect(appSource).toContain('openFullMessage');
    expect(appSource).toContain('syncMailboxViaFirebaseFunction');
    expect(cssSource).toContain('.mailbox-html-frame');
    expect(cssSource).toContain('.mailbox-html-frame-full');
    expect(pageSource).toContain('btnSyncAllMailboxes');
    expect(pageSource).toContain('mailboxFullModal');
    expect(appSource).not.toContain("['inbox', 'follow-up', 'to-answer'].includes");
    expect(appSource).toContain('loadSettingsAndMessages().catch');
  });

  it('filtert mailboxrijen op mailbox, map en zoekterm', () => {
    const rows = [
      normalizeMailboxMessage({ id: '1', from: 'a@test', subject: 'Offerte' }, { key: 'kevin', label: 'Kevin' }, { key: 'inbox', label: 'Inbox' }),
      normalizeMailboxMessage({ id: '2', from: 'b@test', subject: 'Keuring' }, { key: 'ruben', label: 'Ruben' }, { key: 'to-answer', label: 'Te beantwoorden' }),
    ];
    expect(filterMailboxRows(rows, { mailboxKey: 'kevin' })).toHaveLength(1);
    expect(filterMailboxRows(rows, { folderKey: 'to-answer' })).toHaveLength(1);
    expect(filterMailboxRows(rows, { query: 'keuring' })[0].id).toBe('2');
  });

  it('bouwt de mailboxpagina met mailboxfilters, providerstatus en template-concept acties', () => {
    expect(pageSource).toContain('id="mailboxCards"');
    expect(pageSource).toContain('id="messageList"');
    expect(pageSource).toContain('id="messagePreview"');
    expect(pageSource).toContain('id="templateSelect"');
    expect(pageSource).toContain('id="draftText"');
    expect(pageSource).toContain('Concept vanuit template');
    expect(appSource).toContain('SmartPeakMailboxPlugin');
    expect(appSource).toContain('defaultCommunicationTemplates');
    expect(appSource).toContain('renderTemplatePlainText');
    expect(dashboardSource).toContain('mailbox-view.html');
    expect(cssSource).toContain('.mailbox-view-page');
  });
  it('koppelt mailboxlinks projectvriendelijk zonder bodytekst te bewaren', () => {
    const received = normalizeProjectMailLink({ cacheId: 'inbox-123', folderKey: 'inbox', subject: 'Vraag batterij', date: '2026-07-01T10:00:00.000Z' });
    const sent = normalizeProjectMailLink({ messageId: 'sent-456', folderKey: 'sent', subject: 'Offerte', dateLabel: '2026-07-02' });
    expect(received).toMatchObject({ messageId: 'inbox-123', direction: 'received', directionLabel: 'Ontvangen' });
    expect(sent).toMatchObject({ direction: 'sent', directionLabel: 'Verstuurd' });
    expect(mailboxOpenUrl(sent)).toBe('mailbox-view.html?account=kevin&folder=sent&message=sent-456');
    expect(Object.keys(received)).not.toContain('body');
    expect(Object.keys(received)).not.toContain('bodyHtml');
  });

  it('toont gekoppelde mails in project en dashboard met enkel onderwerp, datum, richting en open-knop', () => {
    expect(projectEditSource).toContain('Gekoppelde mails');
    expect(projectEditSource).toContain('normalizeProjectMailLink');
    expect(projectEditSource).toContain('link.subject');
    expect(projectEditSource).toContain('link.directionLabel');
    expect(projectEditSource).toContain('link.openUrl');
    expect(projectEditSource).not.toContain('link.body');
    expect(projectEditSource).not.toContain('link.bodyHtml');
    expect(dashboardAppSource).toContain('> Mails</h6>');
    expect(dashboardAppSource).toContain('normalizeProjectMailLink');
  });

  it('opent dashboard-mails in een modal zonder nieuwe mailbox-tab', async () => {
    expect(dashboardAppSource).toContain('data-dashboard-mail-open');
    expect(dashboardAppSource).toContain('openDashboardMailModal');
    expect(dashboardAppSource).toContain('dashboardMailModal');
    expect(dashboardAppSource).toContain('getMailboxMessageViaFirebaseFunction');
    expect(dashboardAppSource).not.toContain('target="_blank" rel="noopener">Open</a>');

    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { id: 'inbox-1', subject: 'Vraag', body: 'Mailtekst' } }) });
    vi.stubGlobal('firebase', {
      auth: () => ({ currentUser: { getIdToken: vi.fn().mockResolvedValue('token') } }),
      app: () => ({ options: { projectId: 'smartpeak-projects' } }),
    });
    vi.stubGlobal('fetch', fetch);
    const message = await getMailboxMessageViaFirebaseFunction({ accountKey: 'kevin', folderKey: 'inbox', messageId: 'inbox-1' });
    expect(message.subject).toBe('Vraag');
    expect(fetch.mock.calls[0][1].body).toContain('getMessage');
    vi.unstubAllGlobals();
  });

  it('heeft backend sync die bestaande mailbox-cache aan projecten linkt', () => {
    expect(pageSource).toContain('btnLinkMailboxProjects');
    expect(appSource).toContain('linkMailboxToProjectsViaFirebaseFunction');
    expect(mailboxModuleSource).toContain("action: 'linkProjects'");
    expect(appSource).toContain("_initialParams.get('message')");
    expect(functionsSource).toContain('linkMailboxCacheToProjects');
    expect(functionsSource).toContain('getCachedMessage');
    expect(functionsSource).toContain("action === 'linkProjects'");
    expect(functionsSource).toContain("action === 'getMessage'");
    expect(functionsSource).toContain('projectMailLinkFromMessage');
    expect(functionsSource).toContain('hostingerSmartpeakRubenPassword');
    expect(functionsSource).toContain('hostingerSmartpeakContactPassword');
    expect(functionsSource).toContain("email: 'ruben@smartpeak.be'");
    expect(functionsSource).toContain("email: 'contact@smartpeak.be'");
    expect(functionsSource).toContain('subject: cleanString(message.subject');
  });

});
