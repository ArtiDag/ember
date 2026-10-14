// Описания встроенных персонажей. Оба — «куклы»: рисуются кодом в приложении
// (src/renderer/common/rigs/), здесь — только запасной силуэт и character.json.
// Длительности анимаций задают, сколько длится реакция (смех, зевок, царапанье, выглядывание).
//
//   npm run generate:characters   (нужен Node.js ≥ 22.18)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const hold = (seconds) => ({ sheet: 'main', frames: Array(Math.round(seconds * 10)).fill(0), fps: 10, loop: false })
const loop = { sheet: 'main', frames: [0], fps: 1, loop: true }

/** Общий набор действий «кукол» (у всех одинаковый сценарий). */
const animations = {
  idle: loop,
  walk: loop,
  drag: loop,
  talk: loop,
  music: loop,
  sleep: loop,
  laugh: hold(0.9),
  love: hold(1.6),
  dizzy: hold(1.6),
  yawn: hold(1.6),
  // редкие «фишки»: царапает экран; прячется за край экрана и выглядывает
  scratch: hold(3.8),
  peek: hold(10.3)
}

const CHARACTERS = [
  {
    id: 'ugolek',
    name: 'Уголёк',
    rig: 'blackcat',
    source: 'blackCat.ts',
    // котёнок ходит неторопливо
    pace: 0.55,
    silhouette: `<g fill="#141416"><ellipse cx="110" cy="176" rx="40" ry="50"/><ellipse cx="110" cy="212" rx="54" ry="18"/>
<path d="M80,76 Q86,46 76,32 Q100,44 104,64 Z"/><path d="M140,76 Q134,46 144,32 Q120,44 116,64 Z"/>
<ellipse cx="110" cy="98" rx="46" ry="40"/></g>
<g fill="#fbfbf7"><ellipse cx="93" cy="100" rx="10.5" ry="12"/><ellipse cx="127" cy="100" rx="10.5" ry="12"/></g>
<g fill="#141416"><circle cx="93" cy="101" r="6"/><circle cx="127" cy="101" r="6"/></g>`
  },
  {
    id: 'bunny',
    name: 'Кролик',
    rig: 'bunny',
    source: 'bunny.ts',
    // прыжками — чуть быстрее кота
    pace: 0.6,
    // окно шире кадра сцены (220): в прыжке тело сдвигается в окне — по бокам нужен запас
    frameWidth: 280,
    silhouette: `<g fill="#141416"><path d="M86,100 C78,64 82,34 92,20 C104,34 104,66 100,100 Z"/><path d="M120,100 C122,66 130,36 144,26 C150,44 142,74 134,102 Z"/>
<ellipse cx="110" cy="198" rx="48" ry="30"/><ellipse cx="110" cy="172" rx="34" ry="28"/><ellipse cx="70" cy="222" rx="17" ry="7"/><ellipse cx="150" cy="222" rx="17" ry="7"/>
<ellipse cx="110" cy="120" rx="44" ry="38"/><ellipse cx="86" cy="135" rx="24" ry="19"/><ellipse cx="134" cy="135" rx="24" ry="19"/></g>
<g fill="#fbfbf7"><ellipse cx="91" cy="118" rx="11.5" ry="13"/><ellipse cx="129" cy="118" rx="11.5" ry="13"/></g>
<g fill="#141416"><circle cx="91" cy="119" r="5"/><circle cx="129" cy="119" r="5"/></g>`
  }
]

for (const ch of CHARACTERS) {
  const dir = join(root, 'resources/characters', ch.id)
  // старые листы (кролик раньше был картинками «по пояс»)
  for (const old of ['directions.svg', 'reactions.svg']) rmSync(join(dir, old), { force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'silhouette.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ch.frameWidth ?? 220}" height="240" viewBox="${-((ch.frameWidth ?? 220) - 220) / 2} 0 ${ch.frameWidth ?? 220} 240">\n${ch.silhouette}\n</svg>\n`
  )
  const manifest = {
    formatVersion: 1,
    name: ch.name,
    author: `Artem Dosaev (animated by src/renderer/common/rigs/${ch.source})`,
    license: 'All rights reserved — LICENSE-CHARACTERS.md',
    facing: 'right',
    pixelArt: false,
    rig: ch.rig,
    pace: ch.pace,
    sheets: { main: { file: 'silhouette.svg', frameWidth: ch.frameWidth ?? 220, frameHeight: 240, columns: 1, rows: 1 } },
    animations,
    reactions: { click: ['laugh', 'love'], rapidClick: 'dizzy', idle: ['scratch', 'peek'] }
  }
  writeFileSync(join(dir, 'character.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('  ', ch.id)
}
