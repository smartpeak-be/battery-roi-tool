import {
  addBranch,
  addDifferential,
  addRemCircuit,
  createEmptyDrawing,
  deleteElement,
  findElement,
  moveElement,
  normalizeDrawing,
  polesForConnection,
  updateElement,
} from '../electrical-schema-model.js';
import { buildElectricalSchemaPdf, downloadElectricalSchemaPdf } from '../electrical-schema-pdf.js';
import { drawingFromProject } from '../electrical-schema-project.js';
import { GRID_CONNECTION_TYPES } from '../grid-compatibility.js';

const params = new URLSearchParams(window.location.search);
let drawingId = params.get('drawing') || '';
const requestedProjectId = params.get('project') || '';
let drawing = createEmptyDrawing({ projectId: requestedProjectId || null });
let project = null;
let dirty = false;
let editingId = '';
let addingParentId = '';
let elementModal = null;
let addModal = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const endpointLabels = { circuit: 'Gewone kring', battery: 'Batterij', inverter: 'Omvormer', 'hybrid-inverter': 'Hybride omvormer', 'rem-breaker': 'REM-automaatkring' };


function setState(id) {
  ['stateLoggedOut', 'stateNotWhitelisted', 'stateAuthorized'].forEach(stateId => document.getElementById(stateId).classList.toggle('hide', stateId !== id));
}
function setStatus(text, kind = '') {
  const el = document.getElementById('schemaStatus'); el.textContent = text; el.className = `schema-status ${kind ? `is-${kind}` : ''}`;
}
function markDirty() { dirty = true; setStatus('Niet-bewaarde wijzigingen', 'dirty'); }

function elementActions(id, removable = true) {
  return `<div class="schema-actions">
    <button class="schema-icon-btn" data-action="move-up" data-id="${id}" title="Naar links/boven"><i class="fa-solid fa-arrow-up"></i></button>
    <button class="schema-icon-btn" data-action="move-down" data-id="${id}" title="Naar rechts/onder"><i class="fa-solid fa-arrow-down"></i></button>
    <button class="schema-icon-btn" data-action="edit" data-id="${id}" data-removable="${removable}"><i class="fa-solid fa-pen"></i></button>
  </div>`;
}

function renderEndpointSymbol(endpoint) {
  if (endpoint.type === 'battery') return '<span class="electrical-symbol symbol-battery"><i></i><i></i></span>';
  if (endpoint.type === 'inverter') return '<span class="electrical-symbol symbol-inverter"><b>~</b><em>=</em></span>';
  if (endpoint.type === 'hybrid-inverter') return '<span class="electrical-symbol symbol-hybrid"><b>~</b><em>±</em></span>';
  if (endpoint.type === 'rem-breaker') return '<span class="electrical-symbol symbol-rem"><b>REM</b></span>';
  return '<span class="electrical-symbol symbol-circuit"><i class="fa-solid fa-plug"></i></span>';
}

function renderBranch(branch) {
  const endpoint = branch.endpoint;
  const specs = [endpoint.circuitLabel ? `Kring ${endpoint.circuitLabel}` : '', endpoint.cablePlacement === 'surface' ? `O ${endpoint.cable}` : endpoint.cable, endpoint.powerKw ? `${endpoint.powerKw} kW` : '', endpoint.capacityKwh ? `${endpoint.capacityKwh} kWh` : '', endpoint.serialNumber ? `SN ${endpoint.serialNumber}` : ''].filter(Boolean).join(' · ');
  const remChildren = endpoint.type === 'rem-breaker' ? `<div class="rem-circuits">
    <div class="rem-rail"></div>
    ${endpoint.circuits.map(renderBranch).join('')}
    <button class="schema-add schema-add-rem-circuit" data-action="add-rem-circuit" data-parent-id="${endpoint.id}"><i class="fa-solid fa-plus me-1"></i> Gewone kring onder REM</button>
  </div>` : '';
  return `<article class="schema-branch ${endpoint.type === 'rem-breaker' ? 'schema-rem-branch' : ''}" data-id="${branch.id}">
    <div class="branch-line"></div>
    <div class="schema-breaker-mini"><span>${escapeHtml(branch.breaker.curve)}${branch.breaker.amperage}</span><small>${branch.breaker.poles}P</small></div>
    <div class="endpoint-card endpoint-${endpoint.type}">
      ${renderEndpointSymbol(endpoint)}
      <div class="schema-label"><strong>${escapeHtml(endpoint.label)}</strong><small>${escapeHtml([endpoint.brand, endpoint.model].filter(Boolean).join(' ') || endpointLabels[endpoint.type])}</small><small>${escapeHtml(specs)}</small></div>
      ${elementActions(endpoint.id)}
    </div>
    ${remChildren}
  </article>`;
}

function renderDifferential(diff, depth = 0) {
  return `<section class="schema-differential depth-${Math.min(depth, 3)}" data-id="${diff.id}">
    <div class="schema-diff-head">
      <div class="schema-symbol symbol-differential"><i></i><small>${diff.sensitivityMa}mA</small></div>
      <div class="schema-label"><strong>${escapeHtml(diff.label)}</strong><small>${diff.amperage} A · ${diff.poles}-polig · ${escapeHtml(diff.cable)}</small></div>
      ${elementActions(diff.id)}
    </div>
    <div class="schema-children">
      <div class="schema-branches">${diff.branches.map(renderBranch).join('')}</div>
      ${diff.differentials.map(child => renderDifferential(child, depth + 1)).join('')}
    </div>
    <button class="schema-add schema-add-child" data-action="open-add" data-parent-id="${diff.id}"><i class="fa-solid fa-plus me-1"></i> Toevoegen onder dit differentieel</button>
  </section>`;
}

function render() {
  document.getElementById('drawingTitle').value = drawing.title;
  document.getElementById('mainBreaker').innerHTML = `<div class="schema-main-breaker">
    <div class="schema-symbol symbol-breaker"><i></i></div><div class="schema-label"><strong>${escapeHtml(drawing.mainBreaker.label)}</strong><small>${drawing.mainBreaker.curve}${drawing.mainBreaker.amperage} A · ${drawing.mainBreaker.poles}-polig</small></div>
    ${elementActions(drawing.mainBreaker.id, false)}</div>`;
  document.getElementById('schemaCanvas').innerHTML = drawing.differentials.length
    ? drawing.differentials.map(diff => renderDifferential(diff)).join('')
    : '<div class="schema-empty">Voeg onder de hoofdautomaat eerst een differentieel toe.</div>';
  document.getElementById('drawingContext').textContent = [project?.projectName || project?.customerName, drawingId ? `Tekening ${drawingId.slice(0, 8)}` : 'Nieuwe tekening'].filter(Boolean).join(' · ');
}

function field(label, name, value, { type = 'text', suffix = '', required = true, full = false } = {}) {
  return `<div class="${full ? 'schema-field-full' : ''}"><label class="form-label" for="field-${name}">${label}</label><div class="input-group"><input class="form-control form-control-lg" id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value ?? '')}" ${type === 'number' ? 'min="0" step="0.1" inputmode="decimal"' : ''} ${required ? 'required' : ''}>${suffix ? `<span class="input-group-text">${suffix}</span>` : ''}</div></div>`;
}

function selectField(label, name, value, options) {
  return `<div><label class="form-label" for="field-${name}">${label}</label><select class="form-select form-select-lg" id="field-${name}" name="${name}">${options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
}

function cablePlacementField(value) {
  return selectField('Plaatsing kabel', 'cablePlacement', value || '', [
    { value: '', label: 'Geen aanduiding' },
    { value: 'surface', label: 'Opbouw / in buis (O)' },
  ]);
}

function connectionTypeField(value) {
  return selectField('Spanning / aansluiting', 'connectionType', value || '', [
    { value: '', label: 'Niet bepaald' },
    ...GRID_CONNECTION_TYPES.map(type => ({ value: type.value, label: type.label })),
  ]);
}

function customPropertyRow(item = {}, index = 0, prefix = 'customProperty') {
  return `<div class="custom-property-row" data-property-row data-property-prefix="${prefix}"><label class="custom-property-input"><span>Eigenschap</span><input class="form-control form-control-lg" name="${prefix}Key" value="${escapeHtml(item.key || '')}" placeholder="Bijv. protocol" aria-label="Eigenschap ${index + 1}"></label><label class="custom-property-input"><span>Waarde</span><input class="form-control form-control-lg" name="${prefix}Value" value="${escapeHtml(item.value || '')}" placeholder="Bijv. Modbus" aria-label="Waarde ${index + 1}"></label></div>`;
}

function appendCustomProperties(fields, item, { prefix = 'customProperty', label = 'Extra eigenschappen' } = {}) {
  const rows = [...(item.customProperties || []), { key: '', value: '' }];
  fields.querySelector('.schema-field-grid').insertAdjacentHTML('beforeend', `<div class="schema-field-full custom-properties-field"><label class="form-label">${label}</label><div data-properties-container="${prefix}">${rows.map((row, index) => customPropertyRow(row, index, prefix)).join('')}</div><small class="text-muted">Vul de laatste rij in om automatisch een nieuwe rij toe te voegen.</small></div>`);
}

function openEditor(id) {
  const found = findElement(drawing, id); if (!found) return;
  editingId = id;
  const item = found.element;
  const fields = document.getElementById('elementFields');
  const isRequiredRoot = found.type === 'main-breaker' || (found.type === 'differential' && !found.parentId);
  document.getElementById('btnDeleteElement').classList.toggle('hide', isRequiredRoot);
  if (found.type === 'main-breaker') {
    document.getElementById('elementModalTitle').textContent = 'Hoofdautomaat';
    fields.innerHTML = `<div class="schema-field-grid">${field('Naam', 'label', item.label, { full: true })}${connectionTypeField(drawing.connectionType)}${field('Stroom hoofdschakelaar', 'amperage', item.amperage, { type: 'number', suffix: 'A' })}${field('Polen', 'poles', item.poles, { type: 'number' })}${field('Curve', 'curve', item.curve)}</div>`;
  } else if (found.type === 'differential') {
    document.getElementById('elementModalTitle').textContent = 'Differentieel';
    fields.innerHTML = `<div class="schema-field-grid">${field('Naam', 'label', item.label, { full: true })}${field('Stroom', 'amperage', item.amperage, { type: 'number', suffix: 'A' })}${field('Gevoeligheid', 'sensitivityMa', item.sensitivityMa, { type: 'number', suffix: 'mA' })}${field('Polen', 'poles', item.poles, { type: 'number' })}${field('Voedingskabel', 'cable', item.cable)}${cablePlacementField(item.cablePlacement)}</div>`;
  } else {
    document.getElementById('elementModalTitle').textContent = endpointLabels[found.type] || 'Eindpunt';
    const branch = findElement(drawing, found.branchId)?.element;
    fields.innerHTML = `<div class="schema-field-grid">
      ${field('Naam', 'label', item.label, { full: true })}
      ${found.type === 'circuit' ? field('Kringlabel', 'circuitLabel', item.circuitLabel, { required: false }) : ''}
      ${field('Kabel', 'cable', item.cable)}
      ${cablePlacementField(item.cablePlacement)}
      ${field('Automaat', 'breakerAmperage', branch?.breaker.amperage || 20, { type: 'number', suffix: 'A' })}
      ${field('Polen automaat', 'breakerPoles', branch?.breaker.poles || 2, { type: 'number' })}
      ${!['circuit', 'rem-breaker'].includes(found.type) ? field('Merk', 'brand', item.brand, { required: false }) + field('Model/type', 'model', item.model, { required: false }) + field('Vermogen', 'powerKw', item.powerKw, { type: 'number', suffix: 'kW' }) : ''}
      ${['battery', 'hybrid-inverter'].includes(found.type) ? field('Capaciteit', 'capacityKwh', item.capacityKwh, { type: 'number', suffix: 'kWh' }) : ''}
      ${!['circuit', 'rem-breaker'].includes(found.type) ? field('Serienummer', 'serialNumber', item.serialNumber, { required: false, full: true }) : ''}
      ${field('Notitie', 'note', item.note, { required: false, full: true })}
    </div>`;
  }
  appendCustomProperties(fields, item);
  if (found.branchId) appendCustomProperties(fields, findElement(drawing, found.branchId)?.element?.breaker || {}, { prefix: 'breakerCustomProperty', label: 'Extra eigenschappen automaat' });
  elementModal.show();
}

function openAdd(parentId) {
  addingParentId = parentId;
  const parent = findElement(drawing, parentId)?.element;
  document.querySelector('[data-add-type="differential"]').classList.toggle('hide', Boolean(parent?.differentials?.length));
  addModal.show();
}
function addChoice(type) {
  drawing = type === 'differential'
    ? addDifferential(drawing, addingParentId)
    : addBranch(drawing, addingParentId, type, { breaker: { label: `${endpointLabels[type]} automaat` } });
  markDirty(); render(); addModal.hide();
}

function addCircuitUnderRem(remEndpointId) {
  drawing = addRemCircuit(drawing, remEndpointId);
  markDirty(); render();
}

function projectMetadata() {
  const customer = project?.customer || {};
  const address = customer.address || customer.addressLine || [customer.street, customer.postalCode, customer.city].filter(Boolean).join(' ');
  return { projectName: project?.projectName || '', customerName: project?.customerName || '', address, installer: 'SmartPeak', installerDetails: 'Terwestvaart 11 - 9180 Moerbeke-Waas', installerVat: 'BTW BE0730.696.050' };
}
function exportPdf() {
  drawing = normalizeDrawing({ ...drawing, title: document.getElementById('drawingTitle').value });
  downloadElectricalSchemaPdf(drawing, projectMetadata());
  setStatus('PDF gedownload', 'saved');
}

function renderProjectDrawings(items) {
  const el = document.getElementById('projectDrawings');
  if (!requestedProjectId || !items.length) { el.classList.add('hide'); return; }
  el.innerHTML = items.map(item => `<a class="btn btn-sm ${item.id === drawingId ? 'btn-primary' : 'btn-outline-primary'}" href="?project=${encodeURIComponent(requestedProjectId)}&drawing=${encodeURIComponent(item.id)}">${escapeHtml(item.title || 'Eendraadschema')}</a>`).join('') + `<a class="btn btn-sm btn-outline-secondary" href="?project=${encodeURIComponent(requestedProjectId)}"><i class="fa-solid fa-plus"></i> Nieuw</a>`;
  el.classList.remove('hide');
}
async function loadContext() {
  if (requestedProjectId) { project = await getProject(requestedProjectId); if (!project) throw new Error('Project niet gevonden.'); renderProjectDrawings(await listElectricalDrawingsForProject(requestedProjectId)); }
  if (drawingId) { const stored = await getElectricalDrawing(drawingId); if (!stored) throw new Error('Tekening niet gevonden.'); drawing = normalizeDrawing(stored); setStatus('Bewaarde tekening geladen', 'saved'); }
  else if (project) {
    const [products, categories, configs] = await Promise.all([listProducts(), listProductCategories(), listProductConfigs()]);
    drawing = drawingFromProject(project, { products, categories, configs });
    setStatus(drawing.differentials[0].branches.length ? 'Voorstel uit projectgegevens — nog niet bewaard' : 'Projectgegevens overgenomen — nog niet bewaard');
  } else { drawing = createEmptyDrawing({ projectId: requestedProjectId || null }); setStatus('Nog niet bewaard'); }
  render();
}
async function saveDrawing() {
  drawing = normalizeDrawing({ ...drawing, title: document.getElementById('drawingTitle').value, projectId: requestedProjectId || drawing.projectId });
  const button = document.getElementById('btnSave'); button.disabled = true; setStatus('Bewaren…');
  try {
    drawingId = await saveElectricalDrawing(drawingId || null, drawing); dirty = false;
    if (drawing.projectId) {
      const bytes = buildElectricalSchemaPdf(drawing, projectMetadata());
      await window.saveElectricalSchemaProjectDocument(drawing.projectId, drawingId, bytes, `${drawing.title || 'Eendraadschema'}.pdf`);
    }
    const next = new URL(window.location.href); next.searchParams.set('drawing', drawingId); if (drawing.projectId) next.searchParams.set('project', drawing.projectId); window.history.replaceState({}, '', next);
    if (requestedProjectId) renderProjectDrawings(await listElectricalDrawingsForProject(requestedProjectId)); setStatus('Bewaard', 'saved'); render();
  } catch (error) { setStatus(`Bewaren mislukt: ${error.message}`); } finally { button.disabled = false; }
}

function wireActions() {
  document.getElementById('schemaCanvas').addEventListener('click', handleCanvasClick);
  document.getElementById('mainBreaker').addEventListener('click', handleCanvasClick);
  function handleCanvasClick(event) {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id, parentId } = button.dataset;
    if (action === 'edit') return openEditor(id);
    if (action === 'open-add') return openAdd(parentId);
    if (action === 'add-rem-circuit') return addCircuitUnderRem(parentId);
    if (action.startsWith('move-')) { drawing = moveElement(drawing, id, action === 'move-up' ? -1 : 1); markDirty(); render(); }
  }

  document.querySelectorAll('[data-add-type]').forEach(button => button.addEventListener('click', () => addChoice(button.dataset.addType)));
  document.getElementById('drawingTitle').addEventListener('input', event => { drawing = { ...drawing, title: event.target.value }; markDirty(); });
  document.getElementById('btnSave').addEventListener('click', saveDrawing);
  document.getElementById('btnPdf').addEventListener('click', exportPdf);
  document.getElementById('elementForm').addEventListener('submit', event => {
    event.preventDefault(); const formData = new FormData(event.currentTarget); const values = Object.fromEntries(formData);
    const keys = formData.getAll('customPropertyKey'); const propertyValues = formData.getAll('customPropertyValue');
    values.customProperties = keys.map((key, index) => ({ key, value: propertyValues[index] || '' })).filter(item => item.key.trim() && item.value.trim());
    delete values.customPropertyKey; delete values.customPropertyValue;
    ['amperage', 'sensitivityMa', 'poles', 'powerKw', 'capacityKwh'].forEach(key => { if (values[key] !== undefined && values[key] !== '') values[key] = Number(values[key]); });
    const found = findElement(drawing, editingId);
    if (found?.type === 'main-breaker' && values.connectionType !== undefined) {
      drawing = { ...drawing, connectionType: values.connectionType };
      values.poles = polesForConnection(values.connectionType);
      delete values.connectionType;
    }
    if (found?.branchId && values.breakerAmperage) {
      const branch = findElement(drawing, found.branchId)?.element;
      const breakerKeys = formData.getAll('breakerCustomPropertyKey'); const breakerValues = formData.getAll('breakerCustomPropertyValue');
      const customProperties = breakerKeys.map((key, index) => ({ key, value: breakerValues[index] || '' })).filter(item => item.key.trim() && item.value.trim());
      drawing = updateElement(drawing, branch.breaker.id, { amperage: Number(values.breakerAmperage), poles: Number(values.breakerPoles), customProperties });
      delete values.breakerAmperage; delete values.breakerPoles;
      delete values.breakerCustomPropertyKey; delete values.breakerCustomPropertyValue;
    }
    drawing = updateElement(drawing, editingId, values); markDirty(); render(); elementModal.hide();
  });
  document.getElementById('elementFields').addEventListener('change', event => {
    if (event.target.name !== 'connectionType') return;
    const poles = document.querySelector('#elementForm [name="poles"]');
    if (poles) poles.value = polesForConnection(event.target.value);
  });
  document.getElementById('elementFields').addEventListener('input', event => {
    if (!event.target.closest('[data-property-row]')) return;
    const container = event.target.closest('[data-properties-container]');
    const rows = [...container.querySelectorAll('[data-property-row]')];
    const last = rows.at(-1); const inputs = last?.querySelectorAll('input');
    if (inputs?.[0].value.trim() && inputs?.[1].value.trim()) last.insertAdjacentHTML('afterend', customPropertyRow({}, rows.length, container.dataset.propertiesContainer));
  });
  document.getElementById('btnDeleteElement').addEventListener('click', () => { if (editingId && window.confirm('Dit element en alles eronder verwijderen?')) { drawing = deleteElement(drawing, editingId); markDirty(); render(); elementModal.hide(); } });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}

document.addEventListener('DOMContentLoaded', () => {
  elementModal = new bootstrap.Modal(document.getElementById('elementModal')); addModal = new bootstrap.Modal(document.getElementById('addModal')); wireActions();
  document.getElementById('btnSignIn').addEventListener('click', async () => { try { await signInWithGoogle(); } catch (error) { const el = document.getElementById('signInError'); el.textContent = error.message; el.classList.remove('hide'); } });
  document.getElementById('btnSignOutNW').addEventListener('click', signOut); initFirebase();
  onAuthStateChanged(async user => { if (!user) return setState('stateLoggedOut'); if (!isWhitelisted(user)) return setState('stateNotWhitelisted'); setState('stateAuthorized'); try { await loadContext(); } catch (error) { setStatus(error.message); } });
});
