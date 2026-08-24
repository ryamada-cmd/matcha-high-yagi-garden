import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  base: isGitHubPages ? '/matcha-high-yagi-garden/' : '/',
  plugins: [react()],
  build: { sourcemap: true },
})
