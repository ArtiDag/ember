// Снимок «куклы» в SVG: подменяет холст записывающим контекстом и переводит рисование в векторные пути.
// В браузере на странице dev-сервера:
//   const m = await import('/@fs/<проект>/scripts/rig-to-svg.js')
//   await m.rigSvg('bunny', { seconds: 1.5 })   // → строка SVG (поза покоя анфас)
// Светлая кайма вокруг силуэта и мягкая тень (растровые эффекты) не переносятся.

const ROOT = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/@fs/, '').replace(/scripts\/rig-to-svg\.js$/, '')
const K = 0.5522847498

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
const n = (v) => +v.toFixed(2)

class Recorder {
  constructor(out, width, height) {
    this.out = out
    this.canvas = { width, height }
    this.m = [1, 0, 0, 1, 0, 0]
    this.stack = []
    this.st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1, clips: 0 }
    this.d = []
    this.cur = [0, 0]
    this.start = [0, 0]
  }
  // состояние
  get fillStyle() { return this.st.fillStyle }
  set fillStyle(v) { this.st.fillStyle = v }
  get strokeStyle() { return this.st.strokeStyle }
  set strokeStyle(v) { this.st.strokeStyle = v }
  get lineWidth() { return this.st.lineWidth }
  set lineWidth(v) { this.st.lineWidth = v }
  get lineCap() { return this.st.lineCap }
  set lineCap(v) { this.st.lineCap = v }
  get lineJoin() { return this.st.lineJoin }
  set lineJoin(v) { this.st.lineJoin = v }
  get globalAlpha() { return this.st.globalAlpha }
  set globalAlpha(v) { this.st.globalAlpha = v }
  set globalCompositeOperation(v) {}
  set font(v) {}
  set textAlign(v) {}
  set textBaseline(v) {}
  set filter(v) {}
  save() {
    this.stack.push({ m: [...this.m], st: { ...this.st, clips: 0 }, prevClips: this.st.clips })
    this.st = { ...this.st, clips: 0 }
  }
  restore() {
    const s = this.stack.pop()
    if (!s) return
    for (let i = 0; i < this.st.clips; i++) this.out.push('</g>')
    this.m = s.m
    this.st = { ...s.st, clips: s.prevClips }
  }
  // преобразования
  transform(a, b, c, d, e, f) { this.m = mul(this.m, [a, b, c, d, e, f]) }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y) }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0) }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0) }
  setTransform(a, b, c, d, e, f) {
    if (typeof a === 'object') this.m = [a.a, a.b, a.c, a.d, a.e, a.f]
    else this.m = [a, b, c, d, e, f]
  }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0] }
  getTransform() { const [a, b, c, d, e, f] = this.m; return new DOMMatrix([a, b, c, d, e, f]) }
  // путь (точки — сразу в координатах холста, как и у настоящего canvas)
  p(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
  P(x, y) { const [a, b] = this.p(x, y); return `${n(a)} ${n(b)}` }
  beginPath() { this.d = [] }
  moveTo(x, y) { this.d.push(`M${this.P(x, y)}`); this.cur = [x, y]; this.start = [x, y] }
  lineTo(x, y) { if (!this.d.length) return this.moveTo(x, y); this.d.push(`L${this.P(x, y)}`); this.cur = [x, y] }
  closePath() { this.d.push('Z'); this.cur = [...this.start] }
  quadraticCurveTo(cx, cy, x, y) { this.d.push(`Q${this.P(cx, cy)} ${this.P(x, y)}`); this.cur = [x, y] }
  bezierCurveTo(a, b, c, d, x, y) { this.d.push(`C${this.P(a, b)} ${this.P(c, d)} ${this.P(x, y)}`); this.cur = [x, y] }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath() }
  arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw) }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    let sweep = a1 - a0
    const full = Math.PI * 2
    if (!ccw && sweep < 0) sweep = (sweep % full) + full
    if (ccw && sweep > 0) sweep = (sweep % full) - full
    if (Math.abs(a1 - a0) >= full) sweep = ccw ? -full : full
    const cr = Math.cos(rot), sr = Math.sin(rot)
    const pt = (a) => { const ex = rx * Math.cos(a), ey = ry * Math.sin(a); return [x + ex * cr - ey * sr, y + ex * sr + ey * cr] }
    const dv = (a) => { const ex = -rx * Math.sin(a), ey = ry * Math.cos(a); return [ex * cr - ey * sr, ex * sr + ey * cr] }
    const segs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)))
    const step = sweep / segs
    const k = (4 / 3) * Math.tan(step / 4)
    const s0 = pt(a0)
    if (this.d.length) this.lineTo(...s0)
    else this.moveTo(...s0)
    for (let i = 0; i < segs; i++) {
      const a = a0 + step * i, b = a + step
      const p0 = pt(a), p1 = pt(b), d0 = dv(a), d1 = dv(b)
      this.bezierCurveTo(p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], p1[0], p1[1])
    }
  }
  // вывод
  paint(style) {
    if (typeof style !== 'string') return null // градиенты (тень) — пропускаем
    const c = style.trim()
    const m = c.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const [r, g, b, a = 1] = m[1].split(',').map(Number)
      return [`rgb(${r},${g},${b})`, +a]
    }
    return [c, 1]
  }
  fill(path, rule) {
    if (path instanceof Path2D || typeof path === 'string') return this.fillPath2D(path, rule)
    const p = this.paint(this.st.fillStyle)
    if (!p || !this.d.length) return
    const op = p[1] * this.st.globalAlpha
    this.out.push(`<path d="${this.d.join('')}" fill="${p[0]}"${op < 1 ? ` fill-opacity="${n(op)}"` : ''}${path === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`)
  }
  stroke(path) {
    if (path instanceof Path2D) return this.strokePath2D(path)
    const p = this.paint(this.st.strokeStyle)
    if (!p || !this.d.length) return
    const op = p[1] * this.st.globalAlpha
    const w = this.st.lineWidth * Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2]))
    this.out.push(`<path d="${this.d.join('')}" fill="none" stroke="${p[0]}" stroke-width="${n(w)}" stroke-linecap="${this.st.lineCap}" stroke-linejoin="${this.st.lineJoin}"${op < 1 ? ` stroke-opacity="${n(op)}"` : ''}/>`)
  }
  // Path2D (рисунок спящего) — исходный d известен только при создании; храним его в обёртке
  fillPath2D(path, rule) {
    const p = this.paint(this.st.fillStyle)
    if (!p || !path.__d) return
    const [a, b, c, d, e, f] = this.m
    this.out.push(`<path transform="matrix(${[a, b, c, d, e, f].map(n).join(' ')})" d="${path.__d}" fill="${p[0]}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`)
  }
  strokePath2D(path) {
    const p = this.paint(this.st.strokeStyle)
    if (!p || !path.__d) return
    const [a, b, c, d, e, f] = this.m
    this.out.push(`<path transform="matrix(${[a, b, c, d, e, f].map(n).join(' ')})" d="${path.__d}" fill="none" stroke="${p[0]}" stroke-width="${this.st.lineWidth}" stroke-linecap="${this.st.lineCap}" stroke-linejoin="${this.st.lineJoin}"/>`)
  }
  clip(rule) {
    const id = `c${this.out.clipN = (this.out.clipN ?? 0) + 1}`
    this.out.push(`<clipPath id="${id}"><path d="${this.d.join('')}"${rule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath><g clip-path="url(#${id})">`)
    this.st.clips++
  }
  fillRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.fill() }
  strokeRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.stroke() }
  clearRect() {}
  drawImage() {}
  fillText() {}
  strokeText() {}
  measureText(s) { return { width: s.length * 6 } }
  createRadialGradient() { return { addColorStop() {} } }
  createLinearGradient() { return { addColorStop() {} } }
  getImageData(x, y, w, h) { return new ImageData(Math.max(1, w), Math.max(1, h)) }
}

/** SVG позы куклы после `seconds` секунд покоя (input.animation — по желанию). */
export async function rigSvg(name = 'bunny', { seconds = 1.5, animation = 'idle', width = 155, height = 166, dpr = 4 } = {}) {
  // Path2D с запомненным d (нужно для рисунка спящего)
  const Native = window.Path2D
  if (!Native.__wrapped) {
    const Wrapped = class extends Native { constructor(d) { super(d); this.__d = typeof d === 'string' ? d : d?.__d } }
    Wrapped.__wrapped = true
    window.Path2D = Wrapped
  }
  const mod = await import(/* @vite-ignore */ `/@fs${ROOT}src/renderer/common/rigs/${name}.ts?t=${Date.now()}`)
  const Rig = mod.BunnyRig ?? mod.BlackCatRig
  const rig = new Rig()
  const W = width * dpr, H = height * dpr
  // прогреваем на обычном холсте (пружины ушей, моргание и т. п. приходят в покой)
  const warm = document.createElement('canvas')
  warm.width = W
  warm.height = H
  const wctx = warm.getContext('2d')
  const view = { width, height }
  const input = { mode: 'idle', animation, seq: 1, flip: false, pointer: null, view, walkSpeed: 0, baseSpeed: 33 }
  let now = 1000
  for (let i = 0; i < Math.round(seconds * 60); i++, now += 1000 / 60) rig.draw(wctx, now, input)
  // последний кадр — в запись; силуэтный слой пишет туда же, кайма (rim) — в никуда
  const out = []
  const rec = new Recorder(out, W, H)
  const sink = new Recorder([], W, H)
  rig.layer = { width: W, height: H, getContext: () => rec }
  rig.rim = { width: W, height: H, getContext: () => sink }
  if ('headLayer' in rig) rig.headLayer = { width: W, height: H, getContext: () => sink }
  rig.draw(rec, now, input)
  const body = out.join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W / 2}" height="${H / 2}">\n${body}\n</svg>\n`
}
