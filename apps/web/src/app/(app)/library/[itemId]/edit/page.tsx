import type { Metadata } from 'next';
import { ItemEditPage } from '@/features/library/item-edit';

export const metadata: Metadata = { title: 'Edit item' };

export default function Page() {
  return <ItemEditPage />;
}
