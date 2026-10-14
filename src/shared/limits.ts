// Лимиты для character.json и картинок персонажей. Используются валидатором и протоколом.

export const LIMITS = {
  manifestBytes: 256 * 1024,
  imageBytes: 20 * 1024 * 1024,
  imageSide: 8192,
  frameSide: 4096,
  sheets: 16,
  animations: 64,
  framesPerSheet: 1024,
  framesPerAnimation: 512,
  minFps: 0.1,
  maxFps: 60,
  nameLength: 60,
  textLength: 200,
  pathLength: 200
} as const

export const IMAGE_EXTENSIONS = ['.png', '.webp', '.svg', '.jpg', '.jpeg'] as const
