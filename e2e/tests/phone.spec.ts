import { expect, test } from '@playwright/test';
import { register } from './helpers';

/** The same app on a phone: nothing may need a mouse or a wide screen. */
test('every page is reachable from the bottom bar and its More menu', async ({ page }) => {
  await register(page);

  const bar = page.getByRole('navigation', { name: 'Main' }).last();
  await expect(bar.getByRole('link', { name: 'Books' })).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Tests' })).toBeVisible();

  await bar.getByRole('button', { name: 'More' }).click();
  const menu = page.getByRole('dialog');
  for (const name of ['Teacher notes', 'Library', 'My mistakes', 'Progress', 'Achievements', 'Profile & settings']) {
    await expect(menu.getByRole('link', { name })).toBeVisible();
  }
  await menu.getByRole('link', { name: 'Progress' }).click();
  await expect(page).toHaveURL(/\/progress/);
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
});

test('nothing scrolls sideways on the main screens', async ({ page }) => {
  await register(page);
  for (const path of ['/', '/books', '/practice', '/assessments', '/progress', '/achievements', '/profile', '/library']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} is wider than the screen`).toBeLessThanOrEqual(1);
  }
});

test('the sign-in and sign-up pages work on a phone', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name.')).toBeVisible();
});
