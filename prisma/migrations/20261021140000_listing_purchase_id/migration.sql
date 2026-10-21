-- Voucher de lazy-mint em voo na linha do inventário (ver listingLock.ts).
ALTER TABLE "CharacterInventory" ADD COLUMN IF NOT EXISTS "listingPurchaseId" TEXT;
