'use client';

import { Check, Download, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isIosDevice, isStandalone, type BeforeInstallPromptEvent } from '@/lib/pwa';
import { Button } from './button';
import { Card } from './card';

type Mode = 'installed' | 'prompt' | 'ios' | 'menu';

/** Offers to install the site like an app, in whichever way this browser allows. */
export function InstallCard() {
  const [mode, setMode] = useState<Mode>('menu');
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setMode('installed');
      return;
    }
    if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints)) setMode('ios');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setMode('prompt');
    };
    const onInstalled = () => {
      setEvent(null);
      setMode('installed');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setMode('installed');
    setEvent(null);
  }

  return (
    <Card className="flex flex-wrap items-center gap-4 p-6">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
        {mode === 'installed' ? <Check className="size-6" strokeWidth={3} /> : <Download className="size-6" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-heading text-lg font-extrabold">{mode === 'installed' ? 'Installed on this device' : 'Install English Coach'}</p>
        <p className="text-base text-mute">
          {mode === 'installed' && 'You opened it from the home screen. It runs full screen, like any other app.'}
          {mode === 'prompt' && 'Open it from your home screen or desktop, full screen, like any other app.'}
          {mode === 'ios' && (
            <>
              In Safari, tap <Share aria-label="Share" className="inline size-4 align-text-bottom" /> Share, then “Add to Home Screen”.
            </>
          )}
          {mode === 'menu' && 'Open this site in Chrome or Edge, then choose “Install app” from the browser menu. On a phone: “Add to Home screen”.'}
        </p>
        {mode !== 'installed' && <p className="fa text-sm text-mute">مثل یک برنامه روی گوشی یا کامپیوترت نصب می‌شود.</p>}
      </div>
      {mode === 'prompt' && <Button onClick={() => void install()}>Install</Button>}
    </Card>
  );
}
