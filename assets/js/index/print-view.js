// Print support for the customer (read-only) view of the calculation.
// On paper nothing can be clicked open, so every <details> is opened for the
// print and closed again afterwards. Charts are resized to the paper width.

const PRINT_DATE_FORMAT = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });

export function openDetailsForPrint(root) {
  const closed = [...root.querySelectorAll('details:not([open])')];
  closed.forEach(el => { el.open = true; });
  return () => closed.forEach(el => { el.open = false; });
}

function resizeCharts(win) {
  const instances = win.Chart?.instances;
  if (!instances) return;
  Object.values(instances).forEach(chart => chart.resize());
}

export function wirePrintView({ doc = document, win = window, now = () => new Date() } = {}) {
  const button = doc.getElementById('printBtn');
  const printDate = doc.getElementById('printDate');
  let restoreDetails = null;

  button?.addEventListener('click', () => win.print());

  win.addEventListener('beforeprint', () => {
    if (!doc.body.classList.contains('readonly-mode')) return;
    if (printDate) printDate.textContent = `Afgedrukt op ${PRINT_DATE_FORMAT.format(now())}`;
    restoreDetails ??= openDetailsForPrint(doc.getElementById('results'));
    resizeCharts(win);
  });

  win.addEventListener('afterprint', () => {
    restoreDetails?.();
    restoreDetails = null;
    resizeCharts(win);
  });
}
