import { test, expect } from '@playwright/test';

test('Alej Page Check', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot({ maxDiffPixels: 150 });

  await page.click('text=Work Experience');
  await expect(page).toHaveScreenshot({ maxDiffPixels: 150 });
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Publication')).click();
  await expect(page).toHaveScreenshot({ maxDiffPixels: 150 });
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Conferences')).click();
  await expect(page).toHaveScreenshot({ maxDiffPixels: 150 });
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Learning')).click();
  await expect(page).toHaveScreenshot({ maxDiffPixels: 150 });
  await page.click('text=Back Home');

  (await page.waitForSelector('text=Support')).click();
  await expect(page).toHaveScreenshot({ maxDiffPixels: 150 });
  await page.click('text=Back Home');
});
