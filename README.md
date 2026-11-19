# ale-sanchez-g.github.io

Personal portfolio website for Alejandro Sanchez-Giraldo — Product Owner for Quality with 15+ years of engineering experience across Telecommunications, Airlines, Media, Loyalty, Insurance, Financial Services, and AgriTech.

## Tech Stack

- **Frontend:** Static HTML, CSS, vanilla JavaScript
- **Hosting:** GitHub Pages
- **SEO/Sitemap:** Jekyll (`jekyll-seo-tag`, `jekyll-sitemap`)
- **Testing:** Node's built-in test runner (unit) and Playwright (E2E, desktop + mobile)
- **CI/CD:** GitHub Actions quality gates — unit, E2E and security

## Site Structure

```
/
├── index.html                  # Home page (personal statement, badges, achievements)
├── reference/
│   ├── work-experience.html    # Career history
│   ├── publications.html       # Written publications
│   ├── conferences.html        # Conference talks and appearances
│   ├── learning.html           # Learning resources and certifications
│   ├── apps.html               # Projects and tools
│   ├── ai-native-qa-strategy.html  # Open-source, interactive AI-native QA strategy
│   ├── ai-quality-architecture.html  # The AI Harness: interactive video on the QE architecture of company AI
│   └── sums/                   # Event summaries (e.g. AWS Observability Day)
├── support/
│   ├── support-list.html       # Support materials index
│   └── fake-numbers.html       # Fake phone number utility
├── people/
│   └── connections.html        # Professional connections
├── assets/
│   ├── css/design.css          # Design system used by every page
│   ├── css/style.css           # Legacy styles (unused by current pages)
│   ├── css/strategy.css        # Components for the strategy page
│   ├── css/harness.css         # Video player and tools for the AI Harness page
│   ├── js/main.js              # Legacy mobile menu toggle (unused by current pages)
│   ├── js/strategy-model.js    # Models behind the strategy page's tools (unit tested)
│   ├── js/strategy.js          # Interactive tools on the strategy page
│   ├── js/harness.js           # Video player engine and "Pull a floor" tool
│   └── docs/                   # Strategy PDF, generated from the page's print layout
└── img/                        # Images and badge icons
```

## Local Development

Requires Python 3 (for the dev server) and Node.js 22+.

```bash
# Install test dependencies and the Chromium build Playwright expects
npm ci
npx playwright install chromium

# Start the local server on http://localhost:8765
npm run serve
```

Open `http://localhost:8765` in your browser.

## Testing

```bash
# Unit and E2E tests
npm test

# Unit tests only: the models behind the strategy page's tools (Node's built-in runner, no browser)
npm run test:unit

# E2E tests only: every page in Desktop Chrome (1280×900) and Mobile Chrome (Pixel 5)
npm run test:e2e

# E2E tests for the strategy page's interactive tools
npm run test:strategy

# Dependency checks: known vulnerabilities, registry signatures and provenance
npm run security

# E2E tests for the AI Harness video player and "Pull a floor" tool
npm run test:harness
```

| Suite | Location | What it guards |
|-------|----------|----------------|
| Unit | `tests/unit/` | The lead-time, Swiss cheese, test pyramid and promotion-path models in `assets/js/strategy-model.js`, including the numbers the page explains in "How this model works" and "Model assumptions" |
| E2E | `tests/e2e/` | Navigation, titles and back links on every page; home page sections; every internal link and asset resolves; no script errors; new-tab links use `rel="noopener"`; every interactive tool on the strategy page; the print layout |

The page list both E2E suites run against lives in `tests/e2e/pages.ts`.

The downloadable strategy PDF is produced from the page's print layout, which expands every chapter and hides the interactive controls. Regenerate it whenever the page's content or print styles change, from the browser (Print → Save as PDF, A4) or headlessly with Playwright's `page.pdf()`.

## CI/CD — GitHub Actions quality gates

`.github/workflows/quality-gates.yml` runs on every push, on pull requests to `main`, weekly (so newly published advisories are caught without a code change) and on demand. Every job runs with a read-only token.

| Gate | Job | Fails when |
|------|-----|------------|
| Unit tests | `Unit tests` | A model no longer produces the documented numbers |
| E2E tests | `E2E tests` | Any page, link, asset or interactive tool is broken in Desktop or Mobile Chrome; on failure the Playwright report is uploaded as an artifact |
| Security | `Security: dependency audit` | A dependency has a known high or critical vulnerability, or fails registry signature or provenance checks |
| Security | `Security: dependency review` | A pull request adds a dependency with a high or critical vulnerability |
| Security | `Security: CodeQL` | Static analysis finds a security issue in the site's JavaScript or the tests (results appear under Security → Code scanning) |

Dependabot (`.github/dependabot.yml`) opens weekly, grouped update PRs for npm packages and GitHub Actions.

A failing workflow only blocks merging once the gates are marked as required: Settings → Rules (or Branches) → protect `main` → require status checks → select the jobs above.

## The AI Harness page

`reference/ai-quality-architecture.html` explains the layers of a company AI harness as an interactive video: one continuous conversation with an HR assistant, told floor by floor (model, system prompt, RAG, MCP tools, RBAC + OAuth, guardrails, cache + routing, observability + evals). Each floor lands, the question that broke the AI last time is asked again and now works, then a new question breaks it, which is why the next floor exists. It closes with the quality engineering lens.

- **The script lives in the page.** The transcript (`#hx-script`) holds every narrated line; `assets/js/harness.js` reads it, builds the timeline and animates the stage in step with it. Edit the words in the HTML and the captions, chapters and timings follow. The on-screen chat (each question, answer and break) is the `STORY` table in `harness.js`.
- **Player:** click-to-play (no autoplay), play/pause, chapters, scrub bar, captions, optional narration through the browser's own text-to-speech, full screen, and keyboard shortcuts (Space, ←/→, C, M, F). Every frame is a pure function of the playhead, so seeking always lands on the right picture.
- **Layouts:** a 16:9 stage on wide screens and a 9:16 vertical layout on phones, scaled with container query units.
- **Without JavaScript** the stage shows the finished building and the transcript reads as an article.

- **Credit:** the floors-and-breaks framing is adapted from a post by [@pragmaticcoder.ai](https://www.instagram.com/pragmaticcoder.ai/) on Instagram; the page credits it in the header and on the video's end screen.

Its behaviour is covered by `tests/e2e/harness.spec.ts`.

## Jekyll Configuration

`_config.yml` is minimal — it sets the site title and description used by the SEO and sitemap plugins:

```yaml
title: Engineering quality with your team
description: automation, performance, observability, and more
plugins:
  - jekyll-seo-tag
  - jekyll-sitemap
```

GitHub Pages builds the site automatically on every push to `main`.
