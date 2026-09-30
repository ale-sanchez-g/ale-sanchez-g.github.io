/* AI-Native Quality Assurance Strategy — interactive tools.
   Vanilla JS, no dependencies. Every tool enhances content that already exists
   in the HTML and only initialises when its root element is on the page. */
(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────── */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function setAttrs(node, attrs) {
    if (!attrs) return;
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  function appendAll(node, children) {
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
  }
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    setAttrs(node, attrs);
    appendAll(node, children);
    return node;
  }
  function sv(tag, attrs, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    setAttrs(node, attrs);
    appendAll(node, children);
    return node;
  }

  const press = (btn, on) => btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const pct = (ratio) => Math.round(Math.abs(ratio) * 100) + '%';
  const joinList = (items) => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  const paintRange = (input) => input.style.setProperty('--fill', ((input.value - input.min) / (input.max - input.min)) * 100 + '%');
  const field = (label, text) => h('div', null, h('p', { class: 'st-mini-label', text: label }), h('p', { text }));

  function statTile(label, value, unit, note, noteClass) {
    return h('div', { class: 'st-stat' },
      h('p', { class: 'st-stat-label', text: label }),
      h('p', { class: 'st-stat-value' }, value, unit ? h('small', { text: unit }) : null),
      note ? h('p', { class: 'st-stat-note' + (noteClass ? ' ' + noteClass : ''), text: note }) : null);
  }

  // Deterministic PRNG so decorative visuals render identically on every load.
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Answers and self-assessments are remembered in this browser only.
  const STORE_KEY = 'ai-native-qa-strategy';
  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
    },
    get(key, fallback) {
      const value = this.read()[key];
      return value === undefined ? fallback : value;
    },
    set(key, value) {
      try {
        const all = this.read();
        all[key] = value;
        localStorage.setItem(STORE_KEY, JSON.stringify(all));
      } catch (e) { /* storage blocked: the tools still work, they just don't remember */ }
    },
  };

  function tooltip(container) {
    const value = h('strong');
    const label = h('span');
    const tip = h('div', { class: 'st-tip', 'aria-hidden': 'true' }, value, label);
    tip.hidden = true;
    container.append(tip);
    return {
      show(v, l, clientX, clientY) {
        value.textContent = v;
        label.textContent = l;
        const box = container.getBoundingClientRect();
        const x = Math.min(Math.max(clientX - box.left, 70), box.width - 70);
        tip.style.left = x + 'px';
        tip.style.top = clientY - box.top + 'px';
        tip.hidden = false;
      },
      hide() { tip.hidden = true; },
    };
  }

  // One risk tier is shared by the environment explorer and the change router.
  const tierBus = {
    tier: 1,
    handlers: [],
    on(fn) { this.handlers.push(fn); },
    set(tier) {
      this.tier = Number(tier);
      this.handlers.forEach((fn) => fn(this.tier));
    },
  };

  const ENV_STATE = { visit: 'Visits', optional: 'As needed', skip: 'Skips' };

  function readEnvironments() {
    return $$('#env-table tbody tr').map((tr) => {
      const cells = $$('th, td', tr).map((cell) => cell.textContent.trim());
      return {
        name: cells[0], purpose: cells[1], lifecycle: cells[2], data: cells[3],
        tests: cells[4], agent: cells[5], exit: cells[6],
        short: tr.dataset.short || cells[0],
        states: { 1: tr.dataset.t1, 2: tr.dataset.t2, 3: tr.dataset.t3 },
      };
    });
  }

  /* ── chapter bar: scrollspy + reading progress ───────────── */

  function initChapters() {
    const bar = $('#st-chapters');
    if (!bar) return;
    const nav = $('body > nav');
    const list = $('ol', bar);
    const links = $$('a[href^="#"]', bar);
    const sections = links.map((a) => document.getElementById(a.hash.slice(1)));
    const progress = $('.st-progress span', bar);
    const main = $('main');
    const docStyle = document.documentElement.style;
    let current = null;
    let queued = false;

    function measure() {
      docStyle.setProperty('--nav-h', (nav ? nav.getBoundingClientRect().height : 0) + 'px');
      docStyle.setProperty('--bar-h', bar.getBoundingClientRect().height + 'px');
    }
    function setActive(id) {
      if (id === current) return;
      current = id;
      links.forEach((a) => {
        if (a.hash !== '#' + id) { a.removeAttribute('aria-current'); return; }
        a.setAttribute('aria-current', 'true');
        const left = a.offsetLeft;
        const right = left + a.offsetWidth;
        if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
          list.scrollTo({ left: Math.max(0, left - 24), behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    }
    function update() {
      queued = false;
      const line = bar.getBoundingClientRect().bottom + 24;
      let active = null;
      sections.forEach((section) => { if (section && section.getBoundingClientRect().top <= line) active = section.id; });
      setActive(active);
      if (progress && main) {
        const box = main.getBoundingClientRect();
        const span = box.height - (window.innerHeight - line);
        const ratio = span > 0 ? Math.min(1, Math.max(0, (line - box.top) / span)) : 0;
        progress.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      }
    }
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

    measure();
    window.addEventListener('resize', () => { measure(); request(); });
    window.addEventListener('scroll', request, { passive: true });
    update();
  }

  /* ── 01 the speed paradox ────────────────────────────────── */

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

  function initSpeedLab() {
    const root = $('#speed-lab');
    if (!root) return;
    const range = $('#speed-range', root);
    const out = $('#speed-out', root);
    const toggles = $$('[data-invest]', root);
    const chart = $('#speed-chart', root);
    const stats = $('#speed-stats', root);
    const verdict = $('#speed-verdict', root);
    const tbody = $('#speed-table tbody', root);
    const AXIS_MAX = 40;
    const invest = { specify: false, verify: false, flow: false };
    const before = leadTimeModel(1, {});
    const tip = tooltip(chart);

    function makeRow(name) {
      const track = h('div', { class: 'st-stack-track', tabindex: '0', role: 'img' });
      const segs = SPEED_STAGES.map((stage) => {
        const seg = h('div', { class: 'st-seg st-seg--' + stage.kind, 'data-key': stage.key }, h('span', { text: stage.label }));
        track.append(seg);
        return seg;
      });
      const total = h('span', { class: 'st-stack-total' });
      chart.append(h('div', { class: 'st-stack-row' }, h('span', { class: 'st-stack-name', text: name }), track, total));
      track.addEventListener('pointermove', (event) => {
        const seg = event.target.closest('.st-seg');
        if (!seg) { tip.hide(); return; }
        const stage = SPEED_STAGES.find((s) => s.key === seg.dataset.key);
        tip.show(fmt(Number(seg.dataset.days)) + ' days', stage.label + ' · ' + Math.round(Number(seg.dataset.share) * 100) + '% of lead time', event.clientX, event.clientY);
      });
      track.addEventListener('pointerleave', () => tip.hide());
      return { name, track, segs, total };
    }
    const rows = [makeRow('Before agents'), makeRow('Your scenario')];

    const axis = h('div', { class: 'st-axis', 'aria-hidden': 'true' });
    for (let day = 0; day <= AXIS_MAX; day += 10) {
      axis.append(h('span', { style: 'left:' + (day / AXIS_MAX) * 100 + '%', text: day === AXIS_MAX ? day + ' days' : String(day) }));
    }
    chart.append(axis, h('ul', { class: 'st-legend' },
      h('li', null, h('i', { style: 'background:var(--accent)' }), 'Build — what agents compress'),
      h('li', null, h('i', { style: 'background:#5a5a5a' }), 'Plan, Design, Test, Deploy'),
      h('li', null, h('i', { style: 'background:var(--danger)' }), 'Waiting in queues'),
      h('li', null, h('i', { style: 'background:var(--danger-dim)' }), 'Rework from unclear intent')));

    function paintRow(row, result) {
      SPEED_STAGES.forEach((stage, i) => {
        const days = result.days[stage.key];
        const seg = row.segs[i];
        seg.style.flexBasis = 'calc(' + ((days / AXIS_MAX) * 100).toFixed(3) + '% - 2px)';
        seg.dataset.days = days;
        seg.dataset.share = days / result.total;
      });
      row.total.textContent = fmt(result.total) + ' d';
      row.track.setAttribute('aria-label', row.name + ': ' +
        SPEED_STAGES.map((s) => s.label + ' ' + fmt(result.days[s.key]) + ' days').join(', ') +
        '. Lead time ' + fmt(result.total) + ' days.');
    }
    // Hide in-bar labels that would not fit (measured against the final width, not mid-transition).
    function fitLabels() {
      rows.forEach((row) => {
        const trackWidth = row.track.clientWidth;
        row.segs.forEach((seg) => {
          const width = (trackWidth * Number(seg.dataset.days)) / AXIS_MAX - 2;
          seg.classList.toggle('is-tight', seg.firstChild.offsetWidth + 10 > width);
        });
      });
    }

    function render() {
      const speed = Number(range.value);
      out.textContent = speed + '×';
      paintRange(range);
      const now = leadTimeModel(speed, invest);
      paintRow(rows[0], before);
      paintRow(rows[1], now);
      fitLabels();

      const ltChange = (now.total - before.total) / before.total;
      const cfrDelta = now.cfr - before.cfr;
      const biggest = SPEED_STAGES.reduce((a, s) => (now.days[s.key] > now.days[a.key] ? s : a), SPEED_STAGES[0]);
      const biggestShare = now.days[biggest.key] / now.total;
      const ltNote = Math.abs(ltChange) < 0.005 ? 'Same as before agents'
        : (ltChange < 0 ? '▼ ' : '▲ ') + pct(ltChange) + ' vs before agents';
      const cfrNote = Math.abs(cfrDelta) < 0.5 ? 'Same as before agents'
        : (cfrDelta > 0 ? '▲ ' : '▼ ') + Math.round(Math.abs(cfrDelta)) + ' pts vs ' + BASE_CFR + '% before';

      stats.replaceChildren(
        statTile('Lead time', fmt(now.total), 'days', ltNote, ltChange < -0.005 ? 'is-good' : ltChange > 0.005 ? 'is-bad' : ''),
        statTile('Change failure rate', Math.round(now.cfr) + '%', '', cfrNote, cfrDelta < -0.5 ? 'is-good' : cfrDelta > 0.5 ? 'is-bad' : ''),
        statTile('Biggest constraint', biggest.label, '', Math.round(biggestShare * 100) + '% of lead time', biggest.kind === 'wait' || biggest.kind === 'rework' ? 'is-bad' : ''));

      const chosen = Object.keys(invest).filter((k) => invest[k]);
      let text;
      if (speed === 1 && chosen.length === 0) {
        text = 'No agents yet — this is the baseline. Waiting is already the biggest slice of lead time, which is why Build acceleration on its own disappoints.';
      } else {
        const speedPart = speed > 1 ? 'Build is ' + speed + '× faster' : 'Build speed is unchanged';
        const ltPart = ltChange < -0.005 ? 'lead time fell ' + pct(ltChange) + ' (' + fmt(before.total) + ' → ' + fmt(now.total) + ' days)'
          : ltChange > 0.005 ? 'lead time rose ' + pct(ltChange) : 'lead time did not move';
        const cfrPart = cfrDelta > 0.5 ? 'change failure rate rose to ' + Math.round(now.cfr) + '%'
          : cfrDelta < -0.5 ? 'change failure rate fell to ' + Math.round(now.cfr) + '%'
            : 'change failure rate held at ' + Math.round(now.cfr) + '%';
        text = speedPart + ', ' + ltPart + ', and ' + cfrPart + '. The biggest constraint is now ' + biggest.noun + '.';
        if (chosen.length === 3 && speed > 1) text += ' Reinvesting in quality turned agent speed into delivery speed.';
        else if (chosen.length === 0) text += ' Faster code generation does not equal faster delivery.';
      }
      verdict.textContent = text;
      verdict.classList.toggle('is-bad', cfrDelta > 0.5);

      tbody.replaceChildren(
        ...SPEED_STAGES.map((s) => h('tr', null, h('td', { text: s.label }), h('td', { text: fmt(before.days[s.key]) }), h('td', { text: fmt(now.days[s.key]) }))),
        h('tr', null, h('td', null, h('strong', { text: 'Lead time' })), h('td', { text: fmt(before.total) }), h('td', { text: fmt(now.total) })),
        h('tr', null, h('td', { text: 'Change failure rate' }), h('td', { text: Math.round(before.cfr) + '%' }), h('td', { text: Math.round(now.cfr) + '%' })));
    }

    range.addEventListener('input', render);
    toggles.forEach((btn) => btn.addEventListener('click', () => {
      invest[btn.dataset.invest] = !invest[btn.dataset.invest];
      press(btn, invest[btn.dataset.invest]);
      render();
    }));
    window.addEventListener('resize', fitLabels);
    render();
  }

  /* ── 02 ship it or stop? ─────────────────────────────────── */

  const SCENARIOS = [
    {
      text: 'A build agent changes the pricing calculation and writes its own unit tests. Everything is green, so the pipeline auto-merges.',
      answer: 'stop', principles: [2, 3, 4],
      why: 'The same agent wrote the code and the tests, so both slices share the same holes — the tests confirm the code’s own mistakes. Pricing is Tier 3, and it shipped with no human decision.',
      instead: 'Generate tests independently from the spec, prove them with mutation testing, add NFR and security testing and a second human reviewer, and let the named service owner approve a staged rollout.',
    },
    {
      text: 'An agent starts building a new sign-up step from a chat thread. The acceptance criteria will be written after the demo.',
      answer: 'stop', principles: [1],
      why: 'No agent writes production code without an approved spec, acceptance criteria and a risk tier. Vague intent just produces the wrong thing faster.',
      instead: 'Lock the spec first: Given/When/Then criteria, a risk tier and NFRs approved before the build agent starts.',
    },
    {
      text: 'A typo fix on the FAQ page passes its independently generated tests and scans, gets an agent pre-review and ships automatically through a canary with SLO guards.',
      answer: 'ship', principles: [4, 5],
      why: 'This is Tier 1 — copy, styling, internal tooling and docs. Independent tests, scans, an agent pre-review and an automated canary are the right amount of assurance, and the pipeline produced the evidence.',
    },
    {
      text: 'An agent generated 400 unit tests overnight and line coverage jumped to 95%. The team declares the service well tested.',
      answer: 'stop', principles: [2, 5],
      why: 'Agents easily reach high coverage with assertion-free tests. Coverage shows what ran, not whether the tests can fail.',
      instead: 'Measure mutation score and spec-to-test traceability, and prune tests that never fail under mutation.',
    },
    {
      text: 'The release manager approves a Tier 3 change by ticking “QA complete” in the change record.',
      answer: 'stop', principles: [3, 5],
      why: 'A checkbox is attestation, not evidence. Tier 3 needs machine-readable proof and a named service owner.',
      instead: 'Attach the evidence bundle — tests, scans, traces and approvals — and let the named service owner decide on it.',
    },
    {
      text: 'A recommendations widget ships behind a feature flag. A separate test agent generated its tests from the acceptance criteria, mutation testing shows they catch real faults, an engineer reviewed the diff and the evidence, and it goes out as a canary.',
      answer: 'ship', principles: [2, 3, 4],
      why: 'Textbook Tier 2: independent tests proven by mutation testing, human code review, and a canary release approved by an engineer on the team.',
    },
    {
      text: 'Leadership sets the AI adoption goal: three times more pull requests per engineer by next quarter.',
      answer: 'stop', principles: [7],
      why: 'Success is lead time and change failure rate for the whole value stream, never lines of code or PR count. More pull requests without flow just grow the review queue.',
      instead: 'Baseline lead time, queue time and change failure rate, and judge progress on them together.',
    },
    {
      text: 'To lock in behaviour, an agent snapshots today’s API responses and uses them as the expected results for the new tests.',
      answer: 'stop', principles: [1, 2],
      why: 'Snapshot tests of current behaviour lock in today’s bugs as “expected”.',
      instead: 'Assert against the acceptance criteria, not the current output.',
    },
    {
      text: 'An authentication change has design and threat-model sign-off, independent tests with a mutation score above 70%, NFR and security testing, and two human reviewers. The named service owner approves a staged rollout with automatic rollback on SLO breach.',
      answer: 'ship', principles: [4, 6],
      why: 'This is what Tier 3 assurance looks like: prevention on the left, fast detection and automatic rollback on the right. If anything escapes, the review asks which slice missed it and adds a test there.',
    },
    {
      text: 'A flaky end-to-end test is set to retry up to five times so the release isn’t blocked.',
      answer: 'stop', principles: [5],
      why: 'Retrying until green hides real intermittent defects — and a flaky suite trains people to ignore red builds.',
      instead: 'Quarantine it, then fix or delete it within a sprint.',
    },
  ];

  function initShipGame() {
    const root = $('#ship-game');
    if (!root) return;
    const countEl = $('#game-count', root);
    const scoreEl = $('#game-score', root);
    const textEl = $('#game-text', root);
    const result = $('#game-result', root);
    const buttons = $$('[data-answer]', root);
    const principles = $$('.st-principle');
    const titles = {};
    principles.forEach((d) => { titles[d.dataset.p] = $('.st-p-title', d).textContent; });
    let index = 0;
    let score = 0;
    let answered = 0;
    textEl.tabIndex = -1;

    const highlight = (list) => principles.forEach((d) => d.classList.toggle('is-at-stake', list.includes(Number(d.dataset.p))));
    const setScore = () => { scoreEl.textContent = 'Score ' + score + ' / ' + answered; };

    function show() {
      const scenario = SCENARIOS[index];
      countEl.textContent = 'Scenario ' + (index + 1) + ' of ' + SCENARIOS.length;
      setScore();
      textEl.textContent = scenario.text;
      buttons.forEach((b) => { b.disabled = false; b.classList.remove('is-right', 'is-wrong'); });
      result.replaceChildren();
      highlight([]);
    }
    function answer(choice) {
      const scenario = SCENARIOS[index];
      const correct = choice === scenario.answer;
      answered += 1;
      if (correct) score += 1;
      setScore();
      buttons.forEach((b) => {
        b.disabled = true;
        if (b.dataset.answer === scenario.answer) b.classList.add('is-right');
        else if (b.dataset.answer === choice) b.classList.add('is-wrong');
      });
      const title = correct
        ? '✓ Correct — ' + (scenario.answer === 'ship' ? 'ship it' : 'stop')
        : '✕ Not quite — this one should ' + scenario.answer;
      const last = index === SCENARIOS.length - 1;
      const next = h('button', { type: 'button', class: 'btn btn-ghost st-btn-sm', text: last ? 'See your score →' : 'Next scenario →' });
      next.addEventListener('click', () => {
        if (last) { finish(); return; }
        index += 1;
        show();
        textEl.focus();
      });
      result.replaceChildren(
        h('p', { class: 'st-result-title ' + (correct ? 'is-good' : 'is-bad'), text: title }),
        h('p', { class: 'st-mini-label', text: scenario.answer === 'ship' ? 'Principles it honours' : 'Principles at stake' }),
        h('div', { class: 'st-pchips' }, scenario.principles.map((n) => h('a', {
          class: 'st-pchip', href: '#p' + n,
          onclick: () => { const d = document.getElementById('p' + n); if (d) d.open = true; },
          text: String(n).padStart(2, '0') + ' · ' + titles[n],
        }))),
        h('p', null, h('strong', { text: 'Why: ' }), scenario.why),
        scenario.instead ? h('p', null, h('strong', { text: 'Do instead: ' }), scenario.instead) : null,
        next);
      highlight(scenario.principles);
      next.focus();
    }
    function finish() {
      highlight([]);
      countEl.textContent = 'All ' + SCENARIOS.length + ' scenarios played';
      textEl.textContent = 'You scored ' + score + ' of ' + SCENARIOS.length + '.';
      buttons.forEach((b) => { b.disabled = true; b.classList.remove('is-right', 'is-wrong'); });
      const again = h('button', { type: 'button', class: 'btn btn-accent st-btn-sm', text: 'Play again' });
      again.addEventListener('click', () => { index = 0; score = 0; answered = 0; show(); textEl.focus(); });
      result.replaceChildren(
        h('p', { text: 'Every “stop” broke at least one principle; every “ship” produced evidence in proportion to its risk. A practice that breaks one principle is not ready for production.' }),
        again);
      textEl.focus();
    }

    buttons.forEach((b) => b.addEventListener('click', () => answer(b.dataset.answer)));
    show();
  }

  /* ── 03 lifecycle tabs ───────────────────────────────────── */

  function initTabs(root) {
    if (!root) return;
    const tabs = $$('[role="tab"]', root);
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    function select(index, focus) {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tabs[index].focus();
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (event) => {
        const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        select((keys[event.key] + tabs.length) % tabs.length, true);
      });
    });
    select(Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')));
  }

  /* ── 04 capability check ─────────────────────────────────── */

  function initCapabilities() {
    const root = $('#cap-lab');
    if (!root) return;
    const boxes = $$('input[type="checkbox"]', root);
    const pillars = $$('.st-pillar', root);
    const foundation = $('.st-foundation', root);
    const verdict = $('#cap-verdict', root);
    const saved = store.get('capabilities', []);
    boxes.forEach((box) => { box.checked = saved.includes(box.value); });

    function update() {
      const summary = pillars.map((fieldset) => {
        const inputs = $$('input', fieldset);
        const have = inputs.filter((x) => x.checked).length;
        $('.st-meter-fill', fieldset).style.width = (have / inputs.length) * 100 + '%';
        $('.st-meter-count', fieldset).textContent = have + '/' + inputs.length;
        return { name: fieldset.dataset.pillar, risk: fieldset.dataset.risk, have, total: inputs.length };
      });
      const fHave = $$('input:checked', foundation).length;
      const fTotal = $$('input', foundation).length;
      const have = summary.reduce((sum, p) => sum + p.have, 0);
      const total = summary.reduce((sum, p) => sum + p.total, 0);
      store.set('capabilities', boxes.filter((b) => b.checked).map((b) => b.value));

      if (have === 0 && fHave === 0) {
        verdict.textContent = 'Tick the capabilities your team already has.';
        verdict.classList.remove('is-bad');
        return;
      }
      let text = 'You have ' + have + ' of ' + total + ' capabilities and ' + fHave + ' of ' + fTotal + ' foundations. ';
      if (have < total) {
        const weakest = summary.reduce((a, p) => (p.have < a.have ? p : a), summary[0]);
        text += 'Biggest gap: ' + weakest.name + ' (' + weakest.have + '/' + weakest.total + ') — ' + weakest.risk + '. Not yet ready for high-risk services: none of the twelve is optional there.';
      } else if (fHave < fTotal) {
        text += 'All twelve capabilities are in place, but the foundation is incomplete — ' + foundation.dataset.risk + '.';
      } else {
        text += 'All twelve capabilities and the shared foundation are in place: ready to run high-risk services at agent speed.';
      }
      verdict.textContent = text;
      verdict.classList.toggle('is-bad', have < total || fHave < fTotal);
    }
    boxes.forEach((box) => box.addEventListener('change', update));
    update();
  }

  /* ── 05 environment promotion path ──────────────────────── */

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

  function initEnvironments(envs) {
    const root = $('#env-lab');
    if (!root || !envs.length) return;
    const path = $('#env-path', root);
    const summary = $('#env-summary', root);
    const detail = $('#env-detail', root);
    const tierButtons = $$('[data-tier-control] [data-tier]', root);
    let selected = 1;

    const nodes = envs.map((env, i) => {
      const node = h('button', { type: 'button', class: 'st-env-node', 'aria-pressed': 'false' },
        h('span', { class: 'st-env-dot', text: String(i + 1) }),
        h('span', { class: 'st-env-name', text: env.short }),
        h('span', { class: 'st-env-state' }));
      node.addEventListener('click', () => { selected = i; paintSelection(); });
      path.append(h('li', null, node));
      return node;
    });

    function paintSelection() {
      nodes.forEach((node, i) => press(node, i === selected));
      const env = envs[selected];
      detail.replaceChildren(
        h('h4', { text: selected + 1 + ' · ' + env.name }),
        h('div', { class: 'st-env-grid' },
          field('Purpose', env.purpose), field('Lifecycle', env.lifecycle), field('Data', env.data),
          field('Tests run here', env.tests), field('Agent role', env.agent), field('Exit criteria to promote', env.exit)));
    }
    function paintTier(tier) {
      tierButtons.forEach((b) => press(b, Number(b.dataset.tier) === tier));
      nodes.forEach((node, i) => {
        const state = envs[i].states[tier];
        node.classList.remove('is-visit', 'is-optional', 'is-skip');
        node.classList.add('is-' + state);
        $('.st-env-state', node).textContent = ENV_STATE[state];
        node.setAttribute('aria-label', i + 1 + '. ' + envs[i].name + ' — ' + ENV_STATE[state].toLowerCase() + ' at Tier ' + tier);
      });
      summary.textContent = describePath(envs, tier);
      paintSelection();
    }
    tierButtons.forEach((b) => b.addEventListener('click', () => tierBus.set(b.dataset.tier)));
    tierBus.on(paintTier);
  }

  /* ── 06 Swiss cheese simulator ───────────────────────────── */

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
  const LANES = [0.06, 0.17, 0.28, 0.39, 0.5, 0.61, 0.72, 0.83, 0.94];

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

  function cheeseGeometry(width) {
    if (width >= 560) {
      const top = 14;
      const sliceH = 206;
      const padL = 40;
      const padR = 66;
      const slot = (width - padL - padR) / LAYERS.length;
      const sliceW = Math.min(40, slot * 0.46);
      const laneY = (lane) => top + 16 + lane * (sliceH - 32);
      const slice = (i) => { const cx = padL + slot * (i + 0.5); return { x: cx - sliceW / 2, y: top, w: sliceW, h: sliceH, cx }; };
      return {
        vertical: false, height: top + sliceH + 46, slice,
        hole: (i, lane) => ({ x: slice(i).cx, y: laneY(lane) }),
        start: (lane) => ({ x: padL - 22, y: laneY(lane) }),
        stopAt: (i, lane) => ({ x: slice(i).x - 1, y: laneY(lane) }),
        end: (lane) => ({ x: width - padR + 34, y: laneY(lane) }),
        label: (i) => ({ x: slice(i).cx, y: top + sliceH + 20 }),
        target: { x: width - 8, y: top + sliceH / 2 },
      };
    }
    const top = 30;
    const bandH = 22;
    const gap = 18;
    const x0 = 118;
    const x1 = width - 6;
    const height = top + LAYERS.length * (bandH + gap) + 34;
    const laneX = (lane) => x0 + 14 + lane * (x1 - x0 - 28);
    const slice = (i) => { const y = top + i * (bandH + gap); return { x: x0, y, w: x1 - x0, h: bandH, cy: y + bandH / 2 }; };
    return {
      vertical: true, height, slice,
      hole: (i, lane) => ({ x: laneX(lane), y: slice(i).cy }),
      start: (lane) => ({ x: laneX(lane), y: 16 }),
      stopAt: (i, lane) => ({ x: laneX(lane), y: slice(i).y - 1 }),
      end: (lane) => ({ x: laneX(lane), y: height - 24 }),
      label: (i) => ({ x: x0 - 10, y: slice(i).cy }),
      target: { x: (x0 + x1) / 2, y: height - 3 },
    };
  }

  function arrowHead(point, vertical) {
    const { x, y } = point;
    const d = vertical
      ? 'M' + x + ',' + y + ' L' + (x - 4.5) + ',' + (y - 8) + ' L' + (x + 4.5) + ',' + (y - 8) + ' Z'
      : 'M' + x + ',' + y + ' L' + (x - 8) + ',' + (y - 4.5) + ' L' + (x - 8) + ',' + (y + 4.5) + ' Z';
    return sv('path', { class: 'st-shot-head', d });
  }

  function initCheese() {
    const root = $('#cheese-lab');
    if (!root) return;
    const stage = $('#cheese-stage', root);
    const togglesWrap = $('#cheese-toggles', root);
    const narrative = $('#cheese-narrative', root);
    const detail = $('#cheese-detail', root);
    const statsEl = $('#cheese-stats', root);
    const barsEl = $('#cheese-bars', root);
    const indepBtn = $('#cheese-indep', root);
    const layerRows = $$('#layer-table tbody tr').map((tr) => $$('th, td', tr).map((cell) => cell.textContent.trim()));
    const decorativeHoles = LAYERS.map((_, i) => {
      const rand = mulberry32(i * 7919 + 13);
      return Array.from({ length: 2 + Math.floor(rand() * 2) }, () => 0.08 + rand() * 0.84);
    });
    const state = { enabled: LAYERS.map(() => true), independent: true, inspect: -1, shots: [], letter: 0, fired: null };
    const baseline = expectedContainment(state.enabled, true);
    let sliceEls = [];
    let lastWidth = 0;

    const resetTally = () => { state.fired = { total: 0, early: 0, late: 0, canary: 0, escaped: 0 }; };
    resetTally();

    // The opening picture mirrors the diagram in the strategy document.
    state.shots = [
      { letter: 'A', lane: 0.28, defect: DEFECTS[2], passed: [0, 1], stop: 2 },
      { letter: 'B', lane: 0.72, defect: DEFECTS[8], passed: [0, 1, 2, 3, 4, 5], stop: 6 },
    ];
    state.letter = 2;
    narrative.textContent = 'Defect A — a logic error in a function — slipped past spec review and static + AI review, then unit tests stopped it. Defect B — a slow-burn defect on a low-traffic path — passed six aligned holes; only the last slice, canary & SLO rollback, stopped it.';

    const toggles = LAYERS.map((layer, i) => {
      const btn = h('button', { type: 'button', class: 'st-layer-toggle', 'aria-pressed': 'true', text: i + 1 + ' ' + layer.full });
      btn.addEventListener('click', () => setLayer(i, !state.enabled[i]));
      togglesWrap.append(btn);
      return btn;
    });

    function setLayer(i, on) {
      state.enabled[i] = on;
      press(toggles[i], on);
      configChanged();
    }
    indepBtn.addEventListener('click', () => {
      state.independent = !state.independent;
      indepBtn.setAttribute('aria-checked', state.independent ? 'true' : 'false');
      configChanged();
    });
    function configChanged() {
      state.shots = [];
      resetTally();
      narrative.textContent = 'Set-up changed. The expected results below have updated — fire a defect to test it.';
      narrative.classList.remove('is-bad');
      draw();
      renderExpected();
      renderDetail();
    }

    function draw() {
      const width = Math.round(stage.clientWidth);
      if (!width) return;
      lastWidth = width;
      const g = cheeseGeometry(width);
      const svg = sv('svg', { width, height: g.height, viewBox: '0 0 ' + width + ' ' + g.height, role: 'group', 'aria-label': 'Seven layers of defence and the paths of recent defects' });

      svg.append(g.vertical
        ? sv('text', { class: 'st-cheese-target', x: g.target.x, y: g.target.y, 'text-anchor': 'middle' }, 'CUSTOMERS')
        : sv('text', { class: 'st-cheese-target', x: g.target.x, y: g.target.y, 'text-anchor': 'middle', transform: 'rotate(90 ' + g.target.x + ' ' + g.target.y + ')' }, 'CUSTOMERS'));

      sliceEls = LAYERS.map((layer, i) => {
        const s = g.slice(i);
        const on = state.enabled[i];
        const group = sv('g', {
          class: 'st-slice' + (on ? '' : ' is-off') + (state.inspect === i ? ' is-inspected' : ''),
          tabindex: '0', role: 'button', 'aria-label': 'Inspect ' + layer.full + (on ? '' : ' (switched off)'),
        });
        group.append(sv('rect', { x: s.x, y: s.y, width: s.w, height: s.h }));
        if (on) decorativeHoles[i].forEach((lane) => { const p = g.hole(i, lane); group.append(sv('circle', { class: 'st-hole', cx: p.x, cy: p.y, r: 6 })); });
        const at = g.label(i);
        if (g.vertical) {
          group.append(sv('text', { class: 'st-slice-name', x: at.x, y: at.y - 2, 'text-anchor': 'end' }, i + 1 + ' ' + layer.name));
          group.append(sv('text', { class: 'st-slice-sub', x: at.x, y: at.y + 10, 'text-anchor': 'end' }, on ? layer.sub : 'switched off'));
        } else {
          group.append(sv('text', { class: 'st-slice-name', x: at.x, y: at.y, 'text-anchor': 'middle' }, layer.name));
          group.append(sv('text', { class: 'st-slice-sub', x: at.x, y: at.y + 13, 'text-anchor': 'middle' }, on ? layer.sub : 'off'));
        }
        group.addEventListener('click', () => inspect(i));
        group.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(i); }
        });
        svg.append(group);
        return group;
      });

      const fresh = [];
      state.shots.forEach((shot, idx) => {
        const age = state.shots.length - 1 - idx;
        const group = sv('g', { class: 'st-shot', opacity: Math.max(0.35, 1 - age * 0.16).toFixed(2) });
        shot.passed.forEach((i) => { const p = g.hole(i, shot.lane); group.append(sv('circle', { class: 'st-hole', cx: p.x, cy: p.y, r: 7 })); });
        const a = g.start(shot.lane);
        const b = shot.stop >= 0 ? g.stopAt(shot.stop, shot.lane) : g.end(shot.lane);
        const line = sv('line', { class: 'st-shot-line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        const marks = sv('g');
        if (shot.stop >= 0) {
          const s = g.slice(shot.stop);
          marks.append(arrowHead(b, g.vertical));
          marks.append(g.vertical
            ? sv('rect', { class: 'st-shot-stop', x: b.x - 9, y: s.y - 1.5, width: 18, height: 3 })
            : sv('rect', { class: 'st-shot-stop', x: s.x - 1.5, y: b.y - 9, width: 3, height: 18 }));
        } else {
          marks.append(sv('circle', { class: 'st-shot-escape', cx: b.x, cy: b.y, r: 8 }));
          marks.append(sv('text', { class: 'st-shot-x', x: b.x, y: b.y + 3.5, 'text-anchor': 'middle' }, '✕'));
        }
        group.append(line, marks, g.vertical
          ? sv('text', { class: 'st-shot-tag', x: a.x, y: a.y - 5, 'text-anchor': 'middle' }, shot.letter)
          : sv('text', { class: 'st-shot-tag', x: a.x - 6, y: a.y + 3.5, 'text-anchor': 'end' }, shot.letter));
        svg.append(group);
        if (shot.fresh && !reduceMotion) fresh.push({ line, marks, length: Math.hypot(b.x - a.x, b.y - a.y) });
        shot.fresh = false;
      });

      stage.replaceChildren(svg);
      if (!fresh.length) return;
      fresh.forEach(({ line, marks, length }) => {
        line.style.strokeDasharray = length;
        line.style.strokeDashoffset = length;
        marks.style.opacity = '0';
      });
      requestAnimationFrame(() => requestAnimationFrame(() => fresh.forEach(({ line, marks }) => {
        line.classList.add('is-drawing');
        line.style.strokeDashoffset = '0';
        marks.style.transition = 'opacity 0.2s 0.6s';
        marks.style.opacity = '1';
      })));
    }

    function inspect(i) {
      state.inspect = state.inspect === i ? -1 : i;
      sliceEls.forEach((el, j) => el.classList.toggle('is-inspected', j === state.inspect));
      renderDetail();
    }
    function renderDetail() {
      const i = state.inspect;
      if (i < 0 || !layerRows[i]) { detail.replaceChildren(); return; }
      const row = layerRows[i];
      const on = state.enabled[i];
      const toggle = h('button', { type: 'button', class: 'btn btn-ghost st-btn-sm', text: on ? 'Switch this slice off' : 'Switch this slice on' });
      toggle.addEventListener('click', () => setLayer(i, !state.enabled[i]));
      detail.replaceChildren(
        h('div', { class: 'st-layer-detail-head' }, h('h4', { text: i + 1 + ' · ' + row[0] }), toggle),
        h('div', { class: 'st-detail-grid' },
          field('Catches', row[1]), field('Typical holes', row[2]), field('How AI helps', row[3]), field('How we shrink the holes', row[4])));
    }

    const barRows = LAYERS.map((layer, i) => ({ name: i + 1 + ' ' + layer.full, i }))
      .concat([{ name: 'Escaped to customers', i: -1 }])
      .map((r) => {
        const fill = h('span', { class: 'st-hbar-fill' });
        const value = h('span', { class: 'st-hbar-val' });
        const row = h('div', { class: 'st-hbar' + (r.i < 0 ? ' is-escape' : '') },
          h('span', { class: 'st-hbar-name', text: r.name }), h('span', { class: 'st-hbar-track' }, fill, value));
        barsEl.append(row);
        return Object.assign(r, { row, fill, value });
      });

    function renderExpected() {
      const exp = expectedContainment(state.enabled, state.independent);
      barRows.forEach((r) => {
        const off = r.i >= 0 && !state.enabled[r.i];
        const v = r.i < 0 ? exp.escaped : exp.caught[r.i];
        r.fill.style.width = 'calc((100% - 3.2rem) * ' + (Math.min(100, v) / 100).toFixed(4) + ')';
        r.value.textContent = off ? 'off' : fmt(v);
        r.row.classList.toggle('is-off', off);
      });
      const early = exp.caught[0] + exp.caught[1] + exp.caught[2];
      const late = exp.caught[3] + exp.caught[4] + exp.caught[5];
      const escDelta = exp.escaped - baseline.escaped;
      const escNote = Math.abs(escDelta) < 0.05 ? 'With every slice on and independent tests'
        : (escDelta > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(escDelta)) + ' vs every slice on';
      statsEl.replaceChildren(
        statTile('Early · 1–3', String(Math.round(early)), 'of 100', 'Cheap, fast feedback'),
        statTile('Late · 4–6', String(Math.round(late)), 'of 100', 'Slower and costlier to fix'),
        statTile('Canary · 7', String(Math.round(exp.caught[6])), 'of 100', 'In production, limited blast radius'),
        statTile('Escaped', fmt(exp.escaped), 'of 100', escNote, escDelta > 0.05 ? 'is-bad' : ''));
    }

    function pickDefect() {
      let r = Math.random() * DEFECT_WEIGHT;
      for (const defect of DEFECTS) { r -= defect.w; if (r <= 0) return defect; }
      return DEFECTS[DEFECTS.length - 1];
    }
    function fireOne() {
      const defect = pickDefect();
      const passed = [];
      let stop = -1;
      for (let i = 0; i < LAYERS.length; i++) {
        if (!state.enabled[i]) continue;
        if (Math.random() < catchChance(defect, i, state.independent)) { stop = i; break; }
        passed.push(i);
      }
      const recent = state.shots.slice(-4).map((s) => s.lane);
      const free = LANES.filter((lane) => !recent.includes(lane));
      const shot = {
        letter: String.fromCharCode(65 + (state.letter++ % 26)),
        lane: free[Math.floor(Math.random() * free.length)],
        defect, passed, stop, fresh: true,
      };
      state.shots.push(shot);
      if (state.shots.length > 5) state.shots.shift();
      const f = state.fired;
      f.total += 1;
      if (stop < 0) f.escaped += 1;
      else if (stop <= 2) f.early += 1;
      else if (stop <= 5) f.late += 1;
      else f.canary += 1;
      return shot;
    }
    function describe(shot) {
      const head = 'Defect ' + shot.letter + ' — ' + shot.defect.label + ' — ';
      if (shot.stop >= 0) {
        const slipped = shot.passed.length ? 'slipped past ' + joinList(shot.passed.map((i) => LAYERS[i].phrase)) + ', then ' : '';
        const stopper = LAYERS[shot.stop].phrase;
        const tail = shot.stop === 6 ? ' It reached production, but only at canary blast radius.' : '';
        return head + slipped + stopper + (shot.passed.length ? ' stopped it.' : ' stopped it straight away.') + tail;
      }
      const owner = ownerLayer(shot.defect);
      return head + 'passed every slice and reached customers. Which slice should have caught it? ' + LAYERS[owner].full +
        (state.enabled[owner] ? ' — the post-incident review adds a test there.' : ' — and it is switched off.');
    }
    const tallyText = () => (state.fired.total > 1
      ? ' So far: ' + state.fired.total + ' fired, ' + state.fired.escaped + ' escaped.' : '');

    $('#cheese-fire', root).addEventListener('click', () => {
      const shot = fireOne();
      draw();
      narrative.textContent = describe(shot) + tallyText();
      narrative.classList.toggle('is-bad', shot.stop < 0);
    });
    $('#cheese-fire10', root).addEventListener('click', () => {
      const shots = Array.from({ length: 10 }, fireOne);
      draw();
      const count = (test) => shots.filter(test).length;
      const escaped = count((s) => s.stop < 0);
      narrative.textContent = 'Fired 10: ' + count((s) => s.stop >= 0 && s.stop <= 2) + ' stopped early, ' +
        count((s) => s.stop >= 3 && s.stop <= 5) + ' late, ' + count((s) => s.stop === 6) + ' at canary and ' +
        escaped + ' escaped.' + tallyText();
      narrative.classList.toggle('is-bad', escaped > 0);
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (Math.abs(stage.clientWidth - lastWidth) > 1) draw(); }).observe(stage);
    } else {
      window.addEventListener('resize', draw);
    }
    draw();
    renderExpected();
  }

  /* ── 07 test pyramid ─────────────────────────────────────── */

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

  function initPyramid() {
    const root = $('#pyramid-lab');
    if (!root) return;
    const shapeEl = $('#pyr-shape', root);
    const slidersEl = $('#pyr-sliders', root);
    const statsEl = $('#pyr-stats', root);
    const verdict = $('#pyr-verdict', root);
    const detail = $('#pyr-detail', root);
    const presets = $$('[data-preset]', root);
    const tableRows = {};
    $$('#automate-table tbody tr').forEach((tr) => { tableRows[tr.dataset.level] = $$('th, td', tr).map((c) => c.textContent.trim()); });
    const counts = Object.assign({}, PYR_PRESETS.cone);
    let inspected = null;

    const rowButtons = [];
    function levelRow(key, label, area, value) {
      const btn = h('button', { type: 'button', class: 'st-pyr-row', 'aria-pressed': 'false', 'data-level': key },
        h('span', { class: 'st-pyr-name', text: label }), area, value || h('span', { class: 'st-pyr-val' }));
      btn.addEventListener('click', () => { inspected = inspected === key ? null : key; renderDetail(); });
      rowButtons.push(btn);
      return btn;
    }

    shapeEl.append(levelRow('explore', 'Exploratory',
      h('span', { class: 'st-pyr-area' }, h('span', { class: 'st-pyr-note', text: 'Risk-based charters, not a %' }))));
    shapeEl.lastChild.classList.add('st-pyr-row--note');
    const bars = {};
    PYR_LEVELS.forEach((level) => {
      const ghost = h('span', { class: 'st-pyr-ghost', style: 'width:' + level.target + '%' });
      const fill = h('span', { class: 'st-pyr-fill' });
      const value = h('span', { class: 'st-pyr-val' });
      bars[level.key] = { fill, value };
      shapeEl.append(levelRow(level.key, level.name, h('span', { class: 'st-pyr-area' }, ghost, fill), value));
    });
    const base = levelRow('foundation', 'Foundation', h('span', { class: 'st-pyr-area', text: 'Static analysis · types · AI review' }), h('span', { class: 'st-pyr-val', text: 'every commit' }));
    base.classList.add('st-pyr-row--base');
    shapeEl.append(base, h('p', { class: 'st-pyr-legend' },
      h('span', null, h('i', { style: 'background:var(--accent)' }), 'Your suite, by share of tests'),
      h('span', null, h('i', { style: 'border:1px solid #444' }), 'AI-era target')));

    const sliders = {};
    PYR_LEVELS.concat([{ key: 'manual', name: 'Manual regression', max: 120, step: 2 }]).forEach((level) => {
      const id = 'pyr-' + level.key;
      const input = h('input', { class: 'st-range', type: 'range', id, min: 0, max: level.max, step: level.step });
      const out = h('output', { for: id });
      input.addEventListener('input', () => { counts[level.key] = Number(input.value); render(); });
      sliders[level.key] = { input, out };
      slidersEl.append(h('div', { class: 'st-slider' },
        h('label', { for: id }, h('span', { class: 'st-field-label', text: level.name }), out), input));
    });

    presets.forEach((btn) => btn.addEventListener('click', () => {
      Object.assign(counts, PYR_PRESETS[btn.dataset.preset]);
      render();
    }));

    function renderDetail() {
      rowButtons.forEach((b) => press(b, b.dataset.level === inspected));
      const row = inspected && tableRows[inspected];
      if (!row) { detail.replaceChildren(); return; }
      detail.replaceChildren(
        h('div', { class: 'st-layer-detail-head' }, h('h4', { text: row[0] })),
        h('div', { class: 'st-detail-grid' },
          field('Automate first', row[1]), field('AI accelerator', row[2]), field('Efficiency lever', row[3]), field('Proof the tests are good', row[4])));
    }

    function render() {
      const s = pyramidStats(counts);
      PYR_LEVELS.forEach((level) => {
        bars[level.key].fill.style.width = s.shares[level.key] + '%';
        bars[level.key].value.textContent = counts[level.key].toLocaleString('en-US') + ' · ' + Math.round(s.shares[level.key]) + '%';
      });
      Object.keys(sliders).forEach((key) => {
        const { input, out } = sliders[key];
        input.value = counts[key];
        paintRange(input);
        out.textContent = key === 'manual' ? counts[key] + ' h per release' : counts[key].toLocaleString('en-US') + ' tests';
      });
      presets.forEach((btn) => {
        const preset = PYR_PRESETS[btn.dataset.preset];
        press(btn, Object.keys(preset).every((k) => preset[k] === counts[k]));
      });
      shapeEl.setAttribute('aria-label', 'Test suite shape: ' + PYR_LEVELS.map((l) => l.name + ' ' + Math.round(s.shares[l.key]) + '%').join(', '));

      const SHAPES = { pyramid: 'Pyramid', cone: 'Ice-cream cone', lopsided: 'Lopsided', empty: 'No tests yet' };
      const fastEnough = s.minutes < 15;
      const stable = s.flakyRate < 2;
      statsEl.replaceChildren(
        statTile('Shape', SHAPES[s.shape], '', 'Target 70 / 20 / 8 / 2', s.shape === 'pyramid' ? 'is-good' : 'is-bad'),
        statTile('PR feedback', fmt(s.minutes), 'min', fastEnough ? '✓ Under the 15-minute target' : '▲ Over the 15-minute target', fastEnough ? 'is-good' : 'is-bad'),
        statTile('Flaky test rate', fmt(s.flakyRate) + '%', '', stable ? '✓ Under the 2% target' : '▲ Over the 2% target', stable ? 'is-good' : 'is-bad'),
        statTile('Manual regression', String(counts.manual), 'h', 'Per release · target towards zero', counts.manual <= 8 ? 'is-good' : 'is-bad'));

      let text;
      if (s.shape === 'empty') {
        text = 'No automated tests yet. Start from risk, not coverage: automate Tier 3 services and critical journeys first.';
      } else if (s.shape === 'cone') {
        text = 'An ice-cream cone: most checks sit at the slow, brittle top, so feedback takes ' + fmt(s.minutes) + ' minutes and ' + fmt(s.flakyRate) + '% of tests are flaky. AI does not fix it by itself; used naively, it makes the cone bigger.';
      } else if (s.shape === 'lopsided') {
        text = 'Neither a pyramid nor a cone. Push every test down: when a test can move a level lower and still catch the defect, move it.';
      } else if (fastEnough && stable) {
        text = 'A pyramid: most checks run at the fast, cheap base. Feedback in ' + fmt(s.minutes) + ' minutes and a ' + fmt(s.flakyRate) + '% flaky rate keep the pipeline trusted — you would not find a weak brick by walking through the finished building.';
      } else {
        text = 'The shape is right, but ' + (fastEnough ? 'flakiness is too high — treat it as a defect: quarantine, fix or delete within a sprint.' : 'feedback takes ' + fmt(s.minutes) + ' minutes. Run only what matters: test impact analysis and parallelism keep PR feedback under 15 minutes.');
      }
      verdict.textContent = text;
      verdict.classList.toggle('is-bad', s.shape !== 'pyramid' || !fastEnough || !stable);
    }

    render();
    renderDetail();
  }

  /* ── 08 route a change ───────────────────────────────────── */

  function initRisk(envs) {
    const root = $('#risk-lab');
    if (!root) return;
    const examples = $$('.st-example', root);
    const tiers = $$('.st-tier', root);
    const steps = $$('.st-step', root);
    const strip = $('#risk-envstrip', root);
    const DEPTH = { 1: 'Light', 2: 'Standard', 3: 'Deep' };

    steps.forEach((step) => $('.st-depth', step).append(
      h('span', { class: 'st-depth-bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'st-depth-label' })));

    examples.forEach((btn) => btn.addEventListener('click', () => {
      examples.forEach((x) => press(x, x === btn));
      tierBus.set(btn.dataset.exampleTier);
    }));
    tiers.forEach((btn) => btn.addEventListener('click', () => {
      examples.forEach((x) => press(x, false));
      tierBus.set(btn.dataset.tier);
    }));

    tierBus.on((tier) => {
      tiers.forEach((btn) => press(btn, Number(btn.dataset.tier) === tier));
      examples.forEach((x) => { if (Number(x.dataset.exampleTier) !== tier) press(x, false); });
      steps.forEach((step) => {
        const depth = Number(step.dataset['d' + tier]);
        $$('.st-depth-bars i', step).forEach((bar, i) => bar.classList.toggle('is-on', i < depth));
        $('.st-depth-label', step).textContent = DEPTH[depth];
        $('.st-step-tier', step).textContent = step.dataset['t' + tier];
      });
      if (strip && envs.length) {
        const pills = [];
        envs.forEach((env, i) => {
          const state = env.states[tier];
          if (i) pills.push(h('span', { class: 'st-arrow', 'aria-hidden': 'true', text: '→' }));
          pills.push(h('span', { class: 'st-pill is-' + state },
            env.short + (state === 'optional' ? ' (as needed)' : ''),
            state === 'skip' ? h('span', { class: 'st-sr', text: ' (skipped)' }) : null));
        });
        strip.replaceChildren(h('p', { class: 'st-mini-label', text: 'Environments a Tier ' + tier + ' change visits' }), ...pills);
      }
    });

    if (examples[0]) press(examples[0], true);
  }

  /* ── 10 maturity self-assessment ─────────────────────────── */

  function initMaturity() {
    const root = $('#maturity-lab');
    if (!root) return;
    const rowsEl = $('#mat-rows', root);
    const statsEl = $('#mat-stats', root);
    const verdict = $('#mat-verdict', root);
    const tierSelect = $('#mat-tier', root);
    const DIMS = ['Plan and design', 'Build', 'Test', 'Deploy and operate'];
    const levels = $$('#maturity-table tbody tr').map((tr) => {
      const cells = $$('th, td', tr).map((c) => c.textContent.trim());
      return { n: Number(cells[0]), name: cells[1], dims: cells.slice(2, 6) };
    });
    if (levels.length !== 5) return;
    const saved = store.get('maturity', null);
    const current = Array.isArray(saved) && saved.length === 4 ? saved.slice() : [2, 2, 2, 2];
    tierSelect.value = String(store.get('maturityTier', tierSelect.value));

    const rowParts = DIMS.map((dim, d) => {
      const buttons = levels.map((level) => {
        const btn = h('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': dim + ': level ' + level.n + ', ' + level.name, text: String(level.n) });
        if (level.n === 4) btn.classList.add('is-target');
        btn.addEventListener('click', () => { current[d] = level.n; render(); });
        return btn;
      });
      const desc = h('p', { class: 'st-mat-desc' });
      rowsEl.append(h('div', { class: 'st-mat-row' },
        h('p', { class: 'st-mat-name', text: dim }),
        h('div', { class: 'st-mat-levels', role: 'group', 'aria-label': dim + ' level' }, buttons),
        desc));
      return { buttons, desc };
    });

    function render() {
      store.set('maturity', current);
      store.set('maturityTier', tierSelect.value);
      rowParts.forEach((part, d) => {
        const lvl = current[d];
        part.buttons.forEach((btn, i) => {
          press(btn, i + 1 === lvl);
          btn.classList.toggle('is-below', i + 1 < lvl);
        });
        const now = levels[lvl - 1];
        const next = levels[lvl];
        part.desc.replaceChildren(
          h('strong', { text: 'L' + now.n + ' ' + now.name }), ' — ' + now.dims[d],
          h('span', { class: 'st-mat-next', text: next ? 'Next: L' + next.n + ' ' + next.name + ' — ' + next.dims[d] : 'Top of the model.' }));
      });

      const average = current.reduce((a, b) => a + b, 0) / current.length;
      const lowest = Math.min(...current);
      const weakest = DIMS.filter((_, d) => current[d] === lowest);
      const gap = current.reduce((sum, l) => sum + Math.max(0, 4 - l), 0);
      statsEl.replaceChildren(
        statTile('Average level', average.toFixed(1), 'of 5'),
        weakest.length === DIMS.length
          ? statTile('Weakest link', 'Balanced', '', 'Every dimension at Level ' + lowest)
          : statTile('Weakest link', weakest[0], '', 'Level ' + lowest),
        statTile('Steps to Level 4', String(gap), gap === 1 ? 'step' : 'steps', 'Target for every dimension within 15 months', gap === 0 ? 'is-good' : ''));

      const tier3AtFive = tierSelect.value === '3' && current.some((l) => l === 5);
      let text;
      if (tier3AtFive) {
        text = 'Tier 3 services never go above Level 4. Keep a named human decision on every high-risk change — agents may deliver Tier 1 changes end to end, never Tier 3.';
      } else if (gap === 0) {
        text = 'At or above the Level 4 target in every dimension. Level 5 — autonomous with guardrails — stays off-limits for Tier 3 services.';
      } else {
        const d = current.indexOf(lowest);
        const step = levels[lowest].dims[d].charAt(0).toLowerCase() + levels[lowest].dims[d].slice(1);
        text = 'Profile ' + current.map((l) => 'L' + l).join(' · ') + '. Most teams self-assess at Level 2 today. ' +
          (weakest.length === DIMS.length
            ? 'With a balanced profile, start with intent before implementation — plan and design: ' + step + '.'
            : 'Start where you are weakest — ' + DIMS[d].toLowerCase() + ': ' + step + '.');
      }
      verdict.textContent = text;
      verdict.classList.toggle('is-bad', tier3AtFive);
    }
    tierSelect.addEventListener('change', render);

    const copyBtn = $('#mat-to-workbook', root);
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const form = $('#wb-form');
        if (!form) return;
        const map = { plan: 0, design: 0, build: 1, test: 2, deploy: 3, maintain: 3 };
        Object.keys(map).forEach((stage) => {
          const select = form.elements['b-' + stage + '-level'];
          if (select) select.value = String(current[map[stage]]);
        });
        form.dispatchEvent(new Event('input', { bubbles: true }));
        const part = $('.st-part[data-part="B"]', form);
        if (part) {
          part.open = true;
          part.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      });
    }
    render();
  }

  /* ── 10 gate check ───────────────────────────────────────── */

  function initGate() {
    const root = $('#gate-lab');
    if (!root) return;
    const result = $('#gate-result', root);
    const state = {};
    $$('[data-gate]', root).forEach((group) => {
      const buttons = $$('button', group);
      const pressed = buttons.find((b) => b.getAttribute('aria-pressed') === 'true') || buttons[0];
      state[group.dataset.gate] = pressed.dataset.trend;
      buttons.forEach((btn) => btn.addEventListener('click', () => {
        buttons.forEach((b) => press(b, b === btn));
        state[group.dataset.gate] = btn.dataset.trend;
        render();
      }));
    });
    function render() {
      const go = state.lt === 'falling' && state.cfr !== 'rising';
      let title;
      let text;
      if (go) {
        title = 'Improving — the gate opens';
        text = state.cfr === 'falling'
          ? 'Lead time and change failure rate are both falling: faster and more stable.'
          : 'Lead time is falling while change failure rate holds flat — speed without a stability cost.';
      } else if (state.lt === 'falling') {
        title = 'Not improved — cost moved downstream';
        text = 'Lead time is falling while change failure rate rises. The team has not improved; it has moved cost downstream.';
      } else if (state.lt === 'flat') {
        title = 'Hold — no flow gain yet';
        text = state.cfr === 'rising'
          ? 'Lead time is flat and change failure rate is rising: stabilise before the next phase starts.'
          : 'Stable, but not faster yet. The next phase waits until lead time falls — find the queue that absorbs the time agents save.';
      } else {
        title = 'Stop — slower than before';
        text = 'Lead time is rising. Find the new constraint — usually review queues, environments or approvals — before scaling further.';
      }
      result.replaceChildren(
        h('span', { class: 'st-gate-badge ' + (go ? 'is-go' : 'is-nogo'), text: go ? 'GO' : 'NO-GO' }),
        h('div', null, h('strong', { text: title }), h('p', { text })));
    }
    render();
  }

  /* ── 11 team questionnaire ───────────────────────────────── */

  function initWorkbook() {
    const root = $('#workbook');
    if (!root) return;
    const form = $('#wb-form', root);
    const progress = $('#wb-progress', root);
    const status = $('#wb-status', root);
    const parts = $$('.st-part', form);
    const fields = $$('input, textarea, select', form).filter((f) => f.name);
    const saved = store.get('workbook', {});
    let statusTimer;
    let saveTimer;

    fields.forEach((f) => {
      if (!(f.name in saved)) return;
      if (f.type === 'checkbox') f.checked = !!saved[f.name];
      else f.value = saved[f.name];
    });

    function collect() {
      const data = {};
      fields.forEach((f) => {
        if (f.type === 'checkbox') { if (f.checked) data[f.name] = true; }
        else if (f.value.trim()) data[f.name] = f.value;
      });
      return data;
    }
    function save() { clearTimeout(saveTimer); store.set('workbook', collect()); }
    function flash(message) {
      status.textContent = message;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { status.textContent = ''; }, 4000);
    }

    function updateCounts() {
      let answered = 0;
      let total = 0;
      let committed = 0;
      let commitments = 0;
      parts.forEach((part) => {
        let have = 0;
        let of = 0;
        if (part.dataset.part === 'G') {
          const boxes = $$('input[type="checkbox"]', part);
          have = boxes.filter((b) => b.checked).length;
          of = boxes.length;
          committed = have;
          commitments = of;
        } else if (part.dataset.part === 'B') {
          $$('.st-bstage', part).forEach((fs) => {
            of += 1;
            if ($$('input, select', fs).some((f) => f.value.trim())) have += 1;
          });
        } else {
          const areas = $$('textarea', part);
          of = areas.length;
          have = areas.filter((a) => a.value.trim()).length;
        }
        if (part.dataset.part !== 'G') { answered += have; total += of; }
        const count = $('.st-part-count', part);
        count.textContent = have + '/' + of + (part.dataset.part === 'G' ? ' committed' : '');
        count.classList.toggle('is-done', have === of);
      });
      progress.replaceChildren(h('strong', { text: String(answered) }), ' of ' + total + ' answered · ',
        h('strong', { text: String(committed) }), ' of ' + commitments + ' commitments');
    }

    function toMarkdown() {
      const cell = (s) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
      const teamField = form.elements.a1;
      const team = teamField ? teamField.value.trim().split('\n')[0] : '';
      const lines = [
        '# AI-native journey' + (team ? ' — ' + team : ''), '',
        '_Team questionnaire from the AI-Native Quality Assurance Strategy (' + location.origin + location.pathname + ') · exported ' + new Date().toISOString().slice(0, 10) + '_', '',
      ];
      parts.forEach((part) => {
        lines.push('## ' + $('.st-part-title', part).textContent.trim(), '');
        if (part.dataset.part === 'B') {
          lines.push('| Stage | Current level (1 to 5) | Evidence | Biggest constraint today |', '|---|---|---|---|');
          $$('.st-bstage', part).forEach((fs) => {
            const values = $$('select, input', fs).map((f) => cell(f.value));
            lines.push('| ' + fs.dataset.stage + ' | ' + values.join(' | ') + ' |');
          });
          lines.push('');
        } else if (part.dataset.part === 'G') {
          $$('.st-check', part).forEach((label) => lines.push('- [' + ($('input', label).checked ? 'x' : ' ') + '] ' + $('span', label).textContent.trim()));
          lines.push('');
        } else {
          $$('.st-q', part).forEach((q) => {
            const label = $('label', q);
            const id = $('.st-q-id', label);
            const question = label.textContent.trim().slice(id ? id.textContent.length : 0).trim();
            const answer = $('textarea', q).value.trim();
            lines.push('**' + (id ? id.textContent + '. ' : '') + question + '**', '', answer || '_Unanswered_', '');
          });
        }
      });
      return lines.join('\n');
    }

    form.addEventListener('input', () => { updateCounts(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); });
    form.addEventListener('change', () => { updateCounts(); save(); });
    form.addEventListener('submit', (event) => event.preventDefault());
    window.addEventListener('pagehide', save);

    $('#wb-download', root).addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' }));
      const link = h('a', { href: url, download: 'ai-native-journey.md' });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash('Markdown file downloaded.');
    });
    $('#wb-copy', root).addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(toMarkdown());
        flash('Copied to the clipboard as Markdown.');
      } catch (e) {
        flash('This browser blocked the clipboard — use Download Markdown instead.');
      }
    });
    $('#wb-clear', root).addEventListener('click', () => {
      if (!window.confirm('Clear every answer in this questionnaire? This cannot be undone.')) return;
      form.reset();
      save();
      updateCounts();
      flash('Answers cleared.');
    });

    updateCounts();
  }

  /* ── tables that stack into labelled cards on phones ─────── */

  function initResponsiveTables() {
    $$('table.st-responsive').forEach((table) => {
      const headers = $$('thead th', table).map((th) => th.textContent.trim());
      $$('tbody tr', table).forEach((tr) => {
        Array.from(tr.children).forEach((cell, i) => {
          if (cell.tagName === 'TD' && headers[i]) cell.setAttribute('data-label', headers[i]);
        });
      });
    });
  }

  /* ── print / save as PDF: every section expanded ───────────── */

  function initPrint() {
    let opened = [];
    window.addEventListener('beforeprint', () => {
      opened = $$('details:not([open])');
      opened.forEach((d) => { d.open = true; });
    });
    window.addEventListener('afterprint', () => {
      opened.forEach((d) => { d.open = false; });
      opened = [];
    });
  }

  /* ── boot ────────────────────────────────────────────────── */

  const envs = readEnvironments();
  const tools = [
    initChapters, initResponsiveTables, initSpeedLab, initShipGame, () => initTabs($('#stage-lab')), initCapabilities,
    () => initEnvironments(envs), initCheese, initPyramid, () => initRisk(envs), initMaturity, initGate, initWorkbook, initPrint,
  ];
  tools.forEach((init) => {
    try { init(); } catch (error) { console.error('Strategy tool failed to start:', error); }
  });
  tierBus.set(tierBus.tier);
})();
