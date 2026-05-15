# Condicional de Empresa nas automações

> Espelhar o que já existe pra Tags: permitir filtrar automações pela empresa vinculada ao card.

## Escopo

### Dentro

- 4 operadores na condicional de empresa: `EQUALS` (é a empresa X), `IN` (é alguma destas), `NOT_IN` (não é nenhuma destas), `IS_NONE` (não possui empresa vinculada).
- Backend: avaliar condição na engine de automation (`automations.engine.ts`).
- Frontend: UI no editor de automação seguindo padrão das Tags.
- Tutorial: documentar no [automacoes/01-conceito-geral.md](apps/web/content/ajuda/automacoes/01-conceito-geral.md).

### Fora

- Condicional de "Contato" (pessoa). Empresa é só um tipo de Contact mas a regra começa só com empresa pra simplificar.
- Condicional de "Empresa vinculada ao Contato vinculado ao card" (indireção). Fica como follow-up se aparecer demanda.

## Etapas

1. **Schema**: a condição de automation provavelmente já é JSON com `kind: 'tag' | 'empresa' | ...`. Verificar formato atual e estender pra incluir `kind: 'company'` com `{ operator: 'EQUALS' | 'IN' | 'NOT_IN' | 'IS_NONE', companyIds: string[] }`.
2. **Engine**: adicionar avaliação em `evaluateCondition` (ou nome equivalente) — buscar `cardContacts` do card, filtrar `type = COMPANY`, comparar.
3. **DTO Zod**: aceitar novo shape.
4. **Frontend**: novo bloco "Empresa" no editor de condição, com select de operador + multi-select de empresas (já tem `ContactsBlock`/`CompanyPicker` em algum lugar — reutilizar).
5. **Tutorial**: adicionar à lista de condições disponíveis.

## Critérios de aceite

- [ ] Posso criar automation com condição "Empresa é Aliança Francesa".
- [ ] Posso criar com "Empresa é alguma de: A, B, C".
- [ ] Posso criar com "Empresa não é nenhuma de: A, B".
- [ ] Posso criar com "Card não tem empresa vinculada".
- [ ] Card sem empresa **falha** em `EQUALS` e `IN`, **passa** em `NOT_IN` (vacuosamente) e `IS_NONE`.
- [ ] Typecheck + lint verdes.

## Riscos / decisões

- `NOT_IN` com card sem empresa: passa (vacuosamente verdadeiro). Documentar.
- Se a empresa for deletada (soft) depois da automation ser criada: a automation continua referenciando o ID. Quando avalia, `cardContacts.companyId === deletedId` retorna false. Aceitável (admin pode editar/remover a automation).
