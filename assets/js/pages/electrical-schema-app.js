import {
  addBreaker,
  addCircuit,
  addDifferential,
  createEmptyDrawing,
  deleteElement,
  findElement,
  moveElement,
  normalizeDrawing,
  updateElement,
} from '../electrical-schema-model.js';

const params = new URLSearchParams(window.location.search);
let drawingId = params.get('drawing') || '';
const requestedProjectId = params.get('project') || '';
let drawing = createEmptyDrawing({ projectId: requestedProjectId || null });
let project = null;
let dirty = false;
let editingId = '';
let modal = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

function setState(id) {
  ['stateLoggedOut', 'stateNotWhitelisted', 'stateAuthorized'].forEach(stateId => {
    document.getElementById(stateId).classList.toggle('hide', stateId !== id);
  });
}

function setStatus(text, kind = '') {
  const el = document.getElementById('schemaStatus');
  el.textContent = text;
  el.className = `schema-status ${kind ? `is-${kind}` : ''}`;
}

function markDirty() {
  dirty = true;
  setStatus('Niet-bewaarde wijzigingen', 'dirty');
}

function elementActions(id) {
  return `<div class="schema-actions">
    <button class="schema-icon-btn" data-action="move-up" data-id="${id}" title="Naar links/boven" aria-label="Naar links of boven"><i class="fa-solid fa-arrow-up"></i></button>
    <button class="schema-icon-btn" data-action="move-down" data-id="${id}" title="Naar rechts/onder" aria-label="Naar rechts of onder"><i class="fa-solid fa-arrow-down"></i></button>
    <button class="schema-icon-btn" data-action="edit" data-id="${id}" title="Bewerken" aria-label="Bewerken"><i class="fa-solid fa-pen"></i></button>
  </div>`;
}

function renderCircuit(circuit) {
  return `<article class="schema-circuit" data-id="${circuit.id}">
    <span class="schema-circuit-line"></span>
    <div class="schema-label"><strong>${escapeHtml(circuit.label)}</strong><small>${escapeHtml(circuit.cable)}${circuit.note ? ` · ${escapeHtml(circuit.note)}` : ''}</small></div>
    ${elementActions(circuit.id)}
  </article>`;
}

function renderBreaker(breaker) {
  return `<article class="schema-breaker" data-id="${breaker.id}">
    <div class="schema-breaker-head">
      <div class="schema-symbol">${escapeHtml(breaker.curve)}${breaker.amperage}<br>${breaker.poles}P</div>
      <div class="schema-label"><strong>${escapeHtml(breaker.label)}</strong><small>Zekering ${breaker.amperage} A · ${breaker.poles}-polig</small></div>
      ${elementActions(breaker.id)}
    </div>
    <div class="schema-circuits">
      ${breaker.circuits.map(renderCircuit).join('')}
      <button class="schema-add schema-add-circuit" data-action="add-circuit" data-parent-id="${breaker.id}"><i class="fa-solid fa-plus me-1"></i> Kring</button>
    </div>
  </article>`;
}

function renderDifferential(diff) {
  return `<section class="schema-differential" data-id="${diff.id}">
    <div class="schema-diff-head">
      <div class="schema-symbol">Δ<br>${diff.sensitivityMa}mA</div>
      <div class="schema-label"><strong>${escapeHtml(diff.label)}</strong><small>${diff.amperage} A · ${diff.sensitivityMa} mA · ${diff.poles}-polig</small></div>
      ${elementActions(diff.id)}
    </div>
    <div class="schema-breakers">${diff.breakers.map(renderBreaker).join('')}</div>
    <button class="schema-add schema-add-breaker" data-action="add-breaker" data-parent-id="${diff.id}"><i class="fa-solid fa-plus me-1"></i> Zekering</button>
  </section>`;
}

function render() {
  document.getElementById('drawingTitle').value = drawing.title;
  const canvas = document.getElementById('schemaCanvas');
  canvas.innerHTML = drawing.differentials.length
    ? drawing.differentials.map(renderDifferential).join('')
    : '<div class="schema-empty"><i class="fa-solid fa-diagram-project fa-2x mb-2"></i><br>Start met een differentieel.</div>';
  const contextParts = [];
  if (project) contextParts.push(project.projectName || project.customerName || 'Project');
  contextParts.push(drawingId ? `Tekening ${drawingId.slice(0, 8)}` : 'Nieuwe tekening');
  document.getElementById('drawingContext').textContent = contextParts.join(' · ');
}

function field(label, name, value, { type = 'text', full = false, suffix = '' } = {}) {
  return `<div class="${full ? 'schema-field-full' : ''}"><label class="form-label" for="field-${name}">${label}</label><div class="input-group">
    <input class="form-control form-control-lg" id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${type === 'number' ? 'min="1" step="1" inputmode="numeric"' : ''} required>
    ${suffix ? `<span class="input-group-text">${suffix}</span>` : ''}
  </div></div>`;
}

function openEditor(id) {
  const found = findElement(drawing, id);
  if (!found) return;
  editingId = id;
  const item = found.element;
  const fields = document.getElementById('elementFields');
  document.getElementById('elementModalTitle').textContent = found.type === 'differential' ? 'Differentieel' : found.type === 'breaker' ? 'Zekering' : 'Kring';
  if (found.type === 'differential') {
    fields.innerHTML = `<div class="schema-field-grid">${field('Naam', 'label', item.label, { full: true })}${field('Stroom', 'amperage', item.amperage, { type: 'number', suffix: 'A' })}${field('Gevoeligheid', 'sensitivityMa', item.sensitivityMa, { type: 'number', suffix: 'mA' })}${field('Polen', 'poles', item.poles, { type: 'number' })}</div>`;
  } else if (found.type === 'breaker') {
    fields.innerHTML = `<div class="schema-field-grid">${field('Naam', 'label', item.label, { full: true })}${field('Stroom', 'amperage', item.amperage, { type: 'number', suffix: 'A' })}${field('Polen', 'poles', item.poles, { type: 'number' })}${field('Curve', 'curve', item.curve)}</div>`;
  } else {
    fields.innerHTML = `<div class="schema-field-grid">${field('Naam kring', 'label', item.label, { full: true })}${field('Kabel', 'cable', item.cable)}${field('Notitie', 'note', item.note || '', { full: true })}</div>`;
  }
  modal.show();
}

function renderProjectDrawings(items) {
  const el = document.getElementById('projectDrawings');
  if (!requestedProjectId || !items.length) { el.classList.add('hide'); return; }
  el.innerHTML = `<span class="small text-muted flex-shrink-0">Project:</span>${items.map(item => `<a class="btn btn-sm ${item.id === drawingId ? 'btn-primary' : 'btn-outline-primary'}" href="?project=${encodeURIComponent(requestedProjectId)}&drawing=${encodeURIComponent(item.id)}">${escapeHtml(item.title || 'Eendraadschema')}</a>`).join('')}<a class="btn btn-sm btn-outline-secondary" href="?project=${encodeURIComponent(requestedProjectId)}"><i class="fa-solid fa-plus"></i> Nieuw</a>`;
  el.classList.remove('hide');
}

async function loadContext() {
  if (requestedProjectId) {
    project = await getProject(requestedProjectId);
    if (!project) throw new Error('Project niet gevonden.');
    renderProjectDrawings(await listElectricalDrawingsForProject(requestedProjectId));
  }
  if (drawingId) {
    const stored = await getElectricalDrawing(drawingId);
    if (!stored) throw new Error('Tekening niet gevonden.');
    if (requestedProjectId && stored.projectId && stored.projectId !== requestedProjectId) throw new Error('Tekening hoort niet bij dit project.');
    drawing = normalizeDrawing(stored);
    setStatus('Bewaarde tekening geladen', 'saved');
  } else {
    drawing = createEmptyDrawing({ projectId: requestedProjectId || null });
    setStatus('Nog niet bewaard');
  }
  render();
}

async function saveDrawing() {
  drawing = normalizeDrawing({ ...drawing, title: document.getElementById('drawingTitle').value, projectId: requestedProjectId || drawing.projectId });
  const button = document.getElementById('btnSave');
  button.disabled = true;
  setStatus('Bewaren…');
  try {
    drawingId = await saveElectricalDrawing(drawingId || null, drawing);
    dirty = false;
    const next = new URL(window.location.href);
    next.searchParams.set('drawing', drawingId);
    if (drawing.projectId) next.searchParams.set('project', drawing.projectId);
    window.history.replaceState({}, '', next);
    if (requestedProjectId) renderProjectDrawings(await listElectricalDrawingsForProject(requestedProjectId));
    setStatus('Bewaard', 'saved');
    render();
  } catch (error) {
    setStatus(`Bewaren mislukt: ${error.message}`);
  } finally { button.disabled = false; }
}

function wireActions() {
  document.getElementById('schemaCanvas').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, parentId } = button.dataset;
    if (action === 'edit') return openEditor(id);
    if (action === 'move-up' || action === 'move-down') drawing = moveElement(drawing, id, action === 'move-up' ? -1 : 1);
    if (action === 'add-breaker') drawing = addBreaker(drawing, parentId);
    if (action === 'add-circuit') drawing = addCircuit(drawing, parentId);
    markDirty(); render();
  });
  document.getElementById('btnAddDifferential').addEventListener('click', () => { drawing = addDifferential(drawing); markDirty(); render(); });
  document.getElementById('drawingTitle').addEventListener('input', event => { drawing = { ...drawing, title: event.target.value }; markDirty(); });
  document.getElementById('btnSave').addEventListener('click', saveDrawing);
  document.getElementById('elementForm').addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    ['amperage', 'sensitivityMa', 'poles'].forEach(key => { if (key in values) values[key] = Number(values[key]); });
    drawing = updateElement(drawing, editingId, values); markDirty(); render(); modal.hide();
  });
  document.getElementById('btnDeleteElement').addEventListener('click', () => {
    if (!editingId || !window.confirm('Dit blok en alles eronder verwijderen?')) return;
    drawing = deleteElement(drawing, editingId); markDirty(); render(); modal.hide();
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}

document.addEventListener('DOMContentLoaded', () => {
  modal = new bootstrap.Modal(document.getElementById('elementModal'));
  wireActions();
  document.getElementById('btnSignIn').addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (error) {
      const el = document.getElementById('signInError'); el.textContent = error.message; el.classList.remove('hide');
    }
  });
  document.getElementById('btnSignOutNW').addEventListener('click', signOut);
  initFirebase();
  onAuthStateChanged(async user => {
    if (!user) return setState('stateLoggedOut');
    if (!isWhitelisted(user)) return setState('stateNotWhitelisted');
    setState('stateAuthorized');
    try { await loadContext(); } catch (error) { setStatus(error.message); }
  });
});
