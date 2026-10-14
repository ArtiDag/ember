// Стенд для проверки «кукол» (Уголёк, кролик) в браузере, без Electron.
// Открыть любую страницу dev-сервера (например, http://localhost:5173/common/rigs/bunny.ts) и в консоли:
//   await import('/@fs/<путь к проекту>/scripts/rig-harness.js')
//   await loadRig('bunny')            // или 'blackCat'
//   summary()                         // все сценарии: ошибки, NaN, рывки, обрезка краем окна
//   sheet(runScenario('walk_right', { capture: i => i % 20 === 0 }).thumbs)   // контактный лист кадров
// Сценарии повторяют то, что присылает main: скорость окна с паузой на разворот, разгоном и торможением.

// корень проекта — из адреса этого скрипта (/@fs/<проект>/scripts/rig-harness.js)
const ROOT = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/@fs/, '').replace(/scripts\/rig-harness\.js$/, '')
// окно как в приложении при размере 128: ширина кадра персонажа + запас по бокам (motion.ts)
let VIEW = { width: 155, height: 166 }
const DPR = 2
let W = VIEW.width * DPR
let H = VIEW.height * DPR
const BASE = 33
const RUN = 125

const ramp = (v) => {
  const t = Math.min(1, Math.max(0, v))
  return t * t * (3 - 2 * t)
}
const walkSpeed = (top, dur, decel = true, delay = 1.08, acc = 0.45) => (t) => top * ramp((t - delay) / acc) * (decel ? ramp((dur - t) / acc) : 1)
const seg = (dur, animation, o = {}) => ({
  dur,
  animation,
  mode: o.mode ?? (['idle', 'talk', 'music', 'sleep'].includes(animation) ? 'idle' : animation === 'walk' ? 'walk' : animation === 'drag' ? 'drag' : 'react'),
  ...o
})
const walk = (dur, o = {}) => seg(dur, 'walk', { speed: walkSpeed(o.top ?? BASE, dur, o.decel ?? true, o.delay ?? 1.08), ...o })
const circle = (t) => ({ x: 77 + Math.cos(t * 1.3) * 140, y: 90 + Math.sin(t * 1.7) * 120 })

export const SCENARIOS = {
  idle_pointer: [seg(9, 'idle', { pointer: circle })],
  walk_right: [seg(2, 'idle'), walk(6), seg(4, 'idle')],
  walk_left: [seg(2, 'idle'), walk(6, { flip: true }), seg(4, 'idle', { flip: true })],
  run: [seg(1.5, 'idle'), walk(4, { top: RUN }), seg(4, 'idle')],
  turn_back: [seg(1, 'idle'), walk(3, { decel: false }), walk(4, { flip: true, delay: 1.3 }), seg(3, 'idle', { flip: true })],
  drag: [seg(1, 'idle'), seg(3, 'drag'), seg(3, 'idle')],
  reactions: [seg(1, 'idle'), seg(0.9, 'laugh'), seg(1.2, 'idle'), seg(1.6, 'love'), seg(1.2, 'idle'), seg(1.6, 'dizzy'), seg(2, 'idle')],
  talk_music: [seg(1, 'idle'), seg(3, 'talk'), seg(1, 'idle'), seg(16, 'music'), seg(4, 'idle')],
  sleep_wake: [seg(1, 'idle'), seg(1.6, 'yawn'), seg(16, 'sleep'), seg(9, 'idle')],
  scratch: [seg(1, 'idle'), seg(3.8, 'scratch'), seg(3, 'idle')],
  peek: [seg(1, 'idle'), walk(3, { decel: false }), seg(10.3, 'peek'), seg(4, 'idle', { flip: true })],
  peek_from_idle: [seg(1, 'idle'), seg(10.3, 'peek'), seg(4, 'idle', { flip: true })],
  sleep_then_drag: [seg(1.6, 'yawn'), seg(6, 'sleep'), seg(2, 'drag'), seg(6, 'idle')],
  wake_then_walk: [seg(1.6, 'yawn'), seg(8, 'sleep'), seg(1.5, 'idle'), walk(4), seg(4, 'idle')],
  walk_drag: [seg(1, 'idle'), walk(2.5, { decel: false }), seg(2, 'drag'), seg(3, 'idle')],
  music_drag: [seg(4, 'music'), seg(2, 'drag'), seg(4, 'music'), seg(4, 'idle')],
  scratch_click: [seg(1, 'idle'), seg(1.5, 'scratch'), seg(0.9, 'laugh'), seg(3, 'idle')]
}

let Rig = null
export async function loadRig(name = 'bunny') {
  const mod = await import(/* @vite-ignore */ `/@fs${ROOT}src/renderer/common/rigs/${name}.ts?t=${Date.now()}`)
  Rig = mod.BunnyRig ?? mod.BlackCatRig
  const id = name === 'bunny' ? 'bunny' : 'ugolek'
  const manifest = await (await fetch(`/@fs${ROOT}resources/characters/${id}/character.json`)).json()
  const size = 128
  const frame = manifest.sheets.main
  VIEW = { width: Math.round((frame.frameWidth / frame.frameHeight) * size + 2 * size * 0.15), height: Math.round(size * 1.3) }
  W = VIEW.width * DPR
  H = VIEW.height * DPR
  return Rig
}

/** Прогон сценария: кадры 60 к/с; метрики по каждому кадру; opts.capture(i) — сохранить кадр i. */
export function runScenario(name, opts = {}) {
  const rig = new Rig()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const segs = typeof name === 'string' ? SCENARIOS[name] : name
  let now = 1000
  let seq = 0
  let prev = null
  let idleArea = null
  const frames = []
  const issues = []
  const thumbs = []
  for (const s of segs) {
    seq += 1
    const n = Math.round(s.dur * 60)
    for (let i = 0; i < n; i++) {
      const t = i / 60
      const input = { mode: s.mode, animation: s.animation, seq, flip: !!s.flip, pointer: s.pointer ? s.pointer(t) : null, view: VIEW, walkSpeed: s.mode === 'walk' ? (s.speed ? s.speed(t) : BASE) : 0, baseSpeed: BASE }
      try {
        rig.draw(ctx, now, input)
      } catch (e) {
        issues.push(`${s.animation}@${t.toFixed(2)} ошибка: ${e.message}`)
        now += 1000 / 60
        continue
      }
      for (const [k, v] of Object.entries(rig)) if (typeof v === 'number' && Number.isNaN(v)) issues.push(`${s.animation}@${t.toFixed(2)} NaN в ${k}`)
      if (s.mode === 'walk' && input.walkSpeed > 8 && (rig.sit > 0.35 || !rig.side)) issues.push(`едет, не стоя боком: ${s.animation}`)
      const d = ctx.getImageData(0, 0, W, H).data
      const mask = new Uint8Array(W * H)
      let area = 0
      let top = H
      let edge = 0
      for (let p = 0; p < W * H; p++) {
        if (d[p * 4 + 3] > 128) {
          mask[p] = 1
          area++
          const x = p % W
          const y = (p / W) | 0
          if (y < top) top = y
          if (x === 0 || x === W - 1 || y === 0) edge++
        }
      }
      let diff = 0
      if (prev) for (let p = 0; p < W * H; p++) diff += mask[p] ^ prev[p]
      if (idleArea === null && s.animation === 'idle' && i > 30) idleArea = area
      frames.push({ anim: s.animation, t, area, top, edge, jump: prev ? diff / Math.max(area, 1) : 0 })
      if (opts.capture && opts.capture(frames.length - 1)) {
        const c = document.createElement('canvas')
        c.width = W
        c.height = H
        c.getContext('2d').drawImage(canvas, 0, 0)
        thumbs.push({ c, label: `#${frames.length - 1} ${s.animation} ${t.toFixed(2)}` })
      }
      prev = mask
      now += 1000 / 60
    }
  }
  return { frames, issues, thumbs, idleArea }
}

/** Контактный лист кадров (на сером фоне — как на столе). */
export function sheet(list, cols = 6, scale = 0.5) {
  const w = W * scale
  const h = H * scale + 14
  const out = document.createElement('canvas')
  out.width = cols * w
  out.height = Math.ceil(list.length / cols) * h
  const g = out.getContext('2d')
  g.fillStyle = '#9aa0a8'
  g.fillRect(0, 0, out.width, out.height)
  list.forEach((t, i) => {
    const x = (i % cols) * w
    const y = Math.floor(i / cols) * h
    g.drawImage(t.c, x, y + 14, w, h - 14)
    g.fillStyle = '#000'
    g.font = '11px sans-serif'
    g.fillText(t.label, x + 3, y + 11)
    g.strokeStyle = '#f008'
    g.strokeRect(x + 0.5, y + 14.5, w - 1, h - 15)
  })
  out.style.cssText = 'display:block;max-width:100%'
  document.body.replaceChildren(out)
  return [out.width, out.height]
}

/** Сводка по сценариям: ошибки, рывки силуэта (>30% за кадр), исчезновение, обрезка краем окна. */
export function summary(names = Object.keys(SCENARIOS)) {
  const out = {}
  for (const name of names) {
    const r = runScenario(name)
    const fr = r.frames
    const ia = r.idleArea ?? fr[30]?.area
    const jumps = fr.filter((f) => f.anim !== 'peek' && f.jump > 0.3 && !(f.anim === 'drag' && f.t < 0.05))
    const small = fr.filter((f) => f.anim !== 'peek' && f.area < ia * 0.3).length
    const clipped = fr.filter((f) => f.anim !== 'peek' && f.edge > 4)
    out[name] =
      [
        [...new Set(r.issues)].slice(0, 2).join('; '),
        jumps.length ? `рывки: ${jumps.length} (${jumps[0].anim}@${jumps[0].t.toFixed(2)})` : '',
        small ? `пропадает: ${small}` : '',
        clipped.length ? `обрезка: ${clipped.length} (${[...new Set(clipped.map((f) => f.anim))].join('/')})` : ''
      ]
        .filter(Boolean)
        .join(' | ') || 'ok'
  }
  return out
}

Object.assign(window, { loadRig, runScenario, sheet, summary, SCENARIOS })
