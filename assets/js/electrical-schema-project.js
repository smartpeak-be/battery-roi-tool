import { addBranch, createEmptyDrawing, polesForConnection } from './electrical-schema-model.js';

const STANDARD_BREAKERS = [16, 20, 25, 32, 40, 50, 63];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function recommendedBreakerAmperage(powerKw, connectionType, mainBreakerAmperage = 63) {
  const powerW = Math.max(0, number(powerKw)) * 1000;
  const current = connectionType === '3x400+N'
    ? powerW / (Math.sqrt(3) * 400)
    : connectionType === '3x230'
      ? powerW / (Math.sqrt(3) * 230)
      : powerW / 230;
  const limit = Math.max(1, number(mainBreakerAmperage, 63));
  return STANDARD_BREAKERS.find(value => value >= current && value <= limit)
    || [...STANDARD_BREAKERS].reverse().find(value => value <= limit)
    || limit;
}

function productMaps(products, categories) {
  return {
    products: new Map((products || []).map(product => [product.id, product])),
    categories: new Map((categories || []).map(category => [category.id, category])),
  };
}

function kindFor(product, item, categoriesById) {
  if (['battery', 'inverter', 'system'].includes(item?.kind)) return item.kind;
  const slug = product?.categorySlug || categoriesById.get(product?.categoryId)?.slug || '';
  if (slug === 'batterijen') return 'battery';
  if (slug === 'omvormers') return 'inverter';
  if (slug === 'thuisbatterij-systemen') return 'system';
  return '';
}

function selectedItems(project, configs) {
  const installed = project?.installedSolution?.items;
  if (Array.isArray(installed) && installed.length) return { items: installed, source: 'Geplaatste oplossing' };
  const cfg = project?.lastCalcRun?.results?.configResults?.[0]?.cfg || {};
  if (Array.isArray(cfg.items) && cfg.items.length) return { items: cfg.items, source: 'Gekozen oplossing' };
  const configId = cfg.productConfigId
    || (typeof cfg.type === 'string' && cfg.type.startsWith('PC_') ? cfg.type.slice(3) : '')
    || cfg.composition?.baseProductConfigId || '';
  return { items: (configs || []).find(config => config.id === configId)?.items || [], source: 'Gekozen oplossing' };
}

function serialQueues(project) {
  const queues = { battery: [], inverter: [], system: [] };
  (project?.serialNumbers || []).forEach(entry => {
    const value = String(entry?.value || '').trim();
    if (!value) return;
    if (entry.category === 'batterij') queues.battery.push(value);
    else if (entry.category === 'omvormer') queues.inverter.push(value);
    else if (entry.category === 'omvormer_batterij') queues.system.push(value);
  });
  return queues;
}

function cableFor(amperage, connectionType) {
  const section = amperage <= 20 ? '2,5' : amperage <= 25 ? '4' : amperage <= 40 ? '6' : '10';
  const conductors = connectionType === '3x400+N' ? '5G' : connectionType === '3x230' ? '4G' : '3G';
  return `${conductors}${section}`;
}

function expandedSolutionItems(project, data) {
  const maps = productMaps(data.products, data.categories);
  const selected = selectedItems(project, data.configs);
  const expanded = [];
  selected.items.forEach(item => {
    const product = maps.products.get(item.productId) || {};
    const specs = { ...(product.specs || {}), ...(item.specs || {}) };
    const kind = kindFor(product, item, maps.categories);
    if (!kind) return;
    const quantity = Math.max(1, Math.trunc(number(item.quantity ?? item.qty, 1)));
    for (let index = 0; index < quantity; index += 1) {
      expanded.push({
        kind, product, specs,
        label: item.label || [product.brand, product.model].filter(Boolean).join(' ') || kind,
        source: selected.source,
      });
    }
  });
  return expanded;
}

export function drawingFromProject(project = {}, data = {}) {
  const connectionType = project?.electrical?.connectionType || '';
  const mainAmperage = number(project?.electrical?.fuseRatingA, 40);
  let drawing = createEmptyDrawing({
    projectId: project.id || null,
    title: `Eendraadschema - ${project.projectName || project.customerName || 'project'}`,
    connectionType,
    mainBreakerAmperage: mainAmperage,
  });
  drawing.differentials[0] = {
    ...drawing.differentials[0],
    amperage: mainAmperage,
    poles: polesForConnection(connectionType),
  };
  const rootId = drawing.differentials[0].id;
  const items = expandedSolutionItems(project, data);
  const serials = serialQueues(project);
  const totalStorage = items.reduce((sum, item) => sum + number(item.specs.capacityKwh), 0);
  const inverters = items.filter(item => item.kind === 'inverter');
  const batteries = items.filter(item => item.kind === 'battery');
  const systems = items.filter(item => item.kind === 'system');
  const branches = [];

  systems.forEach(item => branches.push({ item, endpointType: 'hybrid-inverter', batteryItems: [item] }));
  if (inverters.length === 1 && batteries.length) branches.push({ item: inverters[0], endpointType: 'hybrid-inverter', batteryItems: batteries });
  else {
    inverters.forEach(item => branches.push({ item, endpointType: 'inverter', batteryItems: [] }));
    batteries.forEach(item => branches.push({ item, endpointType: 'battery', batteryItems: [item] }));
  }

  branches.forEach(({ item, endpointType, batteryItems }) => {
    const branchStorage = batteryItems.reduce((sum, battery) => sum + number(battery.specs.capacityKwh), 0);
    const batteryVoltage = batteryItems.map(battery => number(battery.specs.nominalVoltage)).find(Boolean) || number(item.specs.nominalVoltage);
    const powerKw = number(item.specs.inverterPowerKw || item.specs.maxDischargePowerW / 1000);
    const breakerAmperage = recommendedBreakerAmperage(powerKw, connectionType, mainAmperage);
    const customProperties = [];
    if (batteryVoltage > 0) customProperties.push({ key: 'U', value: `${batteryVoltage} V DC` });
    if (totalStorage > 0 && endpointType === 'hybrid-inverter') customProperties.push({ key: 'E totaal', value: `${Math.round(totalStorage * 100) / 100} kWh` });
    if (item.specs.chemistry) customProperties.push({ key: 'Chemie', value: String(item.specs.chemistry) });
    customProperties.push({ key: 'Bron', value: item.source });
    const batterySerials = batteryItems.map(() => serials.battery.shift()).filter(Boolean);
    batterySerials.forEach((value, index) => customProperties.push({ key: `Batterij SN ${index + 1}`, value }));
    const serialNumber = item.kind === 'system'
      ? serials.system.shift() || serials.inverter.shift() || ''
      : item.kind === 'inverter' ? serials.inverter.shift() || '' : batterySerials[0] || '';
    const batteryLabel = batteryItems.length ? batteryItems[0].label : '';
    const label = endpointType === 'hybrid-inverter' && batteryLabel && item.kind === 'inverter' ? `${item.label} + ${batteryItems.length}x ${batteryLabel}` : item.label;
    drawing = addBranch(drawing, rootId, endpointType, {
      breaker: {
        label: `${item.label} automaat`, amperage: breakerAmperage,
        poles: polesForConnection(connectionType), curve: 'C',
      },
      endpoint: {
        label,
        brand: item.product.brand || '', model: item.product.model || '', serialNumber,
        powerKw: powerKw || null,
        capacityKwh: branchStorage || null,
        cable: cableFor(breakerAmperage, connectionType),
        customProperties,
      },
    });
  });
  return drawing;
}
