import { normalizeDrawing } from './electrical-schema-model.js';

const PAGE_W = 842;
const PAGE_H = 595;
const MAX_BRANCHES_PER_PAGE = 6;

function ascii(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');
}

function pdfText(value) {
  return ascii(value).replace(/([\\()])/g, '\\$1');
}

function line(x1, y1, x2, y2, width = 1) { return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`; }
function rect(x, y, width, height, stroke = true) { return `${x} ${y} ${width} ${height} re ${stroke ? 'S' : 'f'}\n`; }
function text(x, y, size, value, bold = false) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET\n`; }
function centeredText(x, y, width, size, value, bold = false) {
  const estimated = ascii(value).length * size * 0.52;
  return text(x + Math.max(0, (width - estimated) / 2), y, size, value, bold);
}

function flattenDifferentials(differentials, depth = 0, result = []) {
  differentials.forEach(diff => {
    result.push({ diff, depth });
    diff.differentials.forEach(child => flattenDifferentials([child], depth + 1, result));
  });
  return result;
}

function flattenBranches(differentials, chain = [], result = []) {
  differentials.forEach(diff => {
    const nextChain = [...chain, diff];
    diff.branches.forEach(branch => result.push({ branch, chain: nextChain }));
    flattenBranches(diff.differentials, nextChain, result);
  });
  return result;
}

function drawBreakerSymbol(x, y, breaker) {
  let out = rect(x - 13, y - 11, 26, 22);
  out += line(x - 8, y - 6, x + 8, y + 6, 1);
  out += centeredText(x - 22, y - 25, 44, 7, `${breaker.curve}${breaker.amperage}A ${breaker.poles}P`);
  return out;
}

function drawDifferentialSymbol(x, y, diff) {
  let out = rect(x - 18, y - 12, 36, 24);
  out += line(x - 12, y - 6, x + 12, y + 6, 1);
  out += centeredText(x - 30, y - 27, 60, 7, `${diff.sensitivityMa}mA ${diff.amperage}A`);
  return out;
}

function drawEndpointSymbol(x, y, endpoint) {
  let out = '';
  if (endpoint.type === 'battery') {
    out += line(x - 12, y - 5, x + 12, y - 5, 2);
    out += line(x - 7, y + 5, x + 7, y + 5, 1);
    out += text(x - 2, y + 10, 7, '+', true);
    out += text(x - 2, y - 15, 7, '-', true);
  } else if (endpoint.type === 'inverter') {
    out += rect(x - 17, y - 13, 34, 26);
    out += line(x - 14, y + 8, x + 14, y - 8, 1);
    out += text(x - 11, y + 2, 8, '~', true);
    out += text(x + 6, y - 8, 7, '=', true);
  } else if (endpoint.type === 'hybrid-inverter') {
    out += rect(x - 19, y - 14, 38, 28);
    out += line(x - 16, y + 10, x + 16, y - 10, 1);
    out += text(x - 13, y + 2, 8, '~', true);
    out += line(x + 5, y + 5, x + 14, y + 5, 2);
    out += line(x + 7, y, x + 12, y, 1);
  } else {
    out += rect(x - 13, y - 13, 26, 26);
    out += text(x - 5, y - 4, 12, 'K', true);
  }
  return out;
}

function titleBlock(meta, page, pageCount) {
  const y = 30;
  let out = rect(28, y, 786, 62);
  out += line(250, y, 250, y + 62);
  out += line(545, y, 545, y + 62);
  out += line(735, y, 735, y + 62);
  out += text(36, y + 47, 7, 'PLAATS VAN DE ELEKTRISCHE INSTALLATIE', true);
  out += text(36, y + 33, 9, meta.projectName || meta.customerName || 'Project');
  out += text(36, y + 19, 8, meta.address || '');
  out += text(258, y + 47, 7, 'INSTALLATEUR', true);
  out += text(258, y + 33, 9, meta.installer || 'SmartPeak');
  out += text(258, y + 19, 8, meta.installerDetails || 'Terwestvaart 11 - 9180 Moerbeke-Waas');
  out += text(553, y + 47, 7, 'TEKENING', true);
  out += text(553, y + 31, 9, meta.title || 'Eendraadschema');
  out += text(553, y + 17, 8, '3 x 230/400 V - 50 Hz');
  out += centeredText(735, y + 42, 79, 8, `P. ${page}/${pageCount}`, true);
  out += centeredText(735, y + 22, 79, 6.5, 'EENDRAADSCHEMA', true);
  return out;
}

function drawPage(drawing, meta, pageItems, page, pageCount) {
  let out = '0 G 0 g 1 J 1 j\n';
  out += rect(20, 20, PAGE_W - 40, PAGE_H - 40);
  out += text(32, 562, 12, 'EENDRAADSCHEMA', true);
  out += text(690, 562, 8, `Pagina ${page}/${pageCount}`);

  const baseY = 130;
  const mainX = 70;
  out += line(mainX, baseY, mainX, 475, 1.4);
  out += drawBreakerSymbol(mainX, 190, drawing.mainBreaker);
  out += centeredText(mainX - 38, 155, 76, 8, drawing.mainBreaker.label, true);
  out += text(35, 205, 7, 'NET / METER');

  const spacing = 108;
  pageItems.forEach((item, index) => {
    const x = 180 + index * spacing;
    const endpoint = item.branch.endpoint;
    out += line(mainX, baseY, x, baseY, 1.4);
    out += line(x, baseY, x, 470, 1.2);
    item.chain.forEach((chainDiff, chainIndex) => {
      out += drawDifferentialSymbol(x, 165 + chainIndex * 50, chainDiff);
    });
    const breakerY = 185 + item.chain.length * 50;
    const endpointY = Math.max(350, breakerY + 85);
    out += drawBreakerSymbol(x, breakerY, item.branch.breaker);
    out += centeredText(x - 46, breakerY + 32, 92, 7, endpoint.cable);
    out += drawEndpointSymbol(x, endpointY, endpoint);
    out += centeredText(x - 48, endpointY + 32, 96, 8, endpoint.label, true);
    if (endpoint.brand || endpoint.model) out += centeredText(x - 48, endpointY + 46, 96, 7, [endpoint.brand, endpoint.model].filter(Boolean).join(' '));
    if (endpoint.powerKw) out += centeredText(x - 48, endpointY + 60, 96, 7, `P: ${endpoint.powerKw} kW`);
    if (endpoint.capacityKwh) out += centeredText(x - 48, endpointY + 74, 96, 7, `E: ${endpoint.capacityKwh} kWh`);
    if (endpoint.serialNumber) out += centeredText(x - 48, endpointY + 88, 96, 6.5, `S/N: ${endpoint.serialNumber}`);
  });

  if (!pageItems.length) {
    const diffs = flattenDifferentials(drawing.differentials);
    diffs.forEach(({ diff, depth }, index) => {
      const x = 180 + index * spacing;
      out += line(mainX, baseY, x, baseY, 1.4) + line(x, baseY, x, 230, 1.2);
      out += drawDifferentialSymbol(x, 175 + depth * 30, diff);
      out += centeredText(x - 45, 215 + depth * 30, 90, 7, diff.label, true);
    });
  }

  out += titleBlock({ ...meta, title: drawing.title }, page, pageCount);
  return out;
}

function makePdf(streams) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds = [];
  streams.forEach(stream => {
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let output = '%PDF-1.4\n%SmartPeak\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { output += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new globalThis.TextEncoder().encode(output);
}

export function buildElectricalSchemaPdf(rawDrawing, metadata = {}) {
  const drawing = normalizeDrawing(rawDrawing);
  const branches = flattenBranches(drawing.differentials);
  const pages = branches.length
    ? Array.from({ length: Math.ceil(branches.length / MAX_BRANCHES_PER_PAGE) }, (_, index) => branches.slice(index * MAX_BRANCHES_PER_PAGE, (index + 1) * MAX_BRANCHES_PER_PAGE))
    : [[]];
  return makePdf(pages.map((items, index) => drawPage(drawing, metadata, items, index + 1, pages.length)));
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
