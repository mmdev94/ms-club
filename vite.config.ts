import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The exact security policy ms.computer adds to every site, so local previews behave like the live site.
const MS_CSP = "default-src 'self'; img-src 'self' data: https: *; style-src 'self' 'unsafe-inline' https: *; script-src 'self' 'unsafe-inline' https: *; font-src 'self' data: https: *; connect-src 'self' https: *; media-src 'self' https: *; object-src 'none'; frame-src 'self' https: *;"

export default defineConfig({
  plugins: [react()],
  preview: { headers: { 'content-security-policy': MS_CSP } },
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), roomtest: resolve(import.meta.dirname, 'room-test.html') } } },
})
