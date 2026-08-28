/**
 * STT — El oído de Rumi
 * =====================
 *
 * Los niños de 5 a 10 años no escriben. Hablarle a Rumi no es un extra: es la
 * vía de entrada principal, y si falla, la app se convierte en un menú de
 * botones.
 *
 * POR QUÉ ESTO ES UNA SESIÓN Y NO UNA FUNCIÓN
 * -------------------------------------------
 * La primera versión abría el micrófono en cada turno, escuchaba una frase y
 * lo cerraba. Se rompía de tres maneras a la vez:
 *
 *   1. Tras dos silencios seguidos, la pantalla dejaba de escuchar del todo.
 *      Un niño que se queda callado seis segundos dos veces —que es lo que
 *      hace un niño de seis años— mataba la conversación para siempre.
 *   2. Abrir y cerrar el micrófono cada turno mete un retardo perceptible
 *      justo donde más se nota: entre que Rumi calla y el niño puede hablar.
 *   3. Online, el reconocedor iba en `continuous: false`: una frase y corta.
 *
 * Ahora el micrófono se abre UNA vez y se queda abierto. La sesión distingue
 * entre "no dijo nada todavía" y "terminó de hablar", y **nunca termina sola**.
 * Si el niño calla un minuto y luego habla, Rumi lo oye.
 *
 * ⚠️ Hablar no es un canal privilegiado. La transcripción entra por el mismo
 * enrutador que el texto escrito (`agent/router.js`): primero se intenta
 * resolver como intención contra las keywords del árbol; si no encaja, pasa
 * por los filtros de crisis y de tema emocional antes de que el modelo pueda
 * verla. Ninguna vía se salta la capa de seguridad. Ver regla #3.
 */

import { modoSTT, infoSTT } from './runtime.js';

export { modoSTT, infoSTT };

/*
 * Traza del ciclo de voz, solo en desarrollo.
 *
 * Depurar un micrófono a ciegas es lo que hizo que la primera versión se
 * publicara rota: desde fuera, "no me escucha" se ve igual tanto si falta el
 * permiso, como si el umbral no dispara, como si el modelo aún no cargó.
 * Con esto, `[voz]` en la consola cuenta exactamente en qué paso está.
 */
const traza = (...a) => { if (import.meta.env?.DEV) console.log('[voz]', ...a); };

/* ============================================================
   Parámetros de escucha — calibrados para niños, no para adultos
   ============================================================ */

/*
 * NO HAY UN UMBRAL DE VOZ FIJO, Y ESA ES LA PIEZA CLAVE.
 *
 * La primera versión usaba 0.012 de energía RMS como "aquí hay alguien
 * hablando". En la máquina de desarrollo el ruido de fondo medía 0.045 —un
 * ventilador, la calle, el propio portátil— así que el detector creía que el
 * niño estaba hablando sin parar: nunca encontraba el final de la frase y
 * nunca llegaba a transcribir nada. Desde fuera se veía como "Rumi no me
 * escucha", que es el peor síntoma posible porque no dice dónde está el fallo.
 *
 * Un aula de San José del Palmar tras un sismo no es una cabina de grabación:
 * hay lluvia sobre el zinc, hay otros niños, hay generadores. Cualquier
 * número fijo que eligiéramos estaría mal en la mitad de los sitios donde
 * esto tiene que funcionar. Así que el umbral se calibra solo contra el
 * silencio real de cada lugar, y se recalibra mientras la app está abierta.
 */
const PISO_ABSOLUTO = 0.006; // por debajo de esto no es voz ni en una cabina
const FACTOR_VOZ = 2.4;      // cuánto hay que destacar sobre el fondo para contar
const FACTOR_FIN = 1.8;      // histéresis: cuesta menos seguir hablando que empezar
const SILENCIO_FIN = 1100;   // pausa que damos por "ya terminó la frase"
const MINIMO_VOZ = 280;      // menos que esto es un ruido, no una frase
const MAXIMO_FRASE = 12000;  // tope duro por segmento
const CALIBRACION = 700;     // se escucha el silencio antes de escuchar al niño

const SR = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export const webSpeechDisponible = Boolean(SR);

export function sttDisponible() {
  if (modoSTT === 'web') return webSpeechDisponible;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/* ============================================================
   Whisper vive en un worker — ver whisper.worker.js
   ============================================================ */

let worker = null;
let seq = 0;
const pendientes = new Map();
const suscriptoresProgreso = new Set();
let whisperCargado = false;

function obtenerWorker() {
  if (worker) return worker;

  worker = new Worker(new URL('./whisper.worker.js', import.meta.url), { type: 'module' });

  worker.onmessage = ({ data }) => {
    if (data.tipo === 'progreso') {
      suscriptoresProgreso.forEach((f) => f(data.valor));
      return;
    }
    if (data.tipo === 'listo') {
      whisperCargado = true;
      traza('Whisper listo', data);
      suscriptoresProgreso.forEach((f) => f(100));
      return;
    }
    const p = pendientes.get(data.id);
    if (!p) return;
    pendientes.delete(data.id);
    if (data.tipo === 'texto') p.resolver(data.texto);
    else p.rechazar(new Error(data.mensaje));
  };

  return worker;
}

export function precargarWhisper(onProgreso) {
  if (onProgreso) suscriptoresProgreso.add(onProgreso);
  obtenerWorker().postMessage({ tipo: 'precargar' });
  return Promise.resolve();
}

export function whisperListo() {
  return whisperCargado;
}

function transcribir(audio) {
  const id = ++seq;
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar });
    // El buffer se transfiere en vez de copiarse: son cientos de miles de
    // muestras y copiarlas en cada frase se nota.
    obtenerWorker().postMessage({ tipo: 'transcribir', id, audio }, [audio.buffer]);
  });
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

/**
 * Diagnóstico del oído, para poder medirlo en vez de opinar sobre él.
 *
 *     import('/src/services/stt.js').then(m => m.medirOido())
 *
 * Manda unos segundos de audio sintético al worker y devuelve cuánto tardó.
 * Sirve para saber si el aislamiento cross-origin está activo sin tener que
 * pedirle a alguien que hable delante del micrófono.
 */
export async function medirOido(segundos = 3) {
  const audio = new Float32Array(16000 * segundos);
  for (let i = 0; i < audio.length; i++) {
    // Un tono con algo de ruido: no dirá nada, pero recorre la misma ruta.
    audio[i] = Math.sin(i * 0.04) * 0.1 + (Math.random() - 0.5) * 0.02;
  }
  const t0 = performance.now();
  const texto = await transcribir(audio);
  const ms = Math.round(performance.now() - t0);
  return { segundosDeAudio: segundos, ms, vecesTiempoReal: +(ms / (segundos * 1000)).toFixed(2), texto };
}

/* ============================================================
   SESIÓN OFFLINE — micrófono permanente + Whisper local
   ============================================================ */

function sesionLocal({ onEstado, onResultado, onNivel, onAviso }) {
  let stream = null;
  let ctx = null;
  let analizador = null;
  let datos = null;
  let temporizador = null;

  let activa = false;    // la pantalla quiere escuchar
  let atendiendo = false; // el turno es del niño (Rumi no está hablando)
  let grabadora = null;
  let trozos = [];
  let huboVoz = false;
  let ultimaVoz = 0;
  let inicioVoz = 0;
  let ruidoFondo = 0.01;   // se ajusta solo al silencio real del lugar
  let calibrandoHasta = 0; // al empezar cada turno se vuelve a medir la sala

  async function abrir() {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analizador = ctx.createAnalyser();
      analizador.fftSize = 1024;
      analizador.smoothingTimeConstant = 0.7;
      ctx.createMediaStreamSource(stream).connect(analizador);
      datos = new Float32Array(analizador.fftSize);

      // setInterval y no requestAnimationFrame a propósito: rAF se detiene
      // cuando la pestaña pierde el foco, y con ello el niño dejaría de ser
      // escuchado sin que nada lo indicara.
      temporizador = setInterval(vigilar, 60);
      traza('micrófono abierto');
      return true;
    } catch (e) {
      onAviso?.(e?.name === 'NotAllowedError' ? 'sin_permiso' : 'fallo');
      return false;
    }
  }

  function arrancarGrabacion() {
    trozos = [];
    grabadora = new MediaRecorder(stream);
    grabadora.ondataavailable = (e) => { if (e.data.size > 0) trozos.push(e.data); };
    grabadora.onstop = procesarSegmento;
    grabadora.start();
  }

  async function procesarSegmento() {
    const partes = trozos;
    trozos = [];
    if (!partes.length) return;

    try {
      onEstado?.('transcribiendo');
      const audio = await aPcm16k(new Blob(partes, { type: 'audio/webm' }));

      // Demasiado corto: fue un golpe, una silla, una tos. Seguimos escuchando.
      if (audio.length < 16000 * 0.3) {
        if (activa && atendiendo) onEstado?.('escuchando');
        return;
      }

      traza('transcribiendo', (audio.length / 16000).toFixed(2), 's de audio');
      const t0 = Date.now();
      const texto = await transcribir(audio);
      traza('transcrito en', Date.now() - t0, 'ms:', JSON.stringify(texto));

      // Whisper devuelve marcadores tipo "[Música]" cuando solo oyó ruido.
      const vacio = !texto || /^[[(].*[\])]$/.test(texto) || texto.replace(/[^\p{L}]/gu, '').length < 2;
      if (vacio) {
        traza('descartado por vacío');
        if (activa && atendiendo) onEstado?.('escuchando');
        return;
      }

      onResultado?.(texto);
    } catch (e) {
      traza('falló la transcripción:', e?.message || e);
      if (activa && atendiendo) onEstado?.('escuchando');
    }
  }

  function vigilar() {
    if (!analizador) return;
    analizador.getFloatTimeDomainData(datos);

    let suma = 0;
    for (let i = 0; i < datos.length; i++) suma += datos[i] * datos[i];
    const rms = Math.sqrt(suma / datos.length);

    // El nivel se reporta siempre que sea el turno del niño, aunque no hable:
    // las ondas quietas también comunican "te estoy oyendo".
    if (activa && atendiendo) {
      onNivel?.(Math.min(1, Math.max(0, (rms - ruidoFondo) / 0.06)));
    }

    if (!activa || !atendiendo) return;

    const ahora = Date.now();

    // Los primeros milisegundos de cada turno son solo para oír la sala. Sin
    // esto, la estimación del ruido arrastra la del turno anterior: si el
    // niño había hablado fuerte, o si alguien encendió un ventilador, el
    // umbral quedaba mal puesto y la frase no se cerraba nunca. Se vio en una
    // prueba real: segmentos de dieciséis segundos de ruido continuo.
    if (ahora < calibrandoHasta) {
      ruidoFondo = ruidoFondo * 0.7 + rms * 0.3;
      return;
    }

    // Mientras nadie habla, esto sigue aprendiendo cómo suena el silencio.
    // Baja deprisa y sube muy despacio: así una frase larga no envenena la
    // estimación, pero un ventilador que arranca sí acaba incorporándose.
    if (!huboVoz) {
      ruidoFondo = rms < ruidoFondo
        ? ruidoFondo * 0.90 + rms * 0.10
        : ruidoFondo * 0.98 + rms * 0.02;
    }

    const umbralInicio = Math.max(PISO_ABSOLUTO, ruidoFondo * FACTOR_VOZ);
    const umbralSigue = Math.max(PISO_ABSOLUTO * 0.7, ruidoFondo * FACTOR_FIN);

    if (rms > (huboVoz ? umbralSigue : umbralInicio)) {
      if (!huboVoz) {
        huboVoz = true;
        inicioVoz = ahora;
        traza('empieza a hablar · rms', rms.toFixed(4), '· fondo', ruidoFondo.toFixed(4), '· umbral', umbralInicio.toFixed(4));
        arrancarGrabacion();
      }
      ultimaVoz = ahora;
      return;
    }

    if (!huboVoz) return; // silencio antes de empezar: esperamos lo que haga falta

    const bastanteVoz = ultimaVoz - inicioVoz > MINIMO_VOZ;
    const finFrase = ahora - ultimaVoz > SILENCIO_FIN;
    const demasiadoLargo = ahora - inicioVoz > MAXIMO_FRASE;

    if (finFrase || demasiadoLargo) {
      traza(demasiadoLargo ? 'frase demasiado larga, corto' : 'fin de frase');
      huboVoz = false;
      if (grabadora?.state === 'recording') {
        if (bastanteVoz) grabadora.stop();
        else { grabadora.onstop = null; grabadora.stop(); trozos = []; }
      }
    }
  }

  return {
    async escuchar() {
      activa = true;
      if (!(await abrir())) return;
      atendiendo = true;
      huboVoz = false;
      calibrandoHasta = Date.now() + CALIBRACION;
      traza('turno del niño');
      onEstado?.('escuchando');
    },
    pausar() {
      if (atendiendo) traza('turno de Rumi');
      atendiendo = false;
      huboVoz = false;
      if (grabadora?.state === 'recording') { grabadora.onstop = null; grabadora.stop(); }
      trozos = [];
    },
    cerrar() {
      activa = false;
      atendiendo = false;
      clearInterval(temporizador);
      if (grabadora?.state === 'recording') { grabadora.onstop = null; grabadora.stop(); }
      stream?.getTracks().forEach((t) => t.stop());
      try { ctx?.close(); } catch { /* ya cerrado */ }
      stream = null; ctx = null; analizador = null;
    },
  };
}

/* ============================================================
   SESIÓN ONLINE — Web Speech continuo, con reinicio automático
   ============================================================ */

function sesionWeb({ onEstado, onParcial, onResultado, onNivel, onAviso }) {
  let rec = null;
  let activa = false;
  let atendiendo = false;
  let reinicio = null;

  // Analizador aparte solo para animar las ondas. Si el navegador no deja
  // abrir un segundo stream, la conversación funciona igual: se pierde la
  // animación, no el oído.
  let ctx = null, analizador = null, datos = null, streamNivel = null, temporizador = null;

  async function abrirNivel() {
    if (streamNivel || !navigator.mediaDevices?.getUserMedia) return;
    try {
      streamNivel = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analizador = ctx.createAnalyser();
      analizador.fftSize = 1024;
      analizador.smoothingTimeConstant = 0.7;
      ctx.createMediaStreamSource(streamNivel).connect(analizador);
      datos = new Float32Array(analizador.fftSize);
      temporizador = setInterval(() => {
        if (!activa || !atendiendo || !analizador) return;
        analizador.getFloatTimeDomainData(datos);
        let s = 0;
        for (let i = 0; i < datos.length; i++) s += datos[i] * datos[i];
        onNivel?.(Math.min(1, Math.sqrt(s / datos.length) / 0.08));
      }, 60);
    } catch { /* sin ondas, pero con oído */ }
  }

  function crear() {
    const r = new SR();
    r.lang = 'es-CO';
    r.continuous = true;      // la sesión no se cierra al final de cada frase
    r.interimResults = true;  // parciales: el niño ve que lo estamos oyendo
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      if (!atendiendo) return;
      let final = '';
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else parcial += t;
      }
      if (parcial) onParcial?.(parcial);
      const limpio = final.trim();
      if (limpio) { onParcial?.(''); onResultado?.(limpio); }
    };

    r.onerror = (e) => {
      // 'no-speech' y 'aborted' son parte del funcionamiento normal de una
      // conversación con un niño, no fallos: no se le avisa de nada.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        activa = false;
        onAviso?.('sin_permiso');
      }
    };

    // La clave de la fluidez: Chrome cierra el reconocedor por su cuenta cada
    // pocos segundos de silencio. Lo volvemos a levantar siempre.
    r.onend = () => {
      if (!activa) return;
      clearTimeout(reinicio);
      reinicio = setTimeout(() => { if (activa) arrancar(); }, 220);
    };

    return r;
  }

  function arrancar() {
    if (!rec) rec = crear();
    try { rec.start(); } catch { /* ya estaba escuchando */ }
  }

  return {
    async escuchar() {
      activa = true;
      atendiendo = true;
      abrirNivel();
      arrancar();
      onEstado?.('escuchando');
    },
    pausar() {
      // No se apaga el reconocedor: se deja de atender. Reabrirlo en cada
      // turno es lo que hacía que el primer segundo de lo que decía el niño
      // se perdiera.
      atendiendo = false;
      onParcial?.('');
    },
    cerrar() {
      activa = false;
      atendiendo = false;
      clearTimeout(reinicio);
      try { rec?.abort(); } catch { /* ya detenido */ }
      rec = null;
      clearInterval(temporizador);
      streamNivel?.getTracks().forEach((t) => t.stop());
      try { ctx?.close(); } catch { /* ya cerrado */ }
      streamNivel = null; ctx = null; analizador = null;
    },
  };
}

/* ============================================================
   INTERFAZ ÚNICA
   ============================================================ */

/**
 * Abre una sesión de escucha que dura toda la conversación.
 *
 * @param {object} cb {onEstado, onParcial, onResultado, onNivel, onAviso}
 * @returns {{escuchar: Function, pausar: Function, cerrar: Function}}
 *
 * `escuchar()` cede el turno al niño · `pausar()` mientras Rumi habla ·
 * `cerrar()` al salir de la pantalla. Ninguna de las tres termina la sesión
 * por su cuenta: eso solo lo decide la pantalla.
 */
export function crearSesionEscucha(cb) {
  return modoSTT === 'local' ? sesionLocal(cb) : sesionWeb(cb);
}

/** Mensajes para el niño. Nunca decimos "error": decimos qué hacer. */
export const MENSAJES = {
  sin_permiso: 'Necesito permiso para escucharte. Pídele ayuda a un adulto.',
  fallo: 'No pude prender el micrófono. Puedes escribirme o tocar un botón.',
};
