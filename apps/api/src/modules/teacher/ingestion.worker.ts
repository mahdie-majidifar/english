import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { MaterialCategory } from '@coach/contracts';
import { DomainError } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StorageService } from '../../core/storage/storage.service.js';
import { ContentParserService } from '../ai/content-parser.service.js';
import { ExtractionError, ExtractionService, type Extracted } from './extraction.service.js';

const POLL_MS = 2_000;
/** A material still "in progress" after this long was orphaned by a crash and is retried. */
const STALE_AFTER_MS = 5 * 60_000;

/**
 * Turns uploaded material into a reviewable proposal, in the background:
 *   UPLOADED -> EXTRACTING -> PARSING -> AWAITING_REVIEW (or FAILED)
 * The queue is the database itself (status column + row locks), so it survives restarts and
 * needs no extra service. Originals are only ever read here, never changed.
 */
@Injectable()
export class IngestionWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Ingestion');
  private timer?: NodeJS.Timeout;
  private busy: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extraction: ExtractionService,
    private readonly parser: ContentParserService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Tests drive the worker by hand so they stay deterministic.
    if (process.env['NODE_ENV'] === 'test') return;
    await this.recoverStale();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.busy;
  }

  /** Processes everything waiting. Safe to call concurrently: only one run at a time. */
  tick(): Promise<void> {
    this.busy ??= this.drain().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  async recoverStale(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const result = await this.prisma.teacherMaterial.updateMany({
      where: { status: { in: ['EXTRACTING', 'PARSING'] }, lockedAt: { lt: cutoff } },
      data: { status: 'UPLOADED', lockedAt: null },
    });
    if (result.count > 0) this.logger.warn(`Re-queued ${result.count} stalled material(s).`);
    return result.count;
  }

  private async drain(): Promise<void> {
    for (;;) {
      const id = await this.claimNext();
      if (!id) return;
      await this.process(id);
    }
  }

  /** Atomically takes the oldest waiting material; concurrent workers can never take the same one. */
  private async claimNext(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "TeacherMaterial"
      SET status = 'EXTRACTING'::"IngestionStatus", "lockedAt" = now(), "updatedAt" = now()
      WHERE id = (
        SELECT id FROM "TeacherMaterial"
        WHERE status = 'UPLOADED'::"IngestionStatus"
        ORDER BY "createdAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  private async process(id: string): Promise<void> {
    const material = await this.prisma.teacherMaterial.findUnique({ where: { id }, include: { file: true } });
    if (!material) return;

    try {
      let extracted: Extracted;
      if (material.rawText) {
        extracted = { text: material.rawText };
      } else if (material.file) {
        const buffer = await this.readFile(material.file.storageKey);
        extracted = await this.extraction.extract(material.file.mimeType, buffer);
        if (extracted.text) {
          await this.prisma.teacherMaterial.update({ where: { id }, data: { extractedText: extracted.text } });
        }
      } else {
        throw new ExtractionError('There is nothing to read in this material.');
      }

      await this.prisma.teacherMaterial.update({ where: { id }, data: { status: 'PARSING', lockedAt: new Date() } });

      const { proposal, runId } = await this.parser.parse(material.userId, {
        category: material.category as MaterialCategory,
        text: extracted.text,
        image: extracted.image,
      });

      await this.prisma.teacherMaterial.update({
        where: { id },
        data: {
          status: 'AWAITING_REVIEW',
          proposal: proposal as object,
          aiRunId: runId,
          errorMessage: null,
          lockedAt: null,
        },
      });
    } catch (error) {
      const message = this.friendlyMessage(error);
      if (!(error instanceof DomainError) && !(error instanceof ExtractionError)) {
        this.logger.error(`Material ${id} failed`, error instanceof Error ? error.stack : String(error));
      }
      await this.prisma.teacherMaterial.update({
        where: { id },
        data: { status: 'FAILED', errorMessage: message, lockedAt: null },
      });
    }
  }

  private friendlyMessage(error: unknown): string {
    if (error instanceof ExtractionError) return error.message;
    if (error instanceof DomainError) return error.detail ?? 'The analysis failed.';
    return 'Something went wrong while reading this material. You can try again.';
  }

  private async readFile(key: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.storage.stream(key)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
}
