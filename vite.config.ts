import { defineConfig } from 'vite'
// For local testing only: the exact security policy ms.computer adds to every site.
const MS_CSP = "default-src 'self'; img-src 'self' data: https: *; style-src 'self' 'unsafe-inline' https: *; script-src 'self' 'unsafe-inline' https: *; font-src 'self' data: https: *; connect-src 'self' https: *; media-src 'self' https: *; object-src 'none'; frame-src 'self' https: *;"
export default defineConfig({ preview: { headers: { 'content-security-policy': MS_CSP } } })
