import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE is set when deploying under a sub-path (e.g. GitHub Pages: /gym-tracker/).
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png'],
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Food, lifts and weight for a lean bulk',
        theme_color: '#0d0f12',
        background_color: '#0d0f12',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
