import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { normalizeKey } from '@coach/domain';
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  draftItemPayload,
  draftItemProblem,
  parseItemPayload,
  type CommitMaterial,
  type CommitResult,
  type CreateTeacherSession,
  type CreateTextMaterial,
  type DraftItem,
  type DraftItemDto,
  type IngestionStatus,
  type MaterialCategory,
  type MaterialDto,
  type ParsedMaterial,
  type TeacherSessionDetail,
  type TeacherSessionSummary,
} from '@coach/contracts';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StorageService } from '../../core/storage/storage.service.js';
import { Prisma, type TeacherMaterial } from '../../generated/prisma/client.js';

export interface UploadedFileLike {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const conflict = (detail: string) => new DomainError('CONFLICT', 409, detail);
const invalid = (detail: string) => new DomainError('VALIDATION_FAILED', 400, detail);

const sessionLessonSelect = { select: { id: true, code: true, title: true } } as const;

/** What a learner would recognise: strip folders and control characters, keep it short. */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[\u0000-\u001f"<>|?*]/g, '').trim().slice(0, 150) || 'file';
}

@Injectable()
export class TeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ───────────── Sessions ─────────────

  async createSession(userId: string, dto: CreateTeacherSession): Promise<TeacherSessionSummary> {
    if (dto.lessonId) await this.assertLessonOwned(userId, dto.lessonId);
    const session = await this.prisma.teacherSession.create({
      data: {
        userId,
        title: dto.title,
        classDate: new Date(`${dto.classDate}T00:00:00Z`),
        lessonId: dto.lessonId ?? null,
      },
      include: { lesson: sessionLessonSelect },
    });
    return this.toSummary(session, 0, 0, null);
  }

  async listSessions(userId: string): Promise<TeacherSessionSummary[]> {
    const sessions = await this.prisma.teacherSession.findMany({
      where: { userId },
      orderBy: [{ classDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        lesson: sessionLessonSelect,
        materials: { select: { status: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    const itemCounts = await this.itemCounts(sessions.map((s) => s.id));
    return sessions.map((s) =>
      this.toSummary(s, s.materials.length, itemCounts.get(s.id) ?? 0, s.materials[0]?.status ?? null),
    );
  }

  async getSession(userId: string, sessionId: string): Promise<TeacherSessionDetail> {
    const session = await this.prisma.teacherSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        lesson: sessionLessonSelect,
        materials: {
          orderBy: { createdAt: 'desc' },
          include: { file: { select: { originalName: true } } },
        },
      },
    });
    if (!session) throw notFound('Class session not found.');
    const itemCounts = await this.itemCounts([session.id]);
    const summary = this.toSummary(session, session.materials.length, itemCounts.get(session.id) ?? 0, null);
    const { latestStatus: _omit, ...rest } = summary;
    return {
      ...rest,
      materials: session.materials.map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        status: m.status,
        errorMessage: m.errorMessage,
        fileName: m.file?.originalName ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const found = await this.prisma.teacherSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!found) throw notFound('Class session not found.');
    // Materials, their exercises and the session links cascade. Library items remain.
    await this.prisma.teacherSession.delete({ where: { id: sessionId } });
  }

  // ───────────── Materials ─────────────

  async addTextMaterial(userId: string, sessionId: string, dto: CreateTextMaterial): Promise<MaterialDto> {
    await this.assertSessionOwned(userId, sessionId);
    const firstLine = dto.text.split('\n').find((l) => l.trim())?.trim().slice(0, 60);
    const material = await this.prisma.teacherMaterial.create({
      data: {
        userId,
        sessionId,
        category: dto.category,
        title: dto.title || firstLine || 'Class notes',
        rawText: dto.text,
      },
    });
    return this.toDto(material, null, null);
  }

  async addFileMaterial(
    userId: string,
    sessionId: string,
    file: UploadedFileLike | undefined,
    meta: { category: MaterialCategory; title?: string },
  ): Promise<MaterialDto> {
    await this.assertSessionOwned(userId, sessionId);
    if (!file) throw invalid('Choose a file to upload.');
    if (file.size === 0) throw invalid('The file is empty.');
    if (file.size > MAX_UPLOAD_BYTES) throw invalid('The file is too large. The limit is 15 MB.');

    const mimeType = await this.detectType(file.buffer);
    const extension = ALLOWED_UPLOAD_TYPES[mimeType as keyof typeof ALLOWED_UPLOAD_TYPES];
    const originalName = safeFileName(file.originalname);

    const storageKey = await this.storage.put(userId, file.buffer, extension);
    try {
      const stored = await this.prisma.storedFile.create({
        data: {
          userId,
          storageKey,
          originalName,
          mimeType,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
        },
      });
      const material = await this.prisma.teacherMaterial.create({
        data: {
          userId,
          sessionId,
          category: meta.category,
          title: meta.title || originalName,
          fileId: stored.id,
        },
        include: { file: true },
      });
      return this.toDto(material, null, material.file);
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async getMaterial(userId: string, materialId: string): Promise<MaterialDto> {
    const material = await this.prisma.teacherMaterial.findFirst({
      where: { id: materialId, userId },
      include: { file: true },
    });
    if (!material) throw notFound('Material not found.');

    const proposal = (material.proposal ?? null) as ParsedMaterial | null;
    const draft =
      proposal && material.status === 'AWAITING_REVIEW'
        ? {
            summary: proposal.summary,
            items: await this.annotateKnown(userId, proposal.items),
            exercises: proposal.exercises,
          }
        : null;
    return this.toDto(material, draft, material.file);
  }

  async reparse(userId: string, materialId: string): Promise<MaterialDto> {
    const material = await this.requireMaterial(userId, materialId);
    if (!(['FAILED', 'AWAITING_REVIEW'] as IngestionStatus[]).includes(material.status)) {
      throw conflict('This material cannot be analysed again right now.');
    }
    const updated = await this.prisma.teacherMaterial.update({
      where: { id: materialId },
      data: { status: 'UPLOADED', errorMessage: null, lockedAt: null },
      include: { file: true },
    });
    return this.toDto(updated, null, updated.file);
  }

  async discard(userId: string, materialId: string): Promise<void> {
    const material = await this.requireMaterial(userId, materialId);
    if (material.status === 'COMMITTED') throw conflict('This material was already saved to your library.');
    await this.prisma.teacherMaterial.update({
      where: { id: materialId },
      data: { status: 'DISCARDED', proposal: Prisma.DbNull },
    });
  }

  async openFile(
    userId: string,
    materialId: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const material = await this.prisma.teacherMaterial.findFirst({
      where: { id: materialId, userId },
      include: { file: true },
    });
    if (!material?.file) throw notFound('No file for this material.');
    return {
      stream: this.storage.stream(material.file.storageKey),
      fileName: material.file.originalName,
      mimeType: material.file.mimeType,
    };
  }

  // ───────────── Commit ─────────────

  /**
   * Saves what the learner confirmed. AI output only becomes learning content here, and never
   * replaces anything: existing items are merged into, not overwritten.
   */
  async commit(userId: string, materialId: string, dto: CommitMaterial): Promise<CommitResult> {
    const material = await this.requireMaterial(userId, materialId);
    if (material.status !== 'AWAITING_REVIEW') throw conflict('This material is not waiting for review.');

    const session = material.sessionId
      ? await this.prisma.teacherSession.findFirst({
          where: { id: material.sessionId, userId },
          select: { id: true, lessonId: true },
        })
      : null;

    return this.prisma.$transaction(async (tx) => {
      const result: CommitResult = { created: 0, merged: 0, skipped: [], exercises: 0 };

      for (const draft of dto.items) {
        const problem = draftItemProblem(draft);
        if (problem) {
          result.skipped.push({ headword: draft.headword, reason: problem });
          continue;
        }
        const payload = parseItemPayload(draft.type, draftItemPayload(draft));
        if (!payload.success) {
          result.skipped.push({ headword: draft.headword, reason: 'Some details are missing' });
          continue;
        }

        const normalizedKey = normalizeKey(draft.headword);
        const existing = await tx.learningItem.findUnique({
          where: { ownerId_type_normalizedKey: { ownerId: userId, type: draft.type, normalizedKey } },
        });

        let itemId: string;
        if (existing && !existing.archivedAt) {
          // Already known: keep what the learner has, only fill gaps.
          await tx.learningItem.update({
            where: { id: existing.id },
            data: {
              ...(existing.meaningEn ? {} : { meaningEn: draft.meaningEn || null }),
              ...(existing.meaningFa ? {} : { meaningFa: draft.meaningFa || null }),
            },
          });
          itemId = existing.id;
          result.merged++;
        } else if (existing) {
          await tx.learningItem.update({
            where: { id: existing.id },
            data: {
              headword: draft.headword,
              meaningEn: draft.meaningEn || null,
              meaningFa: draft.meaningFa || null,
              payload: payload.data as Prisma.InputJsonObject,
              source: 'TEACHER',
              archivedAt: null,
            },
          });
          itemId = existing.id;
          result.created++;
        } else {
          const created = await tx.learningItem.create({
            data: {
              ownerId: userId,
              type: draft.type,
              headword: draft.headword,
              normalizedKey,
              meaningEn: draft.meaningEn || null,
              meaningFa: draft.meaningFa || null,
              payload: payload.data as Prisma.InputJsonObject,
              source: 'TEACHER',
            },
          });
          itemId = created.id;
          result.created++;
        }

        // Link to the class (and its lesson). Re-committing the same item is harmless.
        const links: Prisma.LearningItemSourceCreateManyInput[] = [];
        if (session) links.push({ itemId, teacherSessionId: session.id });
        if (session?.lessonId) links.push({ itemId, lessonId: session.lessonId });
        if (links.length) await tx.learningItemSource.createMany({ data: links, skipDuplicates: true });
      }

      if (dto.exercises.length > 0) {
        await tx.teacherExercise.createMany({
          data: dto.exercises.map((e) => ({
            userId,
            materialId,
            sessionId: material.sessionId,
            originalText: e.originalText,
            skill: e.skill,
            topic: e.topic,
          })),
        });
        result.exercises = dto.exercises.length;
      }

      await tx.teacherMaterial.update({ where: { id: materialId }, data: { status: 'COMMITTED' } });
      return result;
    });
  }

  // ───────────── Helpers ─────────────

  /** The real type comes from the file's bytes, never from its name or the browser's claim. */
  private async detectType(buffer: Buffer): Promise<string> {
    const detected = await fileTypeFromBuffer(buffer);
    if (detected && detected.mime in ALLOWED_UPLOAD_TYPES) return detected.mime;
    if (detected) throw invalid('This file type is not supported. Use PDF, Word (.docx), an image, or plain text.');

    // file-type has no signature for plain text: accept it only if it really is clean UTF-8 text.
    const sample = buffer.subarray(0, 8192);
    const looksBinary = sample.includes(0);
    const roundTrips = Buffer.from(sample.toString('utf8'), 'utf8').length === sample.length;
    if (!looksBinary && roundTrips) return 'text/plain';
    throw invalid('This file type is not supported. Use PDF, Word (.docx), an image, or plain text.');
  }

  private async annotateKnown(userId: string, items: DraftItem[]): Promise<DraftItemDto[]> {
    if (items.length === 0) return [];
    const keys = items.map((i) => ({ type: i.type, normalizedKey: normalizeKey(i.headword) }));
    const existing = await this.prisma.learningItem.findMany({
      where: { ownerId: userId, archivedAt: null, OR: keys },
      select: { type: true, normalizedKey: true },
    });
    const known = new Set(existing.map((e) => `${e.type}:${e.normalizedKey}`));
    return items.map((i) => ({ ...i, known: known.has(`${i.type}:${normalizeKey(i.headword)}`) }));
  }

  private async itemCounts(sessionIds: string[]): Promise<Map<string, number>> {
    if (sessionIds.length === 0) return new Map();
    const rows = await this.prisma.learningItemSource.groupBy({
      by: ['teacherSessionId'],
      where: { teacherSessionId: { in: sessionIds }, item: { archivedAt: null } },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((r) => (r.teacherSessionId ? [[r.teacherSessionId, r._count._all] as const] : [])));
  }

  private toSummary(
    s: {
      id: string;
      title: string;
      classDate: Date;
      lesson: { id: string; code: string; title: string } | null;
    },
    materialCount: number,
    itemCount: number,
    latestStatus: IngestionStatus | null,
  ): TeacherSessionSummary {
    return {
      id: s.id,
      title: s.title,
      classDate: s.classDate.toISOString().slice(0, 10),
      lesson: s.lesson,
      materialCount,
      itemCount,
      latestStatus,
    };
  }

  private toDto(
    m: TeacherMaterial,
    draft: MaterialDto['draft'],
    file: { originalName: string; mimeType: string } | null,
  ): MaterialDto {
    return {
      id: m.id,
      sessionId: m.sessionId,
      title: m.title,
      category: m.category,
      status: m.status,
      errorMessage: m.errorMessage,
      fileName: file?.originalName ?? null,
      mimeType: file?.mimeType ?? null,
      originalText: m.rawText ?? m.extractedText,
      createdAt: m.createdAt.toISOString(),
      draft,
    };
  }

  private async requireMaterial(userId: string, materialId: string): Promise<TeacherMaterial> {
    const material = await this.prisma.teacherMaterial.findFirst({ where: { id: materialId, userId } });
    if (!material) throw notFound('Material not found.');
    return material;
  }

  private async assertSessionOwned(userId: string, sessionId: string): Promise<void> {
    const found = await this.prisma.teacherSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!found) throw notFound('Class session not found.');
  }

  private async assertLessonOwned(userId: string, lessonId: string): Promise<void> {
    const found = await this.prisma.lesson.findFirst({
      where: { id: lessonId, unit: { book: { ownerId: userId } } },
      select: { id: true },
    });
    if (!found) throw notFound('Lesson not found.');
  }
}
