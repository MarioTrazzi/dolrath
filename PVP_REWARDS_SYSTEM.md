# 🏆 Sistema de Recompensas PvP - Dolrath RPG

## 🎯 Visão Geral

Sistema de recompensas motivante que garante progressão diária e recompensa tanto a vitória quanto a participação, mantendo o jogo equilibrado e divertido para jogadores de todos os níveis.

## 📊 Recompensas Base

### 🏆 Vitória
- **XP Base**: 50 XP
- **Gold Base**: 15 gold
- **Bônus**: +50% de multiplicador nas recompensas

### 😔 Derrota
- **XP Base**: 25 XP (50% da vitória)
- **Gold Base**: 8 gold
- **Propósito**: Garantir que todos recebam algo por participar

### 💎 Participação Mínima
- **XP Base**: 15 XP (para desconexões/fugas)
- **Gold Base**: 5 gold
- **Garantia**: Ninguém sai de mãos vazias

## 📈 Sistema de Escalonamento

### 🔢 Multiplicador por Nível
- **XP**: +10% por nível (máximo 5x)
- **Gold**: +8% por nível
- **Propósito**: Manter as recompensas relevantes conforme evolui

### ⚖️ Balanceamento por Diferença de Nível

#### Vitória vs Oponente Superior
- **±15% por nível de diferença**
- **Underdog Bonus**: +50% se vencer alguém 5+ níveis acima
- **Exemplo**: Level 10 vs Level 15 = +75% XP e gold

#### Vitória vs Oponente Inferior  
- **Penalidade**: -30% se vencer alguém 5+ níveis abaixo
- **Propósito**: Evitar farming de novatos

## 🎖️ Bônus Especiais

### 💯 Vitória Perfeita
- **Condição**: Vencer sem perder HP
- **Bônus**: +30% XP, +50% gold
- **Detecção**: Automática via tracking de HP inicial

### 🐉 Transformation Kill
- **Condição**: Derrotar oponente transformado
- **Bônus**: +20% XP e gold
- **Propósito**: Recompensar vitórias mais difíceis

### 🔥 Combo de Vitórias
- **Bônus**: +10% por vitória consecutiva
- **Máximo**: +100% (10 vitórias seguidas)
- **Status**: TODO - implementar tracking

### 🌅 Primeira Vitória do Dia
- **Bônus**: +100% XP, +50% gold
- **Status**: TODO - implementar tracking diário

## 🎮 Progressão Garantida

### 📊 Metas Diárias por Tier

#### 🌱 Novatos (Level 1-5)
- **Batalhas/dia**: 10 (200 stamina ÷ 20)
- **XP médio/batalha**: 45 XP (50% win rate)
- **XP total/dia**: 450 XP
- **Resultado**: ✅ Sobe pelo menos 1 nível

#### ⚔️ Intermediários (Level 6-15)
- **Batalhas/dia**: 12 (250 stamina ÷ ~20)
- **XP médio/batalha**: 72.5 XP
- **XP total/dia**: 870 XP
- **Resultado**: ✅ Progressão contínua

#### 🏆 Veteranos (Level 16+)
- **Batalhas/dia**: 15 (300 stamina ÷ 20)
- **XP médio/batalha**: 141.5 XP
- **XP total/dia**: 2,123 XP
- **Resultado**: ✅ Progresso até high level

## 🔧 Implementação Técnica

### 📁 Arquivos Criados
- `src/app/api/battle/rewards/route.ts` - API para processar recompensas
- `server/socket-server.js` - Integração no sistema de combate
- `PVP_REWARDS_BALANCING.js` - Script de análise de balanceamento

### 🎯 Detecção Automática de Bônus
```javascript
// Vitória perfeita
const isFlawlessVictory = winner.hp === winner.initialHp

// Kill de transformado
const killTransformed = loser.transformationType !== 'none'

// Tracking de HP inicial no início do combate
room.player1.initialHp = room.player1.hp
room.player2.initialHp = room.player2.hp
```

### 📤 Notificação aos Clientes
```javascript
io.to(roomId).emit('battle_rewards', {
  winner: { id, xpGained, goldGained, leveledUp, newLevel },
  loser: { id, xpGained, goldGained, leveledUp, newLevel },
  battleDetails: { isFlawless, transformationKill, underdogVictory }
})
```

## 🧮 Exemplos de Recompensas

### Level 1 (Novice)
- **Vitória**: 50 XP, 16 gold
- **Derrota**: 25 XP, 8 gold

### Level 10 (Intermediate)
- **Vitória**: 117 XP, 38 gold
- **Derrota**: 58 XP, 20 gold

### Level 20 (Veteran)
- **Vitória**: 250 XP, 81 gold
- **Derrota**: 125 XP, 43 gold

### Cenários Especiais
- **Vitória Perfeita L10**: 152 XP (+30%), 57 gold (+50%)
- **Underdog Victory**: L5 vs L10 = 110 XP (+50%)
- **Primeira Vitória**: 234 XP (dobro), 57 gold (+50%)

## 📝 Próximos Passos

### ✅ Implementado
- [x] Sistema base de recompensas
- [x] Escalonamento por nível
- [x] Balanceamento por diferença de nível
- [x] Bônus de vitória perfeita
- [x] Bônus de transformation kill
- [x] Integração no socket-server
- [x] API de recompensas

### 🔄 TODO
- [ ] Tracking de win streak
- [ ] Primeira vitória do dia
- [ ] Persistência no banco de dados
- [ ] Interface visual para recompensas
- [ ] Estatísticas de batalha
- [ ] Achievements/conquistas

## 🎉 Resultados Esperados

1. **Engajamento**: Jogadores sempre ganham algo
2. **Progressão**: Pelo menos 1 level/dia é garantido
3. **Competitividade**: Bônus recompensam skill e estratégia
4. **Equilíbrio**: Sistema evita griefing e farming abusivo
5. **Motivação**: Chegada ao level 5 em poucos dias permite compra de equipamentos

---

*Sistema implementado para garantir progressão motivante e retenção de jogadores* 🚀
