// OIPM frontend - an independent application served at /oipm/.
// Dev: http://localhost:5174/oipm/ (normally opened through the portal at http://localhost:5173).
import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = process.env.OIPM_BACKEND_URL ?? 'http://127.0.0.1:8000'
const PORTAL_BACKEND = process.env.PORTAL_BACKEND_URL ?? 'http://127.0.0.1:8010'

export default defineConfig(({ command }) => {
  // Same values the old OIPM .env had. A real environment variable wins.
  process.env.VITE_API_BASE_URL ??= '/api/v1'
  process.env.VITE_PORTAL_URL ??= command === 'serve' ? '/' : '/'
  return {
    base: '/oipm/',
    plugins: [react()],
    server: {
      host: "127.0.0.1",   // fixed IPv4 address: the portal proxy targets 127.0.0.1 (Windows binds "localhost" to ::1 only)
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target: BACKEND, changeOrigin: true },
        '/portal-api': { target: PORTAL_BACKEND, changeOrigin: true },
      },
    },
  }
})
