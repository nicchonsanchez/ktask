-- AlterTable: User.notificationPreferences (Json opcional).
-- Storage canonico dos toggles in-app + WhatsApp por tipo de evento.
-- Shape definido em src/modules/notifications/preferences.types.ts.
-- Defaults sao aplicados em runtime (resolveNotificationPrefs).
ALTER TABLE "User" ADD COLUMN "notificationPreferences" JSONB;
