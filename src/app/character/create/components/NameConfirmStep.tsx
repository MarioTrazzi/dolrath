'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, RefreshCw } from 'lucide-react';
import { CharacterSummary } from './CharacterSummary';
import { createCharacter } from '@/lib/api';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function NameConfirmStep() {
  const router = useRouter();
  const { selectedRace, selectedClass, distributedPoints, selectedImage, characterName, setCharacterName, markStepComplete, resetCreation } = useCharacterCreationStore();
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState('');
  
  useEffect(() => {
    // Mark step complete if name is valid and all previous steps are complete (implicitly handled by navigation)
    const isValid = !validateName(characterName) && characterName.length > 0;
    markStepComplete('name-confirm', isValid);
  }, [characterName, markStepComplete]);

  const validateName = (name: string) => {
    if (name.length < 2) return 'Nome deve ter pelo menos 2 caracteres';
    if (name.length > 20) return 'Nome deve ter no máximo 20 caracteres';
    if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(name)) return 'Nome deve conter apenas letras';
    return '';
  };
  
  const handleNameChange = (value: string) => {
    setCharacterName(value);
    setNameError(validateName(value));
  };
  
  const handleCreateCharacter = async () => {
    const error = validateName(characterName);
    if (error) {
      setNameError(error);
      return;
    }
    if (!selectedRace || !selectedClass || !selectedImage) {
      // This should ideally not happen if previous steps are enforced
      console.error('Missing character data for creation.');
      return;
    }
    
    setIsCreating(true);
    try {
      if (!selectedRace?.id) {
        throw new Error('Raça não selecionada');
      }
      if (!selectedClass?.id) {
        throw new Error('Classe não selecionada');
      }

      // Convert BaseStats to Record<string, number>
      const statsRecord = distributedPoints 
        ? Object.entries(distributedPoints).reduce((acc, [key, value]) => {
            if (typeof value === 'number') {
              acc[key] = value;
            }
            return acc;
          }, {} as Record<string, number>)
        : {};

      const characterData = {
        name: characterName.trim(),
        race: selectedRace.id,
        characterClass: selectedClass.id,
        distributedPoints: statsRecord,
        avatar: selectedImage
      };
      
      const character = await createCharacter(characterData);
      
      if (character?.id) {
        // Reset the creation state before navigating
        resetCreation();
        router.push(`/character/${character.id}`);
      } else {
        throw new Error('Falha ao criar personagem: resposta inválida do servidor');
      }
    } catch (error) {
      console.error('Erro ao criar personagem:', error);
      setNameError(error instanceof Error ? error.message : 'Erro desconhecido ao criar personagem');
    } finally {
      setIsCreating(false);
    }
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Name Input */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Nome do Personagem
          </h2>
          <p className="text-text-secondary">
            Escolha um nome épico para seu guerreiro
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="characterName" className="block text-sm font-medium text-text-primary mb-2">
              Nome do Personagem
            </label>
            <input
              type="text"
              id="characterName"
              value={characterName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Digite o nome do seu personagem"
              className={cn(
                "w-full h-12 px-4 bg-background border rounded-lg text-text-primary placeholder:text-text-secondary transition-all",
                nameError 
                  ? "border-error focus:ring-error/50" 
                  : "border-white/20 focus:border-primary focus:ring-primary/50"
              )}
              maxLength={20}
            />
            
            {nameError && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-error mt-2"
              >
                {nameError}
              </motion.p>
            )}
          </div>

          <button
            onClick={handleCreateCharacter}
            disabled={isCreating || !!nameError || !characterName || !selectedRace || !distributedPoints || !selectedImage}
            className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Criando Personagem...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Criar Personagem
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Character Summary */}
      <div className="lg:sticky lg:top-8">
        <CharacterSummary
          race={selectedRace}
          distributedPoints={distributedPoints}
          characterName={characterName}
          imageUrl={selectedImage}
        />
      </div>
    </div>
  );
}
