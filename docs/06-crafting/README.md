# 06 — Crafting

Dois ofícios vivos: **Forja** (ferreiro) e **Alquimia** (alquimista). Ambos são sinks de GOLD relevantes (ver [EDD §Craft](../07-economy/GAME-ECONOMY-DESIGN.md)).

## Mesa de Forja (`src/lib/forge.ts`)

| Receita | Entrada | Custo em GOLD | Saída |
|---|---|---|---|
| Craft de gear comum/incomum | materiais de masmorra | **30% do preço de catálogo** (mín. 10) | equipamento novo |
| Refino de pedra | 10 pedras básicas | taxa fixa da receita | 1 pedra concentrada (10:1) |
| Reparo de raro | item raro quebrado + **Estilhaço de Memória** | taxa | item restaurado |

Pedras de aprimoramento: básicas e concentradas, separadas para **arma** e **armadura** (`src/lib/enhancementSystem.ts`, `STONE_NAMES`). O `enhancementLevel` (+N) é congelado no NFT quando o item é mintado.

## Alquimia (`src/lib/alchemy.ts`)

- Receitas em `INGREDIENT_CATALOG`; ingredientes são `Item CONSUMABLE` com `stats.kind='ingredient'` (sem migração de schema).
- Custo: **30% do preço da poção** (mín. 5 GOLD) + ingredientes.
- Craft é **100% de sucesso** — o custo é a taxa, não RNG (decisão de design: frustração de craft falho não gera diversão).
- O drop de ingredientes substituiu os antigos MATERIALS-lixo.

## Materiais por masmorra (`src/lib/dungeonData.ts`)

| Masmorra | Materiais característicos |
|---|---|
| Floresta | couro, erva medicinal, madeira |
| Caverna | minério de ferro, pedra, prata, cristal azul |
| Pântano | erva mágica, escama menor de dragão |
| Ruínas | minério de ouro, mithril |

## Regras de inventário que afetam craft

- **Equipamento NUNCA empilha** (1 slot/peça — escassez de slots é parte da economia); consumíveis/materiais empilham; a bancada de reparo agrupa apenas na UI.
- **Cap de slots é imposto em loot, craft, forja e loja** (não só na transferência). Personagem novo nasce com 20 slots; expansão paga em GOLD.

## EM BREVE

- Profissões com XP próprio (ferreiro/alquimista de jogador).
- Receitas raras dropadas por bosses (receita como item colecionável).
- Craft de cosméticos (skin de arma) — sink premium.
