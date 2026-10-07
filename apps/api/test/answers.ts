import type { ContentOf, ExerciseFormat, SolutionOf } from '@coach/contracts';
import type { PrismaService } from '../src/core/prisma/prisma.service.js';

/** The exercise as stored: the learner-facing content plus the answer key. For tests only. */
export async function keyOf(prisma: PrismaService, exerciseId: string) {
  const row = await prisma.exercise.findUniqueOrThrow({ where: { id: exerciseId } });
  return { format: row.format as ExerciseFormat, content: row.content as never, solution: row.solution as never };
}

/** Builds a right (or a wrong) response for an exercise, using the answer key. */
export async function answerFor(prisma: PrismaService, exerciseId: string, right: boolean): Promise<unknown> {
  const { format, content, solution } = await keyOf(prisma, exerciseId);
  switch (format) {
    case 'flashcard':
      return { rating: right ? 3 : 1 };
    case 'multiple_choice': {
      const s = solution as SolutionOf['multiple_choice'];
      const c = content as ContentOf['multiple_choice'];
      return { optionId: right ? s.correctOptionId : c.options.find((o) => o.id !== s.correctOptionId)!.id };
    }
    case 'matching': {
      const s = solution as SolutionOf['matching'];
      if (right) return { pairs: s.pairs };
      const [a, b] = Object.keys(s.pairs);
      return { pairs: { ...s.pairs, [a!]: s.pairs[b!]!, [b!]: s.pairs[a!]! } };
    }
    case 'fill_blank':
      return { answer: right ? (solution as SolutionOf['fill_blank']).acceptedAnswers[0] : 'zzzz' };
    case 'irregular_verb_forms': {
      const s = solution as SolutionOf['irregular_verb_forms'];
      return right ? { past: s.past, pastParticiple: s.pastParticiple } : { past: s.past, pastParticiple: 'xxxxx' };
    }
    case 'word_formation':
      return { answer: right ? (solution as SolutionOf['word_formation']).acceptedAnswers[0] : 'failment' };
    case 'sentence_order': {
      const tokens = (content as ContentOf['sentence_order']).tokens;
      const target = (solution as SolutionOf['sentence_order']).acceptedSentences[0]!.replace(/[.!?]+$/, '').split(/\s+/);
      const used = new Set<number>();
      const order = target.map((w) => {
        const i = tokens.findIndex((t, idx) => t === w && !used.has(idx));
        used.add(i);
        return i;
      });
      return { order: right ? order : [...order].reverse() };
    }
    default:
      return { answer: right ? ((solution as SolutionOf['transformation']).referenceAnswers[0] ?? 'ok') : 'wrong answer' };
  }
}
