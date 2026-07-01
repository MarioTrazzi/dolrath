# 13 — Guilds

> **Status: EM BREVE** — sem código hoje. Desenho aprovado para a fase social do roadmap.

## Visão

Guildas são o motor social e o segundo maior sink de GOLD do jogo maduro: criar e evoluir uma guilda custa caro, e os benefícios são coletivos.

## Desenho resumido

- **Fundação:** custo alto em GOLD (sink) + nome/emblema únicos.
- **Níveis de guilda:** hall evolui com contribuições em GOLD e materiais; cada nível libera vantagens (slot de banco compartilhado, buff de stamina, desconto no ferreiro da guilda).
- **Banco de guilda:** cofre compartilhado com permissões por cargo; auditável por todos os membros.
- **Conteúdo exclusivo:** raids exigem grupo de guilda (ver [Raids](../15-raids/README.md)); guerra de guildas por território conecta com [Lands](../14-lands/README.md).
- **Temporadas de guilda:** ranking por pontos de raid/PvP; topo ganha DOL do bucket de conquistas + cosméticos de emblema.

## Economia (princípios)

1. Toda vantagem de guilda é comprada com GOLD/materiais — guilda é sink, não faucet.
2. Recompensas de ranking pagam em DOL (escasso, mérito) e cosméticos — nunca em GOLD direto (evita loop guilda-farm).
3. Taxa de manutenção semanal do hall (sink recorrente) proporcional ao nível.

## Dependências técnicas

Model `Guild`/`GuildMember` no Prisma, permissões por cargo, e o banco de guilda reutiliza o padrão do banco pessoal (`/api/bank/*`).
