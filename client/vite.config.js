import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production this app is built and served as static files BY the Express
// backend (see server.js), so it's same-origin and needs no proxy there.
// This proxy only matters for local development, when you're running
// `npm run dev` here (port 5173) against the backend running separately
// (port 3000, per server/config.js).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
