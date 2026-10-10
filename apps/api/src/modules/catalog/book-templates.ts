/**
 * Books the app can add in one click.
 *
 * Only structure that is certain is listed here. Publishers' unit titles were not available to copy
 * (and are not ours to guess), so these books come with lesson codes and a neutral name such as
 * "Lesson A". The learner names them from their own copy with "Paste contents", which replaces the
 * neutral names (see `isPlaceholderLessonTitle`) but never a name they wrote themselves.
 */
export interface BookTemplate {
  key: string;
  series: string;
  title: string;
  levelNumber: number | null;
  cefr: string | null;
  note: string | null;
  units: { number: number; title: string | null; lessons: { code: string; title: string }[] }[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** American English File, third edition: ten Files per level, each with lessons A, B and C. */
function americanEnglishFile(level: 3 | 4 | 5): BookTemplate {
  return {
    key: `aef-3e-${level}`,
    series: 'American English File',
    title: `American English File ${level} (Third Edition)`,
    levelNumber: level,
    cefr: null,
    note: 'Lessons come as 1A, 1B, 1C and so on. Paste your book’s contents to give them their names.',
    units: range(10).map((n) => ({
      number: n,
      title: null,
      lessons: ['A', 'B', 'C'].map((letter) => ({ code: `${n}${letter}`, title: `Lesson ${letter}` })),
    })),
  };
}

/** Collocations in Use Intermediate: 60 two-page units, one topic each. */
const collocationsInUse: BookTemplate = {
  key: 'collocations-in-use-intermediate',
  series: 'English Collocations in Use',
  title: 'English Collocations in Use: Intermediate',
  levelNumber: null,
  cefr: 'B1–B2',
  note: '60 units, one topic each. Paste your book’s contents to name them.',
  units: range(60).map((n) => ({ number: n, title: null, lessons: [{ code: String(n), title: `Unit ${n}` }] })),
};

export const BOOK_TEMPLATES: readonly BookTemplate[] = [
  americanEnglishFile(3),
  americanEnglishFile(4),
  americanEnglishFile(5),
  collocationsInUse,
];

export const findTemplate = (key: string): BookTemplate | undefined => BOOK_TEMPLATES.find((t) => t.key === key);
