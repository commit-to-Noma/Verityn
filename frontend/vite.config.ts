import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Flask backend in development. The deployed build is
      // same-origin: Vercel rewrites /api/* to the server function.
      '/api': process.env.VERITYN_API ?? 'http://127.0.0.1:5001',
    },
  },
  preview: {
    // Same proxy for exact-build verification (`npm run preview`).
    proxy: {
      '/api': process.env.VERITYN_API ?? 'http://127.0.0.1:5001',
    },
  },
})
