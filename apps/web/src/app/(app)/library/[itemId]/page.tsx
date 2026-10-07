import type { Metadata } from 'next';
import { ItemDetailPage } from '@/features/library/item-detail';

export const metadata: Metadata = { title: 'Item' };

export default function Page() {
  return <ItemDetailPage />;
}
