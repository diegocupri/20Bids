import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate heavy libraries into their own chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['plotly.js', 'react-plotly.js', 'recharts'],
          'vendor-tremor': ['@tremor/react'],
          'vendor-utils': ['date-fns', 'lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Increase warning limit since we're splitting
  }
})
