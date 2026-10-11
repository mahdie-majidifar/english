'use client';

import { Download, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeleteAccount } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ApiError, api, apiFile } from '@/lib/api';
import { saveFile } from '@/lib/download';
import { errorMessage } from '@/lib/errors';

/** A wrong password comes back as 403; anything else gets the usual short message. */
const deleteError = (error: unknown) =>
  error instanceof ApiError && error.status === 403 ? 'That password is not correct.' : errorMessage(error, 'We could not delete the account.');

function DeleteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: (body: DeleteAccount) => api<void>('/me', { method: 'DELETE', body }),
    onSuccess: () => {
      client.clear();
      router.replace('/login');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password) remove.mutate({ password });
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setPassword('');
        remove.reset();
        onClose();
      }}
      title="Delete your account?"
      description="Everything goes for good: your books, items, answers, progress and teacher notes. This cannot be undone. Download your data first if you want to keep a copy."
    >
      <form onSubmit={submit} className="space-y-5">
        <p className="fa text-sm text-mute">همه‌ی اطلاعاتت برای همیشه پاک می‌شود و برنگشتنی است.</p>
        <Field
          label="Type your password to confirm"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          error={remove.isError ? deleteError(remove.error) : undefined}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="bad" loading={remove.isPending} disabled={!password}>
            Delete everything
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The learner's data is theirs: take a copy of all of it, or delete it all. */
export function YourData() {
  const [deleting, setDeleting] = useState(false);
  const download = useMutation({
    mutationFn: async () => {
      const { blob, filename } = await apiFile('/me/export');
      saveFile(blob, filename);
    },
  });

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Download className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-heading text-lg font-extrabold">Download my data</p>
          <p className="text-base text-mute">
            One file with your books, items, answers, mistakes, progress and teacher notes. Passwords are never in it.
          </p>
          <p className="fa text-sm text-mute">یک فایل با همه‌ی اطلاعاتت (بدون رمز عبور).</p>
        </div>
        <Button variant="secondary" onClick={() => download.mutate()} loading={download.isPending}>
          Download
        </Button>
      </div>
      {download.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {errorMessage(download.error, 'We could not prepare the download.')}
        </p>
      )}
      {download.isSuccess && (
        <p role="status" className="text-base font-semibold text-good-ink">
          Your file was saved to your downloads.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bad-soft text-bad-ink">
          <Trash2 className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-heading text-lg font-extrabold">Delete my account</p>
          <p className="text-base text-mute">Removes the account and all its data for good. You will be asked for your password.</p>
        </div>
        <Button variant="bad" onClick={() => setDeleting(true)}>
          Delete…
        </Button>
      </div>
      <DeleteDialog open={deleting} onClose={() => setDeleting(false)} />
    </Card>
  );
}
