/**
 * TTS — La voz de Rumi
 * ====================
 *
 * ⚠️ RIESGO CRÍTICO PARA LA DEMO OFFLINE
 * Chrome expone voces REMOTAS de Google (localService === false) que requieren
 * internet. Si se toma la voz por defecto, en modo avión Rumi SE QUEDA MUDO,
 * justo durante la grabación del video que prueba la operación offline.
 *
 * Por eso este módulo FUERZA una voz local del sistema operativo (SAPI en
 * Windows). Preferencia: es-CO > es-MX > es-ES > cualquier es-* > cualquier local.
 */

let vozElegida = null;
let vocesListas = false;

/** Elige la mejor voz LOCAL en español disponible. */
function elegirVoz() {
  const voces = window.speechSynthesis.getVoices();
  if (!voces.length) return null;

  // Solo voces que no necesitan red.
  const locales = voces.filter((v) => v.localService === true);
  const pool = locales.length ? locales : voces; // último recurso

  const preferencias = ['es-CO', 'es-MX', 'es-US', 'es-ES', 'es-AR', 'es'];
  for (const pref of preferencias) {
    const hit = pool.find((v) => v.lang && v.lang.toLowerCase().startsWith(pref.toLowerCase()));
    if (hit) return hit;
  }
  return pool[0] || null;
}

function asegurarVoces() {
  if (vocesListas && vozElegida) return;
  const v = elegirVoz();
  if (v) {
    vozElegida = v;
    vocesListas = true;
  }
}

// Chrome carga las voces de forma asíncrona.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  asegurarVoces();
  window.speechSynthesis.onvoiceschanged = () => {
    vocesListas = false;
    asegurarVoces();
  };
}

/**
 * Hace hablar a Rumi.
 * @param {string} texto
 * @param {{onStart?: Function, onEnd?: Function}} cb
 * @returns {SpeechSynthesisUtterance|null}
 */
export function hablar(texto, { onStart, onEnd } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
    return null;
  }

  window.speechSynthesis.cancel();
  asegurarVoces();

  const u = new SpeechSynthesisUtterance(texto);
  if (vozElegida) u.voice = vozElegida;
  u.lang = vozElegida?.lang || 'es-CO';
  u.rate = 0.85;   // más lento: son niños de 5 a 10 años
  u.pitch = 1.15;  // un poco más agudo: tono amable

  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();

  // Chrome a veces necesita un tick tras cancel() para no tragarse el utterance.
  setTimeout(() => window.speechSynthesis.speak(u), 60);
  return u;
}

export function callar() {
  window.speechSynthesis?.cancel();
}

/** Diagnóstico para verificar antes de grabar en modo avión. */
export function diagnosticoVoz() {
  const voces = window.speechSynthesis?.getVoices() || [];
  asegurarVoces();
  return {
    totalVoces: voces.length,
    vocesLocales: voces.filter((v) => v.localService).length,
    elegida: vozElegida ? `${vozElegida.name} (${vozElegida.lang})` : 'ninguna',
    esLocal: vozElegida?.localService ?? false,
    aptaParaOffline: Boolean(vozElegida?.localService),
  };
}
