import { expect, type Page } from '@playwright/test';

let counter = 0;
/** A new learner every time, so tests never trip over each other. */
export const newLearner = () => ({
  name: 'Ella E2E',
  email: `ella.${Date.now()}.${++counter}@example.com`,
  password: 'playwright run 42',
});

export async function register(page: Page, learner = newLearner()) {
  await page.goto('/register');
  await page.getByLabel('Your name').fill(learner.name);
  await page.getByLabel('Email').fill(learner.email);
  await page.getByLabel('Password').fill(learner.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  return learner;
}

const visible = (locator: ReturnType<Page['locator']>) => locator.first().isVisible().catch(() => false);

/** The things an exercise can ask you to touch or type into. */
const interactive = (page: Page) =>
  page
    .getByText('Tap to flip')
    .or(page.getByRole('list', { name: 'Words' }).getByRole('button'))
    .or(page.getByLabel('Words to use').getByRole('button'))
    .or(page.locator('main input[type="text"], main input:not([type]), main textarea'))
    .or(page.locator('main button').filter({ hasText: /^s*1s/ }));

/** Fills in whatever the exercise on screen asks for, whatever its format. Returns false when it does not know how. */
async function fillIn(page: Page): Promise<boolean> {
  // A question fades in: wait until there is something to answer before deciding the format is unknown.
  await interactive(page).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);

  // A flashcard: flip it, then say how well you knew it. It needs no Check.
  const flip = page.getByText('Tap to flip');
  if (await visible(flip)) {
    await flip.first().click();
    await page.getByRole('button', { name: /^Good/ }).click();
    return true;
  }

  // Matching: connect each word to a meaning.
  const words = page.getByRole('list', { name: 'Words' }).getByRole('button');
  if (await visible(words)) {
    const count = await words.count();
    for (let i = 0; i < count; i++) {
      await words.nth(i).click();
      await page.getByRole('list', { name: 'Meanings' }).getByRole('button').nth(i).click();
    }
    return true;
  }

  // Sentence order: tap the words until none are left.
  const tiles = page.getByLabel('Words to use').getByRole('button');
  if (await visible(tiles)) {
    for (let guard = 0; guard < 30 && (await tiles.count()) > 0; guard++) await tiles.first().click();
    return true;
  }

  // Typing: one box, several boxes (verb forms), or a longer text.
  const boxes = page.locator('main input[type="text"], main input:not([type]), main textarea');
  if (await visible(boxes)) {
    const count = await boxes.count();
    for (let i = 0; i < count; i++) if (await boxes.nth(i).isEditable().catch(() => false)) await boxes.nth(i).fill('answer');
    return true;
  }

  // A choice: the options are buttons that start with their number.
  const option = page.locator('main button').filter({ hasText: /^\s*1\s/ });
  if (await visible(option)) {
    await option.first().click();
    return true;
  }
  return false;
}

/**
 * Answers the exercise on screen and moves on, the way a person does: fill it in, press Check, press
 * Continue. The point is to drive the player, not to get answers right.
 */
/** What the helper could not answer, so a failing test can say what it was. */
export const skipped: string[] = [];

export async function answerCurrent(page: Page): Promise<void> {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();

  if (!(await fillIn(page))) {
    skipped.push((await page.locator('main').innerText().catch(() => '?')).replace(/s+/g, ' ').slice(0, 160));
    await page.screenshot({ path: `skipped-${skipped.length}.png` }).catch(() => undefined);
    skipped.push(`HTML: ${(await page.locator('main').innerHTML().catch(() => '?')).replace(/s+/g, ' ').slice(0, 700)}`);
    await page.getByRole('button', { name: 'Skip' }).click();
    return;
  }

  // Some formats send themselves (a flashcard rating); the others wait for Check (or Next, in an exam).
  const check = page.getByRole('button', { name: /^(Check|Next)$/ });
  if (await check.isEnabled().catch(() => false)) await check.click();

  const cont = page.getByRole('button', { name: /^(Continue|See results)/ });
  // A practice or quiz answer shows its feedback and waits for Continue; an exam moves straight on.
  const next = page.getByRole('button', { name: /Select an answer|Type your answer|Flip the card|Build your sentence|Match every/ }).first();
  await Promise.race([cont.waitFor({ state: 'visible', timeout: 4000 }), next.waitFor({ state: 'visible', timeout: 4000 })]).catch(() => undefined);
  if (await cont.isVisible().catch(() => false)) await cont.click();
}

/** Plays a player screen (practice, session, quiz, exam) until it is over. */
export async function playThrough(page: Page, maxSteps = 40): Promise<void> {
  const progress = page.getByRole('progressbar', { name: 'Progress' });
  await expect(progress).toBeVisible();
  for (let i = 0; i < maxSteps; i++) {
    if (!(await progress.isVisible().catch(() => false))) return;
    await answerCurrent(page);
    await page.waitForTimeout(250);
  }
  throw new Error('The player never finished.');
}

/** Remembers every API call that failed, so a failing test can say what the server answered. */
export function watchApi(page: Page): { failures: string[] } {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(`PAGE ERROR ${e.message.slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`CONSOLE ${m.text().slice(0, 300)}`); });
  page.on('response', async (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      failures.push(`${res.request().method()} ${new URL(res.url()).pathname} -> ${res.status()} ${(await res.text().catch(() => '')).slice(0, 300)}`);
    }
  });
  return { failures };
}
