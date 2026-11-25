import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const isDesktop = process.env.VITE_TARGET === 'desktop';

export default defineConfig({
  base: isDesktop ? './' : '/',
  plugins: [
    react(),
    ...(!isDesktop
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
            manifest: {
              name: 'OmniTune',
              short_name: 'OmniTune',
              description: 'OmniTune — Unified music, smart mixes, radio, and podcasts across every device.',
              theme_color: '#070D1B',
              background_color: '#070D1B',
              display: 'standalone',
              start_url: '/',
              icons: [
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
              ],
            },
            workbox: {
              navigateFallback: '/index.html',
              runtimeCaching: [
                {
                  // Cache catalog artwork images; NEVER cache audio streams.
                  urlPattern: /^https:\/\/is\d+-ssl\.mzstatic\.com\/image\/.*/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'omnitune-artwork',
                    expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
        ]
      : []),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
});
