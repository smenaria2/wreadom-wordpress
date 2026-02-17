import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    port: 3000,
    proxy: {
      '/wp-api': {
        target: 'https://public-api.wordpress.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wp-api/, ''),
      },
    },
  },
})
