// Unit tests for the models behind the strategy page's interactive tools.
// Node's built-in test runner, no dependencies: `npm run test:unit`.
// Several tests pin numbers that the page explains in prose ("How this model works",
// "Model assumptions"). If one fails after a deliberate change, update that prose too.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const model = require('../../assets/js/strategy-model.js');

const near = (actual, expected, message, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const allLayers = (on) => model.LAYERS.map(() => on);

describe('formatting helpers', () => {
  test('fmt rounds to one decimal place and always shows it', () => {
    assert.equal(model.fmt(8), '8.0');
    assert.equal(model.fmt(10.04), '10.0');
    assert.equal(model.fmt(10.06), '10.1');
  });

  test('pct shows the size of a change, whatever its sign', () => {
    assert.equal(model.pct(-0.676), '68%');
    assert.equal(model.pct(0.25), '25%');
  });

  test('joinList reads as an English list', () => {
    assert.equal(model.joinList([]), '');
    assert.equal(model.joinList(['spec review']), 'spec review');
    assert.equal(model.joinList(['a', 'b']), 'a and b');
    assert.equal(model.joinList(['a', 'b', 'c']), 'a, b and c');
  });

  test('mulberry32 is deterministic, so decorative visuals are identical on every load', () => {
    const first = model.mulberry32(42);
    const second = model.mulberry32(42);
    const run = Array.from({ length: 5 }, () => first());
    assert.deepEqual(Array.from({ length: 5 }, () => second()), run);
    assert.ok(run.every((n) => n >= 0 && n < 1), 'values fall in [0, 1)');
    assert.notDeepEqual(Array.from({ length: 5 }, model.mulberry32(43)), run);
  });
});

describe('speed paradox — leadTimeModel', () => {
  test('the baseline matches the "How this model works" panel', () => {
    const { days, total, cfr } = model.leadTimeModel(1, {});
    assert.deepEqual(days, { plan: 3, design: 2, build: 10, test: 5, deploy: 1, wait: 12, rework: 3 });
    assert.equal(total, 36);
    assert.equal(cfr, 15);
    assert.equal(model.BASE_CFR, 15);
  });

  test('agent speed-up divides Build and grows waiting, rework, test effort and failures with log2(speed-up)', () => {
    const { days, cfr } = model.leadTimeModel(4, {}); // log2(4) = 2
    near(days.build, 2.5, 'build = 10 / 4');
    near(days.wait, 12 * 1.2, 'waiting × (1 + 0.1·2)');
    near(days.rework, 3 * 1.3, 'rework × (1 + 0.15·2)');
    near(days.test, 5 * 1.1, 'test × (1 + 0.05·2)');
    near(cfr, 15 * 1.5, 'change failure rate × (1 + 0.25·2)');
  });

  test('Specify brings Plan to 2.5, Design to 1.5 and rework to 0.75, and cuts failures by 15%', () => {
    const { days, cfr } = model.leadTimeModel(8, { specify: true });
    assert.equal(days.plan, 2.5);
    assert.equal(days.design, 1.5);
    assert.equal(days.rework, 0.75);
    near(cfr, 15 * (1 + 0.25 * 3) * 0.85, 'change failure rate');
  });

  test('Verify brings Test to 1.5 days and stops failures growing with speed, 40% below the baseline', () => {
    for (const speed of [1, 5, 20]) {
      const { days, cfr } = model.leadTimeModel(speed, { verify: true });
      assert.equal(days.test, 1.5);
      near(cfr, 9, `change failure rate at ${speed}×`);
    }
  });

  test('Flow brings waiting to 3 days and Deploy to half a day', () => {
    const { days } = model.leadTimeModel(10, { flow: true });
    assert.equal(days.wait, 3);
    assert.equal(days.deploy, 0.5);
  });

  test('a faster Build alone barely moves lead time; reinvesting in quality does', () => {
    const buildOnly = model.leadTimeModel(10, {});
    assert.equal(model.fmt(buildOnly.total), '33.3');
    assert.equal(Math.round(buildOnly.cfr), 27);
    const reinvested = model.leadTimeModel(10, { specify: true, verify: true, flow: true });
    assert.equal(model.fmt(reinvested.total), '10.8');
    assert.equal(Math.round(reinvested.cfr), 8);
  });

  test('lead time is the sum of every stage', () => {
    for (const speed of [1, 3, 20]) {
      const result = model.leadTimeModel(speed, { specify: speed > 1, flow: speed > 3 });
      near(result.total, sum(model.SPEED_STAGES.map((stage) => result.days[stage.key])), `total at ${speed}×`);
    }
  });
});

describe('Swiss cheese — expectedContainment', () => {
  test('the model has the seven layers and ten defect kinds the page describes', () => {
    assert.equal(model.LAYERS.length, 7);
    assert.equal(model.DEFECTS.length, 10);
  });

  test('defect weights add up and every catch chance is a probability for a real layer', () => {
    const layerKeys = new Set(model.LAYERS.map((layer) => layer.key));
    assert.equal(model.DEFECT_WEIGHT, sum(model.DEFECTS.map((defect) => defect.w)));
    for (const defect of model.DEFECTS) {
      assert.ok(defect.w > 0, `${defect.label} has a positive weight`);
      for (const [key, chance] of Object.entries({ ...defect.p, ...defect.same })) {
        assert.ok(layerKeys.has(key), `${defect.label} names an unknown layer "${key}"`);
        assert.ok(chance >= 0 && chance <= 1, `${defect.label} at ${key} is a probability`);
      }
    }
  });

  test('caught plus escaped always accounts for all 100 defects', () => {
    const setups = [allLayers(true), allLayers(false), model.LAYERS.map((_, i) => i % 2 === 0)];
    for (const enabled of setups) {
      for (const independent of [true, false]) {
        const { caught, escaped } = model.expectedContainment(enabled, independent);
        near(sum(caught) + escaped, 100, `total for ${enabled} / independent ${independent}`, 1e-6);
      }
    }
  });

  test('with every slice off, every defect escapes', () => {
    near(model.expectedContainment(allLayers(false), true).escaped, 100, 'escaped', 1e-6);
  });

  test("tests written by the code's own agent raise the expected escapes from 7.3 to 11.0", () => {
    assert.equal(model.fmt(model.expectedContainment(allLayers(true), true).escaped), '7.3');
    assert.equal(model.fmt(model.expectedContainment(allLayers(true), false).escaped), '11.0');
  });

  test('losing independence only weakens unit tests, and only for logic errors and missing edge cases', () => {
    const weakened = [];
    model.DEFECTS.forEach((defect) => {
      model.LAYERS.forEach((layer, i) => {
        const independent = model.catchChance(defect, i, true);
        const same = model.catchChance(defect, i, false);
        assert.ok(same <= independent, `${defect.label} at ${layer.key} never improves without independence`);
        if (same < independent) weakened.push(`${defect.label} @ ${layer.key}`);
      });
    });
    assert.deepEqual(weakened, ['a missing edge case @ unit', 'a logic error in a function @ unit']);
  });

  test('switching a slice off never lets fewer defects escape', () => {
    const baseline = model.expectedContainment(allLayers(true), true).escaped;
    model.LAYERS.forEach((layer, i) => {
      const enabled = allLayers(true);
      enabled[i] = false;
      assert.ok(model.expectedContainment(enabled, true).escaped >= baseline, `switching off ${layer.key}`);
    });
  });

  test('each defect kind is owned by the layer the "What each layer catches" table assigns it to', () => {
    const owners = Object.fromEntries(model.DEFECTS.map((defect) => [defect.label, model.LAYERS[model.ownerLayer(defect)].key]));
    assert.equal(owners['a misunderstood requirement'], 'spec');
    assert.equal(owners['a logic error in a function'], 'unit');
    assert.equal(owners['a leaked secret or vulnerable dependency'], 'static');
    assert.equal(owners['a breaking API or schema change'], 'contract');
    assert.equal(owners['a cross-service data-flow bug'], 'e2e');
    assert.equal(owners['a latency or capacity regression'], 'nfr');
  });
});

describe('test pyramid — pyramidStats', () => {
  test('the model assumptions match the "Model assumptions" panel', () => {
    const levels = Object.fromEntries(model.PYR_LEVELS.map((level) => [level.key, level]));
    assert.deepEqual(
      Object.fromEntries(Object.entries(levels).map(([key, level]) => [key, [level.seconds, level.flaky]])),
      { unit: [0.005, 0.001], comp: [0.5, 0.005], int: [5, 0.02], e2e: [45, 0.08] });
    assert.equal(model.RUNNERS, 8);
    assert.deepEqual(['unit', 'comp', 'int', 'e2e'].map((key) => levels[key].target), [70, 20, 8, 2]);
  });

  test('each preset is classified as its name says', () => {
    assert.equal(model.pyramidStats(model.PYR_PRESETS.cone).shape, 'cone');
    assert.equal(model.pyramidStats(model.PYR_PRESETS.naive).shape, 'cone');
    assert.equal(model.pyramidStats(model.PYR_PRESETS.pyramid).shape, 'pyramid');
  });

  test('the AI-era pyramid meets the 15-minute and 2% targets; the ice-cream cone misses both', () => {
    const pyramid = model.pyramidStats(model.PYR_PRESETS.pyramid);
    assert.ok(pyramid.minutes < 15, `pyramid feedback ${pyramid.minutes} min`);
    assert.ok(pyramid.flakyRate < 2, `pyramid flaky rate ${pyramid.flakyRate}%`);
    const cone = model.pyramidStats(model.PYR_PRESETS.cone);
    assert.ok(cone.minutes > 15, `cone feedback ${cone.minutes} min`);
    assert.ok(cone.flakyRate > 2, `cone flaky rate ${cone.flakyRate}%`);
  });

  test('an empty suite is "empty"; a suite that is neither a pyramid nor a cone is "lopsided"', () => {
    const empty = model.pyramidStats({ unit: 0, comp: 0, int: 0, e2e: 0 });
    assert.deepEqual([empty.shape, empty.minutes, empty.flakyRate], ['empty', 0, 0]);
    assert.equal(model.pyramidStats({ unit: 100, comp: 10, int: 50, e2e: 5 }).shape, 'lopsided');
  });

  test('shares always add up to 100%', () => {
    for (const preset of Object.values(model.PYR_PRESETS)) {
      near(sum(Object.values(model.pyramidStats(preset).shares)), 100, 'share total', 1e-9);
    }
  });
});

describe('environments — describePath, with the data in the page\'s #env-table', () => {
  // The promotion-path tool reads its data from the table's data-* attributes; read them the same way.
  const html = readFileSync(path.join(__dirname, '../../reference/ai-native-qa-strategy.html'), 'utf8');
  const table = html.slice(html.indexOf('id="env-table"'), html.indexOf('</table>', html.indexOf('id="env-table"')));
  const envs = Array.from(table.matchAll(/<tr\b[^>]*\bdata-short="[^"]*"[^>]*>/g), ([tag]) => {
    const attr = (name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
    return { short: attr('data-short'), states: { 1: attr('data-t1'), 2: attr('data-t2'), 3: attr('data-t3') } };
  });

  test('the table lists seven environments with a valid state for every tier', () => {
    assert.equal(envs.length, 7, 'env-table rows found (update this parser if the markup changed)');
    for (const env of envs) {
      for (const tier of [1, 2, 3]) {
        assert.ok(['visit', 'optional', 'skip'].includes(env.states[tier]), `${env.short} at Tier ${tier}`);
      }
    }
  });

  test('each tier takes the path the page describes', () => {
    assert.equal(model.describePath(envs, 1),
      'Tier 1 visits Sandbox → PR env → Production. It may go from the PR environment straight to a production canary.');
    assert.equal(model.describePath(envs, 2), 'Tier 2 visits Sandbox → PR env → Integration → Staging → Production.');
    assert.equal(model.describePath(envs, 3), 'Tier 3 passes through all seven environments.');
  });

  test('optional environments are listed as needed', () => {
    const fixture = [
      { short: 'Sandbox', states: { 2: 'visit' } },
      { short: 'Performance', states: { 2: 'optional' } },
      { short: 'Security', states: { 2: 'optional' } },
      { short: 'Production', states: { 2: 'visit' } },
    ];
    assert.equal(model.describePath(fixture, 2), 'Tier 2 visits Sandbox → Production, with performance and security as needed.');
  });
});
