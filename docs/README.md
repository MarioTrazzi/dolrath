# 📖 Dolrath — Game Bible

> Documentação oficial do Dolrath, MMORPG Web3 com combate julgado por IA, economia dual-token (DOL/GOLD) e ativos NFT na Polygon.
>
> **Regra de ouro desta documentação:** tudo que está marcado como **AO VIVO** existe no código em produção hoje. Tudo marcado como **EM BREVE** é design aprovado com roadmap. Nada aqui é promessa vaga — cada afirmação sobre sistema vivo é rastreável a um arquivo do repositório.

## Documentos-âncora

| Documento | O que é |
|---|---|
| [Whitepaper Econômico](21-whitepaper/WHITEPAPER-ECONOMICO.md) | Fase 1 — visão econômica completa: DOL, GOLD, emissão, queima, vesting, treasury, DAO, anti-inflação, KPIs |
| [Game Economy Design Document](07-economy/GAME-ECONOMY-DESIGN.md) | Fase 2 — todos os faucets e sinks com números reais do código, fórmulas e balanceamento |
| [Simulador Econômico](22-tokenomics/README.md) | Fase 3 — projeção mensal de 10 anos (`scripts/token-economy-sim.js` → CSV) |
| [Tokenomics Dashboard](22-tokenomics/dashboard.html) | Fase 4 — gráficos de circulação, burn, staking, treasury (abra no navegador) |

## Seções

| # | Seção | Status |
|---|---|---|
| 01 | [Vision](01-vision/README.md) — pilares e posicionamento | AO VIVO |
| 02 | [Lore](02-lore/README.md) — universo e narrativa | PARCIAL |
| 03 | [World](03-world/README.md) — masmorras, cidade, regiões | AO VIVO |
| 04 | [Classes](04-classes/README.md) — raças, classes, transformações | AO VIVO |
| 05 | [Combat](05-combat/README.md) — dados, skills, status | AO VIVO |
| 06 | [Crafting](06-crafting/README.md) — forja e alquimia | AO VIVO |
| 07 | [Economy](07-economy/README.md) — economia do jogo (EDD) | AO VIVO |
| 08 | [NFT System](08-nft-system/README.md) — personagens e itens on-chain | AO VIVO |
| 09 | [DOL Token](09-dol-token/README.md) — token premium | AO VIVO (tokenomics EM REVISÃO) |
| 10 | [GOLD Token](10-gold-token/README.md) — token de utilidade | AO VIVO |
| 11 | [Marketplace](11-marketplace/README.md) — mercados on-chain | AO VIVO |
| 12 | [DAO](12-dao/README.md) — governança | EM BREVE |
| 13 | [Guilds](13-guilds/README.md) — guildas | EM BREVE |
| 14 | [Lands](14-lands/README.md) — terrenos | EM BREVE |
| 15 | [Raids](15-raids/README.md) — conteúdo cooperativo | EM BREVE |
| 16 | [Bosses](16-bosses/README.md) — chefes e recompensas | AO VIVO |
| 17 | [PvP](17-pvp/README.md) — arena ao vivo | AO VIVO |
| 18 | [PvE](18-pve/README.md) — masmorras e progressão | AO VIVO |
| 19 | [Seasons](19-seasons/README.md) — temporadas | EM BREVE |
| 20 | [Roadmap](20-roadmap/README.md) — fases do projeto | — |
| 21 | [Whitepaper](21-whitepaper/README.md) — whitepaper econômico | — |
| 22 | [Tokenomics](22-tokenomics/README.md) — números, simulador, dashboard | — |
| 23 | [Smart Contracts](23-smart-contracts/README.md) — contratos Solidity | AO VIVO |
| 24 | [API](24-api/README.md) — rotas e autenticação | AO VIVO |
| 25 | [Backend](25-backend/README.md) — arquitetura de servidor | AO VIVO |
| 26 | [Frontend](26-frontend/README.md) — cliente web | AO VIVO |
| 27 | [Art Direction](27-art-direction/README.md) — direção de arte e pipeline de imagens | AO VIVO |
| 28 | [Sound](28-sound/README.md) — áudio | EM BREVE |
| 29 | [Monetization](29-monetization/README.md) — receita sustentável | PARCIAL |
| 30 | [Balancing](30-balancing/README.md) — metodologia orientada por dados | AO VIVO |
| 31 | [LiveOps](31-liveops/README.md) — operação ao vivo | PARCIAL |
| 32 | [Analytics](32-analytics/README.md) — métricas e KPIs | EM BREVE |
| 99 | [Arquivo](99-arquivo/) — documentos históricos pré-Game Bible | ARQUIVO |

## Convenções

- **Idioma:** português (público-alvo BR); whitepaper terá versão EN para investidores (roadmap).
- **Fonte da verdade:** o código. Quando doc e código divergirem, o código vence e o doc deve ser corrigido.
- **Números:** valores de economia citam o arquivo de origem (ex.: `src/lib/dungeonAdventures.ts`).
- **Versionamento:** docs vivem no repositório e evoluem por commit, como código.
