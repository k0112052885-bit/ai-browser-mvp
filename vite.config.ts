import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  assetsInclude: ['**/*.png'],
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['electron-updater']
            }
          }
        }
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5173
  }
})
