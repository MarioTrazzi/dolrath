-- Add optional on-chain GOLD claim tracking fields

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "goldClaimNonce" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "goldClaimPendingAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "goldClaimPendingNonce" INTEGER,
ADD COLUMN IF NOT EXISTS "goldClaimPendingDeadline" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "goldClaimPendingCreatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "goldClaimPendingTxHash" TEXT;
