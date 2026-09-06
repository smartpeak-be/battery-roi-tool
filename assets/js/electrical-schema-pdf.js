import { normalizeDrawing } from './electrical-schema-model.js';
import { normalizeSituation } from './situation-schema-model.js';

const PAGE_W = 842;
const PAGE_H = 595;
const MAX_LEAVES_PER_PAGE = 6;
const MAIN_Y = 145;
const CONNECTION_LABELS = { '1x230': '1 x 230 V - 50 Hz', '1x230-delta': '1 x 230 V delta - 50 Hz', '3x230': '3 x 230 V - 50 Hz', '3x400+N': '3 x 400 V + N - 50 Hz' };

function ascii(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');
}
function pdfText(value) { return ascii(value).replace(/([\\()])/g, '\\$1'); }
function line(x1, y1, x2, y2, width = 1) { return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`; }
function rect(x, y, width, height) { return `${x} ${y} ${width} ${height} re S\n`; }
function circle(x, y, radius) { return `${x + radius} ${y} m ${x + radius} ${y + radius * .552} ${x + radius * .552} ${y + radius} ${x} ${y + radius} c ${x - radius * .552} ${y + radius} ${x - radius} ${y + radius * .552} ${x - radius} ${y} c ${x - radius} ${y - radius * .552} ${x - radius * .552} ${y - radius} ${x} ${y - radius} c ${x + radius * .552} ${y - radius} ${x + radius} ${y - radius * .552} ${x + radius} ${y} c S\n`; }
function filledCircle(x, y, radius) { return circle(x, y, radius).replace(/ S\n$/, ' f\n'); }
function text(x, y, size, value, bold = false) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET\n`; }
function sideText(x, y, value, bold = false, size = 6.5) { return text(x + 19, y, size, value, bold); }
function cableAnnotation(x, y, cable, placement) {
  if (!cable) return '';
  let out = sideText(x, y, cable, true, 6.2);
  if (placement === 'surface') out += text(x - 15, y, 7, 'O', true);
  return out;
}
function wrappedSideText(x, y, value, bold = false, size = 5.8, maxChars = 22) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const rows = [];
  words.forEach(word => {
    if (!rows.length || `${rows.at(-1)} ${word}`.length > maxChars) rows.push(word);
    else rows[rows.length - 1] += ` ${word}`;
  });
  return rows.map((row, index) => sideText(x, y - index * 8, row, bold, size)).join('');
}
function customPropertyRows(properties = []) { return properties.map(item => `${item.key}: ${item.value}`); }
function renderPropertyRows(x, y, properties = [], size = 5.6) {
  return customPropertyRows(properties).map((value, index) => wrappedSideText(x, y - index * 8, value, false, size)).join('');
}

function terminalIds(differentials, ids = []) {
  differentials.forEach(diff => {
    diff.branches.forEach(branch => {
      if (branch.endpoint.type === 'rem-breaker' && branch.endpoint.circuits.length) branch.endpoint.circuits.forEach(child => ids.push(child.endpoint.id));
      else ids.push(branch.endpoint.id);
    });
    terminalIds(diff.differentials, ids);
  });
  return ids;
}
function subtreeLeaves(diff, allowed) {
  const ids = [];
  diff.branches.forEach(branch => {
    if (branch.endpoint.type === 'rem-breaker' && branch.endpoint.circuits.length) branch.endpoint.circuits.forEach(child => { if (allowed.has(child.endpoint.id)) ids.push(child.endpoint.id); });
    else if (allowed.has(branch.endpoint.id)) ids.push(branch.endpoint.id);
  });
  diff.differentials.forEach(child => ids.push(...subtreeLeaves(child, allowed)));
  return ids;
}
function branchLeaves(branch, allowed) {
  if (branch.endpoint.type === 'rem-breaker' && branch.endpoint.circuits.length) return branch.endpoint.circuits.map(child => child.endpoint.id).filter(id => allowed.has(id));
  return allowed.has(branch.endpoint.id) ? [branch.endpoint.id] : [];
}
function positionsFor(ids) {
  const positions = new Map();
  const left = 135;
  const right = 690;
  const gap = ids.length > 1 ? (right - left) / (ids.length - 1) : 0;
  ids.forEach((id, index) => positions.set(id, ids.length === 1 ? 420 : left + index * gap));
  return positions;
}
function centerFor(ids, positions) { return (positions.get(ids[0]) + positions.get(ids[ids.length - 1])) / 2; }

function breakerSymbol(x, y, breaker, main = false) {
  const half = main ? 19 : 16;
  let out = line(x, y + half, x, y + 7, 1.3) + line(x, y - 7, x, y - half, 1.3);
  out += filledCircle(x, y + 5, 1.8) + filledCircle(x, y - 5, 1.8);
  out += line(x - 1, y - 4, x + 10, y + 5, 1.5);
  out += `${x + 10} ${y + 5} m ${x + 15} ${y + 3} ${x + 15} ${y - 2} ${x + 10} ${y - 4} c S\n`;
  out += sideText(x, y - 3, `${breaker.curve}${breaker.amperage}A ${breaker.poles}P`, true);
  out += renderPropertyRows(x, y - 13, breaker.customProperties);
  return out;
}
function differentialSymbol(x, y, diff) {
  let out = line(x, y + 20, x, y + 7, 1.3) + line(x, y - 7, x, y - 20, 1.3);
  out += filledCircle(x, y + 5, 2) + filledCircle(x, y - 5, 2);
  out += line(x, y - 4, x + 14, y + 7, 1.6);
  out += sideText(x, y - 4, `I dN ${diff.sensitivityMa}mA  ${diff.amperage}A`, true);
  return out;
}
function endpointSymbol(x, y, endpoint) {
  let out = '';
  if (endpoint.type === 'battery') {
    out += line(x - 13, y + 5, x + 13, y + 5, 2.3) + line(x - 8, y - 5, x + 8, y - 5, 1);
    out += text(x - 2, y + 11, 7, '+', true) + text(x - 2, y - 16, 7, '-', true);
  } else if (endpoint.type === 'inverter' || endpoint.type === 'hybrid-inverter') {
    out += rect(x - 18, y - 14, 36, 28) + line(x - 15, y + 11, x + 15, y - 11, 1.2);
    out += text(x - 13, y + 2, 8, '~', true) + text(x + 7, y - 8, 7, endpoint.type === 'hybrid-inverter' ? '+-' : '=', true);
  } else out += line(x, y - 15, x, y + 15, 1.2);
  return out;
}
function endpointLabels(x, y, endpoint) {
  const productLabel = [endpoint.brand, endpoint.model].filter(Boolean).join(' ');
  const rows = [
    endpoint.circuitLabel ? `Kring ${endpoint.circuitLabel}` : '',
    ['circuit', 'rem-breaker'].includes(endpoint.type) ? '' : endpoint.label,
    endpoint.label && endpoint.label.includes(productLabel) ? '' : productLabel,
    endpoint.powerKw ? `${endpoint.powerKw}kW` : '',
    endpoint.capacityKwh ? `${endpoint.capacityKwh}kWh` : '',
    endpoint.serialNumber ? `SN: ${endpoint.serialNumber}` : '',
    endpoint.note || '',
    ...customPropertyRows(endpoint.customProperties),
  ].filter(Boolean);
  let row = 0;
  let out = '';
  rows.forEach((value, index) => {
    out += wrappedSideText(x, y + 112 - row * 8, value, index < 2, index < 2 ? 6.5 : 5.8);
    row += Math.max(1, Math.ceil(ascii(value).length / 22));
  });
  return out;
}

function renderTerminalBranch(branch, x, railY) {
  const breakerY = railY + 38;
  const endpointY = breakerY + 68;
  let out = line(x, railY, x, breakerY - 16, 1.2);
  out += breakerSymbol(x, breakerY, branch.breaker);
  out += line(x, breakerY + 16, x, endpointY - 15, 1.2);
  out += cableAnnotation(x, (breakerY + endpointY) / 2, branch.endpoint.cable, branch.endpoint.cablePlacement);
  out += endpointSymbol(x, endpointY, branch.endpoint) + endpointLabels(x, endpointY, branch.endpoint);
  return out;
}
function renderRemBranch(branch, leafIds, positions, railY) {
  const x = centerFor(leafIds, positions);
  const remBreakerY = railY + 38;
  const childRailY = remBreakerY + 68;
  let out = line(x, railY, x, remBreakerY - 16, 1.2) + breakerSymbol(x, remBreakerY, branch.breaker);
  if (branch.endpoint.note) out += wrappedSideText(x, remBreakerY + 36, branch.endpoint.note);
  out += renderPropertyRows(x, remBreakerY + 27, branch.endpoint.customProperties);
  const firstX = positions.get(leafIds[0]);
  const lastX = positions.get(leafIds[leafIds.length - 1]);
  out += line(x, remBreakerY + 16, x, childRailY, 1.2);
  out += cableAnnotation(x, remBreakerY + 43, branch.endpoint.cable, branch.endpoint.cablePlacement);
  out += line(firstX, childRailY, lastX, childRailY, 2);
  branch.endpoint.circuits.forEach(child => { if (leafIds.includes(child.endpoint.id)) out += renderTerminalBranch(child, positions.get(child.endpoint.id), childRailY); });
  return out;
}
function renderDifferentialTree(diff, allowed, positions, parentRailY) {
  const leaves = subtreeLeaves(diff, allowed);
  if (!leaves.length) return '';
  const x = centerFor(leaves, positions);
  const diffY = parentRailY + 42;
  const railY = diffY + 48;
  let out = line(x, parentRailY, x, diffY - 20, 1.3) + differentialSymbol(x, diffY, diff);
  out += cableAnnotation(x, parentRailY + 8, diff.cable, diff.cablePlacement);
  out += sideText(x, diffY + 10, diff.label, true, 6.5);
  out += renderPropertyRows(x, diffY + 1, diff.customProperties);
  const childGroups = [];
  diff.branches.forEach(branch => { const ids = branchLeaves(branch, allowed); if (ids.length) childGroups.push({ type: 'branch', branch, ids }); });
  diff.differentials.forEach(child => { const ids = subtreeLeaves(child, allowed); if (ids.length) childGroups.push({ type: 'diff', diff: child, ids }); });
  if (!childGroups.length) return out;
  const firstX = centerFor(childGroups[0].ids, positions);
  const lastX = centerFor(childGroups[childGroups.length - 1].ids, positions);
  out += line(x, diffY + 20, x, railY, 1.3) + line(firstX, railY, lastX, railY, 2);
  childGroups.forEach(group => {
    if (group.type === 'diff') out += renderDifferentialTree(group.diff, allowed, positions, railY);
    else if (group.branch.endpoint.type === 'rem-breaker') out += renderRemBranch(group.branch, group.ids, positions, railY);
    else out += renderTerminalBranch(group.branch, positions.get(group.ids[0]), railY);
  });
  return out;
}

function titleBlock(meta, page, pageCount, schemaTitle = 'EENDRAADSCHEMA') {
  const y = 30;
  let out = rect(28, y, 786, 62) + line(250, y, 250, y + 62) + line(545, y, 545, y + 62) + line(735, y, 735, y + 62);
  out += text(36, y + 47, 7, 'PLAATS VAN DE ELEKTRISCHE INSTALLATIE', true) + text(36, y + 33, 9, meta.projectName || meta.customerName || 'Project') + text(36, y + 19, 8, meta.address || '');
  out += text(258, y + 49, 7, 'INSTALLATEUR', true) + text(258, y + 35, 9, meta.installer || 'SmartPeak') + text(258, y + 21, 7, meta.installerDetails || 'Terwestvaart 11 - 9180 Moerbeke-Waas') + text(258, y + 9, 7, meta.installerVat || 'BTW BE0730.696.050', true);
  out += text(553, y + 47, 7, 'TEKENING', true) + text(553, y + 31, 9, meta.title || schemaTitle) + text(553, y + 17, 8, meta.connectionLabel || 'Aansluiting niet bepaald');
  out += text(750, y + 42, 8, `P. ${page}/${pageCount}`, true) + text(741, y + 22, 5.8, schemaTitle, true);
  return out;
}
function drawPage(drawing, meta, leafIds, page, pageCount) {
  const allowed = new Set(leafIds);
  const positions = positionsFor(leafIds);
  let out = '0 G 0 g 1 J 1 j\n' + rect(20, 20, PAGE_W - 40, PAGE_H - 40);
  out += text(32, 562, 12, 'EENDRAADSCHEMA', true) + text(690, 562, 8, `Pagina ${page}/${pageCount}`);
  const mainX = 70;
  out += text(35, MAIN_Y - 39, 7, 'NET / METER', true);
  out += breakerSymbol(mainX, MAIN_Y, drawing.mainBreaker, true);
  const root = drawing.differentials[0];
  if (root && subtreeLeaves(root, allowed).length) {
    const rootX = centerFor(subtreeLeaves(root, allowed), positions);
    const feedY = MAIN_Y + 28;
    out += line(mainX, MAIN_Y + 19, mainX, feedY, 2);
    out += line(mainX, feedY, rootX, feedY, 2);
    out += renderDifferentialTree(root, allowed, positions, feedY);
  }
  out += titleBlock({ ...meta, title: drawing.title, connectionLabel: CONNECTION_LABELS[drawing.connectionType] }, page, pageCount);
  return out;
}
function makePdf(streams) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalogId = add(''); const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds = [];
  streams.forEach(stream => {
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output = '%PDF-1.4\n%SmartPeak\n'; const offsets = [0];
  objects.forEach((body, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { output += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new globalThis.TextEncoder().encode(output);
}
export function buildElectricalSchemaPdf(rawDrawing, metadata = {}) {
  const drawing = normalizeDrawing(rawDrawing);
  const ids = terminalIds(drawing.differentials);
  const chunks = ids.length ? Array.from({ length: Math.ceil(ids.length / MAX_LEAVES_PER_PAGE) }, (_, index) => ids.slice(index * MAX_LEAVES_PER_PAGE, (index + 1) * MAX_LEAVES_PER_PAGE)) : [[]];
  return makePdf(chunks.map((pageIds, index) => drawPage(drawing, metadata, pageIds, index + 1, chunks.length)));
}

export function situationFitTransform(rawSituation) {
  const situation = normalizeSituation(rawSituation);
  const left = 45; const bottom = 110; const width = 750; const height = 425;
  const points = [];
  situation.elements.forEach(element => {
    if (element.type === 'wall' || element.type === 'window') {
      points.push({ x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 });
    } else {
      points.push({ x: element.x - 45, y: element.y - 45 }, { x: element.x + 70, y: element.y + 45 });
    }
  });
  if (!points.length) points.push({ x: 0, y: 0 }, { x: situation.viewport.width, y: situation.viewport.height });
  const rawMinX = Math.min(...points.map(point => point.x));
  const rawMaxX = Math.max(...points.map(point => point.x));
  const rawMinY = Math.min(...points.map(point => point.y));
  const rawMaxY = Math.max(...points.map(point => point.y));
  const padding = Math.max(10, Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY) * 0.03);
  const minX = rawMinX - padding; const maxX = rawMaxX + padding;
  const minY = rawMinY - padding; const maxY = rawMaxY + padding;
  const boundsWidth = Math.max(1, maxX - minX); const boundsHeight = Math.max(1, maxY - minY);
  const scale = Math.min(width / boundsWidth, height / boundsHeight);
  const offsetX = (width - boundsWidth * scale) / 2;
  const offsetY = (height - boundsHeight * scale) / 2;
  const map = element => ({
    x: left + offsetX + (element.x - minX) * scale,
    y: bottom + height - offsetY - (element.y - minY) * scale,
  });
  return { left, bottom, width, height, scale, minX, maxX, minY, maxY, map };
}

function situationPoint(element, fit) {
  return fit.map(element);
}

function situationSegment(element, fit) {
  return {
    first: situationPoint({ x: element.x1, y: element.y1 }, fit),
    second: situationPoint({ x: element.x2, y: element.y2 }, fit),
  };
}

function rotatedPoint(cx, cy, x, y, rotationDegrees, mirrored = false) {
  const angle = rotationDegrees * Math.PI / 180;
  const localX = mirrored ? -x : x;
  return { x: cx + localX * Math.cos(angle) - y * Math.sin(angle), y: cy + localX * Math.sin(angle) + y * Math.cos(angle) };
}

function situationDevice(element, fit) {
  const point = situationPoint(element, fit);
  // SVG-coördinaten lopen omlaag; spiegel de lokale y-as zodat rotatie en
  // draairichting in de PDF exact overeenkomen met het tekenvlak.
  const at = (x, y) => rotatedPoint(point.x, point.y, x, -y, -element.rotation, element.mirrored);
  let out = '';
  if (element.type === 'door') {
    const hinge = at(-18, 0); const closed = at(18, 0); const open = at(-18, 36);
    const control1 = at(18, 20); const control2 = at(2, 36);
    out += line(hinge.x, hinge.y, closed.x, closed.y, 2) + line(hinge.x, hinge.y, open.x, open.y, 1.2);
    out += `${closed.x} ${closed.y} m ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${open.x} ${open.y} c S\n`;
  } else if (element.type === 'distribution-board') {
    out += rect(point.x - 18, point.y - 10, 36, 20);
  } else if (element.type === 'inverter') {
    out += rect(point.x - 16, point.y - 13, 32, 26) + line(point.x - 13, point.y - 10, point.x + 13, point.y + 10) + text(point.x - 11, point.y, 7, '~', true) + text(point.x + 6, point.y - 8, 7, '=', true);
  } else if (element.type === 'battery') {
    out += line(point.x - 15, point.y + 5, point.x + 15, point.y + 5, 2.2) + line(point.x - 10, point.y - 5, point.x + 10, point.y - 5) + text(point.x - 2, point.y + 10, 7, '+', true);
  } else {
    out += line(point.x, point.y + 15, point.x, point.y - 2, 1.5) + line(point.x - 14, point.y - 2, point.x + 14, point.y - 2, 1.5) + line(point.x - 10, point.y - 7, point.x + 10, point.y - 7) + line(point.x - 5, point.y - 12, point.x + 5, point.y - 12);
  }
  const labelY = element.type === 'door' ? point.y - 20 : point.y - 3;
  out += text(point.x + 20, labelY, 7, element.label, true);
  return out;
}

function drawSituationPage(situation, meta) {
  let out = '0 G 0 g 1 J 1 j\n' + rect(20, 20, PAGE_W - 40, PAGE_H - 40);
  out += text(32, 562, 12, 'SITUATIESCHEMA', true) + text(690, 562, 8, 'Pagina 1/1');
  const fit = situationFitTransform(situation);
  situation.elements.forEach(element => {
    if (element.type === 'wall' || element.type === 'window') {
      const { first, second } = situationSegment(element, fit);
      if (element.type === 'wall') out += line(first.x, first.y, second.x, second.y, 4);
      else {
        const length = Math.hypot(second.x - first.x, second.y - first.y) || 1;
        const ox = -(second.y - first.y) / length * 3; const oy = (second.x - first.x) / length * 3;
        // Maak eerst een witte opening in een eventueel onderliggende muur,
        // daarna twee dunne lijnen voor het raam zelf.
        out += '1 G\n' + line(first.x, first.y, second.x, second.y, 9) + '0 G\n';
        out += line(first.x + ox, first.y + oy, second.x + ox, second.y + oy, 1.2);
        out += line(first.x - ox, first.y - oy, second.x - ox, second.y - oy, 1.2);
      }
      out += text((first.x + second.x) / 2 + 5, (first.y + second.y) / 2 + 7, 6.5, element.label, true);
    } else out += situationDevice(element, fit);
  });
  out += titleBlock({ ...meta, title: 'SITUATIESCHEMA', connectionLabel: meta.connectionLabel || CONNECTION_LABELS[meta.connectionType] }, 1, 1, 'SITUATIESCHEMA');
  return out;
}

export function buildSituationSchemaPdf(rawSituation, metadata = {}) {
  return makePdf([drawSituationPage(normalizeSituation(rawSituation), metadata)]);
}

export function downloadSituationSchemaPdf(situation, metadata = {}) {
  const bytes = buildSituationSchemaPdf(situation, metadata);
  const blob = new globalThis.Blob([bytes], { type: 'application/pdf' });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url; anchor.download = 'situatieschema.pdf'; anchor.click();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
  return bytes;
}

export function downloadElectricalSchemaPdf(drawing, metadata = {}) {
  const bytes = buildElectricalSchemaPdf(drawing, metadata);
  const blob = new globalThis.Blob([bytes], { type: 'application/pdf' });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = `${ascii(drawing.title || 'eendraadschema').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'eendraadschema'}.pdf`;
  anchor.click();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
  return bytes;
}
