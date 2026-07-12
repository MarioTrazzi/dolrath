// Exemplo de uso da imagem customizada na página de masmorras
// Arquivo: src/app/dungeons/page.tsx

// 1. Criar um mapa de imagens por tipo de masmorra (OPCIONAL)
const DUNGEON_BACKGROUND_IMAGES: Record<string, string> = {
  'floresta': '/backgrounds/dungeon-forest.jpg', // Sua imagem anexada
  'caverna': '/backgrounds/crystal-cave.jpg',
  'pantano': '/backgrounds/swamp.jpg',
  'ruinas': '/backgrounds/arcane-ruins.jpg',
}

// 2. Na renderização de DungeonRun, adicionar os props:
/*
  Masmorra ativa: experiência em tela cheia
  if (activeDungeon && selectedCharacter) {
    return (
      <DungeonRun
        key={`${activeDungeon.id}-${runSeq}`}
        dungeon={activeDungeon}
        character={selectedCharacter}
        tier={selectedTier[activeDungeon.id] ?? tierProgress[activeDungeon.id] ?? 1}
        onExit={handleRunExit}
        onRestart={handleRunRestart}
        initialAuto={resumeAuto}
        // ADICIONAR ESSAS LINHAS:
        backgroundImageUrl={DUNGEON_BACKGROUND_IMAGES[activeDungeon.id]}
        backgroundImageOverlay={0.35} // Ajuste conforme necessário (0-1)
      />
    )
  }
*/

// PASSO 1: Coloque sua imagem em /public/backgrounds/
// - Nome sugerido: dungeon-forest.jpg (ou o nome que preferir)
//
// PASSO 2: Atualize o DUNGEON_BACKGROUND_IMAGES map com o caminho correto
//
// PASSO 3: Descomente as linhas de backgroundImageUrl e backgroundImageOverlay
//
// PRONTO! Sua imagem será usada como background na batalha PvE.

export const DUNGEON_BACKGROUND_CONFIG = DUNGEON_BACKGROUND_IMAGES
