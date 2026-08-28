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
 * EL OÍDO NO SE APAGA MIENTRAS RUMI HABLA
 * ---------------------------------------
 * Esa era la diferencia de fondo con un modo de voz de verdad. Antes, cuando
 * le tocaba hablar a Rumi, la sesión se pausaba: el niño podía gritarle y no
 * pasaba nada hasta que el osito terminara su frase. Eso es un walkie-talkie.
 *
 * Ahora hay un tercer estado, `vigilar()`: el micrófono sigue midiendo
 * mientras Rumi habla, con el listón más alto, y en cuanto detecta voz humana
 * sostenida avisa (`onInterrupcion`). La pantalla calla a Rumi en el acto y le
 * devuelve el turno al niño, con el audio ya grabándose desde antes de la
 * confirmación para no perderle la primera sílaba.
 *
 * El listón más alto y el `echoCancellation` del navegador son lo que evita
 * que Rumi se interrumpa a sí mismo al oírse por el altavoz.
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

/*
 * Y un techo para el fondo estimado.
 *
 * El ajuste automático es lo que hace que esto funcione en un aula con lluvia
 * sobre el zinc, pero sin límite tiene un final malo: si el ruido sube y sube
 * —música puesta, varios niños, un generador— el umbral sube con él hasta que
 * ninguna voz normal lo alcanza, y la app se queda sorda de forma permanente
 * sin que nada lo indique. Por encima de este techo el umbral deja de crecer:
 * es preferible transcribir algo de ruido de más que no oír al niño.
 */
const TECHO_FONDO = 0.035;

/*
 * 1100 ms de silencio para dar por terminada la frase era lo que hacía que
 * cada turno arrancara con un segundo largo de nada. Una pausa humana entre
 * turnos ronda los 200 ms; los sistemas de voz conversacional cierran entre
 * 500 y 800. 750 es el punto donde el turno se siente inmediato sin cortarle
 * la frase a un niño que se toma su tiempo para pensar la palabra siguiente.
 */
const SILENCIO_FIN = 750;
const MINIMO_VOZ = 250;      // menos que esto es un ruido, no una frase

/*
 * Tope duro por segmento, y no es un detalle: es lo que salva la app en una
 * sala con una televisión encendida.
 *
 * Con voz de fondo continua el detector nunca encuentra el silencio que
 * cierra la frase, así que seguía grabando hasta el tope. Medido en esta
 * misma máquina con una tele puesta: segmentos de 23 segundos, que Whisper
 * tardó 20 en transcribir y devolvió como "es que dejarlo de máximo 3
 * minutos" — el audio del programa, no el niño.
 *
 * Un niño de seis años no dice frases de doce segundos. Siete es de sobra, y
 * corta el ciclo antes de que se vuelva inútil.
 */
const MAXIMO_FRASE = 7000;

/*
 * Y de lo grabado, al modelo solo van los últimos segundos.
 *
 * Si el segmento se llenó de ruido de fondo, lo que dijo el niño está al
 * final: es lo que acaba de pasar. Recortar por delante quita ruido, acorta
 * la transcripción y deja lo que importa.
 */
const MAXIMO_A_TRANSCRIBIR = 8000;

/** Más de esto esperando al oído y se le pide al niño que lo repita. */
const TOPE_TRANSCRIPCION = 25000;
const CALIBRACION = 600;     // se escucha el silencio antes de escuchar al niño

/*
 * INTERRUMPIR A RUMI: EL PROBLEMA DEL ALTAVOZ, MEDIDO
 * ---------------------------------------------------
 * La cancelación de eco del navegador no cancela la voz del sintetizador.
 * `speechSynthesis` no sale por WebAudio: lo reproduce el sistema operativo,
 * fuera del grafo que el navegador sabe restar del micrófono. Medido en esta
 * máquina, con los altavoces del portátil: mientras Rumi hablaba, el
 * micrófono registraba entre 0.074 y 0.17 de RMS sobre un fondo de 0.01.
 *
 * Con un umbral fijo, eso hacía que Rumi se interrumpiera a sí mismo en la
 * primera frase, cada vez. Y peor: como el turno pasaba al niño, grababa
 * doce segundos de su propia voz y se los mandaba a Whisper, que devolvía
 * frases sin sentido que entraban en la conversación como si fueran del niño.
 *
 * La solución es no comparar contra el silencio, sino contra el eco: se mide
 * cuánto se está colando la propia voz de Rumi y se exige superarla con
 * holgura. El niño está mucho más cerca del micrófono que el altavoz, así
 * que hablando normal la supera; el altavoz, por definición, no se supera a
 * sí mismo.
 *
 * Con auriculares no hay eco que medir y el umbral cae solo al mínimo.
 */
const FACTOR_BARGE = 3.2;   // sobre el ruido de fondo
const FACTOR_ECO = 1.8;     // sobre la propia voz de Rumi colándose
const SOSTEN_BARGE = 420;   // voz sostenida antes de dar por buena la interrupción
const GRACIA_ECO = 350;     // al empezar a hablar, primero se mide el eco

const SR = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export const webSpeechDisponible = Boolean(SR);

export function sttDisponible() {
  if (modoSTT === 'web') return webSpeechDisponible;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/* ============================================================
   Filtro de eco — que Rumi no se conteste a sí mismo
   ============================================================ */

function normalizar(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿Lo que se acaba de oír es el propio altavoz?
 *
 * Sin auriculares, el reconocedor del navegador transcribe a Rumi tan bien
 * como al niño. La cancelación de eco del micrófono quita la mayor parte,
 * pero no toda: lo que sobrevive se reconoce como frases sueltas de lo que
 * Rumi está diciendo justo ahora. Si casi todas las palabras oídas están en
 * lo que Rumi acaba de decir, no es un turno: es su propia voz.
 *
 * @param {string} oido        lo que transcribió el reconocedor
 * @param {string} dichoPorRumi lo que Rumi lleva dicho en este turno
 */
export function pareceEco(oido, dichoPorRumi) {
  const a = normalizar(oido).split(' ').filter((p) => p.length > 2);
  const b = normalizar(dichoPorRumi);
  if (!a.length || !b) return false;

  const coincidencias = a.filter((p) => b.includes(p)).length;
  return coincidencias / a.length >= 0.6;
}

/* ============================================================
   Whisper vive en un worker — ver whisper.worker.js
   ============================================================ */

let worker = null;
let seq = 0;
const pendientes = new Map();
const suscriptoresProgreso = new Set();
const suscriptoresListo = new Set();
let whisperCargado = false;
let infoWhisper = null;   // qué motor acabó usando el oído, y cuánto tardó en calentar
let ultimoMsTranscripcion = 0;

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
      infoWhisper = data;
      traza('Whisper listo', data);
      suscriptoresProgreso.forEach((f) => f(100));
      suscriptoresListo.forEach((f) => f(data));
      return;
    }
    if (data.tipo === 'mejorado') {
      // La segunda etapa relevó a la primera. No se avisa al niño: la
      // conversación no cambia, solo entiende mejor a partir de ahora.
      infoWhisper = { ...(infoWhisper || {}), configuracion: data.configuracion };
      traza('oído mejorado a', data.configuracion);
      return;
    }
    if (data.tipo === 'aviso') {
      // Una configuración que no arrancó. No es un fallo mientras quede otra.
      traza('oído:', data.mensaje);
      return;
    }
    const p = pendientes.get(data.id);
    if (!p) return;
    pendientes.delete(data.id);
    if (data.tipo === 'texto') {
      ultimoMsTranscripcion = data.ms || 0;
      p.resolver(data.texto);
    } else {
      p.rechazar(new Error(data.mensaje));
    }
  };

  return worker;
}

/*
 * Un audio conocido, para que el motor demuestre que oye antes de que le
 * confiemos la voz de un niño. Ver `suenaBien` en el worker: hay motores que
 * cargan sin error y transcriben basura, y ese fallo es indistinguible de un
 * micrófono roto si no se comprueba.
 *
 * El worker no puede decodificar un WAV por su cuenta —no hay AudioContext
 * fuera del hilo principal— así que se le manda ya convertido.
 */
async function cargarReferencia() {
  try {
    const url = new URL('oido-referencia.wav', document.baseURI).href;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await aPcm16k(await res.blob());
  } catch {
    return null; // sin referencia, el worker acepta la primera que cargue
  }
}

export async function precargarWhisper(onProgreso, onListo) {
  if (onProgreso) suscriptoresProgreso.add(onProgreso);
  if (onListo) {
    // Si ya estaba cargado, se avisa igual: quien pregunta necesita saberlo
    // ahora, no en la próxima carga que ya no va a ocurrir.
    if (whisperCargado) onListo(infoWhisper);
    else suscriptoresListo.add(onListo);
  }
  const referencia = await cargarReferencia();
  const w = obtenerWorker();
  const preferencia = new URLSearchParams(window.location.search).get('oido') || undefined;
  if (referencia) w.postMessage({ tipo: 'precargar', referencia, preferencia }, [referencia.buffer]);
  else w.postMessage({ tipo: 'precargar', preferencia });
}

export function whisperListo() {
  return whisperCargado;
}

/** Con qué motor está oyendo Rumi, para poder decirlo en vez de suponerlo. */
export function infoOido() {
  return {
    cargado: whisperCargado,
    ...(infoWhisper || {}),
    ultimoMsTranscripcion,
  };
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

/**
 * Pasa un archivo de audio por la misma ruta que el micrófono.
 *
 *     import('/src/services/stt.js').then(m => m.probarOido('/pruebas/a.wav'))
 *
 * Sirve para separar dos preguntas que desde fuera se ven idénticas: "no me
 * escucha porque el micrófono no capta" y "no me escucha porque el modelo no
 * entiende lo que capta". Con un archivo conocido, lo segundo se mide.
 */
export async function probarOido(url) {
  const res = await fetch(url);
  const blob = await res.blob();

  const t0 = performance.now();
  // El mismo pre-procesado que recibe la voz del niño: si la prueba midiera
  // otra cosa, el número no serviría para diagnosticar nada.
  const audio = recortarSilencio(await aPcm16k(blob));
  const msConversion = Math.round(performance.now() - t0);

  let suma = 0;
  let pico = 0;
  for (let i = 0; i < audio.length; i++) {
    suma += audio[i] * audio[i];
    if (Math.abs(audio[i]) > pico) pico = Math.abs(audio[i]);
  }

  const t1 = performance.now();
  const texto = await transcribir(audio);
  return {
    url,
    segundos: +(audio.length / 16000).toFixed(2),
    rms: +Math.sqrt(suma / audio.length).toFixed(4),
    pico: +pico.toFixed(3),
    msConversion,
    msTranscripcion: Math.round(performance.now() - t1),
    texto,
  };
}

/* ============================================================
   SESIÓN OFFLINE — micrófono permanente + Whisper local
   ============================================================

   El audio entra por un AudioWorklet (`public/captura-audio.worklet.js`) en
   bloques de 16 kHz ya listos para el modelo. Antes esto era un
   `MediaRecorder` que empezaba a grabar cuando el detector confirmaba voz, y
   por eso se comía la primera sílaba de cada frase: "hoy jugué fútbol" le
   llegaba a Whisper descabezado y salía "hoy juguenas". Ahora todo pasa por
   un buffer circular, así que cuando se detecta voz el medio segundo
   anterior ya está guardado.
   ============================================================ */

/** Cuánto audio previo al inicio de la voz se conserva. */
const PRE_ROLL_MS = 500;
const TASA = 16000;

/**
 * Deja solo la parte con voz, con un pequeño margen a cada lado.
 *
 * El margen importa: cortar pegado al primer fonema le come el ataque de la
 * palabra al modelo, que es justo el error que este archivo lleva evitando
 * desde el buffer circular.
 */
function recortarSilencio(audio, margenMs = 180) {
  const ventana = 256;
  const margen = Math.round((margenMs / 1000) * TASA);

  let primera = -1;
  let ultima = -1;
  for (let i = 0; i + ventana <= audio.length; i += ventana) {
    let suma = 0;
    for (let j = i; j < i + ventana; j++) suma += audio[j] * audio[j];
    if (Math.sqrt(suma / ventana) > 0.02) {
      if (primera < 0) primera = i;
      ultima = i + ventana;
    }
  }

  if (primera < 0) return audio; // no se encontró voz clara: que decida el modelo

  const desde = Math.max(0, primera - margen);
  const hasta = Math.min(audio.length, ultima + margen);
  return hasta - desde < audio.length ? audio.slice(desde, hasta) : audio;
}

function sesionLocal({ onEstado, onResultado, onNivel, onAviso, onInterrupcion }) {
  let stream = null;
  let ctx = null;
  let nodoCaptura = null;
  let fuente = null;

  // 'nadie' = micrófono apagado · 'nino' = su turno · 'rumi' = habla Rumi y
  // solo vigilamos por si el niño lo interrumpe.
  let turno = 'nadie';

  // Buffer circular con el pasado inmediato, siempre girando.
  const preRoll = new Float32Array(Math.round((PRE_ROLL_MS / 1000) * TASA));
  let preIdx = 0;
  let preLleno = false;

  let grabando = false;
  let trozos = [];
  let muestrasGrabadas = 0;

  let huboVoz = false;
  let ultimaVoz = 0;
  let inicioVoz = 0;
  let interrumpioYa = false;  // ya avisamos de esta interrupción
  let ruidoFondo = 0.01;      // se ajusta solo al silencio real del lugar
  let calibrandoHasta = 0;    // al abrir el micrófono se mide la sala
  let nivelEco = 0;           // cuánto se cuela la voz de Rumi por el micrófono
  let midiendoEcoHasta = 0;   // gracia al empezar a hablar, para medirlo

  async function abrir() {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      // El contexto se abre directamente a la tasa que quiere Whisper: el
      // remuestreo lo hace el navegador, no nosotros, y desaparece todo el
      // paso de decodificar y convertir que había antes.
      ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TASA });
      if (ctx.state === 'suspended') await ctx.resume();

      const url = new URL('captura-audio.worklet.js', document.baseURI).href;
      await ctx.audioWorklet.addModule(url);

      fuente = ctx.createMediaStreamSource(stream);
      nodoCaptura = new AudioWorkletNode(ctx, 'captura-audio');
      nodoCaptura.port.onmessage = (e) => procesarBloque(e.data);
      fuente.connect(nodoCaptura);
      // No se conecta a la salida: se escucha, no se reproduce.

      calibrandoHasta = Date.now() + CALIBRACION;
      traza('micrófono abierto ·', ctx.sampleRate, 'Hz');
      return true;
    } catch (e) {
      traza('no se pudo abrir el micrófono:', e?.name, e?.message);
      onAviso?.(e?.name === 'NotAllowedError' ? 'sin_permiso' : 'fallo');
      return false;
    }
  }

  /** Guarda el bloque en el pasado reciente, pisando lo más viejo. */
  function guardarEnPreRoll(bloque) {
    for (let i = 0; i < bloque.length; i++) {
      preRoll[preIdx++] = bloque[i];
      if (preIdx === preRoll.length) { preIdx = 0; preLleno = true; }
    }
  }

  /** Devuelve el pasado reciente en orden cronológico. */
  function leerPreRoll() {
    if (!preLleno) return preRoll.slice(0, preIdx);
    const salida = new Float32Array(preRoll.length);
    salida.set(preRoll.subarray(preIdx), 0);
    salida.set(preRoll.subarray(0, preIdx), preRoll.length - preIdx);
    return salida;
  }

  function arrancarGrabacion() {
    // La frase empieza medio segundo ANTES de que el detector se diera cuenta.
    const pasado = leerPreRoll();
    trozos = [pasado];
    muestrasGrabadas = pasado.length;
    grabando = true;
  }

  function descartarGrabacion() {
    grabando = false;
    trozos = [];
    muestrasGrabadas = 0;
    huboVoz = false;
  }

  /**
   * Junta los bloques y sube el volumen a un nivel que Whisper entienda.
   *
   * Un micrófono de portátil a medio metro entrega picos de 0,1. El modelo se
   * entrenó con audio normalizado, y con señal así de baja devuelve "[Música]"
   * o directamente nada — que desde fuera se ve como "no me escucha".
   */
  function montarAudio() {
    const completo = new Float32Array(muestrasGrabadas);
    let offset = 0;
    for (const t of trozos) { completo.set(t, offset); offset += t.length; }

    // Solo el final: lo que el niño acaba de decir. Ver MAXIMO_A_TRANSCRIBIR.
    const tope = Math.round((MAXIMO_A_TRANSCRIBIR / 1000) * TASA);
    const recortado = completo.length > tope ? completo.slice(completo.length - tope) : completo;

    /*
     * Fuera el silencio de los bordes.
     *
     * Cada segmento arrastra medio segundo de pre-roll por delante y los 750
     * ms de silencio que sirvieron para dar la frase por terminada. Eso es
     * más de un segundo de nada que el modelo procesa igual: el tiempo de
     * transcripción sube con la duración del audio —medido: 2 s de voz
     * costaban 3, y 6,6 s costaban 8,8— y encima el silencio largo es justo
     * lo que empuja a Whisper a inventar texto.
     */
    const audio = recortarSilencio(recortado);

    let pico = 0;
    for (let i = 0; i < audio.length; i++) {
      const abs = Math.abs(audio[i]);
      if (abs > pico) pico = abs;
    }

    // Un pico así de bajo no es voz: es la sala. No se amplifica el silencio.
    if (pico < 0.012) return { audio, pico, ganancia: 1 };

    // Tope de ganancia: multiplicar por veinte convierte cualquier zumbido en
    // algo que el modelo intenta interpretar, y ahí es donde alucina.
    const ganancia = Math.min(8, 0.85 / pico);
    if (ganancia > 1.05) {
      for (let i = 0; i < audio.length; i++) audio[i] *= ganancia;
    }
    return { audio, pico, ganancia };
  }

  async function cerrarSegmento() {
    if (!grabando) return;
    grabando = false;

    const { audio, pico, ganancia } = montarAudio();
    trozos = [];
    muestrasGrabadas = 0;

    // Demasiado corto: fue un golpe, una silla, una tos.
    if (audio.length < TASA * 0.3) {
      traza('segmento descartado por corto:', (audio.length / TASA).toFixed(2), 's');
      if (turno === 'nino') onEstado?.('escuchando');
      return;
    }
    if (pico < 0.012) {
      traza('segmento descartado por mudo · pico', pico.toFixed(4));
      if (turno === 'nino') onEstado?.('escuchando');
      return;
    }

    // Aviso de que ya no se está oyendo, sino pensando. La pantalla lo usa
    // para que Rumi conteste algo enseguida en vez de dejar un silencio de
    // tres segundos mientras el modelo trabaja.
    onEstado?.('transcribiendo');

    try {
      traza('transcribiendo', (audio.length / TASA).toFixed(2), 's · pico', pico.toFixed(3), '· ganancia', ganancia.toFixed(1));
      const t0 = Date.now();
      /*
       * Con tope de tiempo. Si el oído se atasca —el modelo aún bajando, la
       * GPU ocupada, cualquier cosa— el turno se queda colgado y Rumi mudo
       * para siempre, que es exactamente el fallo que se reportó. Mejor pedir
       * que lo repita que quedarse callado.
       */
      const texto = await Promise.race([
        transcribir(audio),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('el oído tardó demasiado')), TOPE_TRANSCRIPCION)),
      ]);
      traza('transcrito en', Date.now() - t0, 'ms:', JSON.stringify(texto));

      // Whisper devuelve marcadores tipo "[Música]" cuando solo oyó ruido.
      const vacio = !texto || /^[[(].*[\])]$/.test(texto) || texto.replace(/[^\p{L}]/gu, '').length < 2;
      if (vacio) {
        traza('descartado por vacío');
        // Hubo voz de sobra, pero no se entendió. Hay que avisar sí o sí: la
        // pantalla ya abrió la boca de Rumi al empezar a transcribir, y si
        // nadie le dice que no hubo texto se queda con la boca abierta para
        // siempre — mudo y sin devolver el turno. Un fallo de esos se ve
        // exactamente igual que un micrófono roto.
        onEstado?.('sin_texto');
        return;
      }

      onResultado?.(texto);
    } catch (e) {
      traza('falló la transcripción:', e?.message || e);
      onEstado?.('sin_texto');
    }
  }

  /* ------------------------------------------------------------
     El detector de voz, un bloque cada ~64 ms
     ------------------------------------------------------------ */
  function procesarBloque(bloque) {
    guardarEnPreRoll(bloque);
    if (grabando) {
      trozos.push(bloque);
      muestrasGrabadas += bloque.length;
    }
    if (turno === 'nadie') return;

    let suma = 0;
    for (let i = 0; i < bloque.length; i++) suma += bloque[i] * bloque[i];
    const rms = Math.sqrt(suma / bloque.length);

    // El nivel se reporta siempre que sea el turno del niño, aunque no hable:
    // las ondas quietas también comunican "te estoy oyendo".
    if (turno === 'nino') {
      onNivel?.(Math.min(1, Math.max(0, (rms - ruidoFondo) / 0.06)));
    }

    const ahora = Date.now();

    // Los primeros milisegundos son solo para oír la sala. Sin esto, el umbral
    // arranca mal puesto y la primera frase no se cierra nunca: se vio en una
    // prueba real, segmentos de dieciséis segundos de ruido continuo.
    // Se calibra al abrir el micrófono y NO en cada turno: recalibrar al
    // ceder el turno metía medio segundo sordo justo después de que Rumi
    // callaba, que es cuando el niño responde.
    if (ahora < calibrandoHasta) {
      ruidoFondo = ruidoFondo * 0.7 + rms * 0.3;
      return;
    }

    /*
     * Mientras nadie habla, esto sigue aprendiendo cómo suena el silencio.
     * Baja deprisa y sube muy despacio: así una frase larga no envenena la
     * estimación, pero un ventilador que arranca sí acaba incorporándose.
     *
     * Mientras habla Rumi solo se deja BAJAR. Si se dejara subir, la voz del
     * propio altavoz elevaría el umbral hasta que interrumpirlo fuera
     * imposible — el sistema se volvería sordo justo cuando más falta hace.
     *
     * Y hay un techo: un fondo estimado por las nubes deja al niño sin voz
     * audible para siempre, que es el peor final posible de un ajuste
     * automático. Por encima de ese techo, el umbral deja de crecer.
     */
    if (!huboVoz) {
      if (rms < ruidoFondo) ruidoFondo = ruidoFondo * 0.90 + rms * 0.10;
      else if (turno === 'nino') ruidoFondo = Math.min(TECHO_FONDO, ruidoFondo * 0.98 + rms * 0.02);
    }

    if (turno === 'rumi' && !huboVoz) {
      nivelEco = Math.max(rms, nivelEco * 0.97);
    }

    let umbralInicio;
    if (turno === 'rumi') {
      // Los primeros milisegundos de cada intervención de Rumi son para medir
      // su eco, no para escuchar: si no, el arranque de su propia voz se
      // detecta como una interrupción antes de que nadie haya hablado.
      if (ahora < midiendoEcoHasta) return;
      umbralInicio = Math.max(PISO_ABSOLUTO * 1.6, ruidoFondo * FACTOR_BARGE, nivelEco * FACTOR_ECO);
    } else {
      umbralInicio = Math.max(PISO_ABSOLUTO, ruidoFondo * FACTOR_VOZ);
    }
    const umbralSigue = Math.max(PISO_ABSOLUTO * 0.7, ruidoFondo * FACTOR_FIN);

    if (rms > (huboVoz ? umbralSigue : umbralInicio)) {
      if (!huboVoz) {
        huboVoz = true;
        inicioVoz = ahora;
        interrumpioYa = false;
        traza(turno === 'rumi' ? 'alguien habla encima de Rumi' : 'empieza a hablar',
          '· rms', rms.toFixed(4), '· fondo', ruidoFondo.toFixed(4),
          '· eco', nivelEco.toFixed(4), '· umbral', umbralInicio.toFixed(4));
        arrancarGrabacion();
      }
      ultimaVoz = ahora;

      // Voz sostenida encima de Rumi: se avisa una vez y la pantalla decide
      // (callar a Rumi y darle el turno).
      if (turno === 'rumi' && !interrumpioYa && ahora - inicioVoz > SOSTEN_BARGE) {
        interrumpioYa = true;
        traza('interrupción confirmada por volumen');
        onInterrupcion?.();
      }
      return;
    }

    if (!huboVoz) return; // silencio antes de empezar: esperamos lo que haga falta

    const bastanteVoz = ultimaVoz - inicioVoz > MINIMO_VOZ;
    const finFrase = ahora - ultimaVoz > SILENCIO_FIN;
    const demasiadoLargo = ahora - inicioVoz > MAXIMO_FRASE;

    if (finFrase || demasiadoLargo) {
      traza(demasiadoLargo ? 'frase demasiado larga, corto' : 'fin de frase');
      huboVoz = false;

      if (!bastanteVoz) { descartarGrabacion(); return; }

      /*
       * ALGUIEN HABLÓ MIENTRAS RUMI HABLABA Y NO LLEGÓ AL UMBRAL.
       *
       * Antes esto se tiraba sin más, y era la causa más probable de "le
       * hablo y no me contesta": con altavoces, la voz del niño rara vez
       * supera a la del propio altavoz, así que el volumen NUNCA confirmaba
       * la interrupción y su frase entera se perdía en silencio.
       *
       * Ahora se transcribe igual y decide el texto: si lo que se oyó no se
       * parece a lo que Rumi está diciendo, es el niño, y la pantalla lo
       * atiende aunque el volumen no diera para tanto. Cuesta una
       * transcripción de más; a cambio, hablarle siempre sirve para algo.
       */
      cerrarSegmento();
    }
  }

  return {
    /** Turno del niño: lo que diga se transcribe y se responde. */
    async escuchar() {
      if (!(await abrir())) return;
      if (ctx?.state === 'suspended') await ctx.resume();
      // Si veníamos de una interrupción, la grabación en curso ES la frase del
      // niño: no se toca. Solo se limpia cuando el micrófono estaba apagado.
      if (turno === 'nadie') descartarGrabacion();
      turno = 'nino';
      traza('turno del niño');
      onEstado?.('escuchando');
    },

    /** Turno de Rumi: seguimos oyendo, pero solo para dejarnos interrumpir. */
    async vigilar() {
      if (!(await abrir())) return;
      turno = 'rumi';
      interrumpioYa = false;
      nivelEco = 0;
      midiendoEcoHasta = Date.now() + GRACIA_ECO;
      // Lo que hubiera a medio grabar era del turno anterior.
      descartarGrabacion();
      onNivel?.(0);
      traza('turno de Rumi · vigilando por interrupción');
    },

    /** Micrófono apagado del todo (el niño lo pidió, o no hay permiso). */
    pausar() {
      turno = 'nadie';
      descartarGrabacion();
      onNivel?.(0);
    },

    cerrar() {
      turno = 'nadie';
      descartarGrabacion();
      try { nodoCaptura?.port.close(); } catch { /* ya cerrado */ }
      try { nodoCaptura?.disconnect(); fuente?.disconnect(); } catch { /* ya desconectado */ }
      stream?.getTracks().forEach((t) => t.stop());
      try { ctx?.close(); } catch { /* ya cerrado */ }
      stream = null; ctx = null; nodoCaptura = null; fuente = null;
    },
  };
}

/* ============================================================
   SESIÓN ONLINE — Web Speech continuo, con reinicio automático
   ============================================================ */

function sesionWeb({ onEstado, onParcial, onResultado, onNivel, onAviso, onInterrupcion, textoDeRumi }) {
  let rec = null;
  let activa = false;
  let turno = 'nadie';
  let reinicio = null;

  // Endpointing: Chrome tarda en marcar un resultado como definitivo. Si el
  // parcial deja de cambiar, es que el niño ya terminó, y esperar a que el
  // navegador se decida son varios centenares de milisegundos de silencio
  // incómodo en cada turno.
  const ESTABLE = 700;
  let estabilidad = null;
  let ultimoParcial = '';
  let yaEmitido = '';   // lo entregado por estabilidad, para no repetirlo

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
        if (!activa || turno !== 'nino' || !analizador) return;
        analizador.getFloatTimeDomainData(datos);
        let s = 0;
        for (let i = 0; i < datos.length; i++) s += datos[i] * datos[i];
        onNivel?.(Math.min(1, Math.sqrt(s / datos.length) / 0.08));
      }, 60);
    } catch { /* sin ondas, pero con oído */ }
  }

  function limpiarEstabilidad() {
    clearTimeout(estabilidad);
    estabilidad = null;
    ultimoParcial = '';
  }

  function entregar(texto) {
    const limpio = (texto || '').trim();
    if (!limpio) return;
    limpiarEstabilidad();
    onParcial?.('');
    yaEmitido = normalizar(limpio);
    onResultado?.(limpio);
  }

  /**
   * Decide qué hacer con lo que se oyó mientras Rumi hablaba.
   * @returns {boolean} true si es una interrupción de verdad
   */
  function esInterrupcionReal(texto) {
    const palabras = normalizar(texto).split(' ').filter(Boolean);
    if (palabras.length < 2) return false;            // un "sí" suelto puede ser ruido
    if (pareceEco(texto, textoDeRumi?.() || '')) {
      traza('descartado por eco:', JSON.stringify(texto));
      return false;
    }
    return true;
  }

  function crear() {
    const r = new SR();
    r.lang = 'es-CO';
    r.continuous = true;      // la sesión no se cierra al final de cada frase
    r.interimResults = true;  // parciales: el niño ve que lo estamos oyendo
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      if (turno === 'nadie') return;

      let final = '';
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else parcial += t;
      }

      /* --- Rumi está hablando: esto solo puede ser eco o una interrupción --- */
      if (turno === 'rumi') {
        const candidato = (final || parcial).trim();
        if (candidato && esInterrupcionReal(candidato)) {
          traza('interrupción confirmada:', JSON.stringify(candidato));
          onInterrupcion?.();
          // El turno ya es del niño: lo que dijo cuenta como su frase.
          if (final.trim()) entregar(final);
          else { ultimoParcial = parcial; onParcial?.(parcial); }
        }
        return;
      }

      /* --- Turno del niño --- */
      if (final.trim()) {
        const limpio = final.trim();
        // Puede ser la confirmación tardía de algo ya entregado por estabilidad.
        if (yaEmitido && normalizar(limpio) === yaEmitido) { yaEmitido = ''; return; }
        yaEmitido = '';
        entregar(limpio);
        return;
      }

      if (!parcial.trim()) return;
      onParcial?.(parcial);

      // Endpointing por estabilidad: si el parcial no se mueve, ya terminó.
      if (parcial !== ultimoParcial) {
        ultimoParcial = parcial;
        clearTimeout(estabilidad);
        estabilidad = setTimeout(() => {
          if (turno === 'nino' && ultimoParcial.trim().split(/\s+/).length >= 2) {
            traza('fin de frase por estabilidad del parcial');
            entregar(ultimoParcial);
          }
        }, ESTABLE);
      }
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
      turno = 'nino';
      limpiarEstabilidad();
      abrirNivel();
      arrancar();
      onEstado?.('escuchando');
    },

    /**
     * Turno de Rumi. El reconocedor NO se apaga: es lo que permite que el
     * niño le hable encima. Lo que llegue se compara contra lo que Rumi está
     * diciendo y se descarta si es su propio eco.
     */
    async vigilar() {
      activa = true;
      turno = 'rumi';
      limpiarEstabilidad();
      onParcial?.('');
      onNivel?.(0);
      arrancar();
    },

    pausar() {
      // No se apaga el reconocedor: se deja de atender. Reabrirlo en cada
      // turno es lo que hacía que el primer segundo de lo que decía el niño
      // se perdiera.
      turno = 'nadie';
      limpiarEstabilidad();
      onParcial?.('');
      onNivel?.(0);
    },

    cerrar() {
      activa = false;
      turno = 'nadie';
      limpiarEstabilidad();
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
 * @param {object} cb
 *   onEstado, onParcial, onResultado, onNivel, onAviso
 *   onInterrupcion() — el niño está hablando encima de Rumi
 *   textoDeRumi()    — qué lleva dicho Rumi, para el filtro de eco
 * @returns {{escuchar, vigilar, pausar, cerrar}}
 *
 * `escuchar()` turno del niño · `vigilar()` mientras Rumi habla ·
 * `pausar()` micrófono apagado · `cerrar()` al salir de la pantalla.
 * Ninguna termina la sesión por su cuenta: eso solo lo decide la pantalla.
 */
export function crearSesionEscucha(cb) {
  return modoSTT === 'local' ? sesionLocal(cb) : sesionWeb(cb);
}

/** Mensajes para el niño. Nunca decimos "error": decimos qué hacer. */
export const MENSAJES = {
  sin_permiso: 'Necesito permiso para escucharte. Pídele ayuda a un adulto.',
  fallo: 'No pude prender el micrófono. Puedes escribirme o tocar un botón.',
};
