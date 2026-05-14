import Fuse from 'fuse.js';
import type { SearchEntry } from './types';

export interface SearchResult {
  category: string;
  categoryTitle: string;
  slug: string;
  title: string;
  description: string;
  snippet: string;
  score: number;
}

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<SearchEntry>>[1] = {
  includeScore: true,
  includeMatches: true,
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: 'title', weight: 4 },
    { name: 'description', weight: 2 },
    { name: 'tags', weight: 2 },
    { name: 'categoryTitle', weight: 1.5 },
    { name: 'content', weight: 1 },
  ],
};

const SNIPPET_RADIUS = 60;

export function createSearchIndex(entries: SearchEntry[]): Fuse<SearchEntry> {
  return new Fuse(entries, FUSE_OPTIONS);
}

function buildSnippet(entry: SearchEntry, query: string): string {
  const haystack = entry.content;
  if (!haystack) return entry.description;
  const idx = haystack.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return entry.description || haystack.slice(0, 140);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(haystack.length, idx + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < haystack.length ? ' …' : '';
  return `${prefix}${haystack.slice(start, end)}${suffix}`;
}

export function runSearch(fuse: Fuse<SearchEntry>, query: string, limit = 8): SearchResult[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const raw = fuse.search(q, { limit });
  return raw.map(({ item, score }) => ({
    category: item.category,
    categoryTitle: item.categoryTitle,
    slug: item.slug,
    title: item.title,
    description: item.description,
    snippet: buildSnippet(item, q),
    score: score ?? 1,
  }));
}
