import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '127.0.0.1',
    open: true,
    proxy: {
      '/api/overpass': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/api/interpreter',
      },
      '/api/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/search',
      },
      '/api/elevation': {
        target: 'https://api.open-meteo.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/elevation',
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
