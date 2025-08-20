/// <reference types="vitest" />

import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import Pages from 'vite-plugin-pages'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },

  plugins: [
    Vue(),
    Pages(),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: ['vue', 'vue-router', '@vueuse/core'],
      dts: true,
    }) as any,

    // PWA support with offline caching and WASM precache
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      workbox: {
        // Precache common WASM modules and root assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // Runtime caching for CDN modules like @jsquash and unpkg
        runtimeCaching: [
          {
            urlPattern: ({ url }: any) =>
              url.origin.includes('unpkg.com') ||
              url.origin.includes('cdn.jsdelivr.net'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cdn-modules',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Cache local WASM under /wasm/
            urlPattern: /\/wasm\/(.*)\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Awesome Compressor Playground',
        short_name: 'Compressor',
        theme_color: '#0ea5e9',
        background_color: '#0b1221',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
