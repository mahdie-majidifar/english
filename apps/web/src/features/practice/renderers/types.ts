import type { ComponentType } from 'react';
import type { AttemptResult, ExerciseFormat } from '@coach/contracts';

/** What every exercise renderer receives from the player shell. */
export interface RendererProps<Content = unknown, Value = unknown> {
  content: Content;
  /** The answer so far. It has exactly the shape the API expects as the response. */
  value: Value;
  onChange: (value: Value) => void;
  /** True once the answer was sent: show the outcome and accept no more input. */
  locked: boolean;
  /** Outcome of the check, once there is one. */
  result: AttemptResult | null;
  /** Send an answer straight away (flashcards submit when you rate them). */
  sendNow: (value: Value) => void;
  /** Called when Enter is pressed inside an input, to check the answer. */
  onEnter: () => void;
}

export interface FormatUi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<RendererProps<any, any>>;
  /** The empty answer for a fresh exercise. */
  initial: (content: never) => unknown;
  /** True when there is enough of an answer to check. */
  isReady: (value: never, content: never) => boolean;
  /** Label of the disabled Check button, saying what is still missing. */
  notReadyLabel: string;
  /** The renderer sends the answer itself (no Check button). */
  autoSubmit?: boolean;
  /** Free-text answers are judged by the AI, which takes a moment. */
  usesAi?: boolean;
  howTo: { title: string; steps: string[] };
}

export type FormatRegistry = Record<ExerciseFormat, FormatUi>;
