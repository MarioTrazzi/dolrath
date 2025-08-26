
'use client';
import { useState, useEffect, useRef } from 'react';

import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { LogOut, User, Shield, Sword, Heart, Zap, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import XPProgressBar from '@/components/XPProgressBar';
import CharacterStats from '@/components/CharacterStats';
// ...existing code...
import { Character } from '@/types/game';
import { getRaceById, getClassById } from '@/lib/gameData';
// ...existing code...
// ...existing code...

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterDetails, setCharacterDetails] = useState<any[]>([]);
  const [loadingCharacter, setLoadingCharacter] = useState<boolean>(true);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; character?: any; input: string }>({ open: false, character: null, input: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  // Função para adicionar XP (para teste)
  const addXPToCharacter = async (characterId: string, xpAmount: number) => {
    try {
      const response = await fetch(`/api/character/${characterId}/add-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: xpAmount }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Mostrar mensagem de sucesso
        alert(result.message);
        
        // Recarregar personagens
        await fetchCharacters();
      } else {
        alert('Erro ao adicionar XP.');
      }
    } catch (err) {
      alert('Erro ao adicionar XP.');
    }
  };

  // Função para sincronizar níveis
  const syncCharacterLevels = async () => {
    try {
      const response = await fetch('/api/character/sync-levels', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        alert(`${result.message}. ${result.updatedCount} personagens atualizados.`);
        
        // Recarregar personagens
        await fetchCharacters();
      } else {
        alert('Erro ao sincronizar níveis.');
      }
    } catch (err) {
      alert('Erro ao sincronizar níveis.');
    }
  };

  // Função para buscar personagens
  const fetchCharacters = async () => {
    try {
      const response = await fetch('/api/character/me');
      if (response.ok) {
        const charList = await response.json();
        setCharacters(charList);
        setCharacterDetails(
          charList.map((char: Character) => ({
            character: char,
            raceObj: getRaceById(typeof char.race === 'string' ? char.race : char.race.id),
            classObj: getClassById(typeof char.class === 'string' ? char.class : char.class.id)
          }))
        );
      } else {
        setCharacters([]);
        setCharacterDetails([]);
      }
    } finally {
      setLoadingCharacter(false);
    }
  };

  const openDeleteDialog = (character: any) => {
    setDeleteDialog({ open: true, character, input: '' });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, character: null, input: '' });
  };

  const handleDeleteCharacter = async () => {
    const characterId = deleteDialog.character?.id;
    if (!characterId) return;
    try {
      const response = await fetch(`/api/character/${characterId}`, { method: 'DELETE' });
      if (response.ok) {
        setCharacters((chars: Character[]) => chars.filter((c: Character) => c.id !== characterId));
        setCharacterDetails((details: any[]) => details.filter((d: any) => d.character.id !== characterId));
        closeDeleteDialog();
      } else {
        alert('Erro ao excluir personagem.');
      }
    } catch (err) {
      alert('Erro ao excluir personagem.');
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchCharacters();
    } else if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  return (
    <div>
      <main>
        {/* Botão de Sincronização (temporário para teste) */}
        <div className="mb-4 flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={syncCharacterLevels}
            className="text-xs"
          >
            🔄 Sincronizar Níveis
          </Button>
        </div>

        {characterDetails.length > 0 ? (
          <div className="grid gap-8 mb-12">
            {characterDetails.map(({ character, raceObj, classObj }: any, idx: number) => (
              <motion.div
                key={character.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * idx }}
                className="glass-card p-8 flex flex-col md:flex-row items-center md:items-start gap-8 relative"
              >
                <button
                  className="absolute top-4 right-4 text-red-500 hover:text-red-700 transition-colors"
                  title="Excluir personagem"
                  onClick={() => openDeleteDialog(character)}
                >
                  <Trash2 className="w-6 h-6" />
                </button>
                <div className="flex flex-col md:flex-row w-full gap-8">
                  {/* Character Picture */}
                  <div className="flex-shrink-0 flex justify-center md:justify-start items-center">
                    <div className="w-32 h-32 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark text-5xl text-white border-4 border-primary shadow-lg">
                      <User className="w-16 h-16" />
                    </div>
                  </div>
                  {/* Character Info */}
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-3xl font-bold text-text-primary mb-1">
                      {character.name}
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-2 items-center justify-center md:justify-start mb-2">
                      <span className="text-base font-semibold text-primary bg-surface/70 rounded px-3 py-1">
                        {raceObj?.name}
                      </span>
                      <span className="text-base font-semibold text-primary bg-surface/70 rounded px-3 py-1">
                        {classObj?.name}
                      </span>
                    </div>
                    <div className="flex flex-col md:flex-row gap-2 mb-4">
                      <Link href={`/character/${character.id}`} passHref>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </Link>
                      {/* Botões de teste para XP */}
                      <div className="flex gap-1">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => addXPToCharacter(character.id, 50)}
                          className="text-xs"
                        >
                          +50 XP
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => addXPToCharacter(character.id, 200)}
                          className="text-xs"
                        >
                          +200 XP
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => addXPToCharacter(character.id, 1000)}
                          className="text-xs"
                        >
                          +1000 XP
                        </Button>
                      </div>
                    </div>
                    
                    {/* XP Progress Bar */}
                    {character.levelInfo && (
                      <div className="mb-4">
                        <XPProgressBar levelInfo={character.levelInfo} />
                      </div>
                    )}
                    
                    {/* Available Points Alert */}
                    {character.availablePoints && character.availablePoints > 0 && (
                      <div className="mb-4 p-3 bg-gradient-to-r from-primary/20 to-primary-dark/20 border border-primary/30 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-bold text-sm">
                              📊 {character.availablePoints} pontos para distribuir
                            </span>
                          </div>
                          <Link href={`/character/${character.id}`} passHref>
                            <Button variant="primary" size="sm" className="text-xs">
                              Distribuir Pontos
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                    
                    {/* Character Stats */}
                    <div className="mb-4">
                      <CharacterStats character={character} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-8 mb-12 text-center"
          >
            <h3 className="text-2xl font-bold text-text-primary mb-4">
              Nenhum Personagem Encontrado
            </h3>
            <p className="text-text-secondary mb-6">
              Parece que você ainda não criou um personagem. Comece sua aventura agora!
            </p>
            <Link href="/character/create" passHref>
              <Button size="lg">
                <User className="w-5 h-5 mr-2" />
                Criar Novo Personagem
              </Button>
            </Link>
          </motion.div>
        )}

        {characterDetails.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
            <Link href="/combat" passHref>
              <Button size="lg" className="flex-1 sm:flex-none">
                <Sword className="w-5 h-5 mr-2" />
                Entrar em Combate
              </Button>
            </Link>
            <Link href="/dungeons" passHref>
              <Button variant="outline" size="lg" className="flex-1 sm:flex-none">
                <Shield className="w-5 h-5 mr-2" />
                Explorar Dungeon
              </Button>
            </Link>
            <Link href="/character/create" passHref>
              <Button size="lg" variant="secondary" className="flex-1 sm:flex-none">
                <User className="w-5 h-5 mr-2" />
                Criar Novo Personagem
              </Button>
            </Link>
          </div>
        )}

        {/* Delete Character Dialog */}
        {deleteDialog.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface rounded-xl shadow-2xl p-8 w-full max-w-md relative animate-fade-in">
              <button
                className="absolute top-3 right-3 text-text-secondary hover:text-text-primary"
                onClick={closeDeleteDialog}
                aria-label="Fechar"
              >
                ×
              </button>
              <h2 className="text-xl font-bold mb-4 text-text-primary">Excluir Personagem</h2>
              <p className="mb-2 text-text-secondary">
                Tem certeza que deseja excluir o personagem <span className="font-bold text-primary">{deleteDialog.character?.name}</span>?<br />
                Esta ação não pode ser desfeita.<br />
                Para confirmar, digite o nome do personagem abaixo:
              </p>
              <input
                ref={inputRef}
                className="w-full px-3 py-2 border rounded mb-4 text-text-primary bg-background outline-none focus:ring-2 focus:ring-primary"
                value={deleteDialog.input}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteDialog((d: any) => ({ ...d, input: e.target.value }))}
                placeholder="Digite o nome do personagem"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeDeleteDialog}>Cancelar</Button>
                <Button
                  variant="primary"
                  onClick={handleDeleteCharacter}
                  disabled={deleteDialog.input !== deleteDialog.character?.name}
                >
                  Excluir
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
