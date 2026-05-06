# 37 — Importer Ummense: anexos formais (PDFs e arquivos)

## Status

**Backlog.** Bloqueado por decisão de canal (API oficial vs scraping
manual). Imagens inline já foram resolvidas pelo doc 16/Importer V2.1
(rehost automático de `storage.ummense.com` → S3 nosso).

## O problema

CSV do Ummense **não traz** os anexos formais dos cards (PDFs, .docx,
imagens fora da descrição, etc):

- **Col 13 "Arquivos"** contém apenas os **nomes** dos arquivos
  (`"AVANTIEDUCACAO proposta site"`, `"IMG_2726"`). Sem URL, sem
  binário. Inútil pra recuperação.
- **URLs `storage.ummense.com`** só aparecem em HTML de descrição
  como `<img src>` — imagens inline. PDFs/anexos formais não passam
  por lá.

Resultado: importação migra texto + estrutura, mas perde 100% dos
anexos formais. Quando Ummense for desligado, perdemos esses arquivos.

## Caminhos viáveis (em ordem de viabilidade)

### A) API oficial Ummense

Documentação do Ummense menciona API. Endpoints prováveis:

- `GET /api/v1/projects/{shortCode}/files` lista anexos
- `GET /api/v1/files/{id}/download` baixa binário

Pré-requisitos:

- Token API (gerado pelo OWNER da conta Ummense da Kharis)
- Confirmar limites de rate-limit
- Confirmar que API expõe anexos (não só metadata do projeto)

Implementação (~3-4h):

1. Env vars `UMMENSE_API_TOKEN` + `UMMENSE_API_URL`
2. 3ª passada do importer V2: depois de criar Card, busca lista
   de anexos do shortCode original via API, baixa cada binário,
   sobe pro nosso S3 via `StorageService.putObject`, cria
   `Attachment` no card.
3. Falha gracioso por anexo (mantém o resto)

### B) Crawler com sessão logada

Login programático no portal Ummense, scrape do HTML de cada card
pegando URLs de anexos e baixando. Frágil — quebra se Ummense
mudar HTML/CSS. Não recomendo.

### C) Download manual + drag-drop

Admin abre cada card no Ummense, baixa anexos manualmente, arrasta
pro card correspondente no KTask. Inviável se forem mais de
~20-30 cards com anexos.

### D) Híbrido: CLI auxiliar com sessão

Script CLI que recebe (a) CSV exportado e (b) cookie de sessão do
admin logado no Ummense. Itera os cards e baixa anexos, gerando
`<shortCode>/<filename>` localmente. Depois um endpoint do KTask
recebe esse zip e faz o vínculo. Menos frágil que B porque o
crawling é offline + auditável.

## Decisão pendente

Você precisa decidir o canal antes de eu implementar. Pergunta-âncora:
**existe API token do Ummense disponível?** Se sim, A é o caminho —
me passa o token, vou pra V2. Se não, vai pra C (manual) ou D
(híbrido) dependendo do volume.

## Estimativa de volume

CSV grande tem 25 cards com `Arquivos` preenchido (de 285 totais
~9%). Volume real de bytes desconhecido sem baixar — sample IMG_2726
sugere imagens leves; AVANTIEDUCACAO sugere PDF que pode ter MB.
Estimativa: ~50-100 anexos no total da Org Kharis. Manejável manual
no pior caso, mas A automatiza.

## Relação com outros docs

- **16-importer-ummense.md**: importer base
- **28-importer-ummense-wizard.md**: wizard V2
- **31-importer-multi-fluxo.md**: vincular shortCodes existentes
