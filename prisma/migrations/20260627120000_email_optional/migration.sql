-- Wallet-only login: email is no longer required at signup (added later for newsletter/recovery).
-- Postgres allows multiple NULLs under a UNIQUE index, so the @unique constraint stays valid.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
