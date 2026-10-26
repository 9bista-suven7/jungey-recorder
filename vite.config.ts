import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Packaging writes into release/ and dist/; don't reload the running app when that happens.
  server: { port: 5173, strictPort: false, watch: { ignored: ['**/release/**', '**/dist/**'] } },
  build: { target: 'chrome130', chunkSizeWarningLimit: 2000 },
});
