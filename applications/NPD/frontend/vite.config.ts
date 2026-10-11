// NPD frontend - an independent application served at /npd/.
// Dev: http://localhost:5175/npd/ (normally opened through the portal at http://localhost:5173).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// [ npm run dev , npm run build ]. A real environment variable still wins.
const SETTINGS: Record<string, [string, string]> = {
  VITE_API_URL: ['/npd/api', '/npd/api'],
  // Same site as NPD ("/"), like OIPM and Drawings. A fixed 'http://nibl' sent people who opened the
  // site by another address (http://nibl:8080, http://192.168.105.20) to a different site = signed out.
  VITE_WORKSPACE_URL: ['/', '/'],   // the NIBL portal (sign-in + cards)
  VITE_OIPM_URL: ['/', '/'],
}

const BACKEND = process.env.NPD_BACKEND_URL ?? 'http://127.0.0.1:8001'

export default defineConfig(({ command }) => {
  for (const [key, [dev, build]] of Object.entries(SETTINGS)) {
    process.env[key] ??= command === 'serve' ? dev : build
  }
  return {
    base: '/npd/',
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",   // fixed IPv4 address: the portal proxy targets 127.0.0.1 (Windows binds "localhost" to ::1 only)
      port: 5175,
      strictPort: true,
      proxy: {
        '/npd/api': { target: BACKEND, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/npd\/api/, '/api') },
      },
    },
  }
})
