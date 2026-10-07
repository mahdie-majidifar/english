'use client';

import { ArrowLeft, Dumbbell, Pencil, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ITEM_TYPE_META, type Item } from '@coach/contracts';
import { buttonClass, Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MasteryChip } from '@/components/ui/mastery-chip';
import { SkillChip } from '@/components/ui/skill-chip';
import { errorMessage } from '@/lib/errors';
import { useArchiveItem, useItem } from '@/features/content/hooks';
import { useGenerateExercises } from '@/features/practice/hooks';

type Json = Record<string, unknown>;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const rows = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="font-heading text-xl font-extrabold tracking-tight">{title}</h2>
      {children}
    </Card>
  );
}

function Examples({ examples }: { examples: string[] }) {
  if (examples.length === 0) return null;
  return (
    <Section title="Examples">
      <ul className="space-y-3">
        {examples.map((e) => (
          <li key={e} className="rounded-2xl bg-subtle px-4 py-3 text-lg leading-relaxed">
            {e}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TypeDetails({ item }: { item: Item }) {
  const p = item.payload;
  switch (item.type) {
    case 'IRREGULAR_VERB':
      return (
        <Section title="Forms">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['V1 · base', p['base']],
              ['V2 · past', p['past']],
              ['V3 · participle', p['pastParticiple']],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-verbs/10 px-3 py-5">
                <p className="font-heading text-2xl font-extrabold">{String(value)}</p>
                <p className="mt-1 text-sm font-semibold text-mute">{String(label)}</p>
              </div>
            ))}
          </div>
        </Section>
      );
    case 'WORD_FORMATION':
      return (
        <Section title="Word family">
          <ul className="flex flex-wrap gap-3">
            <li className="rounded-2xl bg-formation/15 px-4 py-3 text-lg font-bold">{str(p['base'])}</li>
            {rows(p['forms']).map((f) => (
              <li key={`${f['form']}`} className="rounded-2xl bg-subtle px-4 py-3 text-lg">
                <span className="font-bold">{str(f['form'])}</span>{' '}
                <span className="text-mute">{str(f['pos'])}</span>
              </li>
            ))}
          </ul>
        </Section>
      );
    case 'WORD_DISTINCTION':
      return (
        <Section title="How they differ">
          <ul className="space-y-3">
            {rows(p['distinctions']).map((d) => (
              <li key={`${d['word']}`} className="rounded-2xl bg-subtle px-4 py-4">
                <p className="font-heading text-xl font-extrabold">{str(d['word'])}</p>
                {str(d['usageFa']) && <p className="fa mt-1 text-lg">{str(d['usageFa'])}</p>}
                {str(d['example']) && <p className="mt-1 text-lg text-mute">{str(d['example'])}</p>}
              </li>
            ))}
            {rows(p['distinctions']).length === 0 && (
              <li className="text-base text-mute">Compared: {list(p['members']).join(' · ')}</li>
            )}
          </ul>
        </Section>
      );
    case 'VOCABULARY':
      return (
        <>
          {rows(p['wordFamily']).length > 0 && (
            <Section title="Word family">
              <ul className="flex flex-wrap gap-3">
                {rows(p['wordFamily']).map((f) => (
                  <li key={`${f['form']}`} className="rounded-2xl bg-subtle px-4 py-3 text-lg">
                    <span className="font-bold">{str(f['form'])}</span>{' '}
                    <span className="text-mute">{str(f['pos'])}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Examples examples={list(p['examples'])} />
        </>
      );
    case 'GRAMMAR':
      return (
        <>
          {(str(p['structure']) || str(p['notesFa'])) && (
            <Section title="The rule">
              {str(p['structure']) && (
                <p className="rounded-2xl bg-grammar/10 px-4 py-3 text-lg font-semibold">{str(p['structure'])}</p>
              )}
              {str(p['notesFa']) && <p className="fa whitespace-pre-line text-lg">{str(p['notesFa'])}</p>}
            </Section>
          )}
          <Examples examples={list(p['examples'])} />
        </>
      );
    case 'SENTENCE_PATTERN':
      return (
        <>
          <Section title="Pattern">
            <p className="rounded-2xl bg-grammar/10 px-4 py-3 text-lg font-semibold">{str(p['pattern'])}</p>
          </Section>
          <Examples examples={list(p['examples'])} />
        </>
      );
    case 'PRONUNCIATION':
      return (
        <Section title="Pronunciation">
          {str(p['ipa']) && <p className="text-2xl font-semibold">{str(p['ipa'])}</p>}
          {str(p['tipFa']) && <p className="fa text-lg">{str(p['tipFa'])}</p>}
        </Section>
      );
    default:
      return <Examples examples={list(p['examples'])} />;
  }
}

/** Built-in exercises come from the details saved on the item. The AI can add more, on request. */
function MoreExercises({ itemId }: { itemId: string }) {
  const generate = useGenerateExercises(itemId);
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-xl font-extrabold tracking-tight">More practice for this item</h2>
          <p className="mt-1 text-base text-mute">
            Exercises are made from the details you saved. Ask the coach to write extra ones: fill-in-the-gap, rewriting and writing your own sentence.
          </p>
        </div>
      </div>
      {generate.isSuccess && (
        <p role="status" className="rounded-control bg-good-soft px-4 py-3 text-base font-medium text-good-edge">
          {generate.data.created} new exercise{generate.data.created === 1 ? '' : 's'} added to your practice.
        </p>
      )}
      {generate.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
          {errorMessage(generate.error)}
        </p>
      )}
      <Button variant="secondary" loading={generate.isPending} onClick={() => generate.mutate()}>
        <Sparkles className="size-5" /> Ask the coach for more
      </Button>
    </Card>
  );
}

export function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const router = useRouter();
  const query = useItem(itemId);
  const archive = useArchiveItem();
  const [confirming, setConfirming] = useState(false);

  if (query.isPending) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;
  if (query.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft">
        <p className="text-lg font-semibold text-bad-edge">{errorMessage(query.error, 'We could not load this item.')}</p>
        <Link href="/library" className="mt-3 inline-block font-semibold underline">
          Back to the library
        </Link>
      </Card>
    );
  }

  const item = query.data;
  const meta = ITEM_TYPE_META[item.type];
  const ipa = item.type === 'VOCABULARY' ? str(item.payload['ipa']) : undefined;
  const pos = item.type === 'VOCABULARY' ? str(item.payload['partOfSpeech']) : undefined;

  return (
    <div className="space-y-6">
      <Link href="/library" className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Library
      </Link>

      <Card className="space-y-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SkillChip mode={meta.mode} label={meta.label} />
            <MasteryChip status={item.status} />
          </div>
          <div className="flex gap-2">
            <Link href={`/practice/play?scope=item&itemId=${item.id}&count=5`} className={buttonClass('primary', 'sm')}>
              <Dumbbell className="size-4" /> Practice
            </Link>
            <Link href={`/library/${item.id}/edit`} className={buttonClass('secondary', 'sm')}>
              <Pencil className="size-4" /> Edit
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label="Delete item">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div>
          <h1 className="break-words font-heading text-5xl font-extrabold leading-tight tracking-tight">{item.headword}</h1>
          {(ipa || pos) && (
            <p className="mt-2 text-lg text-mute">
              {[ipa, pos].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {item.meaningFa && <p className="fa text-2xl">{item.meaningFa}</p>}
        {item.meaningEn && <p className="text-xl leading-relaxed text-mute">{item.meaningEn}</p>}
      </Card>

      <TypeDetails item={item} />
      <MoreExercises itemId={item.id} />

      <Section title="Where you met it">
        {item.lessons.length === 0 ? (
          <p className="text-base text-mute">Not linked to a lesson. You can link it by editing the item.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {item.lessons.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/books/${l.bookId}`}
                  className="block rounded-2xl border border-line bg-card px-4 py-3 transition-colors hover:bg-brand-soft"
                >
                  <span className="font-heading text-lg font-bold">
                    {l.code} · {l.title}
                  </span>
                  <span className="block text-sm text-mute">
                    {l.bookTitle}, unit {l.unitNumber}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Card className="border-dashed bg-transparent shadow-none">
        <p className="text-base text-mute">
          Mistakes, review dates and quiz history for this item will appear here once you start practicing.
        </p>
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => archive.mutate(item.id, { onSuccess: () => router.replace('/library') })}
        loading={archive.isPending}
        error={archive.isError ? errorMessage(archive.error) : undefined}
        title={`Remove “${item.headword}”?`}
        description="It leaves your library and future practice. You can add it again any time."
        confirmLabel="Remove"
      />
    </div>
  );
}
