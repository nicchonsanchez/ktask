export interface Categoria {
  slug: string;
  title: string;
  description: string;
  order: number;
  icon: string;
}

export interface MetaIndex {
  categorias: Categoria[];
}

export interface TutorialFrontmatter {
  title: string;
  description: string;
  category: string;
  slug: string;
  order: number;
  tags: string[];
  updatedAt: string;
}

export interface Tutorial extends TutorialFrontmatter {
  body: string;
  plainText: string;
  readingMinutes: number;
}

export interface TutorialSummary extends TutorialFrontmatter {
  readingMinutes: number;
}

export interface CategoriaWithTutoriais extends Categoria {
  tutoriais: TutorialSummary[];
}

export interface SearchEntry {
  category: string;
  categoryTitle: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  content: string;
}
