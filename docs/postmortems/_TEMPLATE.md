# Postmortem — [Título curto do incidente]

- **Data do incidente**: AAAA-MM-DD
- **Detectado por**: [pessoa ou monitoramento]
- **Detectado em**: AAAA-MM-DD HH:MM (America/Sao_Paulo)
- **Resolvido em**: AAAA-MM-DD HH:MM
- **Duração do impacto**: X horas / dias
- **Severidade**: P0 | P1 | P2 | P3 (ver `docs/runbooks/README.md`)
- **Autor do postmortem**: [pessoa]

## Resumo executivo

2 a 3 frases. O que aconteceu, qual o impacto, como foi resolvido. Legível em 30 segundos.

## Impacto

- **Usuários afetados**: ...
- **Funcionalidades afetadas**: ...
- **Dados perdidos / corrompidos**: ... (idealmente "nenhum"; se houve, descrever escopo)
- **Reportes externos**: ... (cliente notou? quantos?)
- **Trabalho interno perdido**: ...

## Linha do tempo

Horários em America/Sao_Paulo. Marcar com `~` quando aproximado; usar timestamp exato (`HH:MM:SS`) quando vier de commit, log ou alerta.

| Horário (BRT)              | Evento |
| -------------------------- | ------ |
| ~HH:MM (aprox.)            | ...    |
| HH:MM:SS (commit `<hash>`) | ...    |

> Horários marcados com `~` são aproximações baseadas em memória ou mensagens; valores exatos vêm de commits/logs.

## Causa raiz

Análise técnica. Em vez de "fulano fez X errado", descrever "o sistema permitiu X em circunstância Y porque Z não estava presente". Incluir trechos de código relevantes com link pra commit/arquivo no formato `[caminho](../../caminho)`.

Se houver múltiplos paths afetados pela mesma causa, listar todos — sinaliza padrão sistêmico.

## O que funcionou bem

Reconhecer o que ajudou a detectar/resolver. Importante pra reforçar boas práticas (não só apontar falhas).

## O que falhou

Sem culpado individual. Falhas de processo, ferramenta, falta de instrumentação, suposições não-validadas, ausência de teste.

## Lições aprendidas

3 a 5 lições genéricas que ficam pro time. Cada uma deve ser citável em discussões futuras ("lembra da lição do postmortem do CARROSSEL CANNES?").

## Action items

| #   | Ação | Tipo       | Prioridade | Responsável | Status |
| --- | ---- | ---------- | ---------- | ----------- | ------ |
| 1   | ...  | preventivo | alta       | [pessoa]    | aberto |
| 2   | ...  | detectivo  | média      | [pessoa]    | aberto |

Tipos:

- **preventivo** — impede que o mesmo erro aconteça de novo (helper, refactor, validação)
- **detectivo** — acelera detecção futura (teste, alerta, query de health-check)
- **corretivo** — resolve causa raiz remanescente que não foi totalmente fechada na resolução do incidente
- **mitigatório** — reduz o impacto se o problema ocorrer de novo (fallback, circuit breaker, comunicação automática)

## Links

- Commits do fix: ...
- Issues / PRs: ...
- Runbook relacionado (se houver): ...
- Outras docs relevantes (ADR, tarefa-md): ...
