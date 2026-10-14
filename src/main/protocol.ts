// pet-asset:// — единственный способ для renderer получить изображения персонажей.
// Отдаются только картинки из папки конкретного персонажа.

import { protocol } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { IMAGE_EXTENSIONS, LIMITS } from '../shared/limits'
import { extensionOf } from '../shared/paths'
import { ASSET_SCHEME, type CharacterLibrary } from './library'
import { resolveInside } from './safePath'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

/** Вызывать до app.ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

export function handleAssets(library: CharacterLibrary): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      if (request.method !== 'GET') return notFound()
      const url = new URL(request.url)
      const [id, ...rest] = url.pathname.slice(1).split('/').map((s) => decodeURIComponent(s))
      const dir = url.host === 'character' ? library.get(id)?.dir : null
      if (!dir) return notFound()
      const rel = rest.join('/')
      const ext = extensionOf(rel)
      if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return notFound()
      const file = await resolveInside(dir, rel)
      if ((await stat(file)).size > LIMITS.imageBytes) return notFound()
      return new Response(await readFile(file), {
        headers: {
          'content-type': MIME[ext],
          'access-control-allow-origin': '*',
          'x-content-type-options': 'nosniff',
          // На случай, если SVG когда-нибудь откроют как документ: никаких скриптов и внешних загрузок.
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
          'cache-control': 'no-cache'
        }
      })
    } catch {
      return notFound()
    }
  })
}
