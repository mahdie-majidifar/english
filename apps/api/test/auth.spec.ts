import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://fake:fake@localhost:5432/fake';
process.env['JWT_ACCESS_SECRET'] = 'test-secret-test-secret-test-secret-123456';
process.env['WEB_ORIGIN'] = 'http://localhost:3000';
process.env['DISABLE_THROTTLE'] = '1';

const { AppModule } = await import('../src/app.module.js');
const { configureApp } = await import('../src/app.setup.js');
const { PrismaService } = await import('../src/core/prisma/prisma.service.js');
const { FakePrisma } = await import('./fake-prisma.js');

const EMAIL = 'learner@example.com';
const PASSWORD = 'correct horse battery staple';
const API = '/api/v1';

async function createApp(prisma: InstanceType<typeof FakePrisma>) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

const cookiesOf = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'];
  return Array.isArray(header) ? header : header ? [header] : [];
};
const cookieNamed = (res: request.Response, name: string) =>
  cookiesOf(res).find((c) => c.startsWith(`${name}=`));

describe('auth flow (HTTP layer, in-memory database)', () => {
  const prisma = new FakePrisma();
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    prisma.addUser({
      email: EMAIL,
      passwordHash: await argon2.hash(PASSWORD),
      displayName: 'Majid',
    });
    app = await createApp(prisma);
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  it('health is public', async () => {
    const res = await request(server).get(`${API}/health`).expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('protects routes by default, with problem+json errors', async () => {
    const res = await request(server).get(`${API}/auth/me`).expect(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(res.body.traceId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.traceId);
  });

  it('validates input with per-field errors', async () => {
    const res = await request(server).post(`${API}/auth/login`).send({ email: 'nope' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['email', 'password']);
  });

  it('rejects wrong credentials without revealing which part was wrong', async () => {
    const wrongPassword = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: EMAIL, password: 'wrong' })
      .expect(401);
    const unknownEmail = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: 'nobody@example.com', password: 'wrong' })
      .expect(401);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      detail: wrongPassword.body.detail,
    });
  });

  it('blocks cross-origin state-changing requests', async () => {
    const res = await request(server)
      .post(`${API}/auth/login`)
      .set('Origin', 'https://evil.example')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  describe('session lifecycle', () => {
    const agent = () => request.agent(server);

    it('logs in with httpOnly cookies and never leaks the password hash', async () => {
      const a = agent();
      const res = await a
        .post(`${API}/auth/login`)
        .set('Origin', 'http://localhost:3000')
        .send({ email: ` ${EMAIL.toUpperCase()} `.trim(), password: PASSWORD })
        .expect(200);

      expect(res.body.user).toMatchObject({ email: EMAIL, displayName: 'Majid', role: 'STUDENT' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

      expect(cookieNamed(res, 'ec_at')).toMatch(/HttpOnly/i);
      expect(cookieNamed(res, 'ec_at')).toMatch(/SameSite=Lax/i);
      expect(cookieNamed(res, 'ec_rt')).toMatch(/HttpOnly/i);
      expect(cookieNamed(res, 'ec_rt')).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookieNamed(res, 'ec_s')).toBeTruthy();

      const me = await a.get(`${API}/auth/me`).expect(200);
      expect(me.body.user.email).toBe(EMAIL);
    });

    it('stores only a hash of the refresh token', async () => {
      const a = agent();
      const res = await a.post(`${API}/auth/login`).send({ email: EMAIL, password: PASSWORD }).expect(200);
      const raw = /ec_rt=([^;]+)/.exec(cookieNamed(res, 'ec_rt')!)![1]!;
      expect(prisma.tokens.some((t) => t.tokenHash === raw)).toBe(false);
      expect(prisma.tokens.every((t) => t.tokenHash.length === 64)).toBe(true);
    });

    it('rotates the refresh token and keeps the session alive', async () => {
      const a = agent();
      const login = await a.post(`${API}/auth/login`).send({ email: EMAIL, password: PASSWORD }).expect(200);
      const before = cookieNamed(login, 'ec_rt');

      const refreshed = await a.post(`${API}/auth/refresh`).expect(200);
      const after = cookieNamed(refreshed, 'ec_rt');
      expect(after).toBeTruthy();
      expect(after).not.toBe(before);
      await a.get(`${API}/auth/me`).expect(200);
    });

    it('treats replay of an old refresh token as theft and revokes the whole family', async () => {
      const a = agent();
      const login = await a.post(`${API}/auth/login`).send({ email: EMAIL, password: PASSWORD }).expect(200);
      const stolen = /ec_rt=([^;]+)/.exec(cookieNamed(login, 'ec_rt')!)![1]!;

      const rotated = await a.post(`${API}/auth/refresh`).expect(200);
      const current = /ec_rt=([^;]+)/.exec(cookieNamed(rotated, 'ec_rt')!)![1]!;

      // Pretend the rotation happened a minute ago (outside the race-condition grace window).
      for (const t of prisma.tokens) if (t.revokedAt) t.revokedAt = new Date(Date.now() - 60_000);

      const replay = await request(server)
        .post(`${API}/auth/refresh`)
        .set('Cookie', `ec_rt=${stolen}`)
        .expect(401);
      expect(replay.body.code).toBe('TOKEN_REUSED');

      // The legitimate holder of the newest token is signed out too.
      await request(server).post(`${API}/auth/refresh`).set('Cookie', `ec_rt=${current}`).expect(401);
    });

    it('logs out: clears cookies and kills the refresh token', async () => {
      const a = agent();
      const login = await a.post(`${API}/auth/login`).send({ email: EMAIL, password: PASSWORD }).expect(200);
      const rt = /ec_rt=([^;]+)/.exec(cookieNamed(login, 'ec_rt')!)![1]!;

      const out = await a.post(`${API}/auth/logout`).expect(204);
      expect(cookieNamed(out, 'ec_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);

      await request(server).post(`${API}/auth/refresh`).set('Cookie', `ec_rt=${rt}`).expect(401);
      await a.get(`${API}/auth/me`).expect(401);
    });
  });

  describe('profile', () => {
    it('returns defaults, validates and persists updates, scoped to the logged-in user', async () => {
      const a = request.agent(server);
      await a.post(`${API}/auth/login`).send({ email: EMAIL, password: PASSWORD }).expect(200);

      const initial = await a.get(`${API}/me/profile`).expect(200);
      expect(initial.body).toMatchObject({ dailyGoalMinutes: 10, sessionMinutes: 10, englishLevel: null });

      const bad = await a.patch(`${API}/me/profile`).send({ dailyGoalMinutes: 3 }).expect(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
      await a.patch(`${API}/me/profile`).send({ timezone: 'Mars/Olympus' }).expect(400);
      await a.patch(`${API}/me/profile`).send({ role: 'ADMIN' }).expect(400); // unknown keys are rejected

      const ok = await a
        .patch(`${API}/me/profile`)
        .send({ englishLevel: 'B1', dailyGoalMinutes: 15, learningGoal: 'Business English' })
        .expect(200);
      expect(ok.body).toMatchObject({ englishLevel: 'B1', dailyGoalMinutes: 15, learningGoal: 'Business English' });
    });
  });
});

describe('login rate limiting', () => {
  it('returns 429 after repeated attempts', async () => {
    delete process.env['DISABLE_THROTTLE'];
    const app = await createApp(new FakePrisma());
    try {
      let last = 0;
      for (let i = 0; i < 7; i++) {
        last = (
          await request(app.getHttpServer()).post(`${API}/auth/login`).send({ email: 'a@b.co', password: 'x' })
        ).status;
      }
      expect(last).toBe(429);
    } finally {
      process.env['DISABLE_THROTTLE'] = '1';
      await app.close();
    }
  });
});
