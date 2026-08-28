import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serverControlPlugin } from './vite-server-control-plugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), serverControlPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
