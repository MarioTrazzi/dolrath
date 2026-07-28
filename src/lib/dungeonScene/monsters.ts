// ============================================================
// Monstros VISÍVEIS no mapa — quem tem folha de sprite RONDA EM ELIPSE; quem
// não tem continua sendo o vulto que vai e vem numa linha.
//
// Por que vulto para a maioria: os 19 webp de `public/monsters` são CARDS
// pintados 1024×1536 com fundo opaco (0% de alpha). Colar isso no chão viraria
// um retângulo pintado em pé. Recortar não sai automático — o lobo é escuro
// sobre escuro, nenhuma segmentação separa. Então o mapa mostra a SILHUETA com
// olhos acesos, que é o vocabulário certo de floresta sombria, e o card pintado
// aparece no combate — onde ele já é usado e funciona.
//
// E por que a ELIPSE para quem tem folha: a folha de monstro traz PERFIL,
// FRENTE e COSTAS (ver monsterSprites.ts). Num vaivém de linha reta a criatura
// só andaria para os dois lados, e dois terços da arte nunca apareceriam. A
// elipse varre as quatro direções, então cada volta usa a folha inteira.
//
// Escolhi elipse em vez de circuito de waypoints por três motivos concretos:
//   1. A cena não guarda estado por monstro — `monsterPos(m, t)` é chamada com
//      `t` arbitrário em três lugares (desenho, colisão, câmera). Waypoints
//      exigiriam bookkeeping de comprimento de arco para continuar O(1) em `t`.
//   2. |v| nunca chega a zero. Waypoints param e viram nos cantos, e aí a
//      direção fica indefinida exatamente onde a pose muda — receita de flicker.
//   3. θ é monótono em t ⇒ exatamente 4 trocas de pose por volta, cada pose
//      segurando um arco contíguo (é o que scripts/check-monster-patrol.ts mede).
//
// Puro (sem DOM): o passo de patrulha é matemática, dá para testar em Node.
// ============================================================

import { DUNGEONS, monsterImageSlug } from '@/lib/dungeonAdventures'
import { getMonsterSpriteBySlug } from '@/lib/monsterSprites'
import { seedRng } from '@/lib/walkSceneAssets'
import type { SpotContent } from './nodeContents'
import type { SceneMapDef, Vec2 } from './types'

export interface SceneMonster {
  /** Nó a que pertence — some quando o nó é resolvido. */
  nodeIndex: number
  isBoss: boolean
  /** Centro da ronda. */
  home: Vec2
  /** Extremos do vaivém, em unidades. Ignorado quando há `orbit`. */
  span: number
  /** Vaivém: direção da ronda. Elipse: INCLINAÇÃO dos eixos. (radianos) */
  angle: number
  /** Velocidade angular da ronda. */
  speed: number
  /** Defasagem, para o bando não andar em bloco. */
  phase: number
  /** Altura no mundo do VULTO procedural (a arte usa `worldH` do manifesto). */
  size: number
  /**
   * Espécie, para achar a folha em monsterSprites. `undefined` = vulto.
   * O chefe é determinístico a partir do id da masmorra; os mobs entram aqui
   * quando ganharem folha.
   */
  speciesSlug?: string
  /**
   * Ronda em ELIPSE em vez de vaivém. Só ganha quem tem folha de 4 direções —
   * o vulto procedural só tem silhueta lateral, e orbitar faria ele deslizar de
   * lado olhando para a frente. `ry` negativo inverte o sentido da volta.
   */
  orbit?: { rx: number; ry: number }
}

/** Posição da criatura no instante `t` (segundos). */
export function monsterPos(m: SceneMonster, t: number): Vec2 {
  const th = t * m.speed + m.phase
  const ca = Math.cos(m.angle)
  const sa = Math.sin(m.angle)
  if (m.orbit) {
    // Elipse inclinada por `angle`: (cos θ·rx, sin θ·ry) rotacionado.
    const ex = Math.cos(th) * m.orbit.rx
    const ey = Math.sin(th) * m.orbit.ry
    return { x: m.home.x + ca * ex - sa * ey, y: m.home.y + sa * ex + ca * ey }
  }
  const off = Math.sin(th) * m.span
  return { x: m.home.x + ca * off, y: m.home.y + sa * off }
}

/**
 * Velocidade (unidades/s) no instante `t` — DERIVADA EXATA de `monsterPos`, não
 * diferença finita: sem `dt`, sem ruído numérico e sem depender do frame rate.
 * É daqui que saem tanto o lado para onde a criatura olha quanto a pose.
 */
export function monsterVel(m: SceneMonster, t: number): Vec2 {
  const th = t * m.speed + m.phase
  const ca = Math.cos(m.angle)
  const sa = Math.sin(m.angle)
  if (m.orbit) {
    const dx = -Math.sin(th) * m.orbit.rx * m.speed
    const dy = Math.cos(th) * m.orbit.ry * m.speed
    return { x: ca * dx - sa * dy, y: sa * dx + ca * dy }
  }
  const d = Math.cos(th) * m.span * m.speed
  return { x: ca * d, y: sa * d }
}

/**
 * Para onde ele está virado agora (+1 direita, −1 esquerda).
 *
 * Contrato inalterado: no caso vaivém a fórmula antiga era `cos(θ)·cos(angle)` e
 * esta é a mesma multiplicada por `span·speed`, ambos positivos — mesmo sinal
 * ponto a ponto. Os vultos não mudam absolutamente nada de comportamento.
 */
export function monsterFacing(m: SceneMonster, t: number): number {
  return monsterVel(m, t).x >= 0 ? 1 : -1
}

/** Qual direção da folha usar agora. */
export type MonsterPose = 'side' | 'front' | 'back'

/**
 * |ux| acima disto = passo lateral → perfil.
 *
 * O herói usa 0.45 (HERO_SIDE_DX) porque ele anda quase sempre de lado pela
 * trilha e a diagonal tem que ler como perfil. O monstro é o oposto: ele ronda
 * o bolsão em círculo, e com 0.45 o perfil comia 81% da volta — a arte de
 * frente e de costas quase não aparecia, que é justamente o que a elipse veio
 * consertar. 0.6 divide a volta em quadrantes mais parelhos (~60/20/20), ainda
 * pendendo para o perfil, que é a leitura certa da diagonal num 3/4.
 */
const POSE_SIDE_UX = 0.6
/** Histerese: sair da pose atual custa esta margem a mais do que entrar nela. */
const POSE_HYST = 0.1

/**
 * Pose a partir da VELOCIDADE. `prev` alarga a banda da pose atual, então a
 * diagonal não pisca entre perfil e frente.
 *
 * A histerese vale só na fronteira LATERAL: a fronteira frente↔costas só é
 * alcançável com |ux| < 0.45, ou seja |uy| > 0.89 — longe de uy = 0, onde a
 * troca aconteceria. Numa elipse ela é cinto e suspensório (θ é monótono, cada
 * limiar é cruzado uma vez por quarto de volta); existe para o dia em que
 * alguém alimentar isto com uma velocidade não-monótona, como uma perseguição.
 *
 * Puro: quem guarda o `prev` é o chamador — este módulo não tem estado por design.
 */
export function monsterPose(v: Vec2, prev?: MonsterPose): MonsterPose {
  const len = Math.hypot(v.x, v.y)
  if (len < 1e-6) return prev ?? 'side'
  const ux = v.x / len
  const uy = v.y / len
  const gate = POSE_SIDE_UX + (prev === 'side' ? -POSE_HYST : POSE_HYST)
  if (Math.abs(ux) >= gate) return 'side'
  // −y é o fundo da cena: indo para lá, mostra as costas.
  return uy < 0 ? 'back' : 'front'
}

/**
 * Um bando por nó de combate, espalhado dentro do bolsão.
 * Determinístico: mesma seed ⇒ mesmo bando nas mesmas posições.
 */
export function planMonsters(
  map: SceneMapDef,
  contents: Map<number, SpotContent>,
  seed: string,
): SceneMonster[] {
  const rng = seedRng(`${map.id}:${seed}:mobs`)
  const out: SceneMonster[] = []

  // O chefe é determinístico a partir da masmorra, então a espécie sai daqui sem
  // precisar do servidor. Os mobs ainda não têm folha: quando tiverem, é só
  // resolver a espécie deles aqui e a órbita vem junto, pela regra abaixo.
  const bossSlug = monsterImageSlug(DUNGEONS[map.id].boss.name)

  for (const spot of map.spots) {
    const c = contents.get(spot.nodeIndex)
    if (!c || c.category !== 'combat') continue
    const isBoss = c.flavor === 'boss'
    // Espécies do bando: o servidor manda na chegada ao nó (a bancada /dev usa
    // o palpite determinístico de planNodeContents). O chefe é dedutível da
    // masmorra, então ele nunca depende disso.
    const pack = c.speciesSlugs?.length ? c.speciesSlugs : isBoss ? [bossSlug] : []

    // Bolsão do nó — o raio limita o quanto o bando pode se espalhar.
    const pocket = map.areas.find(
      a => a.kind === 'disc' && Math.hypot(a.c.x - spot.pos.x, a.c.y - spot.pos.y) < 0.5,
    )
    const r = pocket && pocket.kind === 'disc' ? pocket.r : 5

    // Quantos: o tamanho do bando quando ele é conhecido — aí o mapa mostra
    // exatamente quantos bichos o jogador vai enfrentar. Sem espécie, cai no
    // sorteio de antes (1-3, a mesma faixa que o servidor usa).
    const count = pack.length
      ? pack.length
      : isBoss
        ? 1
        : spot.kind === 'main'
          ? 2 + Math.floor(rng() * 2)
          : 1 + Math.floor(rng() * 2)

    for (let i = 0; i < count; i++) {
      const speciesSlug = pack[i] ?? pack[0]
      // Orbita quem tem folha de 4 direções. Regra data-driven: bicho que ganha
      // folha passa a orbitar sozinho, sem tocar nesta função.
      const hasSheet = !!getMonsterSpriteBySlug(speciesSlug)
      const ang = rng() * Math.PI * 2
      const dist = isBoss ? 0 : r * (0.15 + rng() * 0.4)
      /**
       * Órbita CONTIDA: o raio maior fica bem abaixo do bolsão (que no covil do
       * chefe é 8.5–11), senão o herói chegaria ao centro com a criatura longe
       * demais para o enquadramento da aproximação pegar os dois.
       *
       * Só é chamada quando há folha — assim o vulto consome exatamente a mesma
       * sequência de rng() de antes e continua nascendo onde nascia.
       */
      const orbitOf = () => {
        const rx = Math.min(r * 0.3, 2.2 + rng() * 0.4)
        // Quase circular de propósito: uma elipse achatada passa a maior parte
        // da volta andando de lado, e aí a arte de frente/costas mal aparece.
        // Na tela ela já sai achatada de graça pelo Y_SQUASH (0.82) da cena.
        return { rx, ry: rx * (0.82 + rng() * 0.18) * (rng() < 0.5 ? -1 : 1) }
      }
      out.push({
        nodeIndex: spot.nodeIndex,
        isBoss,
        speciesSlug,
        home: { x: spot.pos.x + Math.cos(ang) * dist, y: spot.pos.y + Math.sin(ang) * dist },
        // Ronda contida: o vulto não pode sair do bolsão nem cruzar o outro.
        span: Math.min(r * 0.35, 1.2 + rng() * 1.4),
        angle: rng() * Math.PI * 2,
        // Volta em ~10–14s no chefe: cada uma das 4 poses segura ~2.5–3.5s.
        // Mais rápido vira nervosismo; mais lento e o jogador encosta nele antes
        // de ver a volta inteira.
        speed: hasSheet ? 0.45 + rng() * 0.2 : 0.5 + rng() * 0.5,
        phase: rng() * Math.PI * 2,
        size: isBoss ? 3.4 : 1.5 + rng() * 0.5,
        orbit: hasSheet ? orbitOf() : undefined,
      })
    }
  }

  return out
}
