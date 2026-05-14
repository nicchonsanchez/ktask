# Briefing — Conteúdo dos 15 tutoriais da Central de Ajuda

> **Como usar:** cole este briefing num chat novo de Claude com acesso a este repositório. Este briefing produz **conteúdo escrito**, não código. Recomenda-se rodar APÓS o briefing 09 ter criado a estrutura técnica de pastas. Fase 0 (Inventário) primeiro; aguarda aprovação antes de produzir.

---

## Contexto rápido do projeto

KTask. Sistema kanban multi-fluxo em produção. A Central de Ajuda está em `apps/web/content/ajuda/` com 15 arquivos `.md` placeholder criados pelo briefing 09 (frontmatter + heading + "(conteúdo em breve)"). Este briefing **escreve o conteúdo de cada tutorial**.

---

## Objetivo desta sessão

Escrever **conteúdo completo** dos 15 tutoriais priorizados. Cada tutorial é uma página da Central de Ajuda lida por **operador interno (time Kharis)** ou **cliente externo (recebeu link de aprovação)**.

**Audiência mista do conteúdo**: assumir baixo conhecimento técnico. Linguagem clara, didática, com referências visuais (prints). Sem jargão de dev.

**Audiência deste briefing**: redator-técnico que entende a UX do KTask e sabe escrever pra usuário final.

**Entregável**: 15 arquivos `.md` em `apps/web/content/ajuda/` populados com:

1. Frontmatter atualizado (incluindo `description`, `tags`, `updatedAt`)
2. Conteúdo estruturado seguindo o template (ver Fase 1)
3. Referências a prints (mesmo que os prints ainda não existam — anota o nome do arquivo esperado)

**Restrições**:

- Sem emojis.
- Tom: claro, direto, instrutivo. Tipo "Para criar um card, clique no botão azul no topo da coluna" e não "Você pode criar um card de várias formas, dependendo do contexto…".
- Cada tutorial entre **80 e 200 linhas**.
- Markdown puro (sem MDX customizado nesta versão — só primitivos: heading, lista, código, imagem, blockquote, tabela).
- Prints: anota como `![Descrição do print](/tutorial-para-clientes/img/categoria/NN-acao.png)` mesmo se o arquivo ainda não existir. Você vai gerar a lista final de prints necessários no fim.
- Não invente comportamento. Se não souber se uma feature existe/funciona conforme você descreveu, **abra o código pra confirmar** ou marca como `[CONFIRMAR]` pro Nicchon revisar.
- Linguagem PT-BR formal-amigável: "você" (não "tu"), "clique" (não "aperte"), "informe" (não "coloque").

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [docs/architecture.md](../docs/architecture.md) — visão geral do KTask
2. [docs/data-model/README.md](../docs/data-model/README.md) — entender entidades (Card, Board, List, Approval, Contact, etc) pra mapear nomes da UI
3. [tarefas-md/04-fluxos-principais.md](../tarefas-md/04-fluxos-principais.md) — jornadas do usuário (já mapeadas pelo time)
4. [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md)
5. [apps/web/src/app/(app)/](<../apps/web/src/app/(app)/>) — explorar rotas pra entender UX visível
6. [apps/web/public/tutorial-para-clientes/](../apps/web/public/tutorial-para-clientes/) — prints e textos já existentes (pode reaproveitar)
7. [apps/web/content/ajuda/](../apps/web/content/ajuda/) — placeholders criados pelo briefing 09 (se já rodou)

### Exploração estruturada

Para cada um dos 15 tutoriais, **antes de escrever**, confira na UI:

- Como é a UX real? (botão azul ou roxo? está no topo ou em menu?)
- Há atalhos de teclado?
- Há restrições por papel (OWNER vs MEMBER)?
- Há diferenças entre mobile e desktop?

Use `Glob` + `Grep` pra achar componentes específicos da UI. Exemplo:

- "Criar card" → procurar `apps/web/src/components/board/` por `CreateCard`, `NewCard`, etc
- "Aprovar pelo link público" → `apps/web/src/app/aprovar/[token]/`
- "Criar automação" → `apps/web/src/app/(app)/b/[boardId]/...automacoes` ou componente `AutomationBuilder`

### Saída da Fase 0

```
## Inventário (Fase 0)

### Lista de 15 tutoriais com status do conteúdo de partida
1. comecar/01-primeiros-passos.md — status: vazio / reaproveitavel de tutorial-para-clientes/X / preciso pesquisar
2. ...

### Prints existentes em tutorial-para-clientes/img/
Lista o que já tem (extensão, tema sugerido pelo nome do arquivo).

### Mapa de termos UI ↔ código
- "Quadro" (UI) = Board (código)
- "Coluna" (UI) = List (código)
- "Tarefa" / "Cartão" (UI) = Card (código)
- ...

### Funcionalidades não documentadas que vou precisar confirmar
- ...

### Tutoriais que dependem de feature que pode estar parcial
- "Criar primeira automação" — confirmar se a UI de criação de automação está completa
- ...

### Coisas que vou DEIXAR DE FORA
- Features avançadas (campos personalizados, etc) — não estão na lista priorizada
- Documentação de admin (configurar org inteira) — fora de escopo

### Prints novos que vou pedir pro Nicchon tirar
Lista organizada por categoria/tutorial com nome do arquivo esperado.

**Aguardo aprovação ou correção antes de escrever os tutoriais.**
```

---

## Fase 1 — Produção

Após aprovação, escreve cada tutorial seguindo o template:

### Template padrão de um tutorial

```markdown
---
title: Como criar um quadro
description: Aprenda a criar e configurar seu primeiro quadro no KTask
category: quadros
slug: criar-quadro
order: 1
tags: [quadro, novo, primeiro-passo]
updatedAt: 2026-05-13
---

# Como criar um quadro

> **Quem pode fazer**: qualquer membro com permissão de criar quadros (papel GESTOR ou superior).
> **Tempo estimado**: 2 minutos.

## O que é um quadro?

Quadro é o espaço onde seu time organiza tarefas em colunas (kanban). Cada projeto, cliente ou área pode ter um quadro próprio.

## Passo a passo

1. No menu principal, clique em **Quadros**.

   ![Botão Quadros no menu](/tutorial-para-clientes/img/quadros/01-menu-quadros.png)

2. No canto superior direito, clique em **+ Novo quadro**.

3. Informe o nome do quadro (ex: "Marketing Q4 2026") e clique em **Criar**.

4. Pronto. Você foi levado pro quadro recém-criado, com 3 colunas padrão: A Fazer, Em Andamento, Concluído. Você pode renomear, adicionar ou remover colunas a qualquer momento.

## Próximos passos

- [Configurar colunas do quadro](configurar-colunas)
- [Criar seu primeiro card](../cards/criar-card)

## Dúvidas comuns

**Posso renomear o quadro depois?** Sim. Clique no nome do quadro no topo e edite.

**Posso ter quadros privados?** Sim. Nas configurações do quadro, mude visibilidade pra "Privado". Só quem você adicionar como membro vai ver.

**Posso arquivar um quadro sem perder o histórico?** Sim. No menu do quadro, escolha "Arquivar". Você pode restaurar depois.

---

Essa página foi útil? [Sim] [Não] | [Falar com suporte](/ajuda/suporte)
```

### Lista priorizada dos 15 tutoriais

Use a mesma ordem do briefing 09:

1. **comecar/01-primeiros-passos** — Visão geral do KTask, primeiro login, dashboard
2. **comecar/02-criar-conta-aceitar-convite** — Aceitar convite por email, definir senha, conferir perfil
3. **quadros/01-criar-quadro** — Como criar e nomear um quadro novo
4. **quadros/02-configurar-colunas** — Adicionar, renomear, reordenar, arquivar colunas
5. **cards/01-criar-card** — Criar card numa coluna, título, descrição básica
6. **cards/02-mover-arrastar** — Arrastar entre colunas, mudar posição, atalhos de teclado se houver
7. **cards/03-anexos-comentarios** — Anexar arquivo, comentar, mencionar membro
8. **cards/04-sub-cards-familia** — Criar sub-card filho, navegar família, marcar pai
9. **aprovacoes/01-pedir-aprovacao-cliente** — Configurar reviewer externo, enviar link, acompanhar status
10. **aprovacoes/02-link-publico-cliente** — Pra cliente: o que esperar ao abrir o link, como aprovar ou pedir revisão
11. **automacoes/01-conceito-geral** — Trigger + condition + action, exemplos do dia-a-dia
12. **automacoes/02-criar-primeira-automacao** — Passo-a-passo de "quando card entra na coluna X, atribuir Fulano"
13. **crm/01-contatos-e-empresas** — Cadastrar contato, vincular a um usuário do KTask, vincular pessoa a empresa
14. **importacao/01-importar-do-ummense** — Wizard, mapeamento, retomada de import
15. **configuracoes/01-perfil-e-equipe** — Editar perfil, adicionar membros, papéis, convites

Em cada tutorial:

- Confirma comportamento na UI (não inventa)
- Lista prints necessários (mesmo que ainda não existam)
- Adiciona "Dúvidas comuns" (3-5 perguntas curtas)
- Linka pros próximos tutoriais relacionados
- Footer com feedback útil/não-útil + link suporte

---

## Fase 2 — Auto-auditoria

1. **Cobertura**: 15/15 tutoriais escritos? Algum ficou em placeholder?
2. **Comportamento confirmado?**: cada passo descreve o que a UI faz hoje? Marcou `[CONFIRMAR]` onde teve dúvida?
3. **Tom consistente?**: linguagem clara, sem jargão técnico de dev, sem emojis?
4. **Prints catalogados?**: lista final com todos os prints referenciados, organizados por categoria, indicando quais já existem em `tutorial-para-clientes/img/` e quais o Nicchon precisa tirar?
5. **Links internos?**: navegação entre tutoriais funciona (links pros slugs corretos)?
6. **Frontmatter atualizado?**: `description` preenchida em todos? `updatedAt` correto?
7. **Entrega**:

```
## Resumo da entrega

- Tutoriais escritos: 15/15 (ou menor com justificativa)
- Linhas médias por tutorial: ~X
- Prints já existentes reaproveitados: Y
- Prints novos solicitados ao Nicchon: Z (lista anexa)
- Itens marcados [CONFIRMAR] pelo Nicchon: lista
- Inferências sem confirmação: [lista]
- Tutoriais cujo escopo cresceu além de 200 linhas: [lista — vale dividir em sub-tutoriais?]
- Sugestões de tutoriais adicionais (futura segunda leva): [lista]
```

### Anexo final: pedido de prints pro Nicchon

Lista estruturada:

```
## Prints necessários

### Categoria: quadros
- 01-menu-quadros.png — Captura do menu lateral mostrando o item "Quadros" destacado
- 02-novo-quadro-dialog.png — Modal "Novo quadro" aberto, com campo nome focado
- ...

### Categoria: cards
- ...
```

---

## Notas gerais

- Sem emojis no conteúdo final.
- Linguagem PT-BR formal-amigável.
- Confirma comportamento na UI ANTES de escrever ("vou clicar e ver onde isso leva").
- Em dúvida sobre como uma feature funciona hoje, NÃO inventa — marca [CONFIRMAR] e segue.
- Reaproveita conteúdo de `tutorial-para-clientes/` quando aplicável (cita origem em comentário oculto se útil pro Nicchon).
- Em dúvida sobre escopo, pergunte.
