-- Cronograma V2: cards Tecnologia (#61..#73)
-- Caminho B: sequencial sem overlap, pausas naturais inseridas
-- Gerado em 2026-05-14T16:55:43.752Z
BEGIN;

-- #73: KTask | Ops — backup diário + prune automático no deploy
UPDATE "Activity" SET "createdAt" = '2026-05-12T04:58:00.000Z' WHERE "cardId" = 'cmp57vzew00h1nb07rzaxesen' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T05:03:00.000Z' WHERE "cardId" = 'cmp57vzew00h1nb07rzaxesen' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-12T06:03:00.000Z' WHERE "cardId" = 'cmp57vzew00h1nb07rzaxesen' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T04:58:00.000Z', "completedAt" = '2026-05-12T06:03:00.000Z' WHERE id = 'cmp57vzew00h1nb07rzaxesen';

-- #66: KTask | Tutorial para clientes (PDF/site estático) — polimento final
UPDATE "Activity" SET "createdAt" = '2026-05-12T13:58:00.000Z' WHERE "cardId" = 'cmp57v3vw0099nb076uw58l3e' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T14:03:00.000Z' WHERE "cardId" = 'cmp57v3vw0099nb076uw58l3e' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-12T18:03:00.000Z' WHERE "cardId" = 'cmp57v3vw0099nb076uw58l3e' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T13:58:00.000Z', "completedAt" = '2026-05-12T18:03:00.000Z' WHERE id = 'cmp57v3vw0099nb076uw58l3e';

-- #67: KTask | Recuperação de senha — fluxo completo (email + WhatsApp + admin)
UPDATE "Activity" SET "createdAt" = '2026-05-12T18:08:00.000Z' WHERE "cardId" = 'cmp57vbjx00b7nb07zbn8hnbu' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T18:13:00.000Z' WHERE "cardId" = 'cmp57vbjx00b7nb07zbn8hnbu' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-12T20:13:00.000Z' WHERE "cardId" = 'cmp57vbjx00b7nb07zbn8hnbu' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T18:08:00.000Z', "completedAt" = '2026-05-12T20:13:00.000Z' WHERE id = 'cmp57vbjx00b7nb07zbn8hnbu';

-- #72: KTask | Aprovações — templates de mensagem WhatsApp + default
UPDATE "Activity" SET "createdAt" = '2026-05-12T20:08:00.000Z' WHERE "cardId" = 'cmp57vwvg00gfnb07z1yx6rkk' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T20:13:00.000Z' WHERE "cardId" = 'cmp57vwvg00gfnb07z1yx6rkk' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-12T20:43:00.000Z' WHERE "cardId" = 'cmp57vwvg00gfnb07z1yx6rkk' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T20:08:00.000Z', "completedAt" = '2026-05-12T20:43:00.000Z' WHERE id = 'cmp57vwvg00gfnb07z1yx6rkk';

-- #70: KTask | Importação Ummense — reconciliação final (10617 tasks)
UPDATE "Activity" SET "createdAt" = '2026-05-12T20:38:00.000Z' WHERE "cardId" = 'cmp57vp6x00ejnb07uqu1nlcz' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T20:43:00.000Z' WHERE "cardId" = 'cmp57vp6x00ejnb07uqu1nlcz' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-12T22:43:00.000Z' WHERE "cardId" = 'cmp57vp6x00ejnb07uqu1nlcz' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T20:38:00.000Z', "completedAt" = '2026-05-12T22:43:00.000Z' WHERE id = 'cmp57vp6x00ejnb07uqu1nlcz';

-- #71: KTask | Quadros arquivados visíveis em /quadros + desarquivar
UPDATE "Activity" SET "createdAt" = '2026-05-12T22:38:00.000Z' WHERE "cardId" = 'cmp57vuaa00ftnb07gz7093j9' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T22:43:00.000Z' WHERE "cardId" = 'cmp57vuaa00ftnb07gz7093j9' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-12T23:28:00.000Z' WHERE "cardId" = 'cmp57vuaa00ftnb07gz7093j9' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T22:38:00.000Z', "completedAt" = '2026-05-12T23:28:00.000Z' WHERE id = 'cmp57vuaa00ftnb07gz7093j9';

-- #68: KTask | CRM — vínculo Contact ↔ User ↔ Empresa com identidade unificada
UPDATE "Activity" SET "createdAt" = '2026-05-12T23:23:00.000Z' WHERE "cardId" = 'cmp57vfg000c5nb07j2chjzbi' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-12T23:28:00.000Z' WHERE "cardId" = 'cmp57vfg000c5nb07j2chjzbi' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T03:28:00.000Z' WHERE "cardId" = 'cmp57vfg000c5nb07j2chjzbi' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-12T23:23:00.000Z', "completedAt" = '2026-05-13T03:28:00.000Z' WHERE id = 'cmp57vfg000c5nb07j2chjzbi';

-- #69: KTask | Card — unificação dos caminhos de criação (helper createCardWithPresence)
UPDATE "Activity" SET "createdAt" = '2026-05-13T03:23:00.000Z' WHERE "cardId" = 'cmp57vkoo00dfnb07i0xokund' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T03:28:00.000Z' WHERE "cardId" = 'cmp57vkoo00dfnb07i0xokund' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T06:28:00.000Z' WHERE "cardId" = 'cmp57vkoo00dfnb07i0xokund' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T03:23:00.000Z', "completedAt" = '2026-05-13T06:28:00.000Z' WHERE id = 'cmp57vkoo00dfnb07i0xokund';

-- #65: KTask | Documentação técnica do KTask (8 entregáveis)
UPDATE "Activity" SET "createdAt" = '2026-05-13T14:33:00.000Z' WHERE "cardId" = 'cmp57uwit007hnb07kyru4199' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T14:38:00.000Z' WHERE "cardId" = 'cmp57uwit007hnb07kyru4199' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T19:38:00.000Z' WHERE "cardId" = 'cmp57uwit007hnb07kyru4199' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T14:33:00.000Z', "completedAt" = '2026-05-13T19:38:00.000Z' WHERE id = 'cmp57uwit007hnb07kyru4199';

-- #61: KTask | Central de Ajuda — estrutura e busca
UPDATE "Activity" SET "createdAt" = '2026-05-13T19:33:00.000Z' WHERE "cardId" = 'cmp57u1np000dnb07139s0ci4' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T19:38:00.000Z' WHERE "cardId" = 'cmp57u1np000dnb07139s0ci4' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-13T23:38:00.000Z' WHERE "cardId" = 'cmp57u1np000dnb07139s0ci4' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T19:33:00.000Z', "completedAt" = '2026-05-13T23:38:00.000Z' WHERE id = 'cmp57u1np000dnb07139s0ci4';

-- #62: KTask | Central de Ajuda — formulário de suporte (cria card no board Suporte)
UPDATE "Activity" SET "createdAt" = '2026-05-13T23:33:00.000Z' WHERE "cardId" = 'cmp57u8c6001znb07kf7u4jgx' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-13T23:38:00.000Z' WHERE "cardId" = 'cmp57u8c6001znb07kf7u4jgx' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T02:08:00.000Z' WHERE "cardId" = 'cmp57u8c6001znb07kf7u4jgx' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-13T23:33:00.000Z', "completedAt" = '2026-05-14T02:08:00.000Z' WHERE id = 'cmp57u8c6001znb07kf7u4jgx';

-- #63: KTask | Central de Ajuda — conteúdo dos 15 tutoriais
UPDATE "Activity" SET "createdAt" = '2026-05-14T02:03:00.000Z' WHERE "cardId" = 'cmp57ucii002xnb07m69w4zs6' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-14T02:08:00.000Z' WHERE "cardId" = 'cmp57ucii002xnb07m69w4zs6' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T05:08:00.000Z' WHERE "cardId" = 'cmp57ucii002xnb07m69w4zs6' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-14T02:03:00.000Z', "completedAt" = '2026-05-14T05:08:00.000Z' WHERE id = 'cmp57ucii002xnb07m69w4zs6';

-- #64: KTask | Central de Ajuda — polimento UI/UX + SEO
UPDATE "Activity" SET "createdAt" = '2026-05-14T05:03:00.000Z' WHERE "cardId" = 'cmp57uozt005pnb07qnuk8yym' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxochok0i31o307doqztn5m';
UPDATE "Activity" SET "createdAt" = '2026-05-14T05:08:00.000Z' WHERE "cardId" = 'cmp57uozt005pnb07qnuk8yym' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxocj1s0i3lo3079ssgk49y';
UPDATE "Activity" SET "createdAt" = '2026-05-14T06:38:00.000Z' WHERE "cardId" = 'cmp57uozt005pnb07qnuk8yym' AND type = 'CARD_MOVED' AND payload->>'toListId' = 'cmoxoceww0i2bo30768awkgn0';
UPDATE "Card" SET "createdAt" = '2026-05-14T05:03:00.000Z', "completedAt" = '2026-05-14T06:38:00.000Z' WHERE id = 'cmp57uozt005pnb07qnuk8yym';

COMMIT;