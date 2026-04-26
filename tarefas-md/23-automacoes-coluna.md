# Automações por coluna

Inspiração: Ummense (prints em `tarefas-md/img/`). Feature da Fase 2 do
roadmap; complementa o doc [09-engine-automacoes.md](09-engine-automacoes.md).

## Escopo

Cada coluna pode ter automações vinculadas a ela. Quando um card entra,
sai, fica parado X tempo, ou outro gatilho similar acontece, a engine
executa as ações configuradas.

### Dentro do escopo

- Ícone de robô **fixo** no header da coluna (sempre visível, ao lado do contador)
- Click no robô abre modal/dialog com 3 abas: **Detalhes**, **Automações (N)**, **Avançado**
- Aba "Automações" lista as automações configuradas pra coluna com botão `+` pra criar nova
- Ao clicar `+`, modal de seleção mostra automações agrupadas por categoria
- Cada automação tem trigger implícito ("quando card entra na coluna" é o default; alguns têm seu próprio trigger interno tipo "tempo excedido")

### Fora do escopo (parkado)

- Editor visual de automações estilo Zapier (com nodes encadeáveis) — fica fora; nosso modelo é template-based
- Versionamento de automações (histórico de execuções entra na Fase 3 com Reports)
- Automações por board ou globais — Fase 2 começa com escopo só de coluna

## Detalhes visuais (Ummense)

### Header da coluna

Da esquerda pra direita:

1. Drag handle (`GripVertical`) — aparece no hover
2. Nome da coluna (clique 2x = renomear)
3. Contador de cards
4. **Ícone de robô** (`Bot`) — **sempre fixo**; click abre modal de automações
5. **Lápis** (`Pencil`) — aparece no hover; atalho direto pra renomear (sem precisar abrir kebab)
6. Kebab (`MoreHorizontal`) — aparece no hover; menu com Renomear, Arquivar, etc.

Hoje (commit prévio): só drag + nome + contador + kebab. Adicionado:

- Robô fixo (placeholder disabled apontando pra esta tarefa)
- Lápis no hover

### Modal de automações da coluna

Cabeçalho:

- Ícone do gatilho + nome da coluna em destaque
- Tabs: **Detalhes** · **Automações (N)** · **Avançado**

Aba "Automações":

- Lista de automações existentes — cada item:
  - Ícone (cadeado pra privacidade, etc.)
  - Texto descritivo: "Alterar a privacidade do card para **secreto**"
  - Toggle ativar/desativar
  - Chevron pra expandir detalhes (delay, condições)
  - "Executa em X minuto(s)" — info do delay
- Botão `+` no canto superior direito pra criar nova
- Rodapé: "Cards vinculados na coluna" com 4 contadores (4 entradas, 1 atualizado, 0 concluídos, 0 saídos) e lixeira

Modal "Selecione uma automação" (após clicar `+`):

- Lista agrupada por categoria, com badge "PRO" ou "ENTERPRISE" em cada item
- Ao escolher, modal de configuração específica abre

## Catálogo de automações (do Ummense)

Total: **18 automações** em 6 categorias.

### Fluxo (3)

| Automação                  | Plano | Descrição                                                                                                                                                                                  |
| -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vincular a um novo fluxo   | PRO   | Quando o card entra nesta coluna, replica o card num outro fluxo (board) escolhido. Útil pra cascatear demanda entre setores (ex: card aprovado em "Vendas" abre paralelo em "Operações"). |
| Desvincular do fluxo atual | PRO   | Quando atinge esta coluna, o card é removido deste fluxo (continua no fluxo de origem se foi vinculado).                                                                                   |
| Atualizar posição no fluxo | PRO   | Move o card vinculado em outro fluxo pra uma coluna específica desse outro fluxo. Sincroniza estados entre boards.                                                                         |

### Card (4)

| Automação                   | Plano | Descrição                                                                                                                                                             |
| --------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criar card filho            | PRO   | Cria automaticamente um sub-card vinculado ao card de origem (mesma família). Configurável: título-template, board destino, lista destino, copiar membros/tags/prazo. |
| Alterar status do card      | PRO   | Marca o card como Finalizado / Reativado / arquivado / privado. Útil pra "quando entra na coluna 'Concluído', marca como finalizado automaticamente".                 |
| Inserir ou preencher campos | PRO   | Define valor de um custom field do card (ex: "preencher 'data de entrega' com hoje + 5 dias").                                                                        |
| Salvar versão da descrição  | PRO   | Snapshot da descrição atual num histórico (versionamento simples pra trilha de auditoria do conteúdo).                                                                |

### Tags (2)

| Automação    | Plano | Descrição                                                                                           |
| ------------ | ----- | --------------------------------------------------------------------------------------------------- |
| Inserir tags | PRO   | Adiciona uma ou mais etiquetas ao card. Ex: "ao entrar em 'Em produção', adicionar tag '🟢 ativo'". |
| Remover tags | PRO   | Remove etiquetas do card. Útil pra limpar tags de status quando muda de fase.                       |

### Tarefas (2)

| Automação                | Plano | Descrição                                                                                                                                                                                     |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inserir tarefas          | PRO   | Cria itens de checklist no card (texto fixo ou template Mustache com variáveis do card). Ex: "ao entrar em 'Revisão', criar tarefas: 'Conferir layout', 'Validar copy', 'Aprovação cliente'". |
| Inserir grupo de tarefas | PRO   | Cria um checklist inteiro (várias listas com vários itens cada) a partir de um template salvo. Útil pra recorrências grandes (onboarding de cliente, lançamento de produto).                  |

### Equipe (5)

| Automação                    | Plano      | Descrição                                                                                                                                         |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definir líder do card        | PRO        | Atribui um usuário como líder do card automaticamente. Pode ser fixo ("sempre Fernanda"), round-robin entre membros, ou baseado em campo do card. |
| Adicionar equipe no card     | PRO        | Adiciona N usuários como membros do card. Ex: "ao entrar em 'Aprovação', adicionar [diretor1, diretor2]".                                         |
| Publicar no feed do CONECTA  | PRO        | (Específico Ummense — feed interno deles). Pra nós: equivalente seria "criar comentário automático" ou "postar em canal interno".                 |
| Enviar WhatsApp              | ENTERPRISE | Dispara mensagem WhatsApp via Evolution API pra um destinatário (membro, líder, contato externo do card). Template Mustache com variáveis.        |
| Configurar disparo de e-mail | PRO        | Envia e-mail via SMTP/SES pra destinatário(s). Template com placeholders do card.                                                                 |

### Sinalizar (4)

| Automação                  | Plano | Descrição                                                                                                                                                       |
| -------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards com marcos para hoje | PRO   | Sinaliza visualmente (badge/cor/notificação) cards cujo `dueDate === hoje` enquanto estiverem nesta coluna.                                                     |
| Cards com marcos atrasados | PRO   | Idem, mas pra `dueDate < hoje`. Útil pra coluna "A fazer" destacar atrasos.                                                                                     |
| Tempo excedido na coluna   | PRO   | Dispara aviso/automação quando card está há mais de X horas/dias na coluna. Configurável: enviar notificação, mover automaticamente, criar tarefa de follow-up. |
| Tempo sem interação        | PRO   | Idem mas o relógio é "última atividade no card" (comentário, edição, mudança de campo) em vez de "entrou na coluna". Detecta cards parados/abandonados.         |

## Modelo de dados (proposta)

Já temos `Automation` e `AutomationRun` planejados em [09-engine-automacoes.md](09-engine-automacoes.md). Pra automação por coluna, basta adicionar:

```prisma
model Automation {
  // ... campos atuais ...
  scopeType   AutomationScopeType  // LIST | BOARD | ORG
  scopeId     String                // listId, boardId ou orgId
  trigger     AutomationTrigger     // CARD_ENTERED, CARD_LEFT, TIME_IN_LIST, TIME_NO_INTERACTION, ...
  triggerConfig Json                // { minutes: 60 } pra TIME_IN_LIST, etc
  actions     Json                  // [{ type: 'INSERT_TAGS', tags: [...] }, ...]
  isActive    Boolean
}
```

Triggers necessários pro catálogo acima:

- `CARD_ENTERED` — card entrou na coluna (default da maioria)
- `CARD_LEFT` — card saiu da coluna
- `TIME_IN_LIST` — passou X tempo na coluna
- `TIME_NO_INTERACTION` — passou X tempo sem atividade
- `DUE_DATE_TODAY` — dueDate caiu pra hoje (cron diário)
- `DUE_DATE_OVERDUE` — dueDate passou (cron diário)

## Etapas de implementação

### Etapa 1 — Robô fixo + lápis no hover (FEITO)

- Header da coluna com botão `Bot` placeholder (disabled, tooltip "em breve")
- Lápis dedicado pro renomear, aparece no hover

### Etapa 2 — Modal de automações da coluna (UI sem lógica)

- Componente `ColumnAutomationsDialog` com 3 tabs (Detalhes / Automações / Avançado)
- Lista vazia + botão `+` que abre catálogo
- Catálogo com 18 itens placeholder (todos disabled, badge "Em breve")

### Etapa 3 — Schema + engine core (backend)

- Migration `Automation`, `AutomationRun` (ver doc 09)
- Worker BullMQ que processa fila de execuções
- Trigger registry que escuta eventos do EventEmitter (`CARD_MOVED`, `CARD_UPDATED`, etc) e cria runs

### Etapa 4 — Action handlers (uma por uma, em ordem de impacto)

1. `INSERT_TAGS` / `REMOVE_TAGS` — mais simples
2. `INSERT_CHECKLIST_ITEMS` (Inserir tarefas) — usar template Mustache
3. `SET_CARD_STATUS` (Alterar status)
4. `ADD_TEAM` / `SET_LEAD`
5. `CREATE_CHILD_CARD`
6. `SAVE_DESCRIPTION_VERSION`
7. `INSERT_CHECKLIST_GROUP` (template salvo)
8. `LINK_TO_FLOW` / `UNLINK_FROM_FLOW` / `UPDATE_POSITION_IN_FLOW` — depende de cards multi-fluxo (doc 13)
9. `SEND_WHATSAPP` — depende de Integration + Evolution
10. `SEND_EMAIL` — depende de SMTP configurado

### Etapa 5 — Triggers temporais (cron)

- `TIME_IN_LIST`, `TIME_NO_INTERACTION`, `DUE_DATE_TODAY`, `DUE_DATE_OVERDUE`
- BullMQ scheduled job que roda a cada N minutos varrendo cards e disparando runs

### Etapa 6 — UI completa

- Wizard de 3 passos (gatilho → ações → revisar) pra cada automação
- Configurações específicas por tipo de ação (popovers de seleção)
- Log de execuções com retry

## Critérios de aceite (geral)

- [ ] Robô fixo no header da coluna (em breve OK como placeholder)
- [ ] Modal de automações abre ao clicar no robô
- [ ] Lista de automações da coluna renderiza corretamente
- [ ] Modal de catálogo lista as 18 automações agrupadas
- [ ] Schema `Automation` aplicado em prod
- [ ] Pelo menos 5 actions funcionando end-to-end (Tags, Tarefas, Equipe, Status, Child)
- [ ] Triggers temporais rodando via cron sem race conditions
- [ ] Anti-loop (chainDepth) implementado pra evitar automações encadeando infinito
- [ ] Rate limit por Org (X execuções/min)

## Riscos / decisões

- **Anti-loop**: card movido por automação A pode disparar automação B na coluna destino, que dispara C, etc. Solução: campo `chainDepth` no `AutomationRun`, máx 5 saltos.
- **Variáveis de template**: Mustache com namespace `{{card.title}}`, `{{card.lead.name}}`, `{{column.name}}`, `{{board.name}}`, `{{actor.name}}`. Documentar lista completa.
- **Permissão**: criar/editar automação requer role >= GESTOR na Org **ou** EDITOR no board (decidir qual).
- **Histórico de execuções**: guardar last 1000 por Org pra auditar; descartar mais antigas.
- **WhatsApp/Email no Enterprise**: gatilho de plano. KTask uso interno = Enterprise mas SaaS futuro pode segmentar.
