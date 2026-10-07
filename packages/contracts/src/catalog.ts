import { z } from 'zod';
import { CefrLevelSchema } from './profile.js';

const title = (max: number) => z.string().trim().min(1, 'Required').max(max);
const blankToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const CreateBookSchema = z.object({
  series: title(80).default('American English File'),
  title: title(120),
  levelNumber: z.number().int().min(0).max(20).nullable().optional(),
  cefr: CefrLevelSchema.nullable().optional(),
});
export type CreateBook = z.infer<typeof CreateBookSchema>;

export const UpdateBookSchema = CreateBookSchema.partial().strict();
export type UpdateBook = z.infer<typeof UpdateBookSchema>;

export const CreateUnitSchema = z.object({
  number: z.number().int().min(0).max(99),
  title: blankToNull(120).optional(),
});
export type CreateUnit = z.infer<typeof CreateUnitSchema>;
export const UpdateUnitSchema = CreateUnitSchema.partial().strict();
export type UpdateUnit = z.infer<typeof UpdateUnitSchema>;

export const CreateLessonSchema = z.object({
  /** "8B" */
  code: title(8),
  /** "Business" */
  title: title(120),
});
export type CreateLesson = z.infer<typeof CreateLessonSchema>;
export const UpdateLessonSchema = CreateLessonSchema.partial().strict();
export type UpdateLesson = z.infer<typeof UpdateLessonSchema>;

/** Paste a table of contents: one line per lesson ("8B Business"), optionally "Unit 8 ..." lines. */
export const ImportStructureSchema = z.object({ text: z.string().trim().min(1).max(20_000) });
export type ImportStructure = z.infer<typeof ImportStructureSchema>;

export const SetCurrentLessonSchema = z.object({ lessonId: z.uuid() });
export type SetCurrentLesson = z.infer<typeof SetCurrentLessonSchema>;

export interface LessonDto {
  id: string;
  code: string;
  title: string;
  itemCount: number;
  isCurrent: boolean;
}

export interface UnitDto {
  id: string;
  number: number;
  title: string | null;
  lessons: LessonDto[];
}

export interface BookSummary {
  id: string;
  series: string;
  title: string;
  levelNumber: number | null;
  cefr: string | null;
  unitCount: number;
  lessonCount: number;
  itemCount: number;
  /** True when the learner is currently studying this book. */
  isCurrent: boolean;
}

export interface BookDetail extends Omit<BookSummary, 'unitCount' | 'lessonCount'> {
  units: UnitDto[];
}

export interface CurrentContext {
  book: { id: string; title: string };
  unit: { id: string; number: number; title: string | null };
  lesson: { id: string; code: string; title: string };
  itemCount: number;
}

export interface ImportStructureResult {
  unitsCreated: number;
  lessonsCreated: number;
  lessonsSkipped: number;
  /** Lines that could not be understood, so the UI can show them. */
  rejected: string[];
}
