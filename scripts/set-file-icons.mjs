// Иконка Ember на самих файлах установщиков (.dmg, .exe) в Finder — только для удобства на этом маке.
// macOS хранит такую иконку в метаданных файла; при скачивании из интернета она теряется, и это нормально.
//
//   node scripts/set-file-icons.mjs

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], { cwd: root }).toString())
const dir = join(root, 'release', version)
const icon = join(root, 'build/icon.png')
const files = readdirSync(dir).filter((f) => /\.(dmg|exe)$/.test(f))
const jxa = `ObjC.import('AppKit')
function run(argv) {
  const image = $.NSImage.alloc.initWithContentsOfFile(argv[0])
  for (const f of argv.slice(1)) $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, f, 0)
}`
if (files.length) execFileSync('osascript', ['-l', 'JavaScript', '-e', jxa, icon, ...files.map((f) => join(dir, f))])
for (const f of files) console.log('  иконка:', f)
