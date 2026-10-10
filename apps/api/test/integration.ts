import 'reflect-metadata';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { inject } from 'vitest';
import type { LlmProvider } from '../src/modules/ai/llm.js';

export const API = '/api/v1';
export const PASSWORD = 'integration-test-password';

export const testDatabaseUrl = (): string => inject('testDatabaseUrl');
export const hasDatabase = (): boolean => testDatabaseUrl() !== '';

export interface TestContext {
  app: INestApplication;
  server: ReturnType<INestApplication['getHttpServer']>;
  prisma: import('../src/core/prisma/prisma.service.js').PrismaService;
}

/** Boots the real application (real guards, real Prisma) against the throwaway test database. */
export async function createIntegrationApp(options: { llm?: LlmProvider } = {}): Promise<TestContext> {
  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = testDatabaseUrl();
  process.env['JWT_ACCESS_SECRET'] = 'integration-secret-integration-secret-123456';
  process.env['WEB_ORIGIN'] = 'http://localhost:3000';
  process.env['DISABLE_THROTTLE'] = '1';
  // Uploaded files go to a temp folder, never into the project's storage directory.
  process.env['STORAGE_DIR'] = join(tmpdir(), `coach-test-storage-${process.pid}`);

  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');
  const { PrismaService } = await import('../src/core/prisma/prisma.service.js');
  const { LLM_PROVIDER } = await import('../src/modules/ai/llm.js');

  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.llm) builder.overrideProvider(LLM_PROVIDER).useValue(options.llm);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, server: app.getHttpServer(), prisma: app.get(PrismaService) };
}

/** Wipes all learner data between suites. Cascades from User cover everything. */
export async function resetDatabase(ctx: TestContext): Promise<void> {
  await ctx.prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
}

/** Creates a user directly in the database and returns a logged-in supertest agent (easy difficulty unless told otherwise). */
export async function signedInAgent(ctx: TestContext, email: string, options: { difficulty?: 'EASY' | 'STANDARD' | 'CHALLENGING' } = {}) {
  await ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(PASSWORD),
      displayName: email.split('@')[0]!,
      // The older suites test the basic mechanics (flashcards, three right answers to move up), which
      // is the easy setting. Difficulty has its own suite.
      profile: { create: { difficulty: options.difficulty ?? 'EASY' } },
    },
  });
  const agent = request.agent(ctx.server);
  await agent.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(200);
  return agent;
}
