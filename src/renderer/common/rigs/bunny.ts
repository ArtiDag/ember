// Кролик-уголёк — вторая «кукла» Ember. Поведение (когда сидеть, прыгать, разворачиваться,
// ложиться спать, просыпаться и потягиваться, выглядывать из-за края, царапать экран, слушать
// музыку) — то же, что у Уголька: класс наследует его логику и рисует себя сам.
// Стиль тот же: чёрный силуэт, большие белые глаза, тонкий светлый контур. Отличие — силуэт:
// длинные уши, хвост-помпон, большие задние лапы; передвигается прыжками.

import { drawSleepArtDetails, drawSleepArtSilhouette } from './bunnySleepArt'
import {
  BlackCatRig,
  C,
  G,
  INK,
  PINK,
  RIG_SCENE,
  SLEEP_DEEP,
  approach,
  clamp,
  drawScratchPaw,
  easeInOut,
  lerp,
  peekState,
  scratchPaw,
  scratchRaise,
  smooth,
  type PeekState,
  type RigInput
} from './blackCat'
import { BUNNY_HOP_DATA, BUNNY_HOP_FPS } from './bunnyHop'
import { BUNNY_SETTLE_DATA } from './bunnySettle'

const W = RIG_SCENE.width
const H = RIG_SCENE.height
/** Белые детали (линии в ушах, глаза, нос, усы, подушечки) — как на референсе. */
const LINE = '#fbfbf7'
/** Подушечки лап — белые, но чуть приглушённые (не спорят с глазами). */
const PAD_W = '#dcdcd6'

interface Blob {
  x: number
  y: number
  rx: number
  ry: number
  /** Наклон овала, рад. */
  r?: number
}
interface Ear {
  x: number
  y: number
  len: number
  /** Наклон, рад: 0 — вверх, минус — назад (влево в сцене). */
  a: number
  /** Изгиб кончика. */
  bend: number
  /** Полуширина уха (масштаб формы). */
  w: number
}

/** Белая линия внутри уха — в системе координат уха (доли длины и ширины), подогнана по референсу. */
interface EarLine {
  lw: number
  bw: number
  belly: number
  bellyH: number
  tip: number
  y0: number
  y1: number
  bk: number
  rk: number
  y0r: number
}
const EAR_LINE_L: EarLine = { lw: 1.4, bw: 0.48, belly: 1.26, bellyH: 0.3, tip: 0.5, y0: 0, y1: 0.86, bk: 1.23, rk: 0.96, y0r: 0.19 }
const EAR_LINE_R: EarLine = { lw: 1.3, bw: 0.3, belly: 1.4, bellyH: 0.3, tip: 0.6, y0: 0.05, y1: 0.88, bk: 0.9, rk: 1, y0r: 0.05 }
/** Поза анфас (сидит, лежит, стоит у стекла, висит в руке): одни и те же детали в разных местах. */
interface FrontPose {
  base: Blob
  chest: Blob
  head: [number, number]
  earL: Ear
  earR: Ear
  footL: Blob
  footR: Blob
  pawL: Blob
  pawR: Blob
  tail: [number, number, number]
  /** Висящие задние лапы (в руке): 0…1. */
  legs: number
  /** Голова: поворот (−1…1, как за курсором) и наклон, рад — для поз «ложится спать». */
  turn?: number
  rot?: number
}

// Сидит анфас — подогнано по эскизу анфас,
// расхождение силуэтов 2,85%: левое ухо высокое и почти прямое, правое короче и отклонено вправо;
// круглая голова с пухлыми щёчками; тело «грушей»; задние лапы вытянуты вперёд — видны стопы.
const SIT: FrontPose = {
  base: { x: C, y: 199.75, rx: 39.8, ry: 30 },
  chest: { x: C, y: 185, rx: 35, ry: 41.5 },
  head: [C, 123.5],
  earL: { x: C - 20, y: 93.3, len: 76.6, a: 0.098, bend: 5.6, w: 14.2 },
  earR: { x: C + 16.4, y: 90, len: 54.8, a: 0.676, bend: -1, w: 11.4 },
  footL: { x: C - 34, y: 214, rx: 9.75, ry: 16, r: -0.5 },
  footR: { x: C + 34, y: 214, rx: 9.75, ry: 16, r: 0.5 },
  // передние лапки — как у Уголька: внизу по центру, между стопами (чуть выступают из силуэта)
  pawL: { x: C - 11, y: 223.5, rx: 9.5, ry: 7.5 },
  pawR: { x: C + 11, y: 223.5, rx: 9.5, ry: 7.5 },
  tail: [C + 30, 214, 0],
  legs: 0
}

// ---------- ложится спать: ключевые позы по видео ----------
// По раскадровке (24 к/с): сидит и сонно щурится → уши расходятся в стороны
// «самолётиком» (к. 30) → падают вниз, как у вислоухого (к. 42) → присел, глаза закрылись (к. 50) → повернулся на
// ¾ влево и лёг «буханкой»: ближнее ухо поднялось и легло на спину, дальнее спряталось за голову (к. 70). Позы
// сняты с кадров в координатах сцены (масштаб — по расстоянию между глазами; в конце видео камера наезжает —
// это убрано, кролик остаётся своего размера).

/**
 * Серые контуры поверх чёрного (край уха на спине, затылок, хвостик; лапки) — сплошным цветом, не
 * полупрозрачным белым: иначе там, где линии сходятся или накладываются, видны светлые узлы.
 */
const CONTOUR = '#8c8d90'
const CONTOUR_LIGHT = '#8a8a8c'
/** Контур затылка и щеки лёжа — точки с образца, от правого глаза (ед. сцены): затылок, впадинка, щека. */
const HEAD_CONTOUR: [number, number][] = [
  [22.4, -21.6],
  [24.9, -19.9],
  [26.6, -16.9],
  [26.8, -14.0],
  [25.9, -12.4],
  [27.3, -9.8],
  [28.4, -5.1],
  [27.9, 0.2],
  [25.3, 4.4],
  [21.6, 6.9]
]

/** Ухо по корню (x, y), длине и углу (рад от вертикали, + — по часовой). */
const ear = (x: number, y: number, len: number, a: number, w: number, bend = 0): Ear => ({ x, y, len, a, bend, w })
// к. 30: уши разошлись в стороны почти горизонтально, кончики чуть свисают; голова чуть ниже
// (вперёд, на морду, уши не падают — это выглядело плохо: только назад)
// сонный: уши чуть отгибаются назад и в стороны — короче (кончики уходят назад), голова чуть ниже
const EARS_OUT: FrontPose = {
  ...SIT,
  head: [C - 1, 126],
  earL: ear(C - 19, 95, 58, -0.42, 13, 3),
  earR: ear(C + 17, 95, 56, 0.48, 13, -3)
}
// уши отогнулись назад сильнее: кончики ушли за голову (уши короче), разошлись в стороны
const EARS_LOP: FrontPose = {
  ...SIT,
  head: [C - 3, 129],
  earL: ear(C - 17, 97, 56, 0.2, 12.5, 4),
  earR: ear(C + 14, 98, 54, 1.0, 12.5, 4),
  turn: -0.05
}
// к. 50: присел — голова ниже, передние лапки вперёд, бедро и хвостик справа; уши висят
const CROUCH_F: FrontPose = {
  base: { x: C + 40, y: 201, rx: 29, ry: 27 },
  // спина от головы к бедру — одной массой, не толще, чем сидя
  chest: { x: C + 4, y: 202, rx: 44, ry: 26 },
  head: [C - 3, 150],
  earL: ear(C - 16, 119, 54, 0.75, 12.5, 4),
  earR: ear(C + 12, 120, 54, 1.25, 12.5, 4),
  footL: { x: C - 6, y: 222, rx: 6, ry: 5 },
  footR: { x: C + 38, y: 219, rx: 8, ry: 8 },
  pawL: { x: C - 14, y: 221, rx: 9, ry: 7 },
  pawR: { x: C + 8, y: 222, rx: 9.5, ry: 7 },
  tail: [C + 70, 207, 9],
  legs: 0,
  turn: -0.12,
  rot: 0
}
// к. 70+ (конечный кадр): «буханка» — голова слева у земли, повёрнута на ¾; высокая круглая спина; ближнее
// ухо лежит на спине вдоль, дальнее — над макушкой (его угол — «через низ», −2π: за головой, а не через лоб);
// видна одна передняя лапка и задняя стопа; крупный хвостик справа
const LOAF: FrontPose = {
  // (подогнано под готовый рисунок спящего — в него поза переходит в конце укладывания)
  base: { x: C + 37, y: 190, rx: 27, ry: 37 },
  chest: { x: C - 2, y: 187, rx: 64, ry: 41 },
  head: [C - 28.3, 193],
  earL: ear(C - 24, 160, 60, 1.25, 11.5, 3),
  earR: ear(C - 6, 158, 58, 1.52, 13, 5),
  footL: { x: C + 50, y: 218, rx: 8, ry: 5 },
  footR: { x: C + 26, y: 219.6, rx: 10, ry: 7.5 },
  pawL: { x: C - 44, y: 223, rx: 8, ry: 5 },
  pawR: { x: C - 10.4, y: 220, rx: 8.5, ry: 8 },
  tail: [C + 70, 205, 9.5],
  legs: 0,
  turn: -0.7,
  rot: -0.12
}
// на полпути между «присел» и «буханкой» (уши всё время видны и ложатся назад, к хвосту)
const TURN_MID: FrontPose = combinePose([CROUCH_F, LOAF], ([a, b]) => (a + b) / 2)
/** Ключевые позы по времени сна (с) — как в видео (кадр / 24). Между ними — плавная кривая без остановок. */
const LIE_KEYS: [number, FrontPose][] = [
  [0, SIT],
  [0.6, SIT],
  [1.15, EARS_OUT],
  [1.55, EARS_LOP],
  [1.85, CROUCH_F],
  // (ложится — в том же темпе, что встаёт: WAKE_SPEED, ≈0,25 с от «присел» до «лёг» — смены не видно)
  [1.96, TURN_MID],
  [2.1, LOAF]
]
const LIE_LAST_T = LIE_KEYS[LIE_KEYS.length - 1][0]
/**
 * Когда кукла становится рисунком спящего: ещё на ходу (последний участок укладывания), а дальше рисунок сам
 * доезжает до места — растягивается по габаритам позы куклы (см. artFit), поэтому подмены не видно.
 */
const ART_SWAP_T = LIE_LAST_T - 0.017
/** Линии и лицо рисунка — раньше, ещё на ходу (по габаритам позы куклы), силуэт — в конце (почти одинаковый). */
const ART_LINES_T = LIE_LAST_T - 0.055
/** «Плюх»: лёг — тело чуть сплющилось и расправилось (с, начало и длительность). */
const PLOP = [LIE_LAST_T - 0.07, 0.4]
/** Паузы между позами (одна поза подряд) — просыпаясь, их пропускает. */
const LIE_HOLDS = LIE_KEYS.slice(1)
  .map(([t, p], i): [number, number, boolean] => [LIE_KEYS[i][0], t, p === LIE_KEYS[i][1]])
  .filter((h) => h[2])
/** Отсюда (поза «уши назад») — падает: сидячая часть до неё пролетает в FAST_EARS раз быстрее. */
const FALL_T = 1.55
const FAST_EARS = 9
/** Само падение (присел → лёг) — резко, «плюх»: быстрее, чем встаёт. */
const FALL_SPEED = 2.4
/** Просыпается: позы назад во столько раз быстрее (паузы пропускает, переходы — без рывка). */
const WAKE_SPEED = 1.8
/** Сонно прищурился (к. 0–14), закрыл глаза, приседая (к. 44–50). */
const EYES_HALF = [0.1, 0.6]
const EYES_SHUT = [1.6, 1.85]
/** Пока уши расходятся и падают — смотрит грустно вниз. */
const LOOK_DOWN = [0.4, 1.1]
/** Сидячие линии (бёдра, подушечки стоп) гаснут, когда разворачивается. */
const SIT_LINES_OFF = [1.4, 1.56]
/** Лёг — проступают линии щеки и бедра, контур ближнего уха на спине. */
const LIE_LINES = [LIE_LAST_T - 0.1, LIE_LAST_T + 0.1]
/** Дальнее ухо уходит за голову — его линия на это время гаснет (иначе белая линия поверх морды). */
const SLEEP_END = 2.9

/** Поля позы как числа: свести несколько поз одной функцией (для кривой между ключами). */
function combinePose(ps: FrontPose[], f: (v: number[]) => number): FrontPose {
  const walk = (xs: unknown[]): unknown => {
    const x0 = xs.find((x) => x !== undefined)
    if (typeof x0 === 'number' || x0 === undefined) return f(xs.map((x) => (x as number | undefined) ?? 0))
    if (Array.isArray(x0)) return x0.map((_, i) => walk(xs.map((x) => (x as unknown[])[i])))
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(x0 as object)) o[k] = walk(xs.map((x) => (x as Record<string, unknown>)[k]))
    return o
  }
  return walk(ps) as FrontPose
}

/**
 * Поза в момент сна c (с): кривая Эрмита через ключевые позы — движение течёт без остановок на каждой позе
 * (как в видео); у пауз (одна поза подряд) и в начале/конце — с нулевой скоростью, без перелёта.
 */
function lieKeyPose(c: number): FrontPose {
  const K = LIE_KEYS
  if (c <= K[0][0]) return K[0][1]
  if (c >= LIE_LAST_T) return K[K.length - 1][1]
  let i = 0
  while (c > K[i + 1][0]) i++
  const [t0, p0] = K[i]
  const [t1, p1] = K[i + 1]
  if (p0 === p1) return p0
  // наклон в ключе: по соседям; у пауз и на краях — 0
  const slope = (j: number): ((v: number[]) => number) | null => {
    if (j <= 0 || j >= K.length - 1 || K[j - 1][1] === K[j][1] || K[j + 1][1] === K[j][1]) return null
    const dt = K[j + 1][0] - K[j - 1][0]
    return (v) => (v[2] - v[0]) / dt
  }
  const u = (c - t0) / (t1 - t0)
  const h = t1 - t0
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1
  const h10 = u ** 3 - 2 * u ** 2 + u
  const h01 = -2 * u ** 3 + 3 * u ** 2
  const h11 = u ** 3 - u ** 2
  const s0 = slope(i)
  const s1 = slope(i + 1)
  const prev = K[Math.max(0, i - 1)][1]
  const next = K[Math.min(K.length - 1, i + 2)][1]
  return combinePose([prev, p0, p1, next], ([a, b, cc, d]) => {
    const m0 = s0 ? s0([a, b, cc]) : 0
    const m1 = s1 ? s1([b, cc, d]) : 0
    return h00 * b + h10 * h * m0 + h01 * cc + h11 * h * m1
  })
}
const phase = (c: number, [a, b]: number[]): number => easeInOut(clamp((c - a) / (b - a), 0, 1))

// В руке: тело вытянуто, задние лапы свисают, передние поджаты.
const DANGLE: FrontPose = {
  base: { x: C, y: 190, rx: 28, ry: 22 },
  chest: { x: C, y: 160, rx: 31, ry: 40 },
  head: [C, 114],
  earL: { x: C - 19, y: 86, len: 68, a: 0.05, bend: 3, w: 14.2 },
  earR: { x: C + 15, y: 83, len: 52, a: 0.5, bend: -1, w: 11.4 },
  footL: { x: C - 16, y: 216, rx: 9, ry: 14 },
  footR: { x: C + 16, y: 216, rx: 9, ry: 14 },
  pawL: { x: C - 19, y: 134, rx: 8.5, ry: 10.5 },
  pawR: { x: C + 19, y: 134, rx: 8.5, ry: 10.5 },
  tail: [C + 22, 196, 9],
  legs: 1
}

// Встал на задние лапы у «стекла» (царапает экран): передние лапы тянутся к стеклу.
const STAND: FrontPose = {
  base: { x: C, y: 202, rx: 40, ry: 26 },
  chest: { x: C, y: 162, rx: 32, ry: 36 },
  head: [C, 110],
  earL: { x: C - 20, y: 80, len: 74, a: 0.05, bend: 5, w: 14.2 },
  earR: { x: C + 16, y: 77, len: 54, a: 0.6, bend: -1, w: 11.4 },
  footL: { x: C - 30, y: 222, rx: 18, ry: 7 },
  footR: { x: C + 30, y: 222, rx: 18, ry: 7 },
  pawL: { x: C - 20, y: 150, rx: 0, ry: 0 },
  pawR: { x: C + 20, y: 150, rx: 0, ry: 0 },
  tail: [C + 40, 214, 8],
  legs: 0
}

const mixN = (parts: [number, number][]): number => {
  let sum = 0
  let total = 0
  for (const [v, w] of parts) {
    sum += v * w
    total += w
  }
  return total > 0 ? sum / total : parts[0][0]
}
function mixBlob(parts: [Blob, number][]): Blob {
  return {
    x: mixN(parts.map(([b, w]) => [b.x, w])),
    y: mixN(parts.map(([b, w]) => [b.y, w])),
    rx: mixN(parts.map(([b, w]) => [b.rx, w])),
    ry: mixN(parts.map(([b, w]) => [b.ry, w])),
    r: mixN(parts.map(([b, w]) => [b.r ?? 0, w]))
  }
}
function mixEar(parts: [Ear, number][]): Ear {
  return {
    x: mixN(parts.map(([e, w]) => [e.x, w])),
    y: mixN(parts.map(([e, w]) => [e.y, w])),
    len: mixN(parts.map(([e, w]) => [e.len, w])),
    a: mixN(parts.map(([e, w]) => [e.a, w])),
    bend: mixN(parts.map(([e, w]) => [e.bend, w])),
    w: mixN(parts.map(([e, w]) => [e.w, w]))
  }
}
function mixPose(parts: [FrontPose, number][]): FrontPose {
  const live = parts.filter(([, w]) => w > 1e-4)
  const use = live.length ? live : [parts[0]]
  return {
    base: mixBlob(use.map(([p, w]) => [p.base, w])),
    chest: mixBlob(use.map(([p, w]) => [p.chest, w])),
    head: [mixN(use.map(([p, w]) => [p.head[0], w])), mixN(use.map(([p, w]) => [p.head[1], w]))],
    earL: mixEar(use.map(([p, w]) => [p.earL, w])),
    earR: mixEar(use.map(([p, w]) => [p.earR, w])),
    footL: mixBlob(use.map(([p, w]) => [p.footL, w])),
    footR: mixBlob(use.map(([p, w]) => [p.footR, w])),
    pawL: mixBlob(use.map(([p, w]) => [p.pawL, w])),
    pawR: mixBlob(use.map(([p, w]) => [p.pawR, w])),
    tail: [0, 1, 2].map((i) => mixN(use.map(([p, w]) => [p.tail[i], w]))) as [number, number, number],
    legs: mixN(use.map(([p, w]) => [p.legs, w])),
    turn: mixN(use.map(([p, w]) => [p.turn ?? 0, w])),
    rot: mixN(use.map(([p, w]) => [p.rot ?? 0, w]))
  }
}

// ---------- вид сбоку ----------
// Кролик сбоку — векторная анимация, обведённая по раскадровке прыжка
// (данные — bunnyHop.ts). Каждый кадр — контур силуэта и белые детали, поэтому
// фигура, мордочка и ритм прыжка — ровно как на раскадровке (без «желе»; раньше кролик сбоку собирался из
// овалов, и подгонка их уродовала). Цикл 17 кадров по 1/30 с, без шва. Смотрит вправо.

type Loop = [number, number][]
interface HopFrame {
  /** Силуэт: один контур из одинакового числа точек (кадры плавно перетекают друг в друга). */
  S: Loop
  W: Loop[]
  /** Какие белые детали — линии (в ушах: рисуются тонким штрихом, как анфас), остальные — заливка. */
  lines: boolean[]
  /** Для каждой точки белых деталей: ближайшая точка силуэта и смещение от неё (детали едут с телом). */
  anchors: [number, number, number][][]
  /** Дужки закрытых глаз (начало, вершина, конец) — есть у «лёг спать». */
  E: Loop[]
  /** Сдвиг нумерации точек к следующему кадру — чтобы точка перетекала в «ту же» точку. */
  shift: number
  /** Низ силуэта (насколько оторвался от земли), верх и правый край — для тени и частиц. */
  bottom: number
  top: number
  right: number
}

/** Куски видео сняты с разным наездом камеры — приводим к одному масштабу (от точки на земле) и сдвигаем. */
function placeFrames(frames: HopFrame[], scale: number, dx: number): HopFrame[] {
  const at = ([x, y]: [number, number]): [number, number] => [C + (x - C) * scale + dx, G + (y - G) * scale]
  return frames.map((f) => ({
    ...f,
    S: f.S.map(at),
    W: f.W.map((l) => l.map(at)),
    E: f.E.map((l) => l.map(at)),
    anchors: f.anchors.map((l) => l.map(([i, ax, ay]): [number, number, number] => [i, ax * scale, ay * scale])),
    bottom: G + (f.bottom - G) * scale,
    top: G + (f.top - G) * scale,
    right: C + (f.right - C) * scale + dx
  }))
}

/** Центр силуэта по x — чтобы состыковать куски видео. */
function centerX(f: HopFrame): number {
  return f.S.reduce((s, p) => s + p[0], 0) / f.S.length
}

/** earLines — линии в ушах осевой линией (для прыжков: как тонкие линии анфас); «лёг» — как в видео. */
function decodeFrames(data: string, earLines = true): HopFrame[] {
  const loop = (str: string): Loop => {
    const n = str.split(' ').map((v) => parseInt(v, 36))
    const pts: Loop = []
    let x = 0
    let y = 0
    for (let i = 0; i < n.length; i += 2) {
      x += n[i]
      y += n[i + 1]
      pts.push([x / 10, y / 10])
    }
    return pts
  }
  return data.split('#').map((f): HopFrame => {
    const [sil, white, eyes] = f.split('~')
    const E = eyes ? eyes.split('|').map(loop) : []
    const S = loop(sil.split('|')[0])
    const top = Math.min(...S.map((p) => p[1]))
    // линии в ушах — осевой линией (тонкий ровный штрих, как анфас); крапинки шума у ушей — прочь
    const W: Loop[] = []
    const lines: boolean[] = []
    for (const l of white ? white.split('|').map(loop) : []) {
      const kind = earLoopKind(l, top)
      if (kind === 'speck') continue
      const mid = kind === 'ear' && earLines ? skeletonLine(l) : null
      W.push(mid ?? l)
      lines.push(!!mid)
    }
    // ближайшая точка контура (простым циклом — кадров «лёг» много)
    const K = S.length
    const anchors = W.map((l) =>
      l.map(([x, y]): [number, number, number] => {
        let best = 0
        let bestD = Infinity
        for (let i = 0; i < K; i++) {
          const dx = S[i][0] - x
          const dy = S[i][1] - y
          const d = dx * dx + dy * dy
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        return [best, x - S[best][0], y - S[best][1]]
      })
    )
    return {
      S,
      W,
      lines,
      anchors,
      E,
      shift: 0,
      bottom: Math.max(...S.map((p) => p[1])),
      top,
      right: Math.max(...S.map((p) => p[0]))
    }
  })
}

/** Сдвиг нумерации точек от кадра a к b с наименьшим расхождением (точка перетекает в «ту же»). */
function alignShift(a: Loop, b: Loop): number {
  const K = a.length
  let best = 0
  let bestD = Infinity
  for (let sh = 0; sh < K; sh++) {
    let d = 0
    for (let k = 0; k < K; k += 3) {
      const q = b[(k + sh) % K]
      d += (a[k][0] - q[0]) ** 2 + (a[k][1] - q[1]) ** 2
    }
    if (d < bestD) {
      bestD = d
      best = sh
    }
  }
  return best
}

// Два куска видео в одном масштабе (под наш анфас; камера в видео наезжает и отъезжает):
//   «присел» (3,6–4,65 с: боком из столбика в присед) → прыжок (цикл). Кусок заканчивается первым
//   кадром следующего — переход плавный. Поворот анфас ↔ боком — «в прыжке» (см. draw).
const SETTLE_RAW = placeFrames(decodeFrames(BUNNY_SETTLE_DATA), 0.95, 0)
const SETTLE = placeFrames(SETTLE_RAW, 1, C - centerX(SETTLE_RAW[0]))
/** Кадр присяда в цикле прыжка — им заканчивается «присел» и с него начинается прыжок. */
const HOP_STAND = 11
/** Первый кадр на земле после полёта (кадры HOP_LAND…13 — на земле, остальные — в воздухе). */
const HOP_LAND = 4
const HOP_RAW = placeFrames(decodeFrames(BUNNY_HOP_DATA), 0.855, 0)
/** Прыжок — цикл: последний кадр перетекает в первый. */
const HOP_FRAMES: HopFrame[] = placeFrames(HOP_RAW, 1, centerX(SETTLE[SETTLE.length - 1]) - centerX(HOP_RAW[HOP_STAND]))
HOP_FRAMES.forEach((f, i) => (f.shift = alignShift(f.S, HOP_FRAMES[(i + 1) % HOP_FRAMES.length].S)))

/** Последовательность кадров (не цикл): каждый перетекает в следующий. */

function sequence(frames: HopFrame[]): HopFrame[] {
  return frames.map((f, i) => ({ ...f, shift: i < frames.length - 1 ? alignShift(f.S, frames[i + 1].S) : 0 }))
}
/** Из столбика боком — в присед, заканчивается кадром присяда прыжка. */
const SETTLE_FRAMES = sequence([...SETTLE, HOP_FRAMES[HOP_STAND]])
/**
 * Остановился: после приземления (кадры HOP_LAND…) — до кадра, где он выпрямился (по позе почти «столбик»),
 * а не до присяда HOP_STAND: кадры за ним — уже пригибается, чтобы оттолкнуться («пытается отпрыгнуть»).
 */
const HOP_REST = 8
/** Из позы «приземлился» — в столбик (поворачиваясь к нам): позы близкие, перетекает без рывка. */
const REST_FRAMES = sequence([HOP_FRAMES[HOP_REST], SETTLE_FRAMES[0]])

/** Кадр последовательности: p = 0 — первый, 1 — последний. */
function seqFrameAt(frames: HopFrame[], p: number): HopFrame {
  const f = clamp(p, 0, 1) * (frames.length - 1)
  const i = Math.min(frames.length - 2, Math.floor(f))
  return mixFrames(frames[i], frames[i + 1], f - i)
}

/**
 * Кадр анимации в фазе u (0…1): силуэт плавно перетекает между соседними кадрами видео (окно рисуется
 * 60 раз в секунду, а в видео 30 кадров — иначе прыжок дёргался бы), белые детали едут вместе с телом.
 */
function hopFrameAt(u: number): HopFrame {
  const N = HOP_FRAMES.length
  const f = (((u % 1) + 1) % 1) * N
  return mixFrames(HOP_FRAMES[Math.floor(f) % N], HOP_FRAMES[(Math.floor(f) + 1) % N], f - Math.floor(f))
}

/** Смесь соседних кадров a → b (a.shift — выравнивание точек к b). whitesFromB — белые детали всегда от b. */
function mixFrames(a: HopFrame, b: HopFrame, k: number, whitesFromB = false): HopFrame {
  const K = a.S.length
  const S: Loop = a.S.map((p, j) => {
    const q = b.S[(j + a.shift) % K]
    return [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]
  })
  // белые детали ближайшего кадра — от их точек силуэта в смешанном контуре
  const fromA = k < 0.5 && !whitesFromB
  const near = fromA ? a : b
  const index = (j: number): number => (fromA ? j : (j - a.shift + K) % K)
  const whitesOf = (f: HopFrame, idx: (j: number) => number): Loop[] =>
    f.W.map((l, li) => l.map((_, pi): [number, number] => {
      const [j, dx, dy] = f.anchors[li][pi]
      const p = S[idx(j)]
      return [p[0] + dx, p[1] + dy]
    }))
  const W = whitesOf(near, index)
  const E = a.E.length === b.E.length ? a.E.map((l, i) => l.map((p, pi): [number, number] => [lerp(p[0], b.E[i][pi][0], k), lerp(p[1], b.E[i][pi][1], k)])) : b.E.length ? b.E : a.E
  const out: HopFrame = { S, W, lines: near.lines, anchors: [], E, shift: 0, bottom: lerp(a.bottom, b.bottom, k), top: lerp(a.top, b.top, k), right: lerp(a.right, b.right, k) }
  return out
}

/** Поворот анфас ↔ боком, мс — быстрый, «в прыжке»: почти незаметен (main трогает окно раньше). */
const BUNNY_TURN_MS = 300

/** Белая деталь сбоку: линия в ухе (крупная, у верха силуэта), крапинка у ушей (шум обводки) или прочее. */
function earLoopKind(l: Loop, top: number): 'ear' | 'speck' | 'other' {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of l) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (y0 >= top + 50) return 'other'
  const size = Math.max(x1 - x0, y1 - y0)
  return size > 20 ? 'ear' : size < 4 && y1 < top + 45 ? 'speck' : 'other'
}

/**
 * Осевая линия белой линии в ухе (в видео она — залитая полоса неровной толщины, с клином-отростком у
 * кончика): растр полосы → утоньшение до скелета в 1 пиксель → самый длинный путь по нему (короткие
 * отростки отпадают) → сглаживание. Считается один раз при загрузке. null — если не вышло.
 */
function skeletonLine(l: Loop): Loop | null {
  const R = 2
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of l) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const w = Math.ceil((x1 - x0) * R) + 4
  const h = Math.ceil((y1 - y0) * R) + 4
  const px = (x: number): number => (x - x0) * R + 2
  const py = (y: number): number => (y - y0) * R + 2
  const m = new Uint8Array(w * h)
  // заливка многоугольника построчно (чётно-нечётно)
  for (let row = 0; row < h; row++) {
    const yc = row + 0.5
    const xs: number[] = []
    for (let i = 0; i < l.length; i++) {
      const ax = px(l[i][0]), ay = py(l[i][1])
      const bx = px(l[(i + 1) % l.length][0]), by = py(l[(i + 1) % l.length][1])
      if ((ay <= yc) !== (by <= yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let col = Math.max(0, Math.ceil(xs[k] - 0.5)); col <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); col++) m[row * w + col] = 1
    }
  }
  // утоньшение Чжана — Суня (по краям растра — поля по 2 px, соседей проверять не нужно)
  let fg: number[] = []
  for (let i = 0; i < w * h; i++) if (m[i]) fg.push(i)
  const kill: number[] = []
  for (let changed = true; changed; ) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      kill.length = 0
      for (const i of fg) {
        const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1]
        const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1]
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (b < 2 || b > 6) continue
        const a = (+(!p2 && !!p3)) + (+(!p3 && !!p4)) + (+(!p4 && !!p5)) + (+(!p5 && !!p6)) + (+(!p6 && !!p7)) + (+(!p7 && !!p8)) + (+(!p8 && !!p9)) + (+(!p9 && !!p2))
        if (a !== 1) continue
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue
        kill.push(i)
      }
      for (const i of kill) m[i] = 0
      if (kill.length) {
        changed = true
        fg = fg.filter((i) => m[i])
      }
    }
  }
  // самый длинный путь по скелету: обход в ширину от точки → самая дальняя → от неё снова (в каждом куске)
  const OFF = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]
  const prev = new Int32Array(w * h)
  const bfs = (start: number): number => {
    for (const i of fg) prev[i] = -2
    prev[start] = -1
    const q = [start]
    for (let k = 0; k < q.length; k++) {
      for (const o of OFF) {
        const j = q[k] + o
        if (m[j] && prev[j] === -2) {
          prev[j] = q[k]
          q.push(j)
        }
      }
    }
    return q[q.length - 1]
  }
  let longest: number[] = []
  const seen = new Uint8Array(w * h)
  for (const i of fg) {
    if (seen[i]) continue
    const far = bfs(i)
    for (const j of fg) if (prev[j] !== -2) seen[j] = 1
    const end = bfs(far)
    const path: number[] = []
    for (let j = end; j !== -1; j = prev[j]) path.push(j)
    if (path.length > longest.length) longest = path
  }
  if (longest.length < 6) return null
  // сглаживание и прореживание; обратно в координаты сцены
  const pts = longest.map((i): [number, number] => [(i % w) + 0.5, ((i / w) | 0) + 0.5])
  const sm = pts.map((_, i): [number, number] => {
    const k = Math.min(4, i, pts.length - 1 - i)
    let sx = 0, sy = 0
    for (let j = i - k; j <= i + k; j++) {
      sx += pts[j][0]
      sy += pts[j][1]
    }
    return [sx / (2 * k + 1), sy / (2 * k + 1)]
  })
  const out: Loop = []
  for (let i = 0; i < sm.length; i += 3) out.push([(sm[i][0] - 2) / R + x0, (sm[i][1] - 2) / R + y0])
  const last = sm[sm.length - 1]
  out.push([(last[0] - 2) / R + x0, (last[1] - 2) / R + y0])
  return out
}

function fillLoops(c: CanvasRenderingContext2D, loops: Loop[]): void {
  if (!loops.length) return
  c.beginPath()
  for (const l of loops) {
    c.moveTo(l[0][0], l[0][1])
    for (let i = 1; i < l.length; i++) c.lineTo(l[i][0], l[i][1])
    c.closePath()
  }
  c.fill()
}

// ---------- примитивы ----------

const ell = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void => {
  if (rx <= 0.05 || ry <= 0.05) return
  g.beginPath()
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  g.fill()
}
const blob = (g: CanvasRenderingContext2D, b: Blob): void => ell(g, b.x, b.y, b.rx, b.ry, b.r ?? 0)

/** Ухо от основания (x,y) длиной len под углом a — форма подогнана по референсу. */
function earShape(g: CanvasRenderingContext2D, e: Ear): void {
  earPath(g, e)
  g.fill()
}

/**
 * Нижний край и кончик уха (открытая линия, без корня) — ухо лежит на спине, и его край виден на теле.
 * Тот же контур, что у earShape: кусок первой кривой у кончика и вторая кривая почти до корня.
 */
function earEdgePath(g: CanvasRenderingContext2D, e: Ear, tail?: number[][], tailK = 1): void {
  const { len, bend, w } = e
  const bez = (p: number[][], t: number): number[] => {
    const u = 1 - t
    return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k])
  }
  const b1 = [[-w * 0.739, 12], [-w * 1.79, -len * 0.07], [-w * 0.941 + bend * 0.5, -len * 1.02], [bend, -len]]
  const b2 = [[bend, -len], [w * 0.941 + bend * 0.5, -len * 1.02], [w * 1.79, -len * 0.07], [w * 0.739, 12]]
  const pts: number[][] = []
  for (let t = 0.62; t <= 1.001; t += 0.04) pts.push(bez(b1, t))
  for (let t = 0.05; t <= (tail ? 0.66 : 0.93); t += 0.04) pts.push(bez(b2, t))
  const cos = Math.cos(e.a)
  const sin = Math.sin(e.a)
  g.beginPath()
  let lx = 0
  let ly = 0
  pts.forEach(([x, y], i) => {
    lx = e.x + x * cos - y * sin
    ly = e.y + x * sin + y * cos
    if (i) g.lineTo(lx, ly)
    else g.moveTo(lx, ly)
  })
  // продолжение той же линией (затылок) — одним штрихом, без нахлёста; появляясь, вытягивается от уха
  if (tail && tailK > 0.01) {
    // дальше вниз волнами (затылок, потом щека): [контрольная, конец] на каждую волну; появляясь —
    // вытягивается от уха
    for (const [cx, cy, x2, y2] of tail) {
      g.quadraticCurveTo(lerp(lx, cx, tailK), lerp(ly, cy, tailK), lerp(lx, x2, tailK), lerp(ly, y2, tailK))
    }
  }
}

/** Контур уха (путь, без заливки) — в координатах сцены. */
function earPath(g: CanvasRenderingContext2D, e: Ear, newPath = true): void {
  const { len, bend, w } = e
  g.save()
  g.translate(e.x, e.y)
  g.rotate(e.a)
  if (newPath) g.beginPath()
  // основание — глубже в голове и выходит из неё вверх, а не вбок: иначе у высокого уха снаружи на стыке
  // с головой торчал треугольный выступ
  g.moveTo(-w * 0.739, 12)
  g.bezierCurveTo(-w * 1.79, -len * 0.07, -w * 0.941 + bend * 0.5, -len * 1.02, bend, -len)
  g.bezierCurveTo(w * 0.941 + bend * 0.5, -len * 1.02, w * 1.79, -len * 0.07, w * 0.739, 12)
  g.closePath()
  g.restore()
}

function mixLine(a: EarLine, b: EarLine, k: number): EarLine {
  const out = { ...a }
  for (const key of Object.keys(a) as (keyof EarLine)[]) out[key] = lerp(a[key], b[key], k)
  return out
}

/** Белая линия внутри уха (как на референсе). */
function earLine(g: CanvasRenderingContext2D, e: Ear, q: EarLine, k: number): void {
  const { len, bend, w } = e
  g.save()
  g.translate(e.x, e.y)
  g.rotate(e.a)
  g.lineWidth = q.lw * k
  g.beginPath()
  g.moveTo(-w * q.bw, -len * q.y0)
  g.bezierCurveTo(-w * q.belly, -len * q.bellyH, -w * q.tip + bend * 0.5, -len * q.y1 * 1.02, bend * q.bk, -len * q.y1)
  g.bezierCurveTo(w * q.tip + bend * 0.5, -len * q.y1 * 1.02, w * q.belly * q.rk, -len * q.bellyH, w * q.bw * q.rk, -len * q.y0r)
  g.stroke()
  g.restore()
}

/** Хвостик — ровный круглый помпон (как в видео; из нескольких кружков он выходил бугристым). */
function pompom(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (r <= 0.3) return
  ell(g, x, y, r, r)
}

function capsule(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, w: number): void {
  g.lineWidth = w
  g.beginPath()
  g.moveTo(ax, ay)
  g.lineTo(bx, by)
  g.stroke()
}

/** Голова анфас (по референсу): круглая, внизу пухлые щёчки. turn — поворот к курсору. */
/** slim (0…1) — лёг: щёки меньше и ближе к голове (иначе морда лёжа выходит «щекастой», с буграми по бокам). */
function headFront(g: CanvasRenderingContext2D, x: number, y: number, turn: number, slim = 0): void {
  const w = 1 - Math.abs(turn) * 0.06
  ell(g, x + turn * 3, y, 37 * w, 39)
  // лёжа голова повёрнута: дальняя щека (по ту сторону поворота) уходит за голову, ближняя — как была
  for (const side of [-1, 1]) {
    const k = slim * (Math.sign(turn) === -side ? 1 : 0.15)
    const cx = 22.5 - k * 8
    const cr = 20 - k * 6
    ell(g, x + side * cx * w + turn * 5, y + 15.8 - k * 2, cr * w, 20.25 - k * 5)
  }
}

/** Пробежка — во столько раз быстрее прогулки (как RUN_MULT в main). */
const BUNNY_RUN_MULT = 3.2
/** Разгон пробежки кролика, с (как BUNNY_ACCEL_MS в main). */
const BUNNY_RUN_ACC = 0.22

/** Путь за время τ с плавным разгоном за A (скорость v). */
function runDist(v: number, tau: number, A: number): number {
  if (tau <= 0) return 0
  if (tau < A) {
    const s = tau / A
    return v * A * (s * s * s - (s * s * s * s) / 2)
  }
  return v * (tau - A / 2)
}

/**
 * Убегает за край и возвращается — как в «пробежаться»: со скоростью пробежки v (единицы сцены/с), с её
 * коротким разгоном; обратно — прыжками ровно до места (peekReturn). Остальное (поворот, выглядывание
 * головой) — сценарий Уголька.
 */
function bunnyPeek(p: PeekState, t: number, edgeX: number, fromWalk: boolean, v: number): PeekState {
  const out = edgeX + 14
  if (p.view !== 'side') return p
  if (t < 2.6) {
    // из прогулки (уже бежал к краю) — без разгона; с места — после поворота боком
    const ox = fromWalk ? v * t : runDist(v, t - 0.36, BUNNY_RUN_ACC)
    return { ...p, ox: Math.min(out, ox) }
  }
  if (t >= 8.4) {
    // обратно — бегом из-за края, ровно до места (см. peekReturn)
    const { start, rate, uLand, stride } = peekReturn(edgeX, v)
    return { ...p, ox: Math.max(0, out - stride * clamp((t - start) * rate, 0, uLand)) }
  }
  return p
}

/** Сколько длится выглядывание, с (peek: hold(10.3) в scripts/generate-characters.mjs). */
const PEEK_LEN = 10.3
/** Первый кадр полёта в цикле прыжка (полёт — кадры HOP_AIR…16 и 0…HOP_LAND−1, остальные — на земле). */
const HOP_AIR = 14
/**
 * Возвращение из-за края — прыжками ровно до места: путь делится на целое число прыжков (шаг — почти как у
 * пробежки), бежит в темпе пробежки с постоянной скоростью и встаёт ровно в момент последнего приземления —
 * без торможения в полёте («завис в воздухе») и без лишнего мелкого прыжка. Выбегает так, чтобы к концу
 * выглядывания уже присесть, — и сразу поворачивается к нам. u — прыжки от первого отрыва.
 */
function peekReturn(edgeX: number, v: number): { start: number; rate: number; uLand: number; stride: number } {
  const out = edgeX + 14
  const N = HOP_FRAMES.length
  const rate = (BUNNY_HOP_FPS / N) * 1.6
  const air = (N - HOP_AIR + HOP_LAND) / N
  const n = Math.max(1, Math.round(out / (v / rate) - air + 1))
  const uLand = n - 1 + air
  // после приземления — выпрямиться (кадры HOP_LAND…HOP_REST, в полтора раза быстрее)
  const settle = (HOP_REST - HOP_LAND) / N / 1.5
  const start = Math.max(8.4, PEEK_LEN - 0.08 - (uLand + settle) / rate)
  return { start, rate, uLand, stride: out / uLand }
}

export class BunnyRig extends BlackCatRig {
  /** Поворот анфас ↔ боком — быстрый, в прыжке (у Уголька 0,62 с). */
  protected turnMs = BUNNY_TURN_MS
  /** Стекло от дыхания не запотевает: на крупной чёрной морде пятно светилось между глаз, как глюк. */
  protected fogY = null
  /** Выглядывание у кролика — по своему расписанию (бегом, см. bunnyPeek), время не пересчитывается. */
  protected peekTime(t: number): number {
    return t
  }

  /** «Плюх» у кролика свой (по часам укладывания), кошачий не нужен. */
  protected sleepPlop(): number {
    return 0
  }
  /** «z» — чёрные со светлой каймой, как сам кролик (на раскадровке — чёрные), небольшие. */
  protected zLook = { fill: INK, rim: 'rgba(255,255,255,0.6)', size: 0.8, grow: 0.5, vx: 12, vy: -19 }

  /**
   * Сон — по раскадровке, но нашим кроликом, как у Уголька: после зевка
   * опускается «буханкой» (уши ещё стоят) → закрывает глаза → уши по очереди ложатся на спину → спит.
   * Всё по очереди, а не разом (разом выглядело как желе). Проснулся — открыл глаза, поднял уши, сел.
   * Взяли в руку — сразу висит (как у Уголька).
   */
  private updateSleep(input: RigInput, now: number): void {
    const dt = this.dt
    // часы сна: засыпая — вперёд; проснулся — те же позы назад, быстрее; взяли в руку — сразу висит
    const asleep = input.animation === 'sleep' && input.mode === 'idle' && !this.side
    if (input.mode === 'drag') this.sleepClock = 0
    else if (asleep) {
      // после зевоты — сразу ложится (сидячую паузу в начале пропускает) и в том же темпе, что встаёт
      const start = LIE_HOLDS.length && LIE_HOLDS[0][0] === LIE_KEYS[0][0] ? LIE_HOLDS[0][1] : 0
      // сидячую часть (уши отгибаются назад) — пролетает: зевнул — и сразу валится спать
      const c0 = Math.max(this.sleepClock, start)
      this.sleepClock = Math.min(SLEEP_END, c0 + dt * (c0 < FALL_T ? FAST_EARS : c0 < LIE_LAST_T ? FALL_SPEED : WAKE_SPEED))
    }
    else if (this.sleepClock > 0) {
      // проснулся — те же позы назад, но без пауз: лёг → присел → подался вперёд → сел
      let w = Math.min(this.sleepClock, LIE_LAST_T)
      for (const [a, b] of LIE_HOLDS) if (w > a && w < b) w = a
      w -= dt * WAKE_SPEED
      this.sleepClock = w <= LIE_KEYS[0][0] ? 0 : w
    }
    // проснулся — «z» быстро тают (не висят над уже сидящим кроликом)
    if (!asleep) for (const p of this.particles) if (p.kind === 'z' && p.fadeAt === undefined) p.fadeAt = now
    const c = this.sleepClock
    // засыпая — глаза закрыты сразу после зевоты (не открываются снова); просыпаясь — открываются по ходу
    this.eyesShut = asleep && c > 0 ? 1 : phase(c, EYES_HALF) * 0.45 + phase(c, EYES_SHUT) * 0.55
    // насколько уже лёг (подушечки стоп и линии бёдер видны, пока сидит и подался вперёд; присел — спрятались)
    this.wLoaf = phase(c, [1.85, LIE_LAST_T])
    // 0 — кукла; 0.5 — силуэт куклы, линии и лицо рисунка; 1 — весь рисунок
    this.artK = this.wDangle >= 0.5 ? 0 : c >= ART_SWAP_T ? 1 : c >= ART_LINES_T ? 0.5 : 0
    this.sleepW = c > 0 ? 1 - this.wDangle : 0
    // своя поза сна вместо кошачьей (у кота после сна — разворот боком и потягивание)
    this.tailWrap = 0
    this.waking = false
    this.wSit = (1 - this.sleepW) * (1 - this.wDangle)
  }

  /** Боком кролик всегда появляется в приседе (из него прыгает) — не столбиком, как кот. */
  protected startTurn(toSide: boolean, now: number, standing = false): void {
    super.startTurn(toSide, now, standing)
    if (toSide) {
      this.sit = this.sitK = 0
      // приземлится в присед — из него и оттолкнётся
      this.hopU = HOP_STAND / HOP_FRAMES.length
    }
  }
  draw(ctx: CanvasRenderingContext2D, now: number, input: RigInput): void {
    this.update(now, input)
    this.updateSleep(input, now)
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    const scale = Math.min(width / W, height / H)
    ctx.translate((width - W * scale) / 2, height - H * scale)
    ctx.scale(scale, scale)
    if (this.shownFlip) {
      ctx.translate(W, 0)
      ctx.scale(-1, 1)
    }

    const anim = input.animation
    const t = (now - this.animStart) / 1000
    let turnP = clamp((now - this.turnAt) / this.turnMs, 0, 1)
    // Выглядывание из-за края — тот же сценарий, что у Уголька, но убегает за край и возвращается кролик
    // как в «пробежаться»: со скоростью пробежки и в её темпе прыжков (к краю main тоже ведёт его бегом).
    const edgeX = W + (width / scale - W) / 2
    const base = input.baseSpeed ?? 33
    const toScene = input.view.height > 0 ? H / input.view.height : 1
    const peek: PeekState | null = anim === 'peek' ? bunnyPeek(peekState(t, edgeX, this.peekFromWalk), t, edgeX, this.peekFromWalk, base * BUNNY_RUN_MULT * toScene) : null
    const peekV = peek?.view === 'side' && this.peekView === 'side' ? Math.abs(peek.ox - this.peekOx) / Math.max(this.dt, 1e-3) : 0
    if (peek?.view === 'side') this.gait = (this.gait + Math.abs(peek.ox - this.peekOx) / 99) % 1
    this.peekOx = peek?.ox ?? 0
    this.peekView = peek?.view ?? null
    // Фаза прыжка (0…1) — по времени, в темпе видео (бегом быстрее), а не от скорости окна: иначе на
    // разгоне и торможении окна прыжок шёл как в замедленной съёмке (кролик ехал в присяде). Прыгает,
    // как только развернулся боком (приземлился сразу в присед); остановился — доигрывает до присяда.
    // Конец прогулки: main сообщает, когда окно встанет (stopAt), — кролик чуть подгоняет темп последних
    // прыжков, чтобы приземлиться ровно тогда: без лишнего мелкого прыжка и без «езды» в присяде.
    const N = HOP_FRAMES.length

    const rate = (BUNNY_HOP_FPS / N) * lerp(1, 1.6, anim === 'peek' ? 1 : this.runBlend)
    let pace = 1
    let braking = false
    // до остановки (с): прогулка — от main; возвращение из-за края — по своему расчёту
    const left = input.mode === 'walk' && input.stopAt !== undefined ? (input.stopAt - Date.now()) / 1000 : null
    if (left !== null) {
      // до ближайшего приземления (кадр HOP_LAND), в долях цикла; на земле — через следующий прыжок
      const f = this.hopU * N
      const onGround = f >= HOP_LAND - 0.5 && f < HOP_AIR - 0.5
      const toLand = (((HOP_LAND - f) / N) % 1 + 1) % 1
      const need = left * rate
      // сколько ещё прыжков: темп ближе к обычному, ускорять — чуть-чуть (быстрый мелкий прыжок в конце
      // выглядит лишним: лучше приземлиться чуть раньше и встать)
      const base0 = Math.max(0, Math.floor(need - toLand))
      const options = [base0, base0 + 1].map((h) => (toLand + h) / Math.max(need, 1e-3))
      pace = options.reduce((a, b) => (Math.abs(b - 1) < Math.abs(a - 1) ? b : a))
      if (left <= 0 || pace > (onGround ? 1.15 : 1.5)) braking = true
      pace = clamp(pace, 0.7, 1.5)
      // заранее не подгоняет: только последние пару прыжков
      if (need > 2.5) pace = 1
    }
    // возвращение из-за края — прыжки по своему расписанию (peekReturn), ровно до места
    const ret = anim === 'peek' && peek?.view === 'side' && t >= 8.4 ? peekReturn(edgeX, base * BUNNY_RUN_MULT * toScene) : null
    const retU = ret ? (t - ret.start) * ret.rate : -1
    const hopNow =
      (input.mode === 'walk' && this.side && this.sit < 0.02 && now - this.turnAt >= this.turnMs && !braking) ||
      (anim === 'peek' && !ret && peekV > base * toScene * 0.3)
    const step = this.dt * rate * (hopNow ? pace : 1)
    // не прыгает: вот-вот поскачет — ждёт в приседе (HOP_STAND); остановился — выпрямившись (HOP_REST)
    const restAt = input.mode === 'walk' && !braking ? HOP_STAND : HOP_REST
    const atRest = (): boolean => Math.round(this.hopU * N) % N === restAt
    if (ret && retU >= 0 && retU < ret.uLand) this.hopU = (HOP_AIR / N + retU) % 1
    else if (hopNow) this.hopU = (this.hopU + step) % 1
    else if (!atRest()) {
      const f = this.hopU * N
      const ground = f >= HOP_LAND - 0.5 && f <= HOP_AIR - 0.5
      // в воздухе — дальше до приземления; на земле — к своей позе (вперёд или назад), чуть быстрее
      const target = restAt / N
      if (!ground || f < restAt) this.hopU = (this.hopU + step * 1.5) % 1
      else this.hopU = Math.max(target, this.hopU - step * 1.5)
      if (ground && Math.abs(this.hopU * N - restAt) < 0.5) this.hopU = target
      if (this.side) this.sit = this.sitK = 0
    }
    this.hopActive = hopNow || !atRest()
    // приземлился и выпрямился — сразу поворачивается к нам (привстаёт в столбик и поворачивается, без
    // подскока; не сидит боком — это лишние полсекунды «задержки» после последнего прыжка)
    if (this.side && input.mode === 'idle' && anim !== 'peek' && !this.waking && !this.hopActive && now - this.turnAt >= this.turnMs) {
      this.sit = this.sitK = 0
      this.startTurn(false, now)
      turnP = 0
    }
    // играет ушами: время от времени меняет, какое ухо выше (не во сне)
    if (now > this.nextEarPlay) {
      // во сне (и пока встаёт) уши не играют: силуэт анфаса снят в начале сна — из него ложится и в него встаёт
      if (anim !== 'sleep' && this.sleepClock === 0 && Math.random() < 0.7) this.earSwapTo = 1 - this.earSwapTo
      this.nextEarPlay = now + 2500 + Math.random() * 5500
    }
    // зевает перед сном и засыпает — уши плавно встают как в первом кадре видео (высокое — слева): из этой
    // позы он и ложится
    if (anim === 'yawn' || anim === 'sleep') this.earSwapTo = 0
    this.earSwap = approach(this.earSwap, this.earSwapTo, this.dt, anim === 'sleep' ? 6 : 4)
    this.busy =
      input.mode !== 'idle' ||
      anim === 'music' ||
      this.particles.length > 0 ||
      this.walkBlend > 0.02 ||
      turnP < 1 ||
      (this.side && this.sit < 1) ||
      (this.phones > 0.005 && this.phones < 0.995) ||
      Math.abs(this.earSwap - this.earSwapTo) > 0.01 ||
      (this.sleepClock > 0 && this.sleepClock < SLEEP_END) ||
      (anim === 'sleep' && this.sleepT < 4) ||
      this.waking ||
      Math.abs(this.wSit - (anim === 'sleep' ? 0 : 1)) > 0.02


    // царапает экран: встаёт на задние лапы и тянется к «стеклу» (как Уголёк)
    if (anim === 'scratch') {
      this.scratchT = t
      this.pawsK = scratchRaise(t)
    } else this.pawsK = approach(this.pawsK, 0, this.dt, 14)
    const pawsUp = this.pawsK < 0.005 ? 0 : this.pawsK
    const scratchT = this.scratchT
    // сон: поза тела по ключевым позам; уши — мягкие: догоняют позу на пружине (чуть запаздывают, кончик
    // гнётся назад по ходу движения, в конце мягко «долетают»), а не поворачиваются жёсткой пластинкой
    const keyPose = lieKeyPose(this.sleepClock)
    const sleepPose: FrontPose = { ...keyPose, earL: this.softEar(0, keyPose.earL, keyPose.head), earR: this.softEar(1, keyPose.earR, keyPose.head) }
    const pose = mixPose([
      [SIT, this.wSit * (1 - pawsUp)],
      [sleepPose, this.sleepW],
      [STAND, this.wSit * pawsUp],
      [DANGLE, this.wDangle]
    ])

    // мультяшные смещения — как у Уголька
    let bodyDY = 0
    let squashX = 1
    let squashY = 1
    // (кошачье «голова опускается в глубоком сне» — не нужно: голова кролика уже лежит на лапках)
    let headDY = 0
    // ложится: голова поворачивается и наклоняется, как на раскадровке
    let headRot = this.tilt + this.sleepW * (keyPose.rot ?? 0)
    if (this.sleepW > 0) {
      this.turn = lerp(this.turn, keyPose.turn ?? 0, this.sleepW)
      const look = phase(this.sleepClock, LOOK_DOWN) * this.sleepW
      this.lookX = lerp(this.lookX, -0.1, look)
      this.lookY = lerp(this.lookY, 0.7, look)
      // «плюх»: лёг — тело чуть сплющилось и мягко расправилось (в этот момент кукла становится рисунком)
      const u = (this.sleepClock - PLOP[0]) / PLOP[1]
      if (u > 0 && u < 1) {
        const k = Math.sin(u * Math.PI) * (1 - u) ** 0.6
        squashY *= 1 - 0.1 * k
        squashX *= 1 + 0.05 * k
      }
    }
    let earSpread = 0
    if (anim === 'laugh') {
      const p = Math.min(1, t / 0.9)
      const crouch = p < 0.15 ? Math.sin((p / 0.15) * Math.PI) : 0
      const air = p >= 0.15 && p < 0.6 ? Math.sin(((p - 0.15) / 0.45) * Math.PI) : 0
      const land = p >= 0.6 && p < 0.8 ? Math.sin(((p - 0.6) / 0.2) * Math.PI) : 0
      // уши длинные — прыжок пониже, чтобы кончики не уходили за верх окна
      bodyDY = crouch * 6 - air * 10 + land * 4
      squashY = 1 - crouch * 0.12 + air * 0.02 - land * 0.1
      squashX = 1 + crouch * 0.1 - air * 0.05 + land * 0.1
      earSpread = air * 0.25
    }
    if (anim === 'music') {
      const beat = (t * 112) / 60
      const phase = beat - Math.floor(beat)
      const nod = (phase < 0.25 ? easeInOut(phase / 0.25) : 1 - easeInOut((phase - 0.25) / 0.75)) * smooth(clamp((this.phones - 0.6) / 0.4, 0, 1))
      headDY += nod * 5
      headRot += nod * 0.06
      bodyDY += nod * 1.5
    }
    if (anim === 'dizzy') headRot += Math.sin(t * 9) * 0.18 * Math.max(0, 1 - t / 1.6)
    if (anim === 'yawn') {
      const p = Math.min(1, t / 1.6)
      headDY -= Math.sin(p * Math.PI) * 5
      squashY *= 1 + Math.sin(p * Math.PI) * 0.05
    }
    if (input.mode === 'drag') headRot += Math.sin(now / 260) * 0.05
    const breath = anim === 'sleep' ? Math.sin(now / 950) * 1.8 : Math.sin(now / 520) * 0.8
    // уши сами по себе: подёргивание (как у кота) и засыпая — опускаются в стороны
    // (засыпая, уши не опускаются: как в видео — он ложится с поднятыми ушами, и они ложатся на спину сами)
    const drowsy = 0


    // Поворот анфас ↔ боком — «в прыжке»: присел → подпрыгнул и в воздухе повернулся (анфас сужается,
    // профиль раскрывается) → приземлился уже в новом виде, с лёгким сжатием.
    const turning = !peek && turnP < 1
    const flipP = smooth(clamp((turnP - 0.3) / 0.4, 0, 1))
    const turnTo = turning ? (this.side ? flipP : 1 - flipP) : null
    const sideAmt = peek ? (peek.view === 'side' ? 1 : 0) : turnTo !== null ? turnTo : this.side ? 1 : 0
    const showSide = sideAmt >= 0.5
    const showFront = !showSide
    // сужается только до 70% — в верхней точке «щёлкает» в новый вид (не тонкая картонка)
    const frontSX = showFront ? 1 - 0.6 * sideAmt : 1
    const sideSX = showSide ? 0.7 + 0.6 * (sideAmt - 0.5) : 1
    let turnLift = 0
    // Подскок — только когда разворачивается боком (сейчас поскачет). Остановился и поворачивается к нам —
    // без подскока: только что приземлился, и ещё один прыжок на месте выглядел лишним.
    if (turning && this.side) {
      const air = clamp((turnP - 0.18) / 0.64, 0, 1)
      // невысоко и быстро — почти незаметно (и уши не уходят за верх окна)
      turnLift = Math.sin(air * Math.PI) * 7
      const crouch = turnP < 0.18 ? Math.sin((turnP / 0.18) * Math.PI) : 0
      const land = turnP > 0.82 ? Math.sin(((turnP - 0.82) / 0.18) * Math.PI) : 0
      squashY *= 1 - (crouch + land) * 0.06 + (turnLift / 7) * 0.02
      squashX *= 1 + (crouch + land) * 0.05 - (turnLift / 7) * 0.02
    }
    const smear = peek ? peek.smear : 0
    if (smear > 0) {
      squashY *= 1 - smear * 0.12
      squashX *= 1 + smear * 0.09
    }
    const hidden = peek?.view === 'hidden'
    const peekHead = peek?.view === 'head' ? peek : null
    bodyDY *= 1 - sideAmt
    bodyDY -= turnLift

    // ---------- силуэт на отдельном слое ----------
    const layer = this.layer
    if (!layer) return
    if (layer.width !== width || layer.height !== height) {
      layer.width = width
      layer.height = height
    }
    const lc = layer.getContext('2d')!
    lc.setTransform(ctx.getTransform())
    lc.clearRect(-W, -H, W * 3, H * 3)
    lc.fillStyle = INK
    lc.strokeStyle = INK
    lc.lineCap = 'round'
    lc.lineJoin = 'round'

    const [hx0, hy0] = pose.head
    const hx = hx0 + this.turn * 3
    const hy = hy0 + headDY + breath * 0.3
    let side: HopFrame | null = null

    if (!hidden && peekHead) {
      // выглядывает из-за края: видна голова (повёрнута внутрь экрана) и уши
      const px = edgeX + 34 - peekHead.slide * 62
      this.drawPeekHead(lc, px, 150, true, peekHead.paw, edgeX, anim, t, now, input)
    } else if (!hidden) {
      lc.save()
      lc.translate(C, G)
      lc.scale(squashX, squashY)
      lc.translate(-C, -G + bodyDY)
      if (showFront) {
        lc.save()
        lc.translate(C, 0)
        lc.scale(frontSX, 1)
        lc.translate(-C, 0)
        // улёгся — рисунок спящего (живой: дышит, уши «долетают»); до того — кукла
        // (между ними — оба: силуэт рисунка уже лёг поверх куклы, кукла чуть меньше и вся внутри него — когда
        // она пропадает, силуэт не меняется)
        if (this.artK < 1) this.drawFrontBody(lc, pose, hx, hy, headRot, earSpread, drowsy, pawsUp, scratchT, breath, now)
        if (this.artK > 0) {
          lc.save()
          this.artFit(lc)
          drawSleepArtSilhouette(lc, INK, breath)
          lc.restore()
        }
        lc.restore()
      }
      if (showSide) {
        // Поворот: в верхней точке — столбиком (как анфас, без скачка силуэта), к приземлению — уже в
        // приседе и сразу отталкивается; обратно — из приседа привстаёт к верхней точке.
        // (поворот к нам — из позы «приземлился» в столбик; боком — из столбика в присед, перед прыжками)
        const hopping = this.hopActive || !!peek
        const settle = turning ? smooth(this.side ? clamp((turnP - 0.45) / 0.5, 0, 1) : 1 - clamp(turnP / 0.55, 0, 1)) : 1
        side = hopping || !turning ? hopFrameAt(this.hopU) : this.side ? seqFrameAt(SETTLE_FRAMES, settle) : seqFrameAt(REST_FRAMES, 1 - settle)
        lc.save()
        if (peek) this.peekTransform(lc, peek)
        lc.translate(C, 0)
        lc.scale(sideSX, 1)
        lc.translate(-C, 0)
        this.sideStretch(lc, side)
        lc.fillStyle = INK
        fillLoops(lc, [side.S])
        lc.restore()
      }
      lc.restore()
    }
    // (лёг — «z» поднимаются над спиной у кончика уха и улетают вправо-вверх, как на раскадровке: от точки
    // +30, −48 от headAt)
    this.headAt = side ? [side.right - 35, side.top + 45] : [lerp(hx, C + 25, this.sleepW), lerp(hy, 172, this.sleepW)]

    // мягкая тень
    if (!hidden && !peekHead && this.wDangle < 0.95) {
      const sx = (peek && showSide ? (peek.mirror ? 2 * C - C : C) + peek.ox : C)
      const lift = clamp(1 + bodyDY / 60, 0.4, 1) * (side ? clamp(1 - Math.max(0, G - side.bottom) / 80, 0.55, 1) : 1)
      const rx = lerp(58, 70, sideAmt) * lift * (1 + this.wLoaf * 0.3)
      ctx.save()
      ctx.globalAlpha = (1 - this.wDangle) * lift
      ctx.translate(sx, G - 1)
      ctx.scale(rx / 10, 0.6)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10)
      g.addColorStop(0, 'rgba(0,0,0,0.09)')
      g.addColorStop(0.7, 'rgba(0,0,0,0.07)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // тонкий светлый контур вокруг силуэта — виден и на тёмном столе
    const rim = this.rim
    if (rim) {
      if (rim.width !== width || rim.height !== height) {
        rim.width = width
        rim.height = height
      }
      const rc = rim.getContext('2d')!
      rc.globalCompositeOperation = 'copy'
      rc.drawImage(layer, 0, 0)
      rc.globalCompositeOperation = 'source-in'
      rc.fillStyle = 'rgba(255,255,255,0.5)'
      rc.fillRect(0, 0, width, height)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const d = Math.max(1, scale * 0.9)
      for (const [ox, oy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d]
      ]) {
        ctx.drawImage(rim, ox, oy)
      }
      ctx.drawImage(layer, 0, 0)
      ctx.restore()
    }

    // ---------- лицо и детали ----------
    ctx.save()
    ctx.translate(C, G)
    ctx.scale(squashX, squashY)
    ctx.translate(-C, -G + bodyDY)
    if (peekHead) {
      this.drawPeekHead(ctx, edgeX + 34 - peekHead.slide * 62, 150, false, peekHead.paw, edgeX, anim, t, now, input)
    } else if (!hidden) {
      if (showFront && sideAmt < 0.5) {
        ctx.save()
        ctx.translate(C, 0)
        ctx.scale(frontSX, 1)
        ctx.translate(-C, 0)
        if (this.artK) {
          ctx.save()
          this.artFit(ctx)
          drawSleepArtDetails(ctx, INK, breath, this.earDyn[0].a - this.earRest[0], this.earDyn[1].a - this.earRest[1])
          ctx.restore()
        } else {
          this.drawFrontDetails(ctx, pose, (this.wSit + this.sleepW) * (1 - pawsUp) * (1 - this.wDangle))
          this.drawEarbuds(ctx, hx, hy)
          ctx.translate(hx, hy)
          ctx.rotate(headRot)
          this.drawFrontFace(ctx, anim, t, now, input)
        }
        ctx.restore()
      }
      if (side && sideAmt >= 0.5) {
        ctx.save()
        if (peek) this.peekTransform(ctx, peek)
        ctx.translate(C, 0)
        ctx.scale(sideSX, 1)
        ctx.translate(-C, 0)
        this.sideStretch(ctx, side)
        // Линии в ушах — как анфас: ровная тонкая линия по середине белой полоски из видео (в видео они
        // толще, с клином у кончика уха). Мелкие белые крапинки у ушей (шум обводки) — не рисуем.
        const whites = (W: Loop[], lines: boolean[]): void => {
          ctx.fillStyle = LINE
          fillLoops(ctx, W.filter((_, i) => !lines[i]))
          ctx.strokeStyle = LINE
          ctx.lineWidth = EAR_LINE_L.lw
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          W.forEach((l, i) => lines[i] && l.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))))
          ctx.stroke()
        }
        whites(side.W, side.lines)
        ctx.restore()
      }
    }
    if (pawsUp > 0 && anim === 'scratch') for (const s of [-1, 1]) drawScratchPaw(ctx, scratchPaw(s, scratchT, pawsUp), PAD_W)
    ctx.restore()

    this.drawParticles(ctx, now)
    ctx.restore()
  }

  /**
   * Проводные наушники-«капельки» (у кролика уши сверху — дужка шла бы по ушам, а чашки на щёки):
   * вкладыши у основания ушей, провода вдоль щёк сходятся под подбородком и одним проводом уходят вниз.
   * Надевая — вкладыши «вскакивают», провода проявляются; снимая — наоборот.
   */
  private drawEarbuds(c: CanvasRenderingContext2D, hx: number, hy: number): void {
    // прозрачность снаружи (ложится — детали анфаса гаснут) умножается на свою
    const alpha0 = c.globalAlpha
    if (this.phones <= 0.01 || !this.earsNow) return
    const on = easeInOut(this.phones)
    const WIRE = '#d6d6d1'
    c.save()
    c.lineCap = 'round'
    c.lineJoin = 'round'
    // провода — проявляются чуть позже вкладышей; идут за головой (её не пересекают), видны с туловища
    c.globalAlpha = alpha0 * clamp((this.phones - 0.25) / 0.5, 0, 1)
    c.save()
    c.beginPath()
    c.rect(hx - 400, hy - 400, 800, 800)
    c.ellipse(hx + this.turn * 3, hy + 1, 41.5, 38.5, 0, 0, Math.PI * 2)
    c.clip('evenodd')
    c.strokeStyle = WIRE
    c.lineWidth = 1.1
    const jx = hx + this.turn * 3
    const jy = hy + 62
    const buds: [number, number][] = []
    for (const [i, side] of [[0, -1], [1, 1]] as const) {
      const e = this.earsNow[i]
      // у основания уха — там, где оно выходит из головы
      const bx = e.x + Math.sin(e.a) * 15
      const by = e.y - Math.cos(e.a) * 15
      buds.push([bx, by])
      c.beginPath()
      // за головой — вниз, из-под щеки выходит на грудь и сходится с другим буквой Y
      c.moveTo(bx, by)
      c.bezierCurveTo(bx + side * 4, by + 30, hx + side * 22, hy + 20, hx + side * 17, hy + 40)
      c.quadraticCurveTo(hx + side * 12, jy - 6, jx, jy)
      c.stroke()
    }
    // общий провод — по груди вниз
    c.beginPath()
    c.moveTo(jx, jy)
    c.quadraticCurveTo(jx - 6, jy + 18, jx + 3, jy + 36)
    c.stroke()
    // разветвитель
    c.fillStyle = WIRE
    c.beginPath()
    c.ellipse(jx, jy + 1, 1.8, 2.6, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
    // вкладыши: белая капелька с розовой сеточкой
    c.globalAlpha = alpha0 * clamp(this.phones * 2.5, 0, 1)
    for (const [i, [bx, by]] of buds.entries()) {
      const side = i ? 1 : -1
      const r = 4.6 * (0.4 + 0.6 * on) * (1 + Math.sin(on * Math.PI) * 0.25)
      c.fillStyle = '#f4f4f0'
      c.beginPath()
      c.ellipse(bx, by, r, r * 1.05, 0, 0, Math.PI * 2)
      c.fill()
      // «ножка» вкладыша — вниз и наружу, к проводу
      c.strokeStyle = '#f4f4f0'
      c.lineWidth = 2.6 * on
      c.beginPath()
      c.moveTo(bx + side * 1, by + r * 0.6)
      c.lineTo(bx + side * 2.2, by + 3 + r * 0.4)
      c.stroke()
      c.fillStyle = PINK
      c.beginPath()
      c.ellipse(bx - side * 0.6, by - 0.4, r * 0.42, r * 0.46, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
  }

  /**
   * Белые детали тела анфас — как на референсе: линии в ушах, линии бёдер и внутренних краёв стоп,
   * на стопах — кольцо большой подушечки и три пальчика. k — насколько кот «сидит» (лёжа и в руке их нет).
   */
  private drawFrontDetails(c: CanvasRenderingContext2D, pose: FrontPose, k: number): void {
    // прозрачность снаружи (ложится — детали анфаса гаснут) умножается на свою
    const alpha0 = c.globalAlpha
    c.save()
    c.strokeStyle = LINE
    c.fillStyle = LINE
    c.lineCap = 'round'
    c.lineJoin = 'round'
    // линии в ушах (лёжа уши прижаты — линии тают)
    // (лёжа — тоже: уши на спине с линиями, как в видео)
    const earK = 1 - this.wDangle * 0.3
    if (this.earsNow && earK > 0.02) {
      c.globalAlpha = alpha0 * earK
      const sw = smooth(this.earSwap) * (1 - this.wLoaf)
      const t = this.sleepClock
      const [far, near] = this.earsNow
      // лёжа оба уха одинаковые: и линия, и серый край; дальнее — за ближним (где ближнее его закрывает, линий нет)
      // уши наклонились в одну сторону (назад, к хвосту) — ближнее перекрывает дальнее: линии дальнего там, где
      // его закрывает ближнее, не рисуем (иначе дальнее ложилось «поверх» ближнего), край ближнего — серой линией
      const fold = Math.max(phase(t, [1.1, 1.5]), phase(t, LIE_LINES)) * this.sleepW
      c.save()
      if (fold > 0.02) {
        c.beginPath()
        c.rect(-W, -H, W * 3, H * 3)
        earPath(c, { ...near, w: near.w + 2, len: near.len + 2 }, false)
        c.clip('evenodd')
      }
      // лёг — у дальнего уха внутренней линии нет (только силуэт); гаснет плавно, пока ложится
      const farLine = mixLine(mixLine(EAR_LINE_L, EAR_LINE_R, sw), EAR_LINE_R, this.wLoaf)
      const arcOnly = clamp((this.wLoaf - 0.3) / 0.5, 0, 1)
      c.globalAlpha = alpha0 * earK * (1 - arcOnly)
      if (arcOnly < 0.98) earLine(c, far, farLine, 1)
      c.restore()
      c.globalAlpha = alpha0 * earK
      earLine(c, near, mixLine(EAR_LINE_R, EAR_LINE_L, sw), 1)
      if (fold > 0.02) {
        c.save()
        c.globalAlpha = alpha0 * fold
        c.strokeStyle = CONTOUR
        c.lineWidth = 2.1
        // край ближнего уха (затылок со щекой — в drawFrontFace, по образцу); лёжа край уха кончается там,
        // где начинается контур затылка (на образце он не заходит дальше влево)
        const kHead = phase(t, LIE_LINES) * this.sleepW
        if (kHead > 0.02) {
          const rot = this.tilt + this.sleepW * (pose.rot ?? 0)
          const [qx, qy] = [20.1 * (1 - Math.abs(this.turn) * 0.15) + this.turn * 8 + HEAD_CONTOUR[0][0], 2.5 + this.wLoaf * 1.5 + HEAD_CONTOUR[0][1]]
          const sx = pose.head[0] + this.turn * 3 + qx * Math.cos(rot) - qy * Math.sin(rot)
          c.beginPath()
          c.rect(lerp(-W, sx - 1.5, kHead), -H, W * 3, H * 3)
          c.clip()
        }
        earEdgePath(c, near)
        c.stroke()
        c.restore()
      }
    }
    // сидя — линии бёдер, между лапками и подушечки стоп; ложится — гаснут сразу, как тронулся (стопы уходят
    // под тело — иначе подушечки «проплывают» сквозь него)
    const kSit = k * (1 - phase(this.sleepClock, SIT_LINES_OFF))
    if (k > 0.05) {
      c.globalAlpha = alpha0 * clamp((kSit - 0.05) / 0.5, 0, 1)
      c.lineWidth = 1.3
      const poly = (pts: [number, number][]): void => {
        c.beginPath()
        c.moveTo(C + pts[0][0], pts[0][1])
        if (pts.length === 3) c.quadraticCurveTo(C + pts[1][0], pts[1][1], C + pts[2][0], pts[2][1])
        else c.lineTo(C + pts[1][0], pts[1][1])
        c.stroke()
      }
      // бёдра — мягкая белая линия от тела к стопе
      c.globalAlpha *= 0.75
      poly([[-30, 183.4], [-30.5, 196], [-24.9, 206.8]])
      poly([[30, 183.4], [30.5, 196], [24.9, 206.8]])
      // передние лапки — как у Уголька: светлая линия между ними, контур сверху и пальчики
      c.lineWidth = 1.2
      c.strokeStyle = CONTOUR_LIGHT
      poly([[0, 196], [0, 217]])
      c.globalAlpha = alpha0 * clamp((k - 0.05) / 0.5, 0, 1)
      // лёг — бедро дугой «(» сверху вниз к задней стопе (как в видео); сама стопа — с контуром и пальчиками,
      // как передние лапки
      const kLie = phase(this.sleepClock, LIE_LINES) * this.sleepW
      const paws: [Blob, number][] = [
        [pose.pawL, 1 - phase(this.sleepClock, [1.9, LIE_LAST_T]) * this.sleepW],
        [pose.pawR, 1],
        [pose.footR, kLie]
      ]
      if (kLie > 0.02) {
        const f = pose.footR
        c.save()
        c.globalAlpha *= kLie
        c.beginPath()
        c.moveTo(f.x + 11, f.y - 34)
        c.quadraticCurveTo(f.x - 6.5, f.y - 25, f.x - 2, f.y - 6)
        c.stroke()
        c.restore()
      }
      // хвостик позади тела: край тела поверх него — тонкой серой линией (как в видео), иначе чёрное на
      // чёрном сливается в бесформенный нарост
      const [tx, ty, tr] = pose.tail
      if (tr > 2 && this.sleepW > 0.02) {
        c.save()
        c.globalAlpha *= this.sleepW * clamp((tr - 2) / 4, 0, 1)
        c.beginPath()
        c.arc(tx, ty, tr, 0, Math.PI * 2)
        c.clip()
        c.strokeStyle = CONTOUR
        c.beginPath()
        c.ellipse(pose.base.x, pose.base.y, pose.base.rx, pose.base.ry, 0, 0, Math.PI * 2)
        c.stroke()
        c.restore()
      }
      const a1 = c.globalAlpha
      for (const [p, pk] of paws) {
        if (pk < 0.02) continue
        c.globalAlpha = a1 * pk
        c.beginPath()
        c.ellipse(p.x, p.y, p.rx, p.ry, 0, Math.PI * 1.08, Math.PI * 1.92)
        c.stroke()
        for (const dx of [-3, 3]) {
          c.beginPath()
          c.moveTo(p.x + dx, p.y + p.ry - 1)
          c.lineTo(p.x + dx * 0.8, p.y + p.ry - 4.5)
          c.stroke()
        }
      }
      c.globalAlpha = alpha0 * clamp((kSit - 0.05) / 0.5, 0, 1)
      // стопы: белые подушечки — большая вдоль стопы и три пальчика дугой над ней (заливкой — читаются
      // в любом размере). Правая — по референсу, левая — зеркально.
      c.fillStyle = PAD_W
      for (const [f, side] of [
        [pose.footL, -1],
        [pose.footR, 1]
      ] as [Blob, number][]) {
        c.save()
        c.translate(f.x, f.y)
        c.scale(side, 1)
        c.beginPath()
        c.ellipse(-1.5, 3.6, 6, 4.6, -0.86, 0, Math.PI * 2)
        c.fill()
        for (const [x, y] of [
          [3.4, -10.4],
          [-3.2, -7.4],
          [7.8, -4.6]
        ]) {
          c.beginPath()
          c.ellipse(x, y, 2.4, 2.8, 0, 0, Math.PI * 2)
          c.fill()
        }
        c.restore()
      }
    }
    c.restore()
  }

  /** Сдвиг к краю и (при возвращении) разворот мордой внутрь экрана. */
  private peekTransform(c: CanvasRenderingContext2D, peek: PeekState): void {
    c.translate(peek.ox, 0)
    if (peek.mirror) {
      c.translate(C, 0)
      c.scale(-1, 1)
      c.translate(-C, 0)
    }
  }

  /** Потягивается боком (проснулся): кадр «стоит» чуть наклонён вперёд и вытянут. */
  private sideStretch(c: CanvasRenderingContext2D, f: HopFrame): void {
    if (this.stretch < 0.001) return
    const k = this.stretch
    c.translate(f.right - 20, G)
    c.rotate(0.14 * k)
    c.scale(1 + 0.1 * k, 1 - 0.12 * k)
    c.translate(-(f.right - 20), -G)
  }

  /** Уши в текущем кадре (анфас) — для белых линий поверх контура. */
  private earsNow: [Ear, Ear] | null = null
  /** Фаза прыжка (0…1) и прыгает ли сейчас (или доигрывает прыжок); наибольшая скорость окна в прогулке. */
  private hopU = HOP_STAND / HOP_FRAMES.length
  private hopActive = false
  /** Сон: часы позы (с; см. LIE_KEYS), вес позы сна, закрыл глаза (0…1). */
  private sleepClock = 0
  /** Улёгся: вместо куклы — рисунок спящего (1) или ещё кукла (0). Смена — в момент «плюх», без наплыва. */
  private artK = 0
  /** Угол ушей в позе (без пружины) — от него отсчитывается «долетание» линий ушей рисунка. */
  private earRest = [0, 0]
  /** Уши во сне на пружине: угол и скорость (левое, правое). */
  private earDyn = [
    { a: 0, v: 0 },
    { a: 0, v: 0 }
  ]
  private sleepW = 0
  private eyesShut = 0
  /** Игра ушами: 0 — выше левое (как на референсе), 1 — выше правое; меняется само время от времени. */
  private earSwap = 0
  private earSwapTo = 0
  private nextEarPlay = 0

  /** Пока доукладывается — рисунок по габаритам текущей позы куклы (левый край и верх; низ — земля). */
  private artFit(c: CanvasRenderingContext2D): void {
    if (this.sleepClock >= LIE_LAST_T) return
    const box = (p: FrontPose): [number, number, number] => {
      const bl = [p.base, p.chest]
      return [Math.min(...bl.map((b) => b.x - b.rx)), Math.max(...bl.map((b) => b.x + b.rx)), Math.min(...bl.map((b) => b.y - b.ry))]
    }
    const [x0, x1, y0] = box(lieKeyPose(this.sleepClock))
    const [r0, r1, ry0] = box(LOAF)
    c.translate(x0, G)
    c.scale((x1 - x0) / (r1 - r0), (G - y0) / (G - ry0))
    c.translate(-r0, -G)
  }

  /**
   * Мягкое ухо во сне: угол догоняет позу на пружине (с лёгким перелётом), кончик отстаёт и гнётся против
   * хода; ухо, повёрнутое вбок/вниз, крепится глубже в голове — иначе корень торчит над макушкой углом.
   */
  private softEar(i: number, e: Ear, head: [number, number]): Ear {
    const d = this.earDyn[i]
    this.earRest[i] = e.a
    if (this.sleepClock === 0 || this.sleepW === 0) {
      d.a = e.a
      d.v = 0
      return e
    }
    const steps = Math.max(1, Math.ceil(this.dt / (1 / 120)))
    const h = Math.min(this.dt, 0.1) / steps
    for (let k = 0; k < steps; k++) {
      d.v += (170 * (e.a - d.a) - 17 * d.v) * h
      d.a += d.v * h
    }
    // насколько ухо отведено вбок/вниз (стоячее — 0); лёжа на спине — уже не нужно
    const wrapped = Math.atan2(Math.sin(e.a), Math.cos(e.a))
    const sink = 13 * clamp((Math.abs(wrapped) - 0.8) / 0.7, 0, 1) * (1 - this.wLoaf)
    const dx = head[0] - e.x
    const dy = head[1] - e.y
    const n = Math.hypot(dx, dy) || 1
    return {
      ...e,
      x: e.x + (dx / n) * sink,
      y: e.y + (dy / n) * sink,
      a: d.a,
      bend: e.bend + clamp(-d.v * 2.2, -8, 8)
    }
  }

  private drawFrontBody(
    g: CanvasRenderingContext2D,
    pose: FrontPose,
    hx: number,
    hy: number,
    headRot: number,
    earSpread: number,
    drowsy: number,
    pawsUp: number,
    scratchT: number,
    breath: number,
    now: number
  ): void {
    // уши: от головы, вместе с ней наклоняются; подёргивание и сонливость
    const earAt = (e: Ear, side: number, twitch: number): Ear => {
      const dx = e.x - pose.head[0]
      const dy = e.y - pose.head[1]
      const cos = Math.cos(headRot)
      const sin = Math.sin(headRot)
      return {
        // повернул голову вбок — ухо с той стороны чуть сдвигается к макушке: голова в повороте уже, и корень
        // уха торчал из неё треугольником
        x: hx + dx * cos - dy * sin + this.turn * 4 - side * Math.max(0, side * this.turn) * 6.5,
        y: hy + dx * sin + dy * cos,
        len: e.len * (1 - drowsy * 0.06),
        // + лёгкое покачивание — у каждого уха свой ритм
        a: e.a + headRot + side * (earSpread + drowsy * 0.4 + twitch * 0.18) - this.turn * 0.1 - this.alert * side * 0.06 + Math.sin(now / 900 + side * 1.7) * 0.035,
        bend: e.bend + side * drowsy * 6,
        w: e.w
      }
    }
    // уши меняются ролями: высокое прямое ↔ короткое отведённое (зеркально относительно головы);
    // лёжа уши лежат вдоль спины — там игры нет (иначе зеркало развернуло бы их вперёд)
    const sw = smooth(this.earSwap) * (1 - this.wLoaf)
    const swapEar = (own: Ear, other: Ear): Ear =>
      mixEar([
        [own, 1 - sw],
        [{ ...other, x: 2 * pose.head[0] - other.x, a: -other.a, bend: -other.bend }, sw]
      ])
    const eL = earAt(swapEar(pose.earL, pose.earR), -1, this.earL)
    const eR = earAt(swapEar(pose.earR, pose.earL), 1, this.earR)
    // белые линии в ушах рисуются поверх контура, вместе с лицом
    this.earsNow = [eL, eR]
    // (когда поверх уже лежит силуэт рисунка — уши куклы плавно уходят под него: иначе торчали бы над ним)
    const earsIn = this.artK > 0 ? 1 - phase(this.sleepClock, [ART_LINES_T, ART_SWAP_T]) : 1
    if (earsIn > 0.02) {
      earShape(g, { ...eL, len: eL.len * earsIn, w: eL.w * (0.5 + earsIn * 0.5) })
      earShape(g, { ...eR, len: eR.len * earsIn, w: eR.w * (0.5 + earsIn * 0.5) })
    }
    // хвост-помпон позади
    const [tx, ty, tr] = pose.tail
    pompom(g, tx, ty, tr)
    // тело
    g.save()
    blob(g, { ...pose.base, rx: pose.base.rx + breath * 0.3 })
    blob(g, pose.chest)
    blob(g, pose.footL)
    blob(g, pose.footR)
    // в руке — задние лапы свисают из-под тела
    if (pose.legs > 0.01) {
      const bottom = pose.base.y + pose.base.ry
      const swing = Math.sin(now / 520) * 2.5 * pose.legs
      for (const [f, s] of [
        [pose.footL, -1],
        [pose.footR, 1]
      ] as [Blob, number][]) {
        capsule(g, pose.base.x + s * 11, bottom - 14, f.x + swing, f.y - f.ry * 0.4, 14 * pose.legs)
        ell(g, f.x + swing, f.y, f.rx, f.ry)
      }
    }
    // передние лапки (у стекла — тянутся к нему)
    blob(g, pose.pawL)
    blob(g, pose.pawR)
    if (pawsUp > 0.01) {
      for (const s of [-1, 1]) {
        const paw = scratchPaw(s, scratchT, pawsUp)
        capsule(g, C + s * 18, pose.chest.y - 8, paw.x, paw.y, 18)
        ell(g, paw.x, paw.y, 9, 9)
      }
    }
    g.restore()
    headFront(g, hx, hy, this.turn, this.wLoaf * this.sleepW)
  }

  /**
   * Лицо анфас — как на референсе: маленькие белые глаза-овалы (без зрачков), белый носик-треугольник,
   * по два белых уса с каждой стороны. Координаты — от центра головы, подогнаны по референсу.
   */
  private drawFrontFace(c: CanvasRenderingContext2D, anim: string, t: number, now: number, input: RigInput): void {
    const fx = this.turn * 8
    const ey = 2.5 + this.wLoaf * 1.5
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = LINE
    c.fillStyle = LINE
    const blinking = now - this.blinkAt < 140
    const stretchYawn = clamp((this.stretch - 0.6) / 0.4, 0, 1)
    const sleepyArc = anim === 'sleep' && this.sleepT >= SLEEP_DEEP ? 1 : 0
    const closedArc = (x: number, up: boolean, deep = 0): void => {
      const w = 6.4 + sleepyArc * 0.8 - deep * 1.4
      c.strokeStyle = LINE
      c.lineWidth = 2.2
      c.beginPath()
      if (up) {
        c.moveTo(x - w, ey + 1.5)
        c.quadraticCurveTo(x, ey - 3.5, x + w, ey + 1.5)
      } else {
        c.moveTo(x - w, ey - deep * 2)
        c.quadraticCurveTo(x, ey + 3.5 + deep * 4.5, x + w, ey - deep * 2)
      }
      c.stroke()
    }
    const listening = anim === 'music' && this.phones > 0.75 && this.wDangle < 0.5
    for (const side of [-1, 1]) {
      const far = side === Math.sign(this.turn)
      const x = fx + side * 20.1 * (far ? 1 : 1 - Math.abs(this.turn) * 0.15)
      if (anim === 'yawn' || listening || stretchYawn > 0.4) {
        closedArc(x, listening)
        continue
      }
      if (anim === 'laugh') {
        closedArc(x, true)
        continue
      }
      if (anim === 'dizzy') {
        c.lineWidth = 1.4
        c.beginPath()
        for (let a = 0; a < Math.PI * 4.5; a += 0.3) {
          const r = (a / (Math.PI * 4.5)) * 6.5
          const px = x + Math.cos(a + t * 8) * r
          const py = ey + Math.sin(a + t * 8) * r
          if (a === 0) c.moveTo(px, py)
          else c.lineTo(px, py)
        }
        c.stroke()
        continue
      }
      if (anim === 'love') {
        c.save()
        c.fillStyle = PINK
        c.beginPath()
        const k = 0.55 + Math.sin(t * 10) * 0.05
        c.moveTo(x, ey + 7 * k)
        c.bezierCurveTo(x - 12 * k, ey - 2 * k, x - 7 * k, ey - 11 * k, x, ey - 5 * k)
        c.bezierCurveTo(x + 7 * k, ey - 11 * k, x + 12 * k, ey - 2 * k, x, ey + 7 * k)
        c.fill()
        c.restore()
        continue
      }
      // глаз — белый вертикальный овал с чёрной точкой-зрачком; смотрит на курсор
      const surprised = input.mode === 'drag'
      // засыпая — глаза закрываются (как моргание, только медленно), закрылись — дужки «‿»
      if (this.eyesShut > 0.95) {
        closedArc(x, false, this.sleepW * phase(this.sleepClock, [FALL_T, LIE_LAST_T]))
        continue
      }
      const open = Math.min(blinking ? 0.15 : 1 - this.affection * 0.45, 1 - this.eyesShut * 0.85)
      const rx = (surprised ? 6.1 : 5.6) * (far ? 1 - Math.abs(this.turn) * 0.3 : 1)
      const ry = (surprised ? 10.2 : 9.2) * open
      const ex = x + this.lookX * 1.5
      const eyY = ey + this.lookY * 1.2
      c.beginPath()
      c.ellipse(ex, eyY, rx, Math.max(0.6, ry), 0, 0, Math.PI * 2)
      c.fill()
      // Зрачок — крупная чёрная точка, бегает за курсором внутри глаза (моргнул — прячется за край
      // овала), с «кошачьими» бликами: большой сверху и маленький снизу — глаза «живые», влажные.
      if (ry > 2) {
        c.save()
        c.clip()
        const pr = (surprised ? 3.3 : 3.9) * (rx / (surprised ? 6.1 : 5.6))
        const px = ex + this.lookX * rx * 0.28
        const py = eyY + 1 + this.lookY * ry * 0.25
        c.fillStyle = INK
        c.beginPath()
        c.arc(px, py, pr, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = LINE
        c.beginPath()
        c.arc(px + pr * 0.32, py - pr * 0.4, pr * 0.36, 0, Math.PI * 2)
        c.fill()
        c.beginPath()
        c.arc(px - pr * 0.38, py + pr * 0.42, pr * 0.16, 0, Math.PI * 2)
        c.fill()
        c.restore()
      }
    }

    // лёг — контур затылка и щеки двумя волнами, снят точками с образца (docs: спит, вид ¾): от корня уха
    // вниз — выпуклость затылка, впадинка, выпуклость щеки к лапке. Координаты — от правого глаза (ед. сцены)
    const kHead = phase(this.sleepClock, LIE_LINES) * this.sleepW
    if (kHead > 0.02) {
      const ox = fx + 20.1 * (1 - Math.abs(this.turn) * 0.15)
      const pts = HEAD_CONTOUR.map(([x, y]) => [ox + x, ey + y])
      c.save()
      c.globalAlpha *= kHead
      c.strokeStyle = CONTOUR
      c.lineWidth = 2.1
      c.beginPath()
      c.moveTo(pts[0][0], pts[0][1])
      // гладко через точки (Catmull-Rom → кривые Безье)
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1])
      }
      c.stroke()
      c.restore()
    }
    // носик — розовый треугольничек с мягкими углами (как у Уголька)
    const nx = fx * 1.1
    const ny = 9.9
    c.fillStyle = PINK
    c.beginPath()
    c.moveTo(nx - 3.6, ny - 1.6)
    c.quadraticCurveTo(nx, ny - 2.4, nx + 3.6, ny - 1.6)
    c.quadraticCurveTo(nx + 0.8, ny + 2, nx, ny + 2)
    c.quadraticCurveTo(nx - 0.8, ny + 2, nx - 3.6, ny - 1.6)
    c.fill()
    // рот — только когда говорит, зевает, смеётся или в руке
    let mouthOpen = 0
    if (anim === 'talk') mouthOpen = 0.35 + Math.abs(Math.sin(t * 13)) * 0.65
    if (anim === 'laugh') mouthOpen = 0.9
    if (anim === 'yawn') mouthOpen = Math.sin(Math.min(1, t / 1.5) * Math.PI) * 1.6
    mouthOpen = Math.max(mouthOpen, stretchYawn * 1.4)
    if (input.mode === 'drag') mouthOpen = 0.45
    if (mouthOpen > 0.05) {
      c.save()
      c.fillStyle = PINK
      c.beginPath()
      // верх рта — всегда с зазором под носиком, открывается только вниз (раньше рос во все стороны и упирался в нос)
      const ry = 1.2 + mouthOpen * 2.6
      c.ellipse(nx, ny + 8 + ry, 2.2 + mouthOpen * 1.1, ry, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
    // усы: по два с каждой стороны (как на референсе), чуть шевелятся
    c.strokeStyle = LINE
    c.lineWidth = 1.9
    const wob = Math.sin(now / 400) * 0.5
    for (const [x0, y0, x1, y1] of [
      [26.9, 12, 37, 13.2],
      [26.4, 17.2, 32.3, 20.4]
    ]) {
      for (const side of [-1, 1]) {
        c.beginPath()
        c.moveTo(fx + side * x0, y0)
        c.lineTo(fx + side * x1, y1 + wob * side)
        c.stroke()
      }
    }
  }

  /** Уши при выглядывании — те же, что анфас (по референсу), от головы в (x, y). */
  private peekEars(x: number, y: number, now: number): [Ear, Ear] {
    const [h0, h1] = SIT.head
    const ear = (e: Ear, side: number, twitch: number): Ear => ({
      ...e,
      x: x + (e.x - h0) + this.turn * 4,
      y: y + (e.y - h1),
      a: e.a - this.turn * 0.1 + side * twitch * 0.18 + Math.sin(now / 900 + side * 1.7) * 0.035
    })
    return [ear(SIT.earL, -1, this.earL), ear(SIT.earR, 1, this.earR)]
  }

  /**
   * Выглядывает из-за края — как анфас: та же голова, уши с белыми линиями, белые глаза-овалы,
   * розовый носик, усы; лапка с пальчиками держится за край (как на референсе).
   */
  private drawPeekHead(c: CanvasRenderingContext2D, x: number, y: number, silhouette: boolean, paw: number, edgeX: number, anim: string, t: number, now: number, input: RigInput): void {
    const ears = this.peekEars(x, y, now)
    const pawX = edgeX - 3 - paw * 7
    const pawY = y + 36
    if (silhouette) {
      earShape(c, ears[0])
      earShape(c, ears[1])
      headFront(c, x, y, this.turn)
      if (paw > 0.02) ell(c, pawX, pawY, 8 * paw + 1, 9.5 * paw + 1)
      return
    }
    c.save()
    c.strokeStyle = LINE
    c.fillStyle = LINE
    c.lineCap = 'round'
    c.lineJoin = 'round'
    earLine(c, ears[0], EAR_LINE_L, 1)
    earLine(c, ears[1], EAR_LINE_R, 1)
    // пальчики на лапке у края
    if (paw > 0.3) {
      c.globalAlpha = clamp((paw - 0.3) / 0.4, 0, 1)
      c.lineWidth = 1.3
      for (const dy of [-3, 3]) {
        c.beginPath()
        c.moveTo(pawX - 6, pawY + dy)
        c.lineTo(pawX - 2, pawY + dy)
        c.stroke()
      }
    }
    c.restore()
    c.save()
    c.translate(x, y)
    this.drawFrontFace(c, anim, t, now, input)
    c.restore()
  }
}

/** Кадры вида сбоку — для проверки (scripts/rig-harness.js). */
export const BUNNY_SIDE_FRAMES = {
  HOP_FRAMES,
  HOP_STAND,
  SETTLE_FRAMES
}
