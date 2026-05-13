# Postmortems — KTask

Registro de incidentes e bugs significativos do KTask. Cada postmortem responde "o que aconteceu, como detectamos, o que aprendemos, o que vamos mudar pra não voltar a acontecer".

Postmortem **não é** auditoria pra apontar culpado. É ferramenta de aprendizado coletivo. Linguagem é blameless: o sistema permitiu o erro, o processo não pegou, a instrumentação faltou — nunca "fulano errou".

## Quando criar postmortem

Obrigatório:

- Qualquer incidente P0 ou P1 (ver `docs/runbooks/README.md` pra definição de severidade)
- Bug que causou perda de dados, corrupção, ou prejuízo financeiro

Recomendado:

- Bug P2 com efeito sistêmico (múltiplos paths do código afetados pela mesma causa raiz)
- Detecção tardia: bug que viveu em produção por mais de 1 semana sem ser percebido
- Quase-incidente que só não escalou por sorte

Não precisa:

- Bug pontual corrigido no mesmo dia, sem impacto em usuário, sem padrão sistêmico

## Quem escreve

Quem liderou a resolução. Idealmente terminado em até 7 dias após o incidente, enquanto a memória está fresca.

## Como escrever blameless

Antes de submeter, releia procurando frases que culpam pessoa. Reescreva pra culpar o sistema:

- Antes: "Fulana esqueceu de criar a CardPresence ao implementar createChild."
- Depois: "O método createChild foi implementado sem replicar a sequência canônica de criação de Card. Não havia helper centralizado nem teste e2e cobrindo o caminho — o esquecimento passou em revisão."

Nomes próprios são OK em "Detectado por", "Autor do postmortem" e "Responsável" do action item. Não em frases de causa.

## Como nomear

`AAAA-MM-DD-titulo-curto-kebab.md`. Data é a do incidente (não a da escrita do postmortem).

## Índice

| Data                                         | Título                                        | Severidade | Resumo                                                                                                  |
| -------------------------------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| [2026-05-13](2026-05-13-carrossel-cannes.md) | Cards invisíveis no kanban (CARROSSEL CANNES) | P2         | 9 cards criados via `createChild` ficaram sem `CardPresence`/`shortCode` por 17 dias antes da detecção. |

## Template

Use [`_TEMPLATE.md`](_TEMPLATE.md) como ponto de partida.

## Política de action items

Cada action item tem dono, tipo (preventivo / detectivo / corretivo / mitigatório) e prioridade. Item sem dono não é item — é desejo.

Pós-postmortem, action items viram issues no GitHub linkadas ao arquivo. Status reflete a issue, não o doc — o postmortem é registro histórico, não plano vivo.
