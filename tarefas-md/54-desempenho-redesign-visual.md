# 54 — Redesign visual do Desempenho da Equipe

Branch: `feat/desempenho-redesign` (a partir de `main` f481bb1).
Base funcional: doc 52 (já em produção). Pedido do Nicchon (07/10/2026): layout
"mais moderno, respirável", sem sair do que o Lucas pediu e sem deixar nenhuma
funcionalidade de fora.

## Escopo

**Só camada visual (apps/web).** Nenhuma mudança em API, contratos, banco,
regras de contagem ou permissões.

Telas:

1. `/indicadores/desempenho` (relatório)
2. `/indicadores/desempenho/metas`
3. `/indicadores/desempenho/configuracao`
4. Componentes `components/performance/*` (filtros, metas, fluxo, drill-down)

Fora do escopo: cabeçalho/abas compartilhados de "Indicadores", caixa de
comentário com registro de contato (já no padrão do card), outras abas.

## Diagnóstico (prints "antes" em 1440px)

- Sem título nem hierarquia; ações (Configurar, Gerenciar metas) são links pequenos.
- Metas ocupam meia tela antes dos filtros; texto repetido (alcance · métrica ·
  período) e histórico espremido.
- Filtros em 11px, sem ícones, parecem secundários.
- 8 KPIs idênticos; avanços/retrocessos/transferências/finalizações não aparecem
  como composição das movimentações.
- Comercial = 7 caixas iguais; a história é um funil (contato → reunião → proposta).
- Tabela por colaborador com colunas espalhadas; zeros pesam.
- Gráfico com barras gigantes, sem eixo, sem valores, sem rótulo de dia.
- Tabela diária sempre aberta, empurra o resto pra baixo.
- Fluxo do trabalho: números soltos, gargalo não destacado.

## Inventário de funcionalidades (nada pode sumir)

| Funcionalidade                                                                                                  | Onde fica no novo layout                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Aviso "só ações de pessoas; clique para ver registros"                                                          | Subtítulo do cabeçalho                                                         |
| Configurar relatórios / Gerenciar metas / Criar metas                                                           | Botões no cabeçalho + link na faixa de metas                                   |
| Metas ativas com % e 3 períodos anteriores                                                                      | Faixa "Metas" compacta (mini-barras do histórico)                              |
| Filtros: período (7 presets + personalizado), área, fluxos (multi), colaborador, cliente, limpar                | Barra de filtros fixa, com ícones                                              |
| Filtros na URL (link compartilhável)                                                                            | Inalterado                                                                     |
| 8 KPIs clicáveis (cards, ações, movimentações, avanços, retrocessos, transferências, finalizações, comentários) | "Atividade" (3) + "Movimentações" com barra de composição (5), todos clicáveis |
| Frase "X movimentações = …" incl. sem classificação                                                             | Rodapé do bloco Movimentações                                                  |
| Bloco Comercial (5 clicáveis + 2 follow-ups)                                                                    | Funil com setas + painel de follow-ups                                         |
| Resumo por colaborador (ordem alfabética, nome abre histórico, números clicáveis, coluna Contatos condicional)  | Tabela redesenhada                                                             |
| Evolução no período com 7 métricas                                                                              | Gráfico com eixo, valores e rótulos                                            |
| Tabela por dia (≤31 dias)                                                                                       | Alternância "Gráfico / Tabela por dia"                                         |
| Fluxo do trabalho (8 indicadores, tempo até concluir, tempo por etapa, aviso de não configurado)                | Cartão por fluxo, etapa mais demorada destacada                                |
| Visão individual (histórico) + "Ver equipe toda"                                                                | Cabeçalho de perfil + lista                                                    |
| Drill-down de qualquer número                                                                                   | Inalterado (visual levemente ajustado)                                         |
| Mobile 390px (metas em carrossel, abas roláveis)                                                                | Mantido e revisado                                                             |

## Etapas

1. Prints "antes" (feito) com ambiente local descartável + seed visual.
2. Primitivos visuais compartilhados (`components/performance/ui.tsx`): `Panel`,
   `SectionTitle`, `StatTile`, chips.
3. Relatório: cabeçalho, metas, filtros, atividade/movimentações, comercial,
   tabela, evolução, fluxo, visão individual.
4. Metas: formulário com rótulos, cartões com rodapé de ações.
5. Configuração: lista de fluxos em cartões, editor em seções, barra de salvar.
6. Prints "depois" em 1440px e 390px, claro; conferência do inventário.
7. typecheck + lint + testes web; PR.

## Critérios de aceite

- [x] Todas as linhas do inventário presentes e funcionando (clique abre drill-down certo).
- [x] Nenhum arquivo fora de `apps/web` alterado (exceto este doc/checklist).
- [x] Sem emoji em UI; ícones Lucide; tokens do design system (dark mode ok).
- [x] Sem rolagem horizontal da página em 390px (scrollWidth = 390 nas 3 telas).
- [x] `tsc --noEmit` e `lint` do web verdes (web não tem testes automatizados).

## Riscos / decisões

- Tabela por dia passa a ficar atrás de uma alternância (continua a 1 clique).
- Gargalo destacado = etapa com maior tempo médio (só leitura do dado existente).
- Taxa "x% realizados" no funil comercial é derivada (realizados / registros),
  sem novo cálculo no backend.
