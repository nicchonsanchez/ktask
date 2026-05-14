import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';

interface FaqItem {
  pergunta: string;
  resposta: string;
  /**
   * Caminho pra um tutorial em /ajuda/[categoria]/[slug] quando a pergunta
   * tem cobertura completa lá. Quando o tópico não tem tutorial dedicado,
   * deixar omisso — o item fica só com a resposta inline.
   */
  tutorialPath?: string;
}

/**
 * FAQ com conteúdo placeholder. Briefing 11 popula com respostas reais.
 * Implementação propositalmente simples: <details>/<summary> nativos, sem
 * estado React — funciona com JS desabilitado e o navegador cuida do A11y.
 */
const FAQ_PLACEHOLDER: FaqItem[] = [
  {
    pergunta: 'Como funciona um link de aprovação de cliente?',
    resposta:
      'O operador clica em "Pedir aprovação" no card e gera um link tokenizado. O cliente recebe esse link (por WhatsApp ou e-mail) e consegue aprovar ou reprovar sem precisar criar conta no KTask. (Conteúdo completo em breve.)',
    tutorialPath: '/ajuda/aprovacoes/01-pedir-aprovacao-cliente',
  },
  {
    pergunta: 'Esqueci minha senha. O que faço?',
    resposta:
      'Na tela de login, clique em "Esqueci minha senha" e informe o e-mail cadastrado. Você vai receber um link de redefinição válido por algumas horas. (Conteúdo completo em breve.)',
  },
  {
    pergunta: 'Posso usar o KTask no celular?',
    resposta:
      'Sim. A central de ajuda e o app funcionam em qualquer navegador mobile. Não há app nativo na loja ainda; é PWA — dá pra adicionar à tela inicial. (Conteúdo completo em breve.)',
  },
  {
    pergunta: 'Onde vejo o histórico do que aconteceu num card?',
    resposta:
      'Abrindo o card, a aba "Atividade" mostra a linha do tempo: quem moveu, quem comentou, quando o cliente aprovou, etc. (Conteúdo completo em breve.)',
    tutorialPath: '/ajuda/cards/03-anexos-comentarios',
  },
  {
    pergunta: 'Como reporto um bug ou sugiro uma melhoria?',
    resposta:
      'Use o formulário abaixo, escolha a categoria "Problema" ou "Sugestão" e descreva o que aconteceu (passos pra reproduzir, se for bug). A gente responde por e-mail ou WhatsApp.',
  },
];

export function SupportFaq() {
  return (
    <section aria-labelledby="faq-title" className="space-y-4">
      <h2 id="faq-title" className="text-fg text-lg font-semibold tracking-tight">
        Perguntas frequentes
      </h2>
      <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
        {FAQ_PLACEHOLDER.map((item) => (
          <details key={item.pergunta} className="bg-bg group">
            <summary className="text-fg hover:bg-bg-subtle flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium transition-colors">
              <span>{item.pergunta}</span>
              <ChevronDown
                size={16}
                aria-hidden
                className="text-fg-muted shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-2 px-4 pb-4">
              <p className="text-fg-muted text-sm leading-relaxed">{item.resposta}</p>
              {item.tutorialPath && (
                <Link
                  href={item.tutorialPath}
                  className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  Ver tutorial completo
                  <ArrowRight size={12} aria-hidden />
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
