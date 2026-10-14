import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * CSP в html: в dev разрешаем инлайн-преамбулу React Refresh и WebSocket HMR,
 * в production-сборке оставляем строгую политику (без 'unsafe-inline' для скриптов и без ws:).
 */
function csp(): Plugin {
  return {
    name: 'desktop-pet-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        return html.replace("connect-src 'self' ws:", "connect-src 'none'")
      }
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), csp()],
    build: {
      rollupOptions: {
        input: {
          pet: resolve(__dirname, 'src/renderer/pet.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          bubble: resolve(__dirname, 'src/renderer/bubble.html')
        }
      }
    }
  }
})
