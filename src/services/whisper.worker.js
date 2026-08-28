/**
 * Whisper en un worker — para que la interfaz no se congele
 * =========================================================
 *
 * La inferencia de Whisper ocupa el hilo donde corre todo lo demás. Con el
 * modelo en el hilo principal, transcribir una frase de dos segundos
 * congelaba la pantalla: Rumi se quedaba tieso, las ondas del micrófono
 * dejaban de moverse y —lo peor— el detector de voz se paraba también.
 *
 * Aquí el modelo vive aparte. El hilo principal solo manda audio y recibe
 * texto, así que sigue animando, escuchando y respondiendo mientras Whisper
 * piensa.
 *
 * POR QUÉ LA GPU, Y POR QUÉ ESO NO ROMPE LA PROMESA DE OFFLINE
 * ------------------------------------------------------------
 * En WASM, medido en esta máquina con los tres archivos de `public/pruebas`:
 * **4,8 segundos para transcribir 2 segundos de audio**, y casi lo mismo para
 * 8 segundos. No es cuestión del tamaño del audio: el codificador de Whisper
 * procesa siempre una ventana de 30 segundos rellenando con silencio, así que
 * hay un coste fijo por frase que en CPU no baja de ahí.
 *
 * Cinco segundos de espera después de cada frase no es un tutor lento: es un
 * tutor que no contesta. WebGPU corre el mismo modelo en la GPU integrada del
 * portátil: sigue siendo inferencia local, en el dispositivo, sin red —cambia
 * el procesador, no la promesa— y baja a unos 3 segundos.
 *
 * PRIMERO OÍR, LUEGO OÍR MEJOR
 * ----------------------------
 * La primera versión de esto cargaba directamente el modelo bueno: 196 MB
 * entre codificador y decodificador. En una conexión doméstica son varios
 * minutos, y durante esos minutos el niño le hablaba a un osito que no podía
 * contestarle. El síntoma reportado fue exacto: "me saluda, le hablo, sale un
 * porcentaje cargando y no recibo respuesta".
 *
 * Ahora la carga tiene dos etapas:
 *
 *   1. `tiny` cuantizado — 39 MB. En cuanto está, Rumi ya escucha. Entiende
 *      peor ("temblor" se le vuelve "templo"), pero entiende.
 *   2. `base` cuantizado — 73 MB más, descargándose por detrás mientras la
 *      conversación ya funciona. Cuando termina y demuestra que oye, releva
 *      al primero sin que nadie note el cambio.
 *
 * El niño empieza a hablar cuatro veces antes, y acaba con el modelo bueno.
 * Si la segunda etapa falla o la conexión se corta, se queda con la primera:
 * ninguna de las dos cosas deja a Rumi sordo.
 */

import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

/*
 * Repartir la inferencia entre núcleos, para el camino de respaldo en CPU.
 * Se dejan dos núcleos libres a propósito: el resto de la app —Gemma
 * respondiendo, la voz de Rumi, la animación— compite por la misma CPU.
 */
const nucleos = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
env.backends.onnx.wasm.numThreads = typeof SharedArrayBuffer === 'undefined' ? 1 : nucleos;

/*
 * El catálogo sale de medirlas todas en esta máquina, con los mismos tres
 * audios (`public/pruebas`, voz en español). Tiempo sobre frases de 2 a 4
 * segundos, y peso de descarga real:
 *
 *   webgpu/base  fp32+q4   3,2 s   entiende bien          196 MB
 *   webgpu/base  q4+q4     5,6 s   entiende bien          136 MB  (la
 *                                    cuantización del codificador no la
 *                                    acelera en esta GPU: la frena)
 *   webgpu/base  fp16+q4   2,4 s   ROTA: devuelve "que"   157 MB
 *   webgpu/tiny  fp32+q4   2,2 s   "temblor" → "templo"   113 MB
 *   wasm/tiny    q8        4,8 s   "temblor" → "templo"    39 MB
 *
 * De ahí las decisiones que no son obvias: el codificador nunca va en media
 * precisión —es más rápida sobre el papel y aquí sencillamente no funciona—,
 * y se prefiere `base` a `tiny` aunque cueste un segundo más, porque
 * "temblor" es una palabra que este producto no puede entender mal.
 *
 * El peso pesa tanto como la velocidad: por eso las que se usan por defecto
 * son las cuantizadas del decodificador, que valen la mitad de megas.
 */

/** Etapa 1: lo mínimo para que Rumi oiga cuanto antes. */
const PRIMERA = {
  nombre: 'webgpu/tiny-q8',
  modelo: 'onnx-community/whisper-tiny',
  opciones: { device: 'webgpu', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
  megas: 39,
};

/** Etapa 2: la que de verdad entiende español, cuando haya terminado de bajar. */
const MEJOR = {
  nombre: 'webgpu/base-q8',
  modelo: 'onnx-community/whisper-base',
  opciones: { device: 'webgpu', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
  megas: 73,
};

/** Respaldos, en orden, si la GPU no está o alguna no supera la prueba. */
const RESPALDOS = [
  {
    nombre: 'webgpu/base',
    modelo: 'onnx-community/whisper-base',
    opciones: { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } },
    megas: 196,
  },
  {
    nombre: 'wasm/tiny',
    modelo: 'onnx-community/whisper-tiny',
    opciones: { device: 'wasm', dtype: 'q8' },
    megas: 39,
  },
];

const CATALOGO = [PRIMERA, MEJOR, ...RESPALDOS];

let transcriptor = null;
let usada = null;
let audioDeReferencia = null; // "el gato duerme en la casa", lo manda stt.js
let enVuelo = 0;              // transcripciones usando el modelo actual

function hayWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function utilizable(cfg) {
  return cfg.opciones.device !== 'webgpu' || hayWebGPU();
}

/* ============================================================
   Progreso — un solo número, no uno por archivo
   ============================================================ */

/*
 * `progress_callback` avisa por archivo, y son varios. Reportando cada uno
 * por separado, la barra subía al 90 %, volvía a 0, subía otra vez... que es
 * justo lo que hace pensar que algo está atascado. Se suman los bytes de
 * todos los archivos y se reporta el total.
 */
let bytes = new Map();

function reiniciarProgreso() {
  bytes = new Map();
}

function avisarProgresoDe(p, activo) {
  if (!activo || p.status !== 'progress' || !p.total) return;
  bytes.set(p.file, { cargado: p.loaded, total: p.total });

  let cargado = 0;
  let total = 0;
  for (const b of bytes.values()) { cargado += b.cargado; total += b.total; }
  if (!total) return;

  self.postMessage({ tipo: 'progreso', valor: Math.min(99, Math.round((cargado / total) * 100)) });
}

/* ============================================================
   Que arranque no significa que funcione
   ============================================================ */

/*
 * LA TRAMPA MÁS CARA DE TODA ESTA PARTE.
 *
 * Con el codificador en fp16 sobre la GPU integrada Intel, el modelo carga
 * sin un solo error y transcribe **la palabra "que"** para cualquier audio
 * que se le dé. Los números se desbordan en media precisión, la salida
 * degenera, y desde fuera se ve exactamente igual que un micrófono que no
 * capta: el niño habla y no pasa nada.
 *
 * Por eso cada configuración tiene que demostrar que oye, con un audio
 * conocido, antes de que se le confíe la voz de un niño.
 */
const PALABRAS_REFERENCIA = ['gato', 'duerme', 'casa'];

async function suenaBien(modelo, nombre) {
  if (!audioDeReferencia) return true; // sin referencia no se puede juzgar

  const salida = await modelo(audioDeReferencia, AJUSTES);
  const texto = (salida?.text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const aciertos = PALABRAS_REFERENCIA.filter((p) => texto.includes(p)).length;
  self.postMessage({ tipo: 'aviso', mensaje: `prueba de oído (${nombre}): "${texto.trim()}" (${aciertos}/3)` });
  return aciertos >= 2;
}

/** Construye y valida una configuración. Devuelve null si no sirve. */
async function construir(cfg, conProgreso) {
  reiniciarProgreso();
  const candidato = await pipeline('automatic-speech-recognition', cfg.modelo, {
    ...cfg.opciones,
    progress_callback: (p) => avisarProgresoDe(p, conProgreso),
  });

  if (await suenaBien(candidato, cfg.nombre)) return candidato;

  self.postMessage({ tipo: 'aviso', mensaje: `${cfg.nombre} carga pero no entiende: se descarta` });
  try { await candidato.dispose(); } catch { /* da igual, se abandona */ }
  return null;
}

/* ============================================================
   Carga
   ============================================================ */

/*
 * UNA CARGA, NO UNA POR MENSAJE.
 *
 * `cargar()` tarda decenas de segundos. Comprobar solo si ya hay transcriptor
 * no basta: mientras la primera carga está en vuelo la variable sigue vacía,
 * así que un segundo mensaje —React monta los efectos dos veces en
 * desarrollo, ahí está garantizado— arrancaba OTRO modelo entero. Dos Whisper
 * compitiendo por la misma GPU no fallan: van despacio. Medido, la misma
 * frase pasó de 3 a 18 segundos.
 */
let cargaEnCurso = null;
let preferida = null;   // forzada con `?oido=<nombre>`

function cargar(conProgreso = false) {
  if (transcriptor) return Promise.resolve(transcriptor);
  if (!cargaEnCurso) {
    cargaEnCurso = primeraEtapa(conProgreso).catch((e) => {
      cargaEnCurso = null; // que un fallo no deje el oído bloqueado para siempre
      throw e;
    });
  }
  return cargaEnCurso;
}

/** Lo antes posible: la primera configuración que cargue y demuestre que oye. */
async function primeraEtapa(conProgreso) {
  const orden = preferida
    ? [preferida, ...CATALOGO.filter((c) => c !== preferida)]
    : CATALOGO;

  let ultimoError = null;
  for (const cfg of orden.filter(utilizable)) {
    try {
      const modelo = await construir(cfg, conProgreso);
      if (!modelo) continue;
      transcriptor = modelo;
      usada = cfg.nombre;
      return transcriptor;
    } catch (e) {
      ultimoError = e;
      self.postMessage({ tipo: 'aviso', mensaje: `${cfg.nombre} no arrancó: ${String(e?.message || e)}` });
    }
  }
  throw ultimoError || new Error('ninguna configuración de Whisper entendió el audio de prueba');
}

/**
 * Segunda etapa, en segundo plano: cambiar a un modelo que entienda mejor.
 *
 * No corre hasta que el primero ya está funcionando, y si algo sale mal se
 * queda todo como estaba. Una mejora nunca puede dejar peor de lo que había.
 */
async function segundaEtapa() {
  if (!transcriptor || usada === MEJOR.nombre || preferida || !utilizable(MEJOR)) return;

  try {
    // Sin avisar del progreso: la conversación ya funciona y una barra
    // moviéndose por detrás solo confunde.
    const modelo = await construir(MEJOR, false);
    if (!modelo) return;

    const viejo = transcriptor;
    transcriptor = modelo;
    usada = MEJOR.nombre;
    self.postMessage({ tipo: 'mejorado', configuracion: usada });

    // El anterior puede estar transcribiendo justo ahora: se libera cuando
    // ya no lo use nadie. Liberar un modelo a media inferencia se lleva por
    // delante la frase que el niño acaba de decir.
    const soltar = () => {
      if (enVuelo > 0) { setTimeout(soltar, 500); return; }
      try { viejo.dispose(); } catch { /* ya liberado */ }
    };
    soltar();
  } catch (e) {
    self.postMessage({ tipo: 'aviso', mensaje: `mejora a ${MEJOR.nombre} fallida: ${String(e?.message || e)}` });
  }
}

/** Los mismos parámetros para todas las transcripciones. */
const AJUSTES = {
  language: 'spanish',
  task: 'transcribe',
  /*
   * El techo de tokens es lo que más pesa en el tiempo de respuesta. Whisper
   * decodifica token a token y, ante ruido o silencio, se pone a alucinar
   * hasta agotar su límite por defecto (448): eso convertía tres segundos de
   * audio en ocho de espera. Un niño de seis años dice frases de diez
   * palabras; con este techo no se pierde nada suyo y se corta en seco la
   * alucinación, que es de donde salía el retardo.
   */
  max_new_tokens: 40,
  no_repeat_ngram_size: 4, // corta los bucles de "y y y y"
};

self.onmessage = async (evento) => {
  const { tipo, id, audio, referencia, preferencia } = evento.data;

  try {
    if (tipo === 'precargar') {
      if (referencia) audioDeReferencia = referencia;
      // `?oido=<nombre>` fuerza una configuración concreta: es como se
      // midieron todas sin tener que tocar el código entre pruebas.
      if (preferencia) preferida = CATALOGO.find((c) => c.nombre === preferencia) || null;

      const modelo = await cargar(true);

      // Un pase en vacío para calentar. Medido: la primera transcripción
      // costaba 12 s y las siguientes 5,5 s — el motor tiene que compilar sus
      // núcleos y reservar buffers la primera vez. Si esa penalización la
      // paga el primer turno del niño, la conversación arranca rota justo
      // cuando se está formando la impresión de si Rumi escucha o no.
      const t0 = performance.now();
      try {
        await modelo(new Float32Array(16000), { ...AJUSTES, max_new_tokens: 1 });
      } catch { /* calentar es opcional */ }

      self.postMessage({
        tipo: 'listo',
        configuracion: usada,
        msCalentamiento: Math.round(performance.now() - t0),
        webgpu: hayWebGPU(),
        nucleosDelEquipo: navigator.hardwareConcurrency,
      });

      segundaEtapa(); // a partir de aquí, mejorar sin bloquear a nadie
      return;
    }

    if (tipo === 'transcribir') {
      const modelo = await cargar();
      enVuelo++;
      const t0 = performance.now();
      try {
        const salida = await modelo(audio, AJUSTES);
        self.postMessage({
          tipo: 'texto',
          id,
          texto: (salida?.text || '').trim(),
          ms: Math.round(performance.now() - t0),
          configuracion: usada,
        });
      } finally {
        enVuelo--;
      }
    }
  } catch (e) {
    self.postMessage({ tipo: 'error', id, mensaje: String(e?.message || e) });
  }
};
