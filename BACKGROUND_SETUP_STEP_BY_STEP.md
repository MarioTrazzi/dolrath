# 🎮 Passo-a-Passo: Salvar Imagem de Background da Floresta

## ⚠️ IMPORTANTE: A Imagem NÃO está salva ainda!

A solução está pronta no código, mas a **imagem anexada precisa ser salva manualmente** em:

```
/public/backgrounds/dark-forest.jpg
```

## 📋 Instruções Precisas:

### 1️⃣ Localize a imagem anexada
- Ela está em seu navegador/chat (a imagem da floresta com fogo e caverna ao fundo)

### 2️⃣ Baixe/Capture a imagem
- **No Mac**: Clique com botão direito na imagem → "Salvar imagem como..."
- **Nome do arquivo**: `dark-forest.jpg`
- **Pasta de destino**: `/Users/mariotrazzi/Documents/dolrath/public/backgrounds/`

### 3️⃣ Verifique se foi salvo corretamente
Abra o terminal e execute:
```bash
ls -lh /Users/mariotrazzi/Documents/dolrath/public/backgrounds/
```

Você deve ver algo assim:
```
-rw-r--r--  1 usuario  staff  2.3M dark-forest.jpg
```

### 4️⃣ Teste
- Inicie um servidor dev: `npm run dev`
- Entre em uma masmorra do tipo "Floresta"
- O background deve aparecer na batalha! 🎉

## ✅ Mudanças Implementadas no Código

- ✅ `DungeonRun.tsx` - Agora aceita `backgroundImageUrl` e `backgroundImageOverlay`
- ✅ `DungeonBackdrop.tsx` - Renderiza imagem customizada para floresta
- ✅ `ImageBackdrop.tsx` - Componente melhorado com fallback de erro
- ✅ `src/app/dungeons/page.tsx` - Passa a imagem APENAS para floresta

## 🔧 Se ainda não funcionar:

### Opção 1: Verifique o caminho
```bash
# No VS Code, abra o terminal integrado e execute:
file /Users/mariotrazzi/Documents/dolrath/public/backgrounds/dark-forest.jpg
```

Deve retorgar algo como:
```
/Users/mariotrazzi/Documents/dolrath/public/backgrounds/dark-forest.jpg: JPEG image data, ...
```

### Opção 2: Abra o DevTools do navegador (F12)
- Vá para a aba "Network"
- Inicie uma batalha
- Procure por `dark-forest.jpg`
- Se tiver status **404**, o arquivo não foi encontrado
- Se tiver status **200**, o arquivo foi carregado com sucesso

### Opção 3: Verifique os logs da browser
- Abra o Console (F12)
- Procure por mensagens de erro com "ImageBackdrop" ou "dark-forest"

## 📝 Resumo

| Componente | Modificação | Status |
|-----------|-------------|--------|
| `ImageBackdrop.tsx` | Novo componente | ✅ Pronto |
| `DungeonBackdrop.tsx` | Suporta `imageUrl` | ✅ Pronto |
| `DungeonRun.tsx` | Suporta props de imagem | ✅ Pronto |
| `dungeons/page.tsx` | Passa imagem para floresta | ✅ Pronto |
| **Arquivo da imagem** | Precisa ser salvo | ⏳ Aguardando |

**Tudo está pronto! Só falta você salvar a imagem no caminho correto.**
