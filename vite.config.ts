import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      // VitePWA temporarily disabled due to path issue with apostrophe in directory name
      // Uncomment after moving project to a path without special characters
      // VitePWA({
      //   registerType: 'autoUpdate',
      //   includeAssets: ['favicon.svg'],
      //   manifest: {
      //     name: "Jimmy's POS",
      //     short_name: "Jimmy's POS",
      //     description: "Cloud-Native Point of Sale for Modern Business",
      //     theme_color: '#2563EB',
      //     background_color: '#0f172a',
      //     display: 'standalone',
      //     orientation: 'any',
      //     scope: '/',
      //     start_url: '/',
      //     categories: ['business', 'productivity'],
      //     icons: [
      //       {
      //         src: '/favicon.svg',
      //         sizes: 'any',
      //         type: 'image/svg+xml',
      //         purpose: 'any maskable',
      //       },
      //     ],
      //     shortcuts: [
      //       {
      //         name: 'Terminal',
      //         url: '/pos',
      //         description: 'Open POS Terminal',
      //       },
      //       {
      //         name: 'Tables',
      //         url: '/tables',
      //         description: 'View Restaurant Tables',
      //       },
      //     ],
      //   },
      //   workbox: {
      //     globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      //     runtimeCaching: [
      //       {
      //         urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
      //         handler: 'NetworkFirst',
      //         options: { cacheName: 'firestore-cache' },
      //       },
      //     ],
      //   },
      // })
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
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
