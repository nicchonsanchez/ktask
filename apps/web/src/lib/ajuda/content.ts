import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { remark } from 'remark';
import strip from 'strip-markdown';
import { cache } from 'react';
import type {
  Categoria,
  CategoriaWithTutoriais,
  MetaIndex,
  SearchEntry,
  Tutorial,
  TutorialFrontmatter,
  TutorialSummary,
} from './types';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'ajuda');
const META_FILE = path.join(CONTENT_ROOT, '_meta.json');

const WORDS_PER_MINUTE = 200;

function estimateReading(plainText: string): number {
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

async function toPlainText(markdown: string): Promise<string> {
  const file = await remark().use(strip).process(markdown);
  return String(file).replace(/\s+/g, ' ').trim();
}

function parseFrontmatter(
  raw: Record<string, unknown>,
  fallbackCategory: string,
): TutorialFrontmatter {
  const fm: TutorialFrontmatter = {
    title: typeof raw.title === 'string' ? raw.title : 'Sem título',
    description: typeof raw.description === 'string' ? raw.description : '',
    category: typeof raw.category === 'string' ? raw.category : fallbackCategory,
    slug: typeof raw.slug === 'string' ? raw.slug : '',
    order: typeof raw.order === 'number' ? raw.order : 999,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    updatedAt:
      typeof raw.updatedAt === 'string'
        ? raw.updatedAt
        : raw.updatedAt instanceof Date
          ? raw.updatedAt.toISOString().slice(0, 10)
          : '',
  };
  return fm;
}

export const loadMeta = cache(async (): Promise<MetaIndex> => {
  const raw = await fs.readFile(META_FILE, 'utf-8');
  return JSON.parse(raw) as MetaIndex;
});

export const listCategorias = cache(async (): Promise<Categoria[]> => {
  const meta = await loadMeta();
  return [...meta.categorias].sort((a, b) => a.order - b.order);
});

export async function getCategoria(slug: string): Promise<Categoria | null> {
  const cats = await listCategorias();
  return cats.find((c) => c.slug === slug) ?? null;
}

async function readTutorialFile(categorySlug: string, fileName: string): Promise<Tutorial | null> {
  const filePath = path.join(CONTENT_ROOT, categorySlug, fileName);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const fm = parseFrontmatter(parsed.data, categorySlug);
  const plainText = await toPlainText(parsed.content);
  return {
    ...fm,
    body: parsed.content,
    plainText,
    readingMinutes: estimateReading(plainText),
  };
}

export const listTutoriaisByCategoria = cache(
  async (categorySlug: string): Promise<TutorialSummary[]> => {
    const dir = path.join(CONTENT_ROOT, categorySlug);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const tutoriais = await Promise.all(
      mdFiles.map(async (file) => {
        const tutorial = await readTutorialFile(categorySlug, file);
        if (!tutorial) return null;
        const { body: _body, plainText: _plainText, ...summary } = tutorial;
        void _body;
        void _plainText;
        return summary as TutorialSummary;
      }),
    );
    return tutoriais
      .filter((t): t is TutorialSummary => t !== null)
      .sort((a, b) => a.order - b.order);
  },
);

export const listAllTutoriais = cache(async (): Promise<TutorialSummary[]> => {
  const cats = await listCategorias();
  const all = await Promise.all(cats.map((c) => listTutoriaisByCategoria(c.slug)));
  return all.flat();
});

export const listCategoriasWithTutoriais = cache(async (): Promise<CategoriaWithTutoriais[]> => {
  const cats = await listCategorias();
  return Promise.all(
    cats.map(async (c) => ({
      ...c,
      tutoriais: await listTutoriaisByCategoria(c.slug),
    })),
  );
});

export async function getTutorial(
  categorySlug: string,
  tutorialSlug: string,
): Promise<Tutorial | null> {
  const dir = path.join(CONTENT_ROOT, categorySlug);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const tutorial = await readTutorialFile(categorySlug, file);
    if (tutorial && tutorial.slug === tutorialSlug) return tutorial;
  }
  return null;
}

export async function getAdjacentTutoriais(
  categorySlug: string,
  tutorialSlug: string,
): Promise<{ prev: TutorialSummary | null; next: TutorialSummary | null }> {
  const flat = await listAllTutoriais();
  const idx = flat.findIndex((t) => t.category === categorySlug && t.slug === tutorialSlug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? (flat[idx - 1] ?? null) : null,
    next: idx < flat.length - 1 ? (flat[idx + 1] ?? null) : null,
  };
}

export const buildSearchIndex = cache(async (): Promise<SearchEntry[]> => {
  const cats = await listCategorias();
  const entries: SearchEntry[] = [];
  for (const cat of cats) {
    const dir = path.join(CONTENT_ROOT, cat.slug);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const tutorial = await readTutorialFile(cat.slug, file);
      if (!tutorial) continue;
      entries.push({
        category: cat.slug,
        categoryTitle: cat.title,
        slug: tutorial.slug,
        title: tutorial.title,
        description: tutorial.description,
        tags: tutorial.tags,
        content: tutorial.plainText,
      });
    }
  }
  return entries;
});
