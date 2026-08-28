/**
 * Metadata del entorno de ejecución.
 *
 * Existe separado a propósito: cualquier componente puede preguntar EN QUÉ
 * MODO corre la app (offline/online, qué modelo, qué backend de voz) sin
 * necesidad de importar el servicio que genera texto.
 *
 * Así la verificación de la regla #2 sigue siendo un grep limpio:
 *     grep -rl "services/aiService" src/screens src/components
 * debe devolver únicamente MathScreen.jsx.
 */

const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

export const esLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const modoSTT =
  params.get('stt') === 'web' ? 'web'
  : params.get('stt') === 'local' ? 'local'
  : esLocal ? 'local' : 'web';

export const infoBackend = esLocal
  ? { nombre: 'Gemma 3 1B', modo: 'offline', detalle: 'Corriendo local vía Ollama. Sin internet.' }
  : { nombre: 'Gemini 3.1 Flash Lite', modo: 'online', detalle: 'Vitrina web. La versión real usa IA local.' };

export const infoSTT = modoSTT === 'local'
  ? { nombre: 'Whisper tiny', modo: 'offline', detalle: 'Transcripción local, sin internet.' }
  : { nombre: 'Web Speech API', modo: 'online', detalle: 'Reconocimiento del navegador.' };
