// Геометрия окна питомца в координатах Electron screen (DIP, могут быть отрицательными).

import type { Point, Rect } from './types'

/** Ограничивает левый верхний угол окна size так, чтобы оно целиком было в area. */
export function clampToArea(position: Point, size: { width: number; height: number }, area: Rect): Point {
  const maxX = area.x + Math.max(0, area.width - size.width)
  const maxY = area.y + Math.max(0, area.height - size.height)
  return {
    x: Math.min(Math.max(position.x, area.x), maxX),
    y: Math.min(Math.max(position.y, area.y), maxY)
  }
}

export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Позиция «внизу по центру» рабочей области — стартовая и для «вернуть на экран». */
export function homePosition(size: { width: number; height: number }, area: Rect): Point {
  return clampToArea(
    { x: Math.round(area.x + (area.width - size.width) / 2), y: area.y + area.height - size.height },
    size,
    area
  )
}

/** Какая рабочая область больше всего пересекается с окном; если ни одна — fallback. */
export function bestAreaFor<T extends { workArea: Rect }>(window: Rect, displays: T[], fallback: T): T {
  let best = fallback
  let bestArea = 0
  for (const display of displays) {
    const area = intersectionArea(window, display.workArea)
    if (area > bestArea) {
      best = display
      bestArea = area
    }
  }
  return best
}

/** Горизонтальный шаг прогулки с отражением от краёв области. */
export function walkStep(
  x: number,
  direction: -1 | 1,
  distance: number,
  width: number,
  area: Rect
): { x: number; hitEdge: 'left' | 'right' | null } {
  const minX = area.x
  const maxX = area.x + Math.max(0, area.width - width)
  const next = x + direction * distance
  if (next <= minX) return { x: minX, hitEdge: 'left' }
  if (next >= maxX) return { x: maxX, hitEdge: 'right' }
  return { x: next, hitEdge: null }
}

/**
 * Где показать облачко с репликой: над питомцем, а если сверху мало места — под ним.
 * Облачко не выходит за рабочую область; хвостик смещается, чтобы указывать на питомца.
 */
export function bubblePlacement(
  pet: { centerX: number; top: number; bottom: number },
  size: { width: number; height: number },
  area: Rect,
  gap = 2
): { x: number; y: number; placement: 'above' | 'below'; tailOffset: number } {
  const placement = pet.top - size.height - gap >= area.y ? 'above' : 'below'
  const wantX = pet.centerX - size.width / 2
  const wantY = placement === 'above' ? pet.top - size.height - gap : pet.bottom + gap
  const clamped = clampToArea({ x: wantX, y: wantY }, size, area)
  const maxTail = size.width / 2 - 24
  const tailOffset = Math.max(-maxTail, Math.min(maxTail, wantX - clamped.x))
  return { x: Math.round(clamped.x), y: Math.round(clamped.y), placement, tailOffset: Math.round(tailOffset) }
}
