import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/scriptures-sticky-scroll-pwa/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
