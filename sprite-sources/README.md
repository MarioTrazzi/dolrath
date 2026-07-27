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

## Depois

1. Abra `public/sprites/<slug>/_contact.png` — recorte limpo? qual índice é o de costas?
2. `/dev/sprite-lab` pra calibrar ordem do ciclo, fps e altura.
3. Cole em `src/lib/heroSprites.ts`.

O contrato da folha (grade, fundo, poses) está em
[`scripts/hero-sprite-sheet-prompt.md`](../scripts/hero-sprite-sheet-prompt.md).
