import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';

// Functional checks for the interactive tools on the AI-Native QA Strategy page.
const PATH = '/reference/ai-native-qa-strategy.html';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

const statValue = async (page: Page, root: string, index: number) =>
  parseFloat((await page.locator(`${root} .st-stat-value`).nth(index).textContent()) ?? '');

test.describe('AI-Native QA Strategy — page', () => {
  test('starts every interactive tool without script errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(PATH);
    await expect(page.locator('.st-lab')).toHaveCount(11);
    await expect(page.locator('#speed-stats .st-stat')).toHaveCount(3);
    await expect(page.locator('#cheese-stage svg')).toBeVisible();
    await expect(page.locator('#env-path .st-env-node')).toHaveCount(7);
    await expect(page.locator('#mat-rows .st-mat-row')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('stays free of company, product, industry and dated-rollout references', async ({ page }) => {
    await page.goto(PATH);
    const pageText = await page.locator('main').evaluate(main => main.textContent ?? '');
    const scriptText = readFileSync('assets/js/strategy.js', 'utf8');
    const banned = [/trading/i, /client data/i, /regulated report/i, /order flow/i, /checkout/i, /\bmarket\b/i,
      /copilot/i, /terraform/i, /\bhelm\b/i, /aviation/i, /healthcare/i, /\b20(26|27)\b/, /phase 1 review/i];
    for (const term of banned) {
      expect(pageText, `page text mentions ${term}`).not.toMatch(term);
      expect(scriptText, `strategy.js mentions ${term}`).not.toMatch(term);
    }
  });

  test('printing expands every chapter and hides the interactive controls', async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('#panel-waits')).toBeVisible();
    await expect(page.locator('#env-table')).toBeVisible();
    await expect(page.locator('#maturity-table')).toBeVisible();
    await expect(page.locator('#wb-c1')).toBeVisible();
    await expect(page.locator('#speed-lab')).toBeHidden();
    await expect(page.locator('.st-chapters')).toBeHidden();
    await expect(page.locator('#risk-lab .st-examples')).toBeHidden();
  });

  test('every chapter link points at a section on the page', async ({ page }) => {
    await page.goto(PATH);
    const hrefs = await page.locator('#st-chapters a').evaluateAll(links => links.map(a => a.getAttribute('href')));
    expect(hrefs).toHaveLength(11);
    for (const href of hrefs) {
      await expect(page.locator(`section${href}`)).toHaveCount(1);
    }
  });
});

test.describe('AI-Native QA Strategy — speed paradox', () => {
  test('a faster Build alone barely moves lead time; reinvesting in quality does', async ({ page }) => {
    await page.goto(PATH);
    expect(await statValue(page, '#speed-stats', 0)).toBeCloseTo(33.3, 1);
    expect(await statValue(page, '#speed-stats', 1)).toBe(27);

    for (const invest of ['specify', 'verify', 'flow']) {
      await page.locator(`#speed-lab [data-invest="${invest}"]`).click();
    }
    await expect(page.locator('#speed-lab [data-invest][aria-pressed="true"]')).toHaveCount(3);
    await expect.poll(() => statValue(page, '#speed-stats', 0)).toBeCloseTo(10.8, 1);
    await expect.poll(() => statValue(page, '#speed-stats', 1)).toBe(8);
    await expect(page.locator('#speed-verdict')).toContainText('turned agent speed into delivery speed');
  });

  test('at 1× with no reinvestment the lab shows the baseline', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#speed-range').fill('1');
    await expect(page.locator('#speed-out')).toHaveText('1×');
    await expect(page.locator('#speed-verdict')).toContainText('baseline');
  });
});

test.describe('AI-Native QA Strategy — ship it or stop?', () => {
  test('a correct answer is scored and highlights the principles at stake', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('#game-count')).toHaveText('Scenario 1 of 10');
    await page.locator('#ship-game [data-answer="stop"]').click();
    await expect(page.locator('#game-result .st-result-title')).toContainText('Correct');
    await expect(page.locator('#game-score')).toHaveText('Score 1 / 1');
    await expect(page.locator('.st-principle.is-at-stake')).toHaveCount(3);

    await page.locator('#game-result button').click();
    await expect(page.locator('#game-count')).toHaveText('Scenario 2 of 10');
    await expect(page.locator('.st-principle.is-at-stake')).toHaveCount(0);
  });

  test('a wrong answer is marked and explained', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#ship-game [data-answer="ship"]').click();
    await expect(page.locator('#game-result .st-result-title')).toContainText('Not quite');
    await expect(page.locator('#game-score')).toHaveText('Score 0 / 1');
    await expect(page.locator('#game-result')).toContainText('Do instead');
  });
});

test.describe('AI-Native QA Strategy — lifecycle, capabilities and environments', () => {
  test('lifecycle tabs switch panels by click and keyboard', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('#panel-plan')).toBeVisible();
    await expect(page.locator('#panel-build')).toBeHidden();
    await page.locator('#tab-build').click();
    await expect(page.locator('#panel-build')).toBeVisible();
    await expect(page.locator('#panel-plan')).toBeHidden();
    await page.locator('#tab-build').press('ArrowRight');
    await expect(page.locator('#tab-test')).toBeFocused();
    await expect(page.locator('#panel-test')).toBeVisible();
  });

  test('capability check counts ticks per pillar and remembers them', async ({ page }) => {
    await page.goto(PATH);
    const verify = page.locator('.st-pillar[data-pillar="Verify"]');
    await verify.getByText('Independent test agents').click();
    await expect(verify.locator('.st-meter-count')).toHaveText('1/4');
    await expect(page.locator('#cap-verdict')).toContainText('Biggest gap');
    await page.reload();
    await expect(verify.locator('input[value="independent-test-agents"]')).toBeChecked();
  });

  test('the risk tier drives which environments a change visits', async ({ page }) => {
    await page.goto(PATH);
    const visits = page.locator('#env-path .st-env-node.is-visit');
    await expect(visits).toHaveCount(3);
    await page.locator('#env-lab [data-tier="2"]').click();
    await expect(visits).toHaveCount(5);
    await expect(page.locator('#env-summary')).toContainText('Integration → Staging → Production');
    await page.locator('#env-lab [data-tier="3"]').click();
    await expect(visits).toHaveCount(7);
    await expect(page.locator('#env-summary')).toContainText('all seven');
    await page.locator('#env-path .st-env-node').nth(3).click();
    await expect(page.locator('#env-detail h4')).toContainText('Performance and resilience');
  });
});

test.describe('AI-Native QA Strategy — Swiss cheese simulator', () => {
  test('switching every slice off lets every defect escape', async ({ page }) => {
    await page.goto(PATH);
    const toggles = page.locator('#cheese-toggles button');
    await expect(toggles).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      await toggles.nth(i).click();
    }
    await expect(page.locator('#cheese-bars .st-hbar.is-escape .st-hbar-val')).toHaveText('100.0');
    await page.locator('#cheese-fire').click();
    await expect(page.locator('#cheese-narrative')).toContainText('reached customers');
  });

  test("tests written by the code's own agent raise the expected escapes", async ({ page }) => {
    await page.goto(PATH);
    expect(await statValue(page, '#cheese-stats', 3)).toBeCloseTo(7.3, 1);
    await page.locator('#cheese-indep').click();
    await expect(page.locator('#cheese-indep')).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => statValue(page, '#cheese-stats', 3)).toBeCloseTo(11.0, 1);
  });

  test('selecting a slice shows what it catches and misses', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#cheese-stage .st-slice').nth(2).click();
    await expect(page.locator('#cheese-detail h4')).toContainText('Unit tests');
    await expect(page.locator('#cheese-detail')).toContainText("tests that mirror the code's own bugs");
  });
});

test.describe('AI-Native QA Strategy — pyramid, risk tiers and gates', () => {
  test('presets classify the suite shape', async ({ page }) => {
    await page.goto(PATH);
    const shape = page.locator('#pyr-stats .st-stat-value').first();
    await expect(shape).toHaveText('Ice-cream cone');
    await page.locator('#pyr-presets [data-preset="pyramid"]').click();
    await expect(shape).toHaveText('Pyramid');
    await expect(page.locator('#pyr-stats')).toContainText('Under the 15-minute target');
    await page.locator('#pyr-shape [data-level="unit"]').click();
    await expect(page.locator('#pyr-detail')).toContainText('Mutation score, not line coverage');
  });

  test('routing a pricing change selects Tier 3 across the page', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#risk-lab .st-example', { hasText: 'Pricing calculation' }).click();
    await expect(page.locator('#risk-lab .st-tier[data-tier="3"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#risk-steps .st-step').nth(4).locator('.st-depth-label')).toHaveText('Deep');
    await expect(page.locator('#risk-steps .st-step').nth(6)).toContainText('named service owner');
    await expect(page.locator('#env-path .st-env-node.is-visit')).toHaveCount(7);
  });

  test('every verification step applies at every tier; only its depth changes', async ({ page }) => {
    await page.goto(PATH);
    for (const tier of ['1', '2', '3']) {
      await page.locator(`#risk-lab .st-tier[data-tier="${tier}"]`).click();
      const steps = page.locator('#risk-steps .st-step');
      await expect(steps).toHaveCount(8);
      for (let i = 0; i < 8; i++) {
        await expect(steps.nth(i).locator('.st-step-tier')).not.toBeEmpty();
        await expect(steps.nth(i).locator('.st-depth-label')).toHaveText(/Light|Standard|Deep/);
      }
    }
  });

  test('the gate only opens when lead time falls without failure rate rising', async ({ page }) => {
    await page.goto(PATH);
    const badge = page.locator('#gate-result .st-gate-badge');
    await expect(badge).toHaveText('NO-GO');
    await expect(page.locator('#gate-result')).toContainText('moved cost downstream');
    await page.locator('[data-gate="cfr"] [data-trend="flat"]').click();
    await expect(badge).toHaveText('GO');
    await page.locator('[data-gate="lt"] [data-trend="rising"]').click();
    await expect(badge).toHaveText('NO-GO');
  });
});

test.describe('AI-Native QA Strategy — maturity and questionnaire', () => {
  test('the self-assessment enforces the Tier 3 ceiling', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('#mat-verdict')).toContainText('Profile L2 · L2 · L2 · L2');
    await page.locator('#mat-tier').selectOption('3');
    await page.locator('#mat-rows .st-mat-row').nth(1).getByRole('button', { name: /level 5/ }).click();
    await expect(page.locator('#mat-verdict')).toContainText('never go above Level 4');
  });

  test('maturity levels can be copied into the questionnaire', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#mat-rows .st-mat-row').nth(2).getByRole('button', { name: /level 3/ }).click();
    await page.locator('#mat-to-workbook').click();
    await expect(page.locator('.st-part[data-part="B"]')).toHaveAttribute('open', '');
    await expect(page.locator('select[name="b-test-level"]')).toHaveValue('3');
    await expect(page.locator('select[name="b-plan-level"]')).toHaveValue('2');
  });

  test('questionnaire answers persist and export as Markdown', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('.st-part[data-part="A"] summary').click();
    await page.locator('#wb-a1').fill('Payments squad');
    await expect(page.locator('#wb-progress')).toContainText('1 of 61 answered');
    await page.locator('#wb-a1').blur();

    await page.reload();
    await expect(page.locator('#wb-a1')).toHaveValue('Payments squad');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#wb-download').click(),
    ]);
    const markdown = readFileSync(await download.path(), 'utf8');
    expect(markdown).toContain('# AI-native journey — Payments squad');
    expect(markdown).toContain('**Team name and services owned**');
    expect(markdown).toContain('**C1. Plan: How are acceptance criteria written today');
  });
});
