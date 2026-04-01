# ale-sanchez-g.github.io

Personal portfolio website for Alejandro Sanchez-Giraldo — Product Owner for Quality with 15+ years of engineering experience across Telecommunications, Airlines, Media, Loyalty, Insurance, Financial Services, and AgriTech.

## Tech Stack

- **Frontend:** Static HTML, CSS, vanilla JavaScript
- **Hosting:** GitHub Pages
- **SEO/Sitemap:** Jekyll (`jekyll-seo-tag`, `jekyll-sitemap`)
- **Testing:** Playwright (visual regression, desktop + mobile)
- **CI/CD:** GitHub Actions

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
│   └── sums/                   # Event summaries (e.g. AWS Observability Day)
├── support/
│   ├── support-list.html       # Support materials index
│   └── fake-numbers.html       # Fake phone number utility
├── people/
│   └── connections.html        # Professional connections
├── assets/
│   ├── css/style.css           # Global styles
│   └── js/main.js              # Mobile menu toggle
└── img/                        # Images and badge icons
```

## Local Development

Requires Python 3 (for the dev server) and Node.js 20+.

```bash
# Install test dependencies
npm install

# Start the local server on http://localhost:8765
npm run serve
```

Open `http://localhost:8765` in your browser.

## Testing

Visual regression tests run against both Desktop Chrome (1280×900) and Mobile Chrome (Pixel 5 viewport) using Playwright.

```bash
# Run all Playwright tests
npm test

# Run visual regression tests only
npm run test:visual

# Update baseline snapshots (after intentional UI changes)
npm run test:update
```

Snapshots are stored in `tests/snapshots/` and committed to the repository. A 2% pixel-diff tolerance is applied to account for minor rendering differences.

## CI/CD — GitHub Actions

The `visual-tests.yml` workflow runs on every push and on pull requests targeting `main`.

| Trigger | Behaviour |
|---------|-----------|
| Push to any branch | Generates/updates baseline snapshots and commits them back to the branch |
| Pull request to `main` | Compares against existing baselines and posts a summary comment on the PR |
| Manual dispatch | Optionally regenerates all baselines via `update_snapshots` input |

Pages covered by visual tests:

- Home
- Work Experience
- Publications
- Conferences
- Learning Resources
- Apps
- AWS Observability Day summary
- Support Materials
- Fake Phone Numbers
- Connections

Artifacts (HTML report + screenshots) are retained for 30 days. If a visual regression is detected the workflow fails and diff images are available under `test-results/` in the uploaded artifact.

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
