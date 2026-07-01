# 20 — Roadmap

> Roadmap de produto + economia. Datas são janelas-alvo, não promessas; a régua de passagem entre fases é sempre métrica, não calendário (ver [Analytics](../32-analytics/README.md)).

## Fase 0 — Fundação (CONCLUÍDA)

- ✅ Combate por turnos com IA juiz; 4 raças × 4 classes; transformações balanceadas por simulação
- ✅ PvE: 4 masmorras, salas+nós, packs, status effects, stamina, loot servidor-autoritativo com teto diário
- ✅ PvP 1v1 ao vivo (socket) com recompensas
- ✅ Craft: Forja (craft/refino/reparo) + Alquimia (poções)
- ✅ Web3: login por carteira (SIWE/HMAC); GOLD claim EIP-712; NFTs de item (lazy-mint) e personagem (metadata viva); marketplace de itens; loja on-chain/off-chain; modelo do banco
- ✅ Pipeline de arte por IA (itens, monstros da Floresta)

## Fase 1 — Hardening econômico (EM ANDAMENTO — pré-mainnet)

- [ ] Playtest completo do fluxo banco/carteira/claim
- [ ] Merge do redesign PvE lean (branch `claude/pve-lean-combat`)
- [ ] Gear no PvP + rebalance de lendários (decisão 2026-06-21)
- [ ] Taxa de marketplace (4% itens / 5% personagens, split burn/treasury) nos contratos
- [ ] DolToken v2: supply fixo 1B, rename "Dolrath"/DOL, vesting on-chain
- [ ] Deploy `CHARACTER_MARKET`; round-trip completo do item comprado (re-hidratar p/ gameplay)
- [ ] Arte dos monstros: Caverna, Pântano, Ruínas; 41 equipamentos pendentes

## Fase 2 — Launch Web3 (mainnet Polygon)

- [ ] TGE do DOL (liquidez inicial, lockups conforme whitepaper)
- [ ] Staking de DOL com participação nas taxas
- [ ] Dashboard público de tokenomics (emissão/burn em tempo real)
- [ ] Auditoria externa dos contratos

## Fase 3 — Social & Ritmo

- [ ] Seasons + passe de temporada + PvP ranqueado (ligas)
- [ ] Guildas (fundação, banco, hall)
- [ ] Leilões e aluguel de NFTs
- [ ] World bosses de evento

## Fase 4 — Mundo vivo

- [ ] Raids cooperativas 3–5 jogadores
- [ ] Terrenos (lands) com produção de materiais
- [ ] DAO Fase B (propostas comunitárias)
- [ ] Versão EN + expansão de mercado

## Régua de passagem (exemplos)

- Fase 1→2: sink/faucet ratio ≥ 0,7 por 4 semanas; zero exploits críticos abertos; playtest de claim sem incidentes.
- Fase 2→3: ≥ X MAU estável (definir com dados da Fase 2); profundidade de liquidez que suporte volume de marketplace sem slippage abusivo.
