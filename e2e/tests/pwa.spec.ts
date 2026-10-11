import { expect, test } from '@playwright/test';

/** What a phone or computer needs to install the site like an app. None of it may need a sign-in. */
test('the site can be installed: manifest, icons, offline page and service worker load without signing in', async ({ request, page }) => {
  const manifestResponse = await request.get('/manifest.webmanifest', { maxRedirects: 0 });
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: 'English Coach', display: 'standalone', start_url: '/', scope: '/' });

  // Installable needs a 192 and a 512 icon; a maskable one makes it look right on Android.
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const res = await request.get(icon.src, { maxRedirects: 0 });
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain(icon.type);
  }

  const worker = await request.get('/sw.js', { maxRedirects: 0 });
  expect(worker.status()).toBe(200);
  expect(worker.headers()['content-type']).toContain('javascript');
  const offline = await request.get('/offline.html', { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain('You are offline');

  // The pages point at the manifest and the home-screen icon.
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/);
});

test('the service worker registers under the CSP and shows the offline page when the network is gone', async ({ page, context }) => {
  test.skip(!process.env.E2E_PROD, 'Only the built site registers the worker (run pnpm e2e:prod).');
  const blocked: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text().slice(0, 200));
  });

  await page.goto('/login');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // The worker must be in charge of this page before the network goes away.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto('/login').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
  expect(blocked).toEqual([]);
});
