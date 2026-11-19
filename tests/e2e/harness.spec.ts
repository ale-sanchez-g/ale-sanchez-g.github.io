import { test, expect, Page } from '@playwright/test';

// Functional checks for the AI Harness page: the interactive video player and "Pull a floor".
const PATH = '/reference/ai-quality-architecture.html';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

const stage = (page: Page) => page.locator('#hx-stage');
const hudTitle = (page: Page) => page.locator('#hx-hud-title');
const builtFloors = (page: Page) => page.locator('.hx-floor.is-built');
const chapter = (page: Page, index: number) => page.locator('#hx-chapters button').nth(index);
const rangeValue = async (page: Page) => Number(await page.locator('#hx-range').inputValue());

// Start a chapter, pause it, then step through it five seconds at a time from the scrub bar.
async function openPaused(page: Page, index: number) {
  await chapter(page, index).click();
  await page.locator('#hx-play').click();
  await expect(stage(page)).toHaveAttribute('data-mode', 'paused');
  await page.locator('#hx-range').focus();
}

test.describe('AI Harness — page', () => {
  test('renders the player, chapters and transcript without script errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(PATH);
    await expect(stage(page)).toHaveAttribute('data-mode', 'poster');
    await expect(page.locator('#hx-poster')).toBeVisible();
    await expect(page.locator('.hx-floor')).toHaveCount(8);
    await expect(page.locator('.hx-sys')).toHaveCount(6);
    await expect(page.locator('#hx-chapters button')).toHaveCount(10);
    await expect(page.locator('#hx-script > li')).toHaveCount(10);
    await expect(page.locator('#hx-time')).toHaveText(/^0:00 \/ [2-3]:\d\d$/);
    expect(errors).toEqual([]);
  });

  test('credits the original post by @pragmaticcoder.ai', async ({ page }) => {
    await page.goto(PATH);
    const credit = 'a[href="https://www.instagram.com/pragmaticcoder.ai/"]';
    await expect(page.locator(`.hx-hero ${credit}`)).toBeVisible();
    await expect(page.locator(`.hx-hero ${credit}`)).toHaveText('@pragmaticcoder.ai');
    await expect(page.locator(`#hx-end ${credit}`)).toHaveCount(1);
  });

  test('the transcript drives the timeline: chapter times match the transcript', async ({ page }) => {
    await page.goto(PATH);
    const chapterTimes = await page.locator('#hx-chapters .hx-ch-time').allTextContents();
    const scriptTimes = await page.locator('#hx-script .hx-script-time').allTextContents();
    expect(chapterTimes).toHaveLength(10);
    expect(scriptTimes).toEqual(chapterTimes);
    expect(chapterTimes[0]).toBe('0:00');
  });

  test('uses a 16:9 stage on wide screens and a 9:16 stage on phones', async ({ page }) => {
    await page.goto(PATH);
    const box = await stage(page).boundingBox();
    expect(box).not.toBeNull();
    const wide = (page.viewportSize()?.width ?? 1280) >= 900;
    if (wide) expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
    else expect(box!.height / box!.width).toBeCloseTo(16 / 9, 1);
  });
});

test.describe('AI Harness — playback', () => {
  test('play starts at day one, builds the first floor and pause holds the playhead', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#hx-bigplay').click();
    await expect(stage(page)).toHaveAttribute('data-mode', 'playing');
    await expect(page.locator('#hx-poster')).toBeHidden();
    await expect(page.locator('#hx-play')).toHaveAttribute('aria-label', 'Pause');
    await expect(hudTitle(page)).toHaveText('Day one');
    await expect(page.locator('#hx-caption')).toContainText('Day one');
    await expect(page.locator('.hx-floor[data-floor="1"]')).toHaveClass(/is-built/);
    await expect(builtFloors(page)).toHaveCount(1);

    await page.locator('#hx-play').click();
    await expect(stage(page)).toHaveAttribute('data-mode', 'paused');
    const before = await rangeValue(page);
    await page.waitForTimeout(700);
    expect(await rangeValue(page)).toBe(before);
  });

  test('chapters, floors, buttons and the keyboard jump to the right scene', async ({ page }) => {
    await page.goto(PATH);
    await chapter(page, 2).click();
    await expect(hudTitle(page)).toHaveText('RAG');
    await expect(chapter(page, 2)).toHaveAttribute('aria-current', 'true');
    await expect(builtFloors(page)).toHaveCount(2);
    await expect(page.locator('#hx-caption')).toContainText('Add floor three');

    await page.locator('.hx-floor[data-floor="5"] .hx-slot').click();
    await expect(hudTitle(page)).toHaveText('RBAC + OAuth');
    await expect(builtFloors(page)).toHaveCount(4);
    await expect(stage(page)).toHaveAttribute('data-mode', 'playing');

    await stage(page).focus();
    await page.keyboard.press('Space');
    await expect(stage(page)).toHaveAttribute('data-mode', 'paused');
    await page.keyboard.press('ArrowRight');
    await expect(hudTitle(page)).toHaveText('Guardrails');
    await page.keyboard.press('ArrowLeft');
    await expect(hudTitle(page)).toHaveText('RBAC + OAuth');
    await page.locator('#hx-next').click();
    await expect(hudTitle(page)).toHaveText('Guardrails');
    await page.locator('#hx-prev').click();
    await expect(hudTitle(page)).toHaveText('RBAC + OAuth');
  });

  test('day one rents the brain, and the first question breaks it', async ({ page }) => {
    await page.goto(PATH);
    await openPaused(page, 0);
    await expect(page.locator('.hx-floor[data-floor="1"]')).not.toHaveClass(/is-built/);
    await page.keyboard.press('ArrowRight'); // 5 s: the brain is rented
    await expect(page.locator('.hx-floor[data-floor="1"]')).toHaveClass(/is-built/);
    await expect(page.locator('.hx-sys[data-floor="1"]')).toHaveClass(/is-on/);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight'); // 15 s: "Who are you?" — "I'm ChatGPT."
    const log = page.locator('#hx-panel .hx-log');
    await expect(log.locator('.hx-li--user.is-on')).toContainText('Who are you?');
    await expect(log.locator('.hx-li.is-on .hx-msg--bad')).toContainText('I’m ChatGPT.');
    await expect(page.locator('#hx-panel .hx-badge--bad.is-on')).toHaveText('Break 1 of 7');
    await expect(page.locator('.hx-floor[data-floor="2"]')).toHaveClass(/is-gap/);
  });

  test('each floor fixes the last question, then a new question breaks it', async ({ page }) => {
    await page.goto(PATH);
    await openPaused(page, 2); // RAG
    const log = page.locator('#hx-panel .hx-log');
    const floor = page.locator('.hx-floor[data-floor="3"]');

    // The conversation carries on: the question that broke the AI last time is still on screen.
    await expect(floor).toHaveClass(/is-gap/);
    await expect(floor).not.toHaveClass(/is-built/);
    await expect(page.locator('#hx-panel .hx-badge--bad.is-on')).toHaveText('Break 2 of 7');
    await expect(log.locator('.hx-li.is-on .hx-msg--bad')).toContainText('30 paid days');

    await page.keyboard.press('ArrowRight'); // 5 s: the floor lands
    await expect(floor).toHaveClass(/is-built/);
    await expect(floor).toHaveClass(/is-current/);
    await expect(floor.locator('.hx-slot')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('.hx-sys[data-floor="3"]')).toHaveClass(/is-on/);
    await expect(page.locator('#hx-panel .hx-plain.is-on')).toContainText('open-book exam');

    await page.keyboard.press('ArrowRight'); // 10 s: the same question again, now answered properly
    await expect(log.locator('.hx-li--user.is-on').last()).toContainText('What is my leave policy?');
    await expect(log.locator('.hx-li.is-on .hx-msg--good').last()).toContainText('20 days a year');
    await expect(log.locator('.hx-li.is-on .hx-msg--good').last()).toContainText('Fixed by floor 03');
    await expect(log.locator('.hx-li.is-struck .hx-msg--bad')).toContainText('30 paid days');
    await expect(page.locator('#hx-panel .hx-badge--ok.is-on')).toHaveText('✓ Break 2 fixed');

    await page.keyboard.press('ArrowRight'); // 15 s: a new question breaks it, and the next floor is needed
    await expect(log.locator('.hx-li.is-on .hx-msg--bad').last()).toContainText('Open the HR portal');
    await expect(log.locator('.hx-li.is-on .hx-msg--bad').last()).toContainText('can’t act');
    await expect(page.locator('#hx-panel .hx-badge--bad.is-on')).toHaveText('Break 3 of 7');
    await expect(page.locator('.hx-floor[data-floor="4"]')).toHaveClass(/is-gap/);
    await expect(floor).not.toHaveClass(/is-current/);
  });

  test('the last floor finds the root cause and closes every break', async ({ page }) => {
    await page.goto(PATH);
    await openPaused(page, 7); // observability + evals
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); // 15 s: the trace has found the cause
    const log = page.locator('#hx-panel .hx-log');
    await expect(log.locator('.hx-li.is-on .hx-trace')).toContainText('Answered from the cache');
    await expect(page.locator('#hx-panel .hx-badge--ok.is-on')).toHaveText('✓ Break 7 fixed');
    await expect(page.locator('.hx-floor.is-gap')).toHaveCount(0);

    await page.keyboard.press('k'); // play on to the final answer
    await expect(log.locator('.hx-li.is-on .hx-msg--good').last()).toContainText('25 days a year', { timeout: 10_000 });
    await expect(page.locator('#hx-panel .hx-badge--ok.is-on')).toHaveText('✓ All seven breaks fixed');
  });

  test('captions toggle, and the end screen shows the quality engineering lens and replays', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#hx-cc').click();
    await expect(page.locator('#hx-cc')).toHaveAttribute('aria-pressed', 'false');
    await expect(stage(page)).toHaveClass(/no-cc/);
    await stage(page).focus();
    await page.keyboard.press('c');
    await expect(page.locator('#hx-cc')).toHaveAttribute('aria-pressed', 'true');
    await expect(stage(page)).not.toHaveClass(/no-cc/);

    await chapter(page, 9).click();
    await expect(hudTitle(page)).toHaveText('Quality engineering');
    await page.locator('#hx-next').click();
    await expect(stage(page)).toHaveAttribute('data-mode', 'ended');
    await expect(page.locator('#hx-end')).toBeVisible();
    await expect(page.locator('#hx-end .hx-end-credit')).toContainText('@pragmaticcoder.ai');
    await expect(page.locator('#hx-play')).toHaveAttribute('aria-label', 'Replay');
    await expect(builtFloors(page)).toHaveCount(8);
    await expect(stage(page)).toHaveClass(/is-qe/);

    await page.locator('#hx-replay').click();
    await expect(stage(page)).toHaveAttribute('data-mode', 'playing');
    await expect(hudTitle(page)).toHaveText('Day one');
    await expect(page.locator('#hx-end')).toBeHidden();
  });
});

test.describe('AI Harness — narration', () => {
  test('speaks each line and holds the picture until the narrator finishes it', async ({ page }) => {
    // A stand-in voice that only finishes a line when the test says so.
    await page.addInitScript(() => {
      const w = window as any;
      w.__spoken = [] as string[];
      let current: any = null;
      w.SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text; } };
      const synth = {
        speaking: false, pending: false,
        getVoices: () => [{ name: 'Test voice', lang: 'en-AU', localService: true }],
        addEventListener() {},
        speak(line: any) {
          current = line; this.speaking = true; w.__spoken.push(line.text);
          setTimeout(() => line.onstart && line.onstart({}), 10);
        },
        cancel() { this.speaking = false; current = null; },
      };
      w.__finishLine = () => { const line = current; current = null; synth.speaking = false; if (line && line.onend) line.onend({}); };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    });
    await page.goto(PATH);
    await page.locator('#hx-voice').click(); // narration on starts the video
    await expect(page.locator('#hx-voice')).toHaveAttribute('aria-pressed', 'true');
    await expect(stage(page)).toHaveAttribute('data-mode', 'playing');
    await expect.poll(() => page.evaluate(() => (window as any).__spoken[0])).toBe('Day one: you rent a brain, with a single API call.');

    // The first line lasts about four seconds; the narrator is still talking, so the picture waits.
    await page.waitForTimeout(6500);
    await expect(page.locator('#hx-caption')).toContainText('Day one: you rent a brain');
    expect(await page.evaluate(() => (window as any).__spoken.length)).toBe(1);

    // Once the line ends the clock moves on, and the next line is spoken. (Generous timeouts for slow CI runners.)
    await page.evaluate(() => (window as any).__finishLine());
    await expect(page.locator('#hx-caption')).toContainText('brilliant new hire', { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => (window as any).__spoken[1]), { timeout: 10_000 }).toContain('brilliant new hire');
  });

  test('falls back to captions when the browser has no voice', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any;
      w.SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text; } };
      const silent = { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, speak() {}, cancel() {} };
      Object.defineProperty(window, 'speechSynthesis', { value: silent, configurable: true });
    });
    await page.goto(PATH);
    await page.locator('#hx-voice').click();
    await expect(page.locator('#hx-voice-note')).toContainText('captions carry the full script', { timeout: 6000 });
    await expect(page.locator('#hx-voice')).toHaveAttribute('aria-pressed', 'false');
    await expect(stage(page)).toHaveAttribute('data-mode', 'playing');
    const at = await rangeValue(page);
    await expect.poll(() => rangeValue(page)).toBeGreaterThan(at);
  });
});

test.describe('AI Harness — pull a floor', () => {
  const sw = (page: Page, floor: number) => page.locator(`.hx-pull-floor[data-floor="${floor}"]`);

  test('every floor standing means nothing breaks', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('#pull-count')).toHaveText('7 / 7');
    await expect(page.locator('#pull-verdict')).toContainText('All seven floors are standing');
    await expect(page.locator('#pull-breaks li')).toHaveCount(0);
    await expect(page.locator('.hx-pull-floor[aria-checked="true"]')).toHaveCount(7);
  });

  test('pulling floors shows what breaks and what to build next', async ({ page }) => {
    await page.goto(PATH);
    await sw(page, 5).click();
    await expect(sw(page, 5)).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#pull-count')).toHaveText('6 / 7');
    await expect(page.locator('#pull-breaks li')).toHaveCount(1);
    await expect(page.locator('#pull-breaks li').first()).toContainText('An intern sees the CEO’s salary');
    await expect(page.locator('#pull-breaks li').first()).toContainText('Critical risk');
    await expect(page.locator('#pull-next')).toContainText('RBAC + OAuth');

    await sw(page, 8).click();
    await expect(page.locator('#pull-verdict')).toContainText('2 floors missing');
    await expect(page.locator('#pull-next')).toContainText('Observability + evals');
  });

  test('risk depends on what is still standing', async ({ page }) => {
    await page.goto(PATH);
    for (const floor of [5, 3, 4]) await sw(page, floor).click(); // no access control, no data, no tools
    const access = page.locator('#pull-breaks li[data-floor="5"]');
    await expect(access).toContainText('Nothing to leak, yet');
    await expect(access).toContainText('Not yet');

    await sw(page, 6).click(); // guardrails out, but nothing can act or read
    await expect(page.locator('#pull-breaks li[data-floor="6"]')).toContainText('Medium risk');
    await sw(page, 4).click(); // tools back: a hijacked AI can now act
    await expect(page.locator('#pull-breaks li[data-floor="6"]')).toContainText('Critical risk');
    await expect(access).toContainText('An intern sees the CEO’s salary');
  });

  test('back to day one, then rebuild every floor', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('#pull-all').click();
    await expect(page.locator('#pull-count')).toHaveText('0 / 7');
    await expect(page.locator('#pull-next')).toContainText('Observability + evals');
    await page.locator('#pull-none').click();
    await expect(page.locator('#pull-count')).toHaveText('7 / 7');
  });
});

test.describe('AI Harness — print and no JavaScript', () => {
  test('printing hides the player and expands the transcript and floor guidance', async ({ page }) => {
    await page.goto(PATH);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('#hx-player')).toBeHidden();
    await expect(page.locator('#pull')).toBeHidden();
    await expect(page.locator('#hx-script > li').first()).toBeVisible();
    await expect(page.locator('#floor-06 .hx-fl-body')).toBeVisible();
  });
});

test.describe('AI Harness — without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the finished building and the transcript', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('.hx-controls')).toBeHidden();
    await expect(page.locator('#hx-poster')).toBeHidden();
    await expect(page.locator('#pull')).toBeHidden();
    await expect(page.locator('.hx-floor[data-floor="8"] .hx-slab')).toBeVisible();
    await expect(page.locator('#hx-panel')).toContainText('Every floor exists because something broke');
    await expect(page.locator('#hx-script > li')).toHaveCount(10);
  });
});
