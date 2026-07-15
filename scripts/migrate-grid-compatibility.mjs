#!/usr/bin/env node
/* global process, console, URL */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

export const GRID_COMPATIBILITY_MIGRATION = Object.freeze([
  {
    brand: 'Sigenergy',
    model: 'Sigen Power Sensor SP-DH',
    gridCompatibility: ['1x230'],
    evidence: 'Sigen Power Sensor datasheet: grid connection type 1P2W, 176-276 Vac; SP-DH manual: 230 V AC.',
  },
  {
    brand: 'Sigenergy',
    model: 'Sigen Power Sensor TP-CT120-DH',
    gridCompatibility: ['3x230', '3x400+N'],
    evidence: 'Sigen Power Sensor datasheet: TP sensor supports 3P3W/3P4W, 173-480 Vac.',
  },
  {
    brand: 'Sigenergy',
    model: 'Sigen Energy Controller 10.0 TP BE',
    gridCompatibility: ['3x400+N'],
    evidence: 'Sigen Energy Controller three-phase datasheet: nominal output voltage 380/400 V; installation manual uses L1/L2/L3/N/PE.',
  },
  {
    brand: 'Sigenergy',
    model: 'Sigen Energy Controller 10.0 TP BE Low Voltage',
    gridCompatibility: ['3x230'],
    evidence: 'Sigen Energy Controller 10.0 TPLV-BE datasheet: Belgian low-voltage delta grid, nominal three-phase output 220/230 V.',
  },
  {
    brand: 'Sigenergy',
    model: 'Sigen Energy Controller 4.6 SP',
    gridCompatibility: ['1x230'],
    evidence: 'Sigen Energy Controller SP datasheet/manual: single phase, 220/230/240 V, L/N/PE.',
  },
  {
    brand: 'Sigenergy',
    model: 'Sigen Energy Controller 5.0 SP',
    gridCompatibility: ['1x230'],
    evidence: 'Sigen Energy Controller SP datasheet/manual: single phase, 220/230/240 V, L/N/PE.',
  },
  {
    brand: 'Solis',
    model: 'S6-EH1P5K-L-PLUS',
    gridCompatibility: ['1x230'],
    evidence: 'Solis datasheet/manual: operation phase 1/N/PE and rated grid voltage 220/230 V.',
  },
  {
    brand: 'Solis',
    model: 'S6-EH3P10K02-NV-YD-L',
    gridCompatibility: ['3x400+N'],
    evidence: 'Solis datasheet/manual: rated grid voltage 3/N/PE, 220/380 V or 230/400 V.',
  },
  {
    brand: 'Marstek',
    model: 'Venus E V03',
    gridCompatibility: ['1x230'],
    evidence: 'Marstek Venus E 3.0 manual: grid connection type L/N/PE, rated grid voltage 230 V.',
  },
  {
    brand: 'SMA',
    model: 'Pakket 2x3.6kw + 5kw omvormer',
    gridCompatibility: ['1x230'],
    evidence: 'Included SMA Sunny Boy Smart Energy datasheet: single-phase nominal AC voltage 230/240 V.',
  },
  {
    brand: 'Zendure',
    model: 'Mix 3000',
    gridCompatibility: ['1x230'],
    evidence: 'Zendure SolarFlow 3000 Mix AC manual: 230 V AC and connection through a Schuko household socket.',
  },
  {
    brand: 'Zendure',
    model: 'Mix 4000',
    gridCompatibility: ['1x230'],
    evidence: 'Zendure SolarFlow 4000 Mix manual: 230 V AC and three-core L/N/PE grid cable.',
  },
  {
    brand: 'Zendure',
    model: 'Solarflow 2400 AC+',
    gridCompatibility: ['1x230'],
    evidence: 'Zendure SolarFlow 2400 AC+ manual: 230 V AC and household socket/dedicated single-phase circuit connection.',
  },
]);

function sameArray(a, b) {
  return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(b);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const app = admin.initializeApp({ projectId: 'smartpeak-projects' });
  const db = admin.firestore(app);
  const snap = await db.collection('products').get();
  const products = snap.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
  const changes = [];
  const errors = [];

  for (const target of GRID_COMPATIBILITY_MIGRATION) {
    const matches = products.filter(product => product.brand === target.brand && product.model === target.model);
    if (matches.length !== 1) {
      errors.push(`${target.brand} ${target.model}: expected 1 match, found ${matches.length}`);
      continue;
    }
    const product = matches[0];
    const changed = !sameArray(product.gridCompatibility, target.gridCompatibility)
      || product.gridCompatibilityEvidence !== target.evidence;
    changes.push({
      id: product.id,
      product: `${target.brand} ${target.model}`,
      before: product.gridCompatibility || [],
      after: target.gridCompatibility,
      changed,
    });
    if (apply && changed) {
      await product.ref.update({
        gridCompatibility: target.gridCompatibility,
        gridCompatibilityEvidence: target.evidence,
        gridCompatibilityVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'amai-grid-compatibility-migration',
      });
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', changes, errors }, null, 2));
  await app.delete();
  if (errors.length) process.exitCode = 1;
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
