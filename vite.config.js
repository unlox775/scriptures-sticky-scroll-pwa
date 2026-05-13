import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/scriptures-sticky-scroll-pwa/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        scrollerLab: resolve(__dirname, 'scroller-lab.html'),
      },
    },
  },
})
