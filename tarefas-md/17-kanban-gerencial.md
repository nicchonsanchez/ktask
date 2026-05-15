# Visão Gerencial Consolidada

> Pedido do Lucas (PDF 14/05/2026): tela única que consolida cards de todos os quadros aos quais o gestor tem acesso, com filtros combinados, métricas e indicadores de atraso. Sem necessidade de "simular conta" de colaborador.

## Decisões tomadas (antes da implementação)

1. **Prioridade explícita**: descartada. Usar `cardColor` + Labels existentes. Reavaliar com Lucas após 2-3 semanas de uso (memória `feedback-reavaliar-prioridade-lucas`).
2. **Colunas unificadas**: Lucas vai propor uma ideia nova. Por enquanto, entrega é **lista plana (tabela)** ordenável/filtrável — não kanban. Quando definirmos colunas, viramos o toggle.
3. **Arquivados**: tela separada `/visao-gerencial/arquivados` com layout de tabela. Não aparecem na visão principal.
4. **Auditoria**: minimalista. Aproveita `CardVisit` (já existe + já é gravada) — mostra "Visualizado por" no card-modal. Nenhum log de page-view nem contador de vezes.
5. **Card privado** (`privacy: TEAM_ONLY`): gestor respeita privacy. Só vê cards onde é lead/member, igual qualquer outro user. Sem backdoor.
6. **Multi-fluxo**: card que está em N boards aparece 1 vez (no `primary` board), com badge "+N outros fluxos".

## Escopo

### Dentro

- Página `/visao-gerencial` acessível só para `GESTOR | ADMIN | OWNER`.
- Endpoint `GET /api/v1/management/cards` com filtros server-side, paginação cursor-based.
- Filtros: cliente (multiselect), responsável (multiselect, busca lead OR member), labels (multiselect), status de prazo (`overdue`/`today`/`next7`/`noDate`), busca por título, board (multiselect).
- Métricas no topo: total visível, atrasados, colaboradores únicos no resultado, clientes únicos.
- Tela `/visao-gerencial/arquivados` com layout DataTable + filtros + botão "Desarquivar".
- Link "Visão Gerencial" no menu lateral (oculto para `MEMBER | VIEWER`).
- Card-modal ganha bloco "Visualizado por (N)" com avatares + tooltip "Beltrano · há 3 dias".

### Fora

- Kanban com colunas unificadas (aguardando proposta do Lucas).
- Campo Priority Alta/Média/Baixa.
- Log de page-view ("X abriu a Visão Gerencial às Y").
- Contador "abriu 47 vezes" / heatmap de visualização.
- Edição inline na tela gerencial (clicar abre o card-modal padrão).
- Export CSV/PDF (potencial follow-up).

## Etapas

### 1. Backend endpoint principal

`apps/api/src/modules/management/management.module.ts` (novo módulo). Service + controller.

```ts
GET /api/v1/management/cards?
  cursor?
  limit=50
  q?
  companyIds=cuid1,cuid2
  userIds=cuid1
  labelIds=cuid1
  boardIds=cuid1
  dueStatus=overdue|today|next7|noDate
  includeArchived=false
```

Lógica:

1. Permission gate: `tenant.role IN ('GESTOR', 'ADMIN', 'OWNER')`. Senão 403.
2. Resolve boards acessíveis pro user (já temos `BoardAccessService.listAccessible`).
3. Query única com `select` enxuto:
   - `id, title, shortCode, dueDate, completedAt, isArchived, cardColor, status`
   - `board: { id, name, color }`
   - `list: { id, name }`
   - `lead: { id, name, avatarUrl }`
   - `members: { user: { id, name, avatarUrl } }` (limit ~5 mostrados na UI)
   - `labels: { label: { id, name, color } }`
   - `contacts (where type=COMPANY): { contact: { id, name } }` (limit 3)
   - `_count: { presences }` (pra badge "+N outros fluxos" se >1)
4. `WHERE`: organizationId + boardId IN (acessíveis) + filtros aplicados + `isArchived=false` (a menos que `includeArchived`).
5. **Privacy**: filtrar pos-query (`canViewCard`) ou no SQL via OR — privacy=PUBLIC OR leadId=user OR userId IN members.
6. Sort: `dueDate ASC NULLS LAST, createdAt DESC` (mais urgente em cima).

### 2. Endpoint arquivados

`GET /api/v1/management/cards/archived` — mesma assinatura mas `isArchived: true`. Reusa serviço, flag única.

### 3. Auditoria minimal (já tem)

`CardVisit` já é gravado em `cards.controller GET /:id` via `me.recordVisit`. **Só falta UI**.

Endpoint novo: `GET /api/v1/cards/:cardId/visits` retornando `{user, visitedAt}[]` ordenado por `visitedAt DESC`. Limite 50.

### 4. Frontend — queries

`apps/web/src/lib/queries/management.ts`:

```ts
export interface ManagementCardItem {
  id: string;
  shortCode: string | null;
  title: string;
  dueDate: string | null;
  cardColor: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'WAITING' | 'CANCELED';
  isArchived: boolean;
  board: { id; name; color };
  list: { id; name };
  lead: User | null;
  members: User[];
  labels: { id; name; color }[];
  companies: { id; name }[];
  presenceCount: number; // pra badge multi-fluxo
}

managementQueries.list(filters);
managementQueries.archived(filters);
managementQueries.metrics(filters); // contadores agregados
managementQueries.cardVisits(cardId);
```

### 5. Frontend — página principal

`apps/web/src/app/visao-gerencial/page.tsx`:

```
┌─────────────────────────────────────────────┐
│ Visão Gerencial          [Arquivados ↗]     │
├─────────────────────────────────────────────┤
│ 487 cards · 23 atrasados · 8 colaboradores  │
│         · 12 clientes                       │
├─────────────────────────────────────────────┤
│ [Busca…]  [Cliente ▾]  [Responsável ▾]      │
│ [Quadro ▾] [Prazo ▾]   [Etiquetas ▾]        │
├─────────────────────────────────────────────┤
│ Tabela:                                     │
│ Título | Cliente | Resp | Prazo | Quadro    │
│ Card X | ANEC    | João | 14/05 | Marketing │
│ Card Y | ECO     | Ana  | 13/05⚠| Conteúdo  │
│ …                                           │
└─────────────────────────────────────────────┘
```

Detalhes:

- Click em linha → abre card-modal (mesmo que /quadros usa).
- Linha de card atrasado: borda-esquerda vermelha + ícone alerta.
- Avatar responsável: 1 lead + até 3 members (overflow `+N`).
- Tag cliente: chip roxo (mesma cor da `Empresa` no card-modal).
- Header sticky em scroll.
- Empty state: "Nenhum card encontrado com esses filtros."

### 6. Frontend — arquivados

`apps/web/src/app/visao-gerencial/arquivados/page.tsx`:

- Mesmo layout de tabela, com colunas adicionais: Arquivado em, Arquivado por.
- Botão "Desarquivar" por linha (confirmar).
- Filtros: período de arquivamento (last 7/30/90 dias / tudo), cliente, responsável.

### 7. Frontend — link no menu

`apps/web/src/components/layout/sidebar.tsx`:

- Adicionar item "Visão Gerencial" com ícone `LayoutDashboard`.
- Mostrar apenas se `tenant.role IN ('GESTOR', 'ADMIN', 'OWNER')`.
- Posição: após "Quadros", antes de "Configurações".

### 8. Card-modal — "Visualizado por"

`apps/web/src/components/board/card-modal.tsx`:

- Novo bloco abaixo de "Equipe" (ou em pop-out lateral):
  ```
  Visualizado por (4)
  [Beltrano] [Fulana] [João] [Ana]
  ```
- Avatares clickable → tooltip "Nome · há X tempo"
- Tooltip também mostra: 🟢 Membro do card, 🔵 Lead, ⚪ Outro (passou por curiosidade)
- Se >5 visualizadores: avatares overflow `+N` → expande lista completa
- Query `cardsQueries.visits(cardId)` carregada lazy quando o modal abre.

### 9. Tutorial

`apps/web/content/ajuda/visao-gerencial/01-introducao.md`:

- O que é, quem vê, como usar
- Diferença pra "Quadros" (consolidação vs gestão por cliente)
- Cada filtro o que faz, exemplos
- Como interpretar atrasos
- FAQ: "Por que não vejo X card?" (privacy / sem acesso ao board)

## Critérios de aceite

- [ ] Gestor vê cards de todos os boards onde tem acesso, sem simular conta.
- [ ] Filtros combinados (AND): cliente + responsável + atraso devolvem subset correto.
- [ ] Cards arquivados não aparecem na visão principal.
- [ ] Tela `/visao-gerencial/arquivados` lista arquivados, permite desarquivar.
- [ ] Card-modal mostra "Visualizado por" com avatares + tooltip de timestamp.
- [ ] User com role `MEMBER`/`VIEWER` não vê o link no menu.
- [ ] User com role `MEMBER` acessando `/visao-gerencial` direto recebe 403.
- [ ] Card privado (`TEAM_ONLY`) onde gestor não é lead/member: não aparece.
- [ ] Card multi-fluxo aparece 1 vez (primary), com badge "+N fluxos".
- [ ] Atraso destacado em vermelho.
- [ ] Performance: ~1.300 cards carregam em <2s.
- [ ] Mobile responsivo (tabela vira card-list em <640px).
- [ ] Typecheck + lint verdes.

## Riscos / decisões

- **Sem kanban**: tabela é "menos sexy" mas atende RF02-RF09. Quando Lucas propuser modelo de colunas, viramos toggle.
- **CardVisit já existia**: visualizado-por sai praticamente de graça. Aproveitamos.
- **Privacy strict**: implica que se Lucas não é member de um card privado, ele não vê. Consistente com o modelo atual. Se ele reclamar, abrimos discussão de "role-based override".
- **Multi-fluxo 1 entry**: simplifica UI. Se Lucas pedir pra ver "todas as posições do mesmo card", abrimos follow-up.

## Follow-ups

- Kanban com colunas (após decisão do Lucas).
- Export CSV/PDF dos cards filtrados.
- Filtros salvos ("Minha visão de cada manhã").
- Reavaliar prioridade explícita após uso real.
- Log de page-view se Lucas insistir em auditoria mais granular.
