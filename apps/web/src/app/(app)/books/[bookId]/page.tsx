import type { Metadata } from 'next';
import { BookDetailPage } from '@/features/catalog/book-detail';

export const metadata: Metadata = { title: 'Book' };

export default function Page() {
  return <BookDetailPage />;
}
