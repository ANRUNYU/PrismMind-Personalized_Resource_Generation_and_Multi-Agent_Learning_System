import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts'
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/')) return 'vue-vendor'
          if (id.includes('/echarts/') || id.includes('/vue-echarts/')) return 'echarts'
          if (id.includes('/markdown-it/')) return 'markdown'
          if (id.includes('/highlight.js/')) return 'highlight'
          if (id.includes('/axios/')) return 'vendor'
        }
      }
    }
  }
})
