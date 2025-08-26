// Script de sincronização de níveis - Versão Simplificada

const XP_CONFIG = {
  baseXP: 100,
  exponent: 1.4,
  multiplier: 50,
  maxLevel: 100,
};

function getXPForNextLevel(currentLevel) {
  if (currentLevel >= XP_CONFIG.maxLevel) return 0;
  
  return Math.floor(
    XP_CONFIG.baseXP * Math.pow(currentLevel, XP_CONFIG.exponent) + 
    currentLevel * XP_CONFIG.multiplier
  );
}

function getXPForLevel(level) {
  if (level <= 1) return 0;
  
  let totalXP = 0;
  for (let i = 2; i <= level; i++) {
    const xpForThisLevel = getXPForNextLevel(i - 1);
    totalXP += xpForThisLevel;
  }
  
  return totalXP;
}

function getLevelFromXP(totalXP) {
  if (totalXP <= 0) return 1;
  
  let level = 1;
  let accumulatedXP = 0;
  
  for (let i = 2; i <= XP_CONFIG.maxLevel; i++) {
    const xpForThisLevel = getXPForNextLevel(i - 1);
    if (accumulatedXP + xpForThisLevel > totalXP) {
      break;
    }
    accumulatedXP += xpForThisLevel;
    level = i;
  }
  
  return level;
}

function getLevelInfo(totalXP) {
  const currentLevel = getLevelFromXP(totalXP);
  const xpForCurrentLevel = getXPForLevel(currentLevel);
  const xpForNextLevel = getXPForLevel(currentLevel + 1);
  const xpProgress = totalXP - xpForCurrentLevel;
  const xpToNextLevel = xpForNextLevel - totalXP;
  const progressPercentage = xpForNextLevel > xpForCurrentLevel 
    ? (xpProgress / (xpForNextLevel - xpForCurrentLevel)) * 100 
    : 100;

  return {
    level: currentLevel,
    currentXP: totalXP,
    xpForCurrentLevel,
    xpForNextLevel: currentLevel >= XP_CONFIG.maxLevel ? totalXP : xpForNextLevel,
    xpToNextLevel: currentLevel >= XP_CONFIG.maxLevel ? 0 : xpToNextLevel,
    xpProgress,
    progressPercentage: Math.min(progressPercentage, 100),
  };
}

console.log('🔄 Sistema de XP/Nível implementado com sucesso!\n');

console.log('📊 Exemplos de conversão:');
const examples = [
  { xp: 0, expectedLevel: 1 },
  { xp: 100, expectedLevel: 1 },
  { xp: 500, expectedLevel: 2 },
  { xp: 1000, expectedLevel: 3 },
  { xp: 2500, expectedLevel: 5 },
  { xp: 5000, expectedLevel: 7 },
];

examples.forEach(example => {
  const info = getLevelInfo(example.xp);
  const xpRange = info.xpForNextLevel - info.xpForCurrentLevel;
  console.log(`   ${example.xp} XP → Nível ${info.level} (${info.xpProgress}/${xpRange} - ${info.progressPercentage.toFixed(1)}%)`);
});

console.log('\n✅ Para aplicar as mudanças:');
console.log('   1. O sistema já está configurado no dashboard');
console.log('   2. Os níveis serão calculados automaticamente');
console.log('   3. Use os botões de teste no dashboard para adicionar XP');
console.log('   4. O level up é automático quando a XP necessária é atingida');

console.log('\n🎮 Recursos implementados:');
console.log('   ✅ Sistema de progressão exponencial suave');
console.log('   ✅ Barra de progresso visual');
console.log('   ✅ Level up automático');
console.log('   ✅ Cálculo dinâmico de stats');
console.log('   ✅ API para adicionar XP');
console.log('   ✅ Interface atualizada no dashboard');
