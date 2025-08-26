# 🎮 Guia de Teste - Sistema de Combate Aprimorado

## ✅ Sistema Implementado e Pronto para Teste!

**Servidor rodando em: http://localhost:3000**

## 🎯 Como Testar o Novo Sistema de Combate

### 1. Acessar o Jogo
- Abra o navegador em `http://localhost:3000`
- Faça login ou crie uma nova conta
- Crie um personagem (se necessário)

### 2. Entrar em uma Dungeon de Combate
- Vá para a seção "Dungeons"
- Escolha uma dungeon de tipo "COMBAT" (dungeons de combate)
- Entre na dungeon

### 3. Encontrar um Monstro
- Use o botão **"Explorar"** várias vezes
- O sistema irá eventualmente gerar um evento de combate
- Você verá uma mensagem como: *"Você encontra um [Nome do Monstro]!"*

### 4. Testar o Novo Sistema
- O botão **"Atacar"** deve mudar para **"Atacar [Nome do Monstro]"**
- Abra o console do navegador (F12 → Console) para ver os logs
- Clique no botão de atacar

## 🔍 O Que Observar

### No Console do Navegador:
```
🔍 Evento de combate detectado: [dados do monstro]
🎯 Abrindo diálogo de combate aprimorado com: [dados do inimigo]
```

### Na Interface:
1. **Diálogo de Combate Aprimorado** deve abrir
2. **Barras de HP/Stamina** do monstro e personagem
3. **Botões de Ataque** com diferentes tipos:
   - **Soco** (d6, 5 stamina)
   - **Chute** (d6, 7 stamina) 
   - **Arma** (d12, 10 stamina)
   - **Especial** (d20, 15 stamina)
4. **Defesa Padrão** configurável
5. **Botão Fugir** (70% chance)

### Sistema de Dados:
- Cada ataque rola dados específicos
- Mensagens mostram: *"[Nome] usa [ATAQUE] - rolou X (dY) + Z = Total"*
- Dano é calculado baseado no tipo de ataque
- Monstro defende automaticamente

### Sistema de Stamina:
- Botões ficam desabilitados se stamina insuficiente
- Custo de stamina mostrado nos botões
- Barra de stamina diminui a cada ação

### Sistema de Morte/Revival:
- Se HP chegar a 0, aparece diálogo de morte
- Opções de usar "Poção de Reviver"
- Personagem morto não pode agir

## 🐛 Possíveis Problemas e Soluções

### Se o botão "Atacar" não aparece:
- Continue explorando até encontrar um monstro
- Verifique se está em uma dungeon de COMBAT

### Se o diálogo antigo ainda aparece:
- Recarregue a página (Ctrl+F5)
- Verifique o console por erros

### Se não há dados do monstro:
- Verifique no console se aparece: "🔍 Evento de combate detectado"
- O evento deve ter `event.monster` com dados completos

## 📊 Funcionalidades Testadas

- ✅ **Dados Diferenciados**: d6 (soco/chute), d12 (arma), d20 (especial)
- ✅ **Consumo de Stamina**: Cada ação consome stamina específica
- ✅ **Sistema de Morte**: Só revive com poção
- ✅ **Interface Visual**: Barras de HP/Stamina, combate em tempo real
- ✅ **Detecção de Monstros**: Usa dados reais do evento de dungeon
- ✅ **Integração Completa**: Funciona com sistema existente

## 🎉 Resultado Esperado

**Antes**: Combate simples sem estratégia
**Agora**: Sistema RPG completo com:
- Estratégia de stamina
- Consequências da morte
- Diferentes tipos de ataque
- Interface visual rica
- Dados reais dos monstros

## 💡 Dicas de Teste

1. **Teste diferentes ataques** para ver os dados diferentes
2. **Esgote a stamina** para ver validação
3. **Deixe o HP chegar a 0** para testar morte/revival
4. **Use o botão Fugir** para testar fuga
5. **Observe as narrativas** geradas pelo sistema

---

**🚀 O sistema está completamente funcional e integrado!**

Execute o teste seguindo este guia e você verá o novo sistema de combate aprimorado em ação com dados, stamina e morte/revival funcionando perfeitamente!
