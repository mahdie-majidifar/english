'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateItem,
  Item,
  ItemListResponse,
  ItemType,
  SearchResponse,
  UpdateItem,
} from '@coach/contracts';
import { api } from '@/lib/api';
import { catalogKeys } from '@/features/catalog/hooks';

export interface ItemFilters {
  type?: ItemType;
  q?: string;
  lessonId?: string;
  unitId?: string;
  bookId?: string;
}

export const contentKeys = {
  all: ['items'] as const,
  list: (filters: ItemFilters) => ['items', 'list', filters] as const,
  item: (id: string) => ['items', id] as const,
  search: (q: string) => ['search', q] as const,
};

function listPath(filters: ItemFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.q) params.set('q', filters.q);
  if (filters.lessonId) params.set('lessonId', filters.lessonId);
  if (filters.unitId) params.set('unitId', filters.unitId);
  if (filters.bookId) params.set('bookId', filters.bookId);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return `/items${qs ? `?${qs}` : ''}`;
}

export function useItems(filters: ItemFilters) {
  return useInfiniteQuery({
    queryKey: contentKeys.list(filters),
    queryFn: ({ pageParam }) => api<ItemListResponse>(listPath(filters, pageParam)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const useItem = (id: string | undefined) =>
  useQuery({
    queryKey: contentKeys.item(id ?? ''),
    queryFn: () => api<Item>(`/items/${id}`),
    enabled: Boolean(id),
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: contentKeys.search(q),
    queryFn: () => api<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  });

/** Items show up in lists, counts, book/lesson totals and search, so refresh all of them. */
function useInvalidateContent() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: contentKeys.all }),
      client.invalidateQueries({ queryKey: ['search'] }),
      client.invalidateQueries({ queryKey: catalogKeys.books }),
      client.invalidateQueries({ queryKey: catalogKeys.current }),
    ]);
}

export function useCreateItem() {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (body: Omit<CreateItem, 'lessonIds'> & { lessonIds?: string[] }) =>
      api<Item>('/items', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateItem(id: string) {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (body: UpdateItem) => api<Item>(`/items/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useArchiveItem() {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/items/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
