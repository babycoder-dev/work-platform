import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    target: ['chrome109', 'edge109', 'firefox115'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
