// Выбор направления взгляда по положению курсора (логика page-mascot:
// 8 секторов, мёртвая зона у центра, гистерезис на границах секторов).

import type { Direction } from './types'

const CLOCKWISE: Direction[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']
const SECTOR = (Math.PI * 2) / CLOCKWISE.length
export const GAZE_HYSTERESIS = 0.12

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

export interface Gaze {
  direction: Direction
  /** -1 — центр (мёртвая зона). */
  sector: number
}

export function pickGaze(dx: number, dy: number, previousSector: number, deadZone: number): Gaze {
  if (Math.hypot(dx, dy) < deadZone) return { direction: 'center', sector: -1 }
  const angle = Math.atan2(dy, dx)
  if (previousSector !== -1 && Math.abs(wrap(angle - previousSector * SECTOR)) < SECTOR / 2 + GAZE_HYSTERESIS) {
    return { direction: CLOCKWISE[previousSector], sector: previousSector }
  }
  const sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length
  return { direction: CLOCKWISE[sector], sector }
}
