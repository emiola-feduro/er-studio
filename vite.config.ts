import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "localhost" resolves only to ::1 on this machine; port forwards usually connect to 127.0.0.1.
  server: { host: '127.0.0.1' },
  test: { environment: 'node' },
} as any);
