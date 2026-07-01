# 28 — Sound

> **Status: EM BREVE** — o jogo hoje não tem áudio. Registro do desenho alvo.

## Visão

Áudio funcional primeiro: o combate por turnos com dados pede feedback sonoro de rolagem, impacto, crítico e level-up antes de qualquer trilha.

## Roadmap de áudio

1. **SFX de combate** (prioridade): rolagem de dado, impacto físico/arcano, crítico, esquiva, transformação, veneno/stun/sangramento — casando 1:1 com os eventos já emitidos para `AbilityFX.tsx` (o mapeamento de FX visual serve de contrato para o sonoro).
2. **SFX de economia:** moedas (loot, compra), forja (martelo), alquimia (borbulha), claim on-chain (selo).
3. **Ambiências por masmorra:** floresta, caverna, pântano, ruínas — loops curtos.
4. **Trilha:** tema da cidade + tema de boss; música dinâmica por fase de combate fica para depois.
5. **Controles:** volume master/SFX/música, mute por padrão em mobile.

## Produção

Mesma filosofia do pipeline de arte: bibliotecas licenciadas + geração por IA onde a qualidade permitir, com curadoria humana; assets versionados no repositório/Cloudinary.
