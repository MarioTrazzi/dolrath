# 🏃 Sistema de Esquiva Diferenciado - Dolrath RPG

## 🎯 Implementação Completa

### ⚔️ Ataques Físicos (light_attack, heavy_attack)
- **Dado Base**: d6
- **Bônus de Agilidade**: +1 dado d6 extra a cada 10 pontos de AGI
- **Cálculo**: d6_base + soma_de_dados_extras
- **Exemplo**: AGI 25 = d6 + 2d6 extras
- **Display**: `[Base: 4 + 2 dados extras: 3+5] = 12 total`

### ✨ Ataques Mágicos (special_attack)
- **Dado Base**: d20 (mais difícil de esquivar)
- **Bônus de Agilidade**: +1 ponto direto a cada 10 pontos de AGI
- **Cálculo**: d20 + bônus_direto
- **Exemplo**: AGI 25 = d20 + 2 pontos
- **Display**: `[d20: 15 + 2 AGI = 17]`

## 🧮 Exemplos Práticos

### Personagem com 30 AGI vs Ataque Físico:
- Dado base: d6 (1-6)
- Dados extras: 3 (30÷10 = 3)
- Esquiva: d6 + 3d6 = total entre 4-24
- Display: `🌪️ João esquivou ataque físico! (18 vs 15) [Base: 6 + 3 dados extras: 4+5+3]`

### Personagem com 30 AGI vs Ataque Mágico:
- Dado base: d20 (1-20)  
- Bônus direto: +3 (30÷10 = 3)
- Esquiva: d20 + 3 = total entre 4-23
- Display: `🌪️ João esquivou ataque mágico! (18 vs 15) [d20: 15 + 3 AGI = 18]`

## ⚖️ Balanceamento

### Por que essa diferença?
1. **Ataques Físicos**: Mais previsíveis, podem ser esquivados com agilidade pura
2. **Ataques Mágicos**: Menos previsíveis, mais difíceis de evitar, mas AGI ainda ajuda

### Vantagens do Sistema:
- **Agilidade sempre importa** (em ambos os tipos)
- **Ataques mágicos mais perigosos** (d20 vs múltiplos d6)
- **Build de AGI viável** para ambos cenários
- **Display claro** mostra exatamente o que aconteceu

## 🔧 Código Implementado

```javascript
function calculateDodgeRoll(defender, attackType = 'physical') {
  const isPhysical = attackType !== 'special_attack'
  const diceSize = isPhysical ? 6 : 20
  
  const baseRoll = Math.floor(Math.random() * diceSize) + 1
  const agilityBonus = Math.floor(defender.agility / 10)
  
  let totalRoll = baseRoll
  let extraRolls = []
  
  if (isPhysical) {
    // Múltiplos d6 para ataques físicos
    for (let i = 0; i < agilityBonus; i++) {
      const extraRoll = Math.floor(Math.random() * 6) + 1
      extraRolls.push(extraRoll)
      totalRoll += extraRoll
    }
  } else {
    // Bônus direto para ataques mágicos
    totalRoll += agilityBonus
  }
  
  return { baseRoll, extraRolls, totalRoll, agilityBonus, diceType, attackType }
}
```

---

✅ **Sistema implementado e pronto para teste!**
