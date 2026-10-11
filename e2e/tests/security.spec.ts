import { expect, test } from '@playwright/test';
import { register } from './helpers';

/** The Content-Security-Policy is real protection only if the app still works under it. */
test('every page carries a nonce policy and nothing is blocked by it', async ({ page }) => {
  const blocked: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text().slice(0, 240));
  });

  const response = await page.goto('/login');
  const policy = response?.headers()['content-security-policy'] ?? '';
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce, 'a nonce in the policy').toBeTruthy();
  expect(policy).toContain("script-src 'self' 'nonce-");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  // Every inline script Next put in the page carries this request's nonce. (Checked on the built site only:
  // `next dev` adds a few development scripts of its own.)
  if (process.env.E2E_PROD) {
    const inline = await page.evaluate(() =>
      [...document.querySelectorAll('script:not([src])')].map((s) => (s as HTMLScriptElement).nonce || s.getAttribute('nonce') || ''),
    );
    expect(inline.length).toBeGreaterThan(0);
    expect(inline.every((n) => n === nonce)).toBe(true);
  }

  // Injected markup cannot run code: an inline event handler is refused and the browser reports it.
  const injected = await page.evaluate(
    () =>
      new Promise<{ ran: boolean; violated: boolean }>((resolve) => {
        let violated = false;
        document.addEventListener('securitypolicyviolation', () => (violated = true), { once: true });
        const host = document.createElement('div');
        host.innerHTML = '<img src="x" onerror="window.__injected = true">';
        document.body.appendChild(host);
        setTimeout(() => resolve({ ran: Boolean((window as unknown as { __injected?: boolean }).__injected), violated }), 400);
      }),
  );
  expect(injected).toEqual({ ran: false, violated: true });
  blocked.length = 0;

  // A new nonce for every view.
  const second = await page.goto('/login');
  expect(/'nonce-([^']+)'/.exec(second?.headers()['content-security-policy'] ?? '')?.[1]).not.toBe(nonce);

  // And the pages still work: signing up, the home screen, the library and a practice setup.
  await register(page);
  for (const path of ['/', '/library', '/books', '/progress', '/practice']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(blocked).toEqual([]);
});
