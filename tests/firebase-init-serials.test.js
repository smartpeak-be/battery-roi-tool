import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../assets/js/firebase-init.js'), 'utf8');

// Eval the helpers we need into a sandbox. firebase-init.js is a script
// (not a module); it relies on `firebase` global. We only test pure helpers
// that don't touch firebase, so we stub it.
function loadHelpers() {
  const ctx = { firebase: { firestore: () => ({}) }, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

describe('mergeProjectMetadata serial defaults', () => {
  it('adds planning, technical, and inspection defaults for legacy projects', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const merged = mergeProjectMetadata({});

    expect(merged.planning).toMatchObject({
      visitPlannedDate: null,
      installationPlannedDate: null,
      inspectionPlannedDate: null,
    });
    expect(merged.technical).toMatchObject({
      earthResistanceMeasured: null,
      earthResistanceOhm: null,
      voltageMeasurements: {},
    });
    expect(merged.inspection).toMatchObject({
      company: null,
      reference: null,
      notes: null,
    });
  });

  it('adds category=null and source=manual to legacy entries lacking those fields', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const project = {
      serialNumbers: [{ id: 'a', value: 'OLD-123' }],
    };
    const merged = mergeProjectMetadata(project);
    expect(merged.serialNumbers[0]).toMatchObject({
      id: 'a', value: 'OLD-123', category: null, source: 'manual',
    });
  });

  it('preserves category and source when already present', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const project = {
      serialNumbers: [
        { id: 'a', value: 'X', category: 'batterij', source: 'ocr', photoId: 'p1' },
      ],
    };
    const merged = mergeProjectMetadata(project);
    expect(merged.serialNumbers[0]).toMatchObject({
      id: 'a', value: 'X', category: 'batterij', source: 'ocr', photoId: 'p1',
    });
  });

  it('handles missing serialNumbers array', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const merged = mergeProjectMetadata({});
    expect(merged.serialNumbers).toEqual([]);
  });
});

describe('ground fault measurement status', () => {
  it('treats exact voltage measurements as phase-ground measurement evidence', () => {
    const { groundFaultStatus } = loadHelpers();
    const project = {
      lastCalcRun: { inputs: { selectedConfigTypes: ['ZSF_TEST'] } },
      cabinet: { lineGroundChecked: null },
      technical: { voltageMeasurements: { l1Pe: 12 } },
    };

    expect(groundFaultStatus(project)).toBe(false);
  });
});

describe('firebase helper signatures (existence smoke-test)', () => {
  it('exposes requestPhotoOcrRerun on window', () => {
    const { window } = loadHelpers();
    expect(typeof window.requestPhotoOcrRerun).toBe('function');
  });

  it('exposes setPhotoSerialTag on window', () => {
    const { window } = loadHelpers();
    expect(typeof window.setPhotoSerialTag).toBe('function');
  });
});

describe('customer address helpers', () => {
  it('formats structured addresses and creates Billit fields without duplicating house numbers', () => {
    const { formatCustomerAddress, billitAddressForCustomer } = loadHelpers();
    const customer = {
      addressStructured: {
        street: 'Kerkstraat',
        houseNumber: '15',
        bus: '2',
        postalCode: '9240',
        city: 'Zele',
        countryCode: 'BE',
      },
    };
    expect(formatCustomerAddress(customer)).toBe('Kerkstraat 15 bus 2, 9240 Zele');
    expect(billitAddressForCustomer(customer)).toEqual({
      street: 'Kerkstraat 15 bus 2',
      zipcode: '9240',
      city: 'Zele',
      countryCode: 'BE',
    });
  });

  it('falls back to legacy address parsing for old projects', () => {
    const { billitAddressForCustomer } = loadHelpers();
    expect(billitAddressForCustomer({ address: 'Kerkstraat 15, 9240 Zele' })).toEqual({
      street: 'Kerkstraat 15',
      zipcode: '9240',
      city: 'Zele',
      countryCode: 'BE',
    });
  });
});

describe('operations workflow defaults', () => {
  it('adds activities, tasks, mail links and battery registry defaults for legacy projects', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const merged = mergeProjectMetadata({});

    expect(merged.activities).toEqual([]);
    expect(merged.tasks).toEqual([]);
    expect(merged.mailLinks).toEqual([]);
    expect(merged.filesInbox).toEqual([]);
    expect(merged.batteryRegistry).toEqual({ bebatStatus: 'not_needed', entries: [] });
  });

  it('normalizes task assignees to Kevin/Ruben and preserves future unknown team members', () => {
    const { normalizeProjectTask } = loadHelpers();

    expect(normalizeProjectTask({ title: 'Offerte opvolgen', assignee: 'kevin' })).toMatchObject({
      title: 'Offerte opvolgen', assignee: 'kevin', status: 'open', source: 'manual', type: 'follow_up', confidence: 'zeker',
    });
    expect(normalizeProjectTask({ title: 'Bestelling plaatsen', assignee: 'Ruben' }).assignee).toBe('ruben');
    expect(normalizeProjectTask({ title: 'Later iemand anders', assignee: 'sofie' }).assignee).toBe('sofie');
  });

  it('classifies Bebat registration status from battery serial entries', () => {
    const { bebatSummaryForProject } = loadHelpers();
    const project = {
      serialNumbers: [
        { id: 'bat-1', value: 'BATT-001', category: 'batterij', bebatStatus: 'registered' },
        { id: 'bat-2', value: 'BATT-002', category: 'batterij' },
        { id: 'inv-1', value: 'INV-001', category: 'omvormer' },
      ],
    };

    expect(bebatSummaryForProject(project)).toEqual({
      total: 2,
      registered: 1,
      pending: 1,
      notRequired: 0,
      status: 'pending',
    });
  });

  it('suggests next actions for appointment, data and Bebat gaps', () => {
    const { nextActionsForProject } = loadHelpers();
    const project = {
      status: 'bezoek_gepland',
      planning: { visitPlannedDate: '2026-05-29' },
      activities: [{ type: 'appointment_scheduled', occurredAt: '2026-05-26' }],
      serialNumbers: [{ id: 'bat-1', value: 'BATT-001', category: 'batterij' }],
      batteryRegistry: { bebatStatus: 'pending', entries: [] },
    };

    expect(nextActionsForProject(project).map(a => a.type)).toEqual([
      'send_appointment_confirmation',
      'request_energy_data',
      'register_bebat',
    ]);
  });

  it('builds cross-project Bebat rows only for battery serials and sorts pending first', () => {
    const { bebatRowsForProjects } = loadHelpers();
    const projects = [
      {
        id: 'project-registered',
        customerName: 'Geregistreerd',
        status: 'klaar_voor_inplannen_keuring',
        serialNumbers: [{ id: 'bat-registered', value: 'BATT-002', category: 'batterij', bebatStatus: 'registered', bebatRegisteredAt: '2026-05-24', bebatReference: 'BE-42' }],
      },
      {
        id: 'project-pending',
        customerName: 'Nog te doen',
        status: 'bezoek_gepland',
        serialNumbers: [
          { id: 'inv', value: 'INV-001', category: 'omvormer' },
          { id: 'bat-pending', value: 'BATT-001', category: 'batterij' },
        ],
      },
    ];

    expect(bebatRowsForProjects(projects)).toEqual([
      expect.objectContaining({ projectId: 'project-pending', serialId: 'bat-pending', serial: 'BATT-001', status: 'pending', customerName: 'Nog te doen', projectStatusLabel: 'Bezoek gepland' }),
      expect.objectContaining({ projectId: 'project-registered', serialId: 'bat-registered', serial: 'BATT-002', status: 'registered', registeredAt: '2026-05-24', reference: 'BE-42', projectStatusLabel: 'Klaar voor inplannen keuring' }),
    ]);
  });

  it('builds a cross-project task inbox with own tasks by default and suggested actions', () => {
    const { projectTaskRowsForProjects } = loadHelpers();
    const projects = [
      {
        id: 'project-kevin',
        customerName: 'Kevin klant',
        status: 'offerte_uit',
        tasks: [
          { id: 'task-kevin', title: 'Klant bellen', assignee: 'kevin', status: 'open', dueDate: '2026-05-25' },
          { id: 'task-ruben', title: 'Bebat nakijken', assignee: 'ruben', status: 'open' },
          { id: 'task-done', title: 'Afgewerkt', assignee: 'kevin', status: 'done' },
        ],
      },
      {
        id: 'project-ruben',
        customerName: 'Ruben klant',
        status: 'bezoek_gepland',
        planning: { visitPlannedDate: '2026-05-29' },
        activities: [{ type: 'appointment_scheduled', occurredAt: '2026-05-26' }],
        serialNumbers: [{ id: 'bat-1', value: 'BAT-1', category: 'batterij' }],
      },
    ];

    const kevinRows = projectTaskRowsForProjects(projects, { assignee: 'kevin' });
    expect(kevinRows[0]).toEqual(expect.objectContaining({ rowType: 'task', projectId: 'project-kevin', taskId: 'task-kevin', title: 'Klant bellen', assignee: 'kevin', dueDate: '2026-05-25' }));
    expect(kevinRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowType: 'suggested', projectId: 'project-ruben', type: 'send_appointment_confirmation', title: 'Bevestigingsmail afspraak sturen', assignee: 'kevin' }),
      expect.objectContaining({ rowType: 'suggested', projectId: 'project-kevin', type: 'request_energy_data', title: 'MyFluvius/CSV of verbruiksdata opvragen', assignee: 'kevin' }),
    ]));
    expect(kevinRows.some(row => row.taskId === 'task-ruben' || row.taskId === 'task-done')).toBe(false);
    expect(projectTaskRowsForProjects(projects, { assignee: 'ruben' })).toEqual([
      expect.objectContaining({ rowType: 'task', projectId: 'project-kevin', taskId: 'task-ruben', title: 'Bebat nakijken', assignee: 'ruben' }),
      expect.objectContaining({ rowType: 'suggested', projectId: 'project-ruben', type: 'register_bebat', title: '1 batterijserienummer(s) nog Bebat registreren', assignee: 'ruben' }),
    ]);
  });

  it('maps whitelisted emails to the default dashboard task owner', () => {
    const { assigneeForEmail } = loadHelpers();
    expect(assigneeForEmail('kevin@bloxit.be')).toBe('kevin');
    expect(assigneeForEmail('ledsrepair@gmail.com')).toBe('ruben');
    expect(assigneeForEmail('someone@example.com')).toBe('all');
  });
});
