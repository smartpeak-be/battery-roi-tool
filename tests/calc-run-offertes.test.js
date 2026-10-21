import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadFirebaseInit() {
  const src = readFileSync(new URL('../assets/js/firebase-init.js', import.meta.url), 'utf8');
  const ctx = { firebase: { firestore: () => ({}) }, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

const { planCalcRunOfferteChanges } = loadFirebaseInit();
const pdf = (extra = {}) => ({ storagePath: 'projects/p/offertes/x.pdf', ...extra });

describe('saving a calculation keeps existing offertes', () => {
  it('carries the offerte over when a catalog config reopens as a composition with a new key', () => {
    const plan = planCalcRunOfferteChanges({
      prevSelected: ['PC_abc'],
      newSelected: ['CUSTOM_1'],
      offertes: { PC_abc: pdf({ billitOrderId: 42 }) },
      typeAliases: { CUSTOM_1: 'PC_abc' },
    });
    expect(plan.moves).toEqual([['PC_abc', 'CUSTOM_1']]);
    expect(plan.deletes).toEqual([]);
  });

  it('never deletes an offerte that already has a Billit offer or invoices', () => {
    const plan = planCalcRunOfferteChanges({
      prevSelected: ['A', 'B', 'C'],
      newSelected: [],
      offertes: { A: pdf({ billitOrderId: 1 }), B: pdf({ billitInvoices: [{ id: 2 }] }), C: pdf() },
    });
    expect(plan.kept).toEqual(['A', 'B']);
    expect(plan.deletes).toEqual(['C']);
  });

  it('leaves offertes of configs that are still selected alone', () => {
    const plan = planCalcRunOfferteChanges({
      prevSelected: ['A'], newSelected: ['A'], offertes: { A: pdf() }, typeAliases: {},
    });
    expect(plan).toMatchObject({ moves: [], deletes: [], kept: [] });
  });
});
