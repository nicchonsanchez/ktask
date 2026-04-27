# 28 — Importer Ummense V2: wizard com mapeamento manual

> **Status:** planejada (2026-04-27). Sucessor do importer básico
> documentado em `16-importer-ummense.md` que continua funcional como
> fallback. Atende caso real Kharis com cards de múltiplos fluxos
> Ummense + nomes que não batem 1:1.

## Motivação

O importer atual (doc 16) faz auto-resolução por nome normalizado
(lowercase + sem acentos). Funciona pra casos triviais, mas falha em
cenários reais da Kharis:

- **Member do Ummense saiu da equipe** → resolve null, card vai sem líder
- **Mesmo nome em 2 users diferentes** → match ambíguo
- **Coluna "📌 A fazer" (com emoji) vs "A fazer"** → cria coluna duplicada
- **Variação de nome ("T. Bueno" vs "Thiago Bueno")** → não bate
- **Importação em board errado** → user esquece que cards de "Tecnologia"
  vão pra board diferente de "Atendimento"

Resultado: imports gerando cards sem líder, equipe parcial, colunas
duplicadas. Operador precisa abrir cada card pra corrigir manualmente.

## Solução: wizard de 3 passos com mapeamento explícito

### Passo 1 — Arquivo + destino

- Upload do `.csv` (que é JSON na verdade, ver doc 16)
- Select de board destino:
  - **Board existente** (lista todos os boards da Org)
  - **Criar novo board**: campo de texto pra nome
- Botão "Próximo" só ativo quando ambos preenchidos

### Passo 2 — Mapear entidades

Sistema parsea o CSV e devolve listas únicas de:

- **Membros** mencionados em Líder + Equipe
- **Colunas** mencionadas em "Coluna atual"
- (V2 futuro: Tags, Contatos — ver "Fora do escopo MVP")

Pra cada entidade, mostra select com:

- **Pré-preenchimento inteligente** (fuzzy match, ver "Algoritmo"):
  pré-seleciona o melhor candidato do KTask. User só mexe no errado.
- Opção "**Ignorar**" → cards ficam sem esse membro/lista (lista usa
  default; membro é null)
- Opção "**Criar novo**" pra colunas (cria List nova com o nome do CSV)
- Opção "**Convidar novo**" pra membros (V2 futuro — MVP mostra como
  desabilitado com tooltip "em breve")

#### Pré-preenchimento inteligente (fuzzy match)

Pra cada nome do CSV, calcula similaridade com cada user/list do KTask:

1. Normaliza ambos (lowercase + sem acentos + sem emojis)
2. Match exato → score 1.0
3. Substring (um contém o outro) → score 0.85
4. Levenshtein distance ≤ 2 → score 0.75
5. Iniciais batem (T. Bueno → Thiago Bueno) → score 0.6

Pré-seleciona o de maior score acima de 0.7. Abaixo disso, marca como
"Ignorar" (user precisa decidir).

#### Persistência de mapeamentos

Cada confirmação ("Thiago" → "Thiago Bueno") vira entrada em nova tabela:

```prisma
model OrgImportMapping {
  id             String   @id @default(cuid())
  organizationId String
  /// Tipo: 'user' ou 'list'
  kind           String
  /// Nome como veio do CSV (normalizado)
  sourceName     String
  /// FK pro target. UserId pra kind='user', ListId pra kind='list'.
  /// Null = "Ignorar" persistido (não pergunta de novo)
  targetId       String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, kind, sourceName])
  @@index([organizationId, kind])
}
```

Próximo import do mesmo CSV ou de outro com nomes em comum: passo 2
chega praticamente vazio. Em 2-3 imports, wizard vira 3 cliques.

### Passo 3 — Confirmar

Resumo do que vai ser criado, baseado no mapping atual:

```
✓ 47 cards a criar
✓ 2 listas novas: "Fazendo", "Aguardando retorno"
✓ 4 mapeamentos lembrados pra próxima
✗ 1 nome ignorado (cards sem ele): "N. Sanchez"
✗ 0 cards a duplicar (idempotência via shortCode)
```

Botão "Importar de verdade" → executa.

Pós-execução: report final com `{ created, skipped, errors, ... }`
(igual ao atual).

## Backend

### Mudanças nos endpoints

Refatora o endpoint atual em **2 endpoints**:

| Método | Path                                    | Body                        | Devolve                                                      |
| ------ | --------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| POST   | `/v1/admin/import/ummense-flow/preview` | `{ csv, boardId? }`         | `{ uniqueMembers, uniqueLists, suggestions, savedMappings }` |
| POST   | `/v1/admin/import/ummense-flow/execute` | `{ csv, boardId, mapping }` | `ImportReport`                                               |

Endpoint atual (`/admin/import/ummense-flow`) **mantido como deprecated
shortcut** chamando o execute internamente com auto-mapping. Permite
fallback pra fluxo simples ou uso programático.

### Service

`ImporterService.preview(csvText, boardId)`:

1. Parse JSON
2. Extrai conjunto único de nomes (líderes + equipe + colunas)
3. Pra cada nome, busca candidato com fuzzy match
4. Carrega mappings salvos da Org pra mesma `kind + sourceName`
5. Devolve estrutura pro frontend renderizar

`ImporterService.execute(csvText, boardId, mapping)`:

1. Aplica mapping (substitui nomes por IDs reais antes de criar)
2. Pra `mapping.kind = 'create-list'`, cria listas novas durante a passagem
3. Persiste mappings novos em `OrgImportMapping`
4. Roda import como hoje (idempotente via shortCode)
5. Devolve report

### Schema do mapping (DTO)

```ts
interface ImportMapping {
  members: Record<string, string | null>; // sourceName -> targetUserId | null (ignore)
  lists: Record<string, ListMappingTarget>;
}

type ListMappingTarget =
  | { type: 'existing'; listId: string }
  | { type: 'create'; name: string } // sistema cria com esse nome
  | { type: 'ignore' }; // cards desta coluna não importam
```

## Frontend

### Componente

Substitui `/configuracoes/importar/page.tsx` por wizard 3-step:

- `<ImporterWizard>` orquestra os steps
- `<StepFile>` upload + board destino
- `<StepMapping>` extrai entidades + render de selects
- `<StepConfirm>` resumo + botão final

State global do wizard:

```ts
interface WizardState {
  step: 1 | 2 | 3;
  csv: string;
  boardId: string | 'new';
  newBoardName: string;
  mapping: ImportMapping;
  preview: PreviewResult | null;
}
```

### UX details

- Botão "Voltar" sempre disponível (preserva state)
- Atalho "Aplicar mapeamento salvo" no topo do passo 2 (re-aplica todos
  os `OrgImportMapping` da Org com confiança alta)
- Highlight visual no select quando o pré-preenchimento foi feito por
  match alto vs baixo (cor diferente pra dar confiança)
- Aviso amarelo se >30% dos nomes ficam "Ignorar" (provavelmente está
  importando no board errado)

## Decisões alinhadas com o user (2026-04-27)

- **Pré-preenchimento inteligente** ✅ — fuzzy match no preview
- **Persistir mapeamentos** ✅ — `OrgImportMapping` por Org
- **Tags + Contatos**: continuam **auto-create** no MVP. Wizard só cobre
  Membros e Colunas. Tags/Contatos no wizard fica pra V2 se virar dor real.
- **Convidar novo member durante import**: **NÃO** no MVP. Opção
  "Ignorar" cobre — user convida manualmente pelo `/configuracoes/membros`
  depois. V2 considera adicionar.

## Critérios de aceite

- [ ] Endpoint `/preview` extrai membros/colunas únicos do CSV e
      pré-resolve com fuzzy
- [ ] Endpoint `/execute` aplica mapping (incluindo "ignorar" e
      "criar lista") e roda import idempotente
- [ ] Wizard 3-step funcional com state preservado entre voltas
- [ ] Pré-preenchimento de selects baseado em match score
- [ ] Aviso visual quando >30% dos nomes ficam "ignorar"
- [ ] Mappings confirmados persistem em `OrgImportMapping`
- [ ] Próxima execução com nomes já mapeados pula passo 2 com tudo
      pré-preenchido
- [ ] Endpoint legado `/admin/import/ummense-flow` continua funcional
      (auto-resolve sem wizard)
- [ ] Testar com CSV real `flow_projects_20260426230442.csv` (361KB,
      múltiplas pessoas e colunas)

## Riscos / decisões em aberto

- **Performance do fuzzy match**: 100 cards × 10 candidatos × 5 cálculos
  = 5k operações por preview. Tranquilo. Cache de scores se virar
  problema.
- **Levenshtein library**: usar `fastest-levenshtein` (~3KB) ou
  implementar inline. Inline pra evitar dep nova.
- **Quando usuário muda mapeamento depois de salvo**: novo `targetId`
  sobrescreve o anterior (UPSERT). Sem histórico.
- **Mappings entre Orgs diferentes**: `OrgImportMapping` é por Org —
  zero leak.
- **Fluxo cancelado no meio do passo 2/3**: state perdido, user perde
  progresso. Aceito (alternativa: salvar draft no localStorage; V2 se
  virar dor).

## Estimativa

~10-12h:

- Backend `/preview` + fuzzy + load mappings: 3h
- Backend `/execute` + persist mappings + criação dinâmica de listas: 3h
- Schema `OrgImportMapping` + migration: 0.5h
- Frontend wizard 3-step + state machine: 4h
- Testes manuais com CSV real + edge cases: 1.5h

## Dependências

- shortCode (entregue, doc 24): import idempotente continua funcionando
- Importer V1 (entregue, doc 16): este V2 substitui a UI; backend
  mantém endpoint legado funcional
- **NÃO depende** de Skills (doc 27): mapping member é independente

## Próximos passos quando atacar

1. Schema + migration `OrgImportMapping`
2. Backend `/preview` (extrair entidades + fuzzy + load mappings)
3. Backend `/execute` refatorado pra usar mapping
4. Frontend wizard step 1 + 2 + 3
5. Persistência de mappings novos no `/execute`
6. Testar com CSV Kharis real
