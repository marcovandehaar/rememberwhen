import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Prototype only. `npm run dev` binds to 0.0.0.0 so the iPad on the same
// wifi can reach it over plain http:// (page and assets share an origin,
// so no mixed-content problem here).
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
})
