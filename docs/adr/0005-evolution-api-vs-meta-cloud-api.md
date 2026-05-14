# ADR 0005 — WhatsApp via Evolution API self-hosted

- **Status**: Accepted
- **Data**: 2026-04-26
- **Decisores**: Nicchon (operador único)
- **Tags**: integração, whatsapp

## Contexto

O KTask precisa enviar WhatsApp como cidadão de primeira classe: é um dos diferenciais declarados em [tarefas-md/00-visao-geral.md](../../tarefas-md/00-visao-geral.md) ("WhatsApp nativo via Evolution API: disparos dentro de automações, respostas criando cards, templates de mensagem"). Usos hoje:

- Action `SEND_WHATSAPP` no engine de automações (mandar mensagem quando card move, vence prazo, etc).
- Pedido de aprovação de card (envia link de aprovar/reprovar pro reviewer).
- Recuperação de senha via WhatsApp (alternativa a e-mail).
- Resumo de envios em activity log do card.

A Kharis já operava com Evolution API em outros sistemas internos antes do KTask existir — havia instância rodando, credenciais conhecidas, número de origem definido (`NicchonSanchez`). A escolha entrou no projeto como continuidade dessa operação, não como avaliação aberta de provedores.

Evidência no repo:

- [apps/api/src/modules/whatsapp/whatsapp.helper.ts](../../apps/api/src/modules/whatsapp/whatsapp.helper.ts): chamada direta a `${EVOLUTION_DEFAULT_URL}/message/sendText/${EVOLUTION_DEFAULT_INSTANCE}`.
- [tarefas-md/05-stack-e-arquitetura.md](../../tarefas-md/05-stack-e-arquitetura.md#L23) cita literalmente "Evolution API (serviço externo que você já usa) / Integração via REST, webhook, compatível com Baileys".
- Env vars `EVOLUTION_DEFAULT_URL`, `EVOLUTION_DEFAULT_API_KEY`, `EVOLUTION_DEFAULT_INSTANCE` em `.env.example`, `infra/prod.env.example`, `apps/api/src/config/env.ts`.
- Commit inicial da action: `0000481 feat(automations): action SEND_WHATSAPP funcional` (2026-04-26).

## Decisão

WhatsApp é enviado via **Evolution API self-hosted** (instância da Kharis), através de chamada HTTP direta no helper `WhatsAppHelper`. Em dev/MVP usa credenciais default da Org via env vars (`EVOLUTION_DEFAULT_*`). O schema já prevê config por Org em `Integration` (criptografada com AES-256-GCM via `INTEGRATION_ENCRYPTION_KEY`) para quando o produto virar multi-empresa.

Falhas de envio são **logadas mas não propagadas** — o helper retorna `false`. Quem chamar (engine de automação, fluxo de aprovação) decide se trata como degradação ou erro fatal. Política atual: degradação silenciosa, registrada em `AutomationRun.result.attempts` e em activity log.

## Alternativas consideradas

### Alternativa A: Evolution API self-hosted (escolhida)

- Pros: Kharis já tem instância rodando, credenciais e número; custo marginal zero (a instância serve outros sistemas também); API REST simples; compatível com Baileys (não-oficial mas estável); suporta envio livre (sem templates pré-aprovados Meta).
- Contras: depende de WhatsApp Web sob o capô — número pode cair, ser banido, exigir reconexão por QR code; sem garantia de SLA; "não-oficial" do ponto de vista da Meta (risco regulatório no longo prazo); volume alto pode disparar bloqueio.
- Evidência: citada em `tarefas-md/05` e usada em `apps/api/src/modules/whatsapp/whatsapp.helper.ts`.

### Alternativa B: Meta Cloud API (WhatsApp Business Platform oficial)

- Pros: integração oficial, SLA da Meta; suporte a templates aprovados, mídia rica, botões interativos, listas; menos risco de banimento; melhor pra escala SaaS futura.
- Contras: requer cadastro Business Manager + verificação de número + aprovação de templates por categoria; envios fora de janela de 24h só com template aprovado (limita flexibilidade do produto); custo por mensagem (~$0.04 USD por conversa fora do tier grátis); setup pesado pra operador único.
- Evidência: padrão da indústria pra SaaS B2B, sem debate registrado explicitamente nos docs do KTask.

### Alternativa C: Twilio (WhatsApp via Twilio Sandbox ou número aprovado)

- Pros: SDK maduro; observabilidade boa; combina WhatsApp + SMS + Voice no mesmo provider.
- Contras: custo agressivo pra volume baixo; ainda exige templates aprovados; menos vantajoso que Meta direto pra quem só quer WhatsApp.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa D: Z-API, Wuzapi, outras não-oficiais

- Pros: APIs simples como Evolution; algumas têm tier grátis pra teste.
- Contras: mesmos riscos da Evolution (banimento, dependência de WhatsApp Web), porém **sem o controle de self-hosting** — vendor lock e dependência operacional adicional.
- Evidência: padrão da indústria entre soluções não-oficiais, sem debate registrado nos docs do KTask.

## Consequências

### Positivas

- Time-to-first-message foi quase zero — instância já existia, credenciais no `.env.local`, helper de ~60 linhas.
- Operador único mantém controle total da instância (pode trocar instância, mudar número, reconectar QR sem depender de terceiro).
- Custo marginal zero hoje (a instância é compartilhada com outros sistemas Kharis).
- Schema preparado pra multi-Org via `Integration` criptografada — migração pra "cada cliente SaaS com sua Evolution" não exige mudança arquitetural.
- Falhas de envio degradam de forma controlada: automação registra `delivered=false`, activity log explica, fluxo de aprovação tem fallback via push notification e inbox interno.

### Negativas / trade-offs aceitos

- **Risco regulatório**: WhatsApp não-oficial pode ser banido pela Meta a qualquer momento sem aviso. Mitigação parcial: não enviar em massa, respeitar opt-in, manter envios por evento (não por broadcast).
- **Risco operacional**: número da Evolution pode cair (sessão expira, QR precisa ser re-escaneado, número banido). O helper já trata o caso "Evolution fora" como degradação silenciosa, mas precisa monitoring externo pra alertar quando isso acontece.
- **Sem features avançadas**: templates oficiais, botões interativos, listas, status read receipts confiáveis — tudo isso é limitado/inexistente comparado ao Cloud API.
- **Migração futura pra Cloud API exige refactor**: helper hoje é uma chamada HTTP simples; mudar pra Cloud API significa Business Manager + templates + lógica de janela 24h + nova SDK. Não é zero esforço.

### Neutras / observações

- O modo de envio é "fire and forget" via REST direto — não há retry automático no helper. Quem chama (engine de automação) implementa retry via BullMQ se quiser.
- O schema `Integration` permite múltiplas instâncias Evolution por Org no futuro (cliente SaaS quer ter sua própria instância). Hoje só a default é usada.
- A política "WhatsApp para terceiros é uma denylist universal" (memória global do operador) limita uso do Evolution a casos onde o destinatário é explicitamente cliente/contato cadastrado — não é usado pra broadcast nem disparos massivos.

## Notas

- Helper: [apps/api/src/modules/whatsapp/whatsapp.helper.ts](../../apps/api/src/modules/whatsapp/whatsapp.helper.ts).
- Doc de arquitetura: [tarefas-md/05-stack-e-arquitetura.md](../../tarefas-md/05-stack-e-arquitetura.md) (linha 23).
- Doc de feature: [tarefas-md/33-automacao-whatsapp-contato.md](../../tarefas-md/33-automacao-whatsapp-contato.md).
- Env vars documentadas em: [infra/prod.env.example](../../infra/prod.env.example), [apps/api/.env.example](../../apps/api/.env.example).
- Commit decisivo: `0000481` (2026-04-26).
