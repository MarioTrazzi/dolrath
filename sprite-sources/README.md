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
(`monsterImageSlug` do catálogo — ex.: `ancia-da-mata`, `lobo-faminto`).
Subpasta por bioma é livre (`monsters/floresta-sombria/lobo-faminto.png`): o
script varre recursivamente e o slug é o nome do ARQUIVO. Nome fora do catálogo
é listado e ignorado — melhor reclamar aqui do que gerar um slug que nenhuma
entrada de `MONSTER_SPRITES` casa.

```bash
npx tsx scripts/slice-hero-sprite-sheet.ts --all-monsters --force
```

A folha do monstro tem uma direção a mais que a do herói: além do PERFIL, ela
traz FRENTE e COSTAS, porque o bicho ronda o bolsão em 360° (o herói só anda de
lado ou subindo a trilha). As linhas são juntadas com UMA escala comum — escalas
separadas fariam a criatura mudar de tamanho ao virar.

**Cada folha vem com uma diagramação diferente**, e isso é dado, não gosto: as
flags de cada bicho moram em `SHEET_RECIPES`, dentro do próprio script, para o
`--all-monsters` continuar reproduzível. Duas coisas que já apareceram:

- `grid: {cols, rows}` — quando os frames se encostam e a projeção não separa
  (perna da aranha de cima na de baixo; sombra pintada fazendo ponte entre dois
  lobos). A grade é o que falta, e é trivial de contar a olho na folha.
- `killTrappedBg` — folha com chão pintado que cerca uma poça de fundo dentro da
  silhueta (o vão entre as patas do lobo). Sai como mancha clara chapada.

Qualquer flag na linha de comando ganha da receita, então dá pra experimentar
sem editar o script.

Saída em `public/sprites/monsters/<slug>/`, manifesto em `src/lib/monsterSprites.ts`.

## Objetos de nó (baú, ervas, fonte, entulho)

Outra família de folha: os objetos que a cena explorável desenha nos nós de
achado. Vão na RAIZ desta pasta com o nome que a receita espera (`chest.png`,
`weed.png`, `fonte.png`, `rubble.png`).

```bash
npm run art:scene:nodes -- --dry-run
npm run art:scene:nodes
```

Não são folhas de animação: são **sequências de estado**, e o script guarda dois
quadros de cada — o cheio e o gasto (baú fechado/aberto, fonte cheia/seca, moita
intacta/colhida). Saída em `public/scene/<bioma>/<flavor>-1.webp` e
`<flavor>-used-1.webp`; a receita de cada folha mora em `NODE_SHEETS`, dentro do
próprio script.

⚠️ **Fundo CHAPADO é obrigatório** — o recorte é flood fill, então folha com cena
pintada atrás do objeto não é recuperável. O script mede e recusa antes de gastar
trabalho. Contrato completo em
[`scripts/node-sheet-prompt.md`](../scripts/node-sheet-prompt.md).

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
