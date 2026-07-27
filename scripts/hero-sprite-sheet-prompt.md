# Folha de sprites do herói — contrato para as 16 combinações

Receita para gerar as folhas no Gemini de modo que todas fiquem coerentes entre si e que
`scripts/slice-hero-sprite-sheet.ts` consiga recortar sem ajuste manual.

## Combinações

Raças (ids em PT) × classes (ids em EN), como em `src/lib/gameData.ts`:

|  | warrior | rogue | mage | monk |
|---|---|---|---|---|
| **humano** | | | | |
| **elfo** | | ✅ feito | | |
| **draconiano** | | | | |
| **metamorfo** | | | | |

(`--all` imprime este checklist atualizado a cada rodada.)

Os pares canônicos da Jornada (`journeyData.ts`) são elfo⇄rogue, humano⇄mage,
draconiano⇄warrior, metamorfo⇄monk — comece por eles, que são os que aparecem na landing.

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

- **Linha 1** — parado de frente, 5-6 frames.
- **Linha 2** — caminhada: **5 frames de perfil + 1 de costas**. É esta que importa.
- **Linha 3** — caminhada, variação (perfil + 1 de frente).
- **Linha 4** — ataque.
- **Linha 5** — dano/morte.

## Sobre a linha 2 (a que conta)

O que veio na folha do elfo/ladino, e que dá pra pedir melhor da próxima vez:

- Os frames 1 e 2 saíram praticamente **idênticos**, e os frames 5 e 6 eram só o **espelho**
  deles. Ou seja, de 6 frames sobraram 2 poses úteis.
- Salvou o fato de o frame 1 ter as **pernas juntas** — virou a pose de passagem, e o ciclo
  ficou `[passada, passagem, passada, passagem]`.

Então **peça explicitamente poses distintas e uma direção só**:

> Linha de caminhada com 6 frames, todos de perfil olhando para a **direita**, exceto o
> último que é de **costas**. Os 5 de perfil devem ser fases diferentes do mesmo ciclo de
> caminhada: (1) contato com a perna direita à frente, (2) peso no pé de apoio com as pernas
> juntas, (3) impulso com o calcanhar erguido, (4) contato com a perna esquerda à frente,
> (5) pernas juntas de novo. Não repita a mesma pose e não espelhe nenhum frame.

Se ainda assim vierem frames espelhados, tudo bem: o `heroSprites.ts` guarda `facing` e a
`WalkScene` espelha em runtime — basta descartar os índices redundantes no ciclo.

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

# 3. confira public/sprites/<slug>/_contact.png (qual índice é o de costas?)

# 4. calibre em /dev/sprite-lab e cole o resultado em src/lib/heroSprites.ts
```

O `--all` pula o que já foi recortado, não para se uma folha falhar e no fim
imprime o checklist das 16 combinações + as entradas prontas do manifesto.

Combinação sem entrada em `HERO_SPRITES` continua com o card antigo da `WalkScene` — dá pra
subir uma de cada vez sem quebrar nada.
