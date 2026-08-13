import { normalizeDrawing } from './electrical-schema-model.js';

const PAGE_W = 842;
const PAGE_H = 595;
const MAX_LEAVES_PER_PAGE = 6;
const TOP_Y = 500;

function ascii(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');
}
function pdfText(value) { return ascii(value).replace(/([\\()])/g, '\\$1'); }
function line(x1, y1, x2, y2, width = 1) { return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`; }
function rect(x, y, width, height) { return `${x} ${y} ${width} ${height} re S\n`; }
function circle(x, y, radius) { return `${x + radius} ${y} m ${x + radius} ${y + radius * .552} ${x + radius * .552} ${y + radius} ${x} ${y + radius} c ${x - radius * .552} ${y + radius} ${x - radius} ${y + radius * .552} ${x - radius} ${y} c ${x - radius} ${y - radius * .552} ${x - radius * .552} ${y - radius} ${x} ${y - radius} c ${x + radius * .552} ${y - radius} ${x + radius} ${y - radius * .552} ${x + radius} ${y} c S\n`; }
function text(x, y, size, value, bold = false) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET\n`; }
function centeredText(x, y, width, size, value, bold = false) {
  const estimated = ascii(value).length * size * .52;
  return text(x + Math.max(0, (width - estimated) / 2), y, size, value, bold);
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
    if (branch.endpoint.type === 'rem-breaker' && branch.endpoint.circuits.length) {
      branch.endpoint.circuits.forEach(child => { if (allowed.has(child.endpoint.id)) ids.push(child.endpoint.id); });
    } else if (allowed.has(branch.endpoint.id)) ids.push(branch.endpoint.id);
  });
  diff.differentials.forEach(child => ids.push(...subtreeLeaves(child, allowed)));
  return ids;
}

function branchLeaves(branch, allowed) {
  if (branch.endpoint.type === 'rem-breaker' && branch.endpoint.circuits.length) {
    return branch.endpoint.circuits.map(child => child.endpoint.id).filter(id => allowed.has(id));
  }
  return allowed.has(branch.endpoint.id) ? [branch.endpoint.id] : [];
}

function positionsFor(ids) {
  const positions = new Map();
  const left = 190;
  const right = 780;
  const gap = ids.length > 1 ? (right - left) / (ids.length - 1) : 0;
  ids.forEach((id, index) => positions.set(id, ids.length === 1 ? 470 : left + index * gap));
  return positions;
}
function centerFor(ids, positions) { return (positions.get(ids[0]) + positions.get(ids[ids.length - 1])) / 2; }

function breakerSymbol(x, y, breaker, main = false) {
  let out = circle(x, y, main ? 15 : 12);
  out += line(x - 8, y - 7, x + 8, y + 7, 1.5);
  out += centeredText(x - 15, y - 3, 30, 7, 'A', true);
  out += centeredText(x - 34, y - 29, 68, 6.5, `${breaker.curve}${breaker.amperage}A ${breaker.poles}P`, true);
  return out;
}
function differentialSymbol(x, y, diff) {
  let out = rect(x - 18, y - 14, 36, 28);
  out += circle(x, y, 8);
  out += centeredText(x - 8, y - 3, 16, 8, 'D', true);
  out += centeredText(x - 37, y - 29, 74, 6.5, `${diff.sensitivityMa}mA ${diff.amperage}A`, true);
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
  } else {
    out += circle(x, y, 13) + centeredText(x - 10, y - 4, 20, 9, 'K', true);
  }
  return out;
}

function endpointLabels(x, y, endpoint) {
  let out = centeredText(x - 48, y - 25, 96, 7.5, endpoint.label, true);
  if (endpoint.brand || endpoint.model) out += centeredText(x - 48, y - 37, 96, 6.5, [endpoint.brand, endpoint.model].filter(Boolean).join(' '));
  const specs = [endpoint.cable, endpoint.powerKw ? `${endpoint.powerKw}kW` : '', endpoint.capacityKwh ? `${endpoint.capacityKwh}kWh` : ''].filter(Boolean).join(' ');
  if (specs) out += centeredText(x - 48, y - 49, 96, 6.2, specs);
  return out;
}

function renderTerminalBranch(branch, x, railY) {
  const breakerY = railY - 34;
  const endpointY = breakerY - 70;
  let out = line(x, railY, x, breakerY + 12, 1.2);
  out += breakerSymbol(x, breakerY, branch.breaker);
  out += line(x, breakerY - 12, x, endpointY + 15, 1.2);
  out += endpointSymbol(x, endpointY, branch.endpoint);
  out += endpointLabels(x, endpointY, branch.endpoint);
  return out;
}

function renderRemBranch(branch, leafIds, positions, railY) {
  const x = centerFor(leafIds, positions);
  const remBreakerY = railY - 34;
  const childRailY = remBreakerY - 50;
  let out = line(x, railY, x, remBreakerY + 12, 1.2);
  out += breakerSymbol(x, remBreakerY, branch.breaker);
  out += centeredText(x - 42, remBreakerY + 20, 84, 7, branch.endpoint.label, true);
  const firstX = positions.get(leafIds[0]);
  const lastX = positions.get(leafIds[leafIds.length - 1]);
  out += line(x, remBreakerY - 12, x, childRailY, 1.2);
  out += line(firstX, childRailY, lastX, childRailY, 2);
  branch.endpoint.circuits.forEach(child => {
    if (leafIds.includes(child.endpoint.id)) out += renderTerminalBranch(child, positions.get(child.endpoint.id), childRailY);
  });
  return out;
}

function renderDifferentialTree(diff, allowed, positions, parentRailY, depth = 0) {
  const leaves = subtreeLeaves(diff, allowed);
  if (!leaves.length) return '';
  const x = centerFor(leaves, positions);
  const diffY = parentRailY - 36;
  const railY = diffY - 48;
  let out = line(x, parentRailY, x, diffY + 14, 1.3);
  out += differentialSymbol(x, diffY, diff);
  out += centeredText(x - 48, diffY + 21, 96, 6.5, diff.label, true);

  const childGroups = [];
  diff.branches.forEach(branch => {
    const ids = branchLeaves(branch, allowed);
    if (ids.length) childGroups.push({ type: 'branch', branch, ids });
  });
  diff.differentials.forEach(child => {
    const ids = subtreeLeaves(child, allowed);
    if (ids.length) childGroups.push({ type: 'diff', diff: child, ids });
  });
  const firstX = centerFor(childGroups[0].ids, positions);
  const lastX = centerFor(childGroups[childGroups.length - 1].ids, positions);
  out += line(x, diffY - 14, x, railY, 1.3);
  out += line(firstX, railY, lastX, railY, 2);
  childGroups.forEach(group => {
    if (group.type === 'diff') out += renderDifferentialTree(group.diff, allowed, positions, railY, depth + 1);
    else if (group.branch.endpoint.type === 'rem-breaker') out += renderRemBranch(group.branch, group.ids, positions, railY);
    else out += renderTerminalBranch(group.branch, positions.get(group.ids[0]), railY);
  });
  return out;
}

function titleBlock(meta, page, pageCount) {
  const y = 30;
  let out = rect(28, y, 786, 62) + line(250, y, 250, y + 62) + line(545, y, 545, y + 62) + line(735, y, 735, y + 62);
  out += text(36, y + 47, 7, 'PLAATS VAN DE ELEKTRISCHE INSTALLATIE', true) + text(36, y + 33, 9, meta.projectName || meta.customerName || 'Project') + text(36, y + 19, 8, meta.address || '');
  out += text(258, y + 47, 7, 'INSTALLATEUR', true) + text(258, y + 33, 9, meta.installer || 'SmartPeak') + text(258, y + 19, 8, meta.installerDetails || 'Terwestvaart 11 - 9180 Moerbeke-Waas');
  out += text(553, y + 47, 7, 'TEKENING', true) + text(553, y + 31, 9, meta.title || 'Eendraadschema') + text(553, y + 17, 8, '3 x 230/400 V - 50 Hz');
  out += centeredText(735, y + 42, 79, 8, `P. ${page}/${pageCount}`, true) + centeredText(735, y + 22, 79, 5.8, 'EENDRAADSCHEMA', true);
  return out;
}

function drawPage(drawing, meta, leafIds, page, pageCount) {
  const allowed = new Set(leafIds);
  const positions = positionsFor(leafIds);
  let out = '0 G 0 g 1 J 1 j\n' + rect(20, 20, PAGE_W - 40, PAGE_H - 40);
  out += text(32, 562, 12, 'EENDRAADSCHEMA', true) + text(690, 562, 8, `Pagina ${page}/${pageCount}`);
  const mainX = 70;
  out += text(35, TOP_Y + 28, 7, 'NET / METER', true);
  out += breakerSymbol(mainX, TOP_Y, drawing.mainBreaker, true);
  out += centeredText(mainX - 40, TOP_Y - 42, 80, 7, drawing.mainBreaker.label, true);

  const rootGroups = drawing.differentials.map(diff => ({ diff, ids: subtreeLeaves(diff, allowed) })).filter(group => group.ids.length);
  if (rootGroups.length) {
    const rootRailY = TOP_Y;
    const firstX = centerFor(rootGroups[0].ids, positions);
    const lastX = centerFor(rootGroups[rootGroups.length - 1].ids, positions);
    out += line(mainX + 15, rootRailY, firstX, rootRailY, 2);
    if (rootGroups.length > 1) out += line(firstX, rootRailY, lastX, rootRailY, 2);
    rootGroups.forEach(group => { out += renderDifferentialTree(group.diff, allowed, positions, rootRailY); });
  }
  out += titleBlock({ ...meta, title: drawing.title }, page, pageCount);
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
