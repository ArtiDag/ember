// Валидация character.json (formatVersion 1) встроенных персонажей: её используют
// библиотека и рендерер.

import { tr } from './i18n'
import { IMAGE_EXTENSIONS, LIMITS } from './limits'
import { checkRelativePath, extensionOf } from './paths'
import {
  DIRECTIONS,
  type AnimationDef,
  type CharacterKind,
  type CharacterManifest,
  type Direction,
  type LookDef,
  type ReactionsDef,
  type SheetDef
} from './types'

export const FORMAT_VERSION = 1
export const RESERVED_ANIMATIONS = ['idle', 'walk', 'drag', 'sleep', 'blink', 'talk', 'music', 'yawn'] as const

const KEY = /^[A-Za-z0-9_-]{1,32}$/

export type ValidationResult = { ok: true; manifest: CharacterManifest } | { ok: false; errors: string[] }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function optionalText(value: unknown, field: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > LIMITS.textLength) {
    errors.push(`${field}: ${tr('строка до', 'a string of up to', '最多')} ${LIMITS.textLength} ${tr('символов', 'characters', '个字符的字符串')}`)
    return undefined
  }
  return value.trim() || undefined
}

function validateSheet(name: string, raw: unknown, errors: string[]): SheetDef | null {
  const at = `sheets.${name}`
  if (!isObject(raw)) {
    errors.push(`${at}: ${tr('ожидается объект', 'an object is expected', '应为对象')}`)
    return null
  }
  const pathError = checkRelativePath(raw.file)
  if (pathError) {
    errors.push(`${at}.file: ${pathError}`)
    return null
  }
  const file = raw.file as string
  if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(file))) {
    errors.push(`${at}.file: ${tr('поддерживаются только', 'only these are supported:', '仅支持')} ${IMAGE_EXTENSIONS.join(', ')}`)
    return null
  }
  const ok =
    isInt(raw.frameWidth, 1, LIMITS.frameSide) &&
    isInt(raw.frameHeight, 1, LIMITS.frameSide) &&
    isInt(raw.columns, 1, LIMITS.framesPerSheet) &&
    isInt(raw.rows, 1, LIMITS.framesPerSheet)
  if (!ok) {
    errors.push(`${at}: frameWidth/frameHeight — ${tr('целые', 'integers', '整数')} 1..${LIMITS.frameSide}, columns/rows — ${tr('целые ≥ 1', 'integers ≥ 1', '整数 ≥ 1')}`)
    return null
  }
  const sheet = raw as unknown as SheetDef
  if (sheet.columns * sheet.rows > LIMITS.framesPerSheet) {
    errors.push(`${at}: ${tr('больше', 'more than', '超过')} ${LIMITS.framesPerSheet} ${tr('кадров в листе', 'frames in the sheet', '帧')}`)
    return null
  }
  if (sheet.columns * sheet.frameWidth > LIMITS.imageSide || sheet.rows * sheet.frameHeight > LIMITS.imageSide) {
    errors.push(`${at}: ${tr('сетка больше', 'the grid is larger than', '网格大于')} ${LIMITS.imageSide}px`)
    return null
  }
  return {
    file,
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    columns: sheet.columns,
    rows: sheet.rows
  }
}

function frameCount(sheet: SheetDef): number {
  return sheet.columns * sheet.rows
}

function validateAnimation(
  name: string,
  raw: unknown,
  sheets: Record<string, SheetDef>,
  errors: string[]
): AnimationDef | null {
  const at = `animations.${name}`
  if (!isObject(raw)) {
    errors.push(`${at}: ${tr('ожидается объект', 'an object is expected', '应为对象')}`)
    return null
  }
  if (typeof raw.sheet !== 'string' || !sheets[raw.sheet]) {
    errors.push(`${at}.sheet: ${tr('нет листа', 'no sheet', '没有图集')} "${String(raw.sheet)}"`)
    return null
  }
  const sheet = sheets[raw.sheet]
  if (!Array.isArray(raw.frames) || raw.frames.length === 0 || raw.frames.length > LIMITS.framesPerAnimation) {
    errors.push(`${at}.frames: ${tr('массив из', 'an array of', '由')} 1..${LIMITS.framesPerAnimation} ${tr('индексов', 'indices', '个索引组成的数组')}`)
    return null
  }
  const max = frameCount(sheet) - 1
  const bad = raw.frames.find((frame) => !isInt(frame, 0, max))
  if (bad !== undefined) {
    errors.push(`${at}.frames: ${tr('индекс', 'index', '索引')} ${JSON.stringify(bad)} ${tr('вне диапазона', 'is out of range', '超出范围')} 0..${max}`)
    return null
  }
  const fps = raw.fps
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < LIMITS.minFps || fps > LIMITS.maxFps) {
    errors.push(`${at}.fps: ${tr('число', 'a number', '数字')} ${LIMITS.minFps}..${LIMITS.maxFps}`)
    return null
  }
  if (raw.loop !== undefined && typeof raw.loop !== 'boolean') {
    errors.push(`${at}.loop: true ${tr('или', 'or', '或')} false`)
    return null
  }
  return { sheet: raw.sheet, frames: [...(raw.frames as number[])], fps, loop: raw.loop ?? true }
}

function validateLook(raw: unknown, sheets: Record<string, SheetDef>, errors: string[]): LookDef | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw) || typeof raw.sheet !== 'string' || !sheets[raw.sheet] || !isObject(raw.frames)) {
    errors.push(tr('look: ожидается { sheet, frames: { <направление>: индекс } } с существующим листом', 'look: expected { sheet, frames: { <direction>: index } } with an existing sheet', 'look：应为 { sheet, frames: { <方向>: 索引 } }，且图集存在'))
    return undefined
  }
  const max = frameCount(sheets[raw.sheet]) - 1
  const frames = {} as Record<Direction, number>
  for (const direction of DIRECTIONS) {
    const frame = raw.frames[direction]
    if (!isInt(frame, 0, max)) {
      errors.push(`look.frames.${direction}: ${tr('индекс', 'index', '索引')} 0..${max} ${tr('обязателен', 'is required', '为必填')}`)
      return undefined
    }
    frames[direction] = frame
  }
  return { sheet: raw.sheet, frames }
}

function validateReactions(
  raw: unknown,
  animations: Record<string, AnimationDef>,
  errors: string[]
): ReactionsDef | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    errors.push(tr('reactions: ожидается объект', 'reactions: an object is expected', 'reactions：应为对象'))
    return undefined
  }
  const result: ReactionsDef = {}
  if (raw.click !== undefined) {
    if (!Array.isArray(raw.click) || raw.click.length > 16 || raw.click.some((n) => typeof n !== 'string' || !animations[n])) {
      errors.push(tr('reactions.click: массив имён существующих анимаций (до 16)', 'reactions.click: an array of existing animation names (up to 16)', 'reactions.click：现有动画名称数组（最多 16 个）'))
    } else if (raw.click.length > 0) {
      result.click = [...(raw.click as string[])]
    }
  }
  if (raw.idle !== undefined) {
    if (!Array.isArray(raw.idle) || raw.idle.length > 16 || raw.idle.some((n) => typeof n !== 'string' || !animations[n])) {
      errors.push(tr('reactions.idle: массив имён существующих анимаций (до 16)', 'reactions.idle: an array of existing animation names (up to 16)', 'reactions.idle：现有动画名称数组（最多 16 个）'))
    } else if (raw.idle.length > 0) {
      result.idle = [...(raw.idle as string[])]
    }
  }
  if (raw.rapidClick !== undefined) {
    if (typeof raw.rapidClick !== 'string' || !animations[raw.rapidClick]) {
      errors.push(tr('reactions.rapidClick: имя существующей анимации', 'reactions.rapidClick: the name of an existing animation', 'reactions.rapidClick：现有动画的名称'))
    } else {
      result.rapidClick = raw.rapidClick
    }
  }
  return result
}

export function validateManifest(raw: unknown): ValidationResult {
  const errors: string[] = []
  if (!isObject(raw)) return { ok: false, errors: [tr('character.json должен быть объектом', 'character.json must be an object', 'character.json 必须是对象')] }

  if (raw.formatVersion !== FORMAT_VERSION) {
    errors.push(`formatVersion: ${tr('поддерживается только', 'only this is supported:', '仅支持')} ${FORMAT_VERSION}`)
    return { ok: false, errors }
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name || name.length > LIMITS.nameLength) errors.push(`name: ${tr('строка', 'a string of', '长度为')} 1..${LIMITS.nameLength} ${tr('символов', 'characters', '个字符的字符串')}`)

  const facing = raw.facing ?? 'right'
  if (facing !== 'left' && facing !== 'right') errors.push(`facing: "left" ${tr('или', 'or', '或')} "right"`)

  if (raw.pixelArt !== undefined && typeof raw.pixelArt !== 'boolean') errors.push(`pixelArt: true ${tr('или', 'or', '或')} false`)
  if (raw.rig !== undefined && raw.rig !== 'blackcat' && raw.rig !== 'bunny')
    errors.push(tr('rig: известны только куклы "blackcat" и "bunny"', 'rig: only the "blackcat" and "bunny" rigs are known', 'rig：仅支持 "blackcat" 和 "bunny"'))
  const pace = raw.pace
  if (pace !== undefined && (typeof pace !== 'number' || !Number.isFinite(pace) || pace < 0.2 || pace > 2)) {
    errors.push(tr('pace: число от 0.2 до 2', 'pace: a number from 0.2 to 2', 'pace：0.2 到 2 之间的数字'))
  }
  if (raw.gender !== undefined && raw.gender !== 'm' && raw.gender !== 'f') errors.push(tr('gender: "m" или "f"', 'gender: "m" or "f"', 'gender："m" 或 "f"'))
  const fade = raw.fadeBottom
  if (fade !== undefined && (typeof fade !== 'number' || !Number.isFinite(fade) || fade < 0 || fade > 0.6)) {
    errors.push(tr('fadeBottom: число от 0 до 0.6', 'fadeBottom: a number from 0 to 0.6', 'fadeBottom：0 到 0.6 之间的数字'))
  }

  const sheets: Record<string, SheetDef> = {}
  if (!isObject(raw.sheets) || Object.keys(raw.sheets).length === 0) {
    errors.push(tr('sheets: нужен хотя бы один лист', 'sheets: at least one sheet is needed', 'sheets：至少需要一个图集'))
  } else if (Object.keys(raw.sheets).length > LIMITS.sheets) {
    errors.push(`sheets: ${tr('не больше', 'no more than', '不超过')} ${LIMITS.sheets}`)
  } else {
    for (const [key, value] of Object.entries(raw.sheets)) {
      if (!KEY.test(key)) {
        errors.push(`sheets: ${tr('недопустимое имя', 'invalid name', '无效名称')} "${key}" (${tr('латиница, цифры, _ и -', 'Latin letters, digits, _ and -', '拉丁字母、数字、_ 和 -')})`)
        continue
      }
      const sheet = validateSheet(key, value, errors)
      if (sheet) sheets[key] = sheet
    }
    const sizes = new Set(Object.values(sheets).map((s) => `${s.frameWidth}x${s.frameHeight}`))
    if (sizes.size > 1) errors.push(tr('sheets: у всех листов должен быть одинаковый размер кадра', 'sheets: all sheets must have the same frame size', 'sheets：所有图集的帧尺寸必须相同'))
  }

  const animations: Record<string, AnimationDef> = {}
  if (!isObject(raw.animations)) {
    errors.push(tr('animations: ожидается объект с анимацией idle', 'animations: an object with an idle animation is expected', 'animations：应为包含 idle 动画的对象'))
  } else if (Object.keys(raw.animations).length > LIMITS.animations) {
    errors.push(`animations: ${tr('не больше', 'no more than', '不超过')} ${LIMITS.animations}`)
  } else {
    for (const [key, value] of Object.entries(raw.animations)) {
      if (!KEY.test(key)) {
        errors.push(`animations: ${tr('недопустимое имя', 'invalid name', '无效名称')} "${key}"`)
        continue
      }
      const animation = validateAnimation(key, value, sheets, errors)
      if (animation) animations[key] = animation
    }
    if (!raw.animations.idle) errors.push(tr('animations.idle: обязательная анимация', 'animations.idle: a required animation', 'animations.idle：必需的动画'))
  }

  const look = validateLook(raw.look, sheets, errors)
  const reactions = validateReactions(raw.reactions, animations, errors)

  if (errors.length > 0) return { ok: false, errors }

  const manifest: CharacterManifest = {
    formatVersion: FORMAT_VERSION,
    name,
    facing: facing as 'left' | 'right',
    pixelArt: (raw.pixelArt as boolean | undefined) ?? false,
    sheets,
    animations
  }
  const author = optionalText(raw.author, 'author', errors)
  const license = optionalText(raw.license, 'license', errors)
  if (errors.length > 0) return { ok: false, errors }
  if (author) manifest.author = author
  if (license) manifest.license = license
  if (raw.rig === 'blackcat' || raw.rig === 'bunny') manifest.rig = raw.rig
  if (typeof pace === 'number' && pace !== 1) manifest.pace = pace
  if (raw.gender === 'm' || raw.gender === 'f') manifest.gender = raw.gender
  if (typeof fade === 'number' && fade > 0) manifest.fadeBottom = fade
  if (look) manifest.look = look
  if (reactions && (reactions.click || reactions.rapidClick || reactions.idle)) manifest.reactions = reactions
  return { ok: true, manifest }
}

/** Проверяет, что сетка листа помещается в реальное изображение. SVG масштабируется — не проверяется. */
export function checkSheetFitsImage(name: string, sheet: SheetDef, width: number, height: number): string | null {
  if (extensionOf(sheet.file) === '.svg') return null
  const needW = sheet.columns * sheet.frameWidth
  const needH = sheet.rows * sheet.frameHeight
  if (width < needW || height < needH) {
    return `sheets.${name}: ${tr('сетка', 'a grid of', '网格')} ${sheet.columns}×${sheet.rows} ${tr('по', 'by', '每格')} ${sheet.frameWidth}×${sheet.frameHeight} ${tr('требует', 'needs', '需要')} ${needW}×${needH}px, ${tr('а изображение', 'but the image is', '但图片为')} ${width}×${height}px`
  }
  return null
}

/** Предупреждение (не ошибка), если сетка покрывает изображение не полностью. */
export function sheetCoverageWarning(name: string, sheet: SheetDef, width: number, height: number): string | null {
  if (extensionOf(sheet.file) === '.svg') return null
  if (width !== sheet.columns * sheet.frameWidth || height !== sheet.rows * sheet.frameHeight) {
    return `${tr('Лист', 'Sheet', '图集')} "${name}": ${tr('изображение', 'the image', '图片')} ${width}×${height}px ${tr('больше сетки — лишние области будут проигнорированы', 'is larger than the grid — the extra area will be ignored', '大于网格——多余区域将被忽略')}`
  }
  return null
}

export function characterKind(manifest: CharacterManifest): CharacterKind {
  if (manifest.rig) return 'rig'
  if (manifest.look) return 'look'
  const animated = Object.values(manifest.animations).some((a) => a.frames.length > 1)
  return animated ? 'animated' : 'static'
}

export function frameSize(manifest: CharacterManifest): { width: number; height: number } {
  const first = Object.values(manifest.sheets)[0]
  return { width: first.frameWidth, height: first.frameHeight }
}
