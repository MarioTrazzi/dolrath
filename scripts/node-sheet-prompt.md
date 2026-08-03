# Contrato da folha de OBJETO DE NÓ

Folha do baú, da moita de ervas, da fonte e do entulho — os objetos que a cena
explorável desenha nos nós de achado. Recortadas por
[`scripts/slice-node-sprites.ts`](./slice-node-sprites.ts) (`npm run art:scene:nodes`).

O contrato da folha de HERÓI/MONSTRO é outro e está em
[`hero-sprite-sheet-prompt.md`](./hero-sprite-sheet-prompt.md).

## A regra que mais quebra: FUNDO CHAPADO

O recorte é `sharp`, não IA: ele acha o fundo pela borda e o apaga por flood
fill. **Se a folha vier com cena pintada atrás do objeto, não há o que recortar.**

Já aconteceu: a primeira folha do entulho veio com chão de floresta pintado em
cada célula — raízes, musgo, troncos, na mesma paleta do objeto. Não é
recuperável no pós-processamento, só regerando.

O script mede isso e **recusa a folha** antes de gastar trabalho: mede a fração
dos pixels da moldura que estão dentro da tolerância da cor de fundo, e para
abaixo de 60%. Medido nas folhas reais:

| folha | fundo chapado | veredito |
|---|---|---|
| `fonte.png` | 100% | ✅ |
| `chest.png` | 100% | ✅ |
| `weed.png` (por célula) | 98-100% | ✅ |
| `rubble.png` (por célula) | 54% | ❌ recusada |

## O que pedir

- **Fundo de COR ÚNICA e chapada**, contrastando com o objeto. Cinza médio e
  verde-oliva já funcionaram. Sem cena, sem chão, sem grama, sem vinheta, sem
  gradiente, sem textura.
- **Quadros numa linha**, ou numa **grade regular**. As duas diagramações são
  lidas; grade com bordas desenhadas precisa de `bordered: true` na receita.
- **Sequência de ESTADO**, não de pose: cheio → gasto. É disso que saem os dois
  arquivos (`<flavor>-1.webp` e `<flavor>-used-1.webp`). Ex.: baú fechado →
  aberto, fonte cheia → seca, moita intacta → colhida, entulho intacto →
  revirado.
- **Mesma câmera e mesma escala em todos os quadros.** O objeto não pode mudar
  de tamanho nem de ângulo entre o estado cheio e o gasto — os dois são
  desenhados no mesmo ponto do mapa.
- **Objeto inteiro dentro do quadro**, de pé, apoiado na base.

## O que evitar

- **Texto dentro da célula.** Rótulo em faixa própria o script descarta (banda
  curta demais para ser arte); texto POR CIMA do objeto, não.
- **Sombra ou chão pintado sob o objeto.** A cena desenha a própria sombra
  elíptica, que bate com a luz do lugar. Se vier mesmo assim, `killShadow: true`
  na receita resolve — o flood reconhece "fundo multiplicado" (mesma
  cromaticidade, luminância menor) e o apaga. Foi o caso do baú (55k px) e do
  montinho de grama da moita (~17k px por célula).
- **Faísca, brilho ou marca-d'água solta** no canto. Vira um quadro fantasma na
  numeração; não quebra, mas polui a folha de contato.

## Depois de gerar

1. Salve em `sprite-sources/<nome>.png` (a pasta é gitignored).
2. Acrescente a receita em `NODE_SHEETS`, no topo de `slice-node-sprites.ts`:
   qual quadro é o `idle` e qual é o `used`.
3. `npm run art:scene:nodes -- --dry-run` — confira quantos quadros ele achou e
   o tamanho de cada um.
4. `npm run art:scene:nodes` e abra `sprite-sources/_contact-<flavor>.png`:
   recorte limpo, sem sombra, sem rótulo, sem borda de célula.
5. Confira na cena em `/dev/dungeon-scene` (Floresta Sombria).
