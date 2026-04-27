# 16 — Importer de fluxo Ummense (CSV)

> **Status:** planejada (2026-04-27). Depende parcialmente de Contatos
> (doc 19) e shortCode (doc 24). Pode rodar antes deles com perda
> consciente nos campos não suportados.

## Motivação

Ummense exporta cada fluxo (board) como CSV via "Exportar fluxo". Cada
linha = 1 card. Kharis tem múltiplos fluxos em produção no Ummense
(Tecnologia, Atendimento, etc). Pra migrar pro KTask sem perder histórico,
precisamos de um importer que mapeie o CSV do Ummense pras nossas entidades.

## Escopo

**Entrega:**

- Endpoint `POST /v1/admin/import/ummense-flow` (multipart/form-data com `.csv`)
- Service `UmmenseImporterService` que parseia CSV, valida e cria entidades
- Permissão: OWNER/ADMIN da Org
- Página `/configuracoes/importar` (admin only) com upload e relatório de
  resultado (criados / pulados / erros)

**Fora do escopo:**

- Importar **anexos** (Ummense exporta só refs textuais, não os blobs)
- Importar **respostas de formulário** (feature inexistente no KTask)
- Importar **privacidade por card** (feature inexistente — todos importam público)

## Mapeamento dos 24 campos do CSV

| #   | Coluna CSV              | KTask                                                          | Notas                                                                                         |
| --- | ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Nome                    | `Card.title`                                                   | direto                                                                                        |
| 2   | Identificador           | `Card.shortCode` (depende doc 24)                              | preserva `20250409000751` ou ignora                                                           |
| 3   | Fluxos                  | `Board.name` (lookup ou cria)                                  | só importa cards do board do CSV; outros fluxos viram CardPresence se já existir card linkado |
| 4   | Coluna atual            | `List.name` (lookup ou cria)                                   | criar lista se não existir, com posição final                                                 |
| 5   | Data de início no fluxo | `Card.enteredListAt` + `CardPresence.addedAt`                  | parse `dd/mm/yyyy hh:mm:ss`                                                                   |
| 6   | Descrição               | `Card.description`                                             | HTML → ProseMirror JSON via parser (`@tiptap/html`)                                           |
| 7   | Status                  | `Card.completedAt`                                             | `completed` → preencher; `active`/outros → null                                               |
| 8   | Privacidade             | **ignorada**                                                   | feature não existe                                                                            |
| 9   | Líder                   | `Card.leadId`                                                  | resolver nome → User da Org (case-insensitive, ignorar acentos)                               |
| 10  | Equipe                  | `CardMember[]`                                                 | split por `\|`, resolver cada nome → User                                                     |
| 11  | Contatos                | `CardContact[]` (depende doc 19)                               | split por `\|`, criar contato se não existir                                                  |
| 12  | Emails dos contatos     | `Contact.email`                                                | match posicional com Contatos da coluna 11                                                    |
| 13  | Tags                    | `CardLabel[]`                                                  | split por `\|`, criar Label se não existir (cor random)                                       |
| 14  | Arquivos                | **ignorada com aviso**                                         | só refs, sem blobs                                                                            |
| 15  | Card Pai                | `Card.parentCardId`                                            | resolver pelo `Identificador` do pai (precisa shortCode)                                      |
| 16  | Cards Filhos            | derivado da coluna 15 dos outros cards                         | nada a fazer                                                                                  |
| 17  | Feed                    | `Activity[]` (type=CARD_UPDATED genérico)                      | split por `\|`, payload `{ rawText: '...' }`                                                  |
| 18  | Anotações da timeline   | `Comment[]`                                                    | split por `\|`, body texto plano                                                              |
| 19  | Registros da timeline   | merge no Feed (col 17)                                         | mesma estrutura, evitar duplicação                                                            |
| 20  | Resposta de formulário  | **ignorada**                                                   | feature não existe                                                                            |
| 21  | Data de entrega         | `Card.dueDate`                                                 | "Sem data" → null; senão parse dd/mm/yyyy                                                     |
| 22  | Última interação        | **ignorada se doc 26 parkado**, senão `Card.lastInteractionAt` | depende da feature 26                                                                         |
| 23  | Criado em               | `Card.createdAt`                                               | parse + override (Prisma permite via `data`)                                                  |
| 24  | Finalizado em           | `Card.completedAt` (se status=completed)                       | sobrescreve col 7 se mais preciso                                                             |

## Etapas

1. **Schema**: campo `Card.shortCode String? @unique` (nullable até feature shortCode entrar; importer preenche se vier no CSV)
2. **Parser CSV**: usar `papaparse` (já é padrão do ecossistema), suportar quoted multi-line cells
3. **Resolução de nomes**: helper `resolveUserByName(name, orgId)` com fallback (sem match → loga warning, deixa null)
4. **Pre-flight**: 1ª passada lista todos os contatos/labels/lists/users mencionados, devolve relatório do que VAI criar pro admin confirmar antes de commitar
5. **Import transacional**: 2ª passada cria tudo numa transaction (cards do mesmo CSV inteiros num batch; falha → rollback total)
6. **Pais antes de filhos**: ordenar cards topologicamente; pais primeiro pra `parentCardId` resolver
7. **Idempotência**: se `shortCode` já existe na Org, **pular com warning** (re-import seguro)
8. **Relatório final**: JSON com `{created: N, skipped: N, errors: [...]}`

## Critérios de aceite

- [ ] Endpoint POST funciona com .csv exportado do Ummense (testar com `flow_projects_20260426230442.csv`)
- [ ] Re-import do mesmo CSV não duplica (idempotente via shortCode)
- [ ] Cards-pais e cards-filhos preservam relação
- [ ] Líder, Equipe, Tags resolvidos / criados
- [ ] Contatos criados ou linkados (depende doc 19)
- [ ] Comentários e Activity preservados como rows
- [ ] Página `/configuracoes/importar` mostra preview + confirmação + relatório
- [ ] Erros não derrubam o import inteiro (continua próximo card)

## Riscos / decisões

- **Sem shortCode** o "Card Pai" não tem como ser resolvido (fica null com warning). Implementar shortCode **antes** evita perda de hierarquia
- **HTML → ProseMirror**: nem todo HTML do Ummense é coberto pelo schema do Tiptap. Tags exóticas viram texto. Ok pra MVP
- **Datas em fuso BRT-3**: parse com `date-fns-tz` pra evitar drift de 3h
- **Volume**: CSVs reais podem ter 1000+ cards. Stream parser pra não estourar memória
- **Feed/Registros vs Activity tipado**: o Feed do Ummense é texto livre tipo "Alterou a previsão de entrega de X para Y". Importar como `type=CARD_UPDATED` + `payload={rawText: ...}` perde a tipagem mas preserva o histórico. Aceitável
- **Cards em múltiplos fluxos**: Ummense permite mesmo card em N fluxos. CSV exporta um fluxo por vez. Se importar 2 CSVs do mesmo card, criar `CardPresence` no segundo (multi-fluxo já existe — doc 13)

## Estimativa

~6-10h. Mais simples se shortCode (doc 24) e Contatos (doc 19) já estiverem prontos.
