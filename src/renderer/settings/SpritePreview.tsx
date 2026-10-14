import { useEffect, useRef, useState } from 'react'
import { tr } from '../../shared/i18n'
import type { CharacterSummary } from '../../shared/types'
import { SpriteSheets, fitCanvas } from '../common/sprite'
import { RIGS } from '../common/rigs'

/** Миниатюра персонажа в карточке: «кукла», которая успела сесть, или первый кадр листа. */
export function SpritePreview({ character, className }: { character: CharacterSummary; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const rigName = character.manifest.rig
    if (rigName) {
      // «Кукла» рисуется кодом; даём ей «сесть» — несколько кадров подряд.
      const rig = new RIGS[rigName]()
      const state = { mode: 'idle' as const, animation: 'idle', seq: 1, flip: false, pointer: null, view: { width: 1, height: 1 } }
      const t0 = performance.now()
      for (let i = 0; i < 40; i++) {
        fitCanvas(canvas)
        rig.draw(ctx, t0 + i * 50, state)
      }
      return
    }
    let alive = true
    const sheets = new SpriteSheets(character)
    setFailed(false)
    sheets
      .load()
      .then(() => {
        if (!alive) return
        fitCanvas(canvas)
        if (!sheets.drawLook(ctx, 'center')) sheets.drawAnimation(ctx, 'idle', 0, false)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [character])

  return (
    <div className={`sprite ${className ?? ''}`} data-pixel={character.manifest.pixelArt || undefined}>
      {failed ? <span className="sprite-error">{tr('не удалось загрузить', 'failed to load', '加载失败')}</span> : <canvas ref={canvasRef} />}
    </div>
  )
}
