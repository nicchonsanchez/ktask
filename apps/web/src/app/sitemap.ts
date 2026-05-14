import type { MetadataRoute } from 'next';
import { listAllTutoriais, listCategorias } from '@/lib/ajuda/content';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ktask.agenciakharis.com.br';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categorias, tutoriais] = await Promise.all([listCategorias(), listAllTutoriais()]);

  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/ajuda`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/ajuda/suporte`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    ...categorias.map((cat) => ({
      url: `${SITE_URL}/ajuda/${cat.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...tutoriais.map((tut) => ({
      url: `${SITE_URL}/ajuda/${tut.category}/${tut.slug}`,
      lastModified: tut.updatedAt ? new Date(tut.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  return entries;
}
