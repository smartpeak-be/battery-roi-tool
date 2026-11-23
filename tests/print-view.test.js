import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { openDetailsForPrint, wirePrintView } from '../assets/js/index/print-view.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fakeDetails(open) {
  return { open };
}

function fakeRoot(details) {
  return { querySelectorAll: () => details.filter(d => !d.open) };
}

function fakeWindow() {
  const listeners = {};
  return {
    print: vi.fn(),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    fire: type => listeners[type](),
  };
}

function fakeDocument({ readonly, details }) {
  const elements = {
    printBtn: { addEventListener: (type, fn) => { elements.printBtn.click = fn; } },
    printDate: { textContent: '' },
    results: fakeRoot(details),
  };
  return {
    elements,
    body: { classList: { contains: cls => readonly && cls === 'readonly-mode' } },
    getElementById: id => elements[id],
  };
}

describe('customer print view', () => {
  it('opens closed details for printing and restores only those afterwards', () => {
    const details = [fakeDetails(false), fakeDetails(true), fakeDetails(false)];
    const restore = openDetailsForPrint(fakeRoot(details));
    expect(details.map(d => d.open)).toEqual([true, true, true]);
    restore();
    expect(details.map(d => d.open)).toEqual([false, true, false]);
  });

  it('prints from the button, stamps the date and resizes charts in the customer view', () => {
    const details = [fakeDetails(false)];
    const doc = fakeDocument({ readonly: true, details });
    const win = fakeWindow();
    const chart = { resize: vi.fn() };
    win.Chart = { instances: { 0: chart } };
    wirePrintView({ doc, win, now: () => new Date(2026, 10, 23) });

    doc.elements.printBtn.click();
    expect(win.print).toHaveBeenCalled();

    win.fire('beforeprint');
    expect(doc.elements.printDate.textContent).toBe('Afgedrukt op 23 november 2026');
    expect(details[0].open).toBe(true);
    expect(chart.resize).toHaveBeenCalledTimes(1);

    win.fire('afterprint');
    expect(details[0].open).toBe(false);
    expect(chart.resize).toHaveBeenCalledTimes(2);
  });

  it('leaves the internal calculator view alone when printing', () => {
    const details = [fakeDetails(false)];
    const doc = fakeDocument({ readonly: false, details });
    const win = fakeWindow();
    wirePrintView({ doc, win });
    win.fire('beforeprint');
    expect(details[0].open).toBe(false);
    expect(doc.elements.printDate.textContent).toBe('');
  });

  it('has the print button and print-only contact line in index.html', () => {
    expect(indexHtml).toContain('id="printBtn"');
    expect(indexHtml).toContain('id="printDate"');
    expect(indexHtml).toContain('class="roi-print-contact"');
  });
});
