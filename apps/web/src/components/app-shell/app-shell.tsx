'use client';

import { Ellipsis, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { AuthUser } from '@coach/contracts';
import { Dialog } from '@/components/ui/dialog';
import { BrandMark } from '@/components/ui/spark';
import { useLogout } from '@/features/auth/use-auth';
import { cn } from '@/lib/cn';
import { AiNotice } from './ai-notice';
import { AuthGate } from './auth-gate';
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from './nav';

function NavLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon className={cn('shrink-0', compact ? 'size-6' : 'size-5')} strokeWidth={2} />
      <span className={cn(compact ? 'text-xs' : 'text-base')}>{compact ? item.label.replace(' & settings', '').replace('Quizzes & Exams', 'Tests') : item.label}</span>
      {!item.enabled && !compact && (
        <span className="ml-auto rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-mute">Soon</span>
      )}
    </>
  );
  const layout = compact
    ? 'flex-1 flex-col gap-1 py-2'
    : 'gap-3 px-4 py-3';
  const classes = cn(
    'flex items-center rounded-control font-semibold transition-colors',
    layout,
    active ? 'bg-brand-soft text-brand' : 'text-mute',
    item.enabled ? (active ? '' : 'hover:bg-subtle hover:text-ink') : 'cursor-not-allowed opacity-60',
  );

  if (!item.enabled) {
    return (
      <span className={classes} aria-disabled title={`${item.hintFa} (به‌زودی)`}>
        {content}
      </span>
    );
  }
  return (
    <Link href={item.href} className={classes} aria-current={active ? 'page' : undefined} title={item.hintFa}>
      {content}
    </Link>
  );
}

/** The phone's bottom bar has room for four pages; everything else lives behind this button. */
function MoreMenu({ isActive }: { isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const rest = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.mobile) })).filter((g) => g.items.length > 0);
  const anyActive = rest.some((g) => g.items.some((i) => isActive(i.href)));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'flex flex-1 flex-col items-center gap-1 rounded-control py-2 font-semibold transition-colors',
          anyActive ? 'bg-brand-soft text-brand' : 'text-mute hover:bg-subtle hover:text-ink',
        )}
      >
        <Ellipsis className="size-6" strokeWidth={2} />
        <span className="text-xs">More</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="More">
        <div className="space-y-5" onClick={() => setOpen(false)}>
          {rest.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-xs font-bold uppercase tracking-wider text-mute/80">{group.label}</p>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <AuthGate>{(user) => <Shell user={user}>{children}</Shell>}</AuthGate>;
}

function Shell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const pathname = usePathname();
  const logout = useLogout();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-card/60 p-5 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <BrandMark />
          <span className="font-heading text-xl font-extrabold tracking-tight">English Coach</span>
        </Link>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wider text-mute/80">{group.label}</p>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-4 flex items-center gap-3 rounded-card border border-line bg-card p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft font-heading text-lg font-extrabold text-brand">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{user.displayName}</p>
            <p className="truncate text-sm text-mute">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-10 place-items-center rounded-control text-mute transition-colors hover:bg-subtle hover:text-ink"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-5 pb-28 pt-8 sm:px-8 lg:pb-12 lg:pt-10">
        <div className="mx-auto w-full max-w-5xl">
          <AiNotice />
          {children}
        </div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card/95 px-2 backdrop-blur lg:hidden"
      >
        {NAV_ITEMS.filter((i) => i.mobile).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} compact />
        ))}
        <MoreMenu isActive={isActive} />
      </nav>
    </div>
  );
}
