# 🎮 Sistema de Combate Aprimorado - Dolrath RPG

## 📋 Resumo das Melhorias Implementadas

O sistema de combate foi completamente aprimorado com as seguintes funcionalidades:

### ⚔️ Sistema de Dados Aprimorado
- **Soco/Chute**: d6 (dano base 1-2, stamina 5-7)
- **Arma Equipada**: d12 (dano base 3, stamina 10)
- **Ataque Especial**: d20 (dano base 5, stamina 15)

### 🛡️ Sistema de Defesa
- **Esquivar**: d12 (stamina 3)
- **Bloquear**: d10 (stamina 5)
- **Aparar**: d8 (stamina 8)

### ⚡ Sistema de Stamina
- Cada ação consome stamina específica
- Validação antes de executar ações
- Impossível atacar sem stamina suficiente

### 💀 Sistema de Morte e Reviver
- Personagem morre quando HP chega a 0
- Só pode ser revivido com "Poção de Reviver"
- Interface visual para morte e revival

### 🧪 Sistema de Poções
- **Poção de Vida**: +30 HP
- **Poção de Energia**: +25 Stamina  
- **Poção de Reviver**: Revive com 50 HP

## 🗂️ Arquivos Modificados/Criados

### Core System Files
- `src/types/dice.ts` - Sistema completo de dados e stamina
- `src/types/item.ts` - Sistema de poções e status do personagem

### Components
- `src/components/CharacterStatusManager.tsx` - Gerenciamento de HP/Stamina/Morte
- `src/components/EnhancedCombatDialog.tsx` - Diálogo de combate aprimorado
- `src/components/DungeonChat.tsx` - Integração com novos sistemas

### Testing
- `test-enhanced-combat.js` - Testes completos do sistema

## 🎯 Funcionalidades Implementadas

### ✅ Dados por Ação
```typescript
// Exemplo de configuração dos dados
const ACTION_DICE_CONFIG = {
  PUNCH: { dice: 6, baseDamage: 1 },
  KICK: { dice: 6, baseDamage: 2 },
  WEAPON: { dice: 12, baseDamage: 3 },
  SPECIAL: { dice: 20, baseDamage: 5 }
}
```

### ✅ Consumo de Stamina
```typescript
// Custos de stamina por ação
const STAMINA_COSTS = {
  PUNCH: 5,
  KICK: 7,
  WEAPON: 10,
  SPECIAL: 15
}
```

### ✅ Sistema de Morte/Revival
```typescript
// Status do personagem
interface CharacterStatus {
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  status: 'alive' | 'dead'
}
```

## 🔧 Como Usar

### 1. Combate Normal
1. Entre em uma dungeon
2. Encontre um inimigo
3. Clique em "Atacar [Nome do Inimigo]"
4. O novo diálogo de combate será aberto
5. Escolha tipos de ataque baseados na stamina disponível

### 2. Sistema de Stamina
- Verifique a barra de energia antes de atacar
- Ataques especiais consomem mais stamina
- Use poções de energia para recuperar stamina

### 3. Sistema de Morte/Revival
- Se HP chegar a 0, personagem morre
- Use "Poção de Reviver" para voltar à vida
- Personagem morto não pode realizar ações

## 🧪 Testes Realizados

O arquivo `test-enhanced-combat.js` valida:
- ✅ Rolagem de dados por tipo de ação
- ✅ Consumo correto de stamina
- ✅ Sistema de defesa
- ✅ Combate completo com rounds
- ✅ Sistema de poções
- ✅ Mecânicas de morte e revival

### Executar Testes
```bash
node test-enhanced-combat.js
```

## 🎮 Experiência do Jogador

### Estratégia de Combate
- **Socos/Chutes**: Baixo dano, baixa stamina (bom para conservar energia)
- **Armas**: Dano médio, stamina moderada (balanceado)
- **Especiais**: Alto dano, alta stamina (finalizadores)

### Gerenciamento de Recursos
- Monitore stamina durante combate
- Use poções estrategicamente
- Planeje ataques baseados na energia disponível

### Consequências da Morte
- Morte tem consequências reais
- Revival requer recursos (poções)
- Cria tensão e estratégia no jogo

## 🚀 Próximas Melhorias Sugeridas

1. **IA do Monstro**: Implementar estratégias de defesa inteligentes
2. **Combos**: Sequências de ataques com bônus
3. **Status Effects**: Envenenamento, paralisia, etc.
4. **Equipamentos**: Modificadores baseados em itens equipados
5. **Críticos**: Sistema de acertos críticos
6. **Elementos**: Fogo, gelo, raio com vantagens/desvantagens

## 🏆 Status da Implementação

- ✅ Sistema de dados diferenciados (d6, d12, d20)
- ✅ Consumo de stamina por ação
- ✅ Sistema de morte e revival com poções
- ✅ Interface visual aprimorada
- ✅ Validação de ações baseada em recursos
- ✅ Testes completos do sistema
- ✅ Integração com sistema existente

**Sistema completamente funcional e pronto para uso!** 🎉
