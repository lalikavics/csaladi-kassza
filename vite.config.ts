import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// Két változat: helyi (egy HTML fájl, offline, nincs szinkron) és webes (PWA, közös kassza, GitHub Pages).
const web = process.env.VITE_TARGET === 'web';
const fake = process.env.VITE_FAKE === '1'; // teszthez: a Firebase helyett helyi teszt-szerver
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: web ? (process.env.VITE_BASE ?? '/csaladi-kassza/') : './',
  plugins: [
    svelte(),
    web
      ? VitePWA({
          registerType: 'autoUpdate',
          injectRegister: false,
          includeAssets: ['apple-touch-icon.png'],
          manifest: {
            name: 'Családi kassza', short_name: 'Kassza', lang: 'hu', display: 'standalone',
            start_url: './', scope: './', background_color: '#111214', theme_color: '#111214',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
          },
          workbox: { globPatterns: ['**/*.{js,css,html,png,woff2}'], maximumFileSizeToCacheInBytes: 4_000_000 },
        })
      : viteSingleFile(),
  ],
  resolve: fake || !web ? { alias: { 'firebase/firestore': r('./src/test/fakeFirestore.ts'), 'firebase/app': r('./src/test/fakeApp.ts') } } : {},
  test: { include: ['src/**/*.test.ts'] },
} as any);
