import { z } from 'zod';
import { ExerciseLevelSchema, SkillAreaSchema, type ExerciseLevel, type LearningStatus } from './enums.js';

/**
 * Exercise formats. Each one is defined once, here: what the learner sees (content), what only the
 * server knows (solution), and what the learner sends back (response). The API validates against
 * these, the web renderers are typed from them, and AI-generated exercises must fit them.
 */
export const EXERCISE_FORMATS = [
  'flashcard',
  'multiple_choice',
  'matching',
  'fill_blank',
  'irregular_verb_forms',
  'word_formation',
  'sentence_order',
  'listen_and_type',
  'translation_fa_en',
  'free_production',
  'transformation',
] as const;
export const ExerciseFormatSchema = z.enum(EXERCISE_FORMATS);
export type ExerciseFormat = z.infer<typeof ExerciseFormatSchema>;

/** Fixed list of error types, so repeated mistakes can be recognised (Mistake Bank, phase 4). */
export const ERROR_TYPES = {
  'GRAMMAR.TENSE_FORM': { labelEn: 'Verb tense', labelFa: 'زمان فعل' },
  'GRAMMAR.BACKSHIFT': { labelEn: 'Backshift in reported speech', labelFa: 'تغییر زمان در نقل‌قول غیرمستقیم' },
  'GRAMMAR.WORD_ORDER': { labelEn: 'Word order', labelFa: 'ترتیب کلمات' },
  'GRAMMAR.ARTICLE': { labelEn: 'Articles', labelFa: 'حروف تعریف' },
  'GRAMMAR.PREPOSITION': { labelEn: 'Prepositions', labelFa: 'حروف اضافه' },
  'GRAMMAR.AGREEMENT': { labelEn: 'Subject–verb agreement', labelFa: 'مطابقت فاعل و فعل' },
  'GRAMMAR.REPORTING_VERB': { labelEn: 'Reporting verbs (say / tell)', labelFa: 'فعل‌های گزارشی' },
  'VERB.V2_FORM': { labelEn: 'Past simple form (V2)', labelFa: 'شکل گذشته‌ی ساده (V2)' },
  'VERB.V3_FORM': { labelEn: 'Past participle form (V3)', labelFa: 'اسم مفعول (V3)' },
  'VERB.AUXILIARY': { labelEn: 'Auxiliary verbs', labelFa: 'فعل‌های کمکی' },
  'VOCAB.MEANING': { labelEn: 'Word meaning', labelFa: 'معنی کلمه' },
  'VOCAB.WRONG_COLLOCATE': { labelEn: 'Wrong word combination', labelFa: 'ترکیب نادرست کلمات' },
  'VOCAB.CONFUSABLE': { labelEn: 'Confused similar words', labelFa: 'اشتباه گرفتن کلمات مشابه' },
  'VOCAB.REGISTER': { labelEn: 'Formal vs informal', labelFa: 'رسمی یا غیررسمی' },
  'FORM.WRONG_SUFFIX': { labelEn: 'Wrong suffix', labelFa: 'پسوند نادرست' },
  'FORM.WRONG_POS': { labelEn: 'Wrong part of speech', labelFa: 'نقش دستوری نادرست' },
  'SPELLING.SPELLING': { labelEn: 'Spelling', labelFa: 'املا' },
  'LISTENING.MISHEARD': { labelEn: 'Misheard words', labelFa: 'اشتباه شنیدن کلمات' },
  'L1.PERSIAN_TRANSFER': { labelEn: 'Persian influence', labelFa: 'تأثیر ساختار فارسی' },
  'OTHER.OTHER': { labelEn: 'Other', labelFa: 'سایر' },
} as const;
export type ErrorTypeCode = keyof typeof ERROR_TYPES;
export const ERROR_TYPE_CODES = Object.keys(ERROR_TYPES) as [ErrorTypeCode, ...ErrorTypeCode[]];
export const ErrorTypeCodeSchema = z.enum(ERROR_TYPE_CODES);

// ───────────── Content, solution and response per format ─────────────

/** Every exercise says what to do, in a verb-first line, and how to do it. */
const guidance = {
  instruction: z.string().min(1).max(160),
  /** One line on how to answer ("Tap the correct meaning."). */
  helper: z.string().max(200).optional(),
};

const explanationFa = z.string().max(600).optional();
const answerList = z.array(z.string().min(1).max(200)).min(1).max(12);

export const FlashcardContentSchema = z.object({
  ...guidance,
  front: z.object({
    text: z.string().min(1).max(160),
    ipa: z.string().max(80).optional(),
    note: z.string().max(80).optional(),
  }),
  back: z.object({
    meaningFa: z.string().max(500).optional(),
    meaningEn: z.string().max(500).optional(),
    details: z.array(z.string().max(300)).max(6).default([]),
  }),
});

export const MultipleChoiceContentSchema = z.object({
  ...guidance,
  /** May contain a gap written as "___". */
  prompt: z.string().min(1).max(300),
  /** Persian shown under the prompt, when it helps. */
  promptFa: z.string().max(300).optional(),
  options: z
    .array(z.object({ id: z.string().min(1).max(8), text: z.string().min(1).max(200), rtl: z.boolean().optional() }))
    .min(3)
    .max(5),
});
export const MultipleChoiceSolutionSchema = z.object({
  correctOptionId: z.string(),
  explanationFa,
  /** Every wrong option maps to the error it represents, so a wrong pick says what kind of mistake it was. */
  distractorErrors: z.record(z.string(), ErrorTypeCodeSchema).default({}),
});

export const MatchingContentSchema = z.object({
  ...guidance,
  left: z.array(z.object({ id: z.string(), text: z.string().min(1).max(120) })).min(3).max(6),
  /** Shuffled by the server. */
  right: z.array(z.object({ id: z.string(), text: z.string().min(1).max(160), rtl: z.boolean().optional() })).min(3).max(6),
});
export const MatchingSolutionSchema = z.object({
  /** leftId -> rightId */
  pairs: z.record(z.string(), z.string()),
  /** leftId -> the learning item it stands for, so each item gets its own result. */
  itemByLeft: z.record(z.string(), z.string()).optional(),
  explanationFa,
});

export const FillBlankContentSchema = z.object({
  ...guidance,
  /** Contains exactly one "___". */
  sentence: z.string().min(3).max(300),
  sentenceFa: z.string().max(300).optional(),
  /** Shown in brackets after the gap, e.g. the base form: (negotiate). */
  hint: z.string().max(80).optional(),
});
export const FillBlankSolutionSchema = z.object({
  acceptedAnswers: answerList,
  explanationFa,
  errorCode: ErrorTypeCodeSchema.optional(),
});

export const IrregularVerbContentSchema = z.object({
  ...guidance,
  base: z.string().min(1).max(40),
  meaningFa: z.string().max(100).optional(),
});
export const IrregularVerbSolutionSchema = z.object({
  past: z.string().min(1),
  pastParticiple: z.string().min(1),
});

export const WordFormationContentSchema = z.object({
  ...guidance,
  base: z.string().min(1).max(60),
  targetPos: z.enum(['noun', 'verb', 'adjective', 'adverb']),
  /** Optional sentence with a gap, for the contextual version. */
  sentence: z.string().max(300).optional(),
});
export const WordFormationSolutionSchema = z.object({
  acceptedAnswers: answerList,
  explanationFa,
});

export const SentenceOrderContentSchema = z.object({
  ...guidance,
  /** Shuffled words; the learner puts them in order. */
  tokens: z.array(z.string().min(1).max(40)).min(3).max(14),
  translationFa: z.string().max(300).optional(),
});
export const SentenceOrderSolutionSchema = z.object({
  acceptedSentences: answerList,
  explanationFa,
});

export const ListenAndTypeContentSchema = z.object({
  ...guidance,
  /**
   * What the browser reads aloud. The device's own voice speaks it, so the text has to reach the browser;
   * it is never shown on the screen, but it is not a secret either.
   */
  audioText: z.string().min(1).max(200),
  /** Persian meaning shown beside the play button, so a single word is not ambiguous. */
  meaningFa: z.string().max(200).optional(),
});
export const ListenAndTypeSolutionSchema = z.object({
  acceptedAnswers: answerList,
  explanationFa,
});

export const TranslationContentSchema = z.object({
  ...guidance,
  promptFa: z.string().min(1).max(400),
});
export const FreeProductionContentSchema = z.object({
  ...guidance,
  prompt: z.string().min(1).max(300),
  targetWords: z.array(z.string().max(60)).max(6).default([]),
});
export const TransformationContentSchema = z.object({
  ...guidance,
  source: z.string().min(1).max(300),
  task: z.string().min(1).max(160),
});
export const OpenSolutionSchema = z.object({
  /** Model answers. Used for an instant match before the AI is asked. */
  referenceAnswers: z.array(z.string().min(1).max(300)).max(8).default([]),
  /** What a good answer must show, for the AI evaluator. */
  rubric: z.string().max(400).optional(),
  explanationFa,
});

export const RESPONSE_SCHEMAS = {
  flashcard: z.object({ rating: z.number().int().min(1).max(4) }),
  multiple_choice: z.object({ optionId: z.string().min(1).max(8) }),
  matching: z.object({ pairs: z.record(z.string(), z.string()) }),
  fill_blank: z.object({ answer: z.string().max(200) }),
  irregular_verb_forms: z.object({ past: z.string().max(60), pastParticiple: z.string().max(60) }),
  word_formation: z.object({ answer: z.string().max(100) }),
  sentence_order: z.object({ order: z.array(z.number().int().min(0).max(30)).max(30) }),
  listen_and_type: z.object({ answer: z.string().max(300) }),
  translation_fa_en: z.object({ answer: z.string().max(600) }),
  free_production: z.object({ answer: z.string().max(600) }),
  transformation: z.object({ answer: z.string().max(600) }),
} satisfies Record<ExerciseFormat, z.ZodType>;

export interface FormatSpec {
  content: z.ZodType;
  solution: z.ZodType;
  /** RULE = checked by code, instantly. AI = free text judged by the AI evaluator. */
  evaluation: 'RULE' | 'AI';
  estimatedSeconds: number;
  /** Levels this format normally appears at. */
  levels: ExerciseLevel[];
}

export const FORMAT_SPECS: Record<ExerciseFormat, FormatSpec> = {
  flashcard: {
    content: FlashcardContentSchema,
    solution: z.object({}),
    evaluation: 'RULE',
    estimatedSeconds: 12,
    levels: ['RECOGNITION'],
  },
  multiple_choice: {
    content: MultipleChoiceContentSchema,
    solution: MultipleChoiceSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 15,
    levels: ['RECOGNITION', 'RECALL', 'CONTEXT'],
  },
  matching: {
    content: MatchingContentSchema,
    solution: MatchingSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 35,
    levels: ['RECOGNITION'],
  },
  fill_blank: {
    content: FillBlankContentSchema,
    solution: FillBlankSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 25,
    levels: ['RECALL', 'CONTEXT'],
  },
  irregular_verb_forms: {
    content: IrregularVerbContentSchema,
    solution: IrregularVerbSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 20,
    levels: ['RECALL'],
  },
  word_formation: {
    content: WordFormationContentSchema,
    solution: WordFormationSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 20,
    levels: ['RECALL', 'CONTEXT'],
  },
  sentence_order: {
    content: SentenceOrderContentSchema,
    solution: SentenceOrderSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 30,
    levels: ['CONTEXT'],
  },
  listen_and_type: {
    content: ListenAndTypeContentSchema,
    solution: ListenAndTypeSolutionSchema,
    evaluation: 'RULE',
    estimatedSeconds: 25,
    levels: ['RECALL', 'CONTEXT'],
  },
  translation_fa_en: {
    content: TranslationContentSchema,
    solution: OpenSolutionSchema,
    evaluation: 'AI',
    estimatedSeconds: 60,
    levels: ['PRODUCTION'],
  },
  free_production: {
    content: FreeProductionContentSchema,
    solution: OpenSolutionSchema,
    evaluation: 'AI',
    estimatedSeconds: 75,
    levels: ['PRODUCTION'],
  },
  transformation: {
    content: TransformationContentSchema,
    solution: OpenSolutionSchema,
    evaluation: 'AI',
    estimatedSeconds: 45,
    levels: ['CONTEXT', 'PRODUCTION'],
  },
};

export type ContentOf = {
  flashcard: z.infer<typeof FlashcardContentSchema>;
  multiple_choice: z.infer<typeof MultipleChoiceContentSchema>;
  matching: z.infer<typeof MatchingContentSchema>;
  fill_blank: z.infer<typeof FillBlankContentSchema>;
  irregular_verb_forms: z.infer<typeof IrregularVerbContentSchema>;
  word_formation: z.infer<typeof WordFormationContentSchema>;
  sentence_order: z.infer<typeof SentenceOrderContentSchema>;
  listen_and_type: z.infer<typeof ListenAndTypeContentSchema>;
  translation_fa_en: z.infer<typeof TranslationContentSchema>;
  free_production: z.infer<typeof FreeProductionContentSchema>;
  transformation: z.infer<typeof TransformationContentSchema>;
};
export type SolutionOf = {
  flashcard: Record<string, never>;
  multiple_choice: z.infer<typeof MultipleChoiceSolutionSchema>;
  matching: z.infer<typeof MatchingSolutionSchema>;
  fill_blank: z.infer<typeof FillBlankSolutionSchema>;
  irregular_verb_forms: z.infer<typeof IrregularVerbSolutionSchema>;
  word_formation: z.infer<typeof WordFormationSolutionSchema>;
  sentence_order: z.infer<typeof SentenceOrderSolutionSchema>;
  listen_and_type: z.infer<typeof ListenAndTypeSolutionSchema>;
  translation_fa_en: z.infer<typeof OpenSolutionSchema>;
  free_production: z.infer<typeof OpenSolutionSchema>;
  transformation: z.infer<typeof OpenSolutionSchema>;
};
export type ResponseOf = { [F in ExerciseFormat]: z.infer<(typeof RESPONSE_SCHEMAS)[F]> };

/** Checks that content and solution belong together and are well formed (the quality gate's first step). */
export function parseExerciseParts(format: ExerciseFormat, content: unknown, solution: unknown) {
  const spec = FORMAT_SPECS[format];
  const c = spec.content.safeParse(content);
  if (!c.success) return { success: false as const, error: `content: ${c.error.issues[0]?.message ?? 'invalid'}` };
  const s = spec.solution.safeParse(solution);
  if (!s.success) return { success: false as const, error: `solution: ${s.error.issues[0]?.message ?? 'invalid'}` };
  return { success: true as const, content: c.data as unknown, solution: s.data as unknown };
}

// ───────────── Evaluation ─────────────

export const VERDICTS = ['correct', 'almost', 'wrong'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Evaluation {
  verdict: Verdict;
  /** 0..1 */
  score: number;
  isCorrect: boolean;
  errorCodes: ErrorTypeCode[];
  /** The right answer in words, for the feedback bar. Null for flashcards. */
  correctAnswerText: string | null;
  explanationFa: string | null;
  /** Format-specific detail the renderer uses to mark things right or wrong. */
  detail: Record<string, unknown>;
  /** True when a free-text answer could not be judged by rules and needs the AI evaluator. */
  needsAi: boolean;
}

// ───────────── API shapes ─────────────

export const ExerciseOriginSchema = z.enum(['TEACHER_ORIGINAL', 'TEACHER_DERIVED', 'AI_GENERATED', 'TEMPLATE']);
export type ExerciseOrigin = z.infer<typeof ExerciseOriginSchema>;

/** An exercise as the learner receives it: never contains the solution. */
export interface ClientExercise {
  id: string;
  format: ExerciseFormat;
  level: ExerciseLevel;
  skill: z.infer<typeof SkillAreaSchema>;
  origin: ExerciseOrigin;
  content: unknown;
  /** The learning items this exercise practises. */
  items: { id: string; headword: string }[];
  estimatedSeconds: number;
}

export const PRACTICE_SCOPES = ['current', 'all', 'lesson', 'unit', 'type', 'item', 'due', 'mistakes', 'weak'] as const;
export const PracticeRequestSchema = z
  .object({
    scope: z.enum(PRACTICE_SCOPES).default('current'),
    lessonId: z.uuid().optional(),
    unitId: z.uuid().optional(),
    itemId: z.uuid().optional(),
    type: z.enum(['VOCABULARY', 'COLLOCATION', 'GRAMMAR', 'EXPRESSION', 'WORD_FORMATION', 'IRREGULAR_VERB', 'WORD_DISTINCTION', 'SENTENCE_PATTERN', 'PRONUNCIATION']).optional(),
    count: z.number().int().min(3).max(20).default(10),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'lesson' && !v.lessonId) ctx.addIssue({ code: 'custom', path: ['lessonId'], message: 'Choose a lesson.' });
    if (v.scope === 'unit' && !v.unitId) ctx.addIssue({ code: 'custom', path: ['unitId'], message: 'Choose a unit.' });
    if (v.scope === 'item' && !v.itemId) ctx.addIssue({ code: 'custom', path: ['itemId'], message: 'Choose an item.' });
    if (v.scope === 'type' && !v.type) ctx.addIssue({ code: 'custom', path: ['type'], message: 'Choose a type.' });
  });
export type PracticeRequest = z.infer<typeof PracticeRequestSchema>;

export interface PracticeRun {
  exercises: ClientExercise[];
  /** What the run is built from, for the intro screen. */
  scopeLabel: string;
  itemCount: number;
}

export const AttemptRequestSchema = z.object({
  /** Generated by the browser, so a retried request cannot be counted twice. */
  clientAttemptId: z.uuid(),
  exerciseId: z.uuid(),
  response: z.unknown(),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  hintsUsed: z.number().int().min(0).max(10).default(0),
  /** Set when the answer belongs to a slot of the daily session. */
  sessionItemId: z.uuid().optional(),
});
export type AttemptRequest = z.infer<typeof AttemptRequestSchema>;

/** How an answer changed what the learner knows about one item. */
export interface ItemUpdate {
  itemId: string;
  status: LearningStatus;
  /** 0..1 */
  mastery: number;
  /** When the item is next due for review (ISO date), if scheduled. */
  due: string | null;
}

export interface AttemptResult {
  attemptId: string;
  verdict: Verdict;
  isCorrect: boolean;
  score: number;
  correctAnswerText: string | null;
  explanationFa: string | null;
  errorCodes: ErrorTypeCode[];
  detail: Record<string, unknown>;
  /** XP earned by this answer. */
  xp: number;
  itemUpdates: ItemUpdate[];
}
