# Folha de sprites do herói — contrato para as 16 combinações

Receita para gerar as folhas no Gemini de modo que todas fiquem coerentes entre si e que
`scripts/slice-hero-sprite-sheet.ts` consiga recortar sem ajuste manual.

## Combinações

Raças (ids em PT) × classes (ids em EN), como em `src/lib/gameData.ts`:

|  | warrior | rogue | mage | monk |
|---|---|---|---|---|
| **humano** | | | ✅ feito | |
| **elfo** | | ✅ feito | | |
| **draconiano** | ⚠️ refazer | | | |
| **metamorfo** | | | | ✅ feito |

4 de 16. `--all` imprime este checklist atualizado a cada rodada.

Os pares canônicos da Jornada (`journeyData.ts`) são elfo⇄rogue, humano⇄mage,
draconiano⇄warrior, metamorfo⇄monk — são os 4 que já foram, porque aparecem na landing.
As 12 que faltam são as combinações cruzadas.

## O que o script precisa da folha

O recorte é por projeção de pixels opacos, então a folha só precisa respeitar isto:

1. **Fundo cinza chapado** (`#8A8A8A` funciona bem). Uniforme, sem gradiente, sem sombra
   projetada no fundo — a sombra encosta na silhueta e vira parte do recorte.
2. **Espaço vazio entre os frames e entre as linhas.** É o que separa as bandas e as colunas.
   Frames colados viram um blob só.
3. **Mesma escala em todos os frames** da linha. O script usa uma escala única por linha
   (o frame mais alto define), então frames de tamanhos diferentes ficam desproporcionais.
4. **Pés na mesma linha do chão** dentro da linha. O alinhamento final é pelo pé; se um frame
   estiver flutuando, ele afunda.
5. Nada de moldura, grade, régua ou legenda desenhada na folha.

## Layout esperado

Só a **linha 2** é usada hoje (`--row 2`). O resto pode vir junto, é ignorado.

- **Linha 1** — parado, 5-6 frames.
- **Linha 2** — caminhada: **4-5 frames de perfil + 1-2 de costas**. É esta que importa.
- **Linha 3** — ataque.
- **Linha 4** — dano/morte.

## A linha 2 é a única que conta — e é onde as folhas falham

Este é o ponto que já custou duas folhas. Repetindo, porque o Gemini gosta de
variar o ângulo da câmera quando você pede "caminhada":

> **A linha de caminhada é de PERFIL.** O herói anda de lado ou sobe de costas —
> ele nunca vem na direção da câmera e nunca vira o ombro no meio do passo.

O que já deu errado:

| folha | linha 2 veio como | resultado |
|---|---|---|
| elfo/ladino | 2 poses de perfil úteis + 1 costas + 2 espelhos | ✅ serviu — `[passada, passagem, passada, passagem]` |
| humano/mago | frontal no 1º frame; costas só na linha 4 | recortado com `--rows 2,4` |
| metamorfo/monge | frontal no 1º; perfil e costas na mesma linha | serviu, 2 poses |
| **draconiano/guerreiro** | **1 frontal + 3 costas + 1 perfil + 1 três-quartos de costas** | ❌ **UM perfil só** — o ciclo `[4, 5]` virava as costas a cada 2º frame e, andando pra direita, lia como se o boneco sumisse. Hoje anda com `walk: [4]` (perna parada) até chegar folha nova. |

### O pedido, do jeito que funciona

> Linha de caminhada com 6 frames, todos de **perfil olhando para a direita**,
> exceto o último que é de **costas**. Os 5 de perfil são fases diferentes do mesmo
> ciclo: (1) contato com a perna direita à frente, (2) peso no pé de apoio com as
> pernas juntas, (3) impulso com o calcanhar erguido, (4) contato com a perna
> esquerda à frente, (5) pernas juntas de novo. **Não repita a mesma pose, não
> espelhe nenhum frame, não desenhe nenhuma pose de frente e nenhuma de
> três-quartos** — perfil puro, o rosto de lado, os dois ombros alinhados.

O mínimo aproveitável são **duas poses de perfil distintas** (uma de passada e uma
de pernas juntas). Uma só não dá ciclo.

### Pose parada

Sem frame frontal. Se a folha tiver um perfil de **pernas juntas**, é ele o `idle`
(é o caso do elfo). Senão deixe `idle` fora do manifesto: o default cai no primeiro
frame do ciclo, que já é de perfil.

Frames espelhados não são problema: o `heroSprites.ts` guarda `facing` e a cena
espelha em runtime — basta descartar os índices redundantes no ciclo.

## Estilo (manter igual entre as 16)

- Pixel art estilizada, paleta escura e dessaturada, contorno escuro na silhueta.
- Capuz/traje coerente com a classe; a raça aparece no rosto (orelha pontuda do elfo,
  escamas/chifres do draconiano etc.).
- Corpo inteiro, sem corte, com a capa/manto acompanhando o passo.
- Personagem ocupando altura parecida em todas as folhas — o boneco é desenhado com altura
  fixa na cena (`HERO_SPRITE_SCREEN_H`), então diferenças de enquadramento viram diferenças
  de tamanho aparente entre as combinações.

## Pipeline

```bash
# 1. salve as folhas como <race>-<class>.png (ver sprite-sources/README.md)
cp ~/Downloads/Gemini_Generated_Image_xxx.png sprite-sources/humano-mage.png

# 2. recorte a pasta inteira de uma vez
npx tsx scripts/slice-hero-sprite-sheet.ts --all

# 3. confira public/sprites/<slug>/_contact.png — os frames crus, na ordem da folha
#    (qual índice é o de costas? quantos perfis distintos sobraram?)

# 4. calibre em /dev/sprite-lab e cole o resultado em src/lib/heroSprites.ts

# 5. confira DE NOVO, agora como a cena mostra (espelhado, no tamanho de tela)
npx tsx scripts/review-hero-sprites.ts --slug humano-mage
```

O passo 5 é o que pega o erro do draconiano: a `_contact.png` mostra os frames
crus e um três-quartos de costas passa por perfil ali; a `_review.png` mostra o
ciclo já espelhado, e a pose errada salta aos olhos. **Toda folha nova passa pelos
dois.**

O `--all` pula o que já foi recortado, não para se uma folha falhar e no fim
imprime o checklist das 16 combinações + as entradas prontas do manifesto.

Combinação sem entrada em `HERO_SPRITES` continua com o card antigo da `WalkScene` — dá pra
subir uma de cada vez sem quebrar nada.
