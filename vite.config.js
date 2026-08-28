import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Cross-origin isolation.
 *
 * Sin estas dos cabeceras el navegador no expone `SharedArrayBuffer`, y sin
 * él onnxruntime-web se queda en un solo hilo: Whisper tardaba entre 8 y 18
 * segundos en transcribir una frase de tres segundos, que es tanto como no
 * escuchar. Con ellas puede repartirse entre los núcleos disponibles.
 *
 * `credentialless` y no `require-corp` a propósito: los pesos del modelo se
 * descargan de huggingface.co, que no envía cabecera CORP. Con `require-corp`
 * el navegador bloquearía esa descarga y la app se quedaría sin oído.
 */
const cabecerasAislamiento = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: cabecerasAislamiento },
  preview: { headers: cabecerasAislamiento },
  // Rutas relativas: la app debe poder abrirse desde cualquier ruta o desde
  // el sistema de archivos, sin un servidor que resuelva rutas absolutas.
  base: './',
});
