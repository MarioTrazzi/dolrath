# 03 — World

## Estrutura do mundo

O mundo jogável hoje se divide em **Cidade** (serviços) e **Masmorras** (conteúdo PvE), mais a **Arena** (PvP ao vivo).

### Cidade (hub)

| Local | Função | Sistema |
|---|---|---|
| Loja | Compra de equipamentos e consumíveis (GOLD) | `src/app/api/store/*`, catálogo em `src/lib/itemCatalog.ts` |
| Ferreiro | Mesa de Forja: craft, refino concentrado 10:1, reparo raro | `src/lib/forge.ts` |
| Alquimista | Craft de poções com ingredientes dropados | `src/lib/alchemy.ts` |
| Banco | Depósito/saque entre carteira do personagem e conta; ponto de claim on-chain | `src/app/api/bank/*` |
| Arena | PvP em tempo real via socket | `server/socket-server.js` |
| Mercado | Marketplace on-chain de itens (GOLD) e personagens (DOL) | `/marketplace` |

### Masmorras

Quatro masmorras com bandas de nível crescentes (fonte: `src/lib/dungeonAdventures.ts`):

| Masmorra | Banda de nível | Identidade | Status de arte |
|---|---|---|---|
| Floresta Sombria | inicial (~1–15) | floresta corrompida; aranhas, lobos, ents, javalis | ✅ monstros com arte própria |
| Caverna | intermediária | minérios (ferro, prata, cristal azul) | arte pendente |
| Pântano | intermediária-alta | ervas mágicas, escamas de dragão | arte pendente |
| Ruínas | alta (~até 50+) | ouro, mithril, civilização perdida | arte pendente |

Cada **run** de masmorra é um grafo de salas: **salas principais** (obrigatórias, monstro + recompensa maior), **nós menores** (opcionais, 1–3 monstros mais fracos em pacote, XP por abate, possibilidade de recuar) e **boss** ao final. Eventos de exploração intercalam as salas: armadilha, tesouro, bênção, fonte, nada.

A dificuldade e a recompensa escalam por sala via `tierFactor` (passo de 0,6 por tier — `TIER_POWER_STEP` em `dungeonAdventures.ts`), e a entrada é gateada por **stamina** diária (ver [PvE](../18-pve/README.md)).

## Expansões planejadas (EM BREVE)

- **Novas masmorras/regiões** por temporada (deserto, cordilheira, abismo submarino).
- **Terrenos (Lands)** — parcelas do mundo possuídas por jogadores (ver [Lands](../14-lands/README.md)).
- **Mapa-múndi navegável** substituindo o menu de seleção de masmorras.
- **Zonas de guilda** ligadas ao sistema de guildas (ver [Guilds](../13-guilds/README.md)).
