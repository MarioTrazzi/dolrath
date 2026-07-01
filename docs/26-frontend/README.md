# 26 — Frontend

## Stack

Next.js 14 + React 18 + TypeScript; Tailwind CSS; Zustand (estado); Framer Motion (animações); Lucide (ícones); Socket.IO client (PvP).

## Superfícies principais

| Rota | O quê |
|---|---|
| `/` | home/hub |
| `/character` | criação (18 pontos, piso 8; prévia de stats via `lib/characterStats.ts`) |
| `/combat` + arena | PvP ao vivo com chat de batalha e ações `[colchetes]` |
| dungeon (DungeonRun.tsx) | run PvE consumindo `/api/dungeon/run/*` |
| `/inventory` | inventário + `BankPanel` (banco/carteira) |
| `/blacksmith`, alquimista | forja e poções |
| `/marketplace` | browse/venda/compra de NFTs |
| `/dev/battle-fx` | preview interno das animações |

## Padrões de UI que são regra

1. **Feedback de combate:** toda skill tem animação própria via `AbilityFX.tsx` (impacto/aura/esquiva/crit por `action`+classe). Skill nova sem FX registrado é bug.
2. **Rolagem visível:** o d20 do PvE aparece na tela — a variância é parte da diversão.
3. **Inventário:** equipamento nunca agrupa; consumível empilha; grade sem destaques falsos de "equipado".
4. **Saldo certo no lugar certo:** botões de compra checam a fonte que será gasta (carteira do personagem vs banco vs on-chain) — bug histórico do ferreiro já corrigido pelo modelo do banco.
5. **Web3 sem sofrimento:** fees da Polygon calculadas pelo app (`gasFees.ts`), fluxos de approve encadeados e explicados.

## Tema visual

Dark fantasy: roxo `#8B5CF6`, ciano `#06B6D4`, âmbar `#F59E0B`; gradientes escuros; responsivo mobile-first (ver [Art Direction](../27-art-direction/README.md)).

## EM BREVE

- Mapa-múndi navegável (substitui menus).
- Onboarding guiado do primeiro claim on-chain.
- PWA/mobile wrapper.
