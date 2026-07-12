# 🎮 Guia: Usar Imagem de Background Customizada na Batalha PvE

## 📋 Resumo das Mudanças Implementadas

Implementei suporte para usar **imagens customizadas** como background na batalha PvE, substituindo os SVGs atuais. Foram criados/modificados:

1. ✅ **`ImageBackdrop.tsx`** - Novo componente que renderiza a imagem
2. ✅ **`DungeonBackdrop.tsx`** - Modificado para aceitar `imageUrl`
3. ✅ **`DungeonRun.tsx`** - Modificado para aceitar props de imagem e passá-los ao backdrop

## 🚀 Como Usar

### Passo 1: Prepare sua imagem

**Coloque a imagem anexada em:**
```
/public/backgrounds/dungeon-forest.jpg
```

> Se a imagem for em outro formato (PNG, WebP), use o nome apropriado:
> - `dungeon-forest.png`
> - `dungeon-forest.webp`

### Passo 2: Modifique `src/app/dungeons/page.tsx`

Abra o arquivo e encontre a seção onde `<DungeonRun` é renderizado (por volta da linha 262):

**ANTES:**
```tsx
<DungeonRun
  key={`${activeDungeon.id}-${runSeq}`}
  dungeon={activeDungeon}
  character={selectedCharacter}
  tier={selectedTier[activeDungeon.id] ?? tierProgress[activeDungeon.id] ?? 1}
  onExit={handleRunExit}
  onRestart={handleRunRestart}
  initialAuto={resumeAuto}
/>
```

**DEPOIS:**
```tsx
<DungeonRun
  key={`${activeDungeon.id}-${runSeq}`}
  dungeon={activeDungeon}
  character={selectedCharacter}
  tier={selectedTier[activeDungeon.id] ?? tierProgress[activeDungeon.id] ?? 1}
  onExit={handleRunExit}
  onRestart={handleRunRestart}
  initialAuto={resumeAuto}
  backgroundImageUrl="/backgrounds/dungeon-forest.jpg"
  backgroundImageOverlay={0.3}
/>
```

### Passo 3: Teste!

- Inicie uma batalha PvE
- A imagem da floresta/masmorra deve aparecer como background
- Ajuste `backgroundImageOverlay` se necessário (0.2 = mais claro, 0.5 = mais escuro)

## 🎨 Personalização por Masmorra (Opcional)

Se quiser diferentes imagens para cada tipo de masmorra:

```tsx
// No topo do arquivo, crie um mapa:
const DUNGEON_BACKGROUNDS: Record<string, string> = {
  floresta: '/backgrounds/dark-forest.jpg',
  caverna: '/backgrounds/crystal-cave.jpg',
  pantano: '/backgrounds/swamp.jpg',
  ruinas: '/backgrounds/arcane-ruins.jpg',
}

// Depois, na renderização:
<DungeonRun
  // ... outros props
  backgroundImageUrl={DUNGEON_BACKGROUNDS[activeDungeon.id]}
  backgroundImageOverlay={0.35}
/>
```

## ⚙️ Parâmetros Disponíveis

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `backgroundImageUrl` | `string` | undefined | Caminho da imagem (relativo a `/public/`) |
| `backgroundImageOverlay` | `number` | 0.3 | Opacidade do overlay escuro (0 = transparente, 1 = preto sólido) |

## 💡 Dicas

- **Imagens com aspecto escuro** funcionam melhor (overlay não fica tão pesado)
- **Resolução recomendada**: 1920x1080 ou maior
- **Overlay 0.3**: Padrão, bom balanço
- **Overlay 0.2**: Se a imagem for muito clara
- **Overlay 0.4+**: Se quiser focar mais no combate que no background

## 🔄 Reversão (Voltar para SVGs)

Se quiser voltar aos backgrounds SVG padrão, simplesmente remova os props:

```tsx
<DungeonRun
  // ... sem backgroundImageUrl
/>
```

## 📝 Componentes Relacionados

- `src/components/dungeon/ImageBackdrop.tsx` - Renderiza a imagem
- `src/components/dungeon/DungeonBackdrop.tsx` - Escolhe entre imagem ou SVG
- `src/components/battle/BattleScene.tsx` - Usa o backdrop

## ✨ Próximas Ideias

- Diferentes imagens por tier de dificuldade
- Imagens diferentes para cada monstro específico
- Animações de fundo adicinais (partículas, efeitos)
