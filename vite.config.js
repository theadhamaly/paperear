import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { piperFixes } from './tools/piperPatch.js'

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.elevenlabs.io https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspMeta = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`),
}

const analytics = (id) => ({
  name: 'analytics',
  apply: 'build',
  transformIndexHtml: (html) => (id ? html.replace('</head>', `  <script defer src="/u/script.js" data-website-id="${id}" data-host-url="/u"></script>\n</head>`) : html),
})

const hostingFiles = {
  name: 'hosting-files',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source: [
        '/*',
        "  Content-Security-Policy: frame-ancestors 'self' https://adhamaly.space https://*.adhamaly.space",
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
        '',
      ].join('\n'),
    })
    this.emitFile({
      type: 'asset',
      fileName: 'third-party-notices.txt',
      source: `${fs.readFileSync('THIRD_PARTY_NOTICES.md', 'utf8')}\n\nThe full licence text of every bundled package: https://paperear.app/licenses.txt\n`,
    })
  },
}

const engineAlias = ['index', 'scan']
  .filter((name) => fs.existsSync(`src/engine/${name}.full.js`))
  .map((name) => ({ find: new RegExp(`^\\.\\./engine/${name}\\.js$`), replacement: path.resolve(`src/engine/${name}.full.js`) }))

export default defineConfig(({ mode }) => ({
  plugins: [piperFixes, react(), cspMeta, hostingFiles, analytics(loadEnv(mode, process.cwd()).VITE_UMAMI_ID)],
  resolve: { alias: engineAlias },
  optimizeDeps: {
    exclude: ['@mintplex-labs/piper-tts-web', '@diffusionstudio/piper-wasm'],
  },
  base: '/',
  worker: {
    format: 'es',
    plugins: () => [piperFixes],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    license: { fileName: 'licenses.txt' },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
}))
