# 38 — Empresas (clientes): filtro + indicadores

## Status

**Em andamento** (2026-05-06).

## Decisão de modelagem

**Reaproveitar `Contact` (type=COMPANY)** em vez de criar uma entidade
nova `Company`.

Razões:

- Já existe modelo `Contact { type: PERSON | COMPANY, parentId }`
- Hierarquia pessoa→empresa via `Contact.parentId` já implementada e
  validada (parent precisa ser COMPANY)
- Vínculo card↔contato via `CardContact` (M:N) já existe
- `/contatos` já tem filtro por type
- Card modal já tem `ContactsBlock` que aceita ambos os tipos

Criar um modelo `Company` separado duplicaria o conceito sem ganho.

**Trade-off aceito:** `CardContact` é M:N — um card pode estar
vinculado a 2+ empresas (ex: campanha conjunta). Isso pode causar
double-counting em indicadores. Pra começar, é feature (mostra
envolvimento real). Se virar dor, adicionar UNIQUE parcial depois.

## Escopo

### Em escopo

1. Atalho/página `/empresas` na sidebar — lista de Contact type=COMPANY
   com contagem de cards e arquivamento
2. Card modal: split visual do block "Contatos" em 2 blocos —
   "Empresa(s)" (companies vinculadas) + "Contatos" (pessoas)
3. Filtro no popover do board: nova seção "Empresa"
4. Página/aba `/indicadores/empresas` — agregação por empresa
   (cards criados, finalizados, horas, abertos hoje)

### Fora de escopo (V1)

- Cadastro de CNPJ/endereço/logo (Contact já tem `document` mas UI atual
  não destaca; deixar como está)
- M:N → 1:N forçado por constraint
- Página de detalhe da empresa (já existe `/contatos/[id]` que serve)
- Permissões diferenciadas por empresa
- Vincular usuário interno como "responsável" pela empresa

## Etapas

1. **Backend: incluir contacts em CardListItem**
   - `boards.service.ts:228-247` — adicionar
     `contacts: { include: { contact: { select: { id, name, type } } } }`
     no include do card.
   - Atualizar `boards.ts` (web): `CardListItem.contacts`

2. **Sidebar: item "Empresas"**
   - `topbar.tsx`: adicionar `{ href: '/empresas', label: 'Empresas' }`
     entre Contatos e Empresa (configuração da Org)

3. **Página `/empresas`**
   - `apps/web/src/app/(app)/empresas/page.tsx` reutilizando
     `contactsQueries.list({ type: 'COMPANY' })`
   - Listagem com busca, contagem de cards, ações (editar via mesmo
     dialog do /contatos, arquivar via soft-delete `deletedAt`)
   - Botão "Nova empresa" abre o mesmo dialog de criação com type
     trancado em COMPANY

4. **Card modal: split em 2 blocos**
   - `card-modal.tsx`: substituir o block único "Contatos" por dois:
     "Empresa" (filtra type=COMPANY) e "Contatos" (filtra type=PERSON)
   - `contacts-block.tsx`: aceitar prop `filterType?: ContactType` que
     filtra o array `linked` e o picker

5. **Filtro de board: seção "Empresa"**
   - `board-filter-popover.tsx`: nova seção entre "Pessoas" e
     "Etiquetas"
   - Lista as Companies que aparecem em pelo menos 1 card do board
     (deduplica de `cards.flatMap(c => c.contacts)` filtrando COMPANY)
   - `applyBoardFilters`: novo branch — se `companyIds.length > 0`,
     card precisa ter pelo menos 1 contact COMPANY que casa

6. **Indicadores por empresa**
   - Backend: `GET /api/v1/indicators/companies?from&to&boardId?` retorna
     array `[{ companyId, name, cardsCreated, cardsCompleted,
hoursWorked, cardsOpenToday }]`
   - Web: nova aba em `/indicadores/empresas` com tabela + filtros de
     período e board

## Critérios de aceite

- [ ] `/empresas` lista todas as empresas (Contact COMPONY) com busca
- [ ] Card modal mostra "Empresa" e "Contatos" como blocos separados;
      adicionar empresa não suja o block de contatos
- [ ] Popover de filtro do board tem seção Empresa multi-select; filtro
      AND com outras seções, OR entre empresas
- [ ] Aba `/indicadores/empresas` agrega cards e horas corretamente; row
      "(sem empresa)" pra cards não-vinculados
- [ ] Drill-down do indicador linka pros cards filtrados

## Riscos / decisões

- **Double counting**: card com 2 empresas conta nas duas no relatório.
  Aceito (M:N). Documentar em hint do indicador.
- **Cards históricos sem empresa**: linha "(sem empresa)" no indicador
  evidencia o gap pra time vincular manualmente.
- **Performance**: indicador agrega timer sessions; já indexado por
  cardId/userId. Adicionar índice `Card.organizationId, completedAt`
  se necessário (provavelmente já existe via PK).
- **Alinhar nomenclatura**: hoje sidebar tem "Contatos" + "Empresa"
  (singular, configuração da Org). Adicionar "Empresas" (plural,
  clientes) pode confundir. Avaliar renomear "Empresa" → "Minha
  organização" no sidebar pra desambiguar.
