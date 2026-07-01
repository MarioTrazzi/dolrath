# 27 — Art Direction

## Direção

Dark fantasy pictórica com leitura instantânea em thumbnail (os assets vivem em grades de inventário e cards de combate). Paleta do produto: roxo/ciano/âmbar sobre fundos escuros.

## Pipeline de arte por IA (AO VIVO)

Toda a arte de itens e monstros é gerada com **gpt-image-1** com estilo travado por prompt-base, versionada em Cloudinary.

| Pipeline | Script | Estado |
|---|---|---|
| Itens | `scripts/generate-item-images.ts` (+ `audit-item-images.ts`, flag `--types`) | craft+ingredientes completos; **41 equipamentos pendentes** |
| Monstros | `scripts/generate-monster-images.ts` (estilo travado) | Floresta pronta (4 monstros + boss); Caverna/Pântano/Ruínas pendentes |
| Personagens | `characterImagePrompt.ts`, `creationVisuals.ts`, `transformationImageGen.ts` | retrato por raça/classe + formas transformadas |

Regras do pipeline:
1. **Estilo travado:** o prompt-base não muda por asset; consistência > criatividade pontual.
2. **Manifesto versionado:** `scripts/item-image-manifest.json` mapeia item→imagem; auditoria automatizada detecta buracos.
3. **Reuso honesto:** boss pode reaproveitar base de monstro com variação (feito na Floresta).

## Backlog de arte

- 41 equipamentos sem imagem própria.
- Monstros de 3 masmorras.
- Bosses únicos por masmorra.
- Cosméticos de temporada (quando Seasons chegar).

## EM BREVE

- Style guide visual formal (este doc + moodboard).
- Passe de artista humano sobre os hero assets (logo, key art de marketing, capa do whitepaper).
