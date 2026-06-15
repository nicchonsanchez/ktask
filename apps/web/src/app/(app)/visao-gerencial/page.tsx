import { redirect } from 'next/navigation';

/**
 * /visao-gerencial agora é hub com duas sub-telas (cards e tarefas). A
 * tela de cards continua sendo a entrada principal. Redirect permanente
 * preserva bookmarks/links antigos.
 */
export default function VisaoGerencialIndex() {
  redirect('/visao-gerencial/cards');
}
