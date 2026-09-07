import {
  MATERIALS,
  STANDARD_SECTIONS_MM2,
  VOLTAGE_DROP_REFERENCES,
  calculateCable,
  calculatePvArray,
  maxCurrentForDrop,
  maxDistanceForDrop,
  selectCableSection,
} from '../cable-calculator.js';

const $ = id => document.getElementById(id);
let initialized = false;

function show(id, visible) { $(id)?.classList.toggle('hide', !visible); }
function number(id) { return Number($(id).value); }
function optionalNumber(id) {
  const value = $(id).value.trim();
  return value === '' ? null : Number(value);
}
function fmt(value, digits = 1) {
  return Number(value).toLocaleString('nl-BE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
function section(value) {
  return value == null ? 'Buiten bereik' : `${fmt(value, Number.isInteger(value) ? 0 : 1)} mm²`;
}
function targetPercent() {
  return $('dropTarget').value === 'custom' ? number('customDropTarget') : number('dropTarget');
}
function isProduction(input) {
  return !['dc', 'pv'].includes(input.systemType)
    && ['production', 'bidirectional'].includes(input.circuitType);
}

function pvInput() {
  if ($('pvMode').value === 'advanced') {
    const pv = calculatePvArray({
      vmpPanelV: number('pvVmpPanel'),
      vocPanelV: number('pvVocPanel'),
      impPanelA: number('pvImpPanel'),
      iscPanelA: number('pvIscPanel'),
      panelsSeries: number('pvSeries'),
      stringsParallel: number('pvAdvancedParallel'),
    });
    return { voltage: pv.vmpStringV, value: pv.impTotalA, pv };
  }
  const voltage = number('pvStringVoltage');
  const current = number('pvStringCurrent') * number('pvParallel');
  return {
    voltage,
    value: current,
    pv: {
      vmpStringV: voltage,
      vocStringV: null,
      impTotalA: current,
      iscTotalA: null,
      mppPowerKW: voltage * current / 1000,
    },
  };
}

function gatherInput() {
  const systemType = $('systemType').value;
  const pv = systemType === 'pv' ? pvInput() : null;
  const dc = ['dc', 'pv'].includes(systemType);
  return {
    input: {
      systemType,
      voltage: pv ? pv.voltage : number('voltage'),
      inputType: pv ? 'a' : $('inputType').value,
      value: pv ? pv.value : number('loadValue'),
      powerFactor: dc ? 1 : number('powerFactor'),
      lengthM: number('lengthM'),
      sectionMm2: number('sectionMm2'),
      material: $('material').value,
      rhoOhmMm2PerM: number('rho'),
      circuitType: pv ? 'pv-string' : $('circuitType').value,
      thermalAmpacityA: optionalNumber('thermalAmpacity'),
      cableProfile: { reactanceOhmPerKm: number('reactance') },
    },
    pv: pv?.pv || null,
  };
}

function limitCards(items) {
  return `<div class="cable-limits">${items.map(item => `
    <div class="cable-limit ${item.active ? 'active' : ''}">
      <span>${item.limit}%</span>
      <strong>${item.value}</strong>
      ${item.detail ? `<small>${item.detail}</small>` : ''}
    </div>`).join('')}</div>`;
}

function answer(title, meta, details = '') {
  return `<article class="cable-answer">
    <span class="cable-answer-label">Resultaat</span>
    <strong>${title}</strong>
    <p>${meta}</p>
    ${details}
  </article>`;
}

function safetyLine(input, calculation = null) {
  if (!calculation) return '<p class="cable-result-note">Thermische grens onbekend.</p>';
  const thermal = calculation.thermalAmpacityA == null
    ? 'Thermische grens onbekend.'
    : calculation.thermalLimitSource === 'explicit-iz'
      ? `Iz ${fmt(calculation.thermalAmpacityA, 1)} A: ${calculation.thermalWithinLimit ? 'ok' : 'overschreden'}.`
      : `Indicatieve stroomgrens ${fmt(calculation.thermalAmpacityA, 0)} A: ${calculation.thermalWithinLimit ? 'ok' : 'overschreden'}.`;
  const c1011 = isProduction(input)
    ? `<span class="${calculation.compliance.c1011VoltageRise ? 'text-success' : 'text-danger'}">C10/11 &lt;1%: ${calculation.compliance.c1011VoltageRise ? 'ok' : 'niet ok'}.</span>`
    : '';
  const thermalClass = calculation.thermalWithinLimit === false ? ' danger' : '';
  return `<p class="cable-result-note${thermalClass}">${thermal} ${c1011}</p>`;
}

function renderRequired(input) {
  const target = targetPercent();
  const choices = VOLTAGE_DROP_REFERENCES.map(limit => selectCableSection({
    ...input,
    voltageDropTargetPercent: limit,
  }));
  const selected = selectCableSection({ ...input, voltageDropTargetPercent: target });
  if (!selected.calculation) throw new Error('Geen standaard kabelsectie gevonden.');

  const cards = choices.map((choice, index) => ({
    limit: VOLTAGE_DROP_REFERENCES[index],
    value: section(choice.recommendedStandardSectionMm2),
    detail: choice.calculation ? `${fmt(choice.calculation.voltageDropPercent, 2)}% werkelijk` : '',
    active: VOLTAGE_DROP_REFERENCES[index] === target,
  }));
  const calc = selected.calculation;
  return `${answer(
    section(selected.recommendedStandardSectionMm2),
    `${fmt(calc.currentA, 1)} A · ${fmt(calc.voltageDropV, 1)} V verlies · ${fmt(calc.voltageDropPercent, 2)}%`,
  )}${limitCards(cards)}${safetyLine(input, calc)}`;
}

function renderCheck(input) {
  const calc = calculateCable(input);
  const target = targetPercent();
  const voltageOk = isProduction(input)
    ? calc.compliance.c1011VoltageRise
    : calc.voltageDropPercent <= target;
  const ok = voltageOk && calc.thermalWithinLimit !== false;
  const title = calc.thermalWithinLimit === false
    ? 'Te veel stroom voor deze kabel'
    : ok ? 'Binnen de gekozen grens' : 'Spanningsval is te hoog';
  const cards = VOLTAGE_DROP_REFERENCES.map(limit => ({
    limit,
    value: calc.voltageDropPercent < limit || (limit !== 1 && calc.voltageDropPercent <= limit) ? 'OK' : 'Te hoog',
    active: limit === target,
  }));
  return `${answer(
    title,
    `${section(input.sectionMm2)} · ${fmt(calc.currentA, 1)} A · ${fmt(calc.voltageDropV, 1)} V · ${fmt(calc.voltageDropPercent, 2)}%`,
  )}${limitCards(cards)}${safetyLine(input, calc)}`;
}

function renderCapacity(input) {
  const target = targetPercent();
  const values = VOLTAGE_DROP_REFERENCES.map(limit => maxCurrentForDrop({
    ...input,
    voltageDropTargetPercent: limit,
  }));
  const allowed = value => {
    const currentA = value.finalAllowedCurrentA ?? value.voltageDropLimitA;
    const calculation = calculateCable({ ...input, inputType: 'a', value: currentA });
    return {
      currentA,
      powerKW: calculation.activePowerKW,
      thermalLimited: value.thermalAmpacityA != null && value.thermalAmpacityA < value.voltageDropLimitA,
      calculation,
    };
  };
  const chosenRaw = values[VOLTAGE_DROP_REFERENCES.indexOf(target)]
    || maxCurrentForDrop({ ...input, voltageDropTargetPercent: target });
  const chosen = allowed(chosenRaw);
  const cards = values.map(value => {
    const final = allowed(value);
    return {
      limit: value.voltageDropTargetPercent,
      value: `${fmt(final.powerKW, 1)} kW`,
      detail: `${fmt(final.currentA, 1)} A${final.thermalLimited ? ' · thermisch' : ''}`,
      active: value.voltageDropTargetPercent === target,
    };
  });
  return `${answer(
    `${fmt(chosen.powerKW, 1)} kW / ${fmt(chosen.currentA, 1)} A`,
    `${section(input.sectionMm2)} · grens door ${chosen.thermalLimited ? 'stroom' : `${fmt(target, 1)}% spanningsval`}`,
  )}${limitCards(cards)}${safetyLine(input, chosen.calculation)}`;
}

function renderDistance(input) {
  const target = targetPercent();
  const values = VOLTAGE_DROP_REFERENCES.map(limit => maxDistanceForDrop({
    ...input,
    voltageDropTargetPercent: limit,
  }));
  const chosen = values[VOLTAGE_DROP_REFERENCES.indexOf(target)]
    || maxDistanceForDrop({ ...input, voltageDropTargetPercent: target });
  const cards = values.map(value => ({
    limit: value.voltageDropTargetPercent,
    value: `${fmt(value.maxDistanceM, 1)} m`,
    active: value.voltageDropTargetPercent === target,
  }));
  const loadCalculation = calculateCable({ ...input, lengthM: Math.max(0.1, chosen.maxDistanceM) });
  const title = loadCalculation.thermalWithinLimit === false
    ? 'Te veel stroom voor deze kabel'
    : `${fmt(chosen.maxDistanceM, 1)} meter`;
  return `${answer(
    title,
    `${section(input.sectionMm2)} · ${fmt(chosen.currentA, 1)} A · bij ${fmt(target, 1)}% spanningsval`,
  )}${limitCards(cards)}${safetyLine(input, loadCalculation)}`;
}

function updateFields() {
  const mode = $('calculationMode').value;
  const systemType = $('systemType').value;
  const pv = systemType === 'pv';
  const dc = ['dc', 'pv'].includes(systemType);

  if (pv) $('circuitType').value = 'pv-string';
  $('circuitType').disabled = pv;
  show('loadTypeField', !pv && mode !== 'capacity');
  show('loadValueField', !pv && mode !== 'capacity');
  show('lengthField', mode !== 'distance');
  show('sectionField', mode !== 'required');
  show('voltageField', !pv);
  show('powerFactorField', !dc);
  show('pvFields', pv);
  show('pvSimpleFields', pv && $('pvMode').value === 'simple');
  show('pvAdvancedFields', pv && $('pvMode').value === 'advanced');
  show('customDropTarget', $('dropTarget').value === 'custom');
  show('customDropUnit', $('dropTarget').value === 'custom');

  $('loadUnit').textContent = ({ a: 'A', kw: 'kW', kva: 'kVA' })[$('inputType').value];
  $('powerFactorOutput').textContent = fmt(number('powerFactor'), 2);
  $('inputType').querySelector('option[value="kva"]').disabled = dc;
  if (dc && $('inputType').value === 'kva') $('inputType').value = 'kw';
}

function updateSectionSafety(input, mode) {
  const element = $('sectionSafety');
  if (!element || mode === 'required') return;
  const calculation = calculateCable(input);
  const limit = calculation.thermalAmpacityA;
  element.className = 'cable-input-safety';
  if (limit == null) {
    element.textContent = 'Stroomgrens onbekend — vul Iz in bij Meer opties.';
    element.classList.add('unknown');
    return;
  }
  const prefix = calculation.thermalLimitSource === 'explicit-iz' ? 'Ingevoerde Iz' : 'Indicatieve stroomgrens';
  if (mode === 'capacity') {
    element.textContent = `${prefix}: ${fmt(limit, 0)} A`;
    element.classList.add('ok');
    return;
  }
  element.textContent = `${prefix}: ${fmt(limit, 0)} A · belasting ${fmt(calculation.currentA, 1)} A · ${calculation.thermalWithinLimit ? 'OK' : 'TE HOOG'}`;
  element.classList.add(calculation.thermalWithinLimit ? 'ok' : 'danger');
}

function render() {
  updateFields();
  try {
    const { input } = gatherInput();
    const mode = $('calculationMode').value;
    updateSectionSafety(input, mode);
    const renderers = {
      required: renderRequired,
      check: renderCheck,
      capacity: renderCapacity,
      distance: renderDistance,
    };
    $('resultContent').innerHTML = renderers[mode](input);
    show('validationError', false);
  } catch (error) {
    $('validationError').textContent = error.message || 'Controleer de invoer.';
    $('resultContent').innerHTML = '';
    show('validationError', true);
  }
}

function setSystemDefaults(type) {
  const defaults = {
    single230: 230,
    three230: 230,
    three400: 400,
    'three400-single': 230,
    dc: 600,
  };
  if (defaults[type]) $('voltage').value = defaults[type];
  if (type === 'pv') $('circuitType').value = 'pv-string';
}

function initForm() {
  if (initialized) return;
  initialized = true;
  $('sectionMm2').innerHTML = STANDARD_SECTIONS_MM2.map(value =>
    `<option value="${value}" ${value === 6 ? 'selected' : ''}>${section(value)}</option>`,
  ).join('');

  $('cableForm').addEventListener('input', event => {
    if (event.target.id === 'material') $('rho').value = MATERIALS[event.target.value].rhoOhmMm2PerM;
    render();
  });
  $('cableForm').addEventListener('change', event => {
    if (event.target.id === 'systemType') setSystemDefaults(event.target.value);
    if (event.target.id === 'circuitType') {
      $('dropTarget').value = ['production', 'bidirectional'].includes(event.target.value) ? '1' : '3';
    }
    render();
  });
  render();
}

function setAccessState(name) {
  ['stateLoggedOut', 'stateNotWhitelisted', 'stateAuthorized'].forEach(id => show(id, id === name));
}

async function start() {
  initFirebase();
  $('btnSignIn').addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      $('signInError').textContent = error.message;
      show('signInError', true);
    }
  });
  $('btnSignOutNW').addEventListener('click', () => signOut());
  onAuthStateChanged(user => {
    if (!user) return setAccessState('stateLoggedOut');
    if (!isWhitelisted(user)) return setAccessState('stateNotWhitelisted');
    setAccessState('stateAuthorized');
    initForm();
  });
}

start().catch(error => {
  console.error(error);
  $('signInError').textContent = error.message;
  show('signInError', true);
  setAccessState('stateLoggedOut');
});
