-- Adiciona sub-automacao MOVE_CARD (CHECKLIST_ITEM_DONE) nos items das
-- automacoes INSERT_CHECKLIST_ITEMS que vieram do Ummense.
-- Espelha o comportamento "task concluida -> card move pra proxima coluna".
-- Posicao default: TOP (Ummense default).
-- Skip: Blogs > 🚩 Aprovacao do texto > "Aprovar blog" (coluna destino
-- "Solicitar arte Redes Sociais" nao existe no KTask).

BEGIN;

-- 1. Design > Fazer Briefing : "Solicitar Briefing" -> Design
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Solicitar Briefing","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjj47h002vo307rx3fcd2e","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rk0ql0097oa07sikge83i';

-- 2. Design > Design : "Design" -> 🚩 Aprovação
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Design","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjj4we0031o307spr611dn","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rk1s2009doa07spurxsb9';

-- 3. Design > 🚩 Aprovação : "Aprovar" -> Arte finalizada
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Aprovar","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjj5l60037o307y4kyhmke","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rk3wd009loa07e2u1r9x9';

-- 4. Design > Arte finalizada : "Finalizar card" -> Finalizado
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Finalizar card","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjj69v003do307lujgi8vg","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rk4ez009poa07ajf16jyw';

-- 5. Atendimento > ⚠ Demandas : "Dar seguimento" -> Finalizado
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Dar seguimento","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjkx5400hjo307xq0mogge","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rl6gb00f5oa07h76u4qwg';

-- 6. Atendimento > ⏰ Reuniões : "REUNIÃO" -> Finalizado
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"REUNIÃO","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjkx5400hjo307xq0mogge","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rl7zi00fboa07audn4321';

-- 7. Blogs > Criar texto do conteúdo (autom A) : "Fazer texto de blog + redes sociais" -> 🚩 Aprovação do texto
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Fazer texto de blog + redes sociais","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjl2a200ipo307s4gzb9e0","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rlb2400fpoa075bn98k06';

-- 8. Blogs > Criar texto do conteúdo (autom B) : "Criar conteúdo" -> 🚩 Aprovação do texto
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Criar conteúdo","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjl2a200ipo307s4gzb9e0","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rld7l00g5oa075zuzk64y';

-- 9. SKIP: Blogs > 🚩 Aprovação do texto (autom A) : "Aprovar blog" -> "Solicitar arte Redes Sociais"
--    Coluna destino nao existe no KTask. User precisa decidir.

-- 10. Blogs > 🚩 Aprovação do texto (autom B) : "Aprovar texto do conteúdo" -> Publicar
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Aprovar texto do conteúdo","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjl4c700j7o30769t7m680","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rles100gboa07ymlpw6i5';

-- 11. Blogs > Copy para E-mail Marketing : 2 items, so o primeiro recebe sub-automation.
--     "Publicar/Agendar - Blog" segue sem sub-automation (nao estava no Ummense).
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Criar texto para e-mail marketing (newsletter)","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjl3na00j1o3076g4tqq5o","position":"TOP"}}},{"text":"Publicar/Agendar - Blog"}]'::jsonb)
WHERE id = 'cmp2rlgc100ghoa078upezcmy';

-- 12. Blogs > 🚩 Aprovação do E-mail : "Aprovar e-mail marketing (newsletter)" -> Publicar
--     (no Ummense era "Publicar E-mail" mas a coluna no KTask se chama so "Publicar")
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Aprovar e-mail marketing (newsletter)","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjl4c700j7o30769t7m680","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rlhcd00gloa07wjc4fnqp';

-- 13. ANEC > COPY A FAZER : "criar copy" -> APROVAR COPY
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"criar copy","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjli0100mdo307wspoqo27","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rlles00h1oa07zddgllgi';

-- 14. ANEC > APROVAR COPY : "Aprovar copy" -> DESIGN A FAZER
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Aprovar copy","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjljm500mpo307zgbi9glh","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rllxi00h3oa073cebyyuu';

-- 15. ANEC > DESIGN A FAZER : "Design" -> 🚩 APROVAÇÃO
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"Design","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjll1e00n1o307ygzepe9t","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rlp7900hfoa077c8jhi9j';

-- 16. ANEC > 🚩 APROVAÇÃO : "APROVAR" -> ✅ PUBLICAR
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"APROVAR","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjllr600n7o3070o3i601q","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rlrsm00hpoa077m5ft8oc';

-- 17. ANEC > ✅ PUBLICAR : 2 items, AMBOS movem pra FINALIZADO
UPDATE "Automation" SET "actionConfig" = jsonb_set("actionConfig", '{items}',
  '[{"text":"SE FOR VÍDEO: REELS, STORIE E SHORTS","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjlol700nvo3076ya4mye4","position":"TOP"}}},{"text":"AGENDAR NO LINKEDIN, INSTAGRAM E FACEBOOK","itemAutomation":{"trigger":"CHECKLIST_ITEM_DONE","actionType":"MOVE_CARD","actionConfig":{"targetListId":"cmoxjlol700nvo3076ya4mye4","position":"TOP"}}}]'::jsonb)
WHERE id = 'cmp2rltbg00hvoa07hs39edd0';

COMMIT;

-- Verificacao: contar quantas automacoes ficaram com itemAutomation
SELECT COUNT(*) AS automacoes_com_subautomacao
FROM "Automation"
WHERE "actionType" = 'INSERT_CHECKLIST_ITEMS'
  AND "actionConfig"->'items' @? '$[*].itemAutomation';
