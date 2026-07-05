# 🎯 Dolrath — Relatório de Balance para Lançamento

> **ATUALIZAÇÃO 2026-07-05 (mesma sessão): FASE DE APLICAÇÃO EXECUTADA.**
> Commits 96bc6f5 (P0 venda) · f972544 (P0 TET) · 3317ded (P1 coleta) ·
> 0714b7a (P1 PvP) · ac2e9a0 (P2 pedras). Estado PÓS-ajuste (sim:economy, 30d):
>
> | Chars | Faucet/dia | venda | NET/dia | Set +15 main |
> |---|---|---|---|---|
> | 1 | 7,2k (era 9,2k) | 43% | +4,9k | **27d** ✅ (c/ bônus 🌅) |
> | 3 | 14,8k | 46% | +10,3k | 23d ✅ |
> | 5 | 19,9k (era 28,2k) | 42% | +13,2k | 16d ✅ |
> | 10 | 20,4k (era 52,1k) | 20% | +8,6k | 15d |
>
> ✅ Cap estanque (venda dentro do teto; 10 chars: faucet 52k→20,4k) · TET
> ~1.010 conc + boss 3★+ garante 1-2 concentradas (≈30-35d dedicado) · coleta
> com rampa (~10% nv1 → ~52% nv50) · PvP ~420/dia c/ custo de 20 stamina/luta
> e rota endurecida (níveis do DB + 1ª-vitória do servidor).
>
> **Pendências — RESOLVIDAS na mesma sessão (2ª passada):**
> 1. ✅ **Solo vs esquadrão**: bônus 🌅 dos 2 PRIMEIROS bosses do dia da CONTA
>    (+3 Pedras cada, FIRST_BOSS_BONUS em dungeonAdventures + rota combat).
>    Solo 37d → **27d** (meta 21-28 ✅); esquadrão 16d → 13d (quase parado, como
>    desenhado — o bônus é por conta, não por personagem).
> 2. ✅ **Dedup do battle/rewards**: janela de 120s por confronto (o rastro
>    "PvP Victory vs <nome>" do histórico vira guarda) — winner E loser
>    chamando a rota não duplicam mais o crédito.
>
> **Follow-ups pós-lançamento (telemetria):**
> - 📊 Venda 42-46% do faucet em 1-5 chars (meta ≤30%) — cap segura e NET está
>   na meta; reavaliar pConsumable com dados reais.
> - 🪙 Token: re-rodar token-economy-sim com NET medido (5-13k/dia/conta) após
>   o redeploy dos contratos v2.

**Data:** 2026-07-05 · **Fase:** testes (relatório original abaixo — números PRÉ-ajuste)
**Ferramentas:** `scripts/economy-unified-sim.ts` (novo — geradores reais do jogo),
`enhancement-cost-sim.ts` (novo), `pvp-lever-sim`, `pve-full-run-sim`,
`dungeon-difficulty-sim`, `farm-progression-sim` (defaults sincronizados),
`token-economy-sim`. CSV: `docs/balance/economy-unified.csv`.

Reprodução: `npm run sim:economy` (determinístico, seed 42).

---

## Sumário executivo

A economia tem **um furo dominante** (venda de consumível dropado = ~40% do faucet),
**duas atividades desalinhadas** (coleta rende 11% da masmorra por stamina; PvP é esmola)
e **um teto de progressão inalcançável** (TET/PEN). O combate (PvP e PvE) está saudável.
Poções, reparo e o loop de +15 estão no alvo.

| # | Área | Medido | Meta | Status |
|---|------|--------|------|--------|
| 1 | PvP formas/classes | formas 47,6–51,1% · classes 46,9–52,0% | 43–58% | ✅ |
| 2 | PvE Floresta (run limpa) | 58,1% · net −1.087 (craft) a −2.421 (loja)/run | ~55–60% · sink intencional | ✅ |
| 3 | PvE Caverna/Pântano/Ruínas (boss) | 63–66% com gear-alvo nas 4 masmorras | banda consistente | ✅ * |
| 4 | Farm até set +15 | 1 char 32d · 5 chars 7d · 10 chars 4d | 21–28d · ~10d · ~7d | ⚠️ |
| 5 | Custo aprimoramento PRI–PEN | PRI 4,9 conc · DUO 39 · TRI 323 · TET 3.330 · PEN 108.661 | TRI meses; TET alcançável | ❌ topo |
| 6 | Coleta vs masmorra (gold/stamina) | 2,5 vs 23 (≈11%) | 30–60% | ❌ |
| 7 | Fazenda | insumos de poção cobertos; 4,7–18 g/stamina | suporte, não faucet | ✅ |
| 8 | Venda de loot a 60% | **57–62% do faucet total** (consumível sozinho ~40%) | ≤25–30% | ❌❌ |
| 9 | PvP como faucet | ~170 g/dia/conta (0–2% do faucet), sem custo de stamina | ≈ masmorra ±30% | ❌ |
| 10 | Poções como sink | 15–42% do gold bruto por run | 15–30% | ✅ |
| 11 | Curva XP vs bands | nv10 em 5d ✅; nv21 em 30d (só Floresta) | rampa sem muro | ⚠️ ** |
| 12 | Stamina: fonte da verdade | resolvido (ver abaixo) | documentado | ✅ |
| 13 | Teto diário 20k | 1 char: nunca bate · 5 chars: ~1/3 dos dias · 10 chars: 96% | 1 char folga ≥40% | ⚠️ |
| 14 | Token/DOL (burn vs emissão) | burn ano-10: 1,2M (bear) a 141M (bull) vs supply ~1B | queima ≥ emissão | ❌ *** |
| 15 | Exploits de mint | os 2 conhecidos FECHADOS | zero rota confiando no body | ✅ |
| 16 | Durabilidade/reparo | ~620 g/dia/char ativo ≈ 14% do ganho bruto/run | 5–15% | ✅ |

\* boss validado nas 4; a rampa de run completa (sala a sala) das 3 superiores fica p/ a fase 2 (estender `pve-full-run-sim`).
\** bandas 25/40/50 exigem medir XP subindo de masmorra (o unified só roda Floresta hoje — env `DUNGEON=` preparado).
\*** contratos v2 (burn real 4%/5%) prontos, REDEPLOY pendente — retestar após deploy.

---

## Números-chave do simulador unificado (30 dias, Floresta)

| Chars | Faucet/dia | → venda | Sink/dia | NET/dia | Set +15 (main) |
|-------|-----------|---------|----------|---------|----------------|
| 1 | 9,2k | 58% | 2,3k | **+7,0k** | >30d |
| 3 | 18,9k | 59% | 4,4k | **+14,5k** | 28d |
| 5 | 28,2k | 60% | 6,7k | **+21,5k** | 21d |
| 10 | 52,1k | 61% | 13,5k | **+38,6k** | 15d |

Sensibilidade (poções realistas, POTS_RUN=10 — o PvE mede ~600 HP perdido/run):
1 char NET +4,6k · 5 chars NET +14,2k. **A sobra p/ claim on-chain é 1,5–13× o
`goldPerDauDay` de 3k assumido no token-economy-sim** — re-rodar o token sim com
estes valores após os ajustes do teste 8.

Composição do faucet (5 chars): chão 15% · abate 25% · **venda 60%** · pvp 1%.
Composição do sink (5 chars): poções 64% · reparo 27% · expansão 5% · refino 3%.

---

## Achados e alavancas (por prioridade)

### 🔴 P0 — Venda de consumível dropado é a impressora de gold (teste 8)
O drop de consumível (pConsumable 0,18–0,45×mult) somado ao `sellPrice = 60%`
flat vira 22k gold/dia numa conta de 10 chars — **maior que todo o gold de
masmorra, e passa POR FORA do cap diário de 20k** (o cap só cobre o crédito
de masmorra em `creditCappedGoldTx`).
**Alavancas** (combinar 1–2): (a) `sellPrice` de CONSUMABLE dropado → 20–25%
(em `dungeonRunServer.addDropToInventoryTx`, hoje 0.6 uniforme); (b) reduzir
`pConsumable` do chão e/ou dropar só poções COMUNS fora do boss;
(c) incluir gold de VENDA no teto diário.

### 🔴 P0 — TET/PEN inalcançáveis vs escada de gear-alvo (teste 5)
A escada de design (Floresta PRI → Caverna DUO → Pântano TRI → Ruínas TET) exige
TET = ~3.330 concentradas ≈ **~2 anos** no drop atual (pStone 3★+ ≈ 4–5 conc/dia).
PEN (108k conc) é escadaria de década.
**Alavancas**: subir chance base de TET/PEN (0,02/0,003 → ~0,05/0,01), ou drop
de concentrada no boss 3★+ (garantida como a básica no da Floresta), ou aceitar
TET como "chase de longo prazo" e **recalibrar o gear-alvo das Ruínas p/ TRI**
(mexe no dungeon-difficulty-sim → hpMult).

### 🟠 P1 — Coleta rende 11% da masmorra por stamina (teste 6)
2,5 vs 23 gold/stamina. O valor real da coleta está nos estilhaços/sementes
(motor de refino), mas em gold ela é atividade morta — ninguém racional coleta.
**Alavancas**: goldValue dos materiais de coleta ×2–3 (hoje 6–24g), ou tique de
2 stamina (−33% custo), ou +1 drop/tique base. Meta: 30–60% do gold/stamina da masmorra.

### 🟠 P1 — PvP é esmola e não custa stamina (testes 9 e 12)
~170 g/dia/conta (base 15g). E a auditoria confirmou: **nenhuma rota cobra
stamina persistente por partida PvP** (as tabelas STAMINA_COSTS de 200–300 são
legado morto; a stamina em luta é recurso de sessão). PvP hoje: sem gate e sem prêmio.
**Alavancas**: goldBase 15 → 40–60 + custo de stamina real por partida (ex.: 15–25
via rota de matchmaking), mantendo o teto pela 1ª-vitória/streak. Decisão de design:
PvP deve pagar ≈ masmorra por tempo investido, com gate equivalente.

### 🟡 P2 — Pedras tipadas: oferta 50/50, demanda 1:5 (achado novo)
O boss dropa Pedra (Arma)/(Armadura) 50/50, mas o set usa 1 arma : 5 armaduras.
Pedra de arma sobra ~3×; a de armadura é o gargalo real. O farm-progression-sim
junta tudo num pool (otimista) — o unified respeita o tipo e mostra main +15 em
15–21d (vs 4–7d do farm sim).
**Alavancas**: ponderar o drop do boss (30/70 arma/armadura), ou receita de
conversão na forja (2 arma → 1 armadura), ou aceitar e vender a sobra (vira faucet).

### 🟡 P2 — Cap diário de 20k vira o limitador real de contas grandes (teste 13)
10 chars dedicados batem o cap 96% dos dias — o cap está fazendo o trabalho de
balance que os faucets deviam fazer, e cria incentivo a mover ganho pra venda
(fora do cap). Com o P0 da venda resolvido, reavaliar: cap por conta é a defesa
anti-multi-char correta? (design: farm rotativo é INTENCIONAL — memória 2026-07-02.)
**Alavanca**: manter 20k mas incluir venda; ou cap único "gold ganho" de ~15k.

### 🟡 P2 — 1 personagem: 32d até +15 (teste 4)
Meta era 21–28d. Com as pedras tipadas do unified fica pior. Se o P2 das pedras
ponderar 30/70, o 1-char cai p/ dentro da meta sem tocar em mais nada.

### 🔵 P3 — Token: burn ≪ emissão (teste 14)
Mesmo no bull, burn acumulado em 10 anos = 14% do supply. A deflação prometida
depende do redeploy v2 (taxas com burn real) + claim/consumo on-chain. Retestar
com o NET medido aqui (7–39k/dia/conta vs 3k assumido) após fechar o P0 —
mais NET = mais pressão de claim = mais burn de taxa.

---

## Decisões documentadas (teste 12 — stamina)
- **Fonte da verdade**: `Character.maxStamina` (default 100, Prisma) + regen
  +2/15min (`staminaSystem.computeStaminaRegen`) + `STEP_COST` por nó (4/8/6)
  + coleta 3/tique + fazenda 2/ação.
- `STAMINA_COSTS`/`baseStamina 200–300` em `staminaSystem.ts` e
  `server/staminaSystem.js`: **legado** — usados só p/ ações não-ataque na luta
  (recurso de sessão, não persiste). Candidatos a limpeza.
- PvP não consome stamina persistente (ver P1 acima).

## Auditoria dos sims (Etapa 0 — aplicada)
- `farm-progression-sim`: defaults KILL_SHARD 0,4/0,6 e boss 1–3 sincronizados ✅
- `pvp-race-class-sim`/`pvp-balance-sim`: banner de HISTÓRICO (ruleset antigo) ✅
- `pvp-lever-sim`: confirmado EM SINCRONIA com transformationSpecials/socket-server ✅
- Sims de PvE: importam `server/combatModel` (vivos por construção) ✅

## Próxima fase (aplicação — nada disto foi mexido ainda)
Ordem sugerida: P0 venda → P0 TET → P1 coleta → P1 PvP → P2s → re-rodar
`npm run sim:economy` + `token-economy-sim` e conferir que:
venda ≤30% do faucet · NET/dia/char ≈ 2–4k · TET ≤ 90d · coleta ≥30% da masmorra.
