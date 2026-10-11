// NIBL Application Portal - frontend at "/".
//
// In development this ONE address (http://localhost:5173) gives you the whole
// system, exactly like IIS does in production:
//   /                       portal (this project)
//   /oipm/                  -> OIPM frontend dev server        :5174
//   /npd/                   -> NPD frontend dev server         :5175
//   /ai-drawing-control/    -> AI Drawing frontend dev server  :5176
//   /portal-api             -> portal backend  :8010
//   /api/v1                 -> OIPM backend    :8000
//   /npd/api                -> NPD backend     :8001
//   /ai-drawing-control/api -> AI Drawing backend :8002
// Same origin everywhere, so the sign-in cookie and storage are shared.
import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const env = (k, d) => process.env[k] ?? d
const backend = (target, rewrite) => ({ target, changeOrigin: true, ...(rewrite ? { rewrite } : {}) })
const frontend = (target) => ({ target, changeOrigin: true, ws: true })

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: "127.0.0.1",   // fixed IPv4 address: the portal proxy targets 127.0.0.1 (Windows binds "localhost" to ::1 only)
    port: 5173,
    strictPort: true,
    proxy: {
      '/portal-api': backend(env('PORTAL_BACKEND_URL', 'http://127.0.0.1:8010')),
      '/api/v1': backend(env('OIPM_BACKEND_URL', 'http://127.0.0.1:8000')),
      '/npd/api': backend(env('NPD_BACKEND_URL', 'http://127.0.0.1:8001'), (p) => p.replace(/^\/npd\/api/, '/api')),
      '/ai-drawing-control/api': backend(env('DRAWING_BACKEND_URL', 'http://127.0.0.1:8002'), (p) => p.replace(/^\/ai-drawing-control\/api/, '/api')),
      '/oipm': frontend(env('OIPM_FRONTEND_URL', 'http://127.0.0.1:5174')),
      '/npd': frontend(env('NPD_FRONTEND_URL', 'http://127.0.0.1:5175')),
      '/ai-drawing-control': frontend(env('DRAWING_FRONTEND_URL', 'http://127.0.0.1:5176')),
    },
  },
})
