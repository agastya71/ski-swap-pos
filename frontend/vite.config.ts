import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/me': 'http://localhost:8000',
      '/events': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
      '/sellers': 'http://localhost:8000',
      '/intakes': 'http://localhost:8000',
      '/items': 'http://localhost:8000',
      '/sales': 'http://localhost:8000',
      '/reports': 'http://localhost:8000',
      '/end-of-day': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
})
