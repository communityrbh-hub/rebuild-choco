/**
 * Whisper en un worker — para que la interfaz no se congele
 * =========================================================
 *
 * La inferencia de Whisper en WASM ocupa el hilo donde corre todo lo demás.
 * Con el modelo en el hilo principal, transcribir una frase de dos segundos
 * congelaba la pantalla: Rumi se quedaba tieso, las ondas del micrófono
 * dejaban de moverse y —lo peor— el detector de voz, que corre sobre
 * `requestAnimationFrame`, se paraba también. La conversación se sentía rota
 * justo en el momento en que el niño acababa de hablar.
 *
 * Aquí el modelo vive aparte. El hilo principal solo manda audio y recibe
 * texto, así que sigue animando, escuchando y respondiendo mientras Whisper
 * piensa.
 */

import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

/*
 * Repartir la inferencia entre núcleos. Medido en un i5 de cuatro núcleos:
 * con un solo hilo, transcribir tres segundos de audio costaba entre 8 y 18
 * segundos; un niño de seis años no espera eso, y la conversación se rompía
 * en el momento exacto en que acababa de hablar.
 *
 * Se dejan dos núcleos libres a propósito: el resto de la app —Gemma
 * respondiendo, la voz de Rumi, la animación— compite por la misma CPU, y
 * ocuparla entera para transcribir hace que todo lo demás se atasque.
 */
const nucleos = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
env.backends.onnx.wasm.numThreads = typeof SharedArrayBuffer === 'undefined' ? 1 : nucleos;
env.backends.onnx.wasm.simd = true;

let transcriptor = null;

async function cargar() {
  if (transcriptor) return transcriptor;

  transcriptor = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    quantized: true,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        self.postMessage({ tipo: 'progreso', valor: Math.round((p.loaded / p.total) * 100) });
      }
    },
  });

  return transcriptor;
}

self.onmessage = async (evento) => {
  const { tipo, id, audio } = evento.data;

  try {
    if (tipo === 'precargar') {
      const modelo = await cargar();

      // Un pase en vacío para calentar. Medido: la primera transcripción
      // costaba 12 s y las siguientes 5,5 s — el WASM tiene que compilar y
      // reservar sus buffers la primera vez. Si esa penalización la paga el
      // primer turno del niño, la conversación arranca rota justo cuando se
      // está formando la impresión de si Rumi escucha o no.
      try {
        await modelo(new Float32Array(16000), { language: 'spanish', task: 'transcribe', max_new_tokens: 1 });
      } catch { /* calentar es opcional */ }

      self.postMessage({
        tipo: 'listo',
        hilos: env.backends.onnx.wasm.numThreads,
        aislado: typeof SharedArrayBuffer !== 'undefined',
        aisladoEnWorker: self.crossOriginIsolated,
        hilosEfectivos: env.backends.onnx.wasm.numThreads,
        nucleosDelEquipo: navigator.hardwareConcurrency,
        simd: env.backends.onnx.wasm.simd,
      });
      return;
    }

    if (tipo === 'transcribir') {
      const modelo = await cargar();
      const salida = await modelo(audio, {
        language: 'spanish',
        task: 'transcribe',
        // El techo de tokens es lo que más pesa en el tiempo de respuesta.
        // Whisper decodifica token a token y, ante ruido o silencio, se pone
        // a alucinar hasta agotar su límite por defecto (448): eso convertía
        // tres segundos de audio en ocho de espera. Un niño de seis años dice
        // frases de diez palabras; con este techo no se pierde nada suyo y se
        // corta en seco la alucinación, que es de donde salía el retardo.
        max_new_tokens: 48,
        no_repeat_ngram_size: 4, // corta los bucles de "y y y y"
      });
      self.postMessage({ tipo: 'texto', id, texto: (salida?.text || '').trim() });
    }
  } catch (e) {
    self.postMessage({ tipo: 'error', id, mensaje: String(e?.message || e) });
  }
};
