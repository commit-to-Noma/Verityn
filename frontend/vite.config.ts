import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Flask backend in development. The built app is served
      // from the same origin in later milestones.
      '/api': process.env.VERITYN_API ?? 'http://127.0.0.1:5000',
    },
  },
})
