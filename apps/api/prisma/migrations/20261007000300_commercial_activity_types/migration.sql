-- Doc 52 (Fase 3): tipos de Activity do registro de contato comercial.
-- Aditivo (precedente: 20260608170000_add_card_primary_changed_activity).
ALTER TYPE "ActivityType" ADD VALUE 'COMMERCIAL_ACTIVITY_LOGGED';
ALTER TYPE "ActivityType" ADD VALUE 'COMMERCIAL_ACTIVITY_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'COMMERCIAL_ACTIVITY_DELETED';
