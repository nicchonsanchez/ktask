---
title: Importar do Ummense
description: Como migrar um quadro do Ummense para o KTask, mapeando membros e colunas pelo wizard.
category: importacao
slug: importar-do-ummense
order: 1
tags: [importacao, ummense, migracao, csv, wizard]
updatedAt: 2026-05-14
---

# Importar do Ummense

> **Quem pode fazer**: Dono ou Administrador da organização.
> **Tempo estimado**: 10 a 30 minutos, dependendo do tamanho do quadro.

> **Esta funcionalidade está em evolução.** Se algum passo não bater com o que você vê, fale com o suporte.

## O que dá para importar

O importador do Ummense traz para o KTask:

- **Cards** com título, descrição, etiquetas, prazo e responsáveis.
- **Colunas** do fluxo (mantém a mesma ordem do Ummense).
- **Comentários** e histórico básico (em alguns formatos).
- **Membros** envolvidos nos cards, mapeados para usuários do KTask.

O que **não** vem:

- Anexos. Você precisa baixar do Ummense e reanexar no KTask se forem importantes.
- Automações. Recrie no KTask (veja [Criar primeira automação](../automacoes/criar-primeira-automacao)).
- Aprovações em andamento. Você refaz pelo KTask.
- Custom fields muito específicos do Ummense. Vão como texto livre na descrição.

## Antes de importar — checklist

1. **Exporte o quadro do Ummense em CSV**. No Ummense, abra o quadro → menu → Exportar → formato CSV `[CONFIRMAR — terminologia exata do Ummense, deixar pro Nicchon validar]`.
2. **Adicione os membros que importam no KTask antes** (Configurações → Membros → adicionar). Assim, no mapeamento, eles aparecem na lista.
3. **Decida**: o quadro novo do KTask vai usar as colunas do Ummense ou vai começar com as colunas padrão? Você decide no Passo 1 do wizard.

## Passo a passo

### Passo 1 — Arquivo e destino

1. Na topbar, clique em **Configurações** → **Importar**.
2. Clique em **+ Nova importação**.
3. **Selecione o arquivo CSV** exportado do Ummense.
4. **Escolha o destino**:
   - **Quadro existente**: o conteúdo será adicionado a um quadro que já existe (cuidado com duplicação).
   - **Criar um quadro novo** (recomendado): você dá um nome e o importador cria o quadro com as colunas vindas do Ummense.
5. Avance.

### Passo 2 — Mapeamento

O wizard mostra o que ele identificou no CSV e como pretende mapear no KTask:

- **Colunas (listas)**: cada coluna do Ummense é mapeada para uma coluna no KTask. Você revisa e pode renomear, fundir duas em uma, ou descartar.
- **Membros**: cada nome de pessoa que aparece nos cards é mapeado para um usuário do KTask. O importador faz uma sugestão por nome/e-mail aproximado, e você confirma ou ajusta.
- **Etiquetas (tags)**: cada etiqueta do Ummense é mapeada para uma etiqueta do KTask. Onde já existe etiqueta com nome igual, vincula; onde não existe, cria.

> **Você pode escolher "Ignorar"** em qualquer linha. Cards que referenciam um item ignorado ficam sem aquela informação, mas continuam sendo importados.

> **O sistema lembra das suas escolhas**. Se você importar mais quadros do Ummense depois, o mapeamento de membros e etiquetas que você já fez é reaplicado automaticamente. Você só revisa o que for novo.

### Passo 3 — Confirmação e execução

O wizard mostra um resumo: quantos cards serão importados, quantas colunas, quantos membros, quantas etiquetas, e o destino.

1. Confira.
2. Clique em **Iniciar importação**.

A importação roda em segundo plano. Cards grandes podem levar alguns minutos. Você pode fechar a aba — quando voltar, a tela mostra o progresso e o resultado.

### Resultado

No fim, você recebe um **relatório**:

- **Importados com sucesso**: número de cards.
- **Pulados**: cards com problemas (CSV mal formatado, dados inválidos) — com motivo de cada um.
- **Avisos**: itens que entraram mas com perda parcial (ex: anexos referenciados não vieram).

Abra o quadro novo (ou existente) e confira como ficou. Se algo estiver muito errado, você pode arquivar o quadro e começar de novo — não vai bagunçar nada fora do destino.

## Importação em lote

Se você tem vários quadros para migrar, em **Configurações → Importar → Lote** dá para fazer o upload de vários CSVs de uma vez. O sistema processa um após o outro e mostra o resultado consolidado.

`[CONFIRMAR — tela /importar/lote existe e está funcional?]`

## Retomar uma importação

Se algo falhou no meio, a importação fica registrada com status "pendente" ou "interrompida" na lista de importações. Você pode:

- **Retomar**: continua de onde parou.
- **Cancelar**: descarta o que estava em andamento. O que já foi importado fica no destino.

## Próximos passos

- [Configurar colunas do quadro](../quadros/configurar-colunas) — ajustar colunas importadas
- [Criar a primeira automação](../automacoes/criar-primeira-automacao) — recriar regras que vinham do Ummense

## Dúvidas comuns

**Posso importar mais de uma vez no mesmo quadro?**
Pode, mas vai duplicar cards. Use só se a primeira importação falhou logo no início.

**O Ummense não exporta CSV. E agora?**
Verifique a opção de exportação no plano do Ummense. Se não houver, fale com o suporte da Kharis — em casos pontuais, dá para extrair os dados manualmente.

**Os anexos podem ser importados?**
Hoje, não automaticamente. Você precisa baixar os arquivos do Ummense e reanexar no KTask card a card.

**Meus membros não aparecem na lista de mapeamento.**
Verifique se já foram adicionados à organização do KTask (Configurações → Membros). Só usuários que existem no KTask aparecem na lista.

**A importação travou. O que faço?**
Volte para a lista de importações em Configurações → Importar. Veja o status. Se estiver com erro, leia a mensagem; se travou sem erro, cancele e refaça. Em qualquer caso, peça ajuda ao suporte se o problema persistir.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
