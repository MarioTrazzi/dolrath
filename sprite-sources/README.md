# Folhas de sprite cruas (Gemini)

Jogue aqui os PNGs gerados no Gemini. **Só esta README vai pro repo** — as folhas
têm ~5MB cada e ficam ignoradas; o que é commitado é a tira recortada em
`public/sprites/<race>-<class>/`.

## Nome do arquivo

O script descobre a combinação pelo nome, então renomeie para `<race>-<class>.png`.
Nome fora do padrão é listado e ignorado (não quebra o lote).

Copie e cole:

```
humano-warrior.png       elfo-warrior.png       draconiano-warrior.png       metamorfo-warrior.png
humano-rogue.png         elfo-rogue.png         draconiano-rogue.png         metamorfo-rogue.png
humano-mage.png          elfo-mage.png          draconiano-mage.png          metamorfo-mage.png
humano-monk.png          elfo-monk.png          draconiano-monk.png          metamorfo-monk.png
```

Raças em PT e classes em EN — é assim que `RACES`/`CLASSES` vivem em
`src/lib/gameData.ts`. Os pares canônicos da Jornada são elfo⇄rogue,
humano⇄mage, draconiano⇄warrior e metamorfo⇄monk.

## Recortar

```bash
npx tsx scripts/slice-hero-sprite-sheet.ts --all
```

Processa a pasta inteira, pula o que já tem tira (use `--force` pra regerar),
não para se uma folha falhar, e no fim imprime o checklist das 16 mais as
entradas prontas pra colar em `src/lib/heroSprites.ts`.

Uma folha só:

```bash
npx tsx scripts/slice-hero-sprite-sheet.ts --race humano --class mage
```

## Monstros

Folha de monstro vai em `monsters/<slug>.png`, com o MESMO slug da arte pintada
(`monsterImageSlug` do catálogo — ex.: `ancia-da-mata`, `lobo-faminto`):

```bash
npx tsx scripts/slice-hero-sprite-sheet.ts --monster ancia-da-mata --rows 1,2 --cell 192x288
```

A folha do monstro tem uma linha a mais de informação que a do herói: além do
PERFIL, ela traz FRENTE e COSTAS, porque o bicho ronda o bolsão em 360° (o herói
só anda de lado ou subindo a trilha). `--rows 1,2` junta as duas linhas com UMA
escala comum — escalas separadas fariam a criatura mudar de tamanho ao virar.

Saída em `public/sprites/monsters/<slug>/`, manifesto em `src/lib/monsterSprites.ts`.

## Depois

1. Abra `public/sprites/<slug>/_contact.png` — recorte limpo? qual índice é o de costas?
2. `/dev/sprite-lab` pra calibrar ordem do ciclo, fps e altura (aba 👹 monstros
   pros bichos, onde se editam os três ciclos).
3. Cole em `src/lib/heroSprites.ts` (ou `src/lib/monsterSprites.ts`).
4. Confira o resultado como a cena mostra:
   `npx tsx scripts/review-hero-sprites.ts --slug <slug>` (`--monster <slug>` pro bicho).
5. Só monstro: `npx tsx scripts/check-monster-patrol.ts` prova que a ronda usa a
   folha inteira e não sai do bolsão.

O contrato da folha (grade, fundo, poses) está em
[`scripts/hero-sprite-sheet-prompt.md`](../scripts/hero-sprite-sheet-prompt.md).
