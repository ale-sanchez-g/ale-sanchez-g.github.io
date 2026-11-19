/* AI-Native Quality Assurance Strategy — the models behind the interactive tools.
   Pure functions and constants with no DOM access: the browser loads this file
   before strategy.js (as window.StrategyModel) and the unit tests in tests/unit/
   require() it in Node. The page's "How this model works" and "Model assumptions"
   panels explain these numbers; the unit tests pin them, so change both together. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.StrategyModel = model;
})(globalThis, function () {
  'use strict';

  /* ── formatting ────────────────────────────────────────────── */

  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const pct = (ratio) => Math.round(Math.abs(ratio) * 100) + '%';
  const joinList = (items) => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];

  // Deterministic PRNG so decorative visuals render identically on every load.
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── 01 the speed paradox ──────────────────────────────────── */

  const SPEED_STAGES = [
    { key: 'plan', label: 'Plan', noun: 'planning', kind: 'work' },
    { key: 'design', label: 'Design', noun: 'design', kind: 'work' },
    { key: 'build', label: 'Build', noun: 'build', kind: 'build' },
    { key: 'test', label: 'Test', noun: 'testing', kind: 'work' },
    { key: 'deploy', label: 'Deploy', noun: 'deployment', kind: 'work' },
    { key: 'wait', label: 'Waiting', noun: 'waiting in queues', kind: 'wait' },
    { key: 'rework', label: 'Rework', noun: 'rework from unclear intent', kind: 'rework' },
  ];
  const BASE_CFR = 15;

  // Illustrative model — the assumptions are spelled out in the page's
  // "How this model works" panel. Keep the two in sync.
  function leadTimeModel(speed, invest) {
    const growth = Math.log2(speed);
    const days = {
      plan: invest.specify ? 2.5 : 3,
      design: invest.specify ? 1.5 : 2,
      build: 10 / speed,
      test: invest.verify ? 1.5 : 5 * (1 + 0.05 * growth),
      deploy: invest.flow ? 0.5 : 1,
      wait: invest.flow ? 3 : 12 * (1 + 0.1 * growth),
      rework: invest.specify ? 0.75 : 3 * (1 + 0.15 * growth),
    };
    let cfr = invest.verify ? BASE_CFR * 0.6 : BASE_CFR * (1 + 0.25 * growth);
    if (invest.specify) cfr *= 0.85;
    const total = SPEED_STAGES.reduce((sum, stage) => sum + days[stage.key], 0);
    return { days, total, cfr };
  }

  /* ── 05 environment promotion path ─────────────────────────── */

  function describePath(envs, tier) {
    const visits = envs.filter((e) => e.states[tier] === 'visit').map((e) => e.short);
    const optional = envs.filter((e) => e.states[tier] === 'optional').map((e) => e.short.toLowerCase());
    if (visits.length === envs.length) return 'Tier ' + tier + ' passes through all seven environments.';
    let text = 'Tier ' + tier + ' visits ' + visits.join(' → ');
    if (optional.length) text += ', with ' + joinList(optional) + ' as needed';
    text += '.';
    if (tier === 1) text += ' It may go from the PR environment straight to a production canary.';
    return text;
  }

  /* ── 06 Swiss cheese simulator ─────────────────────────────── */

  const LAYERS = [
    { key: 'spec', name: 'Spec review', sub: 'intent, AC', full: 'Spec review', phrase: 'spec review' },
    { key: 'static', name: 'Static + AI', sub: 'code review', full: 'Static + AI review', phrase: 'static + AI review' },
    { key: 'unit', name: 'Unit', sub: 'tests', full: 'Unit tests', phrase: 'unit tests' },
    { key: 'contract', name: 'Contract', sub: 'and component', full: 'Contract & component', phrase: 'contract & component tests' },
    { key: 'e2e', name: 'Integration', sub: 'and E2E', full: 'Integration & E2E', phrase: 'integration & E2E tests' },
    { key: 'nfr', name: 'NFR and', sub: 'security', full: 'NFR & security', phrase: 'NFR & security testing' },
    { key: 'canary', name: 'Canary and', sub: 'SLO rollback', full: 'Canary & SLO rollback', phrase: 'canary & SLO rollback' },
  ];

  // Illustrative defect mix: weight = how often it occurs, p = chance each layer
  // catches it, same = the chance when tests are written by the code's own agent.
  const DEFECTS = [
    { label: 'a misunderstood requirement', w: 12, p: { spec: 0.85, e2e: 0.3, canary: 0.3 } },
    { label: 'a missing edge case', w: 14, p: { spec: 0.6, static: 0.05, unit: 0.7, contract: 0.1, e2e: 0.15, canary: 0.4 }, same: { unit: 0.25 } },
    { label: 'a logic error in a function', w: 18, p: { static: 0.3, unit: 0.9, contract: 0.1, e2e: 0.25, canary: 0.5 }, same: { unit: 0.35 } },
    { label: 'a leaked secret or vulnerable dependency', w: 8, p: { static: 0.97, nfr: 0.6 } },
    { label: 'a breaking API or schema change', w: 10, p: { static: 0.1, unit: 0.05, contract: 0.92, e2e: 0.6, canary: 0.6 } },
    { label: 'a cross-service data-flow bug', w: 8, p: { contract: 0.25, e2e: 0.8, canary: 0.6 } },
    { label: 'a latency or capacity regression', w: 7, p: { nfr: 0.85, canary: 0.7 } },
    { label: 'a security weakness (authZ or prompt injection)', w: 6, p: { spec: 0.25, static: 0.35, nfr: 0.75, canary: 0.1 } },
    { label: 'a slow-burn defect on a low-traffic path', w: 4, p: { nfr: 0.5, canary: 0.3 } },
    { label: 'an unstated non-functional need', w: 5, p: { spec: 0.4, nfr: 0.4, canary: 0.1 } },
  ];
  const DEFECT_WEIGHT = DEFECTS.reduce((sum, d) => sum + d.w, 0);

  function catchChance(defect, layerIndex, independent) {
    const key = LAYERS[layerIndex].key;
    if (!independent && defect.same && key in defect.same) return defect.same[key];
    return defect.p[key] || 0;
  }

  // The layer that owns a defect type: where it should die.
  function ownerLayer(defect) {
    let best = 0;
    LAYERS.forEach((_, i) => { if (catchChance(defect, i, true) > catchChance(defect, best, true)) best = i; });
    return best;
  }

  function expectedContainment(enabled, independent) {
    const caught = LAYERS.map(() => 0);
    let escaped = 0;
    DEFECTS.forEach((defect) => {
      let reach = (defect.w / DEFECT_WEIGHT) * 100;
      LAYERS.forEach((_, i) => {
        if (!enabled[i]) return;
        const chance = catchChance(defect, i, independent);
        caught[i] += reach * chance;
        reach *= 1 - chance;
      });
      escaped += reach;
    });
    return { caught, escaped };
  }

  /* ── 07 test pyramid ───────────────────────────────────────── */

  const PYR_LEVELS = [
    { key: 'e2e', name: 'E2E UI', target: 2, seconds: 45, flaky: 0.08, max: 1500, step: 10 },
    { key: 'int', name: 'Integration and API', target: 8, seconds: 5, flaky: 0.02, max: 1000, step: 10 },
    { key: 'comp', name: 'Component and contract', target: 20, seconds: 0.5, flaky: 0.005, max: 2000, step: 10 },
    { key: 'unit', name: 'Unit', target: 70, seconds: 0.005, flaky: 0.001, max: 6000, step: 50 },
  ];
  const PYR_PRESETS = {
    cone: { unit: 150, comp: 40, int: 120, e2e: 400, manual: 60 },
    naive: { unit: 300, comp: 60, int: 250, e2e: 1200, manual: 40 },
    pyramid: { unit: 3500, comp: 1000, int: 400, e2e: 100, manual: 4 },
  };
  const RUNNERS = 8;

  function pyramidStats(counts) {
    const total = PYR_LEVELS.reduce((sum, l) => sum + counts[l.key], 0);
    const shares = {};
    PYR_LEVELS.forEach((l) => { shares[l.key] = total ? (counts[l.key] / total) * 100 : 0; });
    const minutes = PYR_LEVELS.reduce((sum, l) => sum + counts[l.key] * l.seconds, 0) / RUNNERS / 60;
    const flakyRate = total ? (PYR_LEVELS.reduce((sum, l) => sum + counts[l.key] * l.flaky, 0) / total) * 100 : 0;
    const bottomUp = ['unit', 'comp', 'int', 'e2e'].map((k) => shares[k]);
    const monotone = bottomUp.every((v, i) => i === 0 || v <= bottomUp[i - 1] + 1e-9);
    const shape = total === 0 ? 'empty' : shares.e2e > shares.unit ? 'cone' : monotone ? 'pyramid' : 'lopsided';
    return { total, shares, minutes, flakyRate, shape };
  }

  return {
    fmt, pct, joinList, mulberry32,
    SPEED_STAGES, BASE_CFR, leadTimeModel, describePath,
    LAYERS, DEFECTS, DEFECT_WEIGHT, catchChance, ownerLayer, expectedContainment,
    PYR_LEVELS, PYR_PRESETS, RUNNERS, pyramidStats,
  };
});
