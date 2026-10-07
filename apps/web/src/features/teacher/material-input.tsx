'use client';

import { FileUp, ClipboardPaste, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, type MaterialCategory } from '@coach/contracts';
import { SelectField, TextareaField } from '@/components/ui/field';
import { cn } from '@/lib/cn';

export type MaterialDraft =
  | { kind: 'text'; text: string; category: MaterialCategory }
  | { kind: 'file'; file: File; category: MaterialCategory };

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  CLASS_NOTES: 'My class notes',
  EXERCISE: 'Exercise sheet from the teacher',
  HANDOUT: 'Handout from the teacher',
};

const ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg,.webp,.txt';
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** Why a file cannot be used, or null. The server checks again by reading the file itself. */
export function fileProblem(file: File): string | null {
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `This file is too large. The limit is ${mb(MAX_UPLOAD_BYTES)}.`;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const known = new Set<string>([...Object.values(ALLOWED_UPLOAD_TYPES), 'jpeg']);
  return known.has(ext) ? null : 'Use a PDF, Word (.docx), picture or text file.';
}

interface MaterialInputProps {
  value: MaterialDraft;
  onChange: (value: MaterialDraft) => void;
  error?: string;
}

/** Paste text or upload a file: two ways in, one clear choice at a time. */
export function MaterialInput({ value, onChange, error }: MaterialInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = fileProblem(file);
    setFileError(problem);
    if (!problem) onChange({ kind: 'file', file, category: value.category });
  }

  const tabs = [
    { kind: 'text', label: 'Paste text', icon: ClipboardPaste },
    { kind: 'file', label: 'Upload a file', icon: FileUp },
  ] as const;

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="How to add the material" className="grid grid-cols-2 gap-2 rounded-control bg-subtle p-1.5">
        {tabs.map(({ kind, label, icon: Icon }) => {
          const selected = value.kind === kind;
          return (
            <button
              key={kind}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() =>
                onChange(kind === 'text' ? { kind: 'text', text: '', category: value.category } : { kind: 'file', file: undefined as never, category: value.category })
              }
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition-colors',
                selected ? 'bg-card text-ink shadow-soft' : 'text-mute hover:text-ink',
              )}
            >
              <Icon className="size-5" /> {label}
            </button>
          );
        })}
      </div>

      {value.kind === 'text' ? (
        <TextareaField
          label="Your notes"
          rows={10}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder={'Session 21\n\nVocabulary:\nConservative\nDisposable income\n\nGrammar:\nReported speech'}
          hint="Paste exactly what your teacher gave you. Mixed English and Persian is fine."
          error={error}
          autoFocus
        />
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {value.file ? (
            <div className="flex items-center gap-4 rounded-card border border-line bg-card p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                <FileUp className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{value.file.name}</p>
                <p className="text-sm text-mute">{(value.file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (fileRef.current) fileRef.current.value = '';
                  onChange({ kind: 'file', file: undefined as never, category: value.category });
                }}
                aria-label="Remove file"
                className="grid size-10 place-items-center rounded-control text-mute transition-colors hover:bg-subtle hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                'grid w-full place-items-center gap-3 rounded-card border-2 border-dashed px-6 py-14 text-center transition-colors',
                dragging ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:border-brand/50 hover:bg-brand-soft/50',
              )}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
                <FileUp className="size-7" />
              </span>
              <span className="font-heading text-xl font-extrabold tracking-tight">Drop a file here, or choose one</span>
              <span className="text-base text-mute">PDF, Word, a photo or screenshot, or a text file. Up to {mb(MAX_UPLOAD_BYTES)}.</span>
            </button>
          )}
          {(fileError || error) && <p role="alert" className="mt-3 text-base font-medium text-bad-edge">{fileError ?? error}</p>}
        </div>
      )}

      <SelectField
        label="What is it?"
        value={value.category}
        onChange={(e) => onChange({ ...value, category: e.target.value as MaterialCategory })}
      >
        {(Object.keys(CATEGORY_LABELS) as MaterialCategory[]).map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/** True when the draft has something to send. */
export function isReady(draft: MaterialDraft): boolean {
  return draft.kind === 'text' ? draft.text.trim().length > 0 : Boolean(draft.file);
}
