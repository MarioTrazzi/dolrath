# Usando imagens customizadas como background na batalha PvE

## Instalação da imagem

1. **Coloque sua imagem em** `/public/backgrounds/`
   - Por exemplo: `/public/backgrounds/dungeon-forest.jpg`

2. **Formatos suportados**: JPG, PNG, WebP, GIF

## Como usar na DungeonRun

### Exemplo 1: Usando uma imagem para todas as masmorras
```tsx
<DungeonRun
  dungeon={dungeon}
  character={character}
  tier={tier}
  onExit={onExit}
  backgroundImageUrl="/backgrounds/dungeon-forest.jpg"
  backgroundImageOverlay={0.3} // Opacidade do overlay (0-1, padrão 0.3)
/>
```

### Exemplo 2: Imagem condicionada por tipo de masmorra
```tsx
const backgroundMap: Record<string, string | undefined> = {
  floresta: '/backgrounds/dark-forest.jpg',
  caverna: '/backgrounds/crystal-cave.jpg',
  pantano: '/backgrounds/swamp.jpg',
  ruinas: '/backgrounds/arcane-ruins.jpg',
}

<DungeonRun
  dungeon={dungeon}
  character={character}
  tier={tier}
  onExit={onExit}
  backgroundImageUrl={backgroundMap[dungeon.id]}
  backgroundImageOverlay={0.35}
/>
```

### Exemplo 3: Sem imagem customizada (comportamento padrão)
```tsx
<DungeonRun
  dungeon={dungeon}
  character={character}
  tier={tier}
  onExit={onExit}
  // backgroundImageUrl não fornecido = usa SVG padrão
/>
```

## Ajustando a opacidade do overlay

- **0.2**: Imagem mais visível, mas pode dificultar a leitura do texto
- **0.3**: Padrão, bom balanço
- **0.4**: Imagem mais escura, melhor contraste
- **0.5+**: Imagem muito escura

## Componentes relacionados

- **ImageBackdrop**: Renderiza a imagem com overlay
- **DungeonBackdrop**: Wrapper que escolhe entre imagem ou SVG
- **BattleScene**: Renderiza o backdrop na arena

## Dicas

- Use imagens com resolução de pelo menos 1920x1080 para melhor qualidade
- Imagens mais escuras funcionam melhor com overlay menor
- Teste diferentes níveis de overlay para encontrar o balanço perfeito
