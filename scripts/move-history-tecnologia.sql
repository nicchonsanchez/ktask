-- Move history dos 13 cards Tecnologia (#61..#73)
-- Gerado em 2026-05-14T08:30:52.816Z
-- Rodar via: psql -U ktask -d ktask -f move-history-tecnologia.sql
BEGIN;

-- #61: KTask | Central de Ajuda — estrutura e busca
UPDATE "Activity" SET "createdAt" = '2026-05-14T01:54:00.000Z' WHERE "cardId" = 'cmp57u1np000dnb07139s0ci4' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-14T01:59:00.000Z' WHERE "cardId" = 'cmp57u1np000dnb07139s0ci4' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T05:59:00.000Z' WHERE "cardId" = 'cmp57u1np000dnb07139s0ci4' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-14T01:54:00.000Z' WHERE id = 'cmp57u1np000dnb07139s0ci4';

-- #62: KTask | Central de Ajuda — formulário de suporte (cria card no board Suporte)
UPDATE "Activity" SET "createdAt" = '2026-05-14T03:25:00.000Z' WHERE "cardId" = 'cmp57u8c6001znb07kf7u4jgx' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-14T03:30:00.000Z' WHERE "cardId" = 'cmp57u8c6001znb07kf7u4jgx' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T06:00:00.000Z' WHERE "cardId" = 'cmp57u8c6001znb07kf7u4jgx' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-14T03:25:00.000Z' WHERE id = 'cmp57u8c6001znb07kf7u4jgx';

-- #63: KTask | Central de Ajuda — conteúdo dos 15 tutoriais
UPDATE "Activity" SET "createdAt" = '2026-05-14T02:57:00.000Z' WHERE "cardId" = 'cmp57ucii002xnb07m69w4zs6' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-14T03:02:00.000Z' WHERE "cardId" = 'cmp57ucii002xnb07m69w4zs6' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T06:02:00.000Z' WHERE "cardId" = 'cmp57ucii002xnb07m69w4zs6' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-14T02:57:00.000Z' WHERE id = 'cmp57ucii002xnb07m69w4zs6';

-- #64: KTask | Central de Ajuda — polimento UI/UX + SEO
UPDATE "Activity" SET "createdAt" = '2026-05-14T05:03:00.000Z' WHERE "cardId" = 'cmp57uozt005pnb07qnuk8yym' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-14T05:08:00.000Z' WHERE "cardId" = 'cmp57uozt005pnb07qnuk8yym' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T06:38:00.000Z' WHERE "cardId" = 'cmp57uozt005pnb07qnuk8yym' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-14T05:03:00.000Z' WHERE id = 'cmp57uozt005pnb07qnuk8yym';

-- #65: KTask | Documentação técnica do KTask (8 entregáveis)
UPDATE "Activity" SET "createdAt" = '2026-05-13T21:14:00.000Z' WHERE "cardId" = 'cmp57uwit007hnb07kyru4199' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T21:19:00.000Z' WHERE "cardId" = 'cmp57uwit007hnb07kyru4199' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T02:19:00.000Z' WHERE "cardId" = 'cmp57uwit007hnb07kyru4199' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T21:14:00.000Z' WHERE id = 'cmp57uwit007hnb07kyru4199';

-- #66: KTask | Tutorial para clientes (PDF/site estático) — polimento final
UPDATE "Activity" SET "createdAt" = '2026-05-13T11:55:00.000Z' WHERE "cardId" = 'cmp57v3vw0099nb076uw58l3e' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T12:00:00.000Z' WHERE "cardId" = 'cmp57v3vw0099nb076uw58l3e' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T16:00:00.000Z' WHERE "cardId" = 'cmp57v3vw0099nb076uw58l3e' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T11:55:00.000Z' WHERE id = 'cmp57v3vw0099nb076uw58l3e';

-- #67: KTask | Recuperação de senha — fluxo completo (email + WhatsApp + admin)
UPDATE "Activity" SET "createdAt" = '2026-05-13T14:26:00.000Z' WHERE "cardId" = 'cmp57vbjx00b7nb07zbn8hnbu' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T14:31:00.000Z' WHERE "cardId" = 'cmp57vbjx00b7nb07zbn8hnbu' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T16:31:00.000Z' WHERE "cardId" = 'cmp57vbjx00b7nb07zbn8hnbu' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T14:26:00.000Z' WHERE id = 'cmp57vbjx00b7nb07zbn8hnbu';

-- #68: KTask | CRM — vínculo Contact ↔ User ↔ Empresa com identidade unificada
UPDATE "Activity" SET "createdAt" = '2026-05-13T20:00:00.000Z' WHERE "cardId" = 'cmp57vfg000c5nb07j2chjzbi' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T20:05:00.000Z' WHERE "cardId" = 'cmp57vfg000c5nb07j2chjzbi' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T00:05:00.000Z' WHERE "cardId" = 'cmp57vfg000c5nb07j2chjzbi' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T20:00:00.000Z' WHERE id = 'cmp57vfg000c5nb07j2chjzbi';

-- #69: KTask | Card — unificação dos caminhos de criação (helper createCardWithPresence)
UPDATE "Activity" SET "createdAt" = '2026-05-13T22:48:00.000Z' WHERE "cardId" = 'cmp57vkoo00dfnb07i0xokund' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T22:53:00.000Z' WHERE "cardId" = 'cmp57vkoo00dfnb07i0xokund' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T01:53:00.000Z' WHERE "cardId" = 'cmp57vkoo00dfnb07i0xokund' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T22:48:00.000Z' WHERE id = 'cmp57vkoo00dfnb07i0xokund';

-- #70: KTask | Importação Ummense — reconciliação final (10617 tasks)
UPDATE "Activity" SET "createdAt" = '2026-05-13T16:09:00.000Z' WHERE "cardId" = 'cmp57vp6x00ejnb07uqu1nlcz' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T16:14:00.000Z' WHERE "cardId" = 'cmp57vp6x00ejnb07uqu1nlcz' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T18:14:00.000Z' WHERE "cardId" = 'cmp57vp6x00ejnb07uqu1nlcz' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T16:09:00.000Z' WHERE id = 'cmp57vp6x00ejnb07uqu1nlcz';

-- #71: KTask | Quadros arquivados visíveis em /quadros + desarquivar
UPDATE "Activity" SET "createdAt" = '2026-05-13T17:44:00.000Z' WHERE "cardId" = 'cmp57vuaa00ftnb07gz7093j9' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T17:49:00.000Z' WHERE "cardId" = 'cmp57vuaa00ftnb07gz7093j9' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T18:34:00.000Z' WHERE "cardId" = 'cmp57vuaa00ftnb07gz7093j9' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T17:44:00.000Z' WHERE id = 'cmp57vuaa00ftnb07gz7093j9';

-- #72: KTask | Aprovações — templates de mensagem WhatsApp + default
UPDATE "Activity" SET "createdAt" = '2026-05-13T17:09:00.000Z' WHERE "cardId" = 'cmp57vwvg00gfnb07z1yx6rkk' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T17:14:00.000Z' WHERE "cardId" = 'cmp57vwvg00gfnb07z1yx6rkk' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T17:44:00.000Z' WHERE "cardId" = 'cmp57vwvg00gfnb07z1yx6rkk' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T17:09:00.000Z' WHERE id = 'cmp57vwvg00gfnb07z1yx6rkk';

-- #73: KTask | Ops — backup diário + prune automático no deploy
UPDATE "Activity" SET "createdAt" = '2026-05-13T02:38:00.000Z' WHERE "cardId" = 'cmp57vzew00h1nb07rzaxesen' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T02:43:00.000Z' WHERE "cardId" = 'cmp57vzew00h1nb07rzaxesen' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T03:43:00.000Z' WHERE "cardId" = 'cmp57vzew00h1nb07rzaxesen' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T02:38:00.000Z' WHERE id = 'cmp57vzew00h1nb07rzaxesen';

COMMIT;
-- FIM. Total: 13 cards atualizados.