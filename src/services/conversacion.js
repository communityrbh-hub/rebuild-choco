/**
 * Conversación abierta con Rumi
 * =============================
 *
 * El niño habla de lo que quiera y Rumi improvisa: su perro, su casa, por qué
 * llueve, cómo se siente. Esto es lo que hace que se sienta una conversación
 * y no un menú de opciones.
 *
 * TRES CAPAS, EN ESTE ORDEN:
 *
 *   1. SEGURIDAD DE ENTRADA (determinista, sin IA)
 *      Señales de autolesión, violencia o abuso → derivación humana directa.
 *      El modelo ni siquiera ve el mensaje. Es la única parte que no puede
 *      saltarse.
 *
 *   2. EL MODELO IMPROVISA
 *      Gemma 3 local (offline) o Gemini (vitrina), con un rol muy acotado y
 *      la conversación reciente como contexto.
 *
 *   3. SEGURIDAD DE SALIDA (determinista, sin IA)
 *      Se revisa lo que el modelo quiere decir ANTES de que el niño lo oiga.
 *      Si no pasa, Rumi dice algo seguro y sigue la conversación.
 *
 * Un modelo de 1B se desvía. Las capas 1 y 3 son las que hacen que eso no
 * llegue nunca a un niño.
 */

import * as ollama from './ollama.js';
import * as gemini from './gemini.js';
import { esLocal } from './runtime.js';
import { partirFrases } from './tts.js';
import { revisarEntrada, revisarSalida } from '../agent/seguridad.js';
import pack from '../packs/choco-sismo-2026.json' with { type: 'json' };

const backend = esLocal ? ollama : gemini;

const { municipio, departamento } = pack.territorio;

/**
 * El rol de Rumi. Escrito para un modelo pequeño: instrucciones cortas,
 * concretas y en imperativo. Las listas largas de reglas las ignora.
 */
function sistema() {
  return `Eres Rumi, un osito amable que acompaña a niños de 5 a 10 años en ${municipio}, ${departamento}, Colombia.
Hace poco hubo un temblor fuerte en su pueblo.

CÓMO HABLAS:
- Te van a ESCUCHAR, no leer: escribe como se habla.
- Frases muy cortas. Máximo 2 oraciones.
- Palabras simples, como para un niño de 7 años.
- Cálido y tranquilo. Nunca asustas.
- Siempre en español.
- Nada de emojis, listas, guiones ni asteriscos.
- Terminas con una pregunta corta para que el niño siga hablando.

SI EL NIÑO HABLA DE MIEDO O TRISTEZA:
- Le dices que es normal sentirse así y que no está solo.
- Le recuerdas que el temblor ya pasó y que hay adultos cuidándolo.
- Le ofreces respirar juntos o un cuento.
- NUNCA dices que puede volver a pasar. NUNCA hablas de heridos ni de muerte.

NUNCA: das consejos médicos, hablas de violencia, prometes cosas, ni dices que eres una inteligencia artificial.`;
}

/** Respuestas seguras cuando el modelo falla o su salida no pasa el filtro. */
const RESPALDOS = [
  'Qué interesante. Cuéntame un poquito más.',
  'Me gusta hablar contigo. ¿Qué más me quieres contar?',
  'Ay, qué bueno. ¿Y eso cómo fue?',
  'Te estoy escuchando. Sigue contándome.',
];

const azar = (a) => a[Math.floor(Math.random() * a.length)];

/** Arma el prompt con los últimos turnos, para que la charla tenga hilo. */
function construirPrompt(mensaje, historial) {
  const recientes = historial.slice(-6);
  const contexto = recientes
    .map((m) => (m.de === 'nino' ? `Niño: ${m.texto}` : `Rumi: ${m.texto}`))
    .join('\n');

  return `${sistema()}

${contexto ? `CONVERSACIÓN HASTA AHORA:\n${contexto}\n` : ''}
Niño: ${mensaje}
Rumi:`;
}

/** Limpia el eco del andamiaje que los modelos pequeños suelen repetir. */
function limpiar(texto) {
  let t = (texto || '').trim();
  t = t.replace(/^rumi\s*:\s*/i, '');
  t = t.split(/\n\s*(niño|nino|rumi)\s*:/i)[0]; // corta si empezó a inventar turnos
  t = t.split(/\n\n/)[0];
  return t.replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

/**
 * Responde al niño.
 *
 * @param {string} mensaje   lo que dijo el niño
 * @param {Array}  historial turnos previos [{de:'nino'|'rumi', texto}]
 * @returns {Promise<{texto:string, fuente:string, derivar?:boolean, sugerencias?:Array}>}
 */
export async function conversar(mensaje, historial = []) {
  /* --- CAPA 1: seguridad de entrada. El modelo no ve esto. --- */
  const entrada = revisarEntrada(mensaje);

  if (entrada.nivel === 'crisis') {
    return {
      texto: entrada.respuesta,
      fuente: 'seguridad',
      derivar: true,
      sugerencias: [
        { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion' },
      ],
    };
  }

  /* --- CAPA 2: el modelo improvisa --- */
  let texto = null;
  for (let intento = 0; intento < 2 && !texto; intento++) {
    try {
      const bruto = await backend.generar(construirPrompt(mensaje, historial), {
        // Medido: Gemma se detiene sola tras dos frases, muy por debajo de este
        // techo, así que bajarlo no acelera nada y sí arriesga cortar una
        // respuesta a la mitad. El cuello de botella del turno está en el
        // oído (~5 s), no aquí (~1,5 s).
        maxTokens: 80,
        temperatura: intento === 0 ? 0.75 : 0.55,
        señal: AbortSignal.timeout(20000),
      });

      /* --- CAPA 3: seguridad de salida. Antes de que el niño lo oiga. --- */
      const limpio = limpiar(bruto);
      if (revisarSalida(limpio).ok) texto = limpio;
    } catch {
      break; // sin backend disponible: al respaldo
    }
  }

  const sugerencias = [];
  if (entrada.nivel === 'angustia') {
    sugerencias.push(
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion' },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento' },
    );
  }

  return {
    texto: texto || azar(RESPALDOS),
    fuente: texto ? 'ia' : 'respaldo',
    derivar: entrada.nivel === 'angustia',
    sugerencias,
  };
}

/* ============================================================
   Versión en streaming — la que usa el modo conversación
   ============================================================ */

/*
 * Andamiaje: los modelos pequeños tienden a seguir escribiendo el diálogo por
 * su cuenta ("Niño: ...", "Rumi: ..."). En la versión sin streaming eso se
 * recortaba al final; aquí hay que detectarlo EN VIVO, porque si no la frase
 * inventada ya salió por el altavoz y no se puede retirar.
 */
const ANDAMIAJE = /\n\s*(niño|nino|rumi|child|user|assistant)\s*:/i;

/**
 * Responde al niño entregando la respuesta FRASE A FRASE, según se escribe.
 *
 * Esta es la diferencia entre "el osito contesta" y "el osito conversa": el
 * turno del niño termina y Rumi empieza a sonar unos cientos de milisegundos
 * después, no cuando el modelo terminó de escribir el párrafo entero.
 *
 * LA CAPA 3 SIGUE INTACTA, Y ESO CONDICIONA EL DISEÑO.
 * Cada frase pasa por `revisarSalida` ANTES de emitirse. Una frase que no
 * pasa no solo se descarta: se corta la generación entera ahí mismo, porque
 * un modelo que se desvió a la mitad no suele volver solo. Revisar frase a
 * frase es más estricto que revisar el párrafo completo, no menos: el mismo
 * filtro se aplica más veces y sobre unidades más pequeñas.
 *
 * @param {string}   mensaje    lo que dijo el niño
 * @param {Array}    historial  turnos previos [{de:'nino'|'rumi', texto}]
 * @param {object}   opciones   onFrase(texto) por cada frase aprobada
 * @returns {Promise<{texto:string, fuente:string, derivar?:boolean, sugerencias?:Array}>}
 */
export async function conversarStream(mensaje, historial = [], { onFrase, señal } = {}) {
  /* --- CAPA 1: seguridad de entrada. El modelo no ve esto. --- */
  const entrada = revisarEntrada(mensaje);

  if (entrada.nivel === 'crisis') {
    onFrase?.(entrada.respuesta);
    return {
      texto: entrada.respuesta,
      fuente: 'seguridad',
      derivar: true,
      sugerencias: [
        { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion' },
      ],
    };
  }

  const sugerencias = [];
  if (entrada.nivel === 'angustia') {
    sugerencias.push(
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion' },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento' },
    );
  }

  let buffer = '';     // texto recibido que todavía no cierra una frase
  let emitido = '';    // lo que ya salió por el altavoz
  let censurado = false;

  /** Devuelve false cuando hay que cortar la generación. */
  function digerir(pedazo, forzar = false) {
    buffer += pedazo;

    // Se puso a inventar turnos: lo que venga después ya no es su respuesta.
    const corte = buffer.search(ANDAMIAJE);
    if (corte >= 0) {
      buffer = buffer.slice(0, corte);
      forzar = true;
    }

    // Los modelos pequeños repiten la etiqueta del prompt en la primera línea.
    if (!emitido) buffer = buffer.replace(/^\s*rumi\s*:\s*/i, '');

    const frases = partirFrases(buffer);
    if (!frases.length) return !forzar;

    const ultima = frases[frases.length - 1];
    const cerrada = /[.!?…]["'»)]?\s*$/.test(ultima);
    const listas = forzar || cerrada ? frases : frases.slice(0, -1);
    if (!listas.length) return true;

    buffer = forzar || cerrada ? '' : ultima;

    for (const frase of listas) {
      /* --- CAPA 3: seguridad de salida, frase por frase --- */
      if (!revisarSalida(frase).ok) {
        censurado = true;
        return false;
      }
      emitido += `${emitido ? ' ' : ''}${frase}`;
      onFrase?.(frase);

      // Dos oraciones es el límite del rol. Si el modelo sigue, se le corta:
      // un monólogo largo le quita el turno al niño.
      if (partirFrases(emitido).length >= 3) return false;
    }
    return !forzar;
  }

  try {
    await backend.generarStream(construirPrompt(mensaje, historial), {
      maxTokens: 80,
      temperatura: 0.75,
      señal: señal || AbortSignal.timeout(20000),
      onTexto: (p) => digerir(p),
    });
    // Lo que quedara en el buffer sin punto final. No se hace si ya se cortó
    // por censura o por longitud: en ese caso el buffer contiene justo lo que
    // se decidió no decir.
    if (!censurado && partirFrases(emitido).length < 3) digerir('', true);
  } catch {
    /* sin backend, cortado por el niño o tiempo agotado: se resuelve abajo */
  }

  if (!emitido) {
    // Nada utilizable: Rumi no se queda mudo nunca.
    const respaldo = azar(RESPALDOS);
    onFrase?.(respaldo);
    return { texto: respaldo, fuente: 'respaldo', derivar: entrada.nivel === 'angustia', sugerencias };
  }

  if (censurado) {
    // Ya sonó algo bueno y luego se desvió. Se cierra con algo seguro para
    // que el turno no termine a media frase.
    const cierre = 'Mejor cuéntame otra cosa. ¿Qué estás haciendo hoy?';
    onFrase?.(cierre);
    emitido += ` ${cierre}`;
  }

  return {
    texto: emitido,
    fuente: censurado ? 'respaldo' : 'ia',
    derivar: entrada.nivel === 'angustia',
    sugerencias,
  };
}

export async function backendListo() {
  return backend.disponible();
}

/**
 * Deja el modelo caliente en memoria antes de que el niño hable.
 *
 * Ollama descarga el modelo de RAM tras un rato de inactividad, y volver a
 * cargar Gemma cuesta varios segundos. Pagarlos en la primera frase del niño
 * es justo donde peor sientan. Esto se dispara al abrir el chat y su
 * resultado se descarta: solo importa el efecto secundario.
 */
export async function calentarModelo() {
  try {
    await backend.generar('Hola', { maxTokens: 1, temperatura: 0, señal: AbortSignal.timeout(30000) });
  } catch { /* si no hay backend, ya se verá en el primer turno */ }
}
