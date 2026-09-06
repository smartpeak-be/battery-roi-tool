import {
  MATERIALS,
  STANDARD_SECTIONS_MM2,
  VOLTAGE_DROP_REFERENCES,
  calculateCable,
  calculatePvArray,
  maxCurrentForDrop,
  maxDistanceForDrop,
  selectCableSection,
  systemDefinition,
} from '../cable-calculator.js';

const $ = id => document.getElementById(id);
const modeNames = {
  required: 'Welke kabel heb ik nodig?',
  capacity: 'Wat kan deze kabel aan?',
  distance: 'Hoe ver geraak ik?',
  check: 'Controleer bestaande kabel',
};
let mode = 'required';
let capacitySliderKW = null;
let formInitialized = false;

function show(id, visible) { $(id)?.classList.toggle('hide', !visible); }
function number(id) { return Number($(id).value); }
function optionalNumber(id) { const value = $(id).value.trim(); return value === '' ? null : Number(value); }
function fmt(value, digits = 1) { return Number(value).toLocaleString('nl-BE', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function fmtSection(value) { return value == null ? 'Buiten bereik' : `${fmt(value, Number.isInteger(value) ? 0 : 1)} mm²`; }
function badge(ok) { return ok ? '<span class="badge text-bg-success">✓</span>' : '<span class="badge text-bg-danger">✕</span>'; }

function circuitIsProduction(input) {
  return !['dc', 'pv'].includes(input.systemType) && ['production', 'bidirectional'].includes(input.circuitType);
}

function targetPercent() {
  return $('dropTarget').value === 'custom' ? number('customDropTarget') : number('dropTarget');
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
  const stringCurrent = number('pvStringCurrent');
  const strings = number('pvParallel');
  return {
    voltage,
    value: stringCurrent * strings,
    pv: { vmpStringV: voltage, vocStringV: null, impTotalA: stringCurrent * strings, iscTotalA: null, mppPowerKW: voltage * stringCurrent * strings / 1000 },
  };
}

function gatherInput() {
  const systemType = $('systemType').value;
  const pv = systemType === 'pv' ? pvInput() : null;
  const isDc = ['dc', 'pv'].includes(systemType);
  const material = $('material').value;
  const input = {
    systemType,
    voltage: systemType === 'pv' ? pv.voltage : number('voltage'),
    inputType: systemType === 'pv' ? 'a' : $('inputType').value,
    value: systemType === 'pv' ? pv.value : number('loadValue'),
    powerFactor: isDc ? 1 : number('powerFactor'),
    lengthM: number('lengthM'),
    sectionMm2: number('sectionMm2'),
    material,
    rhoOhmMm2PerM: number('rho'),
    circuitType: systemType === 'pv' ? 'pv-string' : $('circuitType').value,
    thermalAmpacityA: optionalNumber('thermalAmpacity'),
    cableProfile: { reactanceOhmPerKm: number('reactance') },
  };
  return { input, pv: pv?.pv || null };
}

function systemHint() {
  const type = $('systemType').value;
  const hints = {
    single230: '230 V fase-nul, berekening met automatische heen- en retourfactor.',
    three230: '230 V is de lijnspanning. De driefaseformule gebruikt expliciet √3 × 230 V — niet 230/√3.',
    three400: 'Gebalanceerde driefasige belasting met 400 V lijnspanning.',
    'three400-single': 'Eén fase tegen nul op een 3×400 V + N-net: 230 V en de 1-faseformule.',
    dc: 'Vrije DC-spanning; plus- en retourgeleider worden automatisch meegerekend.',
    pv: 'PV-string op Vmp/Imp. Voc en Isc worden apart getoond, niet als thermisch bewijs gebruikt.',
  };
  $('systemHint').textContent = hints[type];
}

function updateFields() {
  const systemType = $('systemType').value;
  const isDc = ['dc', 'pv'].includes(systemType);
  const isPv = systemType === 'pv';
  if (isPv) $('circuitType').value = 'pv-string';
  $('circuitType').disabled = isPv;
  show('voltageField', !isPv);
  show('pvFields', isPv);
  show('pvSimpleFields', isPv && $('pvMode').value === 'simple');
  show('pvAdvancedFields', isPv && $('pvMode').value === 'advanced');
  show('loadTypeField', !isPv && mode !== 'capacity');
  show('loadValueField', !isPv && mode !== 'capacity');
  show('lengthField', mode !== 'distance');
  show('sectionField', mode !== 'required');
  show('powerFactorField', !isDc);
  show('targetField', mode === 'required');
  show('thermalField', ['capacity', 'check'].includes(mode));
  const custom = $('dropTarget').value === 'custom';
  show('customDropTarget', custom);
  show('customDropUnit', custom);
  $('modeTitle').textContent = modeNames[mode];
  $('powerFactorOutput').textContent = fmt(number('powerFactor'), 2);
  $('loadUnit').textContent = ({ a: 'A', kw: 'kW', kva: 'kVA' })[$('inputType').value];
  $('inputType').querySelector('option[value="kva"]').disabled = isDc;
  if (isDc && $('inputType').value === 'kva') $('inputType').value = 'kw';
  systemHint();
}

function pvSummary(pv) {
  if (!pv) return '';
  return `<div class="cable-pv-summary"><span>Vmp: ${fmt(pv.vmpStringV, 1)} V</span>${pv.vocStringV ? `<span>Voc max.: ${fmt(pv.vocStringV, 1)} V</span>` : ''}<span>Imp: ${fmt(pv.impTotalA, 1)} A</span>${pv.iscTotalA ? `<span>Isc: ${fmt(pv.iscTotalA, 1)} A</span>` : ''}<span>MPP: ${fmt(pv.mppPowerKW, 2)} kW</span></div>`;
}

function hero(calculation, title, pv = null) {
  return `<article class="cable-hero">
    <div class="eyebrow">${calculation.resultLabel}</div>
    <h2>${title}</h2>
    <div>${systemDefinition(calculation.systemType, calculation.nominalVoltageV).label} • ${fmt(calculation.lengthM, 1)} m • ${fmtSection(calculation.sectionMm2)}</div>
    ${pvSummary(pv)}
    <div class="cable-hero-grid">
      <div class="cable-hero-stat"><span>Stroom</span><strong>${fmt(calculation.currentA, 1)} A</strong></div>
      <div class="cable-hero-stat"><span>${calculation.resultLabel}</span><strong>${fmt(calculation.voltageDropV, 2)} V</strong></div>
      <div class="cable-hero-stat"><span>Percentage</span><strong>${fmt(calculation.voltageDropPercent, 2)}%</strong></div>
      <div class="cable-hero-stat"><span>Kabelverlies</span><strong>${fmt(calculation.cableLossW, 0)} W</strong></div>
    </div>
  </article>`;
}

function referenceCards(cards, primary = null, valueKey = 'section') {
  return `<div class="cable-reference-grid">${cards.map(card => `<div class="cable-reference ${card.limit === primary ? 'is-primary' : ''}"><span class="limit">Bij ${card.limit}%</span><strong class="value">${card[valueKey]}</strong>${card.detail ? `<span>${card.detail}</span>` : ''}</div>`).join('')}</div>`;
}

function thermalBlock(limitA, thermalA) {
  const finalA = thermalA == null ? null : Math.min(limitA, thermalA);
  return `<div class="cable-thermal">
    <div><span>Spanningsval-limiet</span><strong>${fmt(limitA, 1)} A</strong></div>
    <div><span>Thermische limiet Iz</span><strong>${thermalA == null ? 'Niet gekend' : `${fmt(thermalA, 1)} A`}</strong></div>
    <div><span>Uiteindelijke limiet</span><strong>${finalA == null ? 'Niet bepaald' : `${fmt(finalA, 1)} A`}</strong></div>
  </div>${thermalA == null ? '<p class="cable-note"><strong>Let op:</strong> dit maximum houdt alleen rekening met spanningsval. Het is geen maximale veilige kabelstroom.</p>' : ''}`;
}

function thermalCheckBlock(currentA, thermalA) {
  const check = thermalA == null ? 'Niet bepaald' : (currentA <= thermalA ? 'Binnen Iz' : 'Iz overschreden');
  return `<div class="cable-thermal">
    <div><span>Bedrijfsstroom Ib</span><strong>${fmt(currentA, 1)} A</strong></div>
    <div><span>Thermische limiet Iz</span><strong>${thermalA == null ? 'Niet gekend' : `${fmt(thermalA, 1)} A`}</strong></div>
    <div><span>Thermische controle</span><strong>${check}</strong></div>
  </div>${thermalA == null ? '<p class="cable-note">Geen thermische uitspraak mogelijk zonder gevalideerde Iz voor kabeltype en plaatsingswijze.</p>' : ''}`;
}

function nearbySections(selected) {
  const index = Math.max(0, STANDARD_SECTIONS_MM2.indexOf(selected));
  return STANDARD_SECTIONS_MM2.slice(Math.max(0, index - 1), Math.min(STANDARD_SECTIONS_MM2.length, index + 4));
}

function sectionComparison(input, sections, selected = null) {
  const rows = sections.map(section => {
    const calc = calculateCable({ ...input, sectionMm2: section });
    return `<tr class="${section === selected ? 'recommended-row' : ''}"><td>${fmtSection(section)}</td><td>${fmt(calc.voltageDropV, 2)} V</td><td>${fmt(calc.voltageDropPercent, 2)}%</td><td>${fmt(calc.cableLossW, 0)} W</td><td>${badge(calc.compliance.under1Percent)}</td><td>${badge(calc.compliance.under2Percent)}</td><td>${badge(calc.compliance.under3Percent)}</td></tr>`;
  }).join('');
  return `<div class="cable-panel"><div class="cable-panel-header"><h3>Vergelijk kabelsecties</h3><span class="text-muted small">1%, 2% en 3%</span></div><div class="cable-panel-body"><table class="table cable-table"><thead><tr><th>Sectie</th><th>ΔU</th><th>ΔU %</th><th>Verlies</th><th>&lt;1%</th><th>≤2%</th><th>≤3%</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderRequired(input, pv) {
  const target = targetPercent();
  const selections = VOLTAGE_DROP_REFERENCES.map(limit => selectCableSection({ ...input, voltageDropTargetPercent: limit }));
  const requested = selectCableSection({ ...input, voltageDropTargetPercent: target });
  if (!requested.calculation) throw new Error('Geen standaardsectie tot 240 mm² voldoet aan de gekozen grens.');
  const cards = selections.map((selection, index) => ({
    limit: VOLTAGE_DROP_REFERENCES[index],
    section: fmtSection(selection.recommendedStandardSectionMm2),
    detail: selection.calculation ? `werkelijk ${fmt(selection.calculation.voltageDropPercent, 2)}%` : 'buiten bereik',
  }));
  const c1011 = circuitIsProduction(input) ? `<div class="cable-status ${requested.calculation.compliance.c1011VoltageRise ? 'ok' : 'danger'}">C10/11-productiedoel &lt;1%: ${requested.calculation.compliance.c1011VoltageRise ? 'voldoet voor dit aspect' : 'voldoet niet met deze gekozen ontwerpgrens'}</div>` : '';
  return `${hero(requested.calculation, `Aanbevolen kabel: ${fmtSection(requested.recommendedStandardSectionMm2)}`, pv)}
    <div class="cable-panel"><div class="cable-panel-header"><h3>Benodigde sectie</h3></div><div class="cable-panel-body"><p>Theoretisch nodig bij ${fmt(target, 1)}%: <strong>${fmt(requested.theoreticalSectionMm2, 2)} mm²</strong></p>${referenceCards(cards, [1,2,3].includes(target) ? target : null)}${c1011}<p class="cable-note">De standaardsectie is gekozen op spanningsval. Zonder gevalideerde Iz is de thermische geschiktheid niet bevestigd.</p></div></div>
    ${sectionComparison(input, nearbySections(requested.recommendedStandardSectionMm2), requested.recommendedStandardSectionMm2)}`;
}

function renderCapacity(input) {
  const limits = VOLTAGE_DROP_REFERENCES.map(limit => maxCurrentForDrop({ ...input, voltageDropTargetPercent: limit }));
  const cards = limits.map(item => ({ limit: item.voltageDropTargetPercent, section: `${fmt(item.voltageDropLimitA, 1)} A`, detail: `${fmt(item.maxActivePowerKW, 2)} kW • ${fmt(item.cableLossW, 0)} W verlies` }));
  const maxKW = Math.max(1, limits[2].maxActivePowerKW * 1.2);
  if (capacitySliderKW == null || capacitySliderKW > maxKW) capacitySliderKW = Math.min(10, maxKW);
  const sliderCalc = calculateCable({ ...input, inputType: 'kw', value: Math.max(.01, capacitySliderKW) });
  const status = dropStatus(sliderCalc, input);
  return `${hero(sliderCalc, `${fmtSection(input.sectionMm2)} bij ${fmt(capacitySliderKW, 2)} kW`)}
    <div class="cable-panel"><div class="cable-panel-header"><h3>Schuif de belasting</h3><strong>${fmt(capacitySliderKW, 2)} kW</strong></div><div class="cable-panel-body"><input id="capacitySlider" class="form-range cable-slider" type="range" min="0.1" max="${maxKW}" step="0.1" value="${capacitySliderKW}">${status}</div></div>
    <div class="cable-panel"><div class="cable-panel-header"><h3>Maximum op basis van spanningsval</h3></div><div class="cable-panel-body">${referenceCards(cards)}<div class="mt-3">${thermalBlock(limits[2].voltageDropLimitA, input.thermalAmpacityA)}</div></div></div>`;
}

function renderDistance(input, pv) {
  const selected = VOLTAGE_DROP_REFERENCES.map(limit => maxDistanceForDrop({ ...input, voltageDropTargetPercent: limit }));
  const atOneMeter = calculateCable({ ...input, lengthM: 1 });
  const cards = selected.map(item => ({ limit: item.voltageDropTargetPercent, section: `${fmt(item.maxDistanceM, 1)} m`, detail: `${fmt(item.currentA, 1)} A` }));
  const rows = STANDARD_SECTIONS_MM2.map(section => {
    const values = VOLTAGE_DROP_REFERENCES.map(limit => maxDistanceForDrop({ ...input, sectionMm2: section, voltageDropTargetPercent: limit }).maxDistanceM);
    return `<tr class="${section === input.sectionMm2 ? 'recommended-row' : ''}"><td>${fmtSection(section)}</td>${values.map(value => `<td>${fmt(value, 1)} m</td>`).join('')}</tr>`;
  }).join('');
  return `${hero({ ...atOneMeter, lengthM: selected[0].maxDistanceM, voltageDropV: atOneMeter.nominalVoltageV * .01, voltageDropPercent: 1, cableLossW: atOneMeter.cableLossW * selected[0].maxDistanceM }, `Maximaal ${fmt(selected[0].maxDistanceM, 1)} m bij 1%`, pv)}
    <div class="cable-panel"><div class="cable-panel-header"><h3>Maximale enkele trajectlengte</h3></div><div class="cable-panel-body">${referenceCards(cards)}</div></div>
    <div class="cable-panel"><div class="cable-panel-header"><h3>Afstand per standaardsectie</h3></div><div class="cable-panel-body"><table class="table cable-table"><thead><tr><th>Sectie</th><th>1%</th><th>2%</th><th>3%</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function dropStatus(calc, input) {
  if (circuitIsProduction(input)) {
    return `<div class="cable-status ${calc.compliance.c1011VoltageRise ? 'ok' : 'danger'}">${calc.compliance.c1011VoltageRise ? 'Onder 1%: voldoet aan de C10/11-doelwaarde voor dit aspect.' : 'Niet conform de C10/11-doelwaarde voor productie: de spanningsstijging moet strikt kleiner dan 1% zijn.'}</div>`;
  }
  const pct = calc.voltageDropPercent;
  const status = pct <= 1 ? ['ok', '≤1%'] : pct <= 2 ? ['near', '>1% en ≤2%'] : pct <= 3 ? ['warn', '>2% en ≤3%'] : ['danger', '>3%'];
  return `<div class="cable-status ${status[0]}">${status[1]} — ontwerpstatus op basis van de gekozen vergelijkingsgrenzen.</div>`;
}

function renderCheck(input, pv) {
  const calc = calculateCable(input);
  const cards = VOLTAGE_DROP_REFERENCES.map(limit => ({ limit, section: calc.voltageDropPercent < limit || (limit !== 1 && calc.voltageDropPercent <= limit) ? 'Binnen grens' : 'Buiten grens', detail: `${fmt(calc.voltageDropPercent, 2)}%` }));
  return `${hero(calc, `${calc.resultLabel}: ${fmt(calc.voltageDropPercent, 2)}%`, pv)}${dropStatus(calc, input)}
    <div class="cable-panel"><div class="cable-panel-header"><h3>Controle</h3></div><div class="cable-panel-body"><p>Spanning aan einde: <strong>${fmt(calc.endVoltageV, 2)} V</strong> • kabelverlies: <strong>${fmt(calc.cableLossW, 0)} W / ${fmt(calc.cableLossPercent, 2)}%</strong></p>${referenceCards(cards)}<div class="mt-3">${thermalCheckBlock(calc.currentA, input.thermalAmpacityA)}</div></div></div>
    ${sectionComparison(input, nearbySections(input.sectionMm2), input.sectionMm2)}`;
}

function render() {
  updateFields();
  try {
    const { input, pv } = gatherInput();
    let html = '';
    if (mode === 'required') html = renderRequired(input, pv);
    if (mode === 'capacity') html = renderCapacity(input);
    if (mode === 'distance') html = renderDistance(input, pv);
    if (mode === 'check') html = renderCheck(input, pv);
    $('resultContent').innerHTML = html;
    show('validationError', false);
  } catch (error) {
    $('validationError').textContent = error.message || 'Controleer de invoer.';
    show('validationError', true);
    $('resultContent').innerHTML = '';
  }
}

function applyApplicationPreset(value) {
  const mapping = {
    consumer: { circuit: 'consumer' },
    ev: { circuit: 'consumer' },
    'pv-inverter': { circuit: 'production', target: '1' },
    'battery-inverter': { circuit: 'bidirectional', target: '1' },
    'dc-battery': { circuit: 'bidirectional', system: 'dc', target: '1' },
    'pv-string': { circuit: 'pv-string', system: 'pv', target: '1' },
  };
  const preset = mapping[value];
  if (!preset) return;
  if (preset.system) {
    $('systemType').value = preset.system;
    if (preset.system === 'dc') $('voltage').value = '600';
  }
  $('circuitType').value = preset.circuit;
  if (preset.target) $('dropTarget').value = preset.target;
}

function initForm() {
  if (formInitialized) return;
  formInitialized = true;
  $('sectionMm2').innerHTML = STANDARD_SECTIONS_MM2.map(section => `<option value="${section}" ${section === 6 ? 'selected' : ''}>${fmtSection(section)}</option>`).join('');
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('is-active', item === button));
    capacitySliderKW = null;
    render();
  }));
  $('cableForm').addEventListener('input', event => {
    if (event.target.id === 'material') $('rho').value = MATERIALS[event.target.value].rhoOhmMm2PerM;
    render();
  });
  $('cableForm').addEventListener('change', event => {
    if (event.target.id === 'applicationPreset') applyApplicationPreset(event.target.value);
    if (event.target.id === 'circuitType' && ['production', 'bidirectional'].includes(event.target.value)) $('dropTarget').value = '1';
    if (event.target.id === 'systemType') {
      const defaults = { single230: 230, three230: 230, three400: 400, 'three400-single': 230, dc: 600 };
      if (defaults[event.target.value]) $('voltage').value = defaults[event.target.value];
      if (event.target.value === 'pv') $('applicationPreset').value = 'pv-string';
    }
    render();
  });
  $('resultContent').addEventListener('input', event => {
    if (event.target.id === 'capacitySlider') {
      capacitySliderKW = Number(event.target.value);
      render();
    }
  });
  render();
}

function setAccessState(name) {
  ['stateLoggedOut', 'stateNotWhitelisted', 'stateAuthorized'].forEach(id => show(id, id === name));
}

async function start() {
  initFirebase();
  $('btnSignIn').addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (error) { $('signInError').textContent = error.message; show('signInError', true); }
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
