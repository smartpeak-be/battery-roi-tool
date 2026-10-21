import { describe, it, expect } from 'vitest';
import { leadContactMailFor, leadResultMailFor, LEAD_CONTACT_RECIPIENTS } from '../lead-mails.js';

const analysisLead = {
  customerName: 'Jan <img src=x onerror=alert(1)>',
  email: 'jan@example.test',
  csvDailyCompact: { startDate: '2025-01-01', afname: [1] },
  defaultsUsed: { pricePerKwh: true },
  status: 'cold_lead',
};

describe('lead result mail', () => {
  it('goes to the lead, links to its result page and escapes the name', () => {
    const mail = leadResultMailFor('AbC123', analysisLead);
    expect(mail.id).toBe('lead_result_AbC123');
    expect(mail.doc.to).toBe('jan@example.test');
    expect(mail.doc.message.html).toContain('lead-result.html?r=AbC123');
    expect(mail.doc.message.html).toContain('Jan &lt;img');
    expect(mail.doc.message.html).not.toContain('<img src=x');
  });

  it('is not sent for contact requests without consumption data or without a valid address', () => {
    expect(leadResultMailFor('id', { email: 'a@b.be', status: 'cold_lead' })).toBeNull();
    expect(leadResultMailFor('id', { ...analysisLead, email: 'not-an-address' })).toBeNull();
  });
});

describe('lead contact mail', () => {
  it('is sent to SmartPeak once, when the lead turns hot', () => {
    const mail = leadContactMailFor('id1', { status: 'cold_lead' }, { ...analysisLead, status: 'hot_lead', notes: 'Bel me <b>snel</b>' });
    expect(mail.id).toBe('lead_contact_id1');
    expect(mail.doc.to).toEqual(LEAD_CONTACT_RECIPIENTS);
    expect(mail.doc.message.html).toContain('Bel me &lt;b&gt;snel&lt;/b&gt;');
    expect(leadContactMailFor('id1', { status: 'hot_lead' }, { status: 'hot_lead' })).toBeNull();
    expect(leadContactMailFor('id1', null, { status: 'cold_lead' })).toBeNull();
  });
});

describe('addresses', () => {
  it('only accepts one plain address', () => {
    for (const bad of ['a@b.be,c@d.be', 'a@b.be?bcc=x@y.be', 'Jan <a@b.be>', 'a@b']) {
      expect(leadResultMailFor('id', { ...analysisLead, email: bad })).toBeNull();
    }
  });
});
