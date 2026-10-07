'use client';

import type { ReactNode } from 'react';
import { AuthGate } from './auth-gate';

/** Signed-in only. The render function lives here because a server layout cannot pass functions to client components. */
export function FocusGate({ children }: { children: ReactNode }) {
  return <AuthGate>{() => children}</AuthGate>;
}