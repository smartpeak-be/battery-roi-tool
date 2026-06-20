// Firebase initialization + shared helpers for dashboard.html and index.html (project mode).
// Loaded via <script src> — exposes the Firebase namespace + helpers as globals.
//
// IMPORTANT: Replace FIREBASE_CONFIG_PLACEHOLDER below with the actual config object from
// Firebase Console → Project Settings → Your apps → web app. The config is public by design
// (security rules enforce access — see Firestore rules in the spec).

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAIyAk9Zgv5wraOBR9sdTUkyz92otxRklw",
  authDomain: "smartpeak-projects.firebaseapp.com",
  projectId: "smartpeak-projects",
  storageBucket: "smartpeak-projects.firebasestorage.app",
  messagingSenderId: "566291826812",
  appId: "1:566291826812:web:e7947bd33384e9ca8fa1f9"
};

// Whitelist of emails allowed to access projects. Must match the Firestore security rules
// in Firebase Console exactly. Replace RUBEN_EMAIL_PLACEHOLDER with Ruben's actual email.
const WHITELISTED_EMAILS = [
  'kevin@bloxit.be',
  'ledsrepair@gmail.com',
];

// ─── STATUS ENUM ─────────────────────────────────────────────────────────────
// Status values, free transitions allowed. Order = logical lifecycle order for the
// dropdown UI. Color hex values follow the spec's color column.
const PROJECT_STATUSES = [
  { key: 'nieuw_contact',         label: 'Nieuw contact',                 color: '#9aa3b2' }, // grijs
  { key: 'wachten_op_data',       label: 'Wachten op data',               color: '#9aa3b2' }, // grijs
  { key: 'klaar_voor_bezoek',     label: 'Klaar voor bezoek',             color: '#7eb6e8' }, // lichtblauw
  { key: 'bezoek_gepland',        label: 'Bezoek gepland',                color: '#2c7be5' }, // blauw
  { key: 'bezoek_gedaan',         label: 'Bezoek gedaan / link verstuurd',color: '#2c7be5' }, // blauw
  { key: 'klaar_voor_offerte',    label: 'Klaar voor offerte',            color: '#ffcf80' }, // lichtoranje
  { key: 'offerte_uit',           label: 'Offerte verzonden',             color: '#f6a623' }, // geel
  { key: 'wacht_op_beslissing',   label: 'Wacht op beslissing',           color: '#f6a623' }, // geel
  { key: 'akkoord',               label: 'Akkoord (go)',                  color: '#00b478' }, // groen
  { key: 'installatie_gepland',   label: 'Installatie gepland',           color: '#00b478' }, // groen
  { key: 'in_uitvoering',         label: 'In uitvoering',                 color: '#00b478' }, // groen
  { key: 'klaar_voor_inplannen_keuring', label: 'Klaar voor inplannen keuring', color: '#00b478' }, // groen
  { key: 'keuring_aangevraagd',   label: 'Keuring aangevraagd',           color: '#00b478' }, // groen
  { key: 'keuring_gepland',       label: 'Keuring gepland',               color: '#00b478' }, // groen
  { key: 'keuring_gedaan',        label: 'Keuring gedaan',                color: '#00b478' }, // groen
  { key: 'facturatie',            label: 'Facturatie',                    color: '#00b478' }, // groen
  { key: 'afgesloten',            label: 'Afgesloten',                    color: '#0a6e4a' }, // donkergroen
  { key: 'niet_akkoord',          label: 'Niet akkoord',                  color: '#e54545' }, // rood
];

const DEFAULT_STATUS = 'nieuw_contact';

// ─── PROJECT PHASES (Kanban-board grouping) ──────────────────────────────────
// 5 fasen die de 16 statussen groeperen. Drop op een bord-kolom zet de status
// naar `statuses[0]` van die fase. Kaart-chip blijft klikbaar voor fijnregeling.
const PROJECT_PHASES = [
  { key: 'nieuw',      label: 'Nieuw',       color: '#9aa3b2', statuses: ['nieuw_contact', 'wachten_op_data'] },
  { key: 'bezoek',     label: 'Bezoek',      color: '#7eb6e8', statuses: ['klaar_voor_bezoek', 'bezoek_gepland', 'bezoek_gedaan'] },
  { key: 'offerte',    label: 'Offerte',     color: '#f6a623', statuses: ['klaar_voor_offerte', 'offerte_uit', 'wacht_op_beslissing'] },
  { key: 'uitvoering', label: 'Uitvoering',  color: '#00b478', statuses: ['akkoord', 'installatie_gepland', 'in_uitvoering', 'klaar_voor_inplannen_keuring', 'keuring_aangevraagd', 'keuring_gepland', 'keuring_gedaan'] },
  { key: 'afgesloten', label: 'Afgesloten',  color: '#0a6e4a', statuses: ['facturatie', 'afgesloten', 'niet_akkoord'] },
];

function phaseForStatus(statusKey) {
  for (const p of PROJECT_PHASES) {
    if (p.statuses.includes(statusKey)) return p;
  }
  return PROJECT_PHASES[0];
}

// Status-keys that mark a project as "finished" (hidden by default in dashboard).
const FINISHED_STATUSES = ['afgesloten', 'niet_akkoord'];

// ─── CONNECTION TYPES ────────────────────────────────────────────────────────
const CONNECTION_TYPES = ['1x230', '3x230', '3x400+N'];

// ─── PROJECT METADATA HELPERS ────────────────────────────────────────────────
// Default-empty structure for the 6 metadata sections added in the 2026-04-20
// expansion. Readers merge a project's stored sections over this so pre-2026-04-20
// projects (without these fields) behave identically to empty-new ones.
function newEmptyProjectMetadata() {
  return {
    customer: {
      address:           null,
      addressStructured: null,
      phone:             null,
      email:             null,
    },
    situation: null,
    notes:     null,
    planning: {
      visitPlannedDate:        null,
      visitDoneDate:           null,
      installationPlannedDate: null,
      installationDoneDate:    null,
      inspectionPlannedDate:   null,
      inspectionDoneDate:      null,
    },
    site: {
      houseAgeOver10Years: null,
    },
    electrical: {
      connectionType: null,
      fuseRatingA:    null,
    },
    cabinet: {
      freeUnits:              null,
      hasRemAutomaat:         null,
      wiringDiameterMm2:      null,
      hasOutletNearFluvius:   null,
      hasWifiNearFluvius:     null,
      batteryPlacementRoom:   null,
      hasWifiNearCabinet:     null,
      lineGroundChecked:      null,
    },
    solar: {
      inverters: [],
    },
    technical: {
      earthResistanceMeasured:     null,
      earthResistanceOhm:          null,
      earthResistanceMeasuredDate: null,
      voltageMeasurements:         {},
      technicalNotes:              null,
    },
    inspection: {
      company:   null,
      reference: null,
      notes:     null,
    },
    supplier: {
      name:           null,
      isSingleTariff: false,
      priceDay:       null,
      priceNight:     null,
    },
    calcDefaults: {
      keuring: 'yes',
    },
    // Operationele backoffice-laag: gestructureerd naast comments zodat
    // AmaAi/Kevin/Ruben later betrouwbaar kunnen zoeken, opvolgen en automatiseren.
    activities: [],
    tasks: [],
    mailLinks: [],
    filesInbox: [],
    batteryRegistry: {
      bebatStatus: 'not_needed',
      entries: [],
    },
    serialNumbers: [],
    installedSolution: {
      items: [],
    },
  };
}

// Merge a project doc's metadata sections over the default-empty shape. Returns
// a complete metadata object regardless of which sections the doc contains.
function mergeProjectMetadata(project) {
  const empty = newEmptyProjectMetadata();
  if (!project) return empty;
  const merged = {
    customer:     { ...empty.customer,     ...(project.customer || {}) },
    situation:    project.situation != null ? project.situation : empty.situation,
    notes:        project.notes     != null ? project.notes     : empty.notes,
    planning:     { ...empty.planning,     ...(project.planning || {}) },
    site:         { ...empty.site,         ...(project.site || {}) },
    electrical:   { ...empty.electrical,   ...(project.electrical || {}) },
    cabinet:      { ...empty.cabinet,      ...(project.cabinet || {}) },
    solar:        { ...empty.solar,        ...(project.solar || {}) },
    technical:    { ...empty.technical,    ...(project.technical || {}) },
    inspection:   { ...empty.inspection,   ...(project.inspection || {}) },
    supplier:     { ...empty.supplier,     ...(project.supplier || {}) },
    calcDefaults: { ...empty.calcDefaults, ...(project.calcDefaults || {}) },
  };
  merged.technical.voltageMeasurements = {
    ...empty.technical.voltageMeasurements,
    ...((project.technical && project.technical.voltageMeasurements) || {}),
  };
  merged.offertes      = project.offertes || {};
  merged.activities    = Array.isArray(project.activities) ? project.activities.map(normalizeProjectActivity) : [];
  merged.tasks         = Array.isArray(project.tasks) ? project.tasks.map(normalizeProjectTask) : [];
  merged.mailLinks     = Array.isArray(project.mailLinks) ? project.mailLinks : [];
  merged.filesInbox    = Array.isArray(project.filesInbox) ? project.filesInbox : [];
  merged.batteryRegistry = {
    ...empty.batteryRegistry,
    ...(project.batteryRegistry || {}),
    entries: Array.isArray(project.batteryRegistry && project.batteryRegistry.entries)
      ? project.batteryRegistry.entries
      : [],
  };
  merged.serialNumbers = (Array.isArray(project.serialNumbers) ? project.serialNumbers : []).map(e => ({
    ...e,
    category: (e && e.category != null) ? e.category : null,
    source: (e && e.source) || 'manual',
    bebatStatus: (e && e.bebatStatus) || null,
    bebatRegisteredAt: (e && e.bebatRegisteredAt) || null,
    bebatReference: (e && e.bebatReference) || null,
  }));
  merged.manualConfigs = project.manualConfigs || {};
  merged.installedSolution = project.installedSolution || empty.installedSolution;
  return merged;
}

const SMARTPEAK_TASK_ASSIGNEES = ['kevin', 'ruben'];
const SMARTPEAK_ASSIGNEE_LABELS = { kevin: 'Kevin', ruben: 'Ruben' };
const SMARTPEAK_ASSIGNEE_EMAILS = {
  'kevin@bloxit.be': 'kevin',
  'kevin@smartpeak.be': 'kevin',
  'ledsrepair@gmail.com': 'ruben',
  'ruben@smartpeak.be': 'ruben',
};
const SMARTPEAK_TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
const SMARTPEAK_ACTIVITY_TYPES = [
  'phone_call', 'mail_received', 'mail_sent', 'appointment_scheduled',
  'site_visit', 'offer_sent', 'offer_accepted', 'installation_planned',
  'installation_done', 'inspection', 'invoice', 'follow_up', 'internal_note',
];

function _cleanString(value) {
  return String(value == null ? '' : value).trim();
}

function _normalizeAssignee(value) {
  const v = _cleanString(value).toLowerCase();
  if (!v) return null;
  if (SMARTPEAK_TASK_ASSIGNEES.includes(v)) return v;
  // Future team members must not be destroyed by today's Kevin/Ruben-only UI.
  return v;
}

function assigneeForEmail(email) {
  const key = _cleanString(email).toLowerCase();
  return SMARTPEAK_ASSIGNEE_EMAILS[key] || 'all';
}

function assigneeLabel(value) {
  const key = _normalizeAssignee(value);
  return key ? (SMARTPEAK_ASSIGNEE_LABELS[key] || key) : 'Niet toegewezen';
}

function normalizeProjectTask(task = {}) {
  return {
    id: task.id || `task_${Math.random().toString(36).slice(2, 10)}`,
    title: _cleanString(task.title),
    type: task.type || 'follow_up',
    status: SMARTPEAK_TASK_STATUSES.includes(task.status) ? task.status : 'open',
    assignee: _normalizeAssignee(task.assignee),
    dueDate: task.dueDate || null,
    source: task.source || 'manual',
    confidence: task.confidence || 'zeker',
    linkedActivityId: task.linkedActivityId || null,
    linkedMailId: task.linkedMailId || null,
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
    completedAt: task.completedAt || null,
    cancelledAt: task.cancelledAt || null,
    notes: task.notes || null,
    reminderLog: Array.isArray(task.reminderLog) ? task.reminderLog : [],
  };
}

function normalizeProjectActivity(activity = {}) {
  const type = SMARTPEAK_ACTIVITY_TYPES.includes(activity.type) ? activity.type : 'internal_note';
  return {
    id: activity.id || `act_${Math.random().toString(36).slice(2, 10)}`,
    type,
    title: activity.title || activity.label || '',
    occurredAt: activity.occurredAt || activity.date || activity.createdAt || null,
    source: activity.source || 'manual',
    confidence: activity.confidence || 'zeker',
    assignee: _normalizeAssignee(activity.assignee),
    linkedMailId: activity.linkedMailId || null,
    linkedFileId: activity.linkedFileId || null,
    followUpTaskId: activity.followUpTaskId || null,
    notes: activity.notes || activity.text || null,
  };
}

function _batterySerialsForBebat(project) {
  const serials = Array.isArray(project && project.serialNumbers) ? project.serialNumbers : [];
  return serials.filter(s => ['batterij', 'omvormer_batterij'].includes(s && s.category));
}

function bebatSummaryForProject(project) {
  const batteries = _batterySerialsForBebat(project);
  const total = batteries.length;
  const registered = batteries.filter(s => s.bebatStatus === 'registered').length;
  const notRequired = batteries.filter(s => s.bebatStatus === 'not_required').length;
  const pending = Math.max(0, total - registered - notRequired);
  const explicitStatus = project && project.batteryRegistry && project.batteryRegistry.bebatStatus;
  const status = total === 0
    ? (explicitStatus || 'not_needed')
    : pending > 0 ? 'pending' : 'registered';
  return { total, registered, pending, notRequired, status };
}

function bebatRowsForProjects(projects = []) {
  const statusRank = { pending: 0, registered: 1, not_required: 2 };
  return (Array.isArray(projects) ? projects : [])
    .flatMap(project => {
      const p = mergeProjectMetadata(project || {});
      const projectId = project && project.id;
      return _batterySerialsForBebat(p).map(serial => {
        const status = serial.bebatStatus || 'pending';
        const projectStatus = project && project.status || p.status || '';
        return {
          projectId,
          projectLabel: getProjectLabel({ ...project, ...p }),
          customerName: project && project.customerName || p.customer.name || '',
          projectStatus,
          projectStatusLabel: getStatusMeta(projectStatus).label,
          serialId: serial.id,
          serial: serial.value || '',
          category: serial.category || null,
          status,
          registeredAt: serial.bebatRegisteredAt || null,
          reference: serial.bebatReference || null,
          uploadedAt: serial.uploadedAt || null,
          source: serial.source || 'manual',
        };
      });
    })
    .sort((a, b) => {
      const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
      if (statusDiff) return statusDiff;
      return String(a.projectLabel || '').localeCompare(String(b.projectLabel || ''), 'nl-BE');
    });
}

function _hasActivity(project, type) {
  return Array.isArray(project && project.activities) && project.activities.some(a => a && a.type === type);
}

function _hasOpenTask(project, type) {
  return Array.isArray(project && project.tasks) && project.tasks.some(t => t && t.type === type && !['done', 'cancelled'].includes(t.status));
}

function _hasCancelledTask(project, type) {
  return Array.isArray(project && project.tasks) && project.tasks.some(t => t && t.type === type && t.status === 'cancelled');
}

function _isActionSuppressed(project, type) {
  return _hasOpenTask(project, type) || _hasCancelledTask(project, type);
}

function _hasEnergyDataForCalculation(project) {
  return !!(
    (project && project.csvUpload && project.csvUpload.dailyCompact) ||
    (project && project.lastCalcRun)
  );
}

const ENERGY_DATA_REQUEST_STATUSES = ['nieuw_contact', 'wachten_op_data', 'klaar_voor_bezoek'];

function _shouldRequestEnergyData(project) {
  const status = (project && project.status) || DEFAULT_STATUS;
  if (!ENERGY_DATA_REQUEST_STATUSES.includes(status)) return false;
  return !_hasEnergyDataForCalculation(project);
}

function _hasAttachedOffer(project) {
  const offres = project && project.offertes;
  if (!offres || typeof offres !== 'object') return false;
  return Object.values(offres).some(entry => entry && (entry.storagePath || entry.downloadUrl || entry.filename));
}

function _shouldSendOfferMail(project) {
  const status = (project && project.status) || DEFAULT_STATUS;
  if (['offerte_uit', 'wacht_op_beslissing', 'akkoord', 'niet_akkoord', 'afgesloten'].includes(status)) return false;
  if (!_hasAttachedOffer(project)) return false;
  return !_hasActivity(project, 'offer_sent');
}

function nextActionsForProject(project) {
  const p = { ...mergeProjectMetadata(project || {}), ...(project || {}) };
  const actions = [];
  const appointmentPlanned = p.status === 'bezoek_gepland' || !!p.planning.visitPlannedDate;
  if (appointmentPlanned && !_hasActivity(p, 'mail_sent') && !_isActionSuppressed(p, 'send_appointment_confirmation')) {
    actions.push({ type: 'send_appointment_confirmation', label: 'Bevestigingsmail afspraak sturen', assignee: 'kevin', priority: 'high' });
  }
  if (_shouldRequestEnergyData(p) && !_isActionSuppressed(p, 'request_energy_data')) {
    actions.push({ type: 'request_energy_data', label: 'MyFluvius/CSV of verbruiksdata opvragen', assignee: 'kevin', priority: 'normal' });
  }
  if (_shouldSendOfferMail(p) && !_isActionSuppressed(p, 'send_offer_mail')) {
    actions.push({ type: 'send_offer_mail', label: 'Offertemail naar klant versturen', assignee: 'kevin', priority: 'high' });
  }
  const bebat = bebatSummaryForProject(p);
  if (bebat.pending > 0 && !_isActionSuppressed(p, 'register_bebat')) {
    actions.push({ type: 'register_bebat', label: `${bebat.pending} batterijserienummer(s) nog Bebat registreren`, assignee: 'ruben', priority: 'high' });
  }
  if (p.status === 'offerte_uit' && !_isActionSuppressed(p, 'follow_up_offer')) {
    actions.push({ type: 'follow_up_offer', label: 'Offerte opvolgen', assignee: 'kevin', priority: 'normal' });
  }
  return actions;
}

function projectTaskRowsForProjects(projects = [], options = {}) {
  const assigneeFilter = options.assignee || 'all';
  const statusRank = { in_progress: 0, open: 1, suggested: 2 };
  const priorityRank = { high: 0, normal: 1, low: 2 };
  const includeSuggested = options.includeSuggested !== false;
  const rows = [];
  for (const project of (Array.isArray(projects) ? projects : [])) {
    if (!project || project.deletedAt) continue;
    const p = { ...mergeProjectMetadata(project), ...project };
    const projectId = project.id;
    const projectLabel = getProjectLabel({ ...project, ...p });
    const customerName = project.customerName || p.customer.name || '';
    const projectStatus = project.status || p.status || '';
    const projectStatusLabel = getStatusMeta(projectStatus).label;

    for (const task of (p.tasks || []).map(normalizeProjectTask)) {
      if (!task.title || ['done', 'cancelled'].includes(task.status)) continue;
      if (assigneeFilter !== 'all' && task.assignee && task.assignee !== assigneeFilter) continue;
      rows.push({
        rowType: 'task',
        projectId,
        projectLabel,
        customerName,
        projectStatus,
        projectStatusLabel,
        taskId: task.id,
        type: task.type,
        title: task.title,
        status: task.status,
        assignee: task.assignee,
        assigneeLabel: assigneeLabel(task.assignee),
        dueDate: task.dueDate || null,
        notes: task.notes || null,
        createdAt: task.createdAt || null,
        updatedAt: task.updatedAt || null,
        source: task.source || 'manual',
        priority: task.priority || 'normal',
      });
    }

    if (includeSuggested) {
      for (const action of nextActionsForProject(p)) {
        if (assigneeFilter !== 'all' && action.assignee !== assigneeFilter) continue;
        rows.push({
          rowType: 'suggested',
          projectId,
          projectLabel,
          customerName,
          projectStatus,
          projectStatusLabel,
          taskId: null,
          type: action.type,
          title: action.label,
          status: 'suggested',
          assignee: action.assignee || null,
          assigneeLabel: assigneeLabel(action.assignee),
          dueDate: null,
          source: 'suggested',
          priority: action.priority || 'normal',
        });
      }
    }
  }
  return rows.sort((a, b) => {
    const dueA = a.dueDate || '9999-12-31';
    const dueB = b.dueDate || '9999-12-31';
    if (dueA !== dueB) return String(dueA).localeCompare(String(dueB), 'nl-BE');
    const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (statusDiff) return statusDiff;
    const priorityDiff = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
    if (priorityDiff) return priorityDiff;
    return String(a.projectLabel || '').localeCompare(String(b.projectLabel || ''), 'nl-BE');
  });
}

// BTW afleidingsregel (single source of truth).
//   houseAgeOver10Years === true  → 6  (woning 10 jaar of ouder)
//   houseAgeOver10Years === false → 21 (jonger dan 10 jaar)
//   null / undefined              → 21 (onbekend → default tarief)
// Een eventueel legacy `calcDefaults.btw` veld wordt genegeerd.
function effectiveBtwFor(project) {
  const m = mergeProjectMetadata(project);
  return m.site.houseAgeOver10Years === true ? 6 : 21;
}

// Sum of powerKw over all solar.inverters entries. Returns 0 if no inverters.
function totalInverterPowerKw(project) {
  const m = mergeProjectMetadata(project);
  return m.solar.inverters.reduce((sum, inv) => sum + (Number(inv.powerKw) || 0), 0);
}

function getStatusMeta(key) {
  return PROJECT_STATUSES.find(s => s.key === key) || { key, label: key, color: '#9aa3b2' };
}

// Label helper: projectName has priority, else customerName, else placeholder.
// Used on dashboard (list/board/drawer), index.html project-banner, and project-edit page title.
function getProjectLabel(project) {
  const pn = (project && project.projectName || '').trim();
  if (pn) return pn;
  const cn = (project && project.customerName || '').trim();
  if (cn) return cn;
  return '(zonder naam)';
}

function _cleanAddressPart(value) {
  return String(value == null ? '' : value).trim();
}

function normalizedAddressStructured(customer) {
  const s = customer && customer.addressStructured && typeof customer.addressStructured === 'object'
    ? customer.addressStructured
    : null;
  if (!s) return null;
  const out = {
    street:      _cleanAddressPart(s.street),
    houseNumber: _cleanAddressPart(s.houseNumber),
    bus:         _cleanAddressPart(s.bus),
    postalCode:  _cleanAddressPart(s.postalCode),
    city:        _cleanAddressPart(s.city),
    countryCode: _cleanAddressPart(s.countryCode || 'BE').toUpperCase(),
    placeId:     _cleanAddressPart(s.placeId),
    provider:    _cleanAddressPart(s.provider),
  };
  const lat = Number(s.lat);
  const lng = Number(s.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    out.lat = lat;
    out.lng = lng;
  }
  return Object.values(out).some(Boolean) ? out : null;
}

function formatStructuredAddress(s) {
  if (!s) return '';
  const number = [s.houseNumber, s.bus ? `bus ${s.bus}` : ''].filter(Boolean).join(' ');
  const line1 = [s.street, number].filter(Boolean).join(' ');
  const line2 = [s.postalCode, s.city].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(', ');
}

function formatCustomerAddress(customer) {
  const structured = normalizedAddressStructured(customer);
  return formatStructuredAddress(structured) || _cleanAddressPart(customer && customer.address);
}

function parseBelgianAddress(address) {
  const raw = _cleanAddressPart(address);
  if (!raw) return { street: '', zipcode: '', city: '', countryCode: 'BE' };
  const zipMatch = raw.match(/\b(\d{4})\b\s*([^,]*)$/);
  if (!zipMatch) return { street: raw, zipcode: '', city: '', countryCode: 'BE' };
  const street = raw.slice(0, zipMatch.index).replace(/[,\s]+$/, '').trim();
  return {
    street: street || raw,
    zipcode: zipMatch[1],
    city: (zipMatch[2] || '').replace(/^[-,\s]+/, '').trim(),
    countryCode: 'BE',
  };
}

function billitAddressForCustomer(customer) {
  const structured = normalizedAddressStructured(customer);
  if (structured) {
    return {
      street: [structured.street, structured.houseNumber, structured.bus ? `bus ${structured.bus}` : ''].filter(Boolean).join(' '),
      zipcode: structured.postalCode,
      city: structured.city,
      countryCode: structured.countryCode || 'BE',
    };
  }
  return parseBelgianAddress(customer && customer.address);
}

function googleMapsUrlForCustomerAddress(customer) {
  const structured = normalizedAddressStructured(customer);
  if (structured && Number.isFinite(structured.lat) && Number.isFinite(structured.lng)) {
    const ll = `${structured.lat},${structured.lng}`;
    const place = structured.placeId ? `&query_place_id=${encodeURIComponent(structured.placeId)}` : '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll)}${place}`;
  }
  const formatted = formatCustomerAddress(customer);
  return formatted ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatted)}` : '';
}

function wazeUrlForCustomerAddress(customer) {
  const structured = normalizedAddressStructured(customer);
  if (structured && Number.isFinite(structured.lat) && Number.isFinite(structured.lng)) {
    return `https://waze.com/ul?ll=${encodeURIComponent(`${structured.lat},${structured.lng}`)}&navigate=yes`;
  }
  const formatted = formatCustomerAddress(customer);
  return formatted ? `https://waze.com/ul?q=${encodeURIComponent(formatted)}&navigate=yes` : '';
}

// ─── INIT ────────────────────────────────────────────────────────────────────
let _firebaseApp = null;
let _firebaseDb  = null;
let _firebaseAuth = null;

function initFirebase() {
  if (_firebaseApp) return _firebaseApp;
  if (typeof firebase === 'undefined') {
    throw new Error('Firebase SDK niet geladen. Controleer of de <script src="https://www.gstatic.com/firebasejs/...firebase-app-compat.js"> tags aanwezig zijn.');
  }
  _firebaseApp  = firebase.initializeApp(FIREBASE_CONFIG);
  _firebaseDb   = _firebaseApp.firestore();
  // Auth SDK is optional — not loaded on public pages (lead.html, lead-result.html)
  if (typeof firebase.auth === 'function') {
    _firebaseAuth = firebase.auth();
  }
  return _firebaseApp;
}

function getDb()   { initFirebase(); return _firebaseDb; }
function getAuth() { initFirebase(); return _firebaseAuth; }

// ─── AUTH ────────────────────────────────────────────────────────────────────
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return getAuth().signInWithPopup(provider);
}

function signOut() {
  return getAuth().signOut();
}

function onAuthStateChanged(cb) {
  return getAuth().onAuthStateChanged(cb);
}

function isWhitelisted(user) {
  if (!user || !user.email) return false;
  return WHITELISTED_EMAILS.includes(user.email);
}

function currentUserEmail() {
  const u = getAuth().currentUser;
  return u && u.email ? u.email : null;
}

// ─── FIRESTORE: PROJECTS COLLECTION ──────────────────────────────────────────
// Document shape — see spec §Data model:
//   { projectName, customerName, status, createdBy, createdAt, updatedAt, deletedAt,
//     csvUpload: null | {...}, lastCalcRun: null | {...} }

function projectsCol() { return getDb().collection('projects'); }
function projectDoc(id) { return projectsCol().doc(id); }

// Create a project. csvData is the optional output of extractCsvForStorage(); pass null
// if no CSV was uploaded at creation. `metadata` is an optional object with any subset
// of the project metadata sections — if omitted, readers fall back via
// mergeProjectMetadata. Returns the new document reference.
async function createProject({ projectName, customerName, status, csvData, metadata }) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const doc = {
    projectName,
    customerName,
    status:     status || DEFAULT_STATUS,
    createdBy:  email,
    createdAt:  now,
    updatedAt:  now,
    deletedAt:  null,
    csvUpload:  csvData ? {
      uploadedAt:  now,
      uploadedBy:  email,
      eanCode:     csvData.eanCode,
      meterNr:     csvData.meterNr,
      meterType:   csvData.meterType,
      dailyCompact: csvData.dailyCompact,
    } : null,
    lastCalcRun: null,
  };
  if (metadata) {
    if (metadata.customer)     doc.customer     = metadata.customer;
    if (metadata.situation !== undefined) doc.situation = metadata.situation;
    if (metadata.notes     !== undefined) doc.notes     = metadata.notes;
    if (metadata.planning)     doc.planning     = metadata.planning;
    if (metadata.site)         doc.site         = metadata.site;
    if (metadata.electrical)   doc.electrical   = metadata.electrical;
    if (metadata.cabinet)      doc.cabinet      = metadata.cabinet;
    if (metadata.solar)        doc.solar        = metadata.solar;
    if (metadata.technical)    doc.technical    = metadata.technical;
    if (metadata.inspection)   doc.inspection   = metadata.inspection;
    if (metadata.supplier)     doc.supplier     = metadata.supplier;
    if (metadata.calcDefaults) doc.calcDefaults = metadata.calcDefaults;
    if (Array.isArray(metadata.activities)) doc.activities = metadata.activities;
    if (Array.isArray(metadata.tasks)) doc.tasks = metadata.tasks;
    if (Array.isArray(metadata.mailLinks)) doc.mailLinks = metadata.mailLinks;
    if (Array.isArray(metadata.filesInbox)) doc.filesInbox = metadata.filesInbox;
    if (metadata.batteryRegistry) doc.batteryRegistry = metadata.batteryRegistry;
    if (Array.isArray(metadata.serialNumbers)) doc.serialNumbers = metadata.serialNumbers;
  }
  return projectsCol().add(doc);
}

// Fetch all non-deleted projects, ordered by updatedAt desc.
async function listActiveProjects() {
  const snap = await projectsCol().where('deletedAt', '==', null).orderBy('updatedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Fetch all deleted projects, ordered by deletedAt desc.
async function listDeletedProjects() {
  const snap = await projectsCol().where('deletedAt', '!=', null).orderBy('deletedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getProject(id) {
  const snap = await projectDoc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function updateProjectStatus(id, status) {
  await projectDoc(id).update({
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Patch a subset of the metadata sections on a project doc. `patch` is an object
// with top-level keys among { site, electrical, cabinet, solar, supplier, calcDefaults,
// projectName, customerName, status }; each value is a partial object for that section.
// Written with {merge:true} so other keys on the same section are preserved.
// updatedAt is always refreshed.
async function updateProjectMetadata(id, patch) {
  const data = { ...patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  await projectDoc(id).set(data, { merge: true });
}

// One-time schema upgrade: replace lastCalcRun.inputs.meerkostMap with
// lastCalcRun.inputs.meerkostLines. Caller checks shape and only invokes
// this when the legacy field is present. Uses doc.update() with dotted-path
// keys so FieldValue.delete() works (set + merge would write a literal
// dotted property name).
async function migrateMeerkostMapToLines(id, meerkostLines) {
  await projectDoc(id).update({
    'lastCalcRun.inputs.meerkostLines': meerkostLines,
    'lastCalcRun.inputs.meerkostMap': firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function softDeleteProject(id) {
  await projectDoc(id).update({
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function restoreProject(id) {
  await projectDoc(id).update({
    deletedAt: null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Permanent (hard) delete — cascades to photos (Storage bytes + Firestore docs),
// comments sub-collection, and the project doc itself. Kan niet ongedaan.
async function hardDeleteProject(id) {
  // Photos: delete bytes + Firestore doc per photo.
  try {
    const photosSnap = await projectDoc(id).collection('photos').get();
    for (const doc of photosSnap.docs) {
      const data = doc.data();
      if (data.storagePath) {
        try { await getStorage().ref(data.storagePath).delete(); }
        catch (e) { console.warn('Storage file delete failed for', data.storagePath, e); }
      }
      if (data.thumbStoragePath) {
        try { await getStorage().ref(data.thumbStoragePath).delete(); }
        catch (e) { console.warn('Thumb delete failed for', data.thumbStoragePath, e); }
      }
      await doc.ref.delete();
    }
  } catch (e) { console.warn('photos cascade failed', e); }

  // Comments.
  try {
    const commentsSnap = await projectDoc(id).collection('comments').get();
    for (const doc of commentsSnap.docs) {
      await doc.ref.delete();
    }
  } catch (e) { console.warn('comments cascade failed', e); }

  // Documents: delete bytes + Firestore doc per document/folder.
  try {
    const documentsSnap = await projectDoc(id).collection('documents').get();
    for (const doc of documentsSnap.docs) {
      const data = doc.data();
      if (data.type === 'file' && data.storagePath) {
        try { await getStorage().ref(data.storagePath).delete(); }
        catch (e) { console.warn('Document storage delete failed for', data.storagePath, e); }
      }
      await doc.ref.delete();
    }
  } catch (e) { console.warn('documents cascade failed', e); }

  // Project doc itself.
  await projectDoc(id).delete();
}

// Replace the project's CSV (used both at first upload AND when replacing an existing CSV).
async function setProjectCsv(id, csvData) {
  const email = currentUserEmail();
  await projectDoc(id).update({
    csvUpload: {
      uploadedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy:  email,
      eanCode:     csvData.eanCode,
      meterNr:     csvData.meterNr,
      meterType:   csvData.meterType,
      dailyCompact: csvData.dailyCompact,
    },
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Save the latest calculation result. `saved` must have `inputs` and `results` keys.
// `results` is the full r-object from _serializeState minus dailyCompact (which lives
// in csvUpload). Caller is responsible for stripping dailyCompact.
// PDF cascade: any config type that was previously selected but is absent from the new
// selectedConfigTypes AND had an offertes entry is purged (Firestore field + Storage blob).
async function saveLastCalcRun(projectId, saved) {
  if (!projectId || !saved) throw new Error('saveLastCalcRun: projectId + saved vereist');

  const ref  = projectDoc(projectId);
  const snap = await ref.get();
  const data = snap.data() || {};

  const inputs  = saved.inputs  || {};
  const results = saved.results || {};

  // Build the lastCalcRun payload.
  const lastCalcRun = {
    calculatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    calculatedBy: currentUserEmail() || 'unknown',
    inputs,
    results,
  };

  // Determine which previously-selected types that hold a PDF are NOT in the new set.
  const prevSelected = (data.lastCalcRun && data.lastCalcRun.inputs &&
                        Array.isArray(data.lastCalcRun.inputs.selectedConfigTypes))
    ? data.lastCalcRun.inputs.selectedConfigTypes : [];
  const newSelected  = Array.isArray(inputs.selectedConfigTypes)
    ? inputs.selectedConfigTypes : [];
  const offertes     = data.offertes || {};
  const removedWithPdf = prevSelected.filter(t =>
    !newSelected.includes(t) && offertes[t] && offertes[t].storagePath);

  // Firestore update: lastCalcRun + updatedAt + PDF cascade field-deletes.
  const update = {
    lastCalcRun,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  // Persist manual config definitions (full replace — always reflect current state).
  if (saved.manualConfigs && Object.keys(saved.manualConfigs).length > 0) {
    update.manualConfigs = saved.manualConfigs;
  } else {
    // Clear any previous manual configs if none are selected anymore.
    update.manualConfigs = firebase.firestore.FieldValue.delete();
  }

  for (const t of removedWithPdf) {
    update[`offertes.${t}`] = firebase.firestore.FieldValue.delete();
  }

  // Also clean up manualConfigs entries for removed manual types.
  const removedManual = prevSelected.filter(t =>
    !newSelected.includes(t) && isManualConfig(t));
  for (const t of removedManual) {
    update[`manualConfigs.${t}`] = firebase.firestore.FieldValue.delete();
  }

  await ref.update(update);

  // Best-effort Storage blob cleanup for cascaded PDFs.
  for (const t of removedWithPdf) {
    try { await getStorage().ref(offertes[t].storagePath).delete(); }
    catch (e) { console.warn(`Offerte blob (${t}) verwijderen mislukt`, e); }
  }
}

// ─── PRODUCT-SHEET CONFIG ────────────────────────────────────────────────────
// Reads the Firestore doc that holds the product sheet CSV URL. Requires the
// user to be authenticated + whitelisted (enforced by Firestore rules).
async function getProductsConfig() {
  const snap = await getDb().collection('config').doc('products').get();
  if (!snap.exists) {
    throw new Error('Product-configuratie niet gevonden in Firestore (config/products).');
  }
  return snap.data();
}

// ─── SHARES (customer-facing read-only snapshots) ────────────────────────────
// Each share doc holds a full v:5 state payload (inputs + results + dailyCompact).
// Firestore rules: bearer-link read until expiresAt, write = isWhitelisted().
const SHARE_LINK_TTL_DAYS = 180;
const LEAD_RESULT_TTL_DAYS = 30;

function futureTimestamp(days) {
  return firebase.firestore.Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

async function createShare(payload, projectId) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd — alleen ingelogde gebruikers mogen deellinks maken.');
  const doc = {
    payload:    payload,
    projectId:  projectId || null,
    createdBy:  email,
    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    expiresAt:  futureTimestamp(SHARE_LINK_TTL_DAYS),
  };
  return getDb().collection('shares').add(doc);
}

async function getShare(id) {
  const snap = await getDb().collection('shares').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

// ─── COMMENTS (per-project thread Kevin ↔ Ruben) ─────────────────────────────
async function listComments(projectId) {
  const snap = await projectDoc(projectId).collection('comments').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function addComment(projectId, text) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Lege opmerking.');
  if (trimmed.length > 4000) throw new Error('Opmerking te lang (max 4000 tekens).');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const batch = getDb().batch();
  const commentRef = projectDoc(projectId).collection('comments').doc();
  batch.set(commentRef, { author: email, text: trimmed, createdAt: now });
  // Bump lastCommentAt AND the poster's own readState — so the poster's own
  // post never shows as "unread" to themselves.
  batch.update(projectDoc(projectId), {
    lastCommentAt: now,
    [`readStates.${email}`]: now,
    updatedAt: now,
  });
  await batch.commit();
  return commentRef.id;
}

async function markCommentsRead(projectId) {
  const email = currentUserEmail();
  if (!email) return;
  await projectDoc(projectId).update({
    [`readStates.${email}`]: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// True iff the project has any comments at all (regardless of read-state).
function hasAnyComments(project) {
  return !!(project && project.lastCommentAt);
}

// True iff the project has a lastCommentAt newer than the current user's readState.
function hasUnreadComments(project, email) {
  if (!project || !project.lastCommentAt) return false;
  if (!email) return false;
  const rs = (project.readStates || {})[email];
  if (!rs) return true;
  const lca = project.lastCommentAt.toMillis ? project.lastCommentAt.toMillis() : 0;
  const rsm = rs.toMillis ? rs.toMillis() : 0;
  return lca > rsm;
}

// ─── GROUND-FAULT WARNING PREDICATE ──────────────────────────────────────────
function isMarstekConfig(type) { return typeof type === 'string' && type.startsWith('MARVE'); }
function isZendureConfig(type) { return typeof type === 'string' && type.startsWith('ZSF'); }
function isProductConfig(type) { return typeof type === 'string' && type.startsWith('PC_'); }
function isSupportedConfig(type) { return isMarstekConfig(type) || isZendureConfig(type); }
function isManualConfig(type) { return typeof type === 'string' && type.startsWith('MANUAL_'); }
function isGroundFaultIgnoredConfig(type) { return isManualConfig(type) || isProductConfig(type); }

// Returns: false (no warning), 'no-measurement' (warning), 'unsupported' (error)
function groundFaultStatus(project) {
  const lcr = project && project.lastCalcRun;
  if (!lcr) return false;
  const types = (lcr.inputs && lcr.inputs.selectedConfigTypes) || [];
  const groundFaultTypes = types.filter(t => !isGroundFaultIgnoredConfig(t));
  if (groundFaultTypes.length === 0) return false;
  // Error: legacy config that's neither Zendure nor Marstek. Product-config and
  // manual calculator configs are intentionally ignored here: their brand is
  // resolved through the composer/product data, so they must not show the old
  // "geen ondersteunde Zendure/Marstek" dashboard warning.
  if (groundFaultTypes.some(t => !isSupportedConfig(t))) return 'unsupported';
  // Warning: measurement not yet performed
  const m = mergeProjectMetadata(project);
  const v = m.cabinet.lineGroundChecked;
  const phaseGroundValues = m.technical && m.technical.voltageMeasurements
    ? [m.technical.voltageMeasurements.l1Pe, m.technical.voltageMeasurements.l2Pe, m.technical.voltageMeasurements.l3Pe]
    : [];
  const hasExactPhaseGroundMeasurement = phaseGroundValues.some(value => Number(value) > 0);
  // Legacy compat: old projects stored true (checkbox era) → treat as 'under30'
  if (v === true) return false;
  if (hasExactPhaseGroundMeasurement) return false;
  if (v !== 'under30' && v !== 'over30') return 'no-measurement';
  return false;
}

// Legacy compat — old code that calls needsGroundFaultCheck still works
function needsGroundFaultCheck(project) { return groundFaultStatus(project) !== false; }

// ─── PHOTOS (Firebase Storage + Firestore metadata) ──────────────────────────

// ─── Client-side thumbnail generation ──
// HEIC/HEIF support: <img> can't decode these on Android Chrome or iOS Safari,
// so we convert via heic2any (libheif WASM, loaded from cdnjs in dashboard.html
// and project-edit.html). Wrapped in a 90s timeout because some Samsung HEIF
// variants can hang the decoder indefinitely.
//
// `onStep` is an optional progress callback so callers can surface what's
// happening to the user (the conversion can take ~5-15s for a 6MP HEIC).
async function _heicToJpegIfNeeded(file, onStep) {
  if (!(file instanceof Blob)) return file;
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const isHeic = /heic|heif/.test(type) || /\.(heic|heif)$/i.test(name);
  if (!isHeic) return file;
  console.log('[heic] detected:', { name: file.name, type: file.type, size: file.size });
  if (typeof onStep === 'function') onStep('Foto converteren (HEIC → JPEG)…');

  if (typeof window === 'undefined' || typeof window.heic2any !== 'function') {
    throw new Error('HEIC/HEIF foto gedetecteerd, maar heic2any is niet geladen.');
  }

  const TIMEOUT_MS = 90_000;
  const startedAt = Date.now();
  const conversion = window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  const timeout = new Promise((_, rej) => setTimeout(
    () => rej(new Error(`HEIC conversie timeout na ${TIMEOUT_MS / 1000}s — bestand mogelijk te groot of niet-ondersteunde variant.`)),
    TIMEOUT_MS,
  ));
  const out = await Promise.race([conversion, timeout]);
  console.log('[heic] heic2any done in', Date.now() - startedAt, 'ms');
  return Array.isArray(out) ? out[0] : out;
}

// Accepts a File/Blob (new upload) or HTMLImageElement (backfill).
// Returns { blob: Blob, width: number, height: number }.
//
// Decode strategy:
//   - Blob source → createImageBitmap (handles JPEG/PNG/WEBP/GIF reliably;
//     more forgiving than <img>.decode() for outputs from libheif/heic2any
//     which sometimes emit JPEGs <img> refuses to parse).
//   - HTMLImageElement source → keep the <img>.decode() path (legacy backfill).
async function makeThumbnail(source) {
  return _resizeToJpeg(source, 400, 0.82);
}

async function _resizeToJpeg(source, MAX_SIDE, QUALITY) {

  if (source instanceof Blob) source = await _heicToJpegIfNeeded(source);

  let drawable;             // ImageBitmap or HTMLImageElement
  let naturalWidth, naturalHeight;
  let cleanup = () => {};

  if (source instanceof HTMLImageElement) {
    if (!source.complete || source.naturalWidth === 0) {
      try { await source.decode(); }
      catch (e) { throw new Error('Afbeelding kon niet geladen worden: ' + (e && e.message ? e.message : e), { cause: e }); }
    }
    drawable = source;
    naturalWidth  = source.naturalWidth;
    naturalHeight = source.naturalHeight;
  } else if (source instanceof Blob) {
    const decoded = await _decodeBlobForCanvas(source);
    drawable = decoded.drawable;
    naturalWidth = decoded.width;
    naturalHeight = decoded.height;
    cleanup = decoded.cleanup;
  } else {
    throw new Error('makeThumbnail: source moet File/Blob of HTMLImageElement zijn');
  }

  if (!naturalWidth || !naturalHeight) {
    cleanup();
    throw new Error('Afbeelding heeft geen geldige afmetingen');
  }

  const longest = Math.max(naturalWidth, naturalHeight);
  const scale   = longest > MAX_SIDE ? MAX_SIDE / longest : 1;
  const canvas  = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(naturalWidth  * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) { cleanup(); throw new Error('Canvas 2D context niet beschikbaar'); }
  ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY));
  cleanup();
  if (!blob) throw new Error('Thumbnail-aanmaak mislukt (canvas.toBlob)');
  return { blob, width: naturalWidth, height: naturalHeight };
}

async function _decodeBlobForCanvas(blob) {
  if (blob.size === 0) throw new Error('Decoder-output is leeg (0 bytes).');

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => { if (typeof bitmap.close === 'function') bitmap.close(); },
      };
    } catch (bitmapErr) {
      console.warn('[image-decode] createImageBitmap failed, falling back to <img>:', bitmapErr);
    }
  }

  return _decodeBlobViaImageElement(blob);
}

async function _decodeBlobViaImageElement(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;

  try {
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    }
  } catch (imgErr) {
    URL.revokeObjectURL(url);
    throw new Error('Kan afbeelding niet decoderen: ' + (imgErr && imgErr.message ? imgErr.message : imgErr), { cause: imgErr });
  }

  return {
    drawable: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function getStorage() {
  initFirebase();
  if (typeof firebase.storage !== 'function') {
    throw new Error('Firebase Storage SDK niet geladen.');
  }
  return firebase.storage();
}

// Uploads a full image + a generated thumbnail in parallel, then writes
// a single Firestore photo-doc.  Defaults tag='situatie' (user may change
// later via the tag-modal).
async function uploadProjectPhotoWithThumb(projectId, file, opts = {}) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  if (!file) throw new Error('Geen bestand.');
  const onStep = typeof opts.onStep === 'function' ? opts.onStep : () => {};

  console.log('[upload] start', { name: file.name, type: file.type, size: file.size });

  // ── Step 1 — HEIC/HEIF → JPEG conversion (no-op for already-JPEG/PNG/etc.) ─
  let workFile = file;
  let workName = file.name || 'photo';
  let workType = file.type || 'image/jpeg';
  try {
    const converted = await _heicToJpegIfNeeded(file, onStep);
    if (converted !== file) {
      workFile = converted;
      workName = workName.replace(/\.(heic|heif)$/i, '.jpg');
      if (!/\.jpe?g$/i.test(workName)) workName += '.jpg';
      workType = 'image/jpeg';
      console.log('[upload] converted to JPEG:', workFile.size, 'bytes');
    }
  } catch (e) {
    throw new Error('Stap 1 (HEIC conversie) mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  if (!workType.startsWith('image/')) throw new Error('Alleen afbeeldingen.');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (workFile.size > MAX_BYTES) throw new Error('Te groot (max 15 MB).');
  const allowedPhotoTags = new Set([
    'situatie', // legacy alias
    'situation_before',
    'inverter_before',
    'situation_after',
    'equipment_after',
    'electrical_cabinet',
    'meter_cabinet',
    'serial',
    'inspection',
    'other',
  ]);
  const tag = allowedPhotoTags.has(opts.tag) ? opts.tag : 'situation_before';
  console.log('[upload] post-conversion size:', workFile.size, 'bytes', '(type:', workType + ')');

  // ── Step 2a — keep the full/original upload unchanged ──────────────────
  // The full photo is used in the lightbox and closing dossier; keep the
  // source-resolution file instead of resizing/re-encoding it. HEIC/HEIF may
  // already have been converted to JPEG above for browser compatibility.
  onStep('Originele foto voorbereiden…');
  const originalForUpload = workFile;
  const originalContentType = workType || originalForUpload.type || 'image/jpeg';
  let originalDims;
  try {
    const decoded = await _decodeBlobForCanvas(originalForUpload);
    originalDims = { width: decoded.width, height: decoded.height };
    decoded.cleanup();
  } catch (e) { throw new Error('Stap 2a (originele foto lezen) mislukt: ' + (e && e.message ? e.message : e), { cause: e }); }
  console.log('[upload] original kept:', originalDims.width, 'x', originalDims.height, '/', originalForUpload.size, 'bytes', '(type:', originalContentType + ')');

  const safeName     = workName.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const safeStripped = safeName.replace(/\.[^.]+$/, '') || 'photo';
  const ts           = Date.now();
  const fullPath     = `projects/${projectId}/${ts}_${safeName}`;
  const thumbPath    = `projects/${projectId}/${ts}_${safeStripped}_thumb.jpg`;

  // ── Step 2b — thumbnail (400px max, JPEG q=0.82) ────────────────────────
  onStep('Thumbnail genereren…');
  let thumb;
  try { thumb = await makeThumbnail(originalForUpload); }
  catch (e) { throw new Error('Stap 2b (thumbnail) mislukt: ' + (e && e.message ? e.message : e), { cause: e }); }
  console.log('[upload] thumb created:', thumb.width, 'x', thumb.height, '/', thumb.blob.size, 'bytes');

  // ── Step 3 — parallel storage upload with combined progress + timeout ──
  onStep('Foto uploaden…');
  const storage = getStorage();
  // Track both uploads' percentages so the label always reflects both, not
  // just whichever finished most recently (thumb completes ~instantly while
  // full can take a minute on mobile 4G).
  const pcts = { full: 0, thumb: 0 };
  const renderProgress = () => onStep(`Foto uploaden (full ${pcts.full}% · thumb ${pcts.thumb}%)…`);
  const putWithProgress = (path, blob, contentType, label, timeoutMs) => new Promise((resolve, reject) => {
    const task = storage.ref(path).put(blob, { contentType });
    const timeout = setTimeout(() => {
      task.cancel();
      reject(new Error(`Storage upload ${label} timeout na ${timeoutMs / 1000}s (op ${pcts[label]}%).`));
    }, timeoutMs);
    task.on('state_changed',
      (snap) => {
        const pct = snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        pcts[label] = pct;
        renderProgress();
        console.log(`[upload] ${label} ${pct}% (${snap.bytesTransferred}/${snap.totalBytes})`);
      },
      (err) => { clearTimeout(timeout); reject(err); },
      ()    => { clearTimeout(timeout); pcts[label] = 100; renderProgress(); resolve(); },
    );
  });
  try {
    await Promise.all([
      // Full/original keeps the uploaded file unchanged; only the thumb is a small JPEG.
      putWithProgress(fullPath,  originalForUpload, originalContentType, 'full',  120_000),
      putWithProgress(thumbPath, thumb.blob,         'image/jpeg',        'thumb', 30_000),
    ]);
  } catch (e) {
    // best-effort cleanup of whichever blob(s) landed
    try { await storage.ref(fullPath).delete();  } catch (_) { /* best-effort */ }
    try { await storage.ref(thumbPath).delete(); } catch (_) { /* best-effort */ }
    throw new Error('Stap 3 (Storage upload) mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }
  console.log('[upload] storage done');
  onStep('Metadata opslaan…');

  // Step C — Firestore metadata
  let ref;
  try {
    ref = await projectDoc(projectId).collection('photos').add({
      storagePath:      fullPath,
      thumbStoragePath: thumbPath,
      name:             workName,
      contentType:      originalContentType,
      sizeBytes:        originalForUpload.size,
      width:            originalDims.width,
      height:           originalDims.height,
      tag,
      includeInCloseoutPdf: tag !== 'other',
      includeInInspectionPack: ['situation_after', 'equipment_after', 'electrical_cabinet', 'meter_cabinet', 'serial', 'inspection'].includes(tag),
      uploadedAt:       firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy:       email,
    });
  } catch (e) {
    try { await storage.ref(fullPath).delete();  } catch (_) { /* best-effort */ }
    try { await storage.ref(thumbPath).delete(); } catch (_) { /* best-effort */ }
    throw new Error('Firestore metadata schrijven mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  // updatedAt is cosmetic — don't roll back blobs if this fails
  try {
    await projectDoc(projectId).update({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('updatedAt update mislukt (niet fataal):', e);
  }

  // Return the doc-id plus the thumb blob so callers can reuse it for a local
  // preview without re-running the (expensive) HEIC→JPEG conversion.
  return { id: ref.id, thumbBlob: thumb.blob, displayName: workName };
}

// Lazily generates + uploads a thumbnail for a legacy photo that only has
// a full-resolution blob.  Returns the new thumbStoragePath or null on no-op.
// Throws on fatal errors so callers can decide how to surface them.
async function backfillThumbnail(projectId, photoDoc) {
  if (!photoDoc || !photoDoc.id || !photoDoc.storagePath) return null;
  if (photoDoc.thumbStoragePath) return null; // already done

  const storage = getStorage();
  const fullUrl = photoDoc.downloadUrl
    || await storage.ref(photoDoc.storagePath).getDownloadURL();

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = fullUrl;
  try { await img.decode(); }
  catch (e) { throw new Error('Backfill: image decode mislukt: ' + (e && e.message ? e.message : e), { cause: e }); }

  const { blob, width, height } = await makeThumbnail(img);

  // Derive thumb path from full path.
  // Full looks like: projects/<pid>/<ts>_<safeName>
  // Thumb target:    projects/<pid>/<ts>_<safeStripped>_thumb.jpg
  let thumbPath;
  const m = /^(.*\/)([^/]+)$/.exec(photoDoc.storagePath);
  if (m) {
    const dir  = m[1];
    const base = m[2];
    const stripped = base.replace(/\.[^.]+$/, '') || 'photo';
    thumbPath = `${dir}${stripped}_thumb.jpg`;
  } else {
    thumbPath = photoDoc.storagePath.replace(/\.[^.]+$/, '') + '_thumb.jpg';
  }

  await storage.ref(thumbPath).put(blob, { contentType: 'image/jpeg' });
  await projectDoc(projectId).collection('photos').doc(photoDoc.id).update({
    thumbStoragePath: thumbPath,
    width,
    height,
  });

  return thumbPath;
}

async function saveProjectPhotoAnnotation(projectId, photoDoc, annotationBlob, annotatedThumbBlob) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  if (!photoDoc || !photoDoc.id) throw new Error('Foto ontbreekt.');
  if (!(annotationBlob instanceof Blob)) throw new Error('Aantekening ontbreekt.');
  if (!(annotatedThumbBlob instanceof Blob)) throw new Error('Aantekening-thumbnail ontbreekt.');

  const storage = getStorage();
  const basePath = `projects/${projectId}/annotations/${photoDoc.id}`;
  const annotationPath = `${basePath}_annotation.png`;
  const annotatedThumbPath = `${basePath}_annotated_thumb.jpg`;

  try {
    await Promise.all([
      storage.ref(annotationPath).put(annotationBlob, { contentType: 'image/png' }),
      storage.ref(annotatedThumbPath).put(annotatedThumbBlob, { contentType: 'image/jpeg' }),
    ]);

    await projectDoc(projectId).collection('photos').doc(photoDoc.id).update({
      annotationStoragePath: annotationPath,
      annotatedThumbStoragePath: annotatedThumbPath,
      annotationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      annotationUpdatedBy: email,
    });
  } catch (e) {
    try { await storage.ref(annotationPath).delete(); } catch (_) { /* best-effort */ }
    try { await storage.ref(annotatedThumbPath).delete(); } catch (_) { /* best-effort */ }
    throw e;
  }

  return { annotationStoragePath: annotationPath, annotatedThumbStoragePath: annotatedThumbPath };
}

async function deleteProjectPhotoAnnotation(projectId, photoDoc) {
  if (!photoDoc || !photoDoc.id) throw new Error('Foto ontbreekt.');
  const storage = getStorage();
  const deletes = [];
  if (photoDoc.annotationStoragePath) deletes.push(storage.ref(photoDoc.annotationStoragePath).delete());
  if (photoDoc.annotatedThumbStoragePath) deletes.push(storage.ref(photoDoc.annotatedThumbStoragePath).delete());
  await Promise.all(deletes.map(p => p.catch(e => console.warn('Aantekening-blob verwijderen mislukt', e))));
  await projectDoc(projectId).collection('photos').doc(photoDoc.id).update({
    annotationStoragePath: firebase.firestore.FieldValue.delete(),
    annotatedThumbStoragePath: firebase.firestore.FieldValue.delete(),
    annotationUpdatedAt: firebase.firestore.FieldValue.delete(),
    annotationUpdatedBy: firebase.firestore.FieldValue.delete(),
  });
}

async function listProjectPhotos(projectId) {
  const snap = await projectDoc(projectId).collection('photos').orderBy('uploadedAt', 'desc').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await Promise.all(docs.map(async d => {
    // Full-size URL (always needed for lightbox)
    try { d.downloadUrl = await getStorage().ref(d.storagePath).getDownloadURL(); }
    catch (e) { d.downloadUrl = null; d.fetchError = e && e.message ? e.message : String(e); }
    // Thumb URL (may be absent on legacy docs)
    if (d.thumbStoragePath) {
      try { d.thumbUrl = await getStorage().ref(d.thumbStoragePath).getDownloadURL(); }
      catch (e) { d.thumbUrl = null; /* will fall back to downloadUrl in the UI */ }
    } else {
      d.thumbUrl = null;
    }
    if (d.annotationStoragePath) {
      try { d.annotationUrl = await getStorage().ref(d.annotationStoragePath).getDownloadURL(); }
      catch (e) { d.annotationUrl = null; }
    } else {
      d.annotationUrl = null;
    }
    if (d.annotatedThumbStoragePath) {
      try { d.annotatedThumbUrl = await getStorage().ref(d.annotatedThumbStoragePath).getDownloadURL(); }
      catch (e) { d.annotatedThumbUrl = null; }
    } else {
      d.annotatedThumbUrl = null;
    }
    // Defaults for legacy docs
    if (!d.tag) d.tag = 'situatie'; // legacy default, rendered as situation_before in UI
  }));
  return docs;
}

async function deleteProjectPhoto(projectId, photoId, storagePath, thumbStoragePath, opts = {}) {
  if (opts.preserveSerial) {
    const pRef = projectDoc(projectId);
    await firebase.firestore().runTransaction(async (txn) => {
      const snap = await txn.get(pRef);
      const list = snap.exists && Array.isArray(snap.data().serialNumbers) ? snap.data().serialNumbers : [];
      const next = list.map(entry => {
        if (!entry || entry.photoId !== photoId) return entry;
        const { photoId: _photoId, ocrStatus: _ocrStatus, ...rest } = entry;
        return { ...rest, source: entry.source === 'ocr' ? 'manual' : entry.source };
      });
      txn.update(pRef, {
        serialNumbers: next,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      txn.update(pRef.collection('photos').doc(photoId), {
        preserveSerialEntry: true,
      });
    });
  }
  await projectDoc(projectId).collection('photos').doc(photoId).delete();
  try { await getStorage().ref(storagePath).delete(); }
  catch (e) { console.warn('Storage full-blob verwijderen mislukt', e); }
  if (thumbStoragePath) {
    try { await getStorage().ref(thumbStoragePath).delete(); }
    catch (e) { console.warn('Storage thumb-blob verwijderen mislukt', e); }
  }
  if (opts.annotationStoragePath) {
    try { await getStorage().ref(opts.annotationStoragePath).delete(); }
    catch (e) { console.warn('Storage annotation-blob verwijderen mislukt', e); }
  }
  if (opts.annotatedThumbStoragePath) {
    try { await getStorage().ref(opts.annotatedThumbStoragePath).delete(); }
    catch (e) { console.warn('Storage annotated-thumb-blob verwijderen mislukt', e); }
  }
}

/**
 * Reset a serial-tagged photo back to ocrStatus=null so the Cloud Function
 * `ocrSerial` re-fires. Used by the "Re-run OCR" knop in the serial-list UI.
 */
async function requestPhotoOcrRerun(projectId, photoId) {
  const db = firebase.firestore();
  await db.collection('projects').doc(projectId)
    .collection('photos').doc(photoId)
    .update({ ocrStatus: null, ocrError: firebase.firestore.FieldValue.delete() });
}

/**
 * Atomically write the serial-tag fields onto a photo-doc. Used by the
 * tag-modal save handler indirectly (the photo-uploader uses a WriteBatch
 * for multi-photo saves; this helper is for single-photo flows / future
 * retag UX).
 */
async function updateProjectPhotoTag(projectId, photoId, tag, serialCategory) {
  const db = firebase.firestore();
  const allowedPhotoTags = new Set([
    'situation_before',
    'inverter_before',
    'situation_after',
    'equipment_after',
    'electrical_cabinet',
    'meter_cabinet',
    'serial',
    'inspection',
    'other',
  ]);
  const aliases = {
    situatie: 'situation_before',
  };
  const normalizedTag = allowedPhotoTags.has(tag) ? tag : (aliases[tag] || 'situation_before');
  const flags = {
    includeInCloseoutPdf: normalizedTag !== 'other',
    includeInInspectionPack: ['situation_after', 'equipment_after', 'electrical_cabinet', 'meter_cabinet', 'serial', 'inspection'].includes(normalizedTag),
  };
  const data = {
    tag: normalizedTag,
    ...flags,
  };
  if (normalizedTag === 'serial') {
    const serialAliases = {
      batterij: 'battery',
      omvormer: 'inverter',
      omvormer_batterij: 'battery_inverter',
    };
    data.serialCategory = serialAliases[serialCategory] || serialCategory || 'battery';
    data.ocrStatus = 'pending';
  } else {
    data.serialCategory = firebase.firestore.FieldValue.delete();
    data.ocrStatus = firebase.firestore.FieldValue.delete();
    data.ocrError = firebase.firestore.FieldValue.delete();
  }
  await db.collection('projects').doc(projectId)
    .collection('photos').doc(photoId)
    .update(data);
  try {
    await projectDoc(projectId).update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.warn('project updatedAt na foto-tag update mislukt (niet fataal):', e);
  }
}

async function setPhotoSerialTag(projectId, photoId, category) {
  await updateProjectPhotoTag(projectId, photoId, 'serial', category);
}

// ─── PROJECT DOCUMENTS (Explorer-style folders + files) ─────────────────────

function projectDocumentsCol(projectId) {
  return projectDoc(projectId).collection('documents');
}

function cleanDocumentTitle(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function sanitizeStorageName(name) {
  return String(name || 'document').replace(/[^\w.-]+/g, '_').slice(0, 120) || 'document';
}

async function createProjectDocumentFolder(projectId, meta = {}) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const ref = await projectDocumentsCol(projectId).add({
    type: 'folder',
    parentId: meta.parentId || null,
    title: cleanDocumentTitle(meta.title, 'Nieuwe map'),
    description: String(meta.description || '').trim(),
    createdAt: now,
    updatedAt: now,
    createdBy: email,
    updatedBy: email,
  });
  await projectDoc(projectId).update({ updatedAt: now });
  return { id: ref.id };
}

async function uploadProjectDocument(projectId, file, meta = {}) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  if (!file) throw new Error('Geen bestand opgegeven');
  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error('Bestand is groter dan 25 MB');

  const safeName = sanitizeStorageName(file.name);
  const ts = Date.now();
  const storagePath = `projects/${projectId}/documents/${ts}_${safeName}`;
  const contentType = file.type || 'application/octet-stream';

  try {
    await getStorage().ref(storagePath).put(file, { contentType });
  } catch (e) {
    throw new Error('Storage upload mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  const now = firebase.firestore.FieldValue.serverTimestamp();
  let ref;
  try {
    ref = await projectDocumentsCol(projectId).add({
      type: 'file',
      parentId: meta.parentId || null,
      title: cleanDocumentTitle(meta.title, file.name || 'Document'),
      description: String(meta.description || '').trim(),
      storagePath,
      name: file.name || safeName,
      contentType,
      sizeBytes: file.size || 0,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      uploadedBy: email,
      documentKind: String(meta.documentKind || 'other').trim() || 'other',
      includeInCloseoutPdf: !!meta.includeInCloseoutPdf,
      includeInInspectionPack: !!meta.includeInInspectionPack,
      createdBy: email,
      updatedBy: email,
    });
  } catch (e) {
    try { await getStorage().ref(storagePath).delete(); } catch (_) { /* best-effort */ }
    throw new Error('Firestore metadata schrijven mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  await projectDoc(projectId).update({ updatedAt: now });
  return { id: ref.id, storagePath };
}

async function listProjectDocuments(projectId) {
  const snap = await projectDocumentsCol(projectId).orderBy('createdAt', 'asc').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await Promise.all(docs.map(async d => {
    if (d.type === 'file' && d.storagePath) {
      try { d.downloadUrl = await getStorage().ref(d.storagePath).getDownloadURL(); }
      catch (e) { d.downloadUrl = null; d.fetchError = e && e.message ? e.message : String(e); }
    }
  }));
  return docs;
}

async function updateProjectDocument(projectId, documentId, patch = {}) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const data = {
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  };
  if ('title' in patch) data.title = cleanDocumentTitle(patch.title, 'Document');
  if ('description' in patch) data.description = String(patch.description || '').trim();
  if ('documentKind' in patch) data.documentKind = String(patch.documentKind || 'other').trim() || 'other';
  if ('includeInCloseoutPdf' in patch) data.includeInCloseoutPdf = !!patch.includeInCloseoutPdf;
  if ('includeInInspectionPack' in patch) data.includeInInspectionPack = !!patch.includeInInspectionPack;
  await projectDocumentsCol(projectId).doc(documentId).update(data);
}

async function moveProjectDocument(projectId, documentId, parentId) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  await projectDocumentsCol(projectId).doc(documentId).update({
    parentId: parentId || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  });
}

async function deleteProjectDocument(projectId, documentId) {
  const docs = await listProjectDocuments(projectId);
  const byParent = new Map();
  docs.forEach(doc => {
    const key = doc.parentId || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(doc);
  });
  const toDelete = [];
  const collect = (id) => {
    const doc = docs.find(entry => entry.id === id);
    if (!doc) return;
    toDelete.push(doc);
    (byParent.get(id) || []).forEach(child => collect(child.id));
  };
  collect(documentId);

  for (const doc of toDelete) {
    if (doc.type === 'file' && doc.storagePath) {
      try { await getStorage().ref(doc.storagePath).delete(); }
      catch (e) { console.warn('Document blob verwijderen mislukt', e); }
    }
  }

  const batch = getDb().batch();
  toDelete.forEach(doc => batch.delete(projectDocumentsCol(projectId).doc(doc.id)));
  await batch.commit();
  await projectDoc(projectId).update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// ─── OFFERTES (per-config PDF upload) ────────────────────────────────────────

async function uploadProjectOfferte(projectId, configType, file, extraMetadata = {}) {
  if (!file) throw new Error('Geen bestand opgegeven');
  if (file.type !== 'application/pdf') throw new Error('Enkel PDF-bestanden worden aanvaard');
  if (file.size > 10 * 1024 * 1024) throw new Error('PDF is groter dan 10 MB');

  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Niet ingelogd');

  const ts = Date.now();
  const safeType = String(configType).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `projects/${projectId}/offertes/${safeType}_${ts}.pdf`;

  // Haal eventueel bestaande blob op om te deleten na succesvolle upload.
  const projRef = getDb().collection('projects').doc(projectId);
  const projSnap = await projRef.get();
  const existing = (projSnap.data() || {}).offertes || {};
  const oldEntry = existing[configType];

  // Upload nieuwe blob.
  const ref = getStorage().ref(storagePath);
  await ref.put(file, { contentType: 'application/pdf' });

  const metadata = {
    ...extraMetadata,
    storagePath,
    filename:    file.name,
    sizeBytes:   file.size,
    contentType: 'application/pdf',
    uploadedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    uploadedBy:  user.email || null
  };

  // Firestore swap.
  await projRef.update({
    [`offertes.${configType}`]: metadata,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Oude blob verwijderen (na succesvolle Firestore-swap zodat crash midden-in de nieuwe PDF niet weggooit).
  if (oldEntry && oldEntry.storagePath && oldEntry.storagePath !== storagePath) {
    try {
      await getStorage().ref(oldEntry.storagePath).delete();
    } catch (err) {
      console.warn('Vorige offerte blob niet gevonden of delete-fout:', err);
    }
  }

  return metadata;
}

async function deleteProjectOfferte(projectId, configType) {
  const projRef = getDb().collection('projects').doc(projectId);
  const projSnap = await projRef.get();
  const existing = (projSnap.data() || {}).offertes || {};
  const entry = existing[configType];
  if (!entry) return;

  try {
    if (entry.storagePath) await getStorage().ref(entry.storagePath).delete();
  } catch (err) {
    console.warn('Storage delete faalde (blob mogelijk al weg):', err);
  }

  await projRef.update({
    [`offertes.${configType}`]: firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ─── Cascade-delete a config (NEW single source of truth) ───────────────────
// Removes the type from lastCalcRun.inputs.selectedConfigTypes AND strips the
// deleted type's slice from lastCalcRun.results (configResults + avgTotals.scenarios
// are positionally per-config; others like monthMap/capAnalysis are CSV-global
// and stay valid). Also deletes the offertes[type] field and Storage blob.
// Keeping the results coherent means the calc view won't re-render a stale
// scenario card on next load.
async function deleteProjectConfig(projectId, type) {
  if (!projectId || !type) throw new Error('deleteProjectConfig: projectId + type vereist');
  const ref  = projectDoc(projectId);
  const snap = await ref.get();
  const data = snap.data() || {};
  const types = (data.lastCalcRun && data.lastCalcRun.inputs && Array.isArray(data.lastCalcRun.inputs.selectedConfigTypes))
    ? data.lastCalcRun.inputs.selectedConfigTypes.filter(t => t !== type)
    : [];
  const pdfPath = data.offertes && data.offertes[type] && data.offertes[type].storagePath;

  const updates = {
    'lastCalcRun.inputs.selectedConfigTypes': types,
    [`offertes.${type}`]: firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  // Also remove manual config definition if this is a manual type.
  if (isManualConfig(type)) {
    updates[`manualConfigs.${type}`] = firebase.firestore.FieldValue.delete();
  }

  const oldResults = (data.lastCalcRun && data.lastCalcRun.results) || null;
  if (oldResults && Array.isArray(oldResults.configResults)) {
    const removeIdx = oldResults.configResults.findIndex(cr => cr && cr.cfg && cr.cfg.type === type);
    if (removeIdx >= 0) {
      const newResults = { ...oldResults };
      newResults.configResults = oldResults.configResults.filter((_, i) => i !== removeIdx);
      if (oldResults.avgTotals && Array.isArray(oldResults.avgTotals.scenarios)) {
        newResults.avgTotals = {
          ...oldResults.avgTotals,
          scenarios: oldResults.avgTotals.scenarios.filter((_, i) => i !== removeIdx),
        };
      }
      updates['lastCalcRun.results'] = newResults;
    }
  }

  await ref.update(updates);

  if (pdfPath) {
    try { await getStorage().ref(pdfPath).delete(); }
    catch (e) { console.warn('Offerte blob verwijderen mislukt', e); }
  }
}

// ─── SERIAL NUMBERS (batterij/omvormer tracking) ─────────────────────────────
//
// project.serialNumbers is a top-level array of entries:
//   { id, value, photoStoragePath, photoDownloadUrl (runtime only), uploadedAt, uploadedBy }
// photoStoragePath/uploadedAt/uploadedBy are null if no photo attached.

function _genSerialId() {
  return 'sn_' + Math.random().toString(36).slice(2, 10);
}

async function addProjectSerial(projectId, value) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const entry = {
    id:               _genSerialId(),
    value:            (value || '').trim(),
    category:         'batterij',
    source:           'manual',
    bebatStatus:      null,
    bebatRegisteredAt:null,
    bebatReference:   null,
    photoStoragePath: null,
    uploadedAt:       null,
    uploadedBy:       null,
  };
  await projectDoc(projectId).update({
    serialNumbers: firebase.firestore.FieldValue.arrayUnion(entry),
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
  });
  return entry;
}

async function updateProjectSerial(projectId, serialId, patch) {
  // arrayUnion/arrayRemove can't mutate in place, so read-modify-write.
  const snap = await projectDoc(projectId).get();
  const list = Array.isArray(snap.data().serialNumbers) ? snap.data().serialNumbers : [];
  const updated = list.map(e => e.id === serialId ? { ...e, ...patch } : e);
  await projectDoc(projectId).update({
    serialNumbers: updated,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteProjectSerial(projectId, serialId) {
  const snap = await projectDoc(projectId).get();
  const list = Array.isArray(snap.data().serialNumbers) ? snap.data().serialNumbers : [];
  const entry = list.find(e => e.id === serialId);
  const updated = list.filter(e => e.id !== serialId);
  await projectDoc(projectId).update({
    serialNumbers: updated,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
  });
  if (entry && entry.photoStoragePath) {
    try { await getStorage().ref(entry.photoStoragePath).delete(); }
    catch (e) { console.warn('Serial photo verwijderen mislukt', e); }
  }
}

async function uploadProjectSerialPhoto(projectId, serialId, file) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  if (!file || !file.type.startsWith('image/')) throw new Error('Alleen afbeeldingen.');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error('Te groot (max 15 MB).');

  const ts = Date.now();
  const storagePath = `projects/${projectId}/serials/${serialId}_${ts}.jpg`;

  // Read existing entry to replace its photo (delete old blob after success).
  const snap = await projectDoc(projectId).get();
  const list = Array.isArray(snap.data().serialNumbers) ? snap.data().serialNumbers : [];
  const oldEntry = list.find(e => e.id === serialId);

  await getStorage().ref(storagePath).put(file, { contentType: file.type });

  const patch = {
    photoStoragePath: storagePath,
    uploadedAt:       new Date(),
    uploadedBy:       email,
  };
  const updated = list.map(e => e.id === serialId ? { ...e, ...patch } : e);
  await projectDoc(projectId).update({
    serialNumbers: updated,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
  });

  if (oldEntry && oldEntry.photoStoragePath && oldEntry.photoStoragePath !== storagePath) {
    try { await getStorage().ref(oldEntry.photoStoragePath).delete(); }
    catch (e) { console.warn('Oude serial photo verwijderen mislukt', e); }
  }
}

async function getSerialPhotoUrl(storagePath) {
  if (!storagePath) return null;
  try { return await getStorage().ref(storagePath).getDownloadURL(); }
  catch (e) { console.warn('Serial photo URL ophalen mislukt', e); return null; }
}

// ─── OFFERTE WARNING PREDICATE ────────────────────────────────────────────────
// True iff project is in offerte-fase AND minstens één config heeft geen PDF.
function needsOfferteWarning(project) {
  if (!project || !project.lastCalcRun) return false;
  if (typeof phaseForStatus !== 'function') return false;
  if (phaseForStatus(project.status).key !== 'offerte') return false;

  const types = (project.lastCalcRun.inputs && Array.isArray(project.lastCalcRun.inputs.selectedConfigTypes))
    ? project.lastCalcRun.inputs.selectedConfigTypes
    : [];
  if (types.length === 0) return false;
  const offertes = project.offertes || {};
  return types.some(t => !offertes[t]);
}

// ─── LEADS ──────────────────────────────────────────────────────────────

/** Create a new lead document. Returns the auto-generated doc ID. */
async function createLead(leadData) {
  const db = getDb();
  const doc = {
    ...leadData,
    status: 'cold_lead',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    hotLeadAt: null,
    deletedAt: null,
    resultExpiresAt: futureTimestamp(LEAD_RESULT_TTL_DAYS),
  };
  const ref = await db.collection('leads').add(doc);
  return ref.id;
}

/** Soft-delete a lead: set deletedAt to a server timestamp. Restorable. */
async function softDeleteLead(leadId) {
  const db = getDb();
  await db.collection('leads').doc(leadId).update({
    deletedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/** Restore a soft-deleted lead: clear deletedAt. */
async function restoreLead(leadId) {
  const db = getDb();
  await db.collection('leads').doc(leadId).update({
    deletedAt: null
  });
}

/**
 * Permanently delete a lead document. Leads have no sub-collections, so this
 * is a single-doc delete. The associated `mail` doc (if any) is independent
 * and is NOT touched (audit trail).
 */
async function hardDeleteLead(leadId) {
  const db = getDb();
  await db.collection('leads').doc(leadId).delete();
}

/** List all leads, ordered by createdAt desc. */
async function listLeads() {
  const db = getDb();
  const snap = await db.collection('leads').orderBy('createdAt', 'desc').get();
  // Filter out leads already converted to projects
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.status !== 'converted');
}

/** Get a single lead by ID. Returns null if not found. */
async function getLead(leadId) {
  const db = getDb();
  const snap = await db.collection('leads').doc(leadId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Update a lead from cold_lead to hot_lead. */
async function updateLeadToHot(leadId) {
  const db = getDb();
  await db.collection('leads').doc(leadId).update({
    status: 'hot_lead',
    hotLeadAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/** Write a document to the mail collection (triggers Firebase email extension). */
async function createMailDoc(mailData) {
  const db = getDb();
  if (!mailData || !mailData.kind || !mailData.leadId) {
    throw new Error('Mail mist verplichte metadata.');
  }
  const mailId = `${mailData.kind}_${mailData.leadId}`;
  await db.collection('mail').doc(mailId).set({
    ...mailData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Convert a lead into a project. Creates a new project doc with data from the lead.
 * Returns the new project ID.
 *
 * The shape mirrors createProject() so the resulting doc passes the
 * listActiveProjects() filter (`where('deletedAt','==',null)`) — Firestore
 * excludes docs that lack the field entirely. CSV data is nested under
 * `csvUpload.dailyCompact` (where the calculator reads it) and email lives
 * on `customer.email` (where the drawer / project-edit form read it).
 */
async function convertLeadToProject(lead, opts = {}) {
  const email = currentUserEmail();
  const now   = firebase.firestore.FieldValue.serverTimestamp();

  // Prepend a one-line lead-analysis summary to notes whenever the wizard
  // calculated a winning config — so Kevin/Ruben see it at a glance in the
  // drawer/edit form without opening the calculator.
  let notes = lead.notes || '';
  if (lead.result && lead.result.bestConfigType) {
    const lr   = lead.result;
    const roi  = (typeof lr.roiYears === 'number' && isFinite(lr.roiYears))
      ? lr.roiYears.toFixed(1).replace('.', ',') + ' j'
      : '?';
    const save = (typeof lr.annualSavingEur === 'number' && isFinite(lr.annualSavingEur))
      ? '€' + Math.round(lr.annualSavingEur).toLocaleString('nl-BE')
      : '?';
    const header = `[Lead-analyse] Beste config: ${lr.bestConfigType} — ROI ~${roi} (realistisch), ~${save}/jaar besparing.`;
    notes = notes ? `${header}\n\n${notes}` : header;
  }

  const projectData = {
    customerName: lead.customerName || '',
    projectName:  '',
    status:       'nieuw_contact',
    createdBy:    email,
    createdAt:    now,
    updatedAt:    now,
    deletedAt:    null,
    notes,
    csvUpload:    lead.csvDailyCompact ? {
      uploadedAt:   now,
      uploadedBy:   email,
      dailyCompact: lead.csvDailyCompact,
    } : null,
    // Caller may precompute the full ROI run so the project opens with
    // results already rendered (no manual Bereken needed). Falls back to
    // null when precompute wasn't possible — pendingConfigTypes still
    // seeds the picker in that case.
    lastCalcRun:  opts.lastCalcRun || null,
  };
  if (lead.email) {
    projectData.customer = { email: lead.email };
  }
  if (lead.pvInverterKw) {
    projectData.solar = { inverters: [{ powerKw: lead.pvInverterKw }] };
  }
  if (lead.pricePerKwh) {
    projectData.supplier = {
      isSingleTariff: true,
      priceDay:       lead.pricePerKwh,
      priceNight:     lead.pricePerKwh,
    };
  }
  if (lead.effectiveBtw) {
    projectData.site = { houseAgeOver10Years: lead.effectiveBtw === 6 };
  }
  // Carry the lead's best-ROI config forward so the calculator opens
  // with it preselected (read by index.html when !lastCalcRun).
  if (lead.result && lead.result.bestConfigType) {
    projectData.pendingConfigTypes = [lead.result.bestConfigType];
  }

  const db  = getDb();
  const ref = await db.collection('projects').add(projectData);

  // Mark the lead as converted so it disappears from the leads list
  await db.collection('leads').doc(lead.id).update({
    status:      'converted',
    convertedAt: firebase.firestore.FieldValue.serverTimestamp(),
    projectId:   ref.id,
  });

  return ref.id;
}

// ─── REVIEWS ────────────────────────────────────────────────────────────────

function reviewRequestsCol() { return getDb().collection('reviewRequests'); }
function reviewsCol() { return getDb().collection('reviews'); }

function publicReviewUrl(reviewRequestId) {
  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, 'review.html');
  return `${base}?r=${encodeURIComponent(reviewRequestId)}`;
}

async function solutionSummaryForProject(project) {
  try {
    const mod = await import('./project-solution.js');
    return mod.calculateSolutionSummary(project && project.installedSolution || {});
  } catch (e) {
    console.warn('Oplossing samenvatten mislukt', e);
    return { inverterPowerKw: 0, inverterPowerW: 0, storageKwh: 0, labels: [], publicLabel: '' };
  }
}

async function createReviewRequestForProject(projectId) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const project = await getProject(projectId);
  if (!project) throw new Error('Project niet gevonden');
  let existing = null;
  try {
    existing = await reviewRequestsCol()
      .where('projectId', '==', projectId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
  } catch (e) {
    console.warn('Bestaande reviewlink controleren mislukt, maak nieuwe link aan', e);
  }
  const settings = await getSettings();
  const solutionSummary = await solutionSummaryForProject(project);
  if (existing && !existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.set({ solutionSummary, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { id: doc.id, url: publicReviewUrl(doc.id), ...doc.data(), solutionSummary };
  }
  const ref = await reviewRequestsCol().add({
    projectId,
    originalProjectName: project.projectName || '',
    originalCustomerName: project.customerName || '',
    suggestedDisplayName: project.customerName || project.projectName || '',
    solutionSummary,
    googleReviewUrl: settings.googleReviewUrl || null,
    status: 'active',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    submittedAt: null,
  });
  return { id: ref.id, url: publicReviewUrl(ref.id) };
}

async function getReviewRequest(id) {
  const snap = await reviewRequestsCol().doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function submitSmartPeakReview(data) {
  if (!data || !data.requestId) throw new Error('Reviewlink ontbreekt');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const review = {
    requestId: data.requestId,
    projectId: data.projectId || null,
    originalProjectName: data.originalProjectName || '',
    originalCustomerName: data.originalCustomerName || '',
    displayName: data.displayName || '',
    rating: Number(data.rating) || 0,
    ratingCommunication: Number(data.ratingCommunication) || 0,
    ratingPlanning: Number(data.ratingPlanning) || 0,
    ratingInstallation: Number(data.ratingInstallation) || 0,
    ratingFinish: Number(data.ratingFinish) || 0,
    shortReview: data.shortReview || '',
    privateFeedback: data.privateFeedback || '',
    solutionSummary: data.solutionSummary || null,
    reviewPhotos: Array.isArray(data.reviewPhotos) ? data.reviewPhotos.slice(0, 8) : [],
    consentWebsite: data.consentWebsite === true,
    consentSocials: data.consentSocials === true,
    googleReviewUrl: data.googleReviewUrl || null,
    googleClicked: false,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  };
  const ref = await reviewsCol().add(review);
  if (review.projectId && review.reviewPhotos.length) {
    await addReviewPhotosToProject(review.projectId, data.requestId, ref.id, review.reviewPhotos);
  }
  try {
    await reviewRequestsCol().doc(data.requestId).set({
      submittedAt: now,
      latestReviewId: ref.id,
      updatedAt: now,
    }, { merge: true });
  } catch (e) {
    console.warn('Review request status bijwerken mislukt', e);
  }
  return ref.id;
}

async function uploadReviewPhotoWithThumb(requestId, file) {
  if (!requestId) throw new Error('Reviewlink ontbreekt');
  if (!file || !file.type || !file.type.startsWith('image/')) throw new Error('Alleen afbeeldingen.');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error('Foto is te groot (max 15 MB).');
  const safeName = (file.name || 'review-photo.jpg').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const safeStripped = safeName.replace(/\.[^.]+$/, '') || 'review-photo';
  const ts = Date.now();
  const fullPath = `review-uploads/${requestId}/${ts}_${safeName}`;
  const thumbPath = `review-uploads/${requestId}/${ts}_${safeStripped}_thumb.jpg`;
  const thumb = await makeThumbnail(file);
  const storage = getStorage();
  try {
    await Promise.all([
      storage.ref(fullPath).put(file, { contentType: file.type }),
      storage.ref(thumbPath).put(thumb.blob, { contentType: 'image/jpeg' }),
    ]);
  } catch (e) {
    try { await storage.ref(fullPath).delete(); } catch (cleanupErr) { console.warn('Review full upload cleanup mislukt', cleanupErr); }
    try { await storage.ref(thumbPath).delete(); } catch (cleanupErr) { console.warn('Review thumb upload cleanup mislukt', cleanupErr); }
    throw new Error('Foto uploaden mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }
  return {
    storagePath: fullPath,
    thumbStoragePath: thumbPath,
    name: file.name || safeName,
    contentType: file.type,
    sizeBytes: file.size,
    width: thumb.width,
    height: thumb.height,
    tag: 'situation_after',
  };
}

async function addReviewPhotosToProject(projectId, requestId, reviewId, photos) {
  const batch = getDb().batch();
  const now = firebase.firestore.FieldValue.serverTimestamp();
  photos.slice(0, 8).forEach(photo => {
    const ref = projectDoc(projectId).collection('photos').doc();
    batch.set(ref, {
      storagePath: photo.storagePath || '',
      thumbStoragePath: photo.thumbStoragePath || '',
      name: photo.name || 'review-photo',
      contentType: photo.contentType || 'image/jpeg',
      sizeBytes: Number(photo.sizeBytes) || 0,
      width: Number(photo.width) || null,
      height: Number(photo.height) || null,
      tag: 'situation_after',
      includeInCloseoutPdf: true,
      includeInInspectionPack: true,
      uploadedAt: now,
      uploadedBy: 'review-link',
      sourceReviewRequestId: requestId,
      sourceReviewId: reviewId,
    });
  });
  await batch.commit();
}

async function deleteSmartPeakReview(reviewId) {
  if (!reviewId) throw new Error('Review ontbreekt');
  await reviewsCol().doc(reviewId).delete();
}

async function updateReviewGoogleClicked(reviewId) {
  await reviewsCol().doc(reviewId).set({
    googleClicked: true,
    googleClickedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function listSmartPeakReviews(limit = 50) {
  const snap = await reviewsCol().orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateSmartPeakReviewStatus(reviewId, status, extra = {}) {
  const allowed = ['submitted', 'approved', 'published', 'rejected'];
  if (!allowed.includes(status)) throw new Error('Ongeldige reviewstatus');
  await reviewsCol().doc(reviewId).set({
    ...extra,
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    moderatedBy: currentUserEmail() || 'unknown',
  }, { merge: true });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

async function getSettings() {
  const snap = await getDb().collection('config').doc('settings').get();
  return snap.exists ? snap.data() : {};
}

async function saveSettings(data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  await getDb().collection('config').doc('settings').set({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  }, { merge: true });
}

// ─── PRODUCT CATEGORIES ──────────────────────────────────────────────────────

function categoriesCol() { return getDb().collection('productCategories'); }
function productsCol() { return getDb().collection('products'); }
function productConfigsCol() { return getDb().collection('productConfigs'); }

async function listProductCategories() {
  const snap = await categoriesCol().orderBy('sortOrder').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createProductCategory(data) {
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const ref = await categoriesCol().add({
    name: data.name,
    slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    isDefault: data.isDefault || false,
    sortOrder: data.sortOrder ?? 999,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

async function updateProductCategory(id, data) {
  await categoriesCol().doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteProductCategory(id) {
  // Find the default category
  const allCats = await listProductCategories();
  const defaultCat = allCats.find(c => c.isDefault);
  if (!defaultCat) throw new Error('Geen default categorie gevonden');
  if (defaultCat.id === id) throw new Error('De default categorie kan niet verwijderd worden');

  // Move orphaned products to default category
  const orphans = await getDb().collection('products')
    .where('categoryId', '==', id).get();
  if (!orphans.empty) {
    const batch = getDb().batch();
    orphans.docs.forEach(doc => {
      batch.update(doc.ref, {
        categoryId: defaultCat.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // Delete the category
  await categoriesCol().doc(id).delete();
}

async function getDefaultCategory() {
  const snap = await categoriesCol().where('isDefault', '==', true).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function ensureServiceProducts() {
  const settings = await getSettings();
  const cats = await listProductCategories();
  if (settings.serviceProductsSeeded === true) {
    return (cats.find(c => c.slug === 'service') || {}).id || null;
  }

  let serviceCat = cats.find(c => c.slug === 'service');
  if (!serviceCat) {
    const id = await createProductCategory({
      name: 'Service',
      slug: 'service',
      isDefault: false,
      sortOrder: cats.length,
    });
    serviceCat = { id, name: 'Service', slug: 'service' };
  }
  let miscCat = cats.find(c => c.slug === 'diversen');
  if (!miscCat) {
    const id = await createProductCategory({
      name: 'Diversen',
      slug: 'diversen',
      isDefault: false,
      sortOrder: cats.length + 1,
    });
    miscCat = { id, name: 'Diversen', slug: 'diversen' };
  }

  const existingSnap = await productsCol().where('categoryId', '==', serviceCat.id).get();
  const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const existingMiscSnap = await productsCol().where('categoryId', '==', miscCat.id).get();
  const existingMisc = existingMiscSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const knownSeedKeys = new Set(['installation', 'inspection', 'buffer']);
  const hasSeededProducts = [...existing, ...existingMisc].some(p => knownSeedKeys.has(p.serviceKey));
  if (hasSeededProducts) {
    await saveSettings({ serviceProductsSeeded: true });
    return serviceCat.id;
  }

  const specs = [
    {
      serviceKey: 'installation',
      model: 'Installatiekost',
      description: 'Installatiekost',
      price: settings.defaultInstallCost ?? 250,
      sortOrder: 10,
    },
    {
      serviceKey: 'inspection',
      model: 'Keuring',
      description: 'Keuring',
      price: settings.defaultInspectCost ?? 250,
      sortOrder: 20,
    },
    {
      serviceKey: 'buffer',
      model: 'Buffer kleine extra kosten',
      description: 'Buffer voor kleine onvoorziene kosten',
      price: settings.defaultBufferCost ?? 0,
      sortOrder: 30,
    },
  ];

  for (const svc of specs.filter(s => s.serviceKey !== 'buffer')) {
    if (existing.some(p => p.serviceKey === svc.serviceKey)) continue;
    await createProduct({
      categoryId: serviceCat.id,
      brand: '',
      model: svc.model,
      description: svc.description,
      purchasePrice: Number(svc.price) || 0,
      marginType: 'fixed',
      marginValue: 0,
      discountType: 'fixed',
      discountValue: 0,
      discountFromUnit: 2,
      specs: { serviceKey: svc.serviceKey },
      serviceKey: svc.serviceKey,
      sortOrder: svc.sortOrder,
    });
  }

  const buffer = specs.find(s => s.serviceKey === 'buffer');
  if (buffer && !existingMisc.some(p => p.serviceKey === 'buffer')) {
    await createProduct({
      categoryId: miscCat.id,
      brand: '',
      model: buffer.model,
      description: buffer.description,
      purchasePrice: Number(buffer.price) || 0,
      marginType: 'fixed',
      marginValue: 0,
      discountType: 'fixed',
      discountValue: 0,
      discountFromUnit: 2,
      specs: { serviceKey: 'buffer' },
      serviceKey: 'buffer',
      sortOrder: buffer.sortOrder,
    });
  }

  await saveSettings({ serviceProductsSeeded: true });
  return serviceCat.id;
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

async function listProducts(filters) {
  // Fetch all products and filter/sort client-side to avoid composite indexes
  const snap = await productsCol().get();
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (filters && filters.categoryId) {
    list = list.filter(p => p.categoryId === filters.categoryId);
  }
  if (filters && typeof filters.isActive === 'boolean') {
    list = list.filter(p => p.isActive === filters.isActive);
  }
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.brand || '').localeCompare(b.brand || ''));
  return list;
}

async function getProduct(id) {
  const snap = await productsCol().doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createProduct(data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const doc = {
    categoryId:      data.categoryId,
    brand:           data.brand || '',
    model:           data.model || '',
    description:     data.description || '',
    purchasePrice:   data.purchasePrice || 0,
    marginType:      data.marginType || 'percent',
    marginValue:     data.marginValue ?? 30,
    discountType:    data.discountType || 'percent',
    discountValue:   data.discountValue ?? 10,
    discountFromUnit: data.discountFromUnit ?? 2,
    specs:           data.specs || {},
    serviceKey:      data.serviceKey || (data.specs && data.specs.serviceKey) || null,
    isActive:        true,
    sortOrder:       data.sortOrder ?? 0,
    createdAt:       now,
    updatedAt:       now,
    createdBy:       email,
    updatedBy:       email,
  };
  const ref = await productsCol().add(doc);
  return ref.id;
}

async function updateProduct(id, data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  await productsCol().doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  });
}

// ─── PRODUCT CONFIGS ─────────────────────────────────────────────────────────

function _normalizeProductConfigData(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    name:        data.name || '',
    description: data.description || '',
    items:       items
      .map(item => ({
        productId: item && item.productId ? String(item.productId) : '',
        qty: Math.max(0, parseInt(item && item.qty, 10) || 0),
      }))
      .filter(item => item.productId && item.qty > 0),
    isActive:    data.isActive !== false,
    sortOrder:   data.sortOrder ?? 0,
  };
}

async function listProductConfigs() {
  const snap = await productConfigsCol().get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.name || '').localeCompare(b.name || ''));
  return list;
}

async function getProductConfig(id) {
  const snap = await productConfigsCol().doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createProductConfig(data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const ref = await productConfigsCol().add({
    ..._normalizeProductConfigData(data),
    createdAt: now,
    updatedAt: now,
    createdBy: email,
    updatedBy: email,
  });
  return ref.id;
}

async function updateProductConfig(id, data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  await productConfigsCol().doc(id).update({
    ..._normalizeProductConfigData(data),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  });
}

async function deleteProductConfig(id) {
  await productConfigsCol().doc(id).delete();
}

async function toggleProductConfigActive(id, isActive) {
  await productConfigsCol().doc(id).update({
    isActive,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUserEmail() || null,
  });
}

async function deleteProduct(id) {
  const productSnap = await productsCol().doc(id).get();
  const productData = productSnap.exists ? productSnap.data() : null;
  const seedKeys = new Set(['installation', 'inspection', 'buffer']);
  if (productData && seedKeys.has(productData.serviceKey)) {
    await saveSettings({ serviceProductsSeeded: true });
  }

  // Cascade: delete photos subcollection
  const photosSnap = await productsCol().doc(id).collection('photos').get();
  if (!photosSnap.empty) {
    const batch = getDb().batch();
    for (const doc of photosSnap.docs) {
      try {
        const data = doc.data();
        if (data.storagePath) await getStorage().ref(data.storagePath).delete();
        if (data.thumbStoragePath) await getStorage().ref(data.thumbStoragePath).delete();
      } catch (e) { console.warn('Storage cleanup failed:', e.message); }
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // Cascade: delete datasheets subcollection
  const dsSnap = await productsCol().doc(id).collection('datasheets').get();
  if (!dsSnap.empty) {
    const batch = getDb().batch();
    for (const doc of dsSnap.docs) {
      try {
        const data = doc.data();
        if (data.storagePath) await getStorage().ref(data.storagePath).delete();
      } catch (e) { console.warn('Storage cleanup failed:', e.message); }
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // Delete the product document
  await productsCol().doc(id).delete();
}

async function toggleProductActive(id, isActive) {
  await updateProduct(id, { isActive });
}

// ─── PRODUCT PHOTOS ──────────────────────────────────────────────────────────

async function uploadProductPhoto(productId, file) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  if (!file || !file.type.startsWith('image/')) throw new Error('Alleen afbeeldingen.');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error('Te groot (max 15 MB).');

  const safeName     = file.name.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const safeStripped = safeName.replace(/\.[^.]+$/, '') || 'photo';
  const ts           = Date.now();
  const fullPath     = `products/${productId}/${ts}_${safeName}`;
  const thumbPath    = `products/${productId}/${ts}_${safeStripped}_thumb.jpg`;

  // Generate thumbnail
  let thumb;
  try { thumb = await makeThumbnail(file); }
  catch (e) { throw new Error('Thumbnail genereren mislukt: ' + (e && e.message ? e.message : e), { cause: e }); }

  // Parallel storage upload
  const storage = getStorage();
  try {
    await Promise.all([
      storage.ref(fullPath).put(file,        { contentType: file.type }),
      storage.ref(thumbPath).put(thumb.blob,  { contentType: 'image/jpeg' }),
    ]);
  } catch (e) {
    try { await storage.ref(fullPath).delete();  } catch (_) { /* best-effort */ }
    try { await storage.ref(thumbPath).delete(); } catch (_) { /* best-effort */ }
    throw new Error('Storage upload mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  // Firestore metadata in photos subcollection
  let ref;
  try {
    ref = await productsCol().doc(productId).collection('photos').add({
      storagePath:      fullPath,
      thumbStoragePath: thumbPath,
      name:             file.name,
      contentType:      file.type,
      sizeBytes:        file.size,
      width:            thumb.width,
      height:           thumb.height,
      uploadedAt:       firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy:       email,
    });
  } catch (e) {
    try { await storage.ref(fullPath).delete();  } catch (_) { /* best-effort */ }
    try { await storage.ref(thumbPath).delete(); } catch (_) { /* best-effort */ }
    throw new Error('Firestore metadata schrijven mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  return ref.id;
}

async function listProductPhotos(productId) {
  const snap = await productsCol().doc(productId).collection('photos')
    .orderBy('uploadedAt', 'desc').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await Promise.all(docs.map(async d => {
    try { d.downloadUrl = await getStorage().ref(d.storagePath).getDownloadURL(); }
    catch (e) { d.downloadUrl = null; d.fetchError = e && e.message ? e.message : String(e); }
    if (d.thumbStoragePath) {
      try { d.thumbUrl = await getStorage().ref(d.thumbStoragePath).getDownloadURL(); }
      catch (e) { d.thumbUrl = null; }
    } else {
      d.thumbUrl = null;
    }
  }));
  return docs;
}

async function deleteProductPhoto(productId, photoId, storagePath, thumbStoragePath) {
  await productsCol().doc(productId).collection('photos').doc(photoId).delete();
  try { await getStorage().ref(storagePath).delete(); }
  catch (e) { console.warn('Storage full-blob verwijderen mislukt', e); }
  if (thumbStoragePath) {
    try { await getStorage().ref(thumbStoragePath).delete(); }
    catch (e) { console.warn('Storage thumb-blob verwijderen mislukt', e); }
  }
}

// ─── PRODUCT DATASHEETS ──────────────────────────────────────────────────────

async function uploadProductDatasheet(productId, file) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  if (!file) throw new Error('Geen bestand opgegeven');
  if (file.type !== 'application/pdf') throw new Error('Enkel PDF-bestanden worden aanvaard');
  if (file.size > 10 * 1024 * 1024) throw new Error('PDF is groter dan 10 MB');

  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const ts       = Date.now();
  const path     = `products/${productId}/datasheets/${ts}_${safeName}`;

  const storage = getStorage();
  try {
    await storage.ref(path).put(file, { contentType: 'application/pdf' });
  } catch (e) {
    throw new Error('Storage upload mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  let ref;
  try {
    ref = await productsCol().doc(productId).collection('datasheets').add({
      storagePath: path,
      name:        file.name,
      contentType: file.type,
      sizeBytes:   file.size,
      uploadedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy:  email,
    });
  } catch (e) {
    try { await storage.ref(path).delete(); } catch (_) { /* best-effort */ }
    throw new Error('Firestore metadata schrijven mislukt: ' + (e && e.message ? e.message : e), { cause: e });
  }

  return ref.id;
}

async function listProductDatasheets(productId) {
  const snap = await productsCol().doc(productId).collection('datasheets')
    .orderBy('uploadedAt', 'desc').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await Promise.all(docs.map(async d => {
    try { d.downloadUrl = await getStorage().ref(d.storagePath).getDownloadURL(); }
    catch (e) { d.downloadUrl = null; d.fetchError = e && e.message ? e.message : String(e); }
  }));
  return docs;
}

async function deleteProductDatasheet(productId, dsId, storagePath) {
  await productsCol().doc(productId).collection('datasheets').doc(dsId).delete();
  try { await getStorage().ref(storagePath).delete(); }
  catch (e) { console.warn('Storage blob verwijderen mislukt', e); }
}

// ─── EXPOSE HELPERS ON WINDOW ────────────────────────────────────────────────
window.migrateMeerkostMapToLines = migrateMeerkostMapToLines;
window.isMarstekConfig = isMarstekConfig;
window.isZendureConfig = isZendureConfig;
window.isSupportedConfig = isSupportedConfig;
window.isManualConfig = isManualConfig;
window.isProductConfig = isProductConfig;
window.getSettings = getSettings;
window.saveSettings = saveSettings;
window.createReviewRequestForProject = createReviewRequestForProject;
window.getReviewRequest = getReviewRequest;
window.submitSmartPeakReview = submitSmartPeakReview;
window.uploadReviewPhotoWithThumb = uploadReviewPhotoWithThumb;
window.deleteSmartPeakReview = deleteSmartPeakReview;
window.updateReviewGoogleClicked = updateReviewGoogleClicked;
window.listSmartPeakReviews = listSmartPeakReviews;
window.updateSmartPeakReviewStatus = updateSmartPeakReviewStatus;
window.listProductCategories = listProductCategories;
window.createProductCategory = createProductCategory;
window.updateProductCategory = updateProductCategory;
window.deleteProductCategory = deleteProductCategory;
window.getDefaultCategory = getDefaultCategory;
window.ensureServiceProducts = ensureServiceProducts;
window.listProducts = listProducts;
window.getProduct = getProduct;
window.createProduct = createProduct;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;
window.toggleProductActive = toggleProductActive;
window.listProductConfigs = listProductConfigs;
window.getProductConfig = getProductConfig;
window.createProductConfig = createProductConfig;
window.updateProductConfig = updateProductConfig;
window.deleteProductConfig = deleteProductConfig;
window.toggleProductConfigActive = toggleProductConfigActive;
window.uploadProductPhoto = uploadProductPhoto;
window.listProductPhotos = listProductPhotos;
window.deleteProductPhoto = deleteProductPhoto;
window.createProjectDocumentFolder = createProjectDocumentFolder;
window.uploadProjectDocument = uploadProjectDocument;
window.listProjectDocuments = listProjectDocuments;
window.updateProjectDocument = updateProjectDocument;
window.moveProjectDocument = moveProjectDocument;
window.deleteProjectDocument = deleteProjectDocument;
window.uploadProductDatasheet = uploadProductDatasheet;
window.listProductDatasheets = listProductDatasheets;
window.deleteProductDatasheet = deleteProductDatasheet;
window.requestPhotoOcrRerun = requestPhotoOcrRerun;
window.updateProjectPhotoTag = updateProjectPhotoTag;
window.setPhotoSerialTag = setPhotoSerialTag;
window.normalizedAddressStructured = normalizedAddressStructured;
window.formatStructuredAddress = formatStructuredAddress;
window.formatCustomerAddress = formatCustomerAddress;
window.billitAddressForCustomer = billitAddressForCustomer;
window.googleMapsUrlForCustomerAddress = googleMapsUrlForCustomerAddress;
window.wazeUrlForCustomerAddress = wazeUrlForCustomerAddress;
window.normalizeProjectTask = normalizeProjectTask;
window.normalizeProjectActivity = normalizeProjectActivity;
window.assigneeForEmail = assigneeForEmail;
window.assigneeLabel = assigneeLabel;
window.bebatSummaryForProject = bebatSummaryForProject;
window.bebatRowsForProjects = bebatRowsForProjects;
window.projectTaskRowsForProjects = projectTaskRowsForProjects;
window.nextActionsForProject = nextActionsForProject;
