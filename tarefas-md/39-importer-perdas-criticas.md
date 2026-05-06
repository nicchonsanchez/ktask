# 39 — Importer Ummense V2.2: corrigir perdas criticas

## Status

**Em andamento** (2026-05-06).

## Contexto

Auditoria das CSVs Ummense (24 arquivos, 4852 cards) revelou 3 colunas
com conteudo importante sendo descartadas pelo importer atual:

1. **Col 7 Privacidade** — 99.5% preenchido. Mapear pra `Card.privacy`.
2. **Col 17 Anotacoes da timeline** — 40% (1956 cards, ate 7.6k chars).
   Conteudo operacional puro, links, decisoes. Vira comentario(s).
3. **Col 19 Resposta de formulario** — 0.5% (25 cards) mas inestimavel
   quando presente: briefings estruturados de cliente.

Auditoria completa em conversa anterior.

## Decisoes

### A. Privacidade (col 7)

- `private-team-edit` (e qualquer prefixo `private-*`) → `TEAM_ONLY`
- `public-*` ou vazio → `PUBLIC` (default)
- Aplicar nas duas funcoes de execute (V1 e V2).

### B. Anotacoes (col 17) → Comentario unico por card

- Separador `|` no Ummense delimita anotacoes diferentes.
- Decisao: **1 comentario unico** com cada anotacao em paragrafo
  separado, prefixado por header reconhecivel:
  `📝 Anotacoes importadas do Ummense:\n\n<blocos>` — sem emoji per
  CLAUDE.md, usar texto.
  Final: `Anotacoes importadas do Ummense:\n\n- bloco1\n- bloco2`
- Autor: usuario que disparou o import (auditavel, ja temos `tenant.userId`).
- Linkado ao card via `Comment.cardId`.
- Doc tipo `Comment` ja suporta texto puro (campo `body`).

### C. Resposta de formulario (col 19) → Comentario fixo

- 1 comentario com header "Resposta de formulario importada do
  Ummense:" + corpo cru (separadores `|` viram quebras de linha).
- Mesmo autor que B.

## Plano

1. Adicionar helper `parsePrivacyUmmense(raw)` no service.
2. Adicionar helper `buildImportComments(row, actorId)` retornando
   array de Prisma create payloads pros comentarios derivados (col 17 +
   col 19).
3. Patch nos 2 paths de execute:
   - `executeImportV2` (proximo de `createCardFromRow` ~726)
   - `execute` legado (~1223)
4. Criar comentarios dentro da mesma transacao do card (atomicidade).
5. Doc: incluir nos warnings/report quantas anotacoes/respostas foram
   importadas (nao bloqueante; bom pra auditoria).

## Critérios de aceite

- [ ] Card importado com `private-*` na col 7 vira `Card.privacy = 'TEAM_ONLY'`
- [ ] Card com col 17 nao-vazia ganha 1 comentario com header
      "Anotacoes importadas do Ummense:" e o conteudo
- [ ] Card com col 19 nao-vazia ganha 1 comentario com header
      "Resposta de formulario importada do Ummense:"
- [ ] Re-import (mesmo shortCode) NAO duplica comentarios — pular se
      ja existe `Comment` cujo body comeca com o mesmo header pra esse
      cardId
- [ ] Typecheck + lint passam
