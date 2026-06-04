export const SMARTPEAK_TASK_USERS = [
  { key: 'kevin', name: 'Kevin', email: 'kevin@smartpeak.be' },
  { key: 'ruben', name: 'Ruben', email: 'ruben@smartpeak.be' },
];

export const REMINDER_TYPES = {
  DUE_MINUS_1: 'due_minus_1',
  DUE_TODAY: 'due_today',
  DUE_PLUS_1: 'due_plus_1',
  WEEKLY_OVERVIEW: 'weekly_overview',
};

const CLOSED_STATUSES = new Set(['done', 'cancelled', 'afgerond']);

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(value) {
  if (!value) return 'geen';
  const [year, month, day] = clean(value).split('-');
  if (!year || !month || !day) return clean(value);
  return `${day}/${month}/${year}`;
}

function daysBetween(date, dueDate) {
  const current = Date.parse(`${date}T00:00:00Z`);
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  if (!Number.isFinite(current) || !Number.isFinite(due)) return null;
  return Math.round((current - due) / 86400000);
}

export function isOpenTask(task = {}) {
  return !!clean(task.title) && !CLOSED_STATUSES.has(clean(task.status || 'open').toLowerCase());
}

export function reminderRecipientsForTask(task = {}) {
  const assignee = clean(task.assignee).toLowerCase();
  if (!assignee) return SMARTPEAK_TASK_USERS;
  return SMARTPEAK_TASK_USERS.filter(user => user.key === assignee);
}

export function dueDateReminderTypesForDate(date, dueDate) {
  const diff = daysBetween(date, dueDate);
  if (diff === -1) return [REMINDER_TYPES.DUE_MINUS_1];
  if (diff === 0) return [REMINDER_TYPES.DUE_TODAY];
  if (diff === 1) return [REMINDER_TYPES.DUE_PLUS_1];
  return [];
}

export function hasReminderBeenSent(task = {}, type, recipient, date) {
  const log = Array.isArray(task.reminderLog) ? task.reminderLog : [];
  return log.some(entry =>
    entry && entry.type === type && entry.recipient === recipient && entry.date === date
  );
}

export function markReminderSent(task = {}, type, recipient, date, mailId = null) {
  if (hasReminderBeenSent(task, type, recipient, date)) return task;
  const reminderLog = Array.isArray(task.reminderLog) ? [...task.reminderLog] : [];
  reminderLog.push({
    type,
    recipient,
    date,
    mailId,
    sentAt: new Date().toISOString(),
  });
  return { ...task, reminderLog };
}

function taskLineHtml(task, index) {
  const status = clean(task.status || 'open') || 'open';
  const title = escapeHtml(task.title || 'Taak');
  const project = task.projectLabel ? ` <span style="color:#6c757d">(${escapeHtml(task.projectLabel)})</span>` : '';
  const notes = task.notes ? `<br><span style="color:#6c757d">${escapeHtml(task.notes)}</span>` : '';
  return `<p style="margin:0 0 12px 0"><strong>${index + 1}. ${title}</strong>${project}<br>Due date: ${escapeHtml(fmtDate(task.dueDate))}<br>Status: ${escapeHtml(status)}${notes}</p>`;
}

export function buildTaskOverviewEmail({ user, assignedTasks = [], generalTasks = [], tasksUrl }) {
  const assignedHtml = assignedTasks.length
    ? assignedTasks.map(taskLineHtml).join('')
    : '<p>Geen persoonlijke openstaande taken.</p>';
  const generalHtml = generalTasks.length
    ? generalTasks.map(taskLineHtml).join('')
    : '<p>Geen algemene openstaande taken.</p>';
  const html = `
    <p>Hallo ${escapeHtml(user.name)},</p>
    <p>Hieronder vind je een overzicht van je openstaande taken:</p>
    ${assignedHtml}
    <h3>Algemene openstaande taken:</h3>
    ${generalHtml}
    <p>Bekijk je taken hier:<br><a href="${escapeHtml(tasksUrl)}">${escapeHtml(tasksUrl)}</a></p>
  `;
  return {
    to: user.email,
    message: {
      subject: 'SmartPeak takenoverzicht',
      html,
    },
  };
}

function reminderReason(type) {
  if (type === REMINDER_TYPES.DUE_MINUS_1) return 'de dag vóór de due date';
  if (type === REMINDER_TYPES.DUE_TODAY) return 'de dag van de due date';
  if (type === REMINDER_TYPES.DUE_PLUS_1) return 'de dag na de due date';
  return 'een due date reminder';
}

export function buildDueDateReminderEmail({ user, task, reminderType, tasksUrl }) {
  const title = clean(task.title || 'Taak');
  const html = `
    <p>Hallo ${escapeHtml(user.name)},</p>
    <p>Dit is een herinnering voor ${escapeHtml(reminderReason(reminderType))}.</p>
    <p><strong>Taak: ${escapeHtml(title)}</strong><br>Due date: ${escapeHtml(fmtDate(task.dueDate))}<br>Status: ${escapeHtml(task.status || 'open')}</p>
    ${task.notes ? `<p>Notitie: ${escapeHtml(task.notes)}</p>` : ''}
    <p>Bekijk je taken hier:<br><a href="${escapeHtml(tasksUrl)}">${escapeHtml(tasksUrl)}</a></p>
  `;
  return {
    to: user.email,
    message: {
      subject: `SmartPeak taakherinnering: ${title}`.slice(0, 200),
      html,
    },
  };
}
