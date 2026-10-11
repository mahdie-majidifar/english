import type { ContentOf, ExerciseFormat } from '@coach/contracts';
import { FillBlank } from './renderers/fill-blank';
import { Flashcard } from './renderers/flashcard';
import { IrregularForms } from './renderers/irregular-forms';
import { ListenAndType } from './renderers/listen-and-type';
import { Matching } from './renderers/matching';
import { MultipleChoice } from './renderers/multiple-choice';
import { OpenText } from './renderers/open-text';
import { SentenceOrder } from './renderers/sentence-order';
import type { FormatRegistry } from './renderers/types';
import { WordFormation } from './renderers/word-formation';

const text = (v: { answer: string }) => v.answer.trim().length > 0;

/**
 * One entry per exercise format: how it looks, what an empty answer is, when the answer can be
 * checked, and the short "how this works" steps. Adding a format means adding a row here.
 */
export const FORMAT_UI: FormatRegistry = {
  flashcard: {
    Component: Flashcard,
    initial: () => ({ rating: 0 }),
    isReady: () => false,
    notReadyLabel: 'Flip the card, then rate it',
    autoSubmit: true,
    howTo: {
      title: 'Flashcards',
      steps: ['Look at the word and try to recall its meaning.', 'Tap the card to flip it and check yourself.', 'Rate how well you knew it. Honest ratings make your reviews smarter.'],
    },
  },
  multiple_choice: {
    Component: MultipleChoice,
    initial: () => ({ optionId: '' }),
    isReady: (v: { optionId: string }) => v.optionId !== '',
    notReadyLabel: 'Select an answer',
    howTo: {
      title: 'Multiple choice',
      steps: ['Read the question. A gap shows where the answer goes.', 'Tap the answer you think is right (or press 1, 2, 3).', 'Press Check to see if you got it.'],
    },
  },
  matching: {
    Component: Matching,
    initial: () => ({ pairs: {} }),
    isReady: (v: { pairs: Record<string, string> }, c: ContentOf['matching']) => Object.keys(v.pairs).length === c.left.length,
    notReadyLabel: 'Match every word',
    howTo: {
      title: 'Matching',
      steps: ['Tap a word on the left. It lights up.', 'Tap its meaning on the right. The pair gets a colour.', 'Tap a matched word to undo it. Press Check when all are matched.'],
    },
  },
  fill_blank: {
    Component: FillBlank,
    initial: () => ({ answer: '' }),
    isReady: text,
    notReadyLabel: 'Type your answer',
    howTo: {
      title: 'Fill in the blank',
      steps: ['Read the sentence. The empty box is the gap.', 'Type the missing word right in the box. A word in brackets is the base form.', 'Press Enter or Check.'],
    },
  },
  irregular_verb_forms: {
    Component: IrregularForms,
    initial: () => ({ past: '', pastParticiple: '' }),
    isReady: (v: { past: string; pastParticiple: string }) => v.past.trim() !== '' && v.pastParticiple.trim() !== '',
    notReadyLabel: 'Type both forms',
    howTo: {
      title: 'Irregular verbs',
      steps: ['You see the base form (V1).', 'Type the past simple (V2) and the past participle (V3).', 'Press Enter or Check.'],
    },
  },
  word_formation: {
    Component: WordFormation,
    initial: () => ({ answer: '' }),
    isReady: text,
    notReadyLabel: 'Type your answer',
    howTo: {
      title: 'Word formation',
      steps: ['You see a base word and the kind of word you need (noun, verb, adjective…).', 'Type the right form, for example fail → failure.', 'Press Enter or Check.'],
    },
  },
  sentence_order: {
    Component: SentenceOrder,
    initial: () => ({ order: [] }),
    isReady: (v: { order: number[] }, c: ContentOf['sentence_order']) => v.order.length === c.tokens.length,
    notReadyLabel: 'Use all the words',
    howTo: {
      title: 'Put the words in order',
      steps: ['The words are mixed up.', 'Tap them one by one to build the sentence.', 'Tap a word in your sentence to take it back. Press Check at the end.'],
    },
  },
  listen_and_type: {
    Component: ListenAndType,
    initial: () => ({ answer: '' }),
    isReady: text,
    notReadyLabel: 'Type what you hear',
    howTo: {
      title: 'Listen and type',
      steps: ['Press the speaker to hear it. The turtle plays it slowly.', 'Type exactly what you hear. Capital letters and the full stop do not matter.', 'Press Enter or Check.'],
    },
  },
  translation_fa_en: {
    Component: OpenText,
    initial: () => ({ answer: '' }),
    isReady: text,
    usesAi: true,
    notReadyLabel: 'Write your answer',
    howTo: {
      title: 'Translate into English',
      steps: ['Read the Persian sentence.', 'Write it in natural English. Different correct wordings are fine.', 'Press Check. The coach reads your answer and explains.'],
    },
  },
  free_production: {
    Component: OpenText,
    initial: () => ({ answer: '' }),
    isReady: text,
    usesAi: true,
    notReadyLabel: 'Write your answer',
    howTo: {
      title: 'Write your own sentence',
      steps: ['Read the situation.', 'Write one or two sentences. Try to use the highlighted words.', 'Press Check. The coach reads your answer and explains.'],
    },
  },
  transformation: {
    Component: OpenText,
    initial: () => ({ answer: '' }),
    isReady: text,
    usesAi: true,
    notReadyLabel: 'Write your answer',
    howTo: {
      title: 'Rewrite the sentence',
      steps: ['Read the sentence and the task under it.', 'Write the new sentence in the box.', 'Press Check. The coach reads your answer and explains.'],
    },
  },
};

export const formatUi = (format: ExerciseFormat) => FORMAT_UI[format];
