'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ITEM_TYPE_META, type Item, type ItemType } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, SelectField, TextareaField } from '@/components/ui/field';
import { MODES, type Mode } from '@/components/ui/skill-chip';
import { SkillChip } from '@/components/ui/skill-chip';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { useCreateItem, useUpdateItem } from '@/features/content/hooks';
import { LessonPicker } from './lesson-picker';
import {
  PAYLOAD_FIELDS,
  buildPayload,
  draftFromPayload,
  emptyDraft,
  validateDraft,
  type Draft,
} from './payload-fields';
import { TYPE_ORDER, TYPE_UI } from './type-ui';

interface ItemFormProps {
  /** Present when editing; the type of an existing item cannot change. */
  item?: Item;
  defaultType?: ItemType;
  defaultLessonIds?: string[];
}

function TypePicker({ value, onChange }: { value: ItemType; onChange: (t: ItemType) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-base font-semibold">What are you adding?</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TYPE_ORDER.map((type) => {
          const mode: Mode = ITEM_TYPE_META[type].mode;
          const selected = type === value;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(type)}
              style={{ '--mode': MODES[mode].color } as React.CSSProperties}
              className={cn(
                'relative rounded-2xl border-2 p-4 text-left transition-[transform,border-color,background-color]',
                selected
                  ? 'border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_10%,white)]'
                  : 'border-line bg-card hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--mode)_45%,white)]',
              )}
            >
              <span className="flex items-center gap-2 font-heading text-base font-bold">
                <i aria-hidden className="size-2.5 rounded-full bg-[var(--mode)]" />
                {ITEM_TYPE_META[type].label}
              </span>
              <span className="mt-1 block text-sm leading-snug text-mute">{TYPE_UI[type].description}</span>
              {selected && (
                <Check aria-hidden className="absolute right-3 top-3 size-5 text-[var(--mode)]" strokeWidth={3} />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ItemForm({ item, defaultType = 'VOCABULARY', defaultLessonIds = [] }: ItemFormProps) {
  const router = useRouter();
  const create = useCreateItem();
  const update = useUpdateItem(item?.id ?? '');
  const mutation = item ? update : create;

  const [type, setType] = useState<ItemType>(item?.type ?? defaultType);
  const [headword, setHeadword] = useState(item?.headword ?? '');
  const [meaningEn, setMeaningEn] = useState(item?.meaningEn ?? '');
  const [meaningFa, setMeaningFa] = useState(item?.meaningFa ?? '');
  const [draft, setDraft] = useState<Draft>(
    item ? draftFromPayload(item.type, item.payload) : emptyDraft(defaultType),
  );
  const [lessonIds, setLessonIds] = useState<string[]>(
    item ? item.lessons.map((l) => l.id) : defaultLessonIds,
  );
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const headwordRef = useRef<HTMLInputElement>(null);

  const serverErrors = fieldErrors(mutation.error);
  const errorFor = (key: string): string | undefined =>
    localErrors[key] ??
    serverErrors[`payload.${key}`] ??
    Object.entries(serverErrors).find(([path]) => path.startsWith(`payload.${key}.`))?.[1];
  const headwordError =
    localErrors['headword'] ?? serverErrors['headword'] ?? (type === 'IRREGULAR_VERB' || type === 'WORD_FORMATION' ? serverErrors['payload.base'] : undefined);

  function changeType(next: ItemType) {
    setType(next);
    setDraft(emptyDraft(next));
    setLocalErrors({});
    mutation.reset();
  }

  function save(another: boolean) {
    const problems = validateDraft(type, headword, draft);
    setLocalErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const base = {
      headword: headword.trim(),
      meaningEn: meaningEn.trim() || null,
      meaningFa: meaningFa.trim() || null,
      lessonIds,
      payload: buildPayload(type, draft, headword),
    };

    if (item) {
      update.mutate(base, { onSuccess: () => router.push(`/library/${item.id}`) });
      return;
    }
    create.mutate(
      { type, ...base },
      {
        onSuccess: (created) => {
          if (!another) return router.push(`/library/${created.id}`);
          setSaved(created.headword);
          setHeadword('');
          setMeaningEn('');
          setMeaningFa('');
          setDraft(emptyDraft(type));
          headwordRef.current?.focus();
        },
      },
    );
  }

  const fields = PAYLOAD_FIELDS[type];
  const hasHeadwordOnlyDetails = type === 'IRREGULAR_VERB' || type === 'WORD_FORMATION';

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        save(false);
      }}
      noValidate
      className="space-y-8"
    >
      {!item && <TypePicker value={type} onChange={changeType} />}
      {item && <SkillChip mode={ITEM_TYPE_META[type].mode} label={ITEM_TYPE_META[type].label} />}

      {saved && (
        <p role="status" className="flex items-center gap-2 rounded-control bg-good-soft px-4 py-3 text-base font-semibold text-good-edge">
          <Check className="size-5" strokeWidth={3} /> Saved “{saved}”. Add the next one.
        </p>
      )}

      <Card className="space-y-6">
        <Field
          ref={headwordRef}
          label={TYPE_UI[type].headwordLabel}
          value={headword}
          onChange={(e) => {
            setHeadword(e.target.value);
            setSaved(null);
          }}
          placeholder={TYPE_UI[type].placeholder}
          error={headwordError}
          autoFocus={!item}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextareaField
            label="Meaning (English)"
            rows={2}
            value={meaningEn}
            onChange={(e) => setMeaningEn(e.target.value)}
            placeholder="to discuss something to reach an agreement"
          />
          <TextareaField
            label="Meaning (Persian)"
            rtl
            rows={2}
            value={meaningFa}
            onChange={(e) => setMeaningFa(e.target.value)}
            placeholder="مذاکره کردن"
          />
        </div>
      </Card>

      {fields.length > 0 && (
        <Card className="space-y-6">
          <h2 className="font-heading text-xl font-extrabold tracking-tight">
            {hasHeadwordOnlyDetails ? 'Forms' : 'Details'}
          </h2>
          {fields.map((f) =>
            f.kind === 'select' ? (
              <SelectField
                key={f.key}
                label={f.label}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                error={errorFor(f.key)}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectField>
            ) : f.kind === 'textarea' ? (
              <TextareaField
                key={f.key}
                label={f.label}
                rtl={f.rtl}
                rows={f.rows ?? 3}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                hint={f.hint}
                error={errorFor(f.key)}
              />
            ) : (
              <Field
                key={f.key}
                label={f.label}
                rtl={f.rtl}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                hint={f.hint}
                error={errorFor(f.key)}
              />
            ),
          )}
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-extrabold tracking-tight">Where did you meet it?</h2>
          <p className="mt-1 text-base text-mute">Optional. Linking to a lesson helps the coach practice the right things.</p>
        </div>
        <LessonPicker value={lessonIds} onChange={setLessonIds} />
      </Card>

      {mutation.isError && Object.keys(serverErrors).length === 0 && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
          {errorMessage(mutation.error)}
        </p>
      )}
      {mutation.isError && Object.keys(serverErrors).length > 0 && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
          Please check the highlighted fields.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" loading={mutation.isPending} className="sm:min-w-48">
          {item ? 'Save changes' : 'Save'}
        </Button>
        {!item && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={mutation.isPending}
            onClick={() => save(true)}
          >
            Save and add another
          </Button>
        )}
      </div>
    </form>
  );
}
