import type { Metadata } from 'next';
import { BooksPage } from '@/features/catalog/books-page';

export const metadata: Metadata = { title: 'Books' };

export default function Page() {
  return <BooksPage />;
}
