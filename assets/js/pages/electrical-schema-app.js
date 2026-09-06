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
import {
  buildElectricalSchemaPdf,
  buildSituationSchemaPdf,
  downloadElectricalSchemaPdf,
  downloadSituationSchemaPdf,
} from '../electrical-schema-pdf.js';
import { drawingFromProject } from '../electrical-schema-project.js';
import { GRID_CONNECTION_TYPES } from '../grid-compatibility.js';
import {
  addSituationElement,
  addSituationRectangle,
  constrainSituationSegment,
  deleteSituationElement,
  findSituationElement,
  projectSituationPointToWall,
  snapSituationPoint,
  transformSituationElement,
  updateSituationElement,
} from '../situation-schema-model.js';

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
let activeTab = 'electrical';
let situationTool = 'select';
let selectedSituationId = '';
let situationPointer = null;
let situationView = null;
const situationPointers = new Map();
let situationPinch = null;

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

function situationElementSvg(item) {
  const selected = item.id === selectedSituationId ? ' is-selected' : '';
  if (item.type === 'wall' || item.type === 'window') {
    return `<g class="situation-element${selected}" data-situation-id="${escapeHtml(item.id)}">
      <line class="situation-${item.type}" x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}"></line>
      <line class="situation-hit" x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}"></line>
      <text class="situation-label" x="${(item.x1 + item.x2) / 2 + 8}" y="${(item.y1 + item.y2) / 2 - 10}">${escapeHtml(item.label)}</text>
    </g>`;
  }
  let symbol = '';
  if (item.type === 'door') symbol = '<path class="situation-symbol-line" d="M-32 0 H32 M-32 0 V58 M32 0 A64 64 0 0 1 -32 58"></path>';
  else if (item.type === 'distribution-board') symbol = '<rect class="situation-symbol" x="-35" y="-18" width="70" height="36"></rect>';
  else if (item.type === 'inverter') symbol = '<rect class="situation-symbol" x="-30" y="-26" width="60" height="52"></rect><path class="situation-symbol-line" d="M-24 20 L24 -20"></path><text x="-20" y="-3" font-size="20">~</text><text x="10" y="18" font-size="20">=</text>';
  else if (item.type === 'battery') symbol = '<path class="situation-symbol-line" d="M-28 -9 H28 M-19 9 H19"></path><text x="-6" y="-18" font-size="20">+</text><text x="-5" y="27" font-size="20">−</text>';
  else symbol = '<path class="situation-symbol-line" d="M0 -30 V2 M-25 2 H25 M-17 12 H17 M-9 22 H9"></path>';
  const mirror = item.mirrored ? -1 : 1;
  return `<g class="situation-element${selected}" data-situation-id="${escapeHtml(item.id)}" transform="translate(${item.x} ${item.y})">
    <g transform="rotate(${item.rotation}) scale(${mirror} 1)">${symbol}<circle class="situation-hit situation-point-hit" r="48"></circle></g>
    <text class="situation-label" x="42" y="6">${escapeHtml(item.label)}</text>
  </g>`;
}

function defaultSituationView() {
  const viewport = drawing.situation.viewport;
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
}

function ensureSituationView() {
  if (!situationView) situationView = defaultSituationView();
  return situationView;
}

function renderSituation() {
  const canvas = document.getElementById('situationCanvas');
  const situation = drawing.situation;
  const view = ensureSituationView();
  canvas.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
  let preview = '';
  if (situationPointer?.mode === 'rectangle' && situationPointer.current) {
    const { start, current } = situationPointer;
    preview = `<rect class="situation-rectangle-preview" x="${Math.min(start.x, current.x)}" y="${Math.min(start.y, current.y)}" width="${Math.abs(current.x - start.x)}" height="${Math.abs(current.y - start.y)}"></rect>`;
  }
  canvas.innerHTML = situation.elements.map(situationElementSvg).join('') + preview;
  const selected = findSituationElement(situation, selectedSituationId);
  document.getElementById('situationSelection').classList.toggle('hide', !selected);
  if (selected && document.activeElement !== document.getElementById('situationLabel')) document.getElementById('situationLabel').value = selected.label;
}

function selectSituationElement(id = '') {
  selectedSituationId = id;
  renderSituation();
}

function switchSchemaTab(tab) {
  if (tab === 'situation') activeTab = 'situation';
  else activeTab = 'electrical';
  document.getElementById('electricalPanel').classList.toggle('hide', activeTab !== 'electrical');
  document.getElementById('situationPanel').classList.toggle('hide', activeTab !== 'situation');
  document.querySelectorAll('[data-schema-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.schemaTab === activeTab));
  if (activeTab === 'situation') renderSituation();
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
  renderSituation();
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
  return { projectName: project?.projectName || '', customerName: project?.customerName || '', address, connectionType: drawing.connectionType, installer: 'SmartPeak', installerDetails: 'Terwestvaart 11 - 9180 Moerbeke-Waas', installerVat: 'BTW BE0730.696.050' };
}
function exportPdf() {
  drawing = normalizeDrawing({ ...drawing, title: document.getElementById('drawingTitle').value });
  if (activeTab === 'situation') downloadSituationSchemaPdf(drawing.situation, projectMetadata());
  else downloadElectricalSchemaPdf(drawing, projectMetadata());
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
  situationView = null;
  render();
}
async function saveDrawing() {
  drawing = normalizeDrawing({ ...drawing, title: document.getElementById('drawingTitle').value, projectId: requestedProjectId || drawing.projectId });
  const button = document.getElementById('btnSave'); button.disabled = true; setStatus('Bewaren…');
  try {
    drawingId = await saveElectricalDrawing(drawingId || null, drawing); dirty = false;
    if (drawing.projectId) {
      const electricalBytes = buildElectricalSchemaPdf(drawing, projectMetadata());
      const situationBytes = buildSituationSchemaPdf(drawing.situation, projectMetadata());
      await Promise.all([
        window.saveElectricalSchemaProjectDocument(drawing.projectId, drawingId, electricalBytes, `${drawing.title || 'Eendraadschema'}.pdf`, 'electrical'),
        window.saveElectricalSchemaProjectDocument(drawing.projectId, drawingId, situationBytes, 'Situatieschema.pdf', 'situation'),
      ]);
    }
    const next = new URL(window.location.href); next.searchParams.set('drawing', drawingId); if (drawing.projectId) next.searchParams.set('project', drawing.projectId); window.history.replaceState({}, '', next);
    if (requestedProjectId) renderProjectDrawings(await listElectricalDrawingsForProject(requestedProjectId)); setStatus('Bewaard', 'saved'); render();
  } catch (error) { setStatus(`Bewaren mislukt: ${error.message}`); } finally { button.disabled = false; }
}

function situationCoordinatesFromClient(clientX, clientY) {
  const canvas = document.getElementById('situationCanvas');
  const rect = canvas.getBoundingClientRect();
  const view = ensureSituationView();
  return {
    x: view.x + (clientX - rect.left) * view.width / rect.width,
    y: view.y + (clientY - rect.top) * view.height / rect.height,
  };
}

function situationCoordinates(event) {
  return situationCoordinatesFromClient(event.clientX, event.clientY);
}

function zoomSituationView(factor, clientX = null, clientY = null) {
  const canvas = document.getElementById('situationCanvas');
  const rect = canvas.getBoundingClientRect();
  const viewport = drawing.situation.viewport;
  const current = ensureSituationView();
  const anchorClientX = clientX ?? rect.left + rect.width / 2;
  const anchorClientY = clientY ?? rect.top + rect.height / 2;
  const anchor = situationCoordinatesFromClient(anchorClientX, anchorClientY);
  const width = Math.max(viewport.width / 4, Math.min(viewport.width * 2, current.width / factor));
  const height = width * viewport.height / viewport.width;
  const ratioX = (anchorClientX - rect.left) / rect.width;
  const ratioY = (anchorClientY - rect.top) / rect.height;
  situationView = { x: anchor.x - ratioX * width, y: anchor.y - ratioY * height, width, height };
  renderSituation();
}

function setSituationTool(tool) {
  situationTool = tool;
  const canvas = document.getElementById('situationCanvas');
  canvas.classList.toggle('is-pan-tool', tool === 'pan');
  document.querySelectorAll('[data-situation-tool]').forEach(button => button.classList.toggle('is-active', button.dataset.situationTool === tool));
}

function nextSituationLabel(type) {
  const base = { 'distribution-board': 'Verdeelkast', inverter: 'Omvormer', battery: 'Batterij', earth: 'Aardingspunt' }[type] || '';
  if (!base) return '';
  const count = drawing.situation.elements.filter(item => item.type === type).length;
  return count ? `${base} ${count + 1}` : base;
}

function projectOnWall(point, wallId, maxDistance = Infinity) {
  const wall = findSituationElement(drawing.situation, wallId);
  if (!wall || wall.type !== 'wall') return null;
  return projectSituationPointToWall({ ...drawing.situation, elements: [wall] }, point, maxDistance);
}

function beginSituationPinch(canvas) {
  const points = [...situationPointers.values()].slice(0, 2);
  if (points.length < 2) return;
  const center = { x: (points[0].clientX + points[1].clientX) / 2, y: (points[0].clientY + points[1].clientY) / 2 };
  situationPinch = {
    distance: Math.max(1, Math.hypot(points[1].clientX - points[0].clientX, points[1].clientY - points[0].clientY)),
    view: { ...ensureSituationView() },
    anchor: situationCoordinatesFromClient(center.x, center.y),
  };
  situationPointer = null;
  canvas.classList.add('is-panning');
  points.forEach(point => { try { canvas.setPointerCapture(point.pointerId); } catch { /* pointer may already be captured */ } });
}

function updateSituationPinch() {
  if (!situationPinch || situationPointers.size < 2) return;
  const canvas = document.getElementById('situationCanvas');
  const rect = canvas.getBoundingClientRect();
  const points = [...situationPointers.values()].slice(0, 2);
  const center = { x: (points[0].clientX + points[1].clientX) / 2, y: (points[0].clientY + points[1].clientY) / 2 };
  const distance = Math.max(1, Math.hypot(points[1].clientX - points[0].clientX, points[1].clientY - points[0].clientY));
  const viewport = drawing.situation.viewport;
  const width = Math.max(viewport.width / 4, Math.min(viewport.width * 2, situationPinch.view.width * situationPinch.distance / distance));
  const height = width * viewport.height / viewport.width;
  const ratioX = (center.x - rect.left) / rect.width;
  const ratioY = (center.y - rect.top) / rect.height;
  situationView = { x: situationPinch.anchor.x - ratioX * width, y: situationPinch.anchor.y - ratioY * height, width, height };
  renderSituation();
}

function moveWindowAlongWall(item, point) {
  const projection = projectSituationPointToWall(drawing.situation, point, Infinity);
  const wall = projection && findSituationElement(drawing.situation, projection.wallId);
  if (!wall) return;
  const dx = wall.x2 - wall.x1; const dy = wall.y2 - wall.y1;
  const wallLength = Math.hypot(dx, dy) || 1;
  const half = Math.min(Math.hypot(item.x2 - item.x1, item.y2 - item.y1) / 2, wallLength / 2);
  const margin = half / wallLength;
  const t = Math.max(margin, Math.min(1 - margin, projection.t));
  const center = { x: wall.x1 + t * dx, y: wall.y1 + t * dy };
  const ux = dx / wallLength; const uy = dy / wallLength;
  drawing = { ...drawing, situation: updateSituationElement(drawing.situation, item.id, {
    x1: center.x - ux * half, y1: center.y - uy * half,
    x2: center.x + ux * half, y2: center.y + uy * half,
    rotation: projection.rotation,
  }) };
}

function snapMovedSituationElement(elementId) {
  const item = findSituationElement(drawing.situation, elementId);
  if (!item) return;
  if (item.type === 'wall') {
    drawing = { ...drawing, situation: updateSituationElement(drawing.situation, item.id, constrainSituationSegment({ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 })) };
  } else if (item.type === 'window') {
    const center = { x: (item.x1 + item.x2) / 2, y: (item.y1 + item.y2) / 2 };
    const wall = projectSituationPointToWall(drawing.situation, center, Infinity);
    const first = wall && projectOnWall({ x: item.x1, y: item.y1 }, wall.wallId);
    const second = wall && projectOnWall({ x: item.x2, y: item.y2 }, wall.wallId);
    if (first && second) drawing = { ...drawing, situation: updateSituationElement(drawing.situation, item.id, { x1: first.x, y1: first.y, x2: second.x, y2: second.y, rotation: wall.rotation }) };
  } else if (item.type === 'door') {
    const wall = projectSituationPointToWall(drawing.situation, item, Infinity);
    if (wall) drawing = { ...drawing, situation: updateSituationElement(drawing.situation, item.id, wall) };
  } else {
    const point = snapSituationPoint(item);
    drawing = { ...drawing, situation: updateSituationElement(drawing.situation, item.id, point) };
  }
}

function wireSituationEditor() {
  const canvas = document.getElementById('situationCanvas');
  canvas.addEventListener('pointerdown', event => {
    situationPointers.set(event.pointerId, { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType });
    if (situationPointers.size === 2) { beginSituationPinch(canvas); return; }
    const point = situationCoordinates(event);
    const existing = event.target.closest('[data-situation-id]');
    if (situationTool === 'pan') {
      situationPointer = { mode: 'pan', previousClient: { x: event.clientX, y: event.clientY } };
      canvas.classList.add('is-panning');
    } else if (existing && situationTool === 'select') {
      selectedSituationId = existing.dataset.situationId;
      situationPointer = { mode: 'move', id: selectedSituationId, previous: point };
    } else if (situationTool === 'wall') {
      const segment = constrainSituationSegment(point, point);
      drawing = { ...drawing, situation: addSituationElement(drawing.situation, 'wall', segment) };
      const id = drawing.situation.elements.at(-1).id;
      selectedSituationId = '';
      situationPointer = { mode: 'draw-wall', id, start: { x: segment.x1, y: segment.y1 } };
      markDirty();
    } else if (situationTool === 'rectangle') {
      const start = snapSituationPoint(point);
      selectedSituationId = '';
      situationPointer = { mode: 'rectangle', start, current: start };
    } else if (situationTool === 'window') {
      const wall = projectSituationPointToWall(drawing.situation, point, 60);
      if (!wall) { setStatus('Plaats het raam dicht bij een muur.'); return; }
      drawing = { ...drawing, situation: addSituationElement(drawing.situation, 'window', { x1: wall.x, y1: wall.y, x2: wall.x, y2: wall.y, rotation: wall.rotation }) };
      const id = drawing.situation.elements.at(-1).id;
      selectedSituationId = '';
      situationPointer = { mode: 'draw-window', id, wallId: wall.wallId };
      markDirty();
    } else if (situationTool === 'door') {
      const wall = projectSituationPointToWall(drawing.situation, point, 60);
      if (!wall) { setStatus('Plaats de deur dicht bij een muur.'); return; }
      drawing = { ...drawing, situation: addSituationElement(drawing.situation, 'door', { x: wall.x, y: wall.y, rotation: wall.rotation }) };
      const id = drawing.situation.elements.at(-1).id;
      selectedSituationId = '';
      situationPointer = { mode: 'place-door', id, previous: point };
      markDirty();
    } else if (situationTool !== 'select') {
      const snapped = snapSituationPoint(point);
      drawing = { ...drawing, situation: addSituationElement(drawing.situation, situationTool, { ...snapped, label: nextSituationLabel(situationTool) }) };
      const id = drawing.situation.elements.at(-1).id;
      selectedSituationId = '';
      situationPointer = { mode: 'place-point', id, previous: point };
      markDirty();
    } else {
      selectSituationElement('');
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    renderSituation();
  });
  canvas.addEventListener('pointermove', event => {
    if (situationPointers.has(event.pointerId)) situationPointers.set(event.pointerId, { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType });
    if (situationPinch) { updateSituationPinch(); return; }
    if (!situationPointer) return;
    const point = situationCoordinates(event);
    if (situationPointer.mode === 'pan') {
      const view = ensureSituationView();
      const rect = canvas.getBoundingClientRect();
      const dx = (event.clientX - situationPointer.previousClient.x) * view.width / rect.width;
      const dy = (event.clientY - situationPointer.previousClient.y) * view.height / rect.height;
      situationView = { ...view, x: view.x - dx, y: view.y - dy };
      situationPointer.previousClient = { x: event.clientX, y: event.clientY };
    } else if (situationPointer.mode === 'draw-wall') {
      const segment = constrainSituationSegment(situationPointer.start, point);
      drawing = { ...drawing, situation: updateSituationElement(drawing.situation, situationPointer.id, segment) };
    } else if (situationPointer.mode === 'draw-window') {
      const wall = projectOnWall(point, situationPointer.wallId);
      if (wall) drawing = { ...drawing, situation: updateSituationElement(drawing.situation, situationPointer.id, { x2: wall.x, y2: wall.y, rotation: wall.rotation }) };
    } else if (situationPointer.mode === 'rectangle') {
      situationPointer.current = snapSituationPoint(point);
    } else {
      const item = findSituationElement(drawing.situation, situationPointer.id);
      if (item?.type === 'window') {
        moveWindowAlongWall(item, point);
      } else if (item?.type === 'door') {
        const wall = projectSituationPointToWall(drawing.situation, point, Infinity);
        if (wall) drawing = { ...drawing, situation: updateSituationElement(drawing.situation, item.id, wall) };
      } else {
        drawing = { ...drawing, situation: transformSituationElement(drawing.situation, situationPointer.id, { dx: point.x - situationPointer.previous.x, dy: point.y - situationPointer.previous.y }) };
      }
      situationPointer.previous = point;
    }
    if (situationPointer.mode !== 'pan') markDirty();
    renderSituation();
  });
  canvas.addEventListener('pointerup', event => {
    situationPointers.delete(event.pointerId);
    if (situationPinch) {
      if (situationPointers.size < 2) { situationPinch = null; canvas.classList.remove('is-panning'); }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (!situationPointer) return;
    const completed = situationPointer;
    if (completed.mode === 'rectangle') {
      const { start, current } = completed;
      if (Math.abs(current.x - start.x) >= 20 && Math.abs(current.y - start.y) >= 20) {
        drawing = { ...drawing, situation: addSituationRectangle(drawing.situation, { x1: start.x, y1: start.y, x2: current.x, y2: current.y }) };
        selectedSituationId = drawing.situation.elements.at(-1).id;
        markDirty();
      }
    } else if (completed.mode === 'move') snapMovedSituationElement(completed.id);
    if (['draw-wall', 'draw-window', 'place-door', 'place-point'].includes(completed.mode)) {
      snapMovedSituationElement(completed.id);
      selectedSituationId = completed.id;
    }
    situationPointer = null;
    canvas.classList.remove('is-panning');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    renderSituation();
  });
  canvas.addEventListener('pointercancel', event => {
    situationPointers.delete(event.pointerId); situationPointer = null; situationPinch = null;
    canvas.classList.remove('is-panning'); renderSituation();
  });

  document.querySelectorAll('[data-schema-tab]').forEach(button => button.addEventListener('click', () => switchSchemaTab(button.dataset.schemaTab)));
  document.querySelectorAll('[data-situation-tool]').forEach(button => button.addEventListener('click', () => setSituationTool(button.dataset.situationTool)));
  document.getElementById('btnSituationZoomIn').addEventListener('click', () => zoomSituationView(1.35));
  document.getElementById('btnSituationZoomOut').addEventListener('click', () => zoomSituationView(1 / 1.35));
  document.getElementById('btnSituationZoomReset').addEventListener('click', () => { situationView = defaultSituationView(); renderSituation(); });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoomSituationView(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX, event.clientY);
  }, { passive: false });
  document.getElementById('situationLabel').addEventListener('input', event => {
    if (!selectedSituationId) return;
    drawing = { ...drawing, situation: updateSituationElement(drawing.situation, selectedSituationId, { label: event.target.value }) };
    markDirty(); renderSituation();
  });
  document.getElementById('btnSituationRotate').addEventListener('click', () => {
    if (!selectedSituationId) return;
    drawing = { ...drawing, situation: transformSituationElement(drawing.situation, selectedSituationId, { rotate: 90 }) };
    markDirty(); renderSituation();
  });
  document.getElementById('btnSituationMirror').addEventListener('click', () => {
    if (!selectedSituationId) return;
    drawing = { ...drawing, situation: transformSituationElement(drawing.situation, selectedSituationId, { mirror: true }) };
    markDirty(); renderSituation();
  });
  document.getElementById('btnSituationDelete').addEventListener('click', () => {
    if (!selectedSituationId) return;
    drawing = { ...drawing, situation: deleteSituationElement(drawing.situation, selectedSituationId) };
    selectedSituationId = ''; markDirty(); renderSituation();
  });
}

function wireActions() {
  wireSituationEditor();
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
