# 27 — Lia: AI que ouve reunião e cria cards

> **Status:** ideação (2026-04-27). Feature grande (~70-90h pra v1
> completo). Doc captura design e perguntas em aberto pra retomar.

## Visão

Lia é uma assistente de IA que:

1. **Entra na reunião** (Google Meet, Zoom) ou recebe gravação posterior
2. **Ouve e transcreve** a conversa em pt-BR
3. **Identifica decisões e ações** discutidas
4. **Propõe cards** (título, descrição afiada, checklist, prioridade, prazo, líder, equipe)
5. **Atribui automaticamente** com base num registro de **habilidades por
   user** ("quem é Dev, Design, Gerente de Relacionamento, Gestor de Tráfego")
6. **Conversa em tempo real ou pós-reunião:**
   - "Lia, quais cards você vai criar?"
   - "Vou criar os cards X, Y e Z. Quer ouvir os detalhes?"
   - "Card X: descrição..., checklist com 3 itens, líder = Fernanda."
   - User pode pedir ajustes: "Tira esse item da checklist", "Atribui pro João"
7. **Cria os cards no KTask** ao final da reunião (ou quando user comandar)

## Diferencial vs concorrência

Read.ai, Otter, Fireflies, Tactiq fazem **transcrição + resumo + action
items textuais**. Nenhum gera cards estruturados num kanban próprio
com FK pra usuário, board, lista, prioridade, prazo. Lia integra
direto com KTask, vira o "ponto de saída" de toda reunião.

## Arquitetura (proposta)

### Componentes

```
┌─────────────────────────────────────────────────────────────┐
│  Reunião no Meet                                            │
│  ┌─────────────────┐                                        │
│  │ Bot Recall.ai   │ ← entra como participante, captura     │
│  └────────┬────────┘   audio + video                        │
└───────────┼──────────────────────────────────────────────────┘
            │ webhook (audio + transcript)
            ▼
┌─────────────────────────────────────────────────────────────┐
│  KTask API — modulo `meetings/`                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ TranscriptStore │  │ LiaService      │                   │
│  │ (Postgres)      │  │ - skills lookup │                   │
│  └─────────────────┘  │ - LLM prompt    │                   │
│                       │ - card proposal │                   │
│                       └────────┬────────┘                   │
│                                │                            │
│  ┌─────────────────┐  ┌────────▼────────┐                   │
│  │ Skill (user)    │  │ Claude / GPT-4o │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
              ┌──────────────────┐
              │ CardsService     │ ← cria cards reais via mutation existente
              │ (existente)      │
              └──────────────────┘
```

### 1. Captura da reunião

- **Recall.ai** (recomendado): API que orquestra um bot que entra no
  Meet/Zoom/Teams como participante. Devolve transcrição em tempo real
  via webhook. Custo ~$0.30/h. **Tira do nosso prato** todo o
  inferno de OAuth do Meet, screen-share API, etc.
- Alternativas:
  - Self-hosted: bot Puppeteer + Whisper local. Frágil, sem garantia.
  - Upload de gravação pós-reunião: feature mais simples pra MVP, sem
    real-time.

### 2. Transcrição

- Recall.ai já entrega transcript (em pt-BR via Whisper interno).
- Stand-alone: OpenAI Whisper API (~$0.006/min, qualidade alta em
  pt-BR), Deepgram (real-time melhor), AssemblyAI.

### 3. LLM pra extração

- Claude Sonnet 4 ou GPT-4o (ambos suportam structured output em JSON).
- Prompt engineering em pt-BR pra extrair:
  - Decisões definidas (não especulações)
  - Ações com responsável claro ou implícito
  - Prazos mencionados
  - Prioridade percebida (urgência → URGENT, prazo apertado → HIGH)
- Context: transcript de 1h ≈ 10k tokens. Cabe folgado em qualquer
  modelo moderno.
- Custo: ~$0.50-1.00 por reunião de 1h.

### 4. Skills/Habilidades por user

Nova entidade — útil **independente da Lia** (filtros "quem pode fazer
isso?", sugestão de reviewer pra aprovação, etc):

```prisma
enum SkillCategory {
  DEV_FRONTEND
  DEV_BACKEND
  DEV_FULLSTACK
  DESIGN_UI
  DESIGN_GRAFICO
  DESIGN_MOTION
  PRODUCAO_VIDEO
  COPYWRITING
  TRAFEGO_PAGO
  RELACIONAMENTO_CLIENTE
  GESTAO_PROJETO
  COMERCIAL
  FINANCEIRO
  // extensivel via tabela Skill custom da Org
}

model UserSkill {
  userId     String
  category   SkillCategory
  /** nivel 1-5 (1=iniciante, 5=especialista). Lia usa pra desempate. */
  level      Int           @default(3)
  isPrimary  Boolean       @default(false) // funcao principal

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, category])
}
```

Configurável em `/configuracoes/perfil` (cada user marca suas skills) e
admin pode editar pra todos via `/configuracoes/membros`.

### 5. Conversa em tempo real (V2)

- Durante a reunião, painel KTask aberto numa aba mostra o que Lia
  está captando.
- User digita: "Lia, quais cards você vai criar?"
- Resposta texto: "Vou criar 3 cards: 1) Refatorar checkout 2) Trocar
  cor do CTA 3) Reunião com Reritiba..."
- User pede ajuste: "Tira o card 3, isso era só conversa solta"
- V3: TTS via ElevenLabs/OpenAI TTS pra ela "falar" via mic do bot.

### 6. Criação dos cards

- Ao fim da reunião (ou comando "Lia, cria os cards"), Lia gera proposta
  estruturada e mostra no UI.
- User aprova/edita/rejeita cada card antes de commitar.
- Cards criados via `CardsService.create` (já existente).
- Activity registra: `via=lia-meeting-{meetingId}`.

## Granularidade dos cards (1 vs N)

Problema real: LLMs out-of-the-box tendem a **fragmentar demais** —
"refazer site Reritiba" vira 5 cards quando deveria ser 1 card com
checklist. Combate em camadas:

### A. Regras explícitas no system prompt

> **Crie cards SEPARADOS apenas se:**
>
> - Têm responsáveis diferentes (skills incompatíveis)
> - Têm prazos significativamente diferentes
> - São entregáveis independentes (um pode ser concluído sem o outro)
> - Vão pra fluxos/boards diferentes
>
> **Crie UM card único com checklist quando:**
>
> - É o mesmo entregável com etapas
> - Mesmo responsável e prazo
> - Tarefas de menos de 30min que compartilham contexto
> - "Polir/ajustar" um único deliverable

### B. Few-shot examples (3-5 casos validados pela Kharis)

> Exemplo correto:
> Conversa: "vamos refazer o site do Reritiba — primeiro o cabeçalho,
> depois rodapé, e por último a página de doações"
> ✅ 1 card: "Refazer site Reritiba" + checklist [Cabeçalho, Rodapé, Página de doações]
>
> Exemplo correto:
> Conversa: "a Fernanda cria a peça do BF, Dhyo mexe no checkout pra cupom"
> ✅ 2 cards: "Peça BF" (Fernanda) + "Cupom no checkout" (Dhyo)
> Razão: skills diferentes, deliverables independentes

### C. Justificar cada split (chain-of-thought no JSON)

```json
{
  "cards": [{ "title": "...", "split_reason": "Responsável diferente (Fernanda vs Dhyo)" }]
}
```

Obriga o modelo a "pensar antes de fragmentar". Sem `split_reason`
plausível = sinal pra mesclar. Efeito grande na prática.

### D. Loop de feedback persistente

Quando user reprovar/mesclar cards no preview, isso vira **few-shot
example dinâmico** salvo na Org. Próxima reunião já chega calibrada.

```prisma
model OrgLiaPattern {
  id             String   @id @default(cuid())
  organizationId String
  /// Tipo: 'merge' (deveria ser 1 card só) ou 'split' (deveria ter sido N).
  kind           String
  exampleInput   String   // trecho do transcript
  exampleOutput  Json     // estrutura correta de cards
  createdAt      DateTime @default(now())
  // entram no prompt da proxima reuniao como few-shot
}
```

Em ~5-10 reuniões, Lia aprende o estilo da Org.

### E. Threshold de confiança + pergunta no preview

Se modelo tem dúvida ("isso é 1 ou 2 cards?"), no preview Lia pergunta:
"Detectei 'refazer site' e 'criar página doações'. Crio 1 card com 2
itens de checklist OU 2 cards separados?". User responde, Lia aprende.

### F. Toggle "modo conservador"

Checkbox no preview: "Lia, fundir cards relacionados". Default ON na
1ª semana, depois user desliga conforme confiança.

### Realismo

- 90% de acerto no MVP — viável com A+B+C
- 95-98% — exige feedback loop (D)
- 100% — impossível, reuniões ambíguas confundem qualquer um. Por isso
  preview-then-create é não-negociável.

## Briefing prévio (instrução antes da reunião)

Briefing antes de começar é **a alavanca mais poderosa** pra acertar
granularidade — calibra Lia direto pro tipo de reunião em vez de deixar
ela adivinhar.

### Exemplos reais

**Briefing técnico:**

> "Lia, reunião de alinhamento com Dhyovaine sobre arquitetura do novo
> checkout. Provavelmente 1 card só: 'Definir arquitetura'. Não crie
> cards de tarefas individuais dele — vou repassar depois."

**Briefing de planejamento:**

> "Lia, reunião de campanha BF com Fernanda e Marcos. Esperamos definir
> 4-6 ações concretas: peças, copy, segmentação, ads. Cada ação vira
> um card separado com responsável."

**Briefing de status:**

> "Lia, status semanal Reritiba. NÃO crie cards a menos que apareça
> demanda NOVA explícita. Conversas sobre andamento de cards
> existentes viram comentários neles, não cards novos."

**Briefing comercial:**

> "Lia, reunião comercial com prospect. NÃO crie cards. Salva só
> resumo + próximos passos como nota anexa."

### Por que funciona

1. **Contexto prévio** — modelo entende o tipo de reunião antes da primeira fala
2. **Granularidade explícita** — "1 card" / "4-6 cards" / "0 cards"
   é instrução direta, mais forte que qualquer regra heurística
3. **Filtro de ruído** — saber o tema ajuda a ignorar conversa paralela
4. **Define output esperado** — "viram cards" / "viram comentários em
   cards existentes" / "viram apenas notas"

### UI proposto

Painel pré-reunião:

```
┌─────────────────────────────────────────────┐
│ Reunião com Lia                             │
│                                             │
│ Briefing (opcional, melhora precisão)       │
│ ┌─────────────────────────────────────────┐ │
│ │ Lia, esta reunião é sobre...            │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Template: [ Status semanal       ▾ ]        │
│                                             │
│ [ Iniciar reunião ]                         │
└─────────────────────────────────────────────┘
```

Ajuste on-the-fly durante a reunião também: qualquer um digita no chat
"Lia, ajuste: agora vamos focar em design" e ela atualiza o contexto.

### Templates pré-definidos (cadastrados pela Org)

Tabela `MeetingTemplate` por Org. Kharis padrão começa com:

| Nome                     | Comportamento                                                      |
| ------------------------ | ------------------------------------------------------------------ |
| Status semanal cliente   | NÃO cria cards salvo demanda nova explícita                        |
| Planejamento de campanha | 3-7 cards esperados, cada ação separada                            |
| Alinhamento técnico      | 1-2 cards macro com checklist (não fragmenta)                      |
| Reunião comercial        | 0 cards. Salva resumo + próximos passos como nota                  |
| Onboarding cliente       | Cards de setup (1 por área: design, dev, contas) com líder default |
| Brainstorm               | Cards de "ideia" em board específico, sem prazo nem líder          |

```prisma
model MeetingTemplate {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  briefing       String  // texto que vai pro system prompt
  defaultBoardId String?
  createdAt      DateTime @default(now())

  @@unique([organizationId, name])
}
```

User seleciona o template no UI; o `briefing` vira prefixo do system
prompt da Lia, ajustável por reunião.

## Fluxo de uso ideal

1. Antes da reunião: agendar Lia → user copia link Meet + cola num form
   `/lia/agendar` → escolhe template/preenche briefing → Lia entra
   como participante "Lia (KTask)"
2. Durante: Lia escuta, transcreve. Painel ao vivo mostra ações
   detectadas. User pode dar ajuste de contexto on-the-fly
3. User pode interagir: "Lia, qual a próxima tarefa pendente?"
4. Após: Lia gera proposta de cards, mostra preview, user aprova/edita
5. Reprovações/merges viram OrgLiaPattern (few-shot da próxima)
6. Cards criados no board escolhido (default do template)

## Permissões / privacidade

- Reunião com Lia precisa **consentimento explícito de todos os
  participantes** (LGPD). Solução: ao adicionar Lia, Lia se anuncia
  no chat: "Olá! Sou a Lia, IA do KTask. Estou gravando essa reunião
  pra extrair tarefas. Se discordar, peça pro organizador me remover."
- Transcripts ficam no Postgres da Org (`Meeting.transcript Text`).
- Após X dias (configurável, default 30d), audio + transcript apagados;
  só fica resumo + cards criados.
- Org pode marcar reunião como confidencial → não persiste transcript,
  só os cards.

## Estimativas (v1 funcional)

| Etapa                                                                                      | h   |
| ------------------------------------------------------------------------------------------ | --- |
| Schema (Meeting + UserSkill + SkillCategory + MeetingTemplate + OrgLiaPattern) + migration | 5   |
| Integração Recall.ai (webhook receiver, account setup)                                     | 8   |
| LiaService: prompt + structured output + cards proposal                                    | 15  |
| Granularidade: regras + few-shot + split_reason + threshold                                | 8   |
| Briefing + templates: schema + UI form + injecao no prompt                                 | 6   |
| UI: agendar reunião (form + status + template picker)                                      | 5   |
| UI: painel ao vivo da reunião (transcript + ações detectadas)                              | 8   |
| UI: preview de cards propostos + aprovar/editar/rejeitar                                   | 8   |
| Feedback loop: persistir merges/splits como OrgLiaPattern                                  | 5   |
| UI: configurar skills no perfil + página de membros                                        | 6   |
| Atribuição automática por skill match                                                      | 5   |
| Conversa text durante reunião ("Lia, quais cards...")                                      | 10  |
| Tests + refinement de prompt pt-BR                                                         | 10  |

**~99h** pra v1 (vs 78h da estimativa anterior — granularidade +
briefing + templates + feedback loop adicionam ~21h mas dobram a
qualidade percebida). V2 (TTS pra Lia falar via voz) = +15h. V3 (Lia
proativamente sugerir durante a reunião) = +20h.

## Custo operacional estimado

Cliente típico de agência: 4-8 reuniões/semana × 1h média:

- Recall.ai: ~$0.30/h × 24h/mês = **$7.20/mês**
- Whisper (se não usar Recall): ~$0.36/h
- LLM (Claude Sonnet 4): ~$0.70 × 24 = **$16.80/mês**
- TTS (V2, opcional): ~$5/mês

**Total: ~$25-30/cliente/mês**. Em 10 clientes = $250-300/mês de OPEX.
Viável pra cobrar do cliente como add-on premium ou incluir em plan
pago do KTask.

## Riscos / decisões em aberto

1. **Privacidade / LGPD**: precisa termo claro de consentimento + opção
   de não-persistência. Talvez exigir admin da Org ativar feature
   explicitamente com aceite legal.
2. **Qualidade da extração em pt-BR**: prompt engineering vai exigir
   iteração com reuniões reais. MVP pode ter false positives ("vamos
   marcar uma reunião" virando card). Tunning iterativo.
3. **Confiança do user**: cards gerados precisam ser SEMPRE preview-then-create,
   nunca auto-create. Senão um erro vira 50 cards lixo.
4. **Recall.ai vendor lock**: alternativa self-hosted é viável mas
   adiciona ~30h de trabalho. Aceitar lock pra MVP.
5. **Skills granularity**: enum pre-definido vs custom por Org. Começar
   com enum (16-20 categorias cobrem 90%) + sub-tabela Skill custom
   pra Orgs específicas (futuro).
6. **Dependência LLM externo**: Anthropic/OpenAI down → feature down.
   Fallback: degradar pra "transcrição salva, processa quando voltar".
7. **Multi-line speakers**: identificar quem disse o quê (diarização) é
   crítico pra atribuir tarefas corretamente. Recall.ai entrega
   diarizado; Whisper standalone não.

## Decisões iniciais sugeridas

- **Captura**: Recall.ai (não reinventa)
- **LLM**: Claude Sonnet 4 com prompt em pt-BR (Anthropic suporta melhor)
- **MVP scope**: upload de gravação OU bot real-time, escolher um. Bot
  é mais "wow"; upload é mais simples pra primeira iteração
- **Skills**: enum + extensão Org futura
- **Voz**: V2 (text-only no MVP)
- **Aprovação**: SEMPRE preview-then-create

## Caso de uso real Kharis

Reunião semanal Kharis com cliente Reritiba:

- Lia entra, escuta 45min de discussão de campanhas/site
- Identifica: 5 ações concretas
  - "Trocar logo no site" → card no board "Tecnologia", prioridade MEDIUM,
    líder Dhyovaine (skill DEV_FRONTEND), prazo até sexta
  - "Criar peça pra Black Friday" → board "Design", líder Fernanda
    (DESIGN_GRAFICO), prazo 2 semanas
  - "Verificar contrato de hospedagem" → card no board "Comercial",
    líder Nicchon (GESTAO_PROJETO), sem prazo claro
  - ...
- Mostra preview no fim. Nicchon revisa, ajusta prazo de 2 itens, aprova.
- 5 cards criados no KTask, cada um no board+lista certo.
- Antes (manual): 30min de pós-reunião transcrevendo e criando cards.
- Depois: 5min revisando proposta da Lia.

**ROI**: 25min/reunião × 30 reuniões/mês = 12h/mês economizadas só na
Kharis. Vale 78h de dev investido.

## Próximos passos quando atacar

1. Validar conta Recall.ai e setup (~30min)
2. Schema + migration de Skill + Meeting (~4h)
3. Conectar webhook Recall.ai e persistir transcript (~6h)
4. Prompt engineering pra extração (iterativo, com 3-5 reuniões reais
   gravadas como dataset)
5. UI de aprovação + integração CardsService
6. Skills no perfil + atribuição
7. Conversa em texto durante reunião
8. (V2) TTS + voz

## Dependências

- **Aprovações por cliente** (entregue): pode reusar fluxo pra "Lia
  pediu confirmação antes de criar cards"
- **Contatos** (entregue): cards podem linkar contato externo se reunião
  for com cliente
- **shortCode** (entregue): cards têm ID humano-legível
- **Campos personalizados** (parkado em doc 15): se entrar, Lia pode
  preencher campos como "Cliente" automaticamente
