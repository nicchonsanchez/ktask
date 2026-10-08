# 55 — Transferir responsabilidades entre membros

Branch: `feat/transferir-responsabilidades` (a partir de `main` f481bb1).
Pedido do Nicchon (08/10/2026): quando uma pessoa sai e outra entra no lugar,
passar de uma vez tudo o que está pendente com a antiga (cards, tarefas etc.).

## Situação atual

- Não existe transferência em massa. "Remover membro"
  (`MembershipsService.remove`) só apaga o `Membership`: cards, tarefas e
  aprovações continuam apontando para o usuário removido.
- Trocar um responsável de card um a um dispara notificação (app + WhatsApp)
  por card — inviável em massa.

## Escopo

Ação de Dono/Admin no modal do membro (`/configuracoes/membros` → membro →
aba **Responsabilidades**): escolher a pessoa que assume, ver a prévia com
contagens, marcar o que transferir e confirmar.

| Categoria                                                             | Regra                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cards em que é **responsável** (`Card.leadId`)                        | só cards não excluídos e em aberto (ACTIVE/WAITING); a nova pessoa também entra como membro do card                                                                |
| Cards em que é **membro** (`CardMember`)                              | cards não excluídos e em aberto; nova pessoa entra (mesmo papel), antiga sai                                                                                       |
| **Tarefas de checklist** (`ChecklistItem.assigneeId`)                 | não concluídas, em cards não excluídos (inclui recorrentes e follow-ups)                                                                                           |
| **Tarefas avulsas** (`Task.assigneeId`)                               | não concluídas                                                                                                                                                     |
| **Aprovações pendentes como aprovadora** (`CardApprovalReviewer`)     | só PENDING; troca o usuário e **gera novo link** (o antigo, que funciona sem login, deixa de valer); se a nova já é aprovadora do mesmo pedido, só remove a antiga |
| **Aprovações pendentes que ela pediu** (`CardApproval.requestedById`) | só PENDING, para a nova receber o resultado                                                                                                                        |
| **Acesso aos fluxos** (`BoardMember`)                                 | nova pessoa entra nos mesmos quadros com o mesmo papel (se já for membro, mantém o papel mais alto); a antiga não é removida aqui                                  |
| **Automações** que citam a pessoa                                     | `actionConfig`: chaves `userId`, `userIds`, `assigneeUserId` (inclui itens aninhados)                                                                              |

Fica com a pessoa antiga, de propósito: comentários, histórico, horas,
tarefas concluídas, cards concluídos/cancelados, aprovações já decididas,
números do Desempenho. Metas individuais **não** são transferidas (a prévia
lista para o admin decidir).

Fora do escopo:

- Aprovador externo (cadastrado só por telefone, sem usuário) — o Nicchon não
  confirmou se é o caso; fica para depois.
- Suspender/remover a pessoa antiga automaticamente — continua pelas ações
  existentes (aba Segurança / lista de membros); a tela só sugere.
- Desfazer a transferência.

## Etapas

1. Contratos (`packages/contracts/src/responsibility-transfer.ts`): schema da
   requisição, DTOs de prévia e resultado, rótulos.
2. Migration aditiva: `ActivityType.MEMBER_RESPONSIBILITIES_TRANSFERRED`.
3. API em `members-admin`:
   - `GET  /v1/admin/members/:userId/responsibilities` → prévia (contagens,
     até 5 exemplos por categoria, automações, metas).
   - `POST /v1/admin/members/:userId/responsibilities/transfer` → executa.
   - Tudo numa transação; permissões de Dono/Admin (Admin não mexe em Dono).
4. Registro:
   - Por card afetado: `CARD_UPDATED` com `payload.kind = 'responsibility_transfer'`,
     `origin = SYSTEM` (não infla as "ações" do admin no Desempenho).
   - Um `MEMBER_RESPONSIBILITIES_TRANSFERRED` (auditoria, com contagens).
   - Uma notificação in-app de resumo para quem assume (sem WhatsApp).
5. Web: aba "Responsabilidades" no modal do membro; texto da timeline para o
   novo `kind`; formato da atividade de auditoria.
6. Testes unitários (substituição em `actionConfig`, regras puras) + teste
   ponta a ponta local contra Postgres descartável.

## Critérios de aceite

- [x] Prévia mostra contagens corretas por categoria.
- [x] Transferência move só o que está pendente; histórico intacto.
- [x] Link de aprovação antigo deixa de funcionar; novo aprovador vê o pedido.
- [x] Sem duplicar membro em card/quadro; sem notificação por card.
- [x] Timeline do card mostra a transferência.
- [x] Não-admin recebe 403; Admin não transfere de/para Dono indevidamente.
- [x] typecheck + lint + testes da API e do web verdes.

## Riscos / decisões

- Transação única: ou tudo muda, ou nada.
- `updateMany` não passa pelo filtro de soft delete → `deletedAt: null`
  explícito em todo where de Card.
- Volume esperado: centenas de linhas no máximo; transação com timeout maior.

## Verificação (08/10/2026)

- Teste ponta a ponta local (Postgres descartável, 23 checagens, todas ok):
  prévia só com pendentes; cards concluídos, tarefas concluídas e comentários
  ficam com a pessoa antiga; link de aprovação antigo para de funcionar e
  quem assume vê o pedido; papel no fluxo copiado; automação SET_LEAD
  reapontada; 1 notificação de resumo; timeline com origin SYSTEM; auditoria;
  membro comum recebe 403; transferir para si mesmo dá 400.
- Fluxo pela interface (modal → Responsabilidades → Transferir → confirmar).
- API: 179 testes, lint e typecheck verdes; web: lint e typecheck verdes.
- Não testado automaticamente: regra "Admin não transfere de Dono" (só leitura
  de papel, mesma checagem do resto do módulo).
