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
 *
 * POR QUÉ ESTO ES UN LOCUTOR EN COLA Y NO UNA FUNCIÓN `hablar(texto)`
 * -------------------------------------------------------------------
 * La versión anterior esperaba la respuesta COMPLETA del modelo y recién
 * entonces empezaba a sonar. Con Gemma en CPU eso son 2 o 3 segundos de
 * silencio absoluto después de que el niño terminó de hablar, cada turno.
 * Un silencio de tres segundos en una conversación humana es un problema;
 * para un niño de seis años es "no me está haciendo caso".
 *
 * El locutor recibe el texto POR PEDAZOS mientras el modelo lo escribe, y
 * habla en cuanto tiene la primera frase terminada. El resto se va encolando
 * detrás. El tiempo hasta el primer sonido deja de depender de lo larga que
 * sea la respuesta.
 *
 * Y sobre todo: `cortar()` calla en el acto. Sin eso no hay interrupción, y
 * sin interrupción no hay conversación — solo turnos de walkie-talkie.
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

/* ============================================================
   Preparar el texto para el oído, no para el ojo
   ============================================================ */

/**
 * Lo que se ve bien escrito no siempre suena bien.
 *
 * Un emoji lo lee el sintetizador en voz alta ("cara sonriente"), los
 * asteriscos de énfasis los pronuncia, y una respuesta con guiones de lista
 * suena como un formulario. Nada de eso puede llegar al altavoz.
 */
/*
 * El selector de variación (U+FE0F) y el unidor de ancho cero (U+200D) son la
 * pegatina de los emojis: sin ellos quedan restos que el sintetizador
 * pronuncia. Se construyen por código y no se escriben literales, porque en
 * el fuente serían invisibles —la peor forma posible de dejar una regla.
 */
const INVISIBLES = new RegExp(`[${String.fromCharCode(0xFE0F, 0x200D)}]`, 'g');

export function limpiarParaHabla(texto) {
  return (texto || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(INVISIBLES, '')
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * Un final de frase es un punto seguido de espacio, no cualquier punto: los
 * números decimales y las abreviaturas también llevan punto. Se corta también
 * en los dos puntos y el punto y coma porque el sintetizador ya hace una
 * pausa natural ahí, así que partir no se nota y adelanta el primer sonido.
 */
const FIN_DE_FRASE = /([.!?…]+["'»)]?\s|[:;]\s|\n)/;

/** Longitud a partir de la cual conviene hablar aunque no haya cerrado la frase. */
const CORTE_LARGO = 140;

/**
 * Parte un texto en frases hablables.
 * Fragmentos muy cortos ("Sí.") se pegan al siguiente: una frase de dos
 * sílabas suena entrecortada si va sola en su propio utterance.
 */
export function partirFrases(texto) {
  const limpio = limpiarParaHabla(texto);
  if (!limpio) return [];

  const partes = limpio.split(FIN_DE_FRASE).filter(Boolean);
  const frases = [];
  let acumulado = '';

  for (const parte of partes) {
    acumulado += parte;
    if (FIN_DE_FRASE.test(parte) || parte.length > CORTE_LARGO) {
      const f = acumulado.trim();
      if (f.length >= 12 || frases.length === 0) {
        frases.push(f);
        acumulado = '';
      }
    }
  }
  const resto = acumulado.trim();
  if (resto) frases.push(resto);

  return frases.filter((f) => /\p{L}/u.test(f));
}

/* ============================================================
   El locutor
   ============================================================ */

/*
 * Chrome se duerme.
 *
 * Un bug viejo y todavía vivo: si `speechSynthesis` lleva más de ~15 segundos
 * hablando sin interrupción, el motor se queda en pausa y el `onend` no
 * llega nunca. Hablar frase a frase ya lo hace casi imposible, pero el
 * `resume()` periódico cierra el resto del hueco. Sobre un motor que no está
 * pausado, `resume()` no hace nada.
 */
let latido = null;

function arrancarLatido() {
  if (latido) return;
  latido = setInterval(() => {
    const s = window.speechSynthesis;
    if (!s) return;
    if (s.speaking && s.paused) s.resume();
  }, 6000);
}

function pararLatido() {
  clearInterval(latido);
  latido = null;
}

/**
 * Crea un locutor: una boca con cola, que se puede callar a media palabra.
 *
 * @param {object} cb
 *   onInicio()        — empezó a sonar la primera frase
 *   onFrase(texto)    — empieza a sonar esta frase (para el subtítulo)
 *   onFin()           — se acabó la cola Y ya no va a llegar más texto
 *   onCorte()         — alguien lo mandó callar
 * @returns {{decir, cerrar, cortar, hablando, loQueVaDiciendo}}
 */
export function crearLocutor({ onInicio, onFrase, onFin, onCorte } = {}) {
  const cola = [];
  let pendiente = '';       // texto recibido que aún no cierra una frase
  let cerrado = false;      // ya no va a llegar más texto
  let sonando = false;
  let arrancado = false;
  let dicho = '';           // todo lo que se ha mandado a hablar en este turno
  let guardia = null;
  let generacion = 0;       // invalida callbacks de utterances ya cortados
  let terminado = false;    // onFin se avisa UNA vez y solo una

  /*
   * El fin del turno se avisa una sola vez pase lo que pase. La pantalla
   * reacciona cediéndole el turno al niño, y avisar dos veces significaba
   * reabrirle el micrófono dos veces en el mismo turno.
   */
  function avisarFin() {
    if (terminado) return;
    terminado = true;
    pararLatido();
    onFin?.();
  }

  function siguiente() {
    const mia = generacion;
    const frase = cola.shift();

    if (frase === undefined) {
      sonando = false;
      if (cerrado) avisarFin();
      return;
    }

    sonando = true;
    if (!arrancado) {
      arrancado = true;
      onInicio?.();
    }
    onFrase?.(frase);

    const u = new SpeechSynthesisUtterance(frase);
    if (vozElegida) u.voice = vozElegida;
    u.lang = vozElegida?.lang || 'es-CO';

    /*
     * Prosodia mínima, pero prosodia.
     *
     * 0.85 fijo sonaba a lectura de manual. Se sube a 0.92 —sigue siendo más
     * lento que el habla adulta normal, que es lo que necesita un niño de
     * cinco años— y se le mete una variación pequeña por frase. Las preguntas
     * suben un poco el tono. No convierte a SAPI en una voz neural, pero
     * quita el efecto metrónomo, que es la mitad de lo que suena a robot.
     */
    const pregunta = /[?¿]\s*$/.test(frase);
    u.rate = 0.92 + (Math.random() - 0.5) * 0.05;
    u.pitch = 1.12 + (pregunta ? 0.07 : 0) + (Math.random() - 0.5) * 0.04;

    const avanzar = () => {
      if (mia !== generacion) return; // este utterance ya fue cancelado
      clearTimeout(guardia);
      siguiente();
    };

    u.onend = avanzar;
    u.onerror = avanzar;

    /*
     * Red de seguridad: si la pestaña pierde el foco a mitad de frase, Chrome
     * puede no disparar nunca `onend`. Sin esto, la conversación se queda
     * colgada esperando un evento que ya no va a llegar. El margen es
     * generoso a propósito: cortar una frase por impaciencia se oye peor que
     * esperar de más.
     */
    clearTimeout(guardia);
    guardia = setTimeout(avanzar, 1800 + frase.length * 100);

    arrancarLatido();
    window.speechSynthesis.speak(u);
  }

  function bombear() {
    if (!sonando) siguiente();
  }

  return {
    /** Recibe texto (completo o a pedazos) y habla lo que ya esté cerrado. */
    decir(fragmento) {
      if (cerrado || !fragmento) return;
      pendiente += fragmento;

      const frases = partirFrases(pendiente);
      if (!frases.length) return;

      /*
       * La última frase puede estar a medio escribir todavía, así que se
       * queda esperando salvo que ya venga cerrada o se haya hecho larga: a
       * partir de cierto punto es mejor empezar a sonar que seguir esperando
       * al modelo.
       */
      const ultima = frases[frases.length - 1];
      const completa = /[.!?…:;]["'»)]?\s*$/.test(ultima) || ultima.length > CORTE_LARGO;
      const listas = completa ? frases : frases.slice(0, -1);

      if (!listas.length) return;

      pendiente = completa ? '' : ultima;
      for (const f of listas) {
        cola.push(f);
        dicho += `${f} `;
      }
      bombear();
    },

    /** No va a llegar más texto: habla lo que quede y avisa al terminar. */
    cerrar() {
      if (cerrado) return;
      const resto = pendiente.trim();
      pendiente = '';
      if (resto) {
        cola.push(resto);
        dicho += `${resto} `;
      }
      cerrado = true;
      bombear();
      // Si no había absolutamente nada que decir, `bombear` no llega a
      // disparar `siguiente` y el turno se quedaría colgado.
      if (!sonando && !cola.length) avisarFin();
    },

    /** Calla ya. Es lo que hace posible interrumpir a Rumi. */
    cortar() {
      generacion++;
      clearTimeout(guardia);
      cola.length = 0;
      pendiente = '';
      cerrado = true;
      sonando = false;
      pararLatido();
      try { window.speechSynthesis.cancel(); } catch { /* nada que cancelar */ }
      onCorte?.();
    },

    hablando: () => sonando,

    /**
     * Todo lo que Rumi lleva dicho en este turno.
     *
     * Lo usa el filtro de eco del oído: si el micrófono capta al altavoz, lo
     * que llega transcrito es justo esto, y hay que descartarlo en vez de
     * tratarlo como si el niño lo hubiera dicho.
     */
    loQueVaDiciendo: () => dicho,
  };
}

/* ============================================================
   Compatibilidad — hablar una frase suelta
   ============================================================ */

let sueltoActual = null;

/**
 * Hace hablar a Rumi una vez, sin cola ni streaming.
 * Para pantallas que solo dicen una frase fija (la activación, el tutor).
 */
export function hablar(texto, { onStart, onEnd } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
    return null;
  }

  callar();
  asegurarVoces();

  sueltoActual = crearLocutor({
    onInicio: () => onStart?.(),
    onFin: () => onEnd?.(),
  });
  sueltoActual.decir(texto);
  sueltoActual.cerrar();
  return sueltoActual;
}

export function callar() {
  sueltoActual?.cortar();
  sueltoActual = null;
  pararLatido();
  try { window.speechSynthesis?.cancel(); } catch { /* nada que cancelar */ }
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
