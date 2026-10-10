import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createIntegrationApp, hasDatabase, resetDatabase, type TestContext } from './integration.js';

describe.skipIf(!hasDatabase())('registration and system status (real PostgreSQL)', () => {
  let ctx: TestContext;
  const body = { displayName: 'Sara', email: 'sara@example.com', password: 'sunny day 42', timezone: 'Europe/London' };

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates an account, signs in at once and sets the session cookies', async () => {
    const agent = request.agent(ctx.server);
    const res = await agent.post(`${API}/auth/register`).send(body).expect(201);

    expect(res.body.user).toMatchObject({ email: 'sara@example.com', displayName: 'Sara', role: 'STUDENT', timezone: 'Europe/London' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toMatch(/ec_at=.*HttpOnly/i);
    expect(cookies).toMatch(/ec_rt=.*HttpOnly/i);

    // The new session works straight away.
    const me = await agent.get(`${API}/auth/me`).expect(200);
    expect(me.body.user.email).toBe('sara@example.com');

    // And it has a profile with the defaults, so everything else works for a new learner.
    const profile = await agent.get(`${API}/me/profile`).expect(200);
    expect(profile.body.dailyGoalMinutes).toBe(10);
  });

  it('stores only a hash of the password, and the password then signs in', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'sara@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('sunny');

    const fresh = request.agent(ctx.server);
    await fresh.post(`${API}/auth/login`).send({ email: 'sara@example.com', password: body.password }).expect(200);
  });

  it('keeps each learner’s data apart from the first request', async () => {
    const other = request.agent(ctx.server);
    await other.post(`${API}/auth/register`).send({ ...body, displayName: 'Omid', email: 'omid@example.com' }).expect(201);
    const books = await other.get(`${API}/books`).expect(200);
    expect(books.body).toEqual([]);
  });

  it('treats the email as case-insensitive and refuses a second account for it', async () => {
    const res = await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'SARA@Example.com' }).expect(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.detail).toMatch(/already exists/);
    expect(await ctx.prisma.user.count({ where: { email: 'sara@example.com' } })).toBe(1);
  });

  it('only one of two simultaneous sign-ups for the same email succeeds', async () => {
    const attempt = () => request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'race@example.com' });
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('says what is wrong with each field', async () => {
    const weak = await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'a@example.com', password: 'short1' }).expect(400);
    expect(weak.body.errors.map((e: { path: string }) => e.path)).toContain('password');

    const noDigit = await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'b@example.com', password: 'only letters here' }).expect(400);
    expect(noDigit.body.errors[0].message).toMatch(/letter and one number/);

    const badEmail = await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'not-an-email' }).expect(400);
    expect(badEmail.body.errors.map((e: { path: string }) => e.path)).toContain('email');

    await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'c@example.com', displayName: '   ' }).expect(400);
    await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'd@example.com', timezone: 'Mars/Olympus' }).expect(400);
    expect(await ctx.prisma.user.count({ where: { email: { in: ['a', 'b', 'c', 'd'].map((x) => `${x}@example.com`) } } })).toBe(0);
  });

  it('cannot be used to pick a role', async () => {
    const res = await request(ctx.server).post(`${API}/auth/register`).send({ ...body, email: 'sneaky@example.com', role: 'ADMIN' }).expect(201);
    expect(res.body.user.role).toBe('STUDENT');
  });

  it('works without a time zone (it falls back to the default)', async () => {
    const { timezone: _tz, ...rest } = body;
    const res = await request(ctx.server).post(`${API}/auth/register`).send({ ...rest, email: 'tzless@example.com' }).expect(201);
    expect(typeof res.body.user.timezone).toBe('string');
  });

  it('is public, and so is the system status (which holds nothing secret)', async () => {
    const res = await request(ctx.server).get(`${API}/system/status`).expect(200);
    expect(res.body).toMatchObject({ registrationOpen: true, ai: { provider: expect.stringMatching(/openai|mock|none/), configured: expect.any(Boolean) } });
    expect(JSON.stringify(res.body)).not.toMatch(/key|secret|sk-/i);
  });

  it('can be closed with ALLOW_REGISTRATION=false', async () => {
    process.env['ALLOW_REGISTRATION'] = 'false';
    const closed = await createIntegrationApp();
    try {
      const res = await request(closed.server).post(`${API}/auth/register`).send({ ...body, email: 'late@example.com' }).expect(403);
      expect(res.body.detail).toMatch(/closed/i);
      expect((await request(closed.server).get(`${API}/system/status`)).body.registrationOpen).toBe(false);
    } finally {
      delete process.env['ALLOW_REGISTRATION'];
      await closed.app.close();
    }
  });
});
