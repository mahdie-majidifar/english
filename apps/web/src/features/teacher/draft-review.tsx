'use client';

import { AlertTriangle, Check, CheckCircle2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ITEM_TYPE_META,
  draftItemProblem,
  type CommitResult,
  type DraftExercise,
  type DraftItem,
  type DraftItemDto,
  type ItemType,
  type MaterialDto,
} from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MODES } from '@/components/ui/skill-chip';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { TYPE_ORDER } from '@/features/library/type-ui';
import { useCommit, useDiscard, useReparse } from './hooks';

interface ItemRow {
  uid: string;
  item: DraftItem;
  known: boolean;
  include: boolean;
}
interface ExerciseRow {
  uid: string;
  exercise: DraftExercise;
  include: boolean;
}

const inputClass =
  'h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-ink outline-none transition-[border-color,box-shadow] ' +
  'placeholder:text-mute/70 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]';

function Labelled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-sm font-semibold text-mute">{label}</span>
      {children}
    </label>
  );
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/** The few extra details some types need before they can be saved. */
function ExtraFields({ item, onChange }: { item: DraftItem; onChange: (patch: Partial<DraftItem>) => void }) {
  switch (item.type) {
    case 'IRREGULAR_VERB':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Past simple (V2)">
            <input className={inputClass} value={item.past ?? ''} onChange={(e) => onChange({ past: e.target.value })} placeholder="wore" />
          </Labelled>
          <Labelled label="Past participle (V3)">
            <input className={inputClass} value={item.pastParticiple ?? ''} onChange={(e) => onChange({ pastParticiple: e.target.value })} placeholder="worn" />
          </Labelled>
        </div>
      );
    case 'WORD_DISTINCTION':
      return (
        <Labelled label="Words being compared (comma separated)">
          <input
            className={inputClass}
            value={item.members.join(', ')}
            onChange={(e) => onChange({ members: e.target.value.split(',').map((m) => m.trim()).filter(Boolean) })}
            placeholder="fit, suit, match"
          />
        </Labelled>
      );
    case 'WORD_FORMATION':
      return (
        <Labelled label="Related forms (one per line: word | noun, verb, adjective or adverb)">
          <textarea
            className={cn(inputClass, 'min-h-20 py-2')}
            value={item.forms.map((f) => `${f.form} | ${f.pos}`).join('\n')}
            onChange={(e) =>
              onChange({
                forms: lines(e.target.value).flatMap((l) => {
                  const [form = '', pos = ''] = l.split('|').map((c) => c.trim());
                  const p = pos.toLowerCase();
                  return form && (p === 'noun' || p === 'verb' || p === 'adjective' || p === 'adverb')
                    ? [{ form, pos: p }]
                    : [];
                }),
              })
            }
            placeholder="failure | noun"
          />
        </Labelled>
      );
    case 'GRAMMAR':
    case 'SENTENCE_PATTERN':
      return (
        <Labelled label={item.type === 'GRAMMAR' ? 'Structure (optional)' : 'Pattern'}>
          <input className={inputClass} value={item.structure ?? ''} onChange={(e) => onChange({ structure: e.target.value })} placeholder="say that + backshift" />
        </Labelled>
      );
    default:
      return null;
  }
}

function Row({
  row,
  onChange,
  onRemove,
}: {
  row: ItemRow;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
}) {
  const { item } = row;
  const problem = draftItemProblem(item);
  const meta = ITEM_TYPE_META[item.type];
  const patchItem = (patch: Partial<DraftItem>) => onChange({ item: { ...item, ...patch } });

  return (
    <li
      style={{ '--mode': MODES[meta.mode].color } as CSSProperties}
      className={cn(
        'space-y-4 rounded-2xl border bg-card p-4 transition-opacity',
        row.include ? 'border-[color-mix(in_srgb,var(--mode)_45%,white)]' : 'border-line opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={row.include}
          aria-label={`Include ${item.headword || 'this item'}`}
          disabled={Boolean(problem)}
          onClick={() => onChange({ include: !row.include })}
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            row.include ? 'border-[var(--mode)] bg-[var(--mode)] text-white' : 'border-line bg-card',
          )}
        >
          {row.include && <Check className="size-5" strokeWidth={3} />}
        </button>

        <select
          aria-label="Type"
          value={item.type}
          onChange={(e) => patchItem({ type: e.target.value as ItemType })}
          className="h-10 cursor-pointer rounded-full border-0 bg-[color-mix(in_srgb,var(--mode)_12%,white)] px-4 text-sm font-semibold text-[var(--mode)] outline-none"
        >
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {ITEM_TYPE_META[t].label}
            </option>
          ))}
        </select>

        {row.known && (
          <span className="rounded-full bg-good-soft px-3 py-1 text-sm font-semibold text-good-edge">Already in your library</span>
        )}
        {item.confidence !== 'high' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-formation/15 px-3 py-1 text-sm font-semibold text-[#9a6200]">
            <AlertTriangle className="size-4" aria-hidden />
            {item.confidence === 'low' ? 'Please check this' : 'Worth a look'}
          </span>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.headword || 'item'}`}
          className="ml-auto grid size-10 place-items-center rounded-control text-mute transition-colors hover:bg-bad-soft hover:text-bad-edge"
        >
          <Trash2 className="size-5" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label={ITEM_TYPE_META[item.type].label}>
          <input className={cn(inputClass, 'font-semibold')} value={item.headword} onChange={(e) => patchItem({ headword: e.target.value })} />
        </Labelled>
        <Labelled label="Meaning (English)">
          <input className={inputClass} value={item.meaningEn ?? ''} onChange={(e) => patchItem({ meaningEn: e.target.value || null })} />
        </Labelled>
        <Labelled label="Meaning (Persian)">
          <input className={cn(inputClass, 'fa')} dir="rtl" value={item.meaningFa ?? ''} onChange={(e) => patchItem({ meaningFa: e.target.value || null })} />
        </Labelled>
      </div>

      <ExtraFields item={item} onChange={patchItem} />

      {item.examples.length > 0 && <p className="text-base text-mute">“{item.examples[0]}”</p>}

      {problem && (
        <p role="status" className="flex items-center gap-2 text-base font-medium text-[#9a6200]">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {problem}. Fill it in to include this item.
        </p>
      )}
    </li>
  );
}

/** Shown right after saving, with exactly what happened. */
export function CommitSummary({ result, sessionId }: { result: CommitResult; sessionId: string | null }) {
  return (
    <Card className="space-y-6 p-8 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-good-soft text-good">
        <CheckCircle2 className="size-9" />
      </span>
      <div>
        <h2 className="font-heading text-3xl font-extrabold tracking-tight">Saved to your library</h2>
        <p className="mt-2 text-lg text-mute">
          {result.created} new item{result.created === 1 ? '' : 's'}
          {result.merged > 0 && `, ${result.merged} already known and updated`}
          {result.exercises > 0 && `, ${result.exercises} exercise${result.exercises === 1 ? '' : 's'} kept word for word`}.
        </p>
      </div>
      {result.skipped.length > 0 && (
        <div className="rounded-control bg-formation/15 px-4 py-3 text-left text-base text-[#7a4f00]">
          <p className="font-semibold">Not saved:</p>
          <ul className="mt-1 list-disc pl-5">
            {result.skipped.map((s) => (
              <li key={s.headword}>
                {s.headword}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/library" className={buttonClass('primary', 'lg')}>
          Open library
        </Link>
        {sessionId && (
          <Link href={`/teacher/sessions/${sessionId}`} className={buttonClass('secondary', 'lg')}>
            Back to the class
          </Link>
        )}
      </div>
    </Card>
  );
}
let counter = 0;
const uid = () => `r${++counter}`;

export function DraftReview({ material, onCommitted }: { material: MaterialDto; onCommitted: (result: CommitResult) => void }) {
  const draft = material.draft!;
  const commit = useCommit(material.id);
  const discard = useDiscard(material.id);
  const reparse = useReparse(material.id);

  const [rows, setRows] = useState<ItemRow[]>(() =>
    draft.items.map((i: DraftItemDto) => {
      const { known, ...item } = i;
      return { uid: uid(), item, known, include: !draftItemProblem(item) };
    }),
  );
  const [exercises, setExercises] = useState<ExerciseRow[]>(() =>
    draft.exercises.map((exercise) => ({ uid: uid(), exercise, include: true })),
  );

  const grouped = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({ type, rows: rows.filter((r) => r.item.type === type) })).filter((g) => g.rows.length > 0),
    [rows],
  );

  const selectedItems = rows.filter((r) => r.include && !draftItemProblem(r.item));
  const selectedExercises = exercises.filter((e) => e.include);
  const nothingSelected = selectedItems.length === 0 && selectedExercises.length === 0;

  const patchRow = (id: string, patch: Partial<ItemRow>) =>
    setRows((all) =>
      all.map((r) => {
        if (r.uid !== id) return r;
        const next = { ...r, ...patch };
        // Once an incomplete item is fixed, it is included by default.
        if (patch.item && draftItemProblem(r.item) && !draftItemProblem(patch.item)) next.include = true;
        if (patch.item && draftItemProblem(patch.item)) next.include = false;
        return next;
      }),
    );

  function save() {
    commit.mutate(
      {
        items: selectedItems.map((r) => ({ ...r.item, headword: r.item.headword.trim() })),
        exercises: selectedExercises.map((e) => e.exercise),
      },
      { onSuccess: onCommitted },
    );
  }

  return (
    <div className="space-y-8 pb-28">
      <Card className="space-y-2 border-brand/30 bg-brand-soft/60">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">What the coach found</p>
        <p className="text-lg font-medium">{draft.summary || 'Here is what was in your material.'}</p>
        <p className="text-base text-mute">
          Nothing is saved yet. Fix anything that looks wrong, untick what you do not want, then save.
        </p>
      </Card>

      {rows.length === 0 && exercises.length === 0 && (
        <Card className="border-dashed text-center">
          <p className="text-lg text-mute">The coach did not find any learning items in this material.</p>
        </Card>
      )}

      {grouped.map(({ type, rows: group }) => (
        <section key={type} aria-labelledby={`g-${type}`} className="space-y-3">
          <h2
            id={`g-${type}`}
            style={{ '--mode': MODES[ITEM_TYPE_META[type].mode].color } as CSSProperties}
            className="flex items-center gap-3 font-heading text-2xl font-extrabold tracking-tight"
          >
            <i aria-hidden className="size-3 rounded-full bg-[var(--mode)]" />
            {ITEM_TYPE_META[type].plural}
            <span className="text-lg font-semibold text-mute">{group.length}</span>
          </h2>
          <ul className="space-y-3">
            {group.map((row) => (
              <Row
                key={row.uid}
                row={row}
                onChange={(patch) => patchRow(row.uid, patch)}
                onRemove={() => setRows((all) => all.filter((r) => r.uid !== row.uid))}
              />
            ))}
          </ul>
        </section>
      ))}

      {exercises.length > 0 && (
        <section aria-labelledby="g-exercises" className="space-y-3">
          <h2 id="g-exercises" className="font-heading text-2xl font-extrabold tracking-tight">
            Teacher exercises <span className="text-lg font-semibold text-mute">{exercises.length}</span>
          </h2>
          <p className="text-base text-mute">Kept exactly as your teacher wrote them. They are never rewritten.</p>
          <ul className="space-y-3">
            {exercises.map((row) => (
              <li key={row.uid} className="flex gap-4 rounded-2xl border border-line bg-card p-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={row.include}
                  aria-label="Include this exercise"
                  onClick={() => setExercises((all) => all.map((e) => (e.uid === row.uid ? { ...e, include: !e.include } : e)))}
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-lg border-2 transition-colors',
                    row.include ? 'border-brand bg-brand text-white' : 'border-line bg-card',
                  )}
                >
                  {row.include && <Check className="size-5" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line text-lg leading-relaxed">{row.exercise.originalText}</p>
                  <p className="mt-2 text-sm font-semibold text-mute">
                    {row.exercise.skill.toLowerCase().replace('_', ' ')}
                    {row.exercise.topic ? ` · ${row.exercise.topic}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {commit.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
          {errorMessage(commit.error)}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-line bg-card/95 px-5 py-4 backdrop-blur lg:bottom-0 lg:left-[17rem]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <p className="mr-auto text-base font-semibold">
            {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}
            {selectedExercises.length > 0 && ` and ${selectedExercises.length} exercise${selectedExercises.length === 1 ? '' : 's'}`} selected
          </p>
          <Button variant="ghost" size="sm" loading={reparse.isPending} onClick={() => reparse.mutate()}>
            Analyse again
          </Button>
          <Button variant="ghost" size="sm" loading={discard.isPending} onClick={() => discard.mutate()}>
            Discard
          </Button>
          <Button onClick={save} loading={commit.isPending} disabled={nothingSelected}>
            Save to library
          </Button>
        </div>
      </div>
    </div>
  );
}
