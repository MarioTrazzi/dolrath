-- Mapa de imagens de transformação por forma (metamorfo: wolf/bear/eagle; demais raças: 1 entrada)
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "transformationImages" JSONB;
