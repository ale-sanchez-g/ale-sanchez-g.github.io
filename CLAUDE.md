# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Alejandro Sanchez-Giraldo's personal site, published by GitHub Pages from `main` at the domain root (`https://ale-sanchez-g.github.io/`). Every page is hand-written static HTML with plain CSS and vanilla JS. There is no build step, templating, framework, bundler, linter or formatter. Node exists only to run the Playwright tests, and Python only to serve files locally.

## Commands

```bash
npm ci                                  # Playwright 1.56.1, pinned by package-lock.json
npx playwright install chromium         # the Chromium build that version expects
npm run serve                           # http://localhost:8765 (python3 -m http.server, run from the repo root)
npm test                                # every spec; Playwright starts the :8765 server, or reuses whatever already listens there
npm run test:strategy                   # functional tests for the strategy page's interactive tools
npm run test:visual                     # full-page screenshots + navigation/home-page checks
npx playwright test --grep-invert "Visual regression"                                  # every functional test, no screenshots
npx playwright test tests/strategy.spec.ts -g "speed paradox" --project="Desktop Chrome"  # a single test
```

Every test runs in two projects, `Desktop Chrome` (1280×900) and `Mobile Chrome` (Pixel 5), with one worker and no retries.

## Tests and CI: what to trust

- **Screenshot baselines are only valid in CI** (ubuntu-latest with the pinned Chromium). Rendering depends on the Chromium build and installed fonts. On an untouched checkout in a non-CI container (newer Chromium, different fonts), 13 of the 22 screenshot tests failed. Never commit PNGs from `npm run test:update` run outside CI. Locally, rely on the functional suite (`--grep-invert "Visual regression"`).
- `.github/workflows/visual-tests.yml`:
  - **Push to any branch:** regenerates changed baselines (`--update-snapshots`, preset `changed`) and pushes `chore: update visual test baselines [skip ci]` back to the same branch. After pushing, expect that commit whenever a baseline changed, and pull/rebase before your next push.
  - **PR to `main`:** compares against the committed baselines, comments a summary on the PR and fails the job on a diff (diff images are in the `visual-screenshots` artifact). Pushes accept new baselines automatically, so this PR comparison is the only place a visual regression is reported. Check it before merging.
  - `tests/strategy.spec.ts` runs on every push and PR. `tests/ale.spec.ts` (a legacy click-through smoke test) runs only via `npm test`.
  - Don't put `[skip ci]` in your own commit messages: it skips the whole workflow, functional tests included.
- Every spec aborts `fonts.googleapis.com` / `fonts.gstatic.com` requests in `beforeEach`. This avoids ~40 s timeouts offline, so screenshots use fallback fonts. Copy that block into any new spec.
- Snapshots are named `tests/snapshots/{projectName}-{testName}-{arg}{ext}`. Titles contain an em dash `—`, so quote the paths. Renaming a page's `title` in `tests/visual.spec.ts` leaves the old PNGs behind; delete them.

## Site architecture

- **No shared templates.** Each page carries its own `<head>`, `<nav>` and `<footer>`, so changing any of them means editing every HTML file.
- **Inner pages** (`reference/`, `support/`, `people/`) load `assets/css/design.css` (tokens plus every shared component) and share one skeleton:
  - `<title>Name | Alejandro Sanchez-Giraldo</title>`.
  - The 7-link nav (Home, Work Experience, Publications, Conferences, Learning, Apps, Support), with `class="active"` on the current section. Sub-pages mark their parent: AWS summary → Conferences, Fake Numbers → Support, the strategy page → Publications.
  - A `.page-hero` with a `// NN — Section` tag (01–06 for the top-level sections) and an `h1` whose accent half is wrapped in `<span>`.
  - `main.page-content`, starting with a `.back-link`: top-level pages link to `/`, sub-pages to their parent.
  - The shared footer.
- **`index.html` is standalone.** It does not load `design.css`. Its inline `<style>` duplicates the tokens, nav, footer and buttons, and its nav uses in-page anchors. Make colour, nav and footer changes in both places.
- **Dead files:** no page loads `assets/css/style.css` (the pre-redesign theme) or `assets/js/main.js` (a burger menu for markup that no longer exists; the README calls it the mobile menu toggle). Below 768px the nav links are simply hidden. There is no mobile menu; on phones the navigation tests only check the logo.
- **Links are root-relative** (`/assets/...`, `/reference/...`). Serve from the repo root; opening files via `file://` breaks them. GitHub Pages is case-sensitive: keep file names lowercase and reference them with the exact case. Commit `3c55a25` fixed a hero image that broke because the file was `img/AJ-low.jpg` but the page requested `/img/aj-low.jpg`.
- **Jekyll does almost nothing.** No page has front matter or `{% seo %}`, so `jekyll-seo-tag` is inert. Meta and Open Graph tags must be written by hand; only the strategy page has them. `jekyll-sitemap` lists the static `.html` and `.pdf` files. GitHub Pages' default plugins also publish Markdown files that have no front matter as pages (README, LICENSE and a few others excepted). That is why `_config.yml` excludes `CLAUDE.md`. Exclude any new repo-only `.md` file the same way.

### Adding, renaming or removing a page

1. Start from an inner page's skeleton. Tests assert that every page has a visible `h1`, the `nav` with `.nav-logo`, and a footer link to `slo-education`.
2. Add the page to the `pages` array in `tests/visual.spec.ts`, which drives both the screenshot and navigation tests. CI generates its baselines on push.
3. Update the hand-maintained page lists in the PR-comment script in `.github/workflows/visual-tests.yml` and in the README.
4. A new top-level section also needs three more changes:
   - the nav link on every inner page;
   - an entry in the `navPages` list in `tests/visual.spec.ts`;
   - usually a `#contact` link in `index.html` (the "Contact section links to all reference pages" test checks these).

## The AI-native QA strategy page

The page is `reference/ai-native-qa-strategy.html`. Its styles are in `assets/css/strategy.css` (`st-` classes, plus extra tokens such as `--danger`) and its scripts in `assets/js/strategy.js` (one IIFE, no dependencies). It is the only page with JavaScript.

- **Progressive enhancement.** All content is static HTML that reads fine without JS; the `<noscript>` note says so. An inline script adds `html.js`, and each tool initialises only if its root element (e.g. `#cheese-lab`) exists. Build DOM with the `h()` / `sv()` helpers, which set `textContent`. There is no `innerHTML`; keep it that way.
- **The HTML is the data source for several tools, so edit markup and JS together:**
  - `#env-table` rows (`data-short`, `data-t1`…`data-t3` = `visit|optional|skip`) drive the promotion path and the risk lab's environment strip.
  - `#layer-table` rows map **by index** to `LAYERS` (7 rows, same order). `#automate-table` rows map by `data-level` to the pyramid levels.
  - `#maturity-table` must keep exactly 5 rows (Level, Name, 4 dimensions). Otherwise the self-assessment silently doesn't start.
  - `.st-step` elements carry `data-d1..3` (depth 1–3) and `data-t1..3` (per-tier text). `SCENARIOS[].principles` refers to the `.st-principle` `data-p` numbers.
  - Capability checkbox `value`s and questionnaire field `name`s are the keys of visitors' saved answers. Everything is stored under one localStorage key, `ai-native-qa-strategy`, which holds `capabilities`, `maturity`, `maturityTier` and `workbook`. Renaming them silently drops those answers.
  - "Copy levels into the questionnaire" targets the `b-<stage>-level` names. The Markdown export is built from the questionnaire's markup (`.st-part-title`, `.st-q-id`, `data-stage`).
- **Model constants live in JS; their explanations live in the HTML prose.** Pairs that must change together:
  - `leadTimeModel` / `BASE_CFR` ↔ the speed lab's "How this model works";
  - `PYR_LEVELS` / `RUNNERS` ↔ "Model assumptions";
  - `DEFECTS` ↔ the Swiss cheese lab's "How this model works".
- **Shared state:** `tierBus` keeps one risk tier in sync across `#env-lab` and `#risk-lab`.
- **Boot isolation:** each `init*` runs inside `try/catch` and only calls `console.error`, so a broken tool never raises a page error. The "starts every interactive tool without script errors" test therefore also checks rendered output (stat tiles, the cheese SVG, environment nodes, maturity rows). Give any new tool a similar rendering assertion.
- **Deterministic first render:** decorative randomness uses the seeded `mulberry32`. `Math.random()` is only used for user-triggered actions (firing defects). Keep the initial state deterministic, or the screenshots flake.
- **Neutral-content guard:** a test fails if the `<main>` text or `strategy.js` mentions any of: trading, client data, regulated report, order flow, checkout, market (whole word), copilot, terraform, helm, aviation, healthcare, 2026, 2027, phase 1 review. Keep examples neutral about industry and vendor, and keep timings relative ("Months 1 to 3"). The publication date lives in the hero, outside `<main>`.
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

## Content and style conventions

- The site states the owner's career facts: roles, dates, years of experience, certifications and talks. Never invent or "update" them; ask.
- Copy is in British/Australian English (organisation, optimise, behaviour, licence, colour).
- External links use `target="_blank" rel="noopener"`.
- Text must meet WCAG AA contrast (4.5:1) on the near-black background. `--muted` was raised from `#555` to `#888` for this reason (commit `54d1c5a`), so don't use `#555` or darker for text.
- CSS is grouped under `/* ── SECTION ── */` banners, with several declarations per line. Reuse the `:root` tokens (`--bg`, `--fg`, `--muted`, `--accent`, `--border`, `--card`, `--mono`, `--sans`) instead of adding new colour literals.
- The `© 2026` footer year is hard-coded in every page.
- Recent commits use Conventional Commit prefixes (`fix(a11y):`, `docs:`, `test:`).
