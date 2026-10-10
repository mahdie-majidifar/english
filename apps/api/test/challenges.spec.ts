import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChallengesDto, DashboardDto } from '@coach/contracts';
import { toLocalDate } from '@coach/domain';
import { API, createIntegrationApp, hasDatabase, resetDatabase, signedInAgent, type TestContext } from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

describe.skipIf(!hasDatabase())('daily and weekly challenges (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;
  let aliceId: string;
  let bobId: string;

  const challenges = async (agent: Agent) => (await agent.get(`${API}/challenges`).expect(200)).body as ChallengesDto;
  const totalXp = async (userId: string) => (await ctx.prisma.userGamification.findUnique({ where: { userId } }))?.totalXp ?? 0;
  const today = async (userId: string) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return new Date(`${toLocalDate(new Date(), user.timezone)}T00:00:00Z`);
  };

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
    aliceId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id;
    bobId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'bob@example.com' } })).id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('gives a daily and a weekly challenge, with nothing done yet', async () => {
    const c = await challenges(alice);
    expect(c.daily).toMatchObject({ kind: 'DAILY', progress: 0, done: false, rewardXp: 15 });
    expect(c.weekly).toMatchObject({ kind: 'WEEKLY', progress: 0, done: false, rewardXp: 60 });
    expect(c.daily.title.length).toBeGreaterThan(2);
    expect(c.daily.target).toBeGreaterThan(0);
    expect(c.justCompleted).toEqual([]);
  });

  it('is the same challenge all day, so it never changes under the learner', async () => {
    const a = await challenges(alice);
    const b = await challenges(alice);
    expect(b.daily.code).toBe(a.daily.code);
    expect(b.weekly.code).toBe(a.weekly.code);
  });

  it('needs a signed-in learner, and shows only their own progress', async () => {
    const { default: request } = await import('supertest');
    await request(ctx.server).get(`${API}/challenges`).expect(401);
    await ctx.prisma.dailyActivity.create({
      data: { userId: aliceId, localDate: await today(aliceId), attempts: 3, correct: 3, activeSeconds: 60, xp: 5 },
    });
    expect((await challenges(bob)).daily.progress).toBe(0);
  });

  it('counts what the learner did today toward the challenge', async () => {
    const c = await challenges(alice);
    // Whatever today's challenge is, three right answers in a minute moved it, or it counts something else.
    expect(['attempts', 'correct', 'minutes', 'sessions']).toContain(
      c.daily.code === 'D_ANSWER_15' ? 'attempts' : c.daily.code === 'D_CORRECT_10' ? 'correct' : c.daily.code === 'D_MINUTES_8' ? 'minutes' : 'sessions',
    );
    if (c.daily.code === 'D_ANSWER_15') expect(c.daily.progress).toBe(3);
    if (c.daily.code === 'D_CORRECT_10') expect(c.daily.progress).toBe(3);
    if (c.daily.code === 'D_MINUTES_8') expect(c.daily.progress).toBe(1);
    if (c.daily.code === 'D_SESSION_1') expect(c.daily.progress).toBe(0);
    expect(c.daily.done).toBe(false);
  });

  describe('finishing them', () => {
    it('pays each reward once, the first time the learner looks', async () => {
      // Plenty of everything today, so any daily challenge is done.
      await ctx.prisma.dailyActivity.update({
        where: { userId_localDate: { userId: aliceId, localDate: await today(aliceId) } },
        data: { attempts: 100, correct: 100, activeSeconds: 3600, sessionsCompleted: 10, xp: 1000 },
      });
      const before = await totalXp(aliceId);

      const first = await challenges(alice);
      expect(first.daily.done).toBe(true);
      expect(first.daily.progress).toBe(first.daily.target);
      expect(first.justCompleted.map((c) => c.kind)).toContain('DAILY');

      const paid = first.justCompleted.reduce((sum, c) => sum + c.rewardXp, 0);
      expect(await totalXp(aliceId)).toBe(before + paid);
      expect(paid).toBeGreaterThanOrEqual(15);

      // Looking again, or from the dashboard, pays nothing more.
      const again = await challenges(alice);
      expect(again.justCompleted).toEqual([]);
      expect(again.daily.done).toBe(true);
      expect(await totalXp(aliceId)).toBe(before + paid);
      expect(await ctx.prisma.xpEvent.count({ where: { userId: aliceId, reason: 'CHALLENGE' } })).toBe(first.justCompleted.length);
    });

    it('the reward also counts in today’s activity', async () => {
      const row = await ctx.prisma.dailyActivity.findUniqueOrThrow({ where: { userId_localDate: { userId: aliceId, localDate: await today(aliceId) } } });
      expect(row.xp).toBeGreaterThanOrEqual(1015);
    });

    it('two simultaneous looks pay only once', async () => {
      await ctx.prisma.dailyActivity.create({
        data: { userId: bobId, localDate: await today(bobId), attempts: 100, correct: 100, activeSeconds: 3600, sessionsCompleted: 10, xp: 1000 },
      });
      const before = await totalXp(bobId);
      const [a, b] = await Promise.all([challenges(bob), challenges(bob)]);
      const paid = [...a.justCompleted, ...b.justCompleted].reduce((sum, c) => sum + c.rewardXp, 0);
      const events = await ctx.prisma.xpEvent.count({ where: { userId: bobId, reason: 'CHALLENGE' } });
      // What was paid is exactly what the ledger holds: nothing was paid twice.
      const ledger = await ctx.prisma.xpEvent.aggregate({ where: { userId: bobId, reason: 'CHALLENGE' }, _sum: { amount: true } });
      expect(await totalXp(bobId)).toBe(before + ledger._sum.amount!);
      expect(paid).toBe(ledger._sum.amount);
      expect(paid).toBeGreaterThanOrEqual(15);
      expect(events).toBeLessThanOrEqual(2); // at most one daily and one weekly
    });
  });

  it('shows up on the dashboard', async () => {
    const d = (await alice.get(`${API}/dashboard`).expect(200)).body as DashboardDto;
    expect(d.challenges.daily).toMatchObject({ kind: 'DAILY', done: true });
    expect(d.challenges.weekly.kind).toBe('WEEKLY');
    expect(d.challenges.justCompleted).toEqual([]); // already paid above
  });

  it('unlocks "Challenger" after enough finished challenges', async () => {
    // Four more rewards on earlier days, on top of the ones already paid.
    const paid = await ctx.prisma.xpEvent.count({ where: { userId: aliceId, reason: 'CHALLENGE' } });
    for (let i = 0; i < 5 - paid; i++) {
      await ctx.prisma.xpEvent.create({ data: { userId: aliceId, reason: 'CHALLENGE', refId: `old-${i}`, amount: 15 } });
    }
    const list = (await alice.get(`${API}/achievements`).expect(200)).body;
    expect(list.achievements.find((a: { code: string }) => a.code === 'CHALLENGER').unlockedAt).not.toBeNull();
  });
});
