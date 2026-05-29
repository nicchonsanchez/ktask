# Aprovações: visão gerencial (todas pendentes da org)

> Status: **APROVADO (2026-05-29)** — implementar Fase 1 agora.

## Problema

`/aprovacoes` hoje filtra `reviewers.userId = me` — gestor só vê
aprovações onde ele próprio é revisor. Sem visão global, é impossível
saber quantas aprovações estão paradas, quem está segurando o que, e
quem precisa de cobrança.

## Escopo

### Fase 1 (esse PR)

- Aba "Todas" na própria página `/aprovacoes`, visível só pra
  OWNER/ADMIN/GESTOR.
- Endpoint `GET /v1/management/approvals` com `assertManagementAccess`
  - escopo por `listAccessibleBoardIds`.
- UI: card visual igual ao existente, mas botões Aprovar/Reprovar
  desabilitados pra approvals onde o user não é reviewer (tooltip
  "Aguardando X, Y, Z").
- Filtros: dropdown por reviewer + filtro de idade (>3d / >7d /
  todas) + métrica no header ("3 esperando >7d").

### Fora (follow-up)

- Botão "Cobrar" (re-envia WhatsApp pro reviewer via Evolution).
- Métricas históricas (tempo médio de aprovação por reviewer).
- Visão por board (agrupar lista).

## Arquitetura

**Backend** — reusa padrão da Visão Gerencial:

```
ManagementService.listApprovals(userId, tenant, query)
  ├─ assertManagementAccess(tenant)            // OWNER/ADMIN/GESTOR
  ├─ listAccessibleBoardIds(userId, tenant)    // escopa
  └─ cardApproval.findMany({
       where: {
         organizationId,
         status: PENDING,
         card: { boardId: { in: accessibleBoardIds } },
       },
       include: { card, requestedBy, reviewers: { include: { user } } }
     })
```

**Frontend**:

- `/aprovacoes/page.tsx` ganha `view: 'minhas' | 'todas'`
- Tabs render condicional: `view === 'todas'` só monta se `role ∈ {OWNER,ADMIN,GESTOR}`
- Reusa `ApprovalCard` (componente já existe na page), adiciona prop
  `canDecide: boolean` que desabilita botões + mostra tooltip.

## Critérios de aceite

- [ ] Membro comum só vê aba "Minhas" (sem aba "Todas")
- [ ] Gestor vê "Todas (N)" com count das pendentes que ele tem acesso
- [ ] Aba "Todas" lista approvals de TODOS os reviewers (não só do user)
- [ ] Botão Aprovar/Reprovar desabilitado quando user não é reviewer
- [ ] Tooltip "Aguardando: Anna, Lucas" no botão desabilitado
- [ ] Filtro por reviewer funciona (dropdown com lista de reviewers que
      têm approval pendente)
- [ ] Filtro de idade (>3d/>7d) funciona
- [ ] Header mostra "X esperando >7 dias" quando aplicável (cor laranja)
- [ ] Endpoint respeita `listAccessibleBoardIds` — gestor sem acesso
      a board X não vê approvals de cards desse board

## Estimativa

~5h: 2h backend + 2.5h frontend (aba + UI + filtros) + 0.5h validação
