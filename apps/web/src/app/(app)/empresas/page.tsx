import { redirect } from 'next/navigation';

// /empresas e atalho pra /contatos com filtro de empresa pre-aplicado.
// Mantem URL legivel + reaproveita listagem/dialog/detalhe sem duplicar.
export default function EmpresasRedirect() {
  redirect('/contatos?type=COMPANY');
}
