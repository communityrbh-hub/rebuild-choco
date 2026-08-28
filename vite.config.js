import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la app debe poder abrirse desde cualquier ruta o desde
  // el sistema de archivos, sin un servidor que resuelva rutas absolutas.
  base: './',
});
