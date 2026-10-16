import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules\/(react|react-dom|react-router)/ },
            { name: "firebase", test: /node_modules\/@?firebase/ },
            { name: "charts", test: /node_modules\/(recharts|d3-.*)/ },
            { name: "motion", test: /node_modules\/(framer-motion|motion-dom|gsap)/ },
          ],
        },
      },
    },
  },
})
