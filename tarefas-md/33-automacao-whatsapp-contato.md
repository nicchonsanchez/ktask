# 33 — Automação WhatsApp: enviar pra Contato (CRM e card)

## Contexto

Hoje a action `SEND_WHATSAPP` tem 3 modos de destinatário:

- **Líder do card** — phone do `Card.lead.phone`
- **Membro fixo** — phone de um `User` específico da Org
- **Número avulso** — phone literal E.164

Nada usa o módulo de Contatos (CRM). O caso de uso óbvio — "manda
pro cliente quando o card dele entrar em APROVAR" — fica de fora.

Plano: dois novos modos.

- **Contato do card** (dinâmico): no momento que dispara, lê todos os
  `CardContact` do card e envia pra cada um. Uma automação atende N
  cards, cada um com cliente diferente.
- **Contato fixo** (do CRM): seleciona um `Contact` específico no
  cadastro da automação. Use case: notificar sempre o gestor X de
  uma agência parceira.

## Decisões tomadas (com user)

1. **Card com múltiplos contatos**: envia pra TODOS.
2. **Card sem contato vinculado**: pula silenciosamente (com log
   resumo).
3. **Variáveis no template**: scope por modo. `{{contact.name}}`,
   `{{contact.email}}`, `{{contact.firstName}}` só aparecem em modos
   de contato. `{{recipient.name}}` continua existindo nos modos
   antigos. **Não misturar tipos** — variáveis erradas viram string
   vazia.
4. **Contato sem WhatsApp**: registra entrada na timeline do card
   dizendo "Mensagem não enviada para contato Y porque ele não tem
   WhatsApp cadastrado". Resumo em uma única Activity quando há
   múltiplos: "X enviadas, Y puladas (sem WhatsApp): nomes".
5. **Atomicidade**: cada contato vira AutomationRun próprio.
   - **V1 entrega pragmática**: 1 AutomationRun no nível do trigger,
     mas o `result` JSON do run inclui array `attempts: [{ contactId,
name, phone, delivered, reason }]`, observabilidade preservada.
   - **V2 (backlog)**: refatorar engine pra criar N AutomationRuns
     filhos (com `parentRunId`). Exige mudança de schema.
   - Justificativa do V1: o handler `routeAction` retorna 1 result;
     refatorar pra spawn N runs é cirurgia maior, e a info granular
     já fica no JSON. Marcado pra revisão se observabilidade não for
     suficiente.

## Escopo

### Dentro do escopo

1. Frontend `SendWhatsAppConfig`: 2 novos `ModeBtn` ("Contato do card"
   e "Contato fixo").
2. Modo "Contato fixo": dropdown listando `Contact` da Org com phone
   não-nulo.
3. Modo "Contato do card": sem input — envia em runtime pra todos.
4. `actionConfig` ganha campos:
   - `useCardContacts: boolean` (modo dinâmico)
   - `contactId: string` (modo fixo)
5. Variáveis de template scoped por modo:
   - Modos antigos: `{{recipient.name}}`, `{{recipient.firstName}}`
     (mantém comportamento)
   - Modos novos: `{{contact.name}}`, `{{contact.firstName}}`,
     `{{contact.email}}`, `{{contact.phone}}` (resolvidos em runtime
     contra cada contato).
6. `handleSendWhatsApp` no engine:
   - Detecta `useCardContacts` → fan out: itera contatos do card,
     sanitiza phone (só dígitos), envia individualmente, agrega
     resultado.
   - Detecta `contactId` → resolve phone do contato fixo, envia.
7. **Activity log**: depois do fan-out, posta 1 entrada na timeline
   do card com resumo: "Automação X — N enviadas, M puladas: nomes".
   Tipo de Activity: reutilizar `CARD_TIMELINE` ou criar
   `AUTOMATION_WHATSAPP_SUMMARY` (V1: usa Activity genérica com
   payload descritivo).
8. Phone sanitization: contato pode ter "+55 (31) 99999-0000" no
   campo. Antes de enviar, strip para `5531999990000`. Validar
   `>=10 e <=15 dígitos`.

### Fora do escopo

- Notificar contato sem WhatsApp por outro canal (email).
- Permitir o usuário editar quais contatos do card receberão (ex:
  "só PERSON, não COMPANY"). V1 manda pra todos os linkados.
- AutomationRun por contato (ver decisão #5 — V1 pragmático).

## Etapas

1. Frontend tipo `WaRecipientMode` ganha `'CARD_CONTACTS' | 'CONTACT'`.
2. Frontend state `waContactId` novo.
3. Frontend dropdown lista `contactsQueries.list()` filtrado por
   phone não-nulo.
4. Frontend `WHATSAPP_VARS` ganha versão `WHATSAPP_VARS_CONTACT` —
   o componente alterna conforme `recipientMode`.
5. Frontend `buildActionConfig`: serializa pros novos campos.
6. Frontend `extractInitial`: ao editar, detecta os novos modos.
7. Backend `handleSendWhatsApp`: refatorado pra lidar com 5 modos
   (3 antigos + 2 novos).
8. Backend novo helper `sanitizeAndSendToContact()` que sanitiza
   phone e logica de skip-on-empty.
9. Backend Activity log resumo após fan-out.
10. Validar typecheck + lint + commit + push.

## Critérios de aceite

- [ ] Form mostra 5 botões de modo, com select de contato visível
      apenas no modo "Contato fixo".
- [ ] Variáveis de template no modo contato mostram apenas as do
      contato (não as de recipient/user).
- [ ] Automação configurada como "Contato do card" envia pra todos
      os contatos vinculados quando o trigger dispara.
- [ ] Card sem contatos: automação registra Activity com motivo
      "sem contatos vinculados", `result.delivered = false`.
- [ ] Contato sem phone: pulado, registrado no result.attempts e
      no Activity de resumo.
- [ ] Phone com formato livre (ex: "+55 31 9999-0000") é sanitizado
      pra `5531999990000` antes do envio.
- [ ] `{{contact.name}}` resolve corretamente em runtime; vars do
      modo errado viram string vazia.

## Riscos / decisões abertas

- **Volume**: card com 5 contatos vira 5 chamadas Evolution
  sequenciais. Aceitável — automações já são event-driven, latência
  não é UX-crítica.
- **Privacidade**: contato externo recebe automação. Deve ser
  intencional. UI deve explicar claramente "vai mandar pro contato
  do CRM (cliente externo)".
- **Phone format**: contato tem campo livre. Se sanitização não
  resulta em `^\d{10,15}$`, pula e loga "phone inválido".
- **Cross-reference User-Contact**: se contato bate com User da Org
  (mesmo email/phone), continua sendo Contact — automação não
  promove implicitamente pra "Membro fixo". Transparente.

## Relação com outros docs

- **19-contatos-externos.md**: módulo base de Contatos.
- **23-automacoes-coluna.md**: catálogo de automações por coluna.
- **25-modelos-mensagem.md**: templates reutilizáveis (compatível
  — só ganha novas variáveis).
