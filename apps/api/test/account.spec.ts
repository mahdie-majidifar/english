import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientExercise } from '@coach/contracts';
import { StorageService } from '../src/core/storage/storage.service.js';
import { answerFor } from './answers.js';
import { API, createIntegrationApp, hasDatabase, PASSWORD, resetDatabase, signedInAgent, type TestContext } from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

describe.skipIf(!hasDatabase())('your data: export and delete (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;
  let aliceId: string;
  let bobId: string;
  let uploadedKey: string;
  let answered = 0;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
    aliceId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id;
    bobId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'bob@example.com' } })).id;

    const book = (await alice.post(`${API}/books`).send({ title: 'American English File 3' }).expect(201)).body;
    await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '8B Business' }).expect(200);
    const lessonId = (await alice.get(`${API}/books/${book.id}`)).body.units[0].lessons[0].id;
    await alice.put(`${API}/me/current-lesson`).send({ lessonId }).expect(200);
    for (const [headword, meaningFa] of [['negotiate', 'مذاکره کردن'], ['strictly', 'به‌طور سخت‌گیرانه'], ['weird', 'عجیب'], ['static', 'ثابت']]) {
      await alice.post(`${API}/items`).send({ lessonIds: [lessonId], type: 'VOCABULARY', headword, meaningFa, payload: { examples: [`The ${headword} example is here.`] } }).expect(201);
    }
    await bob.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'bobsecret', meaningFa: 'راز' }).expect(201);

    // Some history: answers (right and wrong), a quiz and the XP, streak and activity that come with them.
    const run: { exercises: ClientExercise[] } = (await alice.post(`${API}/practice`).send({ scope: 'all', count: 8 }).expect(200)).body;
    for (const [i, e] of run.exercises.entries()) {
      const response = await answerFor(ctx.prisma, e.id, i % 2 === 0);
      await alice.post(`${API}/attempts`).send({ clientAttemptId: randomUUID(), exerciseId: e.id, response }).expect(200);
      answered++;
    }
    await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON' }).expect(201);

    // Things that live outside the tables: an uploaded file on disk, and the AI usage log (it has no link to the user).
    uploadedKey = await ctx.app.get(StorageService).put(aliceId, Buffer.from('teacher notes'), 'txt');
    await ctx.prisma.storedFile.create({
      data: { userId: aliceId, storageKey: uploadedKey, originalName: 'notes.txt', mimeType: 'text/plain', sizeBytes: 13, sha256: 'x'.repeat(64) },
    });
    await ctx.prisma.aiRun.create({
      data: { userId: aliceId, task: 'explain', provider: 'mock', model: 'm', promptId: 'p', promptVersion: 1, success: true, latencyMs: 5 },
    });
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('export', () => {
    it('is for signed-in learners only', async () => {
      await (await import('supertest')).default(ctx.server).get(`${API}/me/export`).expect(401);
    });

    it('downloads everything the learner owns as one JSON file', async () => {
      const res = await alice.get(`${API}/me/export`).buffer(true).parse((r, done) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (c) => (data += c));
        r.on('end', () => done(null, data));
      }).expect(200);

      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="english-coach-export-\d{4}-\d{2}-\d{2}\.json"$/);
      expect(res.headers['cache-control']).toBe('no-store');

      const text = res.body as string;
      const data = JSON.parse(text);
      expect(data).toMatchObject({ format: 'english-coach-export', version: 1, user: { email: 'alice@example.com' } });
      expect(data.items).toHaveLength(4);
      expect(data.items[0].sources.length).toBeGreaterThan(0);
      expect(data.books[0].units[0].lessons).toHaveLength(1);
      expect(data.attempts).toHaveLength(answered);
      expect(data.attempts[0].exercise).toMatchObject({ format: expect.any(String) });
      expect(data.assessments).toHaveLength(1);
      expect(data.files).toEqual([expect.objectContaining({ originalName: 'notes.txt', sizeBytes: 13 })]);
      expect(data.counts).toMatchObject({ items: 4, attempts: answered, assessments: 1 });
      expect(data.gamification.totalXp).toBeGreaterThan(0);

      // Never the password, never the tokens, never someone else's data.
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('tokenHash');
      expect(text).not.toContain('bobsecret');
      expect(text).not.toContain('bob@example.com');
    });

    it('gives each learner only their own', async () => {
      const res = await bob.get(`${API}/me/export`).expect(200);
      const data = JSON.parse(res.text);
      expect(data.user.email).toBe('bob@example.com');
      expect(data.items.map((i: { headword: string }) => i.headword)).toEqual(['bobsecret']);
      expect(data.attempts).toEqual([]);
    });
  });

  describe('deleting the account', () => {
    it('needs the password: a wrong or missing one deletes nothing', async () => {
      await alice.delete(`${API}/me`).send({ password: 'not the password' }).expect(403);
      await alice.delete(`${API}/me`).send({}).expect(400);
      await alice.delete(`${API}/me`).expect(400);
      expect(await ctx.prisma.user.count({ where: { id: aliceId } })).toBe(1);
      expect(await ctx.prisma.learningItem.count({ where: { ownerId: aliceId } })).toBe(4);
    });

    it('removes the account and everything it owned, and signs the learner out', async () => {
      const res = await alice.delete(`${API}/me`).send({ password: PASSWORD }).expect(204);
      const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cleared).toMatch(/ec_at=;/);
      expect(cleared).toMatch(/ec_s=;/);

      expect(await ctx.prisma.user.count({ where: { id: aliceId } })).toBe(0);
      await alice.get(`${API}/auth/me`).expect(401);
      await (await import('supertest')).default(ctx.server).post(`${API}/auth/login`).send({ email: 'alice@example.com', password: PASSWORD }).expect(401);

      // Not one row left in any table that points at a learner: this also catches a table added later without a cascade.
      const columns = await ctx.prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name IN ('userId', 'ownerId') AND table_name <> 'User'`,
      );
      expect(columns.length).toBeGreaterThan(15);
      for (const { table_name, column_name } of columns) {
        const rows = await ctx.prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table_name}" WHERE "${column_name}" = $1::uuid`, aliceId);
        expect(Number(rows[0]!.n), `${table_name}.${column_name}`).toBe(0);
      }

      // The uploaded file is gone from the disk too.
      expect(existsSync(resolve(process.env['STORAGE_DIR']!, uploadedKey))).toBe(false);
    });

    it('leaves every other learner untouched', async () => {
      expect(await ctx.prisma.user.count({ where: { id: bobId } })).toBe(1);
      expect(await ctx.prisma.learningItem.count({ where: { ownerId: bobId } })).toBe(1);
      await bob.get(`${API}/auth/me`).expect(200);
    });
  });
});
