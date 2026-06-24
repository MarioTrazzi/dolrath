// ============================================================
// Runs de DEMO das masmorras (landing) — DADOS REAIS gerados por
// scripts/dungeon-loot-sim.ts, que roda os geradores do jogo
// (rollNodeLoot + scaleMonster). Cada run é a "melhor vitrine" de milhares
// de simulações: d20 por nó, XP/gold por nó e o espólio (drops). A demo
// percorre os nós acumulando XP e gold no HUD (canto superior direito).
//
// Para regenerar:
//   TS_NODE_TRANSPILE_ONLY=1 npx ts-node \
//     --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' \
//     -r tsconfig-paths/register scripts/dungeon-loot-sim.ts
// e cole os blocos MOCK[...] aqui.
// ============================================================

export type RunRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
export type RunDropKind = 'ingredient' | 'consumable' | 'item' | 'stone'

export interface RunDrop {
  name: string
  emoji: string
  rarity: RunRarity
  kind: RunDropKind
  /** aprimoramento embutido (equipamento) — 0 = sem +N */
  enh: number
}

export interface RunNode {
  kind: 'minor' | 'main' | 'boss'
  /** resultado do d20 ao avançar (boss = 20, sorte máxima) */
  roll: number
  /** monstro enfrentado neste nó (null = "achado", sem combate) */
  mon: string | null
  emoji: string | null
  xp: number
  gold: number
  drops: RunDrop[]
}

export type DungeonRunId = 'floresta' | 'caverna' | 'pantano' | 'ruinas'

export const DUNGEON_RUNS: Record<DungeonRunId, RunNode[]> = {
  floresta: [
    {
      "kind": "minor",
      "roll": 6,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 26,
      "drops": []
    },
    {
      "kind": "minor",
      "roll": 14,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 31,
      "drops": [
        {
          "name": "Tônico do Berserker",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Cinta de Mana",
          "emoji": "📦",
          "rarity": "COMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 6,
      "mon": "Aranha Gigante",
      "emoji": "🕷️",
      "xp": 41,
      "gold": 76,
      "drops": [
        {
          "name": "Pedra Negra (Armadura)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 11,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 24,
      "drops": [
        {
          "name": "Raiz Vigorosa",
          "emoji": "🌱",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Pedra Negra (Armadura)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 10,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 17,
      "drops": [
        {
          "name": "Pó de Fênix",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Elmo do Sentinela",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 4
        }
      ]
    },
    {
      "kind": "main",
      "roll": 16,
      "mon": "Aranha Gigante",
      "emoji": "🕷️",
      "xp": 60,
      "gold": 88,
      "drops": [
        {
          "name": "Faixa Ágil",
          "emoji": "📦",
          "rarity": "COMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 5,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 10,
      "drops": [
        {
          "name": "Água Pura",
          "emoji": "💧",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Pó de Fênix",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 4,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 10,
      "drops": [
        {
          "name": "Raiz Vigorosa",
          "emoji": "🌱",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Gargantilha de Aço",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 13,
      "mon": "Javali Furioso",
      "emoji": "🐗",
      "xp": 102,
      "gold": 115,
      "drops": [
        {
          "name": "Cristal de Mana",
          "emoji": "🔮",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Botas de Viajante",
          "emoji": "📦",
          "rarity": "COMMON",
          "kind": "item",
          "enh": 4
        }
      ]
    },
    {
      "kind": "boss",
      "roll": 20,
      "mon": "Anciã da Mata",
      "emoji": "🌲",
      "xp": 382,
      "gold": 529,
      "drops": [
        {
          "name": "Elixir Supremo",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Amuleto da Coruja",
          "emoji": "📦",
          "rarity": "RARE",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Pedra Negra (Armadura)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    }
  ],
  caverna: [
    {
      "kind": "minor",
      "roll": 20,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 43,
      "drops": [
        {
          "name": "Pedra Negra (Arma)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 11,
      "mon": "Slime de Cristal",
      "emoji": "🟣",
      "xp": 26,
      "gold": 31,
      "drops": [
        {
          "name": "Flor de Mana",
          "emoji": "💠",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 15,
      "mon": "Morcego Sombrio",
      "emoji": "🦇",
      "xp": 43,
      "gold": 127,
      "drops": [
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Vestes do Conjurador",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 13,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 34,
      "drops": [
        {
          "name": "Glândula de Veneno",
          "emoji": "🟢",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 18,
      "mon": "Golem de Pedra",
      "emoji": "🗿",
      "xp": 44,
      "gold": 111,
      "drops": [
        {
          "name": "Erva Medicinal",
          "emoji": "🌿",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Elixir Supremo",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Cinturão Reforçado",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 13,
      "mon": "Golem de Pedra",
      "emoji": "🗿",
      "xp": 68,
      "gold": 139,
      "drops": []
    },
    {
      "kind": "minor",
      "roll": 17,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 72,
      "drops": [
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Punhal do Caçador",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 15,
      "mon": "Morcego Sombrio",
      "emoji": "🦇",
      "xp": 44,
      "gold": 81,
      "drops": []
    },
    {
      "kind": "main",
      "roll": 20,
      "mon": "Golem de Pedra",
      "emoji": "🗿",
      "xp": 151,
      "gold": 207,
      "drops": [
        {
          "name": "Faixa do Conjurador",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 15,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 41,
      "drops": [
        {
          "name": "Punhal do Caçador",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 18,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 51,
      "drops": [
        {
          "name": "Erva Medicinal",
          "emoji": "🌿",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Vestes do Conjurador",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Pedra Negra (Arma)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 18,
      "mon": "Goblin Minerador",
      "emoji": "👺",
      "xp": 121,
      "gold": 266,
      "drops": [
        {
          "name": "Pó de Osso",
          "emoji": "🦴",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Armadura de Couro Batido",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Pedra Negra (Armadura)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "boss",
      "roll": 20,
      "mon": "Wyrm Cristalino",
      "emoji": "🐉",
      "xp": 501,
      "gold": 926,
      "drops": [
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Colar do Veio Dourado",
          "emoji": "📦",
          "rarity": "RARE",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        }
      ]
    }
  ],
  pantano: [
    {
      "kind": "minor",
      "roll": 15,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 71,
      "drops": [
        {
          "name": "Cogumelo Lunar",
          "emoji": "🍄",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 13,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 59,
      "drops": []
    },
    {
      "kind": "minor",
      "roll": 7,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 34,
      "drops": []
    },
    {
      "kind": "main",
      "roll": 4,
      "mon": "Crocodilo Ancião",
      "emoji": "🐊",
      "xp": 53,
      "gold": 58,
      "drops": [
        {
          "name": "Flor de Mana",
          "emoji": "💠",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 14,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 69,
      "drops": []
    },
    {
      "kind": "minor",
      "roll": 3,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 16,
      "drops": [
        {
          "name": "Flor de Mana",
          "emoji": "💠",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 20,
      "mon": "Crocodilo Ancião",
      "emoji": "🐊",
      "xp": 40,
      "gold": 78,
      "drops": [
        {
          "name": "Elixir Supremo",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 5,
      "mon": "Serpente do Lodo",
      "emoji": "🐍",
      "xp": 108,
      "gold": 130,
      "drops": [
        {
          "name": "Flor de Mana",
          "emoji": "💠",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 1,
      "mon": "Serpente do Lodo",
      "emoji": "🐍",
      "xp": 47,
      "gold": 40,
      "drops": []
    },
    {
      "kind": "minor",
      "roll": 20,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 107,
      "drops": [
        {
          "name": "Erva Medicinal",
          "emoji": "🌿",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 13,
      "mon": "Crocodilo Ancião",
      "emoji": "🐊",
      "xp": 63,
      "gold": 73,
      "drops": [
        {
          "name": "Pó de Fênix",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 8,
      "mon": "Crocodilo Ancião",
      "emoji": "🐊",
      "xp": 125,
      "gold": 153,
      "drops": [
        {
          "name": "Pó de Osso",
          "emoji": "🦴",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Pó de Fênix",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Pedra Negra Mágica Concentrada (Arma)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 6,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 65,
      "drops": [
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 12,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 49,
      "drops": [
        {
          "name": "Glândula de Veneno",
          "emoji": "🟢",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Cajado Rúnico",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Pedra Negra Mágica Concentrada (Armadura)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 12,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 41,
      "drops": [
        {
          "name": "Pó de Osso",
          "emoji": "🦴",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 12,
      "mon": "Serpente do Lodo",
      "emoji": "🐍",
      "xp": 201,
      "gold": 248,
      "drops": [
        {
          "name": "Punhos de Aço",
          "emoji": "📦",
          "rarity": "UNCOMMON",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "boss",
      "roll": 20,
      "mon": "Hidra do Pântano",
      "emoji": "🐲",
      "xp": 746,
      "gold": 1000,
      "drops": [
        {
          "name": "Talismã do Fogo-Fátuo",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Pedra Negra Mágica Concentrada (Arma)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    }
  ],
  ruinas: [
    {
      "kind": "minor",
      "roll": 9,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 83,
      "drops": [
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 19,
      "mon": "Múmia Real",
      "emoji": "🧟",
      "xp": 33,
      "gold": 104,
      "drops": [
        {
          "name": "Flor de Mana",
          "emoji": "💠",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 18,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 114,
      "drops": [
        {
          "name": "Cristal de Mana",
          "emoji": "🔮",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Pó de Fênix",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Anel do Selo Imperial",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 18,
      "mon": "Múmia Real",
      "emoji": "🧟",
      "xp": 85,
      "gold": 243,
      "drops": [
        {
          "name": "Relicário do Lich",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 6,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 76,
      "drops": [
        {
          "name": "Elixir Supremo",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 1,
      "mon": "Múmia Real",
      "emoji": "🧟",
      "xp": 41,
      "gold": 60,
      "drops": [
        {
          "name": "Raiz Vigorosa",
          "emoji": "🌱",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Tônico do Berserker",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 19,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 83,
      "drops": []
    },
    {
      "kind": "main",
      "roll": 10,
      "mon": "Gárgula de Obsidiana",
      "emoji": "🦅",
      "xp": 123,
      "gold": 198,
      "drops": [
        {
          "name": "Cristal de Mana",
          "emoji": "🔮",
          "rarity": "UNCOMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 13,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 43,
      "drops": [
        {
          "name": "Raiz Vigorosa",
          "emoji": "🌱",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 5,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 27,
      "drops": [
        {
          "name": "Cogumelo Lunar",
          "emoji": "🍄",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 20,
      "mon": "Esqueleto Guerreiro",
      "emoji": "💀",
      "xp": 55,
      "gold": 149,
      "drops": [
        {
          "name": "Erva Medicinal",
          "emoji": "🌿",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Vida Grande",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Pedra Negra Mágica Concentrada (Arma)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 6,
      "mon": "Gárgula de Obsidiana",
      "emoji": "🦅",
      "xp": 187,
      "gold": 195,
      "drops": [
        {
          "name": "Tônico do Berserker",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 14,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 66,
      "drops": [
        {
          "name": "Arco da Tormenta",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        },
        {
          "name": "Pedra Negra Mágica Concentrada (Armadura)",
          "emoji": "⚒️",
          "rarity": "COMMON",
          "kind": "stone",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 6,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 50,
      "drops": [
        {
          "name": "Flor de Mana",
          "emoji": "💠",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 18,
      "mon": "Espectro Errante",
      "emoji": "👻",
      "xp": 79,
      "gold": 139,
      "drops": [
        {
          "name": "Elixir Supremo",
          "emoji": "🧪",
          "rarity": "RARE",
          "kind": "consumable",
          "enh": 0
        }
      ]
    },
    {
      "kind": "main",
      "roll": 18,
      "mon": "Espectro Errante",
      "emoji": "👻",
      "xp": 188,
      "gold": 264,
      "drops": [
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Arco da Tormenta",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 14,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 71,
      "drops": [
        {
          "name": "Cogumelo Lunar",
          "emoji": "🍄",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Poção de Cura Suprema",
          "emoji": "🧪",
          "rarity": "EPIC",
          "kind": "consumable",
          "enh": 0
        },
        {
          "name": "Arco da Tormenta",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 4,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 18,
      "drops": [
        {
          "name": "Cogumelo Lunar",
          "emoji": "🍄",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        },
        {
          "name": "Faixa do Destino",
          "emoji": "📦",
          "rarity": "EPIC",
          "kind": "item",
          "enh": 0
        }
      ]
    },
    {
      "kind": "minor",
      "roll": 11,
      "mon": null,
      "emoji": null,
      "xp": 0,
      "gold": 67,
      "drops": []
    },
    {
      "kind": "main",
      "roll": 1,
      "mon": "Gárgula de Obsidiana",
      "emoji": "🦅",
      "xp": 278,
      "gold": 261,
      "drops": [
        {
          "name": "Água Pura",
          "emoji": "💧",
          "rarity": "COMMON",
          "kind": "ingredient",
          "enh": 0
        }
      ]
    },
    {
      "kind": "boss",
      "roll": 20,
      "mon": "Lich Imperador",
      "emoji": "👑",
      "xp": 1078,
      "gold": 1575,
      "drops": [
        {
          "name": "Manto da Forma Celestial",
          "emoji": "📦",
          "rarity": "LEGENDARY",
          "kind": "item",
          "enh": 0
        }
      ]
    }
  ],
}
