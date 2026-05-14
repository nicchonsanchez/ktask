import { NextResponse } from 'next/server';
import { buildSearchIndex } from '@/lib/ajuda/content';

export const dynamic = 'force-static';

export async function GET() {
  const index = await buildSearchIndex();
  return NextResponse.json(index, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
