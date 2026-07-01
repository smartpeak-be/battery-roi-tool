import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MAILBOX_ACCOUNTS,
  filterMailboxRows,
  listMailboxMessages,
  mailboxProviderStatus,
  makeMailboxPlaceholderRows,
  normalizeMailboxAccounts,
  normalizeMailboxMessage,
  normalizeMailboxSettings,
} from '../assets/js/mailbox-view.js';

const pageSource = readFileSync(new URL('../mailbox-view.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../assets/js/pages/mailbox-view-app.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../assets/css/smartpeak.css', import.meta.url), 'utf8');

describe('mailbox view', () => {
  it('voorziet Kevin, Ruben en algemene SmartPeak mailbox als defaults', () => {
    expect(DEFAULT_MAILBOX_ACCOUNTS.map(account => account.key)).toEqual(['kevin', 'ruben', 'smartpeak']);
    expect(DEFAULT_MAILBOX_ACCOUNTS.map(account => account.email)).toEqual([
      'kevin@smartpeak.be',
      'ruben@smartpeak.be',
      'info@smartpeak.be',
    ]);
  });

  it('normaliseert mailboxsettings en laat later mailboxen overschrijven/toevoegen', () => {
    const settings = normalizeMailboxSettings({
      mailboxAccounts: [
        { key: 'kevin', label: 'Kevin B.', email: 'kevin@smartpeak.be' },
        { key: 'planning', label: 'Planning', email: 'planning@smartpeak.be' },
      ],
    });
    expect(settings.accounts.map(account => account.key)).toEqual(['kevin', 'ruben', 'smartpeak', 'planning']);
    expect(settings.accounts.find(account => account.key === 'kevin').label).toBe('Kevin B.');
    expect(settings.folders.map(folder => folder.key)).toContain('to-answer');
    expect(normalizeMailboxAccounts([{ key: 'smartpeak', enabled: false }]).map(account => account.key)).not.toContain('smartpeak');
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

  it('kan berichten via plugin ophalen en normaliseren', async () => {
    vi.stubGlobal('SmartPeakMailboxPlugin', {
      label: 'Test plugin',
      listMessages: vi.fn().mockResolvedValue([{ id: 'm1', from: 'klant@example.test', subject: 'Vraag', preview: 'Hallo', unread: true }]),
    });
    const account = { key: 'kevin', label: 'Kevin' };
    const folder = { key: 'inbox', label: 'Inbox' };
    const rows = await listMailboxMessages({ account, folder });
    expect(rows[0]).toMatchObject({ id: 'm1', mailboxKey: 'kevin', folderKey: 'inbox', unread: true });
    vi.unstubAllGlobals();
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
});
