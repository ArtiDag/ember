import { describe, expect, it } from 'vitest'
import { bestAreaFor, clampToArea, homePosition, walkStep } from '../src/shared/geometry'
import { pickGaze } from '../src/shared/gaze'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }
const left = { x: -1280, y: -200, width: 1280, height: 1024 } // монитор слева и выше, отрицательные координаты
const size = { width: 100, height: 100 }

describe('clampToArea', () => {
  it('оставляет позицию внутри области без изменений', () => {
    expect(clampToArea({ x: 50, y: 60 }, size, primary)).toEqual({ x: 50, y: 60 })
  })
  it('прижимает к краям, включая отрицательные координаты', () => {
    expect(clampToArea({ x: 5000, y: 5000 }, size, primary)).toEqual({ x: 1820, y: 940 })
    expect(clampToArea({ x: -5000, y: -5000 }, size, left)).toEqual({ x: -1280, y: -200 })
    expect(clampToArea({ x: -10, y: 900 }, size, left)).toEqual({ x: -100, y: 724 })
  })
  it('окно больше области — прижимается к левому верхнему углу', () => {
    expect(clampToArea({ x: 10, y: 10 }, { width: 3000, height: 3000 }, primary)).toEqual({ x: 0, y: 0 })
  })
})

describe('displays', () => {
  it('homePosition — низ по центру', () => {
    expect(homePosition(size, primary)).toEqual({ x: 910, y: 940 })
  })
  it('bestAreaFor выбирает монитор с наибольшим пересечением, иначе fallback', () => {
    const a = { id: 1, workArea: primary }
    const b = { id: 2, workArea: left }
    expect(bestAreaFor({ x: -60, y: 0, width: 100, height: 100 }, [a, b], a).id).toBe(2)
    expect(bestAreaFor({ x: 99999, y: 0, width: 100, height: 100 }, [a, b], a).id).toBe(1)
  })
})

describe('walkStep', () => {
  it('двигает и сообщает о краях', () => {
    expect(walkStep(100, 1, 10, 100, primary)).toEqual({ x: 110, hitEdge: null })
    expect(walkStep(5, -1, 10, 100, primary)).toEqual({ x: 0, hitEdge: 'left' })
    expect(walkStep(1815, 1, 10, 100, primary)).toEqual({ x: 1820, hitEdge: 'right' })
  })
})

describe('pickGaze', () => {
  it('мёртвая зона — центр', () => {
    expect(pickGaze(10, 10, -1, 50)).toEqual({ direction: 'center', sector: -1 })
  })
  it('восемь направлений (ось y вниз)', () => {
    expect(pickGaze(200, 0, -1, 50).direction).toBe('right')
    expect(pickGaze(0, 200, -1, 50).direction).toBe('down')
    expect(pickGaze(-200, 0, -1, 50).direction).toBe('left')
    expect(pickGaze(0, -200, -1, 50).direction).toBe('up')
    expect(pickGaze(-200, -200, -1, 50).direction).toBe('up-left')
  })
  it('гистерезис удерживает сектор у границы', () => {
    const angle = Math.PI / 8 + 0.05 // чуть за границей right/down-right
    const dx = Math.cos(angle) * 200
    const dy = Math.sin(angle) * 200
    expect(pickGaze(dx, dy, -1, 50).direction).toBe('down-right')
    expect(pickGaze(dx, dy, 0, 50).direction).toBe('right')
  })
})
