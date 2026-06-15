import { redirect } from 'next/navigation';

/**
 * /visao-gerencial agora é hub com duas sub-telas (cards e tarefas). A
 * tela de cards continua sendo a entrada principal. Redirect permanente
 * preserva bookmarks/links antigos.
 *
 * Preserva searchParams (ex: ?card=ID) — links antigos pra modal de card
 * via /visao-gerencial?card=... seguem funcionando. Sem isso, o redirect
 * comia o query string e o modal abria-e-fechava (Next.js navigation
 * client-side detectava a URL nova sem ?card= e re-renderizava sem modal).
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VisaoGerencialIndex({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (typeof value === 'string') {
      qs.set(key, value);
    }
  }
  const suffix = qs.toString();
  redirect(`/visao-gerencial/cards${suffix ? `?${suffix}` : ''}`);
}
