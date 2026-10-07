/**
 * Canonical form of an item's headword, used to detect duplicates:
 * "Negotiate ", "negotiate." and "NEGOTIATE" are the same word; "fit / suit" equals "fit/suit".
 */
export function normalizeKey(headword: string): string {
  return headword
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/u, '')
    .trim();
}

export interface ParsedLesson {
  unitNumber: number;
  /** e.g. "8B" */
  code: string;
  title: string;
}

export interface ParsedStructure {
  units: { number: number; title: string | null }[];
  lessons: ParsedLesson[];
  /** Non-empty lines that matched no known format. */
  rejected: string[];
}

const SEPARATOR = String.raw`\s*[-–—:.)]?\s*`;
const LESSON_LINE = new RegExp(String.raw`^(\d{1,2})([A-Za-z])${SEPARATOR}(.+)$`);
const UNIT_LINE = new RegExp(String.raw`^(?:unit\s+)?(\d{1,2})${SEPARATOR}(.*)$`, 'i');

/**
 * Parses a pasted table of contents into units and lessons.
 *
 *   Unit 8 Business      -> unit 8, title "Business"
 *   8A Shopping          -> lesson 8A "Shopping" in unit 8
 *   8B - Business        -> lesson 8B "Business" in unit 8
 */
export function parseStructureText(text: string): ParsedStructure {
  const units = new Map<number, string | null>();
  const lessons: ParsedLesson[] = [];
  const rejected: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const lesson = LESSON_LINE.exec(line);
    if (lesson) {
      const unitNumber = Number(lesson[1]);
      lessons.push({
        unitNumber,
        code: `${unitNumber}${lesson[2]!.toUpperCase()}`,
        title: lesson[3]!.trim(),
      });
      if (!units.has(unitNumber)) units.set(unitNumber, null);
      continue;
    }

    const unit = UNIT_LINE.exec(line);
    if (unit) {
      const number = Number(unit[1]);
      const title = unit[2]!.trim();
      units.set(number, title || units.get(number) || null);
      continue;
    }

    rejected.push(line);
  }

  return {
    units: [...units.entries()].sort((a, b) => a[0] - b[0]).map(([number, title]) => ({ number, title })),
    lessons,
    rejected,
  };
}
