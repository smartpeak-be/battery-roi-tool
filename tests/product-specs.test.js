// tests/product-specs.test.js
// Unit tests for product-specs.js spec field definitions and category filtering.

import { describe, test, assert } from 'vitest';
import { SPEC_FIELDS, specsForCategory } from '../assets/js/product-specs.js';

describe('SPEC_FIELDS', () => {
  test('all fields have required properties', () => {
    for (const field of SPEC_FIELDS) {
      assert.ok(field.key, `Field missing key: ${JSON.stringify(field)}`);
      assert.ok(field.label, `Field "${field.key}" missing label`);
      assert.ok(Object.hasOwn(field, 'unit'), `Field "${field.key}" missing unit property`);
      assert.ok(field.type, `Field "${field.key}" missing type`);
      assert.ok(Array.isArray(field.categories), `Field "${field.key}" categories is not an array`);
      assert.ok(field.categories.length > 0, `Field "${field.key}" has empty categories array`);
    }
  });

  test('select fields have options array', () => {
    const selectFields = SPEC_FIELDS.filter(f => f.type === 'select');
    for (const field of selectFields) {
      assert.ok(Array.isArray(field.options), `Select field "${field.key}" missing options array`);
      assert.ok(field.options.length > 0, `Select field "${field.key}" has empty options array`);
    }
  });

  test('non-select fields do not have options', () => {
    const nonSelectFields = SPEC_FIELDS.filter(f => f.type !== 'select');
    for (const field of nonSelectFields) {
      assert.strictEqual(field.options, undefined, `Non-select field "${field.key}" should not have options`);
    }
  });
});

describe('specsForCategory', () => {
  test('returns battery-specific fields for "batterijen"', () => {
    const fields = specsForCategory('batterijen');

    // Battery-specific fields (8)
    const batteryOnlyKeys = [
      'capacityKwh',
      'nominalVoltage',
      'chemistry',
      'cycleLife',
      'maxChargePowerW',
      'maxDischargePowerW',
      'depthOfDischarge',
      'selfHeating'
    ];

    for (const key of batteryOnlyKeys) {
      const found = fields.find(f => f.key === key);
      assert.ok(found, `Battery field "${key}" not found in batterijen category`);
      assert.ok(found.categories.includes('batterijen'), `Field "${key}" should include batterijen in categories`);
    }

    // Should also include shared fields
    assert.ok(fields.find(f => f.key === 'efficiency'), 'Should include efficiency (shared with omvormers)');
    assert.ok(fields.find(f => f.key === 'weightKg'), 'Should include weightKg (shared with all)');
    assert.ok(fields.find(f => f.key === 'ipRating'), 'Should include ipRating (shared with omvormers)');
  });

  test('returns inverter-specific fields for "omvormers"', () => {
    const fields = specsForCategory('omvormers');

    // Inverter-specific fields (6)
    const inverterOnlyKeys = [
      'inverterPowerKw',
      'peakPowerKw',
      'maxAcInputKw',
      'maxPvInputKw',
      'mpptCount',
      'phases'
    ];

    for (const key of inverterOnlyKeys) {
      const found = fields.find(f => f.key === key);
      assert.ok(found, `Inverter field "${key}" not found in omvormers category`);
      assert.ok(found.categories.includes('omvormers'), `Field "${key}" should include omvormers in categories`);
    }

    // Should also include shared fields
    assert.ok(fields.find(f => f.key === 'efficiency'), 'Should include efficiency (shared with batterijen)');
    assert.ok(fields.find(f => f.key === 'weightKg'), 'Should include weightKg (shared with all)');
    assert.ok(fields.find(f => f.key === 'ipRating'), 'Should include ipRating (shared with batterijen)');
  });

  test('returns only dimension/weight fields for "materiaal"', () => {
    const fields = specsForCategory('materiaal');

    // Materiaal gets only the 4 dimension/weight fields
    const materiaalKeys = ['weightKg', 'heightMm', 'widthMm', 'depthMm'];

    assert.strictEqual(fields.length, 4, 'Materiaal should have exactly 4 fields');

    for (const key of materiaalKeys) {
      const found = fields.find(f => f.key === key);
      assert.ok(found, `Materiaal field "${key}" not found`);
      assert.ok(found.categories.includes('materiaal'), `Field "${key}" should include materiaal in categories`);
    }

    // Should NOT include battery or inverter specific fields
    assert.strictEqual(fields.find(f => f.key === 'capacityKwh'), undefined, 'Should not include battery fields');
    assert.strictEqual(fields.find(f => f.key === 'inverterPowerKw'), undefined, 'Should not include inverter fields');
    assert.strictEqual(fields.find(f => f.key === 'efficiency'), undefined, 'Should not include battery/inverter-only shared fields');
  });

  test('returns empty array for unknown category', () => {
    const empty = specsForCategory('');
    assert.strictEqual(empty.length, 0, 'Empty string should return empty array');

    const nullish = specsForCategory(null);
    assert.strictEqual(nullish.length, 0, 'Null should return empty array');

    const unknown = specsForCategory('foobar');
    assert.strictEqual(unknown.length, 0, 'Unknown category should return empty array');
  });

  test('is case-insensitive', () => {
    const lower = specsForCategory('batterijen');
    const upper = specsForCategory('BATTERIJEN');
    const mixed = specsForCategory('BaTtErIjEn');

    assert.strictEqual(lower.length, upper.length, 'BATTERIJEN should return same count as batterijen');
    assert.strictEqual(lower.length, mixed.length, 'BaTtErIjEn should return same count as batterijen');

    // Deep equality check
    assert.deepStrictEqual(upper, lower, 'Uppercase should return same fields');
    assert.deepStrictEqual(mixed, lower, 'Mixed case should return same fields');
  });

  test('battery fields count is correct', () => {
    const fields = specsForCategory('batterijen');

    // 8 battery-only + 3 battery/inverter power fields + 1 efficiency + 4 dimensions + 7 battery/inverter shared = 23 total
    const expectedCount = 23;
    assert.strictEqual(fields.length, expectedCount, `Batterijen should have ${expectedCount} fields`);
  });

  test('inverter fields count is correct', () => {
    const fields = specsForCategory('omvormers');

    // 6 inverter-only + 1 efficiency + 4 dimensions + 7 battery/inverter shared = 18 total
    const expectedCount = 18;
    assert.strictEqual(fields.length, expectedCount, `Omvormers should have ${expectedCount} fields`);
  });

  test('all returned fields include the requested category', () => {
    const categories = ['batterijen', 'omvormers', 'materiaal'];

    for (const cat of categories) {
      const fields = specsForCategory(cat);
      for (const field of fields) {
        assert.ok(
          field.categories.includes(cat),
          `Field "${field.key}" returned for "${cat}" but does not include it in categories`
        );
      }
    }
  });

  test('no duplicate fields in result', () => {
    const categories = ['batterijen', 'omvormers', 'materiaal'];

    for (const cat of categories) {
      const fields = specsForCategory(cat);
      const keys = fields.map(f => f.key);
      const uniqueKeys = new Set(keys);

      assert.strictEqual(
        keys.length,
        uniqueKeys.size,
        `Category "${cat}" should not have duplicate fields`
      );
    }
  });

  test('chemistry field has correct select options', () => {
    const fields = specsForCategory('batterijen');
    const chemistry = fields.find(f => f.key === 'chemistry');

    assert.ok(chemistry, 'Chemistry field should exist');
    assert.strictEqual(chemistry.type, 'select', 'Chemistry should be select type');
    assert.deepStrictEqual(
      chemistry.options,
      ['LiFePO4', 'NMC', 'LTO'],
      'Chemistry should have correct options'
    );
  });

  test('phases field has correct select options', () => {
    const fields = specsForCategory('omvormers');
    const phases = fields.find(f => f.key === 'phases');

    assert.ok(phases, 'Phases field should exist');
    assert.strictEqual(phases.type, 'select', 'Phases should be select type');
    assert.deepStrictEqual(
      phases.options,
      ['1', '3'],
      'Phases should have correct options'
    );
  });

  test('mountType field has correct select options', () => {
    const batteryFields = specsForCategory('batterijen');
    const inverterFields = specsForCategory('omvormers');

    const mountTypeBattery = batteryFields.find(f => f.key === 'mountType');
    const mountTypeInverter = inverterFields.find(f => f.key === 'mountType');

    assert.ok(mountTypeBattery, 'MountType should exist for batterijen');
    assert.ok(mountTypeInverter, 'MountType should exist for omvormers');

    const expectedOptions = ['Muur', 'Vloer', 'Rack'];
    assert.deepStrictEqual(
      mountTypeBattery.options,
      expectedOptions,
      'MountType should have correct options for batterijen'
    );
    assert.deepStrictEqual(
      mountTypeInverter.options,
      expectedOptions,
      'MountType should have correct options for omvormers'
    );
  });
});
