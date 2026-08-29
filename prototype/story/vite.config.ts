import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same lessons as the globe prototype: pin the port so the iPad's URL stays
// valid, and poll for changes because the tools editing these files replace
// them and chokidar misses that on Windows.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5174, strictPort: true, watch: { usePolling: true, interval: 300 } },
})
