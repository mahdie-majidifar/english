import Link from 'next/link';
import { ITEM_TYPE_META, type Item } from '@coach/contracts';
import { Card } from '@/components/ui/card';
import { MasteryChip } from '@/components/ui/mastery-chip';
import { SkillChip } from '@/components/ui/skill-chip';

/** A short, type-aware line under the headword (e.g. the three forms of an irregular verb). */
export function itemSummary(item: Item): string | null {
  const p = item.payload;
  switch (item.type) {
    case 'IRREGULAR_VERB':
      return `${p['base']} → ${p['past']} → ${p['pastParticiple']}`;
    case 'WORD_DISTINCTION':
      return Array.isArray(p['members']) ? (p['members'] as string[]).join(' · ') : null;
    case 'WORD_FORMATION':
      return Array.isArray(p['forms']) ? (p['forms'] as { form: string }[]).map((f) => f.form).join(' · ') : null;
    case 'GRAMMAR':
    case 'SENTENCE_PATTERN':
      return (p['structure'] as string | undefined) ?? (p['pattern'] as string | undefined) ?? null;
    default:
      return item.meaningEn;
  }
}

export function ItemCard({ item }: { item: Item }) {
  const summary = itemSummary(item);
  return (
    <Link href={`/library/${item.id}`} className="block focus-visible:outline-offset-4">
      <Card interactive className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <SkillChip mode={ITEM_TYPE_META[item.type].mode} label={ITEM_TYPE_META[item.type].label} />
          <MasteryChip status={item.status} />
        </div>

        <div className="flex-1">
          <h3 className="break-words font-heading text-2xl font-extrabold leading-snug tracking-tight">
            {item.headword}
          </h3>
          {item.meaningFa && <p className="fa mt-1 text-xl text-ink">{item.meaningFa}</p>}
          {summary && <p className="mt-1 text-base text-mute">{summary}</p>}
        </div>

        {item.lessons.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Lessons">
            {item.lessons.slice(0, 4).map((lesson) => (
              <li key={lesson.id} className="rounded-full bg-subtle px-3 py-1 text-sm font-semibold text-mute">
                {lesson.code}
              </li>
            ))}
            {item.lessons.length > 4 && (
              <li className="rounded-full bg-subtle px-3 py-1 text-sm font-semibold text-mute">
                +{item.lessons.length - 4}
              </li>
            )}
          </ul>
        )}
      </Card>
    </Link>
  );
}
