/**
 * VAD — detección de fin de habla.
 *
 * Para que se sienta una conversación y no un walkie-talkie, el niño no puede
 * tener que mantener presionado nada: habla, y Rumi se da cuenta solo de que
 * terminó.
 *
 * Cómo: se mide la energía del micrófono en tiempo real. Cuando baja del
 * umbral durante `silencioMs` seguidos, se corta y se transcribe.
 *
 * Con niños hay dos casos que hay que tolerar y que un VAD ingenuo rompe:
 *  - se quedan callados un rato antes de arrancar  → `esperaInicialMs` aparte
 *  - hacen pausas largas a mitad de frase          → umbral de silencio generoso
 */

const UMBRAL_VOZ = 0.014; // energía RMS por encima de la cual consideramos que hay voz

export function crearDetector(stream, {
  silencioMs = 1400,      // pausa que damos por "ya terminó"
  esperaInicialMs = 6000, // cuánto esperamos a que arranque
  maximoMs = 12000,       // tope duro, para no grabar indefinidamente
  onFin,
  onNivel,
} = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const fuente = ctx.createMediaStreamSource(stream);
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 1024;
  analizador.smoothingTimeConstant = 0.75;
  fuente.connect(analizador);

  const datos = new Float32Array(analizador.fftSize);
  const inicio = Date.now();

  let huboVoz = false;
  let ultimaVoz = Date.now();
  let vivo = true;
  let raf = null;

  function terminar(motivo) {
    if (!vivo) return;
    vivo = false;
    cancelAnimationFrame(raf);
    try { fuente.disconnect(); ctx.close(); } catch { /* ya cerrado */ }
    onFin?.(motivo);
  }

  function tick() {
    if (!vivo) return;
    analizador.getFloatTimeDomainData(datos);

    let suma = 0;
    for (let i = 0; i < datos.length; i++) suma += datos[i] * datos[i];
    const rms = Math.sqrt(suma / datos.length);

    onNivel?.(Math.min(1, rms / 0.09)); // 0..1 para la animación

    const ahora = Date.now();
    if (rms > UMBRAL_VOZ) {
      huboVoz = true;
      ultimaVoz = ahora;
    }

    if (huboVoz && ahora - ultimaVoz > silencioMs) return terminar('silencio');
    if (!huboVoz && ahora - inicio > esperaInicialMs) return terminar('sin_voz');
    if (ahora - inicio > maximoMs) return terminar('maximo');

    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return {
    detener: () => terminar('manual'),
    huboVoz: () => huboVoz,
  };
}
