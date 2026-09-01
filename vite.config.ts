import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'
const configuredBase = process.env.VITE_BASE_PATH
const base = configuredBase || (isGitHubPages ? '/matcha-high-yagi-garden/' : '/')
const buildTime = new Date().toISOString()
let revision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''
if (!revision && existsSync('.git')) {
  try { revision = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() } catch { revision = '' }
}

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
    __APP_REVISION__: JSON.stringify(revision.slice(0, 12)),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
