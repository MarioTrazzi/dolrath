# 12 — DAO

> **Status: EM BREVE** — governança é fase pós-launch do token (ver roadmap abaixo). Este documento registra o desenho aprovado.

## Princípio

A DAO de Dolrath governa a **economia**, não o game design. Balanceamento de combate, conteúdo e arte continuam com o estúdio; parâmetros econômicos migram gradualmente para votação.

## O que a DAO governará (escopo alvo)

| Parâmetro | Exemplo |
|---|---|
| Teto diário de emissão de GOLD | `DUNGEON_DAILY_GOLD_CAP` |
| Taxas de marketplace e split burn/treasury | 4% itens, 5% personagens |
| Uso do treasury | grants, eventos, buyback-and-burn |
| Calendário de emissão de recompensas em DOL | epochs de temporada |
| Listagem de novos sinks/serviços premium | — |

## Mecânica proposta

- **Voto por DOL em staking** (não por saldo livre — quem vota tem pele em jogo e lock).
- **veDOL simplificado:** peso do voto = quantidade × duração do lock (3–24 meses).
- **Processo:** fórum → proposta on-chain (Snapshot no início, execução multisig) → timelock de 48h.
- **Progressividade:** Fase A conselho multisig do estúdio com veto comunitário; Fase B propostas comunitárias com quórum; Fase C execução on-chain automática dos parâmetros econômicos.

## Roadmap

1. **T+0 (launch do DOL):** treasury multisig 3/5 público, relatórios mensais.
2. **T+6 meses:** Snapshot voting com veDOL, Fase A.
3. **T+12 meses:** Fase B; DAO controla split de taxas e calendário de eventos.
4. **T+24 meses:** Fase C; parâmetros econômicos on-chain governados por timelock.
