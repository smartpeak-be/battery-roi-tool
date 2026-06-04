import { describe, it, expect } from 'vitest';
import {
  SMARTPEAK_TASK_USERS,
  buildTaskOverviewEmail,
  buildDueDateReminderEmail,
  dueDateReminderTypesForDate,
  hasReminderBeenSent,
  markReminderSent,
  reminderRecipientsForTask,
} from '../functions/task-reminders.js';

describe('task reminder helpers', () => {
  const openTask = {
    id: 'task-1',
    title: 'Klant bellen',
    status: 'open',
    assignee: 'kevin',
    dueDate: '2026-06-10',
    projectId: 'project-a',
    projectLabel: 'Project A',
  };

  it('defines Kevin and Ruben with SmartPeak notification emails', () => {
    expect(SMARTPEAK_TASK_USERS).toEqual([
      { key: 'kevin', name: 'Kevin', email: 'kevin@smartpeak.be' },
      { key: 'ruben', name: 'Ruben', email: 'ruben@smartpeak.be' },
    ]);
  });

  it('sends assigned task reminders only to that user and unassigned tasks to both users', () => {
    expect(reminderRecipientsForTask({ ...openTask, assignee: 'kevin' }).map(u => u.key)).toEqual(['kevin']);
    expect(reminderRecipientsForTask({ ...openTask, assignee: null }).map(u => u.key)).toEqual(['kevin', 'ruben']);
  });

  it('selects due date reminders on day before, day itself and day after only', () => {
    expect(dueDateReminderTypesForDate('2026-06-09', '2026-06-10')).toEqual(['due_minus_1']);
    expect(dueDateReminderTypesForDate('2026-06-10', '2026-06-10')).toEqual(['due_today']);
    expect(dueDateReminderTypesForDate('2026-06-11', '2026-06-10')).toEqual(['due_plus_1']);
    expect(dueDateReminderTypesForDate('2026-06-12', '2026-06-10')).toEqual([]);
  });

  it('tracks sent reminders per type, recipient and date without duplicates', () => {
    const task = { ...openTask, reminderLog: [] };
    expect(hasReminderBeenSent(task, 'due_today', 'kevin@smartpeak.be', '2026-06-10')).toBe(false);

    const updated = markReminderSent(task, 'due_today', 'kevin@smartpeak.be', '2026-06-10', 'mail-1');
    expect(hasReminderBeenSent(updated, 'due_today', 'kevin@smartpeak.be', '2026-06-10')).toBe(true);
    expect(markReminderSent(updated, 'due_today', 'kevin@smartpeak.be', '2026-06-10', 'mail-1').reminderLog).toHaveLength(1);
  });

  it('builds simple weekly overview email with assigned and general open tasks', () => {
    const email = buildTaskOverviewEmail({
      user: SMARTPEAK_TASK_USERS[0],
      assignedTasks: [openTask],
      generalTasks: [{ ...openTask, id: 'task-2', title: 'Algemeen opvolgen', assignee: null, dueDate: null }],
      tasksUrl: 'https://smartpeak-battery-roi.netlify.app/tasks.html',
    });

    expect(email.to).toBe('kevin@smartpeak.be');
    expect(email.message.subject).toBe('SmartPeak takenoverzicht');
    expect(email.message.html).toContain('Hallo Kevin');
    expect(email.message.html).toContain('Klant bellen');
    expect(email.message.html).toContain('Due date: 10/06/2026');
    expect(email.message.html).toContain('Algemene openstaande taken');
    expect(email.message.html).toContain('Due date: geen');
    expect(email.message.html).toContain('https://smartpeak-battery-roi.netlify.app/tasks.html');
  });

  it('builds simple due date reminder email', () => {
    const email = buildDueDateReminderEmail({
      user: SMARTPEAK_TASK_USERS[1],
      task: openTask,
      reminderType: 'due_plus_1',
      tasksUrl: 'https://smartpeak-battery-roi.netlify.app/tasks.html',
    });

    expect(email.to).toBe('ruben@smartpeak.be');
    expect(email.message.subject).toBe('SmartPeak taakherinnering: Klant bellen');
    expect(email.message.html).toContain('Hallo Ruben');
    expect(email.message.html).toContain('Taak: Klant bellen');
    expect(email.message.html).toContain('Due date: 10/06/2026');
    expect(email.message.html).toContain('na de due date');
  });
});
