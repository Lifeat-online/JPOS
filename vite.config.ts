import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const base =
    env.VITE_BASE_PATH && env.VITE_BASE_PATH !== '/'
      ? `/${env.VITE_BASE_PATH.replace(/^\/+|\/+$/g, '')}/`
      : '/';
  const pwaOptions: Partial<VitePWAOptions> = {
    registerType: 'autoUpdate',
    includeAssets: [
      'favicon.svg',
      'apple-touch-icon.png',
      'mstile-150x150.png',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/maskable-icon-192.png',
      'icons/maskable-icon-512.png',
    ],
    manifest: {
      name: "Jimmy's POS",
      short_name: "Jimmy's POS",
      description: 'Cloud-Native Point of Sale for Modern Business',
      theme_color: '#2563EB',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'any',
      scope: base,
      start_url: base,
      categories: ['business', 'productivity'],
      icons: [
        {
          src: `${base}icons/icon-192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `${base}icons/icon-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `${base}icons/maskable-icon-192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: `${base}icons/maskable-icon-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: `${base}favicon.svg`,
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ],
      shortcuts: [
        {
          name: 'Terminal',
          url: `${base}pos`,
          description: 'Open POS Terminal',
        },
        {
          name: 'Tables',
          url: `${base}tables`,
          description: 'View Restaurant Tables',
        },
      ],
    },
    workbox: {
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      navigateFallback: `${base}index.html`,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
          handler: 'NetworkFirst',
          options: { cacheName: 'firestore-cache' },
        },
      ],
    },
  };

  return {
    base,
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA(pwaOptions)
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : {
        protocol: 'wss',
        host: 'jpos-production.up.railway.app'
      },
      allowedHosts: true,
      port: Number(process.env.PORT) || 8080,
    },
    preview: {
      allowedHosts: ['jpos-production.up.railway.app'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('motion')) {
              return 'vendor-motion';
            }
            if (id.includes('html5-qrcode')) {
              return 'vendor-scanner';
            }
            if (id.includes('socket.io-client') || id.includes('engine.io-client')) {
              return 'vendor-realtime';
            }
            if (id.includes('workbox') || id.includes('vite-plugin-pwa')) {
              return 'vendor-pwa';
            }
          },
        },
      },
    },
  };
});
