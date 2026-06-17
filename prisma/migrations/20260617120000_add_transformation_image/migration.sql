-- 🐉 Imagem e forma fixa da transformação
-- Aditivo e nullable: personagens existentes seguem funcionando (fallback de emoji no combate).
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "unlockedTransformation" TEXT;
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "transformationImage" TEXT;
