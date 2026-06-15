import { prisma } from '@/lib/prisma';
import { getLevelInfo } from '@/lib/experienceSystem';
import { computeDerivedStats } from '@/lib/combatFormulas';

/**
 * Adiciona experiência a um personagem e faz level up automático se necessário
 */
export async function addExperienceToCharacter(characterId: string, xpToAdd: number) {
  try {
    // Buscar o personagem atual
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      throw new Error('Character not found');
    }

    // Calcular nova experiência total
    const newTotalXP = character.experience + xpToAdd;
    
    // Calcular informações do novo nível
    const newLevelInfo = getLevelInfo(newTotalXP);
    const oldLevelInfo = getLevelInfo(character.experience);

    // Verificar se houve level up
    const leveledUp = newLevelInfo.level > oldLevelInfo.level;

    // Se houve level up, recalcular stats
    let updateData: any = {
      experience: newTotalXP,
      level: newLevelInfo.level,
    };

    if (leveledUp) {
      // Calcular quantos pontos de atributo dar (1 por nível)
      const pointsToGive = newLevelInfo.level - oldLevelInfo.level;

      // 🎯 FÓRMULA UNIFICADA: recalcular derivados com os atributos ATUAIS do
      // personagem + novo nível (mesma fórmula do distribute-points — antes
      // eram duas fórmulas conflitantes e quem rodasse por último vencia)
      const bs = ((character.baseStats && typeof character.baseStats === 'object') ? character.baseStats : {}) as any;
      const derived = computeDerivedStats({
        str: Number(bs.str) || 10,
        agi: Number(bs.agi) || 10,
        int: Number(bs.int) || 10,
        def: Number(bs.def) || 10,
        level: newLevelInfo.level,
      });

      // Atualizar stats no banco quando há level up
      updateData = {
        ...updateData,
        hp: derived.maxHp,
        maxHp: derived.maxHp,
        mp: derived.maxMp,
        maxMp: derived.maxMp,
        stamina: derived.maxStamina,
        maxStamina: derived.maxStamina,
        availablePoints: (character.availablePoints || 0) + pointsToGive,
        // Atualizar também o baseStats para referência
        baseStats: {
          ...bs,
          res: derived.res,
          hp: derived.maxHp,
          maxHp: derived.maxHp,
          mp: derived.maxMp,
          maxMp: derived.maxMp,
          stamina: derived.maxStamina,
          maxStamina: derived.maxStamina,
        }
      };
    }

    // Atualizar o personagem no banco
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: updateData,
    });

    return {
      character: updatedCharacter,
      leveledUp,
      levelsGained: newLevelInfo.level - oldLevelInfo.level,
      xpAdded: xpToAdd,
      newLevelInfo,
    };
  } catch (error) {
    console.error('Error adding experience to character:', error);
    throw error;
  }
}

/**
 * Level up manual (para casos especiais ou admin)
 */
export async function levelUpCharacter(characterId: string, levelsToAdd: number = 1) {
  try {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      throw new Error('Character not found');
    }

    const currentLevelInfo = getLevelInfo(character.experience);
    const targetLevel = currentLevelInfo.level + levelsToAdd;
    
    // Calcular XP necessária para atingir o nível alvo
    let xpNeeded = 0;
    for (let level = currentLevelInfo.level + 1; level <= targetLevel; level++) {
      const levelInfo = getLevelInfo(character.experience + xpNeeded);
      xpNeeded += levelInfo.xpToNextLevel;
    }

    // Usar a função de adicionar experiência
    return await addExperienceToCharacter(characterId, xpNeeded);
  } catch (error) {
    console.error('Error leveling up character:', error);
    throw error;
  }
}

/**
 * Função para sincronizar todos os personagens (útil para migração)
 */
export async function syncAllCharacterLevels() {
  try {
    const characters = await prisma.character.findMany();
    
    const results = [];
    
    for (const character of characters) {
      const levelInfo = getLevelInfo(character.experience);
      
      if (levelInfo.level !== character.level) {
        const updated = await prisma.character.update({
          where: { id: character.id },
          data: { level: levelInfo.level },
        });
        
        results.push({
          id: character.id,
          name: character.name,
          oldLevel: character.level,
          newLevel: levelInfo.level,
          experience: character.experience,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error syncing character levels:', error);
    throw error;
  }
}
