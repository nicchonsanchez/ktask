# Briefings de documentação técnica

Esta pasta contém **prompts auto-suficientes** para gerar a documentação técnica do KTask em sessões dedicadas. A motivação:

- Sessões longas degradam atenção. Cada documentação merece foco total.
- Cada arquivo aqui é um briefing autônomo: você cola num chat novo de Claude (sem histórico prévio do projeto), o modelo lê o repo + o briefing e entrega a documentação pronta.

## Como usar

1. Abra um **chat novo** no Claude Code (ou outra ferramenta com acesso a este repositório).
2. Garanta que o cwd é `c:/xampp/htdocs/Kharis/sistema-gestao-de-tarefas`.
3. Copie o conteúdo do briefing desejado (ex: `01-readme-raiz.md`).
4. Cole na conversa nova. O Claude vai executar a **Fase 0 (Inventário)** primeiro e te pedir aprovação antes de produzir o doc final.
5. Revise o inventário. Adicione/corrija o que faltou. Aprove.
6. Receba o entregável final. Revise, commite.

## Lista de briefings (ordem sugerida)

| #   | Briefing                             | Entregável                                           | Prioridade |
| --- | ------------------------------------ | ---------------------------------------------------- | ---------- |
| 01  | `01-readme-raiz.md`                  | `README.md` na raiz do projeto                       | Alta       |
| 02  | `02-adr-template-e-iniciais.md`      | `docs/adr/` com template + 5 ADRs históricas         | Alta       |
| 03  | `03-runbook-incidentes.md`           | `docs/runbooks/` com 5 incidentes prováveis          | Alta       |
| 04  | `04-swagger-publicado.md`            | Rota `/docs` expondo OpenAPI + instruções de uso     | Média      |
| 05  | `05-er-diagram.md`                   | `docs/er-diagram.md` (Mermaid) + descrição           | Média      |
| 06  | `06-postmortem-template-e-cannes.md` | `docs/postmortems/` template + caso CARROSSEL CANNES | Média      |
| 07  | `07-onboarding-dev.md`               | `docs/onboarding.md` (checklist 30/60/90 dias)       | Média      |
| 08  | `08-architecture-overview.md`        | `docs/architecture.md` (1 página, C4 nível 1+2)      | Baixa      |
| 09  | `09-ajuda-frontend.md`               | Central de Ajuda (`/ajuda/*`) — estrutura frontend   | Média      |
| 10  | `10-suporte-formulario-card.md`      | Formulário `/ajuda/suporte` que vira card no KTask   | Média      |
| 11  | `11-conteudo-tutoriais.md`           | Conteúdo escrito dos 15 tutoriais (após 09)          | Média      |

## Princípios dos briefings

Todos os briefings seguem 4 camadas pra garantir cobertura sem alucinação:

1. **Fase 0 — Inventário forçado**: antes de escrever qualquer linha do entregável, o Claude lista TODAS as features/módulos/decisões que encontrou no repo. Aguarda você aprovar/corrigir antes de continuar.
2. **Pontos de partida explícitos**: cada briefing aponta paths exatos pra ler (tarefas-md/\*, schema.prisma, módulos do api, rotas do web). Sem isso, o Claude vagueia.
3. **Uso do agente Explore**: pra cada área crítica, briefing pede `Agent(subagent_type=Explore)` com `thorough` — redundância intencional pra pegar o que escapou da Fase 0.
4. **Auto-auditoria final**: antes de entregar, Claude lista o que ficou de fora e por quê (escopo intencional vs esquecimento), e compara com o inventário aprovado.

## Template

[`_TEMPLATE.md`](_TEMPLATE.md) é o molde pra criar novos briefings. Use quando surgir necessidade de uma documentação ainda não coberta.
