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
- Frases muy cortas. Máximo 2 oraciones.
- Palabras simples, como para un niño de 7 años.
- Cálido y tranquilo. Nunca asustas.
- Siempre en español.
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

export async function backendListo() {
  return backend.disponible();
}
