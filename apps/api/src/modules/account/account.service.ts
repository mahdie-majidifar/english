import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { forbidden, notFound } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StorageService } from '../../core/storage/storage.service.js';

export const EXPORT_FORMAT = 'english-coach-export';
export const EXPORT_VERSION = 1;

/** Rows per database read while exporting, so a learner with years of answers never fills the server's memory. */
const PAGE = 2000;

/** Walks a large table page by page (by `id`), so the export can stream. */
async function* pages<T extends { id: string }>(read: (after: string | undefined) => Promise<T[]>): AsyncGenerator<T[]> {
  let after: string | undefined;
  for (;;) {
    const rows = await read(after);
    if (rows.length === 0) return;
    yield rows;
    after = rows[rows.length - 1]!.id;
    if (rows.length < PAGE) return;
  }
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Everything the learner owns, as one JSON document, in pieces: the caller writes each piece to the
   * response as it comes. Left out on purpose: the password hash and sign-in tokens, the built-in exercise pool
   * (it is rebuilt from the items), the bytes of uploaded files (their names and sizes are listed) and the AI usage log.
   */
  async *exportChunks(userId: string): AsyncGenerator<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, role: true, timezone: true, createdAt: true },
    });
    if (!user) throw notFound('Account not found.');

    let first = true;
    const key = (name: string) => {
      const prefix = first ? '' : ',';
      first = false;
      return `${prefix}${JSON.stringify(name)}:`;
    };
    const section = (name: string, value: unknown) => `${key(name)}${JSON.stringify(value)}`;
    const counts: Record<string, number> = {};

    /** A large table, written as a JSON array a page at a time. */
    async function* table<T extends { id: string }>(name: string, read: (after: string | undefined) => Promise<T[]>): AsyncGenerator<string> {
      let count = 0;
      yield `${key(name)}[`;
      for await (const rows of pages(read)) {
        yield (count > 0 ? ',' : '') + rows.map((r) => JSON.stringify(r)).join(',');
        count += rows.length;
      }
      yield ']';
      counts[name] = count;
    }
    const cursor = (after: string | undefined): { cursor?: { id: string }; skip?: number } => (after ? { cursor: { id: after }, skip: 1 } : {});
    const p = this.prisma;

    yield '{';
    yield section('format', EXPORT_FORMAT);
    yield section('version', EXPORT_VERSION);
    yield section('exportedAt', new Date().toISOString());
    yield section('notes', [
      'Passwords and sign-in tokens are never included.',
      'The built-in exercise pool is not included: it is rebuilt from your items. Every answer carries the exercise it answered.',
      'Uploaded files are listed (name, type, size) but their contents are not included.',
    ]);
    yield section('user', user);
    yield section('profile', await p.userProfile.findUnique({ where: { userId } }));
    yield section('gamification', await p.userGamification.findUnique({ where: { userId } }));
    yield section('achievements', await p.userAchievement.findMany({ where: { userId } }));
    yield section('dailyActivity', await p.dailyActivity.findMany({ where: { userId }, orderBy: { localDate: 'asc' } }));
    yield section('books', await p.book.findMany({ where: { ownerId: userId }, include: { units: { include: { lessons: true } } } }));
    yield section('enrollments', await p.enrollment.findMany({ where: { userId } }));

    yield* table('items', (after) =>
      p.learningItem.findMany({
        where: { ownerId: userId },
        include: { sources: true, explanation: true },
        orderBy: { id: 'asc' },
        take: PAGE,
        ...cursor(after),
      }),
    );
    // Keyed by item, so it pages by `itemId`.
    yield* table('itemStates', async (after) =>
      (
        await p.userItemState.findMany({
          where: { userId },
          orderBy: { itemId: 'asc' },
          take: PAGE,
          ...(after ? { cursor: { userId_itemId: { userId, itemId: after } }, skip: 1 } : {}),
        })
      ).map((s) => ({ ...s, id: s.itemId })),
    );
    yield* table('mistakes', (after) =>
      p.mistake.findMany({ where: { userId }, include: { occurrenceLog: true }, orderBy: { id: 'asc' }, take: PAGE, ...cursor(after) }),
    );
    yield* table('attempts', (after) =>
      p.exerciseAttempt.findMany({
        where: { userId },
        include: {
          items: true,
          exercise: { select: { format: true, level: true, skill: true, content: true, solution: true } },
        },
        orderBy: { id: 'asc' },
        take: PAGE,
        ...cursor(after),
      }),
    );
    yield* table('reviewLog', (after) => p.reviewLog.findMany({ where: { userId }, orderBy: { id: 'asc' }, take: PAGE, ...cursor(after) }));
    yield* table('xpEvents', (after) => p.xpEvent.findMany({ where: { userId }, orderBy: { id: 'asc' }, take: PAGE, ...cursor(after) }));
    yield* table('dailySessions', (after) =>
      p.dailySession.findMany({ where: { userId }, include: { items: true }, orderBy: { id: 'asc' }, take: PAGE, ...cursor(after) }),
    );
    yield* table('assessments', (after) =>
      p.assessment.findMany({ where: { userId }, include: { questions: true }, orderBy: { id: 'asc' }, take: PAGE, ...cursor(after) }),
    );
    yield section('teacherSessions', await p.teacherSession.findMany({ where: { userId } }));
    yield section('teacherMaterials', await p.teacherMaterial.findMany({ where: { userId } }));
    yield section('teacherExercises', await p.teacherExercise.findMany({ where: { userId } }));
    yield section(
      'files',
      await p.storedFile.findMany({ where: { userId }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } }),
    );
    yield section('counts', counts);
    yield '}';
  }

  /** Throws unless this is the account's password. Used before anything that cannot be undone. */
  async checkPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const ok = user ? await argon2.verify(user.passwordHash, password).catch(() => false) : false;
    // 403, not 401: the learner is signed in, so the browser must not try to refresh the session and ask again.
    if (!ok) throw forbidden('That password is not correct.');
  }

  /**
   * Deletes the account and everything that hangs off it: rows (the database cascades from the user), the
   * AI usage log (it keeps a user id but no link), and the uploaded files on disk.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiRun.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    // After the rows are gone, so a failure here can never leave a half-deleted account.
    await this.storage.removeUserFiles(userId).catch(() => undefined);
  }
}
