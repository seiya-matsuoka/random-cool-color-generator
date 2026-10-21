import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/random-cool-color-generator/',
  plugins: [react(), tailwindcss()],
});
