import { expect, test, type Page } from '@playwright/test';
import { answerCurrent, newLearner, playThrough, register, skipped, watchApi } from './helpers';

/**
 * A learner's first session in the real app, in a real browser: sign up, add a book, fill a lesson,
 * learn it, practise it, do the daily session, take a quiz, and look at the results.
 * Everything is clicked through the screens, nothing is called behind the scenes.
 */
test.describe.configure({ mode: 'serial' });

const learner = newLearner();
let bookUrl = '';

const lessonRow = (page: Page, title: string) => page.locator('li').filter({ hasText: title }).filter({ has: page.getByRole('link', { name: 'Learn' }) });

test('signs up and lands on a welcoming home screen', async ({ page }) => {
  await register(page, learner);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ella');
  await expect(page.getByText('Choose your book').first()).toBeVisible();
  // The AI is in demo mode here, and the page says so rather than pretending.
  await expect(page.getByText('The AI is in demo mode.')).toBeVisible();
});

test('adds a book from the list and names its lessons', async ({ page }) => {
  await signIn(page);
  await page.goto('/books');
  await page.getByRole('button', { name: 'Add this book' }).first().click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('American English File 3 (Third Edition)');
  bookUrl = page.url();

  await page.getByRole('button', { name: 'Paste contents' }).click();
  await page.getByLabel('Lessons').fill('Unit 1 People\n1A Meeting people\n1B Jobs');
  await page.getByRole('button', { name: 'Add lessons' }).click();
  await expect(page.getByText(/Named 2 lessons/)).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText('Meeting people')).toBeVisible();
  await expect(page.getByText('Jobs').first()).toBeVisible();
});

test('fills a lesson with AI suggestions, reviews them and keeps them', async ({ page }) => {
  await signIn(page);
  await page.goto(bookUrl);
  await lessonRow(page, 'Meeting people').getByRole('button', { name: 'Fill with AI' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Fill this lesson with AI' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Suggest content' }).click();

  await expect(page).toHaveURL(/\/teacher\/materials\//);
  await expect(page.getByText('Nothing is saved yet')).toBeVisible();
  await page.getByRole('button', { name: 'Save to library' }).click();
  await expect(page.getByText('Saved to your library').first()).toBeVisible();
});

test('learns the lesson one item at a time, with an explanation on request', async ({ page }) => {
  await signIn(page);
  await page.goto(bookUrl);
  await lessonRow(page, 'Meeting people').getByRole('link', { name: 'Learn' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1A');
  await expect(page.getByText('1 of 6')).toBeVisible();

  await page.getByRole('button', { name: 'Explain with AI' }).click();
  await expect(page.getByText('حالت mock').first()).toBeVisible();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('2 of 6')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('1 of 6')).toBeVisible();

  // Through to the end, then on to practice.
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('You went through all 6')).toBeVisible();
});

test('practises the lesson and gets feedback after each answer', async ({ page }) => {
  await signIn(page);
  await page.goto(bookUrl);
  await lessonRow(page, 'Meeting people').getByRole('link', { name: 'Practice' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1A');
  await page.getByRole('button', { name: 'Start' }).click();
  await playThrough(page);
  // The summary or the feedback ends the run: either way the player is gone and the learner can go on.
  await expect(page.getByRole('progressbar', { name: 'Progress' })).toHaveCount(0);
});

test('does the daily session and sees what it earned', async ({ page }) => {
  const api = watchApi(page);
  await signIn(page);
  await page.goto('/session');
  await page.getByRole('button', { name: /^(Start|Continue)$/ }).click();
  await playThrough(page);
  await expect(page.getByRole('heading', { name: 'Session complete!' }), `API failures: ${api.failures.join(' | ')} SKIPPED: ${skipped.join(' || ')}`).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('earned today')).toBeVisible();
});

test('takes a quiz on the lesson and sees the result', async ({ page }) => {
  await signIn(page);
  await page.goto(bookUrl);
  await lessonRow(page, 'Meeting people').getByRole('button', { name: 'Quiz' }).click();
  await expect(page).toHaveURL(/\/assessments\/.+\/take/);
  await page.getByRole('button', { name: 'Start' }).click();
  await playThrough(page);
  await expect(page).toHaveURL(/\/assessments\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByText('Quiz result')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By skill' })).toBeVisible();
});

test('takes an exam: no feedback until the end, and can go back to the previous question', async ({ page }) => {
  await signIn(page);
  await page.goto(bookUrl);
  await lessonRow(page, 'Meeting people').getByRole('button', { name: 'Set as current' }).click();
  await expect(page.getByText('Current lesson').first()).toBeVisible();

  await page.goto('/assessments');
  const exam = page.locator('section[aria-label="Build one"] > div').filter({ hasText: 'A proper test' });
  await exam.getByRole('button', { name: 'Current lesson' }).click();
  await expect(page).toHaveURL(/\/assessments\/.+\/take/);
  await expect(page.getByText('No feedback until the end')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  // A clock is running, and answering says nothing about right or wrong.
  await expect(page.getByRole('timer')).toBeVisible();
  const first = await page.getByRole('heading', { level: 1 }).innerText();
  await answerCurrent(page);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();

  // Back brings the first question again.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(first);

  await playThrough(page);
  await expect(page).toHaveURL(/\/assessments\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByText('Exam result')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
});

test('progress and achievements show what happened', async ({ page }) => {
  await signIn(page);
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: /Minutes practised each day/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your books' })).toBeVisible();
  await expect(page.getByText('American English File 3 (Third Edition)')).toBeVisible();

  await page.goto('/achievements');
  await expect(page.getByRole('heading', { name: 'Achievements', level: 1 })).toBeVisible();
  await expect(page.getByText('First steps').first()).toBeVisible();
  await expect(page.getByText(/Earned/).first()).toBeVisible();
});

test('the library shows real statuses, and the profile keeps the difficulty', async ({ page }) => {
  await signIn(page);
  await page.goto('/library');
  await expect(page.getByText('Learning').first()).toBeVisible();

  await page.goto('/profile');
  await page.getByRole('radio', { name: /Easy/ }).click();
  await expect(page.getByRole('radio', { name: /Easy/ })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('radio', { name: /Easy/ })).toHaveAttribute('aria-checked', 'true');
});

test('signs out and is sent to the sign-in page', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/books');
  await expect(page).toHaveURL(/\/login/);
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(learner.email);
  await page.getByLabel('Password').fill(learner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}
