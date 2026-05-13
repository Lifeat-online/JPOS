import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const base =
    env.VITE_BASE_PATH && env.VITE_BASE_PATH !== '/'
      ? `/${env.VITE_BASE_PATH.replace(/^\/+|\/+$/g, '')}/`
      : '/';
  return {
    base,
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
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
              src: `${base}favicon.svg`,
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
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
      })
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
  };
});
