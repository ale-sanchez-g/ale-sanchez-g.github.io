# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Alejandro Sanchez-Giraldo's personal site, published by GitHub Pages from `main` at the domain root (`https://ale-sanchez-g.github.io/`). Every page is hand-written static HTML with plain CSS and vanilla JS. There is no build step, templating, framework, bundler, linter or formatter. Node exists only to run the tests, and Python only to serve files locally.

## Commands

```bash
npm ci                                  # Playwright 1.63.0, pinned by package-lock.json (1.56.1 couldn't install Chromium on ubuntu-latest, now Ubuntu 26.04)
npx playwright install chromium         # the Chromium build that version expects
npm run serve                           # http://localhost:8765 (python3 -m http.server, run from the repo root)
npm test                                # unit tests, then E2E tests
npm run test:unit                       # node --test: no browser, no dependencies, ~0.1 s
npm run test:e2e                        # Playwright; starts the :8765 server, or reuses whatever already listens there outside CI
npm run test:strategy                   # E2E tests for the strategy page's interactive tools
npm run security                        # npm audit --audit-level=high && npm audit signatures
node --test --test-name-pattern="Swiss cheese" tests/unit/*.test.js                       # a subset of unit tests
npx playwright test tests/e2e/strategy.spec.ts -g "speed paradox" --project="Desktop Chrome"  # a single E2E test
```

## Tests and quality gates

- **CI:** `.github/workflows/quality-gates.yml` runs on every push, on PRs to `main`, weekly and on demand. All jobs use a read-only token. It has five independent jobs:
  - `Unit tests`;
  - `E2E tests`;
  - `Security: dependency audit` (`npm audit` plus registry signatures and provenance);
  - `Security: dependency review` (PRs only);
  - `Security: CodeQL` (`security-extended` queries; results under Security → Code scanning).

  These jobs block merges only if they are marked as required status checks on `main`. Dependabot (`.github/dependabot.yml`) opens weekly, grouped update PRs for npm and GitHub Actions.
- **Unit tests** (`tests/unit/`, Node's built-in runner, CommonJS) cover `assets/js/strategy-model.js`.
  - Several tests pin the numbers that the page explains in prose. If one fails after a deliberate model change, update the matching "How this model works" / "Model assumptions" text as well as the test.
  - The `describePath` tests read `#env-table`'s `data-*` attributes straight from the HTML.
- **E2E tests** (`tests/e2e/`, Playwright) run in two projects, `Desktop Chrome` (1280×900) and `Mobile Chrome` (Pixel 5), with one worker, no retries, and `forbidOnly` in CI:
  - `pages.ts` lists every page.
  - `navigation.spec.ts` covers nav, titles, back links and the home page sections.
  - `integrity.spec.ts` checks that internal links and assets resolve, in-page anchors exist, pages produce no script errors or same-origin 4xx/5xx responses, and new-tab links use `rel="noopener"`.
  - `strategy.spec.ts` covers every interactive tool, the print layout and the neutral-content guard.
  - `ale.spec.ts` is a legacy click-through from the home page's contact section.
- Every E2E spec aborts `fonts.googleapis.com` / `fonts.gstatic.com` requests in `beforeEach`; this avoids ~40 s timeouts offline. Copy that block into any new spec.
- **There are no screenshot tests, on purpose.** The old visual-regression suite was removed: its baselines only matched CI's exact Chromium build, and every push accepted new baselines automatically. Don't reintroduce `toHaveScreenshot` without asking.
- `npm audit signatures` fetches Sigstore metadata from `tuf-repo-cdn.sigstore.dev`. In sandboxes that block that host it fails with "Failed to download"; that's the network, not the packages.
- Don't put `[skip ci]` in commit messages: it skips every gate.

## Site architecture

- **No shared templates.** Each page carries its own `<head>`, `<nav>` and `<footer>`, so changing any of them means editing every HTML file.
- **Inner pages** (`reference/`, `support/`, `people/`) load `assets/css/design.css` (tokens plus every shared component) and share one skeleton:
  - `<title>Name | Alejandro Sanchez-Giraldo</title>`.
  - The 7-link nav (Home, Work Experience, Publications, Conferences, Learning, Apps, Support), with `class="active"` on the current section. Sub-pages mark their parent: AWS summary → Conferences, Fake Numbers → Support, the strategy page → Publications.
  - A `.page-hero` with a `// NN — Section` tag (01–06 for the top-level sections) and an `h1` whose accent half is wrapped in `<span>`.
  - `main.page-content`, starting with a `.back-link`: top-level pages link to `/`, sub-pages to their parent.
  - The shared footer.
- **`index.html` is standalone.** It does not load `design.css`. Its inline `<style>` duplicates the tokens, nav, footer and buttons, and its nav uses in-page anchors. Make colour, nav and footer changes in both places.
- **Dead files:** no page loads `assets/css/style.css` (the pre-redesign theme) or `assets/js/main.js` (a burger menu for markup that no longer exists). Below 768px the nav links are simply hidden. There is no mobile menu; on phones the navigation tests only check the logo.
- **Links:**
  - Internal links are root-relative (`/assets/...`, `/reference/...`). Serve from the repo root; opening files via `file://` breaks them.
  - Absolute links to `https://ale-sanchez-g.github.io/...` (e.g. `/card/` and `/releaseMaturity/` on the Apps page) can point at other repos' project sites, which share the domain, not at files here.
  - GitHub Pages is case-sensitive: keep file names lowercase and reference them with the exact case. Commit `3c55a25` fixed a hero image that broke because the file was `img/AJ-low.jpg` but the page requested `/img/aj-low.jpg`.
- **Jekyll does almost nothing.**
  - No page has front matter or `{% seo %}`, so `jekyll-seo-tag` is inert. Meta and Open Graph tags must be written by hand; only the strategy and AI harness pages have them.
  - `jekyll-sitemap` lists the static `.html` and `.pdf` files.
  - GitHub Pages' default plugins also publish Markdown files that have no front matter as pages (README, LICENSE and a few others excepted). That is why `_config.yml` excludes `CLAUDE.md`. Exclude any new repo-only `.md` file the same way.

### Adding, renaming or removing a page

1. Start from an inner page's skeleton. Tests assert that every page has a visible `h1`, the `nav` with `.nav-logo`, and a footer link to `slo-education`.
2. Add the page to `tests/e2e/pages.ts`. The navigation and integrity suites then cover it.
3. Update the site structure in the README.
4. A new top-level section also needs three more changes:
   - the nav link on every inner page;
   - an entry in the `navPages` list in `tests/e2e/navigation.spec.ts`;
   - usually a `#contact` link in `index.html` (the "Contact section links to all reference pages" test checks these).

## The AI-native QA strategy page

The page is `reference/ai-native-qa-strategy.html`. Its styles are in `assets/css/strategy.css` (`st-` classes, plus extra tokens such as `--danger`). It loads two scripts, in this order:
- `assets/js/strategy-model.js`: the pure models and constants. It is UMD: `window.StrategyModel` in the browser, `require()` in Node.
- `assets/js/strategy.js`: one IIFE holding the DOM tools. It logs a console error and stops if the model script is missing.

It and the AI harness page are the only pages with JavaScript.

- **Progressive enhancement.** All content is static HTML that reads fine without JS; the `<noscript>` note says so. An inline script adds `html.js`, and each tool initialises only if its root element (e.g. `#cheese-lab`) exists. Build DOM with the `h()` / `sv()` helpers, which set `textContent`. There is no `innerHTML`; keep it that way.
- **Keep DOM-free code in `strategy-model.js`**, so it stays unit-testable. Anything that touches `document` or `window` belongs in `strategy.js`.
- **The HTML is the data source for several tools, so edit markup and JS together:**
  - `#env-table` rows (`data-short`, `data-t1`…`data-t3` = `visit|optional|skip`) drive the promotion path and the risk lab's environment strip.
  - `#layer-table` rows map **by index** to `LAYERS` (7 rows, same order). `#automate-table` rows map by `data-level` to the pyramid levels.
  - `#maturity-table` must keep exactly 5 rows (Level, Name, 4 dimensions). Otherwise the self-assessment silently doesn't start.
  - `.st-step` elements carry `data-d1..3` (depth 1–3) and `data-t1..3` (per-tier text). `SCENARIOS[].principles` refers to the `.st-principle` `data-p` numbers.
  - Capability checkbox `value`s and questionnaire field `name`s are the keys of visitors' saved answers. Everything is stored under one localStorage key, `ai-native-qa-strategy`, which holds `capabilities`, `maturity`, `maturityTier` and `workbook`. Renaming them silently drops those answers.
  - "Copy levels into the questionnaire" targets the `b-<stage>-level` names. The Markdown export is built from the questionnaire's markup (`.st-part-title`, `.st-q-id`, `data-stage`).
- **Model constants live in `strategy-model.js`; their explanations live in the HTML prose; unit tests pin both.** A deliberate change touches all three. The pairs:
  - `leadTimeModel` / `BASE_CFR` ↔ the speed lab's "How this model works";
  - `PYR_LEVELS` / `RUNNERS` ↔ "Model assumptions";
  - `DEFECTS` ↔ the Swiss cheese lab's "How this model works".
- **Shared state:** `tierBus` keeps one risk tier in sync across `#env-lab` and `#risk-lab`.
- **Boot isolation:** each `init*` runs inside `try/catch` and calls `console.error` instead of throwing, so one broken tool can't stop the others.
  - `integrity.spec.ts` fails on same-origin console errors.
  - The "starts every interactive tool without script errors" test also checks rendered output (stat tiles, the cheese SVG, environment nodes, maturity rows).
  - Give any new tool a similar rendering assertion.
- **Deterministic first render:** decorative randomness uses the seeded `mulberry32`. `Math.random()` is only used for user-triggered actions (firing defects).
- **Neutral-content guard:** a test fails if the `<main>` text, `strategy.js` or `strategy-model.js` mentions any of: trading, client data, regulated report, order flow, checkout, market (whole word), copilot, terraform, helm, aviation, healthcare, 2026, 2027, phase 1 review. Keep examples neutral about industry and vendor, and keep timings relative ("Months 1 to 3"). The publication date lives in the hero, outside `<main>`.
- **Hard-coded counts that must change together:**
  - "11 chapters · 11 interactive tools" in the hero, the 11 chapter-bar links (each must match a `section#id`), and the test's `.st-lab` count;
  - "0 of 61 answered" in the HTML and "1 of 61 answered" in the test (Parts A–F; the Part G commitments are not counted);
  - "Seven principles", "Twelve capabilities", "Ten real-world practices" (`SCENARIOS.length`);
  - "all seven" environments (also hard-coded in `describePath`), the 7 cheese layers and the 8 verification steps.
- **Print and PDF.**
  - `@media print` in `strategy.css` hides interactive parts by ID and restyles the page for A4. `initPrint` opens every `<details>` on `beforeprint`.
  - Any new tool must be added to the print hide-list or given a static print form. The "printing expands every chapter" test covers this.
  - `assets/docs/ai-native-qa-strategy.pdf` (28 A4 pages) is a committed file. Regenerate it whenever the page's content or print CSS changes.
  - `page.pdf()` fires `beforeprint` itself. Run this from the repo root while `npm run serve` is running; it needs access to Google Fonts, because the PDF embeds Inter and Space Mono:

    ```bash
    node -e "const {chromium}=require('@playwright/test');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8765/reference/ai-native-qa-strategy.html',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.pdf({path:'assets/docs/ai-native-qa-strategy.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});await b.close();})()"
    ```

## The AI harness page

The page is `reference/ai-quality-architecture.html`, an interactive video on the layers of a company AI. Its styles are in `assets/css/harness.css` (`hx-` classes) and its behaviour in `assets/js/harness.js` (one IIFE). `tests/e2e/harness.spec.ts` covers it.

- **The transcript is the script.** Each `#hx-script` line (`p[data-seg]`) is both a caption and a narrated line, and `harness.js` builds the timeline from them. The on-screen chat (each question, answer and break) is the `STORY` table in `harness.js`, keyed by the transcript's `data-scene`. Edit the two together.
- **Voice-over.** Each line has a recording, `assets/audio/harness/<scene>-<line>.mp3`, and its length in `data-ms`, which times the video. After editing a narrated line, run `tools/voiceover.py` (setup is in its header) to record it again and refresh `data-ms`. A line without `data-ms` falls back to a reading-pace duration and plays no audio. `_config.yml` keeps `tools/` out of the published site.
- **Credit.** The floors-and-breaks framing is adapted from a post by @pragmaticcoder.ai on Instagram. Keep the credits in the hero and on the video's end screen.

## Content and style conventions

- The site states the owner's career facts: roles, dates, years of experience, certifications and talks. Never invent or "update" them; ask.
- Copy is in British/Australian English (organisation, optimise, behaviour, licence, colour).
- External links use `target="_blank" rel="noopener"` (enforced by `integrity.spec.ts`).
- Text must meet WCAG AA contrast (4.5:1) on the near-black background. `--muted` was raised from `#555` to `#888` for this reason (commit `54d1c5a`), so don't use `#555` or darker for text.
- CSS is grouped under `/* ── SECTION ── */` banners, with several declarations per line. Reuse the `:root` tokens (`--bg`, `--fg`, `--muted`, `--accent`, `--border`, `--card`, `--mono`, `--sans`) instead of adding new colour literals.
- The `© 2026` footer year is hard-coded in every page.
- Recent commits use Conventional Commit prefixes (`fix(a11y):`, `docs:`, `test:`).
