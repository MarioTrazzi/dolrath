-- Adicionar campos de transformação na tabela Character
ALTER TABLE "Character" 
ADD COLUMN IF NOT EXISTS "isTransformed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "transformationType" TEXT,
ADD COLUMN IF NOT EXISTS "transformationData" JSONB;
