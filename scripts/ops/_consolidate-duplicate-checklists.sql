-- Consolidacao das checklists "Tarefas" duplicadas (bug do importer
-- que usava GET /cards/by-code esperando .checklists no retorno; mas
-- o endpoint retorna so {id,boardId}).
--
-- Logica:
--   Pra cada card com N checklists "Tarefas" (N>1):
--     1. Vencedor = a com mais items DONE; em empate, a mais antiga
--     2. Pra cada item das outras checklists:
--        - Se mesmo texto (LOWER+TRIM) ja existe no vencedor:
--          - Se item velho esta DONE e o do vencedor pending, promove
--          - Deleta o item duplicado
--        - Senao, move pro vencedor (UPDATE checklistId, position fim)
--     3. Deleta as checklists nao-vencedoras (ja vazias)
--
-- Roda inteiro em transacao. Comente o COMMIT e use ROLLBACK pra testar.

BEGIN;

-- Preview antes (count): quantos cards, checklists pra apagar, items pra mover
\echo '== PRE-EXECUCAO =='
SELECT 'Cards afetados' AS metrica, COUNT(*) AS valor
FROM (
  SELECT c.id FROM "Card" c
  JOIN "Checklist" cl ON cl."cardId" = c.id AND LOWER(cl.title) = 'tarefas'
  GROUP BY c.id HAVING COUNT(cl.id) > 1
) s
UNION ALL
SELECT 'Checklists duplicadas (a deletar)' AS metrica, SUM(cnt - 1)
FROM (
  SELECT COUNT(cl.id) AS cnt FROM "Checklist" cl
  WHERE LOWER(cl.title) = 'tarefas' GROUP BY cl."cardId" HAVING COUNT(cl.id) > 1
) s;

-- Bloco principal
DO $$
DECLARE
  card_rec    RECORD;
  winner_id   TEXT;
  loser_rec   RECORD;
  item_rec    RECORD;
  exist_item  RECORD;
  max_pos     DOUBLE PRECISION;
  promoted    INTEGER := 0;
  moved       INTEGER := 0;
  deleted_d   INTEGER := 0;
  deleted_cl  INTEGER := 0;
  affected    INTEGER := 0;
BEGIN
  FOR card_rec IN
    SELECT c.id AS card_id
    FROM "Card" c
    JOIN "Checklist" cl ON cl."cardId" = c.id AND LOWER(cl.title) = 'tarefas'
    GROUP BY c.id
    HAVING COUNT(cl.id) > 1
  LOOP
    affected := affected + 1;

    -- Vencedor: mais items done, depois mais antigo
    SELECT cl.id INTO winner_id
    FROM "Checklist" cl
    LEFT JOIN "ChecklistItem" it ON it."checklistId" = cl.id AND it."isDone" = true
    WHERE cl."cardId" = card_rec.card_id AND LOWER(cl.title) = 'tarefas'
    GROUP BY cl.id, cl."createdAt"
    ORDER BY COUNT(it.id) DESC, cl."createdAt" ASC
    LIMIT 1;

    -- Max position atual do vencedor
    SELECT COALESCE(MAX(position), 0) INTO max_pos
    FROM "ChecklistItem" WHERE "checklistId" = winner_id;

    -- Itera nas checklists nao-vencedoras
    FOR loser_rec IN
      SELECT id FROM "Checklist"
      WHERE "cardId" = card_rec.card_id AND LOWER(title) = 'tarefas' AND id != winner_id
      ORDER BY "createdAt"
    LOOP
      -- Itera nos items do loser
      FOR item_rec IN
        SELECT id, text, "isDone", "doneAt", "doneById"
        FROM "ChecklistItem"
        WHERE "checklistId" = loser_rec.id
      LOOP
        SELECT id, "isDone", "doneAt", "doneById" INTO exist_item
        FROM "ChecklistItem"
        WHERE "checklistId" = winner_id
          AND LOWER(TRIM(text)) = LOWER(TRIM(item_rec.text))
        LIMIT 1;

        IF exist_item.id IS NOT NULL THEN
          -- Promove done se necessario
          IF item_rec."isDone" = true AND exist_item."isDone" = false THEN
            UPDATE "ChecklistItem"
            SET "isDone"   = true,
                "doneAt"   = COALESCE(exist_item."doneAt", item_rec."doneAt", NOW()),
                "doneById" = COALESCE(exist_item."doneById", item_rec."doneById")
            WHERE id = exist_item.id;
            promoted := promoted + 1;
          END IF;
          DELETE FROM "ChecklistItem" WHERE id = item_rec.id;
          deleted_d := deleted_d + 1;
        ELSE
          max_pos := max_pos + 1024;
          UPDATE "ChecklistItem"
          SET "checklistId" = winner_id, position = max_pos
          WHERE id = item_rec.id;
          moved := moved + 1;
        END IF;
      END LOOP;

      DELETE FROM "Checklist" WHERE id = loser_rec.id;
      deleted_cl := deleted_cl + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE '== RESULTADO ==';
  RAISE NOTICE 'Cards processados:           %', affected;
  RAISE NOTICE 'Items movidos pro vencedor:  %', moved;
  RAISE NOTICE 'Items duplicados deletados:  %', deleted_d;
  RAISE NOTICE 'Promocoes done (vencedor):   %', promoted;
  RAISE NOTICE 'Checklists deletadas:        %', deleted_cl;
END $$;

-- Verificacao pos
\echo '== POS-EXECUCAO =='
SELECT 'Cards ainda com duplicatas' AS metrica, COUNT(*) AS valor
FROM (
  SELECT c.id FROM "Card" c
  JOIN "Checklist" cl ON cl."cardId" = c.id AND LOWER(cl.title) = 'tarefas'
  GROUP BY c.id HAVING COUNT(cl.id) > 1
) s;

COMMIT;
