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

## Fluxo de uso ideal

1. Antes da reunião: agendar Lia → user copia link Meet + cola num form
   `/lia/agendar` → Lia entra como participante "Lia (KTask)"
2. Durante: Lia escuta, transcreve. Painel ao vivo mostra ações detectadas
3. User pode interagir: "Lia, qual a próxima tarefa pendente?"
4. Após: Lia gera proposta de cards, mostra preview, user aprova
5. Cards criados no board escolhido (default configurável)

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

| Etapa                                                         | h   |
| ------------------------------------------------------------- | --- |
| Schema (Meeting + UserSkill + SkillCategory) + migration      | 4   |
| Integração Recall.ai (webhook receiver, account setup)        | 8   |
| LiaService: prompt + structured output + cards proposal       | 15  |
| UI: agendar reunião (form + status)                           | 4   |
| UI: painel ao vivo da reunião (transcript + ações detectadas) | 8   |
| UI: preview de cards propostos + aprovar/editar/rejeitar      | 8   |
| UI: configurar skills no perfil + página de membros           | 6   |
| Atribuição automática por skill match                         | 5   |
| Conversa text durante reunião ("Lia, quais cards...")         | 10  |
| Tests + refinement de prompt pt-BR                            | 10  |

**~78h** pra v1. V2 (TTS pra Lia falar via voz) = +15h. V3 (Lia
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
