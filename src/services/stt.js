/**
 * STT — El oído de Rumi
 * =====================
 *
 * Los niños de 5 a 10 años no escriben. Hablarle a Rumi no es un extra: es la
 * vía de entrada principal. Y para que se sienta una CONVERSACIÓN y no un
 * walkie-talkie, hay un modo manos libres: Rumi termina de hablar, se pone a
 * escuchar solo, detecta cuándo el niño terminó, y responde.
 *
 * Dos backends, misma interfaz:
 *   🔌 OFFLINE  → Whisper-tiny local (transformers.js sobre WASM) + VAD propio
 *   🌐 ONLINE   → Web Speech API nativa del navegador
 *
 * ⚠️ Hablar no es un canal privilegiado. La transcripción entra por el mismo
 * enrutador que el texto escrito (`agent/router.js`): primero se intenta
 * resolver como intención contra las keywords del árbol; si no encaja, pasa
 * por los filtros de crisis y de tema emocional antes de que el modelo pueda
 * verla. Ninguna vía se salta la capa de seguridad. Ver regla #3.
 *
 * ⚠️ Limitación conocida del modo offline: la inferencia de Whisper corre en
 * WASM sobre el hilo principal, así que la interfaz se congela un instante
 * mientras transcribe. Es una limitación del CPU sin GPU, no un defecto de
 * implementación, y se mitiga con frases cortas de push-to-talk.
 */

import { modoSTT, infoSTT } from './runtime.js';
import { crearDetector } from './vad.js';

export { modoSTT, infoSTT };

/* ============================================================
   BACKEND ONLINE — Web Speech API
   ============================================================ */

const SR = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export const webSpeechDisponible = Boolean(SR);

function escucharWeb({ onResultado, onError, onEstado, onParcial }) {
  if (!SR) {
    onError?.('Este navegador no reconoce voz. Usa los botones.');
    return () => {};
  }

  const rec = new SR();
  rec.lang = 'es-CO';
  rec.continuous = false;
  rec.interimResults = true; // parciales: el niño ve que lo estamos oyendo
  rec.maxAlternatives = 1;

  let entregado = false;

  rec.onstart = () => onEstado?.('grabando');

  rec.onresult = (e) => {
    let final = '';
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else parcial += t;
    }
    if (parcial) onParcial?.(parcial);
    if (final && !entregado) {
      entregado = true;
      onEstado?.('listo');
      onResultado?.(final.trim());
    }
  };

  rec.onerror = (e) => {
    onEstado?.('listo');
    if (e.error === 'no-speech') onError?.('no_escuche');
    else if (e.error === 'not-allowed') onError?.('sin_permiso');
    else if (e.error !== 'aborted') onError?.('fallo');
  };

  rec.onend = () => {
    onEstado?.('listo');
    if (!entregado) onError?.('no_escuche');
  };

  try { rec.start(); } catch { onError?.('fallo'); }

  return () => { try { rec.stop(); } catch { /* ya detenido */ } };
}

/* ============================================================
   BACKEND OFFLINE — Whisper local
   ============================================================ */

let transcriptor = null;
let cargandoModelo = null;

/** Carga Whisper una sola vez; después queda cacheado y funciona sin red. */
export async function precargarWhisper(onProgreso) {
  if (transcriptor) return transcriptor;
  if (cargandoModelo) return cargandoModelo;

  cargandoModelo = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    transcriptor = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      quantized: true,
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          onProgreso?.(Math.round((p.loaded / p.total) * 100));
        }
      },
    });
    return transcriptor;
  })();

  return cargandoModelo;
}

export function whisperListo() {
  return Boolean(transcriptor);
}

/** Convierte el audio grabado a Float32 mono 16 kHz, que es lo que espera Whisper. */
async function aPcm16k(blob) {
  const buffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decodificado = await ctx.decodeAudioData(buffer);
  await ctx.close();

  const offline = new OfflineAudioContext(1, Math.ceil(decodificado.duration * 16000), 16000);
  const nodo = offline.createBufferSource();
  nodo.buffer = decodificado;
  nodo.connect(offline.destination);
  nodo.start();
  const salida = await offline.startRendering();
  return salida.getChannelData(0);
}

function escucharLocal({ onResultado, onError, onEstado, onNivel }, auto) {
  let grabadora = null;
  let pistas = [];
  let detector = null;
  let cancelado = false;
  const trozos = [];

  (async () => {
    try {
      if (!transcriptor) onEstado?.('preparando');
      await precargarWhisper();
      if (cancelado) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      pistas = stream.getTracks();
      grabadora = new MediaRecorder(stream);

      grabadora.ondataavailable = (e) => { if (e.data.size > 0) trozos.push(e.data); };

      grabadora.onstop = async () => {
        detector?.detener();
        pistas.forEach((t) => t.stop());
        if (cancelado || !trozos.length) { onEstado?.('listo'); return; }

        try {
          onEstado?.('transcribiendo');
          const audio = await aPcm16k(new Blob(trozos, { type: grabadora.mimeType }));

          if (audio.length < 16000 * 0.35) {
            onEstado?.('listo');
            onError?.('no_escuche');
            return;
          }

          const salida = await transcriptor(audio, { language: 'spanish', task: 'transcribe' });
          const texto = (salida?.text || '').trim();
          onEstado?.('listo');

          // Whisper devuelve marcadores tipo "[Música]" cuando solo oyó ruido.
          if (!texto || /^[[(].*[\])]$/.test(texto)) onError?.('no_escuche');
          else onResultado?.(texto);
        } catch {
          onEstado?.('listo');
          onError?.('fallo');
        }
      };

      grabadora.start();
      onEstado?.('grabando');

      // Manos libres: el VAD decide cuándo terminó de hablar.
      if (auto) {
        detector = crearDetector(stream, {
          onNivel,
          onFin: (motivo) => {
            if (grabadora?.state === 'recording') {
              if (motivo === 'sin_voz') { cancelado = true; grabadora.stop(); onError?.('no_escuche'); }
              else grabadora.stop();
            }
          },
        });
      }
    } catch (e) {
      onEstado?.('listo');
      onError?.(e?.name === 'NotAllowedError' ? 'sin_permiso' : 'fallo');
    }
  })();

  return () => {
    detector?.detener();
    if (grabadora && grabadora.state === 'recording') grabadora.stop();
    else { cancelado = true; pistas.forEach((t) => t.stop()); }
  };
}

/* ============================================================
   INTERFAZ UNIFICADA
   ============================================================ */

/**
 * Escucha al niño.
 * @param {object} cb  {onResultado, onError, onEstado, onNivel, onParcial}
 * @param {{auto?: boolean}} opciones  auto = manos libres (detecta el fin solo)
 * @returns {Function} detener
 */
export function escuchar(cb, { auto = true } = {}) {
  return modoSTT === 'local' ? escucharLocal(cb, auto) : escucharWeb(cb);
}

export function sttDisponible() {
  if (modoSTT === 'web') return webSpeechDisponible;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Mensajes para el niño. Nunca decimos "error": decimos qué hacer. */
export const MENSAJES = {
  no_escuche: 'No te escuché bien. ¿Me lo dices otra vez?',
  sin_permiso: 'Necesito permiso para escucharte. Pídele ayuda a un adulto.',
  fallo: 'No pude escucharte. Puedes tocar un botón.',
};
