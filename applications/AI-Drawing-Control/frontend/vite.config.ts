// AI Drawing Control frontend - an independent application served at /ai-drawing-control/.
// Dev: http://localhost:5176/ai-drawing-control/ (normally opened through the portal at http://localhost:5173).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND = process.env.DRAWING_BACKEND_URL ?? 'http://127.0.0.1:8002'
const PORTAL_BACKEND = process.env.PORTAL_BACKEND_URL ?? 'http://127.0.0.1:8010'

export default defineConfig(() => {
  process.env.VITE_API_URL ??= '/ai-drawing-control/api'
  process.env.VITE_PORTAL_API_URL ??= '/portal-api'
  process.env.VITE_PORTAL_URL ??= '/'
  return {
    base: '/ai-drawing-control/',
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",   // fixed IPv4 address: the portal proxy targets 127.0.0.1 (Windows binds "localhost" to ::1 only)
      port: 5176,
      strictPort: true,
      proxy: {
        '/ai-drawing-control/api': { target: BACKEND, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/ai-drawing-control\/api/, '/api') },
        '/portal-api': { target: PORTAL_BACKEND, changeOrigin: true },
      },
    },
  }
})
