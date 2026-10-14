// «Уголёк» — чёрный кот, нарисованный кодом в каждом кадре (векторная «кукла»).
// Никаких покадровых картинок: тело собрано из нескольких овалов (круп, живот, грудь), лап и хвоста;
// позы (сидит, идёт, лежит, висит в руке) — это разные положения этих деталей, и они плавно
// перетекают друг в друга через пружины. Поверх — мультяшные приёмы: подготовка перед прыжком,
// сжатие/растяжение, запаздывающий хвост, подёргивание ушей, моргание, частицы.
//
// Координаты — условная сцена 220×240, земля на y = 228. Рисуется «лицом вправо»; отражение
// при ходьбе влево делает вызывающий код (flip).

export interface RigInput {
  /** Состояние автомата из main. */
  mode: 'idle' | 'walk' | 'drag' | 'react'
  /** Имя анимации из main: idle, walk, drag, laugh, love, dizzy, yawn, talk, music, sleep. */
  animation: string
  /** Номер запуска анимации — меняется при каждом новом старте. */
  seq: number
  flip: boolean
  /** Курсор в координатах окна (CSS px), или null. */
  pointer: { x: number; y: number } | null
  /** Размер окна в CSS px — чтобы перевести курсор и скорость в координаты сцены. */
  view: { width: number; height: number }
  /** Текущая скорость окна, CSS px/с (main разгоняет и тормозит плавно) — чтобы лапы не скользили. */
  walkSpeed?: number
  /** Обычная скорость прогулки, CSS px/с: быстрее — уже бег. */
  baseSpeed?: number
  /** Когда окно остановится в конце прогулки (Date.now(), мс). */
  stopAt?: number
}

export const RIG_SCENE = { width: 220, height: 240 } as const
const W = RIG_SCENE.width
const H = RIG_SCENE.height
export const G = 228 // земля
export const C = 110
// Вид сбоку рисуется в «единицах раскадровки» (кот ~650×480, земля на y = 530) — так проще
// сверять с образцом; sideTransform переводит их в сцену.
const SIDE_SCALE = 0.305
const SIDE_CX = 400
const SIDE_GROUND = 530
// Голова сбоку — та же, что анфас, чуть меньше и площе (как на раскадровке).
const SIDE_HEAD_SX = 0.95
const SIDE_HEAD_SY = 0.856
/** Разворот анфас ↔ бок, мс. */
export const TURN_MS = 380
/** Встаёт из «сидя боком» / садится, с (быстро — пробежка и «спрятаться» стартуют без затяжки). */
const STAND_S = 0.28
const SIT_S = 0.36

export type Pt = [number, number]
interface SideMotion {
  /** Покачивание плеч и таза (единицы раскадровки). */
  sh: number
  hp: number
  /** Галоп: вытянут (+) / собран (−) корпус. */
  ext: number
  /** Галоп: наклон корпуса. */
  pitch: number
}
/** Точка контура тела: x, y и «где она» — 0 у таза, 1 у плеч (от этого зависят покачивания). */
type BodyPt = [number, number, number]

interface SideShape {
  /** Контур тела: первая точка и 8 кубических сегментов (по 3 точки). */
  body: BodyPt[]
  /** Бедро ближней задней лапы: x, y, rx, ry, наклон. */
  thigh: [number, number, number, number, number]
  /** Хвост: основание, две контрольные точки, кончик. */
  tail: [Pt, Pt, Pt, Pt]
  head: Pt
}

// Стоит / идёт — по раскадровке: длинное толстое тело-«батон», почти ровная спина, большой круглый
// круп, грудь уходит под голову; короткие толстые лапы; тонкий хвост с верха крупа вверх.
// Контур снят с раскадровки (усреднённый силуэт 12 кадров): спина подходит к голове с выемкой
// у шеи (422, 243), почти ровная, к основанию хвоста опускается; круп отвесный (x ≈ 143–149),
// живот на y ≈ 436, грудь уходит под подбородок.
const SIDE_STAND: SideShape = {
  body: [
    [455, 262, 1],
    [425, 240, 1], [360, 246, 0.5], [290, 236, 0],
    [240, 232, 0], [200, 250, 0], [175, 280, 0],
    [150, 305, 0], [142, 340, 0], [143, 375, 0],
    [145, 415, 0], [250, 440, 0], [420, 432, 1],
    [500, 432, 1], [548, 412, 1], [562, 378, 1],
    [574, 345, 1], [575, 300, 1], [540, 268, 1],
    [515, 258, 1], [480, 262, 1], [455, 262, 1]
  ],
  thigh: [210, 372, 66, 64, -0.15],
  // толстый хвост «скобкой»: из угла крупа влево-вверх, верх вертикальный, кончик на y ≈ 91
  tail: [[160, 290], [105, 262], [78, 190], [92, 118]],
  head: [553, 221]
}

// Сидит боком — собранно: грудь прямая, спина круто поднимается от большого круглого бедра
// к плечам (без длинного наклона), передние лапы прямые, хвост за спиной, кончик вверх.
const SIDE_SIT: SideShape = {
  body: [
    [470, 230, 1],
    [430, 228, 1], [372, 266, 0.5], [338, 318, 0],
    [306, 358, 0], [258, 378, 0], [240, 428, 0],
    [228, 470, 0], [238, 524, 0], [282, 530, 0],
    [340, 532, 0], [400, 532, 0.5], [450, 528, 1],
    [505, 526, 1], [548, 500, 1], [558, 440, 1],
    [575, 360, 1], [575, 290, 1], [540, 250, 1],
    [515, 232, 1], [495, 228, 1], [470, 230, 1]
  ],
  thigh: [305, 462, 76, 64, -0.5],
  tail: [[250, 500], [190, 548], [128, 536], [128, 478]],
  head: [553, 182]
}

// Потягивается (проснувшись): передние лапы вытянуты вперёд по полу, грудь опущена, круп поднят,
// задние лапы прямые, хвост трубой; голова опущена и тянется вперёд.
/** Перекос тела при потягивании: круп вверх, грудь вниз и чуть вперёд. */
function stretchPt([x, y]: Pt): Pt {
  const f = clamp((x - 170) / 390, 0, 1)
  return [x + 18 * f, y + lerp(-45, 92, f)]
}
const STRETCH_TAIL: SideShape['tail'] = [[165, 255], [122, 195], [116, 120], [140, 66]]
const STRETCH_HEAD: Pt = [583, 330]

/** Хвост на бегу — назад-вверх. */
const RUN_TAIL: SideShape['tail'] = [[160, 290], [112, 250], [95, 185], [105, 125]]

interface SideLeg {
  hipX: number
  /** Нейтральное положение лапки относительно бедра по x. */
  reach: number
  front: boolean
  far: boolean
  /** Фаза в шаге и в галопе. */
  phase: number
  run: number
  /** Где бедро и лапка, когда кот сидит. */
  sitHip: Pt
  sitPaw: Pt
}
// Шаг — кошачья очерёдность: задняя → передняя одной стороны, затем другой.
// Галоп: передние вместе (ведущая чуть позже), задние — в противофазе к передним.
// Положения и фазы подобраны по раскадровке (минимум расхождения силуэтов по 12 кадрам).
export const SIDE_LEGS: SideLeg[] = [
  { hipX: 201, reach: -4, front: false, far: true, phase: 0.575, run: 0.62, sitHip: [350, 482], sitPaw: [412, 514] },
  { hipX: 497, reach: -9, front: true, far: true, phase: 0.817, run: 0.07, sitHip: [515, 405], sitPaw: [520, 508] },
  { hipX: 212, reach: 6, front: false, far: false, phase: 0.125, run: 0.55, sitHip: [322, 482], sitPaw: [384, 512] },
  { hipX: 468, reach: 11, front: true, far: false, phase: 0.375, run: 0, sitHip: [455, 405], sitPaw: [462, 508] }
]
/**
 * Шаг по раскадровке: взмах передних и задних лап (задние шагают шире), доля опоры, подъём лапы
 * (на раскадровке лапы почти не отрываются от земли), в единицах раскадровки.
 */
export const SIDE_GAIT = { strideFront: 137, strideHind: 220, stance: 0.55, lift: 20 }
const HIP_Y = 405
/** Уши сбоку (единицы головы; сняты с раскадровки): внутренний и внешний край основания, кончик. */
/** Уши лёжа (раскадровка сна): по краям головы, короче, внешний край продолжает бок головы. */
/** Голова лёжа: полуоси, «квадратность» (0 — овал), щёчки. */
export const LOAF_HEAD = { a: 48, b: 37.5, square: 0, cheekX: 38, cheekY: 10, cheekRx: 13, cheekRy: 10.5 }
export const LOAF_EARS: { inner: Pt; tip: Pt; outer: Pt }[] = [
  { inner: [-14, -33], tip: [-41, -52], outer: [-38, -18] },
  { inner: [16, -33], tip: [42.5, -53.5], outer: [42.5, -20.2] }
]
const SIDE_EARS: { inner: Pt; tip: Pt; outer: Pt }[] = [
  // у дальнего уха внешний край продолжается затылком — его нижняя точка лежит на контуре головы
  { inner: [-8.7, -37.7], tip: [-26.5, -62.6], outer: [-37.5, -17] },
  { inner: [10.6, -39.9], tip: [23.8, -64.4], outer: [34.7, -26.3] }
]
const PAW_RY = 24

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
export const lerpPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]

/** Сколько сцены проходит тело за цикл лап (шаг / галоп): длина взмаха лапы / доля опоры. */
function gaitTravel(run: number): number {
  return (lerp((SIDE_GAIT.strideFront + SIDE_GAIT.strideHind) / 2, 200, run) * SIDE_SCALE) / lerp(SIDE_GAIT.stance, 0.38, run)
}

export const INK = '#141416'
export const INK_SOFT = '#2a2a30'
export const EYE = '#fbfbf7'
export const PINK = '#ff8fa3'
const PAD = '#f2a7b3' // подушечки лап

/** Плавное приближение к цели (экспоненциальная пружина без перелёта). */
export function approach(value: number, target: number, dt: number, speed: number): number {
  return value + (target - value) * (1 - Math.exp(-dt * speed))
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
export const smooth = (t: number): number => t * t * (3 - 2 * t)

interface Particle {
  kind: 'note' | 'heart' | 'z' | 'star' | 'scratch' | 'fog'
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  size: number
  spin: number
  /** С какого момента быстро тает (мс, как now) — например, «z», когда проснулся. */
  fadeAt?: number
}

/** Овал: центр и радиусы. */
interface Blob {
  x: number
  y: number
  rx: number
  ry: number
}

/** Поза — положения всех деталей. Все числа плавно смешиваются между позами. */
interface Pose {
  rump: Blob
  belly: Blob
  chest: Blob
  headX: number
  headY: number
  /** Тазобедренные суставы: задние и передние лапы (x относительно центра детали, y — абсолютный). */
  backHipX: number
  frontHipX: number
  hipY: number
  /** Длина лап (0 — спрятаны под телом). */
  legs: number
  /** Передние лапки сидя (вид спереди). */
  paws: number
  /** Где лапки на земле (x левой и правой) и их ширина; по умолчанию — сидя, C ∓ 15. */
  pawL?: number
  pawR?: number
  pawRx?: number
  tail: [number, number, number, number, number, number]
}

const SIT: Pose = {
  rump: { x: C, y: 208, rx: 52, ry: 20 },
  belly: { x: C, y: 178, rx: 38, ry: 42 },
  chest: { x: C, y: 146, rx: 30, ry: 28 },
  headX: C,
  headY: 98,
  backHipX: C,
  frontHipX: C,
  hipY: 190,
  legs: 0,
  paws: 1,
  tail: [C + 40, 216, C + 76, 200, C + 64, 152]
}

const WALK: Pose = {
  // Кот сбоку: ровная спина, глубокая грудь, высокие стройные лапы, голова чуть впереди груди.
  rump: { x: C - 38, y: 143, rx: 27, ry: 22 },
  belly: { x: C - 6, y: 146, rx: 44, ry: 22 },
  chest: { x: C + 28, y: 138, rx: 25, ry: 27 },
  headX: C + 44,
  headY: 98,
  backHipX: C - 40,
  frontHipX: C + 30,
  hipY: 150,
  legs: 1,
  paws: 0,
  tail: [C - 62, 132, C - 88, 104, C - 74, 62]
}

// Сон (раскадровка): из «сидит анфас» кот ложится «буханкой». Тело плавно перетекает в низкий
// гладкий холм (контур тех же овалов, сглаженный — см. drawSoftBody), голова — обычная, почти
// анфас, на лапках; сидячий хвост прячется за спину, лежачий выходит слева и обвивает тело.
// Пропорции подобраны по раскадровке сна (наложение силуэтов, расхождение ~3%): тело — круглый
// комок слева-сзади, его верх на уровне макушки; голова большая, справа; лапки — под подбородком.
export const LOAF: Pose = {
  rump: { x: C - 28.4, y: 185.8, rx: 45.3, ry: 32.8 },
  belly: { x: C + 23.8, y: 202, rx: 63.8, ry: 21 },
  chest: { x: C + 44.3, y: 200, rx: 37.1, ry: 23 },
  headX: C + 26,
  headY: 181,
  backHipX: C,
  frontHipX: C,
  hipY: 214,
  legs: 0,
  paws: 1,
  pawL: C + 5.3,
  pawR: C + 58,
  pawRx: 13.5,
  tail: SIT.tail
}
/** Центры «мягкого» тела сидя и лёжа (из них считается контур). */
const SOFT_SIT: Pt = [C, 182]
export const SOFT_LOAF: Pt = [C - 14.3, 204.5]
/** Сон по времени (с, с момента, когда кот сидит анфас): лёг, обвил хвост, жмурится, уснул, «z». */
export const SLEEP_DOWN = 0.08
export const SLEEP_DEEP = 3.4
export const SLEEP_Z = 3.8
/** Уснул — голова опускается на лапки. */
export const SLEEP_HEAD_DROP = 4
/** Потягивание после сна, с (вниз, держит с зевком, обратно). */
export const STRETCH_S = 2.1

/**
 * Хвост лёжа (x относительно C): две кубические кривые — из-за крупа влево-вниз и вперёд вдоль
 * земли, кончиком к лапкам. У тела тоньше, к концу чуть толще, кончик круглый.
 */
export const LOAF_TAIL: [Pt, Pt, Pt, Pt][] = [
  [[-54, 189], [-78, 186], [-100, 213], [-70, 219]],
  [[-70, 219], [-50, 221], [-30, 220.5], [-13, 216.5]]
]
/** Толщина хвоста лёжа: у тела и у кончика. */
export const LOAF_TAIL_R = { base: 6, tip: 7.8 }
const loafTailR = (t: number): number => lerp(LOAF_TAIL_R.base, LOAF_TAIL_R.tip, Math.pow(t, 1.2))

/** Точки хвоста лёжа от начала до доли u (0…1): позиция, нормаль вверх, толщина. */
function loafTailPoints(u: number, flick: number): { x: number; y: number; nx: number; ny: number; r: number; t: number }[] {
  const out: { x: number; y: number; nx: number; ny: number; r: number; t: number }[] = []
  const N = 48
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * u
    const seg = LOAF_TAIL[t < 0.5 ? 0 : 1]
    const k = t < 0.5 ? t * 2 : t * 2 - 1
    const [p0, p1, p2, p3] = seg.map(([x, y], j): Pt => [C + x + (t >= 0.5 && j === 3 ? flick : 0), y])
    const a = (1 - k) ** 3
    const b = 3 * (1 - k) ** 2 * k
    const cc = 3 * (1 - k) * k * k
    const d = k ** 3
    const x = a * p0[0] + b * p1[0] + cc * p2[0] + d * p3[0]
    const y = a * p0[1] + b * p1[1] + cc * p2[1] + d * p3[1]
    const tx = 3 * (1 - k) ** 2 * (p1[0] - p0[0]) + 6 * (1 - k) * k * (p2[0] - p1[0]) + 3 * k * k * (p3[0] - p2[0])
    const ty = 3 * (1 - k) ** 2 * (p1[1] - p0[1]) + 6 * (1 - k) * k * (p2[1] - p1[1]) + 3 * k * k * (p3[1] - p2[1])
    const len = Math.hypot(tx, ty) || 1
    // нормаль, смотрящая вверх (к телу)
    let [nx, ny] = [ty / len, -tx / len]
    if (ny > 0) [nx, ny] = [-nx, -ny]
    out.push({ x, y, nx, ny, r: loafTailR(t), t })
  }
  return out
}

const SOFT_RAYS = 96

/**
 * Гладкое тело: контур объединения овалов, снятый лучами из центра, сглаживается (тем сильнее,
 * чем больше smoothK) и рисуется плавной кривой; низ не уходит под землю.
 */
function drawSoftBody(c: CanvasRenderingContext2D, blobs: Blob[], [cx, cy]: Pt, smoothK: number): void {
  const r = new Float64Array(SOFT_RAYS)
  for (let i = 0; i < SOFT_RAYS; i++) {
    const a = (i / SOFT_RAYS) * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let far = 0
    for (const b of blobs) {
      // точка луча cx + t·dx внутри овала b — квадратное уравнение по t, берём дальний корень
      const ox = (cx - b.x) / b.rx
      const oy = (cy - b.y) / b.ry
      const vx = dx / b.rx
      const vy = dy / b.ry
      const A = vx * vx + vy * vy
      const B = 2 * (ox * vx + oy * vy)
      const D = B * B - 4 * A * (ox * ox + oy * oy - 1)
      if (D >= 0) far = Math.max(far, (-B + Math.sqrt(D)) / (2 * A))
    }
    r[i] = far
  }
  // сглаживание по кругу: убирает «горбы» на стыках овалов
  let s = r
  for (let pass = 0; pass < 10; pass++) {
    const n = new Float64Array(SOFT_RAYS)
    for (let i = 0; i < SOFT_RAYS; i++) n[i] = (s[(i + SOFT_RAYS - 1) % SOFT_RAYS] + 2 * s[i] + s[(i + 1) % SOFT_RAYS]) / 4
    s = n
  }
  const pts: Pt[] = []
  for (let i = 0; i < SOFT_RAYS; i++) {
    const a = (i / SOFT_RAYS) * Math.PI * 2
    const rr = lerp(r[i], s[i], smoothK)
    pts.push([cx + Math.cos(a) * rr, Math.min(G, cy + Math.sin(a) * rr)])
  }
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  c.beginPath()
  const m0 = mid(pts[0], pts[1])
  c.moveTo(m0[0], m0[1])
  for (let i = 1; i <= SOFT_RAYS; i++) {
    const p = pts[i % SOFT_RAYS]
    const m = mid(p, pts[(i + 1) % SOFT_RAYS])
    c.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  c.closePath()
  c.fill()
}

type Poly = Pt[]

function ellipsePoly(x: number, y: number, rx: number, ry: number, rot = 0, n = 28): Poly {
  const out: Poly = []
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const ex = Math.cos(a) * rx
    const ey = Math.sin(a) * ry
    out.push([x + ex * cr - ey * sr, y + ex * sr + ey * cr])
  }
  return out
}

/** Сужающееся звено (как limb): два полукруга радиусов ra и rb, соединённые касательными. */
function capsulePoly(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Poly {
  const ang = Math.atan2(by - ay, bx - ax)
  const out: Poly = []
  for (let i = 0; i <= 10; i++) {
    const a = ang + Math.PI / 2 + (i / 10) * Math.PI
    out.push([ax + Math.cos(a) * ra, ay + Math.sin(a) * ra])
  }
  for (let i = 0; i <= 10; i++) {
    const a = ang - Math.PI / 2 + (i / 10) * Math.PI
    out.push([bx + Math.cos(a) * rb, by + Math.sin(a) * rb])
  }
  return out
}

/** Дальняя точка объединения многоугольников по лучам из центра. */
function rayPolys(polys: Poly[], [cx, cy]: Pt): Float64Array {
  const r = new Float64Array(SOFT_RAYS)
  for (let i = 0; i < SOFT_RAYS; i++) {
    const a = (i / SOFT_RAYS) * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let far = 0
    for (const poly of polys) {
      for (let j = 0; j < poly.length; j++) {
        const [px, py] = poly[j]
        const [qx, qy] = poly[(j + 1) % poly.length]
        const ex = qx - px
        const ey = qy - py
        const den = dx * ey - dy * ex
        if (Math.abs(den) < 1e-9) continue
        const t = ((px - cx) * ey - (py - cy) * ex) / den
        const u = ((px - cx) * dy - (py - cy) * dx) / den
        if (u >= 0 && u <= 1 && t > far) far = t
      }
    }
    r[i] = far
  }
  return r
}

/** Замкнутая плавная кривая по лучам из центра; низ не уходит под землю. */
function drawRadial(c: CanvasRenderingContext2D, r: Float64Array, [cx, cy]: Pt): void {
  const pts: Pt[] = []
  for (let i = 0; i < SOFT_RAYS; i++) {
    const a = (i / SOFT_RAYS) * Math.PI * 2
    pts.push([cx + Math.cos(a) * r[i], Math.min(G, cy + Math.sin(a) * r[i])])
  }
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  c.beginPath()
  const m0 = mid(pts[0], pts[1])
  c.moveTo(m0[0], m0[1])
  for (let i = 1; i <= SOFT_RAYS; i++) {
    const p = pts[i % SOFT_RAYS]
    const m = mid(p, pts[(i + 1) % SOFT_RAYS])
    c.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  c.closePath()
  c.fill()
}

/** Часть кубической кривой от начала до параметра t (де Кастельжо). */
function bezierPart(c: CanvasRenderingContext2D, [p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number, move: boolean): void {
  const a = lerpPt(p0, p1, t)
  const b = lerpPt(p1, p2, t)
  const e = lerpPt(p2, p3, t)
  const ab = lerpPt(a, b, t)
  const be = lerpPt(b, e, t)
  const end = lerpPt(ab, be, t)
  if (move) c.moveTo(p0[0], p0[1])
  c.bezierCurveTo(a[0], a[1], ab[0], ab[1], end[0], end[1])
}

/** Хвост лёжа до доли u длины — цепочкой кружков, толщина растёт к кончику. */
function drawLoafTail(c: CanvasRenderingContext2D, u: number, flick: number): void {
  for (const p of loafTailPoints(u, flick)) {
    c.beginPath()
    c.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    c.fill()
  }
}

// В руке (за шкирку) — как было: тело вытянуто вниз, лапы болтаются.
const DANGLE: Pose = {
  rump: { x: C, y: 190, rx: 26, ry: 22 },
  belly: { x: C, y: 160, rx: 30, ry: 46 },
  chest: { x: C, y: 122, rx: 26, ry: 22 },
  headX: C,
  headY: 78,
  backHipX: C,
  frontHipX: C,
  hipY: 186,
  legs: 0.62,
  paws: 0,
  // в руке хвост не висит палкой вниз (уходил за край окна), а загибается крючком вбок
  tail: [C + 14, 204, C + 40, 220, C + 46, 188]
}

function mixBlob(parts: [Blob, number][], total: number): Blob {
  const out = { x: 0, y: 0, rx: 0, ry: 0 }
  for (const [b, w] of parts) {
    out.x += (b.x * w) / total
    out.y += (b.y * w) / total
    out.rx += (b.rx * w) / total
    out.ry += (b.ry * w) / total
  }
  return out
}

function mix(poses: [Pose, number][]): Pose {
  const total = poses.reduce((sum, [, w]) => sum + w, 0) || 1
  const num = (pick: (p: Pose) => number): number => poses.reduce((sum, [p, w]) => sum + pick(p) * w, 0) / total
  return {
    rump: mixBlob(poses.map(([p, w]) => [p.rump, w]), total),
    belly: mixBlob(poses.map(([p, w]) => [p.belly, w]), total),
    chest: mixBlob(poses.map(([p, w]) => [p.chest, w]), total),
    headX: num((p) => p.headX),
    headY: num((p) => p.headY),
    backHipX: num((p) => p.backHipX),
    frontHipX: num((p) => p.frontHipX),
    hipY: num((p) => p.hipY),
    legs: num((p) => p.legs),
    paws: num((p) => p.paws),
    pawL: num((p) => p.pawL ?? C - 15),
    pawR: num((p) => p.pawR ?? C + 15),
    pawRx: num((p) => p.pawRx ?? 11),
    tail: [0, 1, 2, 3, 4, 5].map((i) => num((p) => p.tail[i])) as Pose['tail']
  }
}

/** Двухзвенная лапа: бедро → колено → лапка. Колено считается по длинам звеньев (простая IK). */
function leg(c: CanvasRenderingContext2D, hipX: number, hipY: number, pawX: number, pawY: number, upper: number, lower: number, bend: number): void {
  const dx = pawX - hipX
  const dy = pawY - hipY
  const dist = Math.min(Math.hypot(dx, dy), upper + lower - 0.01)
  const base = Math.atan2(dy, dx)
  const cos = clamp((upper * upper + dist * dist - lower * lower) / (2 * upper * dist), -1, 1)
  const angle = base + bend * Math.acos(cos)
  const kneeX = hipX + Math.cos(angle) * upper
  const kneeY = hipY + Math.sin(angle) * upper
  const endX = hipX + Math.cos(base) * dist
  const endY = hipY + Math.sin(base) * dist
  c.beginPath()
  c.moveTo(hipX, hipY)
  c.lineTo(kneeX, kneeY)
  c.lineTo(endX, endY)
  c.stroke()
  // аккуратная круглая лапка
  c.beginPath()
  c.ellipse(endX + 2, endY - 1, 8, 5.5, 0, 0, Math.PI * 2)
  c.fill()
}

// ---------- царапает экран ----------
// Кот как будто по ту сторону стекла: встаёт на задние лапы, тянется к экрану (чуть приближается),
// упирается в «стекло» передними лапами по бокам от морды — подушечки расплющены — и с когтями
// тянет лапы вниз. Царапины остаются на стекле там, где прошли когти; от дыхания стекло запотевает.

export const SCRATCH_PERIOD = 0.62 // взмах одной лапы, с
export const SCRATCH_TOP = 80
export const SCRATCH_BOTTOM = 128
/** Лапы на стекле — по бокам от морды. */
export const SCRATCH_X = 58
/** Насколько кот приближается к стеклу (масштаб вокруг точки на земле). */
const SCRATCH_LEAN = 0.08
/** Лапка, прижатая к стеклу, — чуть крупнее; кончики когтей — над её центром. */
const PRESSED_SCALE = 1.1
const CLAW_TIP = 14
const CLAW_XS = [-7, -2.5, 2.5, 7]

/** Кот стоит на задних лапах, тянется к стеклу: тело вытянуто вверх. */
const STRETCH: Pose = {
  rump: { x: C, y: 212, rx: 44, ry: 18 },
  belly: { x: C, y: 172, rx: 33, ry: 46 },
  chest: { x: C, y: 134, rx: 28, ry: 28 },
  headX: C,
  headY: 94,
  backHipX: C,
  frontHipX: C,
  hipY: 190,
  legs: 0,
  paws: 1,
  tail: [C + 36, 220, C + 72, 212, C + 76, 170]
}

/** Насколько кот встал и тянется к стеклу (0…1): встаёт, царапает, опускается. */
export function scratchRaise(t: number): number {
  return smooth(clamp(t / 0.45, 0, 1)) * (1 - smooth(clamp((t - 3.3) / 0.45, 0, 1)))
}

/**
 * Лапка при царапании: прижата к стеклу и быстро тянется вниз (когти выпущены), затем отлипает
 * от стекла, неторопливо поднимается и снова прижимается. Лапы — в противофазе.
 * press: 1 — прижата к стеклу, меньше — отодвинута от него.
 */
export function scratchPaw(side: number, t: number, raise = scratchRaise(t)): { x: number; y: number; down: boolean; stroke: number; press: number } {
  const phase = Math.max(0, t - 0.45) / SCRATCH_PERIOD + (side > 0 ? 0.5 : 0)
  const stroke = Math.floor(phase)
  const f = phase - stroke
  const down = t > 0.45 && f < 0.4
  const w = (f - 0.4) / 0.6
  const y = f < 0.4 ? SCRATCH_TOP + easeInOut(f / 0.4) * (SCRATCH_BOTTOM - SCRATCH_TOP) : SCRATCH_BOTTOM - easeInOut(w) * (SCRATCH_BOTTOM - SCRATCH_TOP)
  const press = raise * (f < 0.4 ? 1 : 1 - Math.sin(Math.PI * w) * 0.75)
  // из положения «сидя» (лапка на земле) — к стеклу
  const restX = C + side * 15
  const restY = G - 6
  return {
    x: restX + side * (SCRATCH_X - 15) * raise,
    y: restY + (y - restY) * raise,
    down,
    stroke,
    press
  }
}

/** Лапка изнутри стекла: прижатая — крупнее, расплющена, подушечки яркие и раздвинуты; на взмахе — когти. */
export function drawScratchPaw(c: CanvasRenderingContext2D, paw: ReturnType<typeof scratchPaw>, pad = PAD): void {
  const p = paw.press
  const s = 0.9 + (PRESSED_SCALE - 0.9) * p
  c.save()
  c.translate(paw.x, paw.y)
  c.scale(s * (1 + p * 0.05), s * (1 - p * 0.04))
  c.fillStyle = INK
  c.strokeStyle = `rgba(255,255,255,${0.18 + p * 0.3})`
  c.lineWidth = 1.2
  c.beginPath()
  c.ellipse(0, 0, 13, 12, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  // подушечки: прижатые к стеклу — яркие и чуть раздвинуты
  c.globalAlpha = 0.4 + 0.6 * p
  c.fillStyle = pad
  const spread = 1 + p * 0.12
  c.beginPath()
  c.ellipse(0, 3.5, 5.5 * spread, 4.5, 0, 0, Math.PI * 2)
  c.fill()
  for (const [x, y] of [
    [-7, -3],
    [-2.5, -6.5],
    [2.5, -6.5],
    [7, -3]
  ]) {
    c.beginPath()
    c.ellipse(x * spread, y, 2.3 * spread, 2.6 * spread, 0, 0, Math.PI * 2)
    c.fill()
  }
  c.globalAlpha = 1
  // когти — выпущены, пока лапа тянется вниз по стеклу
  if (paw.down) {
    c.strokeStyle = '#f4f4f0'
    c.lineWidth = 1.4
    c.lineCap = 'round'
    for (const x of CLAW_XS) {
      c.beginPath()
      c.moveTo(x, -8)
      c.quadraticCurveTo(x + 0.6, -11, x, -CLAW_TIP)
      c.stroke()
    }
  }
  c.restore()
}

/** Царапины на стекле — по одной от каждого когтя; прорисовываются вслед за лапой и медленно тают. */
function drawScratchMark(c: CanvasRenderingContext2D, x: number, y: number, side: number, ageMs: number, age: number): void {
  const k = (1 + SCRATCH_LEAN) * PRESSED_SCALE
  const grow = easeInOut(clamp(ageMs / (SCRATCH_PERIOD * 400), 0, 1))
  const len = (SCRATCH_BOTTOM - SCRATCH_TOP) * (1 + SCRATCH_LEAN) * grow
  const alpha = age < 0.6 ? 1 : 1 - (age - 0.6) / 0.4
  c.save()
  c.globalAlpha = clamp(alpha, 0, 1)
  c.lineCap = 'round'
  for (const [color, width] of [
    ['rgba(0,0,0,0.35)', 2.4],
    ['rgba(255,255,255,0.85)', 1.1]
  ] as const) {
    c.strokeStyle = color
    c.lineWidth = width
    for (const cx of CLAW_XS) {
      const dx = cx * k
      // у крайних когтей царапина короче
      const l = len * (Math.abs(cx) > 5 ? 0.86 : 1)
      c.beginPath()
      c.moveTo(x + dx, y + Math.abs(cx) * 0.4)
      c.quadraticCurveTo(x + dx - side * 2, y + l * 0.5, x + dx - side * 1, y + l)
      c.stroke()
    }
  }
  c.restore()
}

/** Пятнышко запотевшего стекла от дыхания. */
function drawFog(c: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  const a = age < 0.2 ? age / 0.2 : 1 - (age - 0.2) / 0.8
  c.save()
  c.translate(x, y)
  c.scale(1.7 * (1 + age * 0.25), 1 + age * 0.15)
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 12)
  g.addColorStop(0, `rgba(255,255,255,${0.3 * clamp(a, 0, 1)})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(-12, -12, 24, 24)
  c.restore()
}

/** Точка из координат кота во время царапания (он приблизился к стеклу) — в координаты сцены. */
function scratchToScene(x: number, y: number): { x: number; y: number } {
  return { x: C + (x - C) * (1 + SCRATCH_LEAN), y: G + (y - G) * (1 + SCRATCH_LEAN) }
}

// ---------- прячется за край экрана и выглядывает ----------

export interface PeekState {
  view: 'front' | 'side' | 'hidden' | 'head'
  /** Сдвиг кота к краю (единицы сцены). */
  ox: number
  /** Возвращается — идёт мордой внутрь экрана. */
  mirror: boolean
  /** «Сжатие» при развороте анфас ↔ бок, 0…1. */
  smear: number
  /** Насколько голова высунулась из-за края, 0…1. */
  slide: number
  /** Лапка на краю, 0…1. */
  paw: number
}

/** Плавный разгон, затем ровный шаг: доля пути к моменту p (0…1). */
function walkOut(p: number): number {
  const a = 0.3
  const q = clamp(p, 0, 1)
  return (q < a ? (q * q) / (2 * a) : q - a / 2) / (1 - a / 2)
}

/**
 * Сценарий выглядывания по времени t, с (длительность анимации — 10.3 с). fromWalk — кот уже шёл
 * к краю боком: он просто продолжает идти за край, без разворота анфас.
 * В конце кот стоит боком мордой внутрь экрана; сесть и повернуться анфас — обычный переход.
 */
export function peekState(t: number, edgeX: number, fromWalk: boolean): PeekState {
  const out = edgeX + 14
  const base: PeekState = { view: 'hidden', ox: out, mirror: false, smear: 0, slide: 0, paw: 0 }
  const turn = (t0: number, t1: number): number => Math.sin(clamp((t - t0) / (t1 - t0), 0, 1) * Math.PI)
  if (fromWalk && t < 2.6) return { ...base, view: 'side', ox: out * clamp(t / 2.6, 0, 1) }
  if (t < 0.36) return { ...base, view: t < 0.18 ? 'front' : 'side', ox: 0, smear: turn(0, 0.36) }
  if (t < 2.6) return { ...base, view: 'side', ox: out * walkOut((t - 0.36) / 2.24) }
  if (t < 3.6) return base
  if (t < 8.15) {
    let slide: number
    if (t < 4.4) slide = easeInOut((t - 3.6) / 0.8)
    else if (t < 6.2) slide = 1
    else if (t < 6.45) slide = 1 - easeInOut((t - 6.2) / 0.25) * 0.75 // ныряет обратно
    else if (t < 6.8) slide = 0.25 + easeInOut((t - 6.45) / 0.35) * 0.75 // и снова выглядывает
    else if (t < 7.8) slide = 1
    else slide = 1 - easeInOut((t - 7.8) / 0.35)
    const paw = t > 4.2 && t < 7.8 ? easeInOut(clamp((t - 4.2) / 0.3, 0, 1)) : 0
    return { ...base, view: 'head', slide, paw }
  }
  if (t < 8.4) return base
  return { ...base, view: 'side', mirror: true, ox: t < 10.2 ? out * walkOut(1 - (t - 8.4) / 1.8) : 0 }
}

/** Сдвиг к краю и (при возвращении) разворот мордой внутрь экрана. */
function peekTransform(c: CanvasRenderingContext2D, peek: PeekState): void {
  c.translate(peek.ox, 0)
  if (peek.mirror) {
    c.translate(C, 0)
    c.scale(-1, 1)
    c.translate(-C, 0)
  }
}

/** Где лапка, которой кот держится за край, когда выглядывает (y сцены). */
const PEEK_PAW_Y = 214

/** Пальчики лапки, которой кот держится за край экрана, и её контур сверху — читается как лапка. */
function drawPawToes(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.save()
  c.strokeStyle = 'rgba(255,255,255,0.3)'
  c.lineWidth = 1.2
  c.lineCap = 'round'
  c.beginPath()
  c.ellipse(x, y, 12, 9, 0, Math.PI * 1.1, Math.PI * 1.9)
  c.stroke()
  for (const dx of [-4, 1]) {
    c.beginPath()
    c.moveTo(x + dx - 2, y - 7)
    c.lineTo(x + dx - 3, y - 2)
    c.stroke()
  }
  c.restore()
}

export class BlackCatRig {
  /** Сколько длится поворот анфас ↔ бок, мс (у других «кукол» — свой). */
  protected turnMs = TURN_MS
  protected last = 0
  protected wSit = 1
  protected wWalk = 0
  protected wDangle = 0
  protected turn = 0
  protected tilt = 0
  protected lookX = 0
  protected lookY = 0
  protected pupil = 5
  protected alert = 0
  protected affection = 0
  protected blinkAt = 0
  protected nextBlink = 2500
  protected earL = 0
  protected earR = 0
  protected nextTwitch = 3000
  /** Фаза шага, 0..1 — один полный цикл лап. */
  protected gait = 0
  /** Насколько кот идёт (0 — стоит, 1 — шагает в полную силу); runBlend — насколько это галоп. */
  protected walkBlend = 0
  protected runBlend = 0
  /** Какой вид показан: анфас или бок (в середине разворота вид сменяется). */
  protected side = false
  protected turnAt = -Infinity
  /** Сбоку: 0 — стоит, 1 — сидит; sitK — то же со сглаживанием. */
  protected sit = 1
  protected sitK = 1
  /** Выглядывание началось прямо с ходьбы — без разворота анфас. */
  protected peekFromWalk = false
  /** Сон: пригнулся, лёг «буханкой», потягивается; время сна и пробуждения, с. */
  protected wLoaf = 0
  protected tailWrap = 0
  /** Где голова в сцене — над ней поднимаются «z». */
  protected headAt: Pt = [C, 98]
  protected sleepT = 0
  /** Проснулся: встаёт → разворот боком (стоя) → потягивается; время и сила потягивания. */
  protected waking = false
  protected wakeT = 0
  protected stretchT = 0
  protected stretch = 0
  /** Наушники: 0 — сняты, 1 — надеты. */
  protected phones = 0
  /** Геометрия кота сбоку в текущем кадре — для глаза и усов поверх силуэта. */
  protected tailLag = 0
  /** Выглядывание из-за края: что показываем сейчас и сдвиг кота (для шага лап). */
  protected peekView: PeekState['view'] | null = null
  protected peekOx = 0
  /** Номер последнего «взмаха» каждой лапы при царапании — чтобы оставить по царапине на взмах. */
  protected scratchStroke: Record<number, number> = { [-1]: -1, [1]: -1 }
  protected seq = -1
  protected animStart = 0
  protected lastPointer: { x: number; y: number; t: number } | null = null
  protected stillSince = 0
  protected particles: Particle[] = []
  protected lastSpawn = 0
  /**
   * Где стекло запотевает от дыхания во время царапания (у носа), y сцены; null — не запотевает.
   * (Убрано: белое пятно у морды выглядело неоднозначно.)
   */
  protected fogY: number | null = null
  /** «Плюх» в конце укладывания (0…1). У кролика — свой (см. BunnyRig). */
  protected sleepPlop(): number {
    const u = (this.sleepT - SLEEP_DOWN - 0.18) / 0.35
    return u > 0 && u < 1 ? Math.sin(u * Math.PI) * (1 - u) ** 0.6 : 0
  }
  /** «z» во сне: заливка, кайма (если есть), размер, насколько растут, поднимаясь, и куда летят (сцена/с). */
  protected zLook: { fill: string; rim?: string; size: number; grow: number; vx: number; vy: number } = { fill: '#eef0ff', size: 1, grow: 1.2, vx: 9, vy: -15 }
  protected layer = typeof document !== 'undefined' ? document.createElement('canvas') : null
  protected rim = typeof document !== 'undefined' ? document.createElement('canvas') : null
  /** Голова отдельно — лёжа её обводим поверх тела, чтобы она не сливалась с ним. */
  protected headLayer = typeof document !== 'undefined' ? document.createElement('canvas') : null
  protected headRing = typeof document !== 'undefined' ? document.createElement('canvas') : null
  protected busy = false
  /** Какое отражение сейчас нарисовано: сбоку кот не «перещёлкивается» зеркально, а разворачивается через анфас. */
  protected shownFlip: boolean | null = null
  /** Разворот на ходу: после анфаса — сразу боком стоя, без «сел и встал». */
  protected turnAround = false
  /** Царапанье: насколько подняты лапы и момент царапанья — прерванное (клик, взяли в руку) не обрывается, а лапы опускаются. */
  protected pawsK = 0
  protected scratchT = 0
  protected dt = 0.016

  /** Сейчас быстрое движение (ходьба, прыжок, музыка, частицы) — рисовать 60 к/с, иначе хватит 30. */
  get fast(): boolean {
    return this.busy
  }

  protected startTurn(toSide: boolean, now: number, standing = false): void {
    this.side = toSide
    this.turnAt = now
    // боком кот появляется сидя — и потом встаёт (проснувшись — сразу стоя, чтобы потянуться)
    if (toSide) this.sit = standing ? 0 : 1
  }

  /**
   * Время сценария выглядывания (peekState) по времени анимации: кот уходит за край и возвращается быстрее
   * (в ~1,7 раза), выглядывает столько же; вся анимация — 8,4 с (character.json). У кролика — своё.
   */
  protected peekTime(t: number): number {
    const map = (a0: number, a1: number, b0: number, b1: number): number => b0 + ((t - a0) / (a1 - a0)) * (b1 - b0)
    if (this.peekFromWalk) {
      if (t < 1.5) return map(0, 1.5, 0, 2.6)
      if (t < 2.4) return map(1.5, 2.4, 2.6, 3.6)
    } else {
      if (t < 0.3) return map(0, 0.3, 0, 0.36)
      if (t < 1.6) return map(0.3, 1.6, 0.36, 2.6)
      if (t < 2.4) return map(1.6, 2.4, 2.6, 3.6)
    }
    if (t < 7.2) return t + 1.2
    return Math.min(10.3, map(7.2, 8.25, 8.4, 10.2))
  }

  /** Выглядывание: идёт ли кот сейчас (уходит за край или возвращается). */
  protected peekWalking(t: number): boolean {
    return (t > 0.18 && t < 2.6) || (t > 8.4 && t < 10.2)
  }

  protected spawn(p: Omit<Particle, 'born'>, now: number): void {
    this.particles.push({ ...p, born: now })
  }

  protected update(now: number, input: RigInput): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.016
    this.dt = dt
    this.last = now
    if (input.seq !== this.seq) {
      this.seq = input.seq
      this.animStart = now
      if (input.animation === 'peek') this.peekFromWalk = this.side && this.sit < 0.5
      // засыпает: сначала дёргает ухом, прислушивается
      if (input.animation === 'sleep') this.earR = 1
      if (input.animation === 'love') {
        for (let i = 0; i < 3; i++) this.spawn({ kind: 'heart', x: C + 20 + i * 14, y: 70, vx: (i - 1) * 8, vy: -34 - i * 6, life: 1700, size: 1, spin: 0 }, now + i * 160)
      }
    }
    const anim = input.animation
    const t = (now - this.animStart) / 1000

    // Поза.
    const sleeping = anim === 'sleep'
    const peekSide = anim === 'peek' && this.peekView === 'side'
    const dangling = input.mode === 'drag' ? 1 : 0
    // Ходьба рисуется отдельным видом сбоку; анфас-позы при ней остаются «сидя».
    const sitting = 1 - dangling
    this.wWalk = 0
    this.wDangle = approach(this.wDangle, dangling, dt, 12)
    // Сон (раскадровка): дёрнул ухом → лёг «буханкой» (хвост обвивает тело) → жмурится → уснул.
    // Проснувшись — встаёт, разворачивается боком и потягивается (см. sideStretch).
    if (sleeping) {
      if (input.mode === 'idle' && !this.side && now - this.turnAt > this.turnMs) this.sleepT += dt
      const st = this.sleepT
      // зевнул — и сразу «плюх» (быстро, как кролик), хвост обвивает тело следом
      this.wLoaf = smooth(clamp((st - SLEEP_DOWN) / 0.28, 0, 1))
      this.tailWrap = smooth(clamp((st - SLEEP_DOWN - 0.15) / 0.45, 0, 1))
      this.waking = false
    } else {
      // лежал — проснулся: встаёт и потягивается
      if (this.wLoaf > 0.5 && this.sleepT > 0 && input.mode === 'idle') {
        this.waking = true
        this.wakeT = 0
        this.stretchT = 0
      }
      this.sleepT = 0
      // проснулся — «z» быстро тают (не висят над уже проснувшимся котом)
      for (const p of this.particles) if (p.kind === 'z' && p.fadeAt === undefined) p.fadeAt = now
      if (this.waking) {
        this.wakeT += dt
        // встаёт так же быстро, как лёг
        this.wLoaf = 1 - smooth(clamp(this.wakeT / 0.28, 0, 1))
        this.tailWrap = this.wLoaf
      } else {
        // взяли в руку — поза сна уходит так же быстро, как тело повисает (иначе лапки и хвост «отстают»)
        const rate = input.mode === 'drag' ? 14 : 5
        this.wLoaf = approach(this.wLoaf, 0, dt, rate)
        this.tailWrap = approach(this.tailWrap, 0, dt, rate)
      }
    }
    this.wSit = this.wLoaf > 0.001 ? (1 - this.wLoaf) * (1 - this.wDangle) : approach(this.wSit, sitting, dt, 5)

    // Скорость окна (main плавно разгоняет и тормозит его) → сила шага и галоп.
    const base = input.baseSpeed ?? input.walkSpeed ?? 60
    const speed = input.mode === 'walk' ? (input.walkSpeed ?? base) : 0
    const peekMoving = peekSide && this.peekWalking(this.peekTime(t))
    this.walkBlend = approach(this.walkBlend, peekSide ? (peekMoving ? 1 : 0) : clamp(speed / Math.max(1, base), 0, 1), dt, 8)
    this.runBlend = approach(this.runBlend, clamp((speed / Math.max(1, base) - 1.5) / 1.2, 0, 1), dt, 5)
    // Шаг: скорость окна → скорость перебора лап, чтобы лапы не скользили по «земле».
    if (anim !== 'peek' && speed > 0) {
      const scale = input.view.height > 0 ? H / input.view.height : 1
      this.gait = (this.gait + (dt * speed * scale) / gaitTravel(this.runBlend)) % 1
    }

    // Вид анфас ↔ бок. Пошёл: разворот боком (сидя) → встаёт → идёт.
    // Остановился: лапы замирают → садится боком → разворот анфас. Реакции и «в руке» — сразу анфас.
    // Взяли в руку — повисает сразу, анфас: без разворота и без «шагов» по воздуху боком.
    if (input.mode === 'drag' && this.side) {
      this.side = false
      this.turnAt = -Infinity
      this.sit = 1
      this.waking = false
      this.turnAround = false
    }
    const turning = now - this.turnAt < this.turnMs
    // Сменилось направление. Анфас симметричен — отражаем сразу; боком — сначала поворот к зрителю,
    // а уже потом (в анфас) отражение и разворот боком в другую сторону.
    this.shownFlip ??= input.flip
    if (input.flip !== this.shownFlip) {
      // после выглядывания кот уже повёрнут внутрь экрана (сценарий peek разворачивает его сам)
      if (anim === 'peek' || this.peekView !== null || input.mode === 'drag' || (!this.side && !turning)) {
        this.shownFlip = input.flip
      } else if (this.side && !turning) {
        this.turnAround = input.mode === 'walk'
        this.waking = false
        this.startTurn(false, now)
      }
    }
    if (anim === 'peek') {
      if (this.peekView && this.peekView !== 'front') {
        this.side = true
        this.sit = 0
      }
    } else if (!turning) {
      if (input.mode !== 'idle') this.waking = false
      if (input.mode === 'walk') {
        if (!this.side) {
          if (input.flip === this.shownFlip) this.startTurn(true, now, this.turnAround)
        } else {
          this.turnAround = false
          this.sit = Math.max(0, this.sit - dt / STAND_S)
        }
      } else if (this.waking) {
        // поднялся из «буханки» — разворачивается боком стоя и потягивается
        if (this.stretchT === 0 && !this.side && this.wakeT > 0.22) this.startTurn(true, now, true)
        // выпрямляясь, уже поворачивается анфас и садится (без «стоит во весь рост» и «сидя боком»)
        else if (this.side && this.stretchT > STRETCH_S - 0.35) this.startTurn(false, now)
      } else if (this.side) {
        if (input.mode !== 'idle') this.startTurn(false, now)
        else if (this.walkBlend < 0.3) {
          this.sit = Math.min(1, this.sit + dt / SIT_S)
          if (this.sit >= 1) this.startTurn(false, now)
        }
      }
    }
    this.sitK = easeInOut(this.sit)
    // потягиваться начинает уже во время разворота — без лишнего «встал во весь рост»
    if (this.waking && (this.side || this.stretchT > 0)) this.stretchT += dt
    if (this.waking && this.stretchT > STRETCH_S) this.waking = false
    // потягивается: тянется вниз-вперёд, держит (зевает), выпрямляется
    const st = this.waking ? this.stretchT : STRETCH_S
    const stretch = smooth(clamp(st / 0.55, 0, 1)) * (1 - smooth(clamp((st - (STRETCH_S - 0.55)) / 0.55, 0, 1)))
    // прервали (пошёл, взяли в руку) — выпрямляется быстро, но не за один кадр
    this.stretch = this.waking ? stretch : approach(this.stretch, stretch, dt, 9)
    // наушники надевает, пока слушает музыку, потом снимает
    // (надевает уже сидя анфас — после разворота; при любом действии — реакция, прогулка, в руке — снимает быстро,
    // иначе дужка торчит за верх окна)
    this.phones = approach(this.phones, anim === 'music' && input.mode === 'idle' && !this.side && this.wDangle < 0.05 && now - this.turnAt > this.turnMs ? 1 : 0, dt, input.mode === 'drag' ? 40 : input.mode !== 'idle' ? 14 : 3.2)

    // Курсор → сцена (с учётом отражения), скорость курсора, настороженность.
    let target = { turn: 0, tilt: 0, lookX: 0, lookY: 0 }
    if (input.pointer && input.view.width > 0) {
      const sx = (input.pointer.x / input.view.width) * W
      const sy = (input.pointer.y / input.view.height) * H
      const px = this.shownFlip ? W - sx : sx
      const dx = px - C
      const dy = sy - 98
      const dist = Math.hypot(dx, dy)
      target = {
        turn: clamp(dx / 260, -0.8, 0.8),
        tilt: clamp(dy / 900, -0.12, 0.14),
        lookX: clamp(dx / 120, -1, 1),
        lookY: clamp(dy / 140, -1, 1)
      }
      if (this.lastPointer) {
        const pdt = Math.max(1, now - this.lastPointer.t)
        const speed = Math.hypot(input.pointer.x - this.lastPointer.x, input.pointer.y - this.lastPointer.y) / pdt
        if (speed > 0.05) this.stillSince = now
        if (speed > 0.6 && dist < 900) this.alert = Math.min(1, this.alert + speed * 0.35)
      }
      this.lastPointer = { x: input.pointer.x, y: input.pointer.y, t: now }
      const near = dist < 220
      this.affection = approach(this.affection, near && now - this.stillSince > 2500 ? 1 : 0, dt, 2.5)
    }
    this.alert = approach(this.alert, 0, dt, 1.2)
    // При ходьбе голова повёрнута на три четверти в сторону движения — та же голова, что анфас.
    const sideways = this.side || peekSide
    const lookFree = input.mode === 'idle' && (anim === 'idle' || anim === 'talk') && !sideways
    const walkTurn = sideways ? 0.6 : 0
    let turnTo = lookFree ? target.turn : walkTurn
    let lookXTo = lookFree ? target.lookX : sideways ? 0.8 : 0
    let lookYTo = lookFree ? target.lookY : 0
    if (anim === 'peek' && this.peekView === 'head') {
      // выглядывает: голова повёрнута внутрь экрана, глаза осматриваются, потом — на человека
      turnTo = -0.32
      if (t < 5.3) [lookXTo, lookYTo] = [-0.95, 0.1]
      else if (t < 6.2) [lookXTo, lookYTo] = [0.1, -0.5]
      else if (input.pointer) [lookXTo, lookYTo] = [target.lookX, target.lookY]
      else [lookXTo, lookYTo] = [-0.2, 0]
    }
    // царапает стекло — и смотрит сквозь него на человека
    if (anim === 'scratch') [lookXTo, lookYTo] = [target.lookX * 0.7, Math.min(0.2, target.lookY) - 0.1]
    if (this.wLoaf > 0.05) {
      // лёжа — голова почти анфас (это всё тот же Уголёк), чуть повёрнута, смотрит на лапки
      turnTo = lerp(turnTo, 0.03, this.wLoaf)
      lookXTo = lerp(lookXTo, 0.05, this.wLoaf)
      lookYTo = lerp(lookYTo, 0.4, this.wLoaf)
    }
    this.turn = approach(this.turn, turnTo, dt, 6 + this.alert * 6)
    this.tilt = approach(this.tilt, lookFree ? target.tilt : 0, dt, 5)
    this.lookX = approach(this.lookX, lookXTo, dt, 12)
    this.lookY = approach(this.lookY, lookYTo, dt, 12)
    this.pupil = approach(this.pupil, 5 + this.alert * 1.8 - this.affection * 0.8, dt, 8)

    if (now - this.blinkAt > this.nextBlink) {
      this.blinkAt = now
      this.nextBlink = 2600 + Math.random() * 3800
    }
    if (now > this.nextTwitch) {
      if (Math.random() < 0.5) this.earL = 1
      else this.earR = 1
      this.nextTwitch = now + 2500 + Math.random() * 5000
    }
    this.earL = approach(this.earL, 0, dt, 9)
    this.earR = approach(this.earR, 0, dt, 9)
    this.tailLag = approach(this.tailLag, this.turn, dt, 2)

    if (anim === 'music' && this.phones > 0.9 && now - this.lastSpawn > 520) {
      this.lastSpawn = now
      const side = Math.random() < 0.5 ? -1 : 1
      this.spawn({ kind: 'note', x: C + side * 46, y: 96, vx: side * (6 + Math.random() * 10), vy: -30 - Math.random() * 10, life: 1700, size: 0.9 + Math.random() * 0.4, spin: (Math.random() - 0.5) * 0.8 }, now)
    }
    // уснул — над головой растущие «z z Z»
    if (sleeping && this.sleepT > SLEEP_Z && now - this.lastSpawn > 1100) {
      this.lastSpawn = now
      this.spawn({ kind: 'z', x: this.headAt[0] + 30, y: this.headAt[1] - 48, vx: this.zLook.vx, vy: this.zLook.vy, life: 2600, size: 1, spin: 0 }, now)
    }
    if (anim === 'scratch') {
      // на каждый взмах лапы вниз — царапина на «стекле»
      for (const side of [-1, 1]) {
        const paw = scratchPaw(side, t)
        if (paw.stroke > this.scratchStroke[side] && paw.down && t < 3.25) {
          this.scratchStroke[side] = paw.stroke
          const at = scratchToScene(paw.x, SCRATCH_TOP - CLAW_TIP * PRESSED_SCALE)
          this.spawn({ kind: 'scratch', x: at.x, y: at.y, vx: 0, vy: 0, life: 2600, size: side, spin: 0 }, now)
        }
      }
      // дышит на стекло — оно чуть запотевает у носа
      if (this.fogY !== null && t > 0.7 && t < 3.1 && now - this.lastSpawn > 1150) {
        this.lastSpawn = now
        const at = scratchToScene(C, this.fogY)
        this.spawn({ kind: 'fog', x: at.x, y: at.y, vx: 0, vy: 0, life: 1500, size: 1, spin: 0 }, now)
      }
    } else {
      this.scratchStroke = { [-1]: -1, [1]: -1 }
    }
    if (anim === 'peek' && this.peekView === 'head' && t > 6.45 && t < 6.5) this.earR = 1
    if (anim === 'dizzy' && now - this.lastSpawn > 240 && t < 1.4) {
      this.lastSpawn = now
      this.spawn({ kind: 'star', x: C, y: 50, vx: 0, vy: 0, life: 900, size: 1, spin: 0 }, now)
    }
    this.particles = this.particles.filter((p) => now - p.born < p.life)
  }

  draw(ctx: CanvasRenderingContext2D, now: number, input: RigInput): void {
    this.update(now, input)
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
    const turnP = clamp((now - this.turnAt) / this.turnMs, 0, 1)
    this.busy =
      input.mode !== 'idle' ||
      anim === 'music' ||
      this.particles.length > 0 ||
      this.walkBlend > 0.02 ||
      turnP < 1 ||
      (this.side && this.sit < 1) ||
      (this.phones > 0.005 && this.phones < 0.995) ||
      (anim === 'sleep' && this.sleepT < SLEEP_Z) ||
      this.waking ||
      Math.abs(this.wSit - (anim === 'sleep' ? 0 : 1)) > 0.02
    // царапает экран: встаёт на задние лапы и тянется к «стеклу»
    if (anim === 'scratch') {
      this.scratchT = t
      this.pawsK = scratchRaise(t)
    } else this.pawsK = approach(this.pawsK, 0, this.dt, 14)
    const pawsUp = this.pawsK < 0.005 ? 0 : this.pawsK
    const scratchT = this.scratchT
    const pose = mix([
      [SIT, this.wSit * (1 - pawsUp)],
      [LOAF, this.wLoaf],
      [STRETCH, this.wSit * pawsUp],
      [WALK, this.wWalk],
      [DANGLE, this.wDangle]
    ])

    // Мультяшные смещения.
    let bodyDY = 0
    let squashX = 1
    let squashY = 1
    let headDY = 0
    let headRot = this.tilt
    // уснул — голова чуть опускается на лапки
    headDY += SLEEP_HEAD_DROP * smooth(clamp((this.sleepT - SLEEP_DEEP) / 0.8, 0, 1))
    // «плюх»: лёг — тело чуть сплющилось и пружинисто расправилось
    const plop = this.sleepPlop()
    if (plop > 0) {
      squashY *= 1 - 0.1 * plop
      squashX *= 1 + 0.05 * plop
    }
    // Походка: два мягких «подъёма» тела за цикл и встречное покачивание головы.
    const step = Math.sin(this.gait * Math.PI * 4)
    bodyDY += -Math.abs(step) * 1.6 * this.walkBlend
    headDY += step * 1.2 * this.walkBlend
    if (anim === 'laugh') {
      const p = Math.min(1, t / 0.9)
      const crouch = p < 0.15 ? Math.sin((p / 0.15) * Math.PI) : 0
      const air = p >= 0.15 && p < 0.6 ? Math.sin(((p - 0.15) / 0.45) * Math.PI) : 0
      const land = p >= 0.6 && p < 0.8 ? Math.sin(((p - 0.6) / 0.2) * Math.PI) : 0
      // высота прыжка — чтобы уши не уходили за верх окна (над головой ~30 единиц сцены)
      bodyDY = crouch * 6 - air * 21 + land * 4
      squashY = 1 - crouch * 0.12 + air * 0.02 - land * 0.1
      squashX = 1 + crouch * 0.1 - air * 0.05 + land * 0.1
    }
    if (anim === 'music') {
      // кивает в такт, когда наушники уже надеты
      const beat = (t * 112) / 60
      const phase = beat - Math.floor(beat)
      const nod = (phase < 0.25 ? easeInOut(phase / 0.25) : 1 - easeInOut((phase - 0.25) / 0.75)) * smooth(clamp((this.phones - 0.6) / 0.4, 0, 1))
      headDY += nod * 6
      headRot += nod * 0.06
      bodyDY += nod * 1.5
    }
    if (anim === 'dizzy') headRot += Math.sin(t * 9) * 0.18 * Math.max(0, 1 - t / 1.6)
    if (anim === 'yawn') {
      const p = Math.min(1, t / 1.6)
      headDY -= Math.sin(p * Math.PI) * 6
      squashY *= 1 + Math.sin(p * Math.PI) * 0.06
    }
    if (pawsUp > 0) {
      // приближается к стеклу; на каждом взмахе чуть налегает на лапы
      squashX *= 1 + SCRATCH_LEAN * pawsUp
      squashY *= 1 + SCRATCH_LEAN * pawsUp
      bodyDY += Math.sin(((scratchT - 0.45) / SCRATCH_PERIOD) * Math.PI * 4) * 0.8 * pawsUp
      headRot += Math.sin(((scratchT - 0.45) / SCRATCH_PERIOD) * Math.PI * 2) * 0.03 * pawsUp
    }
    if (input.mode === 'drag') headRot += Math.sin(now / 260) * 0.05
    // во сне дыхание медленнее и глубже
    const breath = anim === 'sleep' ? Math.sin(now / 950) * 1.8 : Math.sin(now / 520) * 0.8

    // Вид сбоку при ходьбе; смена вида спрятана в коротком мультяшном «сжатии».
    // Выглядывание из-за края: свой сценарий (уйти за край → спрятаться → выглянуть → вернуться).
    const edgeX = W + (width / scale - W) / 2 // край окна (он же край экрана) в координатах сцены
    const peek = anim === 'peek' ? peekState(this.peekTime(t), edgeX, this.peekFromWalk) : null
    if (peek?.view === 'side') this.gait = (this.gait + Math.abs(peek.ox - this.peekOx) / gaitTravel(0)) % 1
    this.peekOx = peek?.ox ?? 0
    this.peekView = peek?.view ?? null
    // Разворот анфас ↔ бок: голова поворачивается первой, тело — за ней, «как карточка»:
    // анфас сужается, профиль расширяется (в середине поворота видны оба, узкие).
    const turning = !peek && turnP < 1
    const bodyP = easeInOut(clamp((turnP - 0.12) / 0.88, 0, 1))
    const headP = easeInOut(clamp(turnP / 0.75, 0, 1))
    const sideAmt = peek ? (peek.view === 'side' ? 1 : 0) : turning ? (this.side ? bodyP : 1 - bodyP) : this.side ? 1 : 0
    const headSide = turning ? (this.side ? headP : 1 - headP) : sideAmt
    const showSide = sideAmt > 0.38
    const showFront = sideAmt < 0.62
    // сидя — разворот плавным перетеканием контура, а не «карточкой»
    const morphTurn = turning && this.sit >= 0.99
    const frontSX = 1 - 0.6 * sideAmt
    const sideSX = 0.4 + 0.6 * sideAmt
    if (turning) {
      squashY *= 1 - Math.sin(turnP * Math.PI) * 0.03
      this.busy = true
    }
    const smear = peek ? peek.smear : 0
    if (smear > 0) {
      squashY *= 1 - smear * 0.12
      squashX *= 1 + smear * 0.09
      this.busy = true
    }
    const hidden = peek?.view === 'hidden'
    const peekHead = peek?.view === 'head' ? peek : null
    // сидя видны передние лапки, стоя у стекла — задние (чуть шире)
    const groundPaws = pose.paws
    // сбоку голова не кивает от «анфас»-эффектов
    bodyDY *= 1 - sideAmt

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

    // лёжа голова и лапки рисуются ещё и отдельно — для их обводки поверх тела
    const outlineHead = this.wLoaf > 0.05 && this.headLayer ? this.headLayer.getContext('2d')! : null
    if (outlineHead && this.headLayer) {
      if (this.headLayer.width !== width || this.headLayer.height !== height) {
        this.headLayer.width = width
        this.headLayer.height = height
      }
      outlineHead.setTransform(1, 0, 0, 1, 0, 0)
      outlineHead.clearRect(0, 0, width, height)
      outlineHead.fillStyle = INK
    }

    lc.save()
    lc.translate(C, G)
    lc.scale(squashX, squashY)
    lc.translate(-C, -G + bodyDY)

    if (peek && showSide) peekTransform(lc, peek)
    const sideHead = this.sideHead()
    let hx = lerp(pose.headX, sideHead.x, headSide)
    let hy = lerp(pose.headY + headDY + breath * 0.5, sideHead.y, headSide)
    headRot = lerp(headRot, sideHead.rot, headSide)
    this.headAt = [hx, hy]
    const headSX = lerp(1, SIDE_HEAD_SX, headSide)
    const headSY = lerp(1, SIDE_HEAD_SY, headSide)
    if (peekHead) {
      // из-за края видны только голова и лапка, которой он держится за край
      hx = edgeX + 36 - peekHead.slide * 64
      hy = 168 + (1 - peekHead.slide) * 6
      headRot = -0.36 * peekHead.slide + Math.sin(now / 900) * 0.03
    }
    if (hidden) {
      // спрятался за краем экрана
    } else if (peekHead) {
      lc.beginPath()
      lc.ellipse(hx + 40, hy + 46, 34, 30, 0, 0, Math.PI * 2) // шея и плечо уходят за край
      lc.fill()
      lc.save()
      lc.translate(hx, hy)
      lc.rotate(headRot)
      this.drawHeadShape(lc)
      lc.restore()
      if (peekHead.paw > 0) {
        lc.beginPath()
        // (ниже подбородка: раньше лапка была под ртом, и её пальчики читались как полоски у рта)
        lc.ellipse(edgeX - 2 - peekHead.paw * 9, PEEK_PAW_Y, 12, 9, 0, 0, Math.PI * 2)
        lc.ellipse(edgeX + 8, PEEK_PAW_Y + 6, 12, 14, 0, 0, Math.PI * 2)
        lc.fill()
      }
    } else if (morphTurn) {
      // разворот «сидит боком ↔ сидит анфас»: контур перетекает из профиля в анфас
      this.drawTurnMorph(lc, now, sideAmt, pose, breath)
      lc.save()
      lc.translate(hx, hy)
      lc.rotate(headRot)
      lc.scale(headSX, headSY)
      this.drawHeadShape(lc, headSide)
      lc.restore()
    } else {
    if (showSide) {
      lc.save()
      lc.translate(C, 0)
      lc.scale(sideSX, 1)
      lc.translate(-C, 0)
      // при развороте хвост «переезжает»: анфасный исчезает раньше, боковой появляется позже
      this.drawSideBody(lc, now, sideAmt > 0.55 ? 1 : 0)
      lc.restore()
    }
    if (showFront) {
    lc.save()
    lc.translate(C, 0)
    lc.scale(frontSX, 1)
    lc.translate(-C, 0)
    // хвост: при ходьбе поднят мягкой дугой и плавно покачивается, кончик запаздывает
    const [tbx, tby, tmx, tmy, ttx, tty] = pose.tail
    const sway = Math.sin(now / 760) * 9 + this.tailLag * -12 + (anim === 'music' ? Math.sin(now / 268) * 6 : 0) + Math.sin(this.gait * Math.PI * 2) * 4 * this.walkBlend
    if (sideAmt < 0.45) {
      // ложась, сидячий хвост «прячется» за спину, а лежачий выходит слева и обвивает тело
      const sitTail = 1 - smooth(clamp(this.tailWrap * 2, 0, 1))
      const loafPart = smooth(clamp(this.tailWrap * 2 - 1, 0, 1))
      lc.lineWidth = 11
      if (sitTail > 0.02) {
        lc.beginPath()
        bezierPart(lc, [[tbx, tby], [tmx + sway * 0.2, tmy + 10], [tmx + sway * 0.6, tmy - 10], [ttx + sway, tty + Math.abs(sway) * 0.2]], sitTail, true)
        lc.stroke()
      }
      if (loafPart > 0.02) drawLoafTail(lc, loafPart, Math.sin(now / 1400) * 2)
    }

    // В руке: задние лапки свисают из-под крупа — короткие и пухлые, растут изнутри силуэта
    // (без зазора с телом), вытягиваются по мере подхвата и мягко покачиваются вместе.
    if (this.wDangle > 0.01) {
      // в момент подхвата это те же лапки, что стояли на земле (то же место и размер) — они просто повисают
      const hang = smooth(clamp(this.wDangle, 0, 1))
      const bottom = pose.rump.y + pose.rump.ry
      const swing = Math.sin(now / 520) * 2.5 * hang
      for (const side of [-1, 1]) {
        const hipX = C + side * (15 - 4 * hang)
        const pawX = hipX + side * 1.5 * hang + swing + Math.sin(now / 380 + side) * hang
        this.limb(lc, hipX, bottom - 16, pawX, bottom - 6 + 15 * hang, 6 + 6 * hang, 9.5)
      }
    } else if (pose.legs > 0.02) {
      // лапы: кошачья походка (задняя-передняя с одной стороны, затем с другой);
      // опорная лапа стоит на земле и уезжает назад, переносимая — плавно поднимается вперёд.
      // Лапы почти прямые (как у кошки): сумма звеньев чуть больше высоты бедра над землёй.
      // Стоя лапы всегда достают до земли (иначе при переходе потягивание → сидя тело «висит»).
      const reach = Math.max(0, G - 4 - bodyDY - pose.hipY)
      const upper = reach * 0.5
      const lower = reach * 0.56
      const strideLen = 30
      const lift = 10
      const legs: { hipX: number; offset: number; front: boolean; far: boolean }[] = [
        { hipX: pose.backHipX - 6, offset: 0.5, front: false, far: true },
        { hipX: pose.frontHipX - 4, offset: 0.75, front: true, far: true },
        { hipX: pose.backHipX + 6, offset: 0, front: false, far: false },
        { hipX: pose.frontHipX + 4, offset: 0.25, front: true, far: false }
      ]
      for (const l of legs) {
        lc.lineWidth = (l.far ? 12 : 14) * clamp(pose.legs * 2, 0, 1)
        lc.globalAlpha = 1
        let pawX = l.hipX
        let pawY = pose.hipY + (upper + lower) * 0.95
        const u = (this.gait + l.offset) % 1
        const stance = 0.62
        if (u < stance) {
          pawX += strideLen / 2 - (u / stance) * strideLen
          pawY = Math.min(pawY, G - 4 - bodyDY)
        } else {
          const v = smooth((u - stance) / (1 - stance))
          pawX += -strideLen / 2 + v * strideLen
          pawY = Math.min(pawY, G - 4 - bodyDY) - Math.sin(v * Math.PI) * lift
        }
        pawX = l.hipX + (pawX - l.hipX) * this.walkBlend
        // передние лапы сгибаются «запястьем» назад, задние — «скакательным суставом» вперёд
        leg(lc, l.hipX, pose.hipY, pawX, pawY, upper, lower, l.front ? -1 : 1)
      }
    }

    // тело: круп, живот, грудь — три овала, которые в разных позах складываются в разный силуэт;
    // лёжа — их общий контур, сглаженный в ровную «буханку»
    const blobs = [pose.rump, pose.belly, pose.chest].map((b) => ({ x: b.x, y: b.y + breath * 0.3, rx: b.rx + breath * 0.3, ry: b.ry }))
    if (this.wLoaf > 0.001) drawSoftBody(lc, blobs, lerpPt(SOFT_SIT, SOFT_LOAF, this.wLoaf), this.wLoaf)
    else
      for (const b of blobs) {
        lc.beginPath()
        lc.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2)
        lc.fill()
      }
    // передние лапки сидя
    // (не прозрачностью, а размером — полупрозрачный силуэт виден серыми пятнами)
    if (groundPaws > 0.02 && this.wDangle <= 0.01) {
      const k = smooth(clamp(groundPaws, 0, 1))
      // лёжа лапки чуть выше и круглее — лежат перед подбородком
      const pry = 8 + this.wLoaf
      const pcy = G - 6 - this.wLoaf * 2 + (1 - k) * 4
      for (const px of [pose.pawL ?? C - 15, pose.pawR ?? C + 15]) {
        for (const g of outlineHead ? [lc, outlineHead] : [lc]) {
          if (g !== lc) g.setTransform(lc.getTransform())
          g.beginPath()
          g.ellipse(C + (px - C) * (1 + pawsUp * 0.4), pcy, (pose.pawRx ?? 11) * k, pry * k, 0, 0, Math.PI * 2)
          g.fill()
        }
      }
    }

    // передние лапы тянутся от плеч к стеклу
    if (pawsUp > 0.01) {
      for (const side of [-1, 1]) {
        const paw = scratchPaw(side, scratchT, pawsUp)
        this.limb(lc, C + side * 19, pose.chest.y + 2, paw.x, paw.y, 11, 10)
      }
    }

    lc.restore()
    }

    // голова — одна на оба вида: при развороте плавно переходит из анфас в три четверти
    lc.save()
    lc.translate(hx, hy)
    lc.rotate(headRot)
    lc.scale(headSX, headSY)
    this.drawHeadShape(lc, headSide)
    if (outlineHead) {
      outlineHead.setTransform(lc.getTransform())
      this.drawHeadShape(outlineHead, headSide)
    }
    lc.restore()
    }
    lc.restore()

    // мягкая тень под котом (не мешает кликам: прозрачнее порога попадания)
    if (!hidden && !peekHead && this.wDangle < 0.95) {
      let sx = lerp(C, C - 12 * sideSX, sideAmt)
      if (peek && showSide) sx = (peek.mirror ? 2 * C - sx : sx) + peek.ox
      const lift = clamp(1 + bodyDY / 60, 0.4, 1)
      const rx = lerp(58, 74 * sideSX, sideAmt) * lift * (1 + this.wLoaf * 0.3)
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
      // лёжа голова обведена и поверх тела (как на раскадровке) — иначе голова и тело сливаются
      const ring = this.headRing
      if (this.wLoaf > 0.05 && this.headLayer && ring && !hidden) {
        if (ring.width !== width || ring.height !== height) {
          ring.width = width
          ring.height = height
        }
        const gc = ring.getContext('2d')!
        gc.globalCompositeOperation = 'copy'
        gc.drawImage(this.headLayer, 0, 0)
        gc.globalCompositeOperation = 'source-in'
        gc.fillStyle = '#ffffff'
        gc.fillRect(0, 0, width, height)
        gc.globalCompositeOperation = 'source-over'
        for (const [ox, oy] of [
          [d, 0],
          [-d, 0],
          [0, d],
          [0, -d]
        ]) {
          gc.drawImage(ring, ox, oy)
        }
        gc.globalCompositeOperation = 'destination-out'
        gc.drawImage(this.headLayer, 0, 0)
        gc.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.5 * clamp((this.wLoaf - 0.05) / 0.5, 0, 1)
        ctx.drawImage(ring, 0, 0)
        ctx.globalAlpha = 1
      }
      ctx.restore()
    }

    // ---------- лицо и детали ----------
    ctx.save()
    ctx.translate(C, G)
    ctx.scale(squashX, squashY)
    ctx.translate(-C, -G + bodyDY)
    if (groundPaws * (1 - pawsUp) * this.wSit > 0.3 && sideAmt < 0.2 && !hidden && !peekHead) {
      ctx.strokeStyle = INK_SOFT
      ctx.lineWidth = 2
      ctx.globalAlpha = groundPaws * (1 - pawsUp) * this.wSit
      ctx.beginPath()
      ctx.moveTo(C, G - 34)
      ctx.lineTo(C, G - 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    if (sideAmt < 0.2 && !hidden && !peekHead) this.drawRestDetails(ctx, now, pose)
    if (peek && showSide) peekTransform(ctx, peek)
    if (showSide && sideAmt > 0.75 && !morphTurn) {
      ctx.save()
      ctx.translate(C, 0)
      ctx.scale(sideSX, 1)
      ctx.translate(-C, 0)
      this.drawSideDetails(ctx)
      ctx.restore()
    }
    if (peekHead && peekHead.paw > 0) drawPawToes(ctx, edgeX - 2 - peekHead.paw * 9, PEEK_PAW_Y)
    if (!hidden) {
      ctx.save()
      ctx.translate(hx, hy)
      ctx.rotate(headRot)
      ctx.scale(headSX, headSY)
      // сбоку — светлая линия по краю щеки, где голова переходит в шею (как на раскадровке)
      if (headSide > 0.6 && !peekHead) {
        ctx.save()
        ctx.globalAlpha = (headSide - 0.6) / 0.4
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.ellipse(this.turn * 4, 0, 45, 40, 0, Math.PI * 0.58, Math.PI * 0.98)
        ctx.stroke()
        ctx.restore()
      }
      this.drawFace(ctx, anim, t, now, input, headSide)
      ctx.restore()
    }
    // подушечки «на стекле» — только пока царапает; прерванное — опускаются обычные лапки
    if (pawsUp > 0 && anim === 'scratch') for (const side of [-1, 1]) drawScratchPaw(ctx, scratchPaw(side, scratchT, pawsUp))
    ctx.restore()

    this.drawParticles(ctx, now)
    ctx.restore()
  }

  /**
   * Детали лёжа (по раскадровке): светлый контур лапок под подбородком с пальчиками и линия по
   * верхнему краю хвоста там, где он лежит перед телом.
   */
  protected drawRestDetails(c: CanvasRenderingContext2D, now: number, pose: Pose): void {
    if (this.wLoaf < 0.3) return
    c.save()
    c.strokeStyle = '#ffffff'
    c.lineCap = 'round'
    c.lineWidth = 1.3
    c.globalAlpha = ((this.wLoaf - 0.3) / 0.7) * 0.3
    // пальчики на лапках (сами лапки обведены вместе с головой)
    const rx = pose.pawRx ?? 11
    for (const px of [pose.pawL ?? C, pose.pawR ?? C]) {
      for (const dx of [-rx * 0.3, rx * 0.3]) {
        c.beginPath()
        c.moveTo(px + dx, G - 11)
        c.lineTo(px + dx, G - 4)
        c.stroke()
      }
    }
    const wrap = smooth(clamp(this.tailWrap * 2 - 1, 0, 1))
    if (wrap > 0.5) {
      // светлая линия по верхнему краю хвоста там, где он лежит перед телом
      c.globalAlpha = ((wrap - 0.5) / 0.5) * 0.32
      c.beginPath()
      let first = true
      for (const p of loafTailPoints(wrap, Math.sin(now / 1400) * 2)) {
        if (p.t < 0.42) continue
        const x = p.x + p.nx * (p.r + 0.4)
        const y = p.y + p.ny * (p.r + 0.4)
        if (first) c.moveTo(x, y)
        else c.lineTo(x, y)
        first = false
      }
      c.stroke()
    }
    c.restore()
  }

  /** Силуэт «сидит боком» (тело, бедро, лапы) — многоугольниками в координатах сцены. */
  protected sideSitPolys(): Poly[] {
    const m = this.sideMotion(this.gait)
    const shape = this.sideShape(m)
    const tr = ([x, y]: Pt): Pt => this.sidePoint(x, y, m)
    const polys: Poly[] = []
    const b = shape.body
    const body: Poly = []
    for (let i = 1; i + 2 < b.length; i += 3) {
      const [p0, p1, p2, p3] = [b[i - 1], b[i], b[i + 1], b[i + 2]]
      for (let j = 0; j < 8; j++) {
        const t = j / 8
        const a = (1 - t) ** 3
        const bb = 3 * (1 - t) ** 2 * t
        const cc = 3 * (1 - t) * t * t
        const d = t ** 3
        body.push([a * p0[0] + bb * p1[0] + cc * p2[0] + d * p3[0], a * p0[1] + bb * p1[1] + cc * p2[1] + d * p3[1]])
      }
    }
    polys.push(body)
    const [tx, ty, trx, try_, trot] = shape.thigh
    polys.push(ellipsePoly(tx, ty, trx, try_, trot))
    for (const l of SIDE_LEGS) {
      const g = this.sideLeg(l, this.gait, m)
      const k = l.far ? 0.94 : 1
      const top = (l.front ? 40 : 46) * k
      const knee = (l.front ? 37 : 40) * k
      polys.push(capsulePoly(g.hx, g.hy, g.kx, g.ky, top, knee), capsulePoly(g.kx, g.ky, g.ax, g.ay, knee, 34 * k), ellipsePoly(g.px + 10, g.py, 44 * k, PAW_RY, -g.tilt))
    }
    return polys.map((poly) => poly.map(tr))
  }

  /**
   * Разворот «сидит боком ↔ сидит анфас»: контур тела (с лапами) плавно перетекает из профиля в
   * анфас по лучам из центра; боковой хвост втягивается, анфасный вырастает (или наоборот).
   * sideness: 0 — анфас, 1 — боком.
   */
  protected drawTurnMorph(c: CanvasRenderingContext2D, now: number, sideness: number, pose: Pose, breath: number): void {
    const side = this.sideSitPolys()
    const front: Poly[] = [pose.rump, pose.belly, pose.chest].map((b) => ellipsePoly(b.x, b.y + breath * 0.3, b.rx + breath * 0.3, b.ry))
    for (const px of [pose.pawL ?? C - 15, pose.pawR ?? C + 15]) front.push(ellipsePoly(px, G - 6, pose.pawRx ?? 11, 8))
    let n = 0
    let sx = 0
    let sy = 0
    for (const [x, y] of side[0]) {
      sx += x
      sy += y
      n++
    }
    const sideC: Pt = [sx / n, sy / n + 10]
    const k = smooth(sideness)
    const center = lerpPt(SOFT_SIT, sideC, k)
    const rs = rayPolys(side, center)
    const rf = rayPolys(front, center)
    const r = new Float64Array(SOFT_RAYS)
    for (let i = 0; i < SOFT_RAYS; i++) r[i] = lerp(rf[i], rs[i], k)
    drawRadial(c, r, center)
    // хвосты: при развороте один втягивается, другой вырастает
    const sideTail = smooth(clamp(sideness * 2 - 1, 0, 1))
    const frontTail = smooth(clamp(1 - sideness * 2, 0, 1))
    if (sideTail > 0.02) this.drawSideBody(c, now, sideTail, false)
    if (frontTail > 0.02) {
      const [tbx, tby, tmx, tmy, ttx, tty] = pose.tail
      const sway = Math.sin(now / 760) * 9
      c.lineWidth = 11
      c.beginPath()
      bezierPart(c, [[tbx, tby], [tmx + sway * 0.2, tmy + 10], [tmx + sway * 0.6, tmy - 10], [ttx + sway, tty + Math.abs(sway) * 0.2]], frontTail, true)
      c.stroke()
    }
  }

  // ---------- кот сбоку (ходьба, бег, «сидя боком») ----------

  /**
   * Перевод «единиц раскадровки» в сцену; на бегу корпус ещё и качается вперёд-назад (тангаж)
   * вокруг середины тела.
   */
  protected sideTransform(c: CanvasRenderingContext2D, m: SideMotion): void {
    c.translate(C, G - 1)
    c.scale(SIDE_SCALE, SIDE_SCALE)
    c.translate(-SIDE_CX, -SIDE_GROUND)
    if (m.pitch) {
      c.translate(350, 420)
      c.rotate(m.pitch)
      c.translate(-350, -420)
    }
  }

  /** Точка из единиц раскадровки — в сцену (с тем же тангажом, что и тело). */
  protected sidePoint(x: number, y: number, m: SideMotion): Pt {
    const cos = Math.cos(m.pitch)
    const sin = Math.sin(m.pitch)
    const dx = x - 350
    const dy = y - 420
    const rx = 350 + dx * cos - dy * sin
    const ry = 420 + dx * sin + dy * cos
    return [C + (rx - SIDE_CX) * SIDE_SCALE, G - 1 + (ry - SIDE_GROUND) * SIDE_SCALE]
  }

  /**
   * Пластика в фазе u. Шаг: тело мягко проседает дважды за цикл, плечи и таз покачиваются
   * попеременно. Галоп: корпус то вытягивается (ext > 0: передние лапы впереди, задние сзади),
   * то собирается, в собранной фазе — «полёт» над землёй, и качается вперёд-назад.
   */
  protected sideMotion(u: number): SideMotion {
    const tau = Math.PI * 2
    const r = this.runBlend
    const amp = this.walkBlend * (1 - r) * (1 - this.sitK)
    // фазы лап сдвинуты на 1/8 цикла (подобраны по раскадровке) — пластика сдвинута так же
    const w = u + 0.125
    // живее: корпус заметно проседает на каждом шаге, плечи и таз перекатываются
    const dip = (1 - Math.cos(w * tau * 2)) * 4.5 * amp
    const gallop = this.walkBlend * r * (1 - this.sitK)
    const lift = -Math.pow(Math.max(0, Math.cos(tau * (u - 0.47))), 2) * 26 * gallop
    return {
      sh: dip - Math.sin(tau * (w + 0.05)) * 5.5 * amp + lift, // передние лапы
      hp: dip - Math.sin(tau * (w + 0.3)) * 5.5 * amp + lift, // задние
      ext: Math.cos(tau * u) * 16 * gallop,
      pitch: Math.sin(tau * (u - 0.15)) * 0.07 * gallop
    }
  }

  /** Центр головы сбоку в сцене: сидит на груди, идёт за плечами и мягко кивает; сидя — выше. */
  protected sideHead(): { x: number; y: number; rot: number } {
    const u = this.gait
    const amp = this.walkBlend * (1 - this.runBlend) * (1 - this.sitK)
    const m = this.sideMotion(u)
    const lag = this.sideMotion((u - 0.07 + 1) % 1)
    // голова идёт за плечами с запаздыванием и мягко кивает
    const nod = Math.sin((u + 0.125 - 0.12) * Math.PI * 4) * 5 * amp
    const [x, y] = lerpPt(lerpPt([SIDE_STAND.head[0] + m.ext, SIDE_STAND.head[1] + lag.sh + nod], SIDE_SIT.head, this.sitK), STRETCH_HEAD, this.stretch)
    const [sx, sy] = this.sidePoint(x, y, m)
    return { x: sx, y: sy, rot: Math.sin((u - 0.1) * Math.PI * 4) * 0.02 * amp + m.pitch - this.sitK * 0.03 - this.stretch * 0.1 }
  }

  /** Геометрия лапы в фазе шага/галопа, с переходом в позу «сидя» (единицы раскадровки). */
  protected sideLeg(l: SideLeg, u: number, m: SideMotion): { hx: number; hy: number; kx: number; ky: number; ax: number; ay: number; px: number; py: number; tilt: number } {
    const amp = this.walkBlend
    const r = this.runBlend
    const v = (u + lerp(l.phase, l.run, r)) % 1
    const stance = lerp(SIDE_GAIT.stance, 0.38, r)
    // по раскадровке задние лапы шагают шире передних (отставляются далеко назад)
    const stride = lerp(l.front ? SIDE_GAIT.strideFront : SIDE_GAIT.strideHind, 200, r)
    let dx: number
    let lift = 0
    let flex = 0 // сгиб в переносе, 0…1
    if (v < stance) {
      dx = stride / 2 - (v / stance) * stride
    } else {
      const w = (v - stance) / (1 - stance)
      dx = -stride / 2 + easeInOut(w) * stride
      flex = Math.sin(Math.PI * Math.pow(w, 0.85))
      lift = flex * lerp(SIDE_GAIT.lift, 46, r)
    }
    dx *= amp
    lift *= amp
    flex *= amp
    const shift = l.front ? m.ext : -m.ext
    const k = this.sitK
    const hx = lerp(l.hipX + shift, l.sitHip[0], k)
    const hy = lerp(HIP_Y + (l.front ? m.sh : m.hp), l.sitHip[1], k)
    const px = lerp(l.hipX + shift + dx + l.reach, l.sitPaw[0], k)
    const py = lerp(SIDE_GROUND - PAW_RY - lift, l.sitPaw[1], k)
    flex *= 1 - k
    // «щиколотка» над лапкой; в переносе лапка подгибается назад, колено выносится вперёд
    const ax = px - (l.front ? 4 + flex * 14 : 6 + flex * 10)
    const ay = py - 16 + flex * 4
    const kx = (hx + ax) / 2 + flex * (l.front ? 16 : 10)
    const ky = (hy + ay) / 2 - flex * 4
    // отталкивается носком в конце опоры и мягко ставит лапку (не «утюгом»)
    let roll = 0
    if (v < stance) {
      const s = v / stance
      roll = -smooth(clamp((s - 0.75) / 0.25, 0, 1)) * 0.35 + (1 - smooth(clamp(s / 0.15, 0, 1))) * 0.12
    }
    roll *= amp * (1 - k)
    const g = { hx, hy, kx, ky, ax, ay, px, py: py - Math.max(0, -roll) * 10, tilt: (l.front ? flex * 0.55 : flex * 0.35) + roll }
    const sk = this.stretch
    if (sk <= 0) return g
    // потягивается: передние лапы лежат вытянутыми вперёд (локоть у земли), задние — прямые
    const t = l.front
      ? { hx: l.hipX + 22, hy: 452, kx: l.hipX + 60, ky: 497, ax: l.hipX + 110, ay: 504, px: l.hipX + 118, py: 510, tilt: 0 }
      : { hx: l.hipX, hy: 368, kx: l.hipX - 8, ky: 440, ax: l.hipX - 6, ay: 494, px: l.hipX, py: 508, tilt: 0 }
    for (const key of Object.keys(g) as (keyof typeof g)[]) g[key] = lerp(g[key], t[key], sk)
    return g
  }

  /** Контур тела, бедро и хвост в текущей фазе: стоит/идёт → бежит → сидит. */
  protected sideShape(m: SideMotion): { body: Pt[]; thigh: SideShape['thigh']; tail: SideShape['tail'] } {
    const k = this.sitK
    const sk = this.stretch
    // потягиваясь, держит позу — круп чуть подрагивает
    const shiver = sk > 0.9 ? Math.sin(performance.now() / 38) * 3 * (sk - 0.9) * 10 : 0
    const body = SIDE_STAND.body.map(([x, y, w], i): Pt => {
      const [sx, sy] = SIDE_SIT.body[i]
      const p: Pt = [lerp(x + (2 * w - 1) * m.ext, sx, k), lerp(y + w * m.sh + (1 - w) * m.hp, sy, k)]
      if (sk <= 0) return p
      const q = lerpPt(p, stretchPt([x, y]), sk)
      return [q[0] + shiver * Math.max(0, 1 - w * 2), q[1]]
    })
    const [tx, ty, trx, try_, trot] = SIDE_STAND.thigh
    const thigh = [tx - m.ext, ty + m.hp, trx, try_, trot].map((v, i) => lerp(v, SIDE_SIT.thigh[i], k)) as SideShape['thigh']
    if (sk > 0) {
      const [qx, qy] = stretchPt([tx, ty])
      thigh[0] = lerp(thigh[0], qx + shiver, sk)
      thigh[1] = lerp(thigh[1], qy, sk)
    }
    const tail = SIDE_STAND.tail.map((p, i) => {
      const run = lerpPt(p, RUN_TAIL[i], this.runBlend)
      const moved: Pt = i === 0 ? [run[0] - m.ext, run[1] + m.hp] : run
      return lerpPt(lerpPt(moved, SIDE_SIT.tail[i], k), STRETCH_TAIL[i], sk)
    }) as SideShape['tail']
    return { body, thigh, tail }
  }

  /**
   * Уголёк сбоку по раскадровке: длинное толстое тело, большой круглый круп, короткие толстые
   * лапы с круглыми лапками, тонкий хвост с верха крупа. Голова — та же, что анфас.
   */
  /** tailPart — какая доля хвоста видна (при развороте хвост втягивается / вырастает). */
  protected drawSideBody(c: CanvasRenderingContext2D, now: number, tailPart = 1, bodyToo = true): void {
    const u = this.gait
    const m = this.sideMotion(u)
    c.save()
    this.sideTransform(c, m)
    const shape = this.sideShape(m)

    const drawLeg = (l: SideLeg): void => {
      const g = this.sideLeg(l, u, m)
      const k = l.far ? 0.94 : 1
      const top = (l.front ? 40 : 46) * k
      const knee = (l.front ? 37 : 40) * k
      this.limb(c, g.hx, g.hy, g.kx, g.ky, top, knee)
      this.limb(c, g.kx, g.ky, g.ax, g.ay, knee, 34 * k)
      c.beginPath()
      c.ellipse(g.px + 10, g.py, 44 * k, PAW_RY, -g.tilt, 0, Math.PI * 2)
      c.fill()
    }
    if (bodyToo) SIDE_LEGS.filter((l) => l.far).forEach(drawLeg)

    // хвост: из крупа вверх «скобкой», кончик круглый; по нему бежит мягкая волна от основания
    const [p0, p1, p2, p3] = shape.tail
    const waveAmp = (1 - this.sitK) * (this.walkBlend * 18 + this.runBlend * 6)
    const N = tailPart > 0.01 ? 44 : -1
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tailPart
      const a = (1 - t) ** 3
      const b = 3 * (1 - t) ** 2 * t
      const cc = 3 * (1 - t) * t * t
      const d = t ** 3
      const x = a * p0[0] + b * p1[0] + cc * p2[0] + d * p3[0]
      const y = a * p0[1] + b * p1[1] + cc * p2[1] + d * p3[1]
      const tx = 3 * (1 - t) ** 2 * (p1[0] - p0[0]) + 6 * (1 - t) * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0])
      const ty = 3 * (1 - t) ** 2 * (p1[1] - p0[1]) + 6 * (1 - t) * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])
      const len = Math.hypot(tx, ty) || 1
      const off = Math.pow(t, 1.5) * (Math.sin(u * Math.PI * 2 - t * 2.4) * waveAmp + Math.sin(now / 900 - t * 2.2) * 7)
      c.beginPath()
      c.arc(x - (ty / len) * off, y + (tx / len) * off, 27 - t * 2, 0, Math.PI * 2)
      c.fill()
    }

    if (!bodyToo) {
      c.restore()
      return
    }
    // тело
    const pts = shape.body
    c.beginPath()
    c.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i + 2 < pts.length; i += 3) c.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1])
    c.closePath()
    c.fill()
    // круглое бедро ближней задней лапы
    const [tx, ty, trx, try_, trot] = shape.thigh
    c.beginPath()
    c.ellipse(tx, ty, trx, try_, trot, 0, Math.PI * 2)
    c.fill()

    SIDE_LEGS.filter((l) => !l.far).forEach(drawLeg)
    c.restore()
  }

  /** Тонкие светлые линии внутри силуэта — как на раскадровке: отделяют ближние лапы и бедро от тела. */
  protected drawSideDetails(c: CanvasRenderingContext2D): void {
    const m = this.sideMotion(this.gait)
    c.save()
    this.sideTransform(c, m)
    const shape = this.sideShape(m)
    c.strokeStyle = 'rgba(255,255,255,0.2)'
    c.lineWidth = 3
    c.lineCap = 'round'
    // потягивается — линии движения за поднятым крупом
    if (this.stretch > 0.7) {
      const [rx, ry] = shape.body[8]
      c.save()
      c.strokeStyle = `rgba(255,255,255,${((this.stretch - 0.7) / 0.3) * 0.5})`
      c.lineWidth = 4.5
      for (const i of [0, 1]) {
        const x = rx - 45 - i * 24
        c.beginPath()
        c.moveTo(x, ry - 70 + i * 12)
        c.quadraticCurveTo(x - 14, ry - 30, x, ry + 10 - i * 12)
        c.stroke()
      }
      c.restore()
    }
    // бедро: передний край дугой
    const [tx, ty, trx, try_, trot] = shape.thigh
    c.beginPath()
    c.ellipse(tx, ty, trx, try_, trot, -0.05, 0.95)
    c.stroke()
    for (const l of SIDE_LEGS.filter((leg) => !leg.far)) {
      const g = this.sideLeg(l, this.gait, m)
      // задний край лапы — от тела до щиколотки
      const len = Math.hypot(g.ax - g.hx, g.ay - g.hy) || 1
      const nx = (g.hy - g.ay) / len
      const ny = (g.ax - g.hx) / len
      c.beginPath()
      if (l.front) {
        c.moveTo(g.hx + nx * 40, g.hy + ny * 40 - 6)
        c.quadraticCurveTo(g.kx + nx * 37, g.ky + ny * 37, g.ax + nx * 33, g.ay + ny * 33 + 4)
      } else {
        c.moveTo(g.kx - nx * 38, g.ky - ny * 38)
        c.lineTo(g.ax - nx * 33, g.ay - ny * 33 + 4)
      }
      c.stroke()
    }
    c.restore()
  }

  /** Сужающееся звено лапы с круглыми суставами. */
  protected limb(c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, wa: number, wb: number): void {
    const a = Math.atan2(by - ay, bx - ax) + Math.PI / 2
    c.beginPath()
    c.moveTo(ax + Math.cos(a) * wa, ay + Math.sin(a) * wa)
    c.lineTo(bx + Math.cos(a) * wb, by + Math.sin(a) * wb)
    c.lineTo(bx - Math.cos(a) * wb, by - Math.sin(a) * wb)
    c.lineTo(ax - Math.cos(a) * wa, ay - Math.sin(a) * wa)
    c.closePath()
    c.fill()
    c.beginPath()
    c.arc(ax, ay, wa, 0, Math.PI * 2)
    c.fill()
    c.beginPath()
    c.arc(bx, by, wb, 0, Math.PI * 2)
    c.fill()
  }

  /** side — голова в профиль на три четверти: дальнее (заднее) ухо сидит у самого края головы. */
  /** s3 — насколько голова в профиль на три четверти (0 — анфас, 1 — сбоку, как на раскадровке). */
  /** Уши в последнем кадре (основание внутри, кончик, основание снаружи) — для белых линий внутри уха. */
  protected earPts: [number, number, number, number, number, number][] = []

  /** Белая линия внутри уха — как у кролика (одна линия, повторяет ухо со стороны кончика). */
  private drawEarLines(c: CanvasRenderingContext2D): void {
    c.save()
    c.strokeStyle = EYE
    c.lineWidth = 1.3
    c.lineCap = 'round'
    c.lineJoin = 'round'
    for (const e of this.earPts) {
      if (!e) continue
      const [ix, iy, tx, ty, ox, oy] = e
      // центр уха (по видимой части: основание у макушки — ниже кончика)
      const gx = (ix + tx + ox) / 3
      const gy = (iy + ty + oy) / 3 - 2
      const at = (x: number, y: number, k: number): [number, number] => [lerp(x, gx, k), lerp(y, gy, k)]
      const a = at(lerp(ix, tx, 0.25), lerp(iy, ty, 0.25), 0.5)
      const b = at(tx, ty, 0.36)
      const cc = at(lerp(ox, tx, 0.25), lerp(oy, ty, 0.25), 0.5)
      const ca = at(lerp(ix, tx, 0.7), lerp(iy, ty, 0.7), 0.42)
      const cb = at(lerp(ox, tx, 0.7), lerp(oy, ty, 0.7), 0.42)
      // на внешнем конце — лёгкая завитушка внутрь уха (как у кролика), не ровная палочка
      const hook: [number, number] = [cc[0] + (gx - cc[0]) * 0.5, cc[1] - 0.5]
      const hookC: [number, number] = [cc[0] + (gx - cc[0]) * 0.05, cc[1] + 5.5]
      c.beginPath()
      c.moveTo(a[0], a[1])
      c.quadraticCurveTo(ca[0], ca[1], b[0], b[1])
      c.quadraticCurveTo(cb[0], cb[1], cc[0], cc[1])
      c.quadraticCurveTo(hookC[0], hookC[1], hook[0], hook[1])
      c.stroke()
    }
    c.restore()
  }

  protected drawHeadShape(c: CanvasRenderingContext2D, s3 = 0): void {
    const turn = this.turn
    const perk = this.alert * 6
    // лёжа голова «расслаблена»: шире и площе, щёчки, уши по краям и короче (раскадровка сна)
    const relax = this.wLoaf * (1 - s3)
    // Голова — широкий овал с «щёчками» (первая версия, понравилась).
    const hx0 = turn * 4
    const hrx = 46 - Math.abs(turn) * 3
    const hry = 40
    // Уши — как в первой версии, но нижний внешний угол уха поставлен ровно на контур головы
    // (раньше он вылезал за голову треугольником). Остальная часть основания закрыта головой.
    const ear = (side: number, twitch: number): void => {
      const base = side * 30 - turn * 10
      const edgeY = -20
      const edgeX = hx0 + side * hrx * Math.sqrt(1 - (edgeY / hry) ** 2)
      const innerX = base - side * 22
      // Кончик всегда над основанием в тех же пропорциях, что и без поворота: ширина уха
      // меняется только вместе с основанием.
      let tipX = innerX + (edgeX - innerX) * 0.79
      let tipY = -66 - (side === Math.sign(turn) ? 0 : Math.abs(turn) * 4)
      let [ix, iy, ox, oy] = [innerX, -22, edgeX, edgeY]
      if (s3 > 0) {
        // сбоку — уши как на раскадровке: стоят ближе друг к другу, дальнее — у края головы
        const e = SIDE_EARS[side < 0 ? 0 : 1]
        ix = lerp(ix, e.inner[0], s3)
        iy = lerp(iy, e.inner[1], s3)
        ox = lerp(ox, e.outer[0], s3)
        oy = lerp(oy, e.outer[1], s3)
        tipX = lerp(tipX, e.tip[0], s3)
        tipY = lerp(tipY, e.tip[1], s3)
      }
      let [c1x, c1y] = [tipX - side * 8, lerp(iy, tipY, 0.6)]
      let [c2x, c2y] = [tipX + side * 6, lerp(oy, tipY, 0.45)]
      if (relax > 0) {
        const e = LOAF_EARS[side < 0 ? 0 : 1]
        ix = lerp(ix, e.inner[0], relax)
        iy = lerp(iy, e.inner[1], relax)
        ox = lerp(ox, e.outer[0], relax)
        oy = lerp(oy, e.outer[1], relax)
        tipX = lerp(tipX, e.tip[0], relax)
        tipY = lerp(tipY, e.tip[1], relax)
        // края уха почти прямые, внешний продолжает бок головы
        c1x = lerp(c1x, (ix + tipX) / 2, relax)
        c1y = lerp(c1y, (iy + tipY) / 2, relax)
        c2x = lerp(c2x, (tipX + ox) / 2 + side * 1.5, relax)
        c2y = lerp(c2y, (tipY + oy) / 2, relax)
      }
      // подёргивание; в профиль мягче — иначе кончик загибается и ухо кажется сломанным
      const tw = twitch * (1 - s3 * 0.5)
      tipX += side * tw * 6
      tipY += -perk + tw * 6
      this.earPts[side < 0 ? 0 : 1] = [ix, iy, tipX, tipY, ox, oy]
      c.beginPath()
      c.moveTo(ix, iy)
      c.quadraticCurveTo(c1x, c1y, tipX, tipY)
      c.quadraticCurveTo(c2x, c2y, ox, oy)
      c.lineTo(lerp(ix, ox, 0.5), lerp(iy, oy, 0.5) + 16)
      c.closePath()
      c.fill()
    }
    ear(-1, this.earL)
    ear(1, this.earR)
    if (relax > 0.001) {
      // овал → «скруглённый квадрат»: плоская макушка, почти отвесные бока
      const a = lerp(hrx, LOAF_HEAD.a, relax)
      const b = lerp(hry, LOAF_HEAD.b, relax)
      const e = 2 / (2 + LOAF_HEAD.square * relax)
      c.beginPath()
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2
        const cx = Math.cos(t)
        const cy = Math.sin(t)
        const x = hx0 + a * Math.sign(cx) * Math.abs(cx) ** e
        const y = b * Math.sign(cy) * Math.abs(cy) ** e
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.fill()
    } else {
      c.beginPath()
      c.ellipse(hx0, 0, hrx, hry, 0, 0, Math.PI * 2)
      c.fill()
    }
    // щёчки; сбоку — поменьше, чтобы не выпирали за контур головы (как на раскадровке);
    // лёжа — пухлые, выпирают по бокам внизу
    for (const side of [-1, 1]) {
      c.beginPath()
      c.ellipse(
        lerp(side * 30 + turn * 2 - side * s3 * 4, side * LOAF_HEAD.cheekX, relax),
        lerp(14, LOAF_HEAD.cheekY, relax),
        lerp(18 - s3 * 4, LOAF_HEAD.cheekRx, relax),
        lerp(14 - s3 * 2, LOAF_HEAD.cheekRy, relax),
        lerp(-side * 0.4, 0, relax),
        0,
        Math.PI * 2
      )
      c.fill()
    }
  }

  protected drawFace(c: CanvasRenderingContext2D, anim: string, t: number, now: number, input: RigInput, s3 = 0): void {
    const fx = this.turn * 22
    const ex = 18
    // лёжа голова площе — глаза чуть ниже
    const ey0 = 2 + this.wLoaf * (1 - s3) * 5
    const squeezeNear = 1 - Math.abs(this.turn) * 0.18
    const blinking = now - this.blinkAt < 140
    const slow = this.affection
    c.lineCap = 'round'
    c.lineJoin = 'round'
    this.drawEarLines(c)

    // потягиваясь, зевает
    const stretchYawn = clamp((this.stretch - 0.6) / 0.4, 0, 1)
    // спит — глаза-дуги шире и толще (как на раскадровке)
    const sleepyArc = anim === 'sleep' && this.sleepT >= SLEEP_DEEP ? 1 : 0
    const closedArc = (x: number, up: boolean, ey: number): void => {
      const w = 9 + sleepyArc * 2.5
      c.strokeStyle = EYE
      c.lineWidth = 3.2 + sleepyArc * 0.6
      c.beginPath()
      if (up) {
        c.moveTo(x - w, ey + 3)
        c.quadraticCurveTo(x, ey - 7, x + w, ey + 3)
      } else {
        c.moveTo(x - w, ey)
        c.quadraticCurveTo(x, ey + 7 + sleepyArc, x + w, ey)
      }
      c.stroke()
    }

    const eye = (side: number): void => {
      // дальний глаз (в сторону поворота) меньше — перспектива, как на раскадровке
      const far = side === Math.sign(this.turn)
      const narrow = far ? 1 - Math.abs(this.turn) * 0.5 : 1
      const x = fx + side * ex * (far ? 1 : squeezeNear)
      // сбоку ближний глаз чуть ниже дальнего
      const ey = ey0 + s3 * (side < 0 ? 3.3 : -1.6)
      const listening = anim === 'music' && this.phones > 0.75 && this.wDangle < 0.5
      if (anim === 'yawn' || listening || stretchYawn > 0.4) return closedArc(x, listening, ey)
      // засыпает: зевнул, закрыл глаза — так и засыпает, глаза снова не открывает (как кролик)
      if (anim === 'sleep') return closedArc(x, false, ey)
      if (anim === 'laugh') return closedArc(x, true, ey)
      if (anim === 'dizzy') {
        c.strokeStyle = EYE
        c.lineWidth = 2.4
        c.beginPath()
        for (let a = 0; a < Math.PI * 4.5; a += 0.3) {
          const r = (a / (Math.PI * 4.5)) * 10
          const px = x + Math.cos(a + t * 8) * r
          const py = ey + Math.sin(a + t * 8) * r
          if (a === 0) c.moveTo(px, py)
          else c.lineTo(px, py)
        }
        c.stroke()
        return
      }
      if (anim === 'love') {
        c.fillStyle = PINK
        c.beginPath()
        const k = 0.75 + Math.sin(t * 10) * 0.08
        c.moveTo(x, ey + 7 * k)
        c.bezierCurveTo(x - 12 * k, ey - 2 * k, x - 7 * k, ey - 11 * k, x, ey - 5 * k)
        c.bezierCurveTo(x + 7 * k, ey - 11 * k, x + 12 * k, ey - 2 * k, x, ey + 7 * k)
        c.fill()
        return
      }
      // Простые глаза: белый овал и чёрная точка, без бликов.
      const surprised = input.mode === 'drag'
      const open = blinking ? 0.12 : 1 - slow * 0.55
      const ry = (surprised ? 15 : 13) * open * (far ? 1 - Math.abs(this.turn) * 0.23 : 1)
      const rx = (surprised ? 13 : 11.5) * narrow
      c.fillStyle = EYE
      c.beginPath()
      c.ellipse(x, ey, rx, Math.max(1.2, ry), 0, 0, Math.PI * 2)
      c.fill()
      if (open > 0.3) {
        const pr = surprised ? 3.4 : this.pupil
        const px = x + this.lookX * (rx - pr - 1.5) * 0.8
        const py = ey + this.lookY * (ry - pr - 1.5) * 0.7
        c.fillStyle = INK
        c.beginPath()
        c.arc(px, py, pr, 0, Math.PI * 2)
        c.fill()
        // блики, как у кролика: большой сверху справа и маленький снизу слева — глаза «живые», влажные
        c.save()
        c.beginPath()
        c.ellipse(x, ey, rx, Math.max(0.6, ry), 0, 0, Math.PI * 2)
        c.clip()
        c.fillStyle = EYE
        c.beginPath()
        c.arc(px + pr * 0.32, py - pr * 0.4, pr * 0.36, 0, Math.PI * 2)
        c.fill()
        c.beginPath()
        c.arc(px - pr * 0.38, py + pr * 0.42, pr * 0.16, 0, Math.PI * 2)
        c.fill()
        c.restore()
      }
    }
    eye(-1)
    eye(1)

    // засыпая, сначала прислушивается — у уха линии «дёрнулось»
    if (anim === 'sleep' && this.sleepT < 1.4) {
      c.save()
      c.globalAlpha = Math.sin((Math.PI * this.sleepT) / 1.4) * 0.8
      c.strokeStyle = '#ffffff'
      c.lineWidth = 1.6
      for (const [x0, y0, x1, y1] of [
        [50, -60, 56, -69],
        [55, -52, 64, -56],
        [56, -43, 65, -43]
      ]) {
        c.beginPath()
        c.moveTo(x0, y0)
        c.lineTo(x1, y1)
        c.stroke()
      }
      c.restore()
    }

    // нос (ярче — розовый, как у кролика) и рот
    c.fillStyle = PINK
    c.beginPath()
    c.ellipse(fx * 1.1, 14, 2.6, 1.8, 0, 0, Math.PI * 2)
    c.fill()
    let mouthOpen = 0
    if (anim === 'talk') mouthOpen = 0.35 + Math.abs(Math.sin(t * 13)) * 0.65
    if (anim === 'laugh') mouthOpen = 0.9
    if (anim === 'yawn') mouthOpen = Math.sin(Math.min(1, t / 1.5) * Math.PI) * 1.6
    mouthOpen = Math.max(mouthOpen, stretchYawn * 1.4)
    if (input.mode === 'drag') mouthOpen = 0.45
    if (mouthOpen > 0.05) {
      c.fillStyle = PINK
      c.beginPath()
      c.ellipse(fx * 1.1, 21 + mouthOpen * 2, 4 + mouthOpen * 1.5, 1.5 + mouthOpen * 4, 0, 0, Math.PI * 2)
      c.fill()
    }

    // усы
    c.strokeStyle = 'rgba(235,235,235,0.75)'
    c.lineWidth = 1.2
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const wob = Math.sin(now / 400 + i + side) * 1.2
        c.beginPath()
        c.moveTo(fx * 1.1 + side * 20, 13 + i * 4)
        c.lineTo(fx * 1.1 + side * (48 + i * 2), 9 + i * 7 + wob)
        c.stroke()
      }
    }

    // наушники — как у кролика: проводные вкладыши в уши (не дужка на голове); провода идут за головой и
    // из-под щёк сходятся на груди буквой Y
    if (this.phones > 0.01) {
      const on = easeInOut(this.phones)
      const WIRE = '#d6d6d1'
      const hx0 = this.turn * 4
      const hrx = 46 - Math.abs(this.turn) * 3
      c.save()
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.globalAlpha = clamp((this.phones - 0.25) / 0.5, 0, 1)
      // провод: от вкладыша — дугой наружу и за голову (виден только эта дуга у края головы), дальше идёт за
      // головой и выходит из-под щеки на шею; где он за головой — не рисуем
      c.save()
      c.beginPath()
      c.rect(-400, -400, 800, 800)
      c.ellipse(hx0, 0, hrx + 1.5, 41.5, 0, 0, Math.PI * 2)
      c.clip('evenodd')
      c.strokeStyle = WIRE
      c.lineWidth = 1.4
      const jx = hx0
      const jy = 74
      for (const side of [-1, 1]) {
        // начинается с конца «ножки» вкладыша (внизу капельки)
        const bx = hx0 + side * 27 + side * 2.6
        const by = -44 + 4 + 5.6 * 0.4
        c.beginPath()
        c.moveTo(bx, by)
        c.bezierCurveTo(bx + side * 4, by + 2, hx0 + side * (hrx - 3), -31, hx0 + side * (hrx - 2), -22)
        c.bezierCurveTo(hx0 + side * (hrx - 2), -8, hx0 + side * 34, 25, hx0 + side * 24, 52)
        c.quadraticCurveTo(hx0 + side * 12, jy - 8, jx, jy)
        c.stroke()
      }
      c.beginPath()
      c.moveTo(jx, jy)
      c.quadraticCurveTo(jx - 7, jy + 20, jx + 3, jy + 40)
      c.stroke()
      c.fillStyle = WIRE
      c.beginPath()
      c.ellipse(jx, jy + 1, 2.2, 3.2, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
      // вкладыши — у основания уха: белая капелька с розовой сеточкой
      c.globalAlpha = clamp(this.phones * 2.5, 0, 1)
      for (const side of [-1, 1]) {
        const bx = hx0 + side * 27
        const by = -44
        const r = 5.6 * (0.4 + 0.6 * on) * (1 + Math.sin(on * Math.PI) * 0.25)
        c.fillStyle = '#f4f4f0'
        c.beginPath()
        c.ellipse(bx, by, r, r * 1.05, 0, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#f4f4f0'
        c.lineWidth = 3 * on
        c.beginPath()
        c.moveTo(bx + side * 1, by + r * 0.6)
        c.lineTo(bx + side * 2.6, by + 4 + r * 0.4)
        c.stroke()
        c.fillStyle = PINK
        c.beginPath()
        c.ellipse(bx - side * 0.7, by - 0.5, r * 0.42, r * 0.46, 0, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }
  }

  protected drawParticles(c: CanvasRenderingContext2D, now: number): void {
    for (const p of this.particles) {
      const age = (now - p.born) / p.life
      if (age < 0) continue
      if (p.kind === 'scratch') {
        drawScratchMark(c, p.x, p.y, p.size, now - p.born, age)
        continue
      }
      if (p.kind === 'fog') {
        drawFog(c, p.x, p.y, age)
        continue
      }
      const s = age * (p.life / 1000)
      const x = p.x + p.vx * s + Math.sin(s * 5 + p.born) * 4
      const y = p.y + p.vy * s
      const alpha = (age < 0.15 ? age / 0.15 : 1 - Math.max(0, (age - 0.55) / 0.45)) * (p.fadeAt === undefined ? 1 : 1 - (now - p.fadeAt) / 300)
      c.save()
      c.globalAlpha = clamp(alpha, 0, 1)
      c.translate(x, y)
      c.rotate(p.spin * s)
      c.scale(p.size, p.size)
      if (p.kind === 'note') {
        // Фиолетовая нота с белой обводкой — видна и на светлом, и на тёмном столе.
        const note = (): void => {
          c.beginPath()
          c.ellipse(0, 0, 4.8, 3.6, -0.4, 0, Math.PI * 2)
          c.moveTo(4.2, -1)
          c.lineTo(4.2, -16)
          c.quadraticCurveTo(9.5, -13, 10.5, -8)
        }
        c.lineCap = 'round'
        c.strokeStyle = '#ffffff'
        c.lineWidth = 5
        note()
        c.stroke()
        c.fillStyle = '#7b6cff'
        c.strokeStyle = '#7b6cff'
        c.lineWidth = 2.2
        note()
        c.stroke()
        c.beginPath()
        c.ellipse(0, 0, 4.8, 3.6, -0.4, 0, Math.PI * 2)
        c.fill()
      } else if (p.kind === 'heart') {
        c.fillStyle = PINK
        c.beginPath()
        c.moveTo(0, 6)
        c.bezierCurveTo(-11, -2, -6, -10, 0, -4)
        c.bezierCurveTo(6, -10, 11, -2, 0, 6)
        c.fill()
      } else if (p.kind === 'z') {
        // растёт, пока поднимается
        const z = this.zLook
        const g = (0.8 + age * z.grow) * z.size
        c.scale(g, g)
        c.font = 'bold 26px -apple-system, Segoe UI, sans-serif'
        if (z.rim) {
          c.strokeStyle = z.rim
          c.lineWidth = 3 / g
          c.lineJoin = 'round'
          c.strokeText('z', 0, 0)
        }
        c.fillStyle = z.fill
        c.fillText('z', 0, 0)
      } else {
        const a = s * 7
        c.translate(Math.cos(a) * 28, Math.sin(a) * 8)
        c.fillStyle = '#ffd84a'
        c.beginPath()
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 6 : 2.5
          const ang = (Math.PI / 5) * i - Math.PI / 2
          c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r)
        }
        c.closePath()
        c.fill()
      }
      c.restore()
    }
  }
}
