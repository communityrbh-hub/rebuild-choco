/**
 * aiService — ÚNICO punto de entrada al modelo generativo
 * =======================================================
 *
 * ⚠️ REGLA NO NEGOCIABLE #2
 * Este archivo solo puede importarse desde `MathScreen.jsx`.
 * Verificable en un comando:
 *     grep -rl "services/aiService" src/screens src/components
 *
 * ⚠️ PRINCIPIO CENTRAL: EL MODELO NUNCA CALCULA
 * ---------------------------------------------
 * Un modelo de 1B no razona con números: predice texto. Puede escribir un
 * ejercicio impecable y dar el resultado equivocado con total seguridad.
 * En un tutor infantil eso significa enseñarle mal a un niño.
 *
 * Por eso la aritmética es 100% determinista:
 *
 *   1. CÓDIGO elige los números y calcula la respuesta   →  exacto siempre
 *   2. LLM solo lo viste de historia con contexto local  →  su única tarea
 *   3. CÓDIGO verifica lo que responde el niño           →  exacto siempre
 *   4. LLM explica el error, con la respuesta ya dada    →  no calcula nada
 *
 * Si el modelo falla, tarda o devuelve basura, hay redacción de respaldo.
 * La app nunca se queda muda ni muestra un resultado sin verificar.
 */

import * as ollama from './ollama';
import * as gemini from './gemini';
import { esLocal, infoBackend } from './runtime';
import pack from '../packs/choco-sismo-2026.json';

export { esLocal, infoBackend };

/** El backend se decide por hostname: local → Gemma, desplegado → Gemini. */
const backend = esLocal ? ollama : gemini;

/* ============================================================
   1. GENERACIÓN DETERMINISTA DEL PROBLEMA — sin IA
   ============================================================ */

const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const entre = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Crea el problema aritmético con código puro.
 * La respuesta se calcula aquí y es exacta por construcción.
 */
export function crearProblema(tema = 'suma', edad = 8) {
  const facil = edad <= 7;
  let a, b, operador, resultado;

  switch (tema) {
    case 'multiplicacion':
      a = entre(2, facil ? 5 : 9);
      b = entre(2, facil ? 5 : 9);
      operador = '×';
      resultado = a * b;
      break;
    case 'resta':
      a = entre(facil ? 5 : 10, facil ? 15 : 40);
      b = entre(1, a - 1); // nunca negativo
      operador = '−';
      resultado = a - b;
      break;
    default: // suma
      a = entre(1, facil ? 10 : 30);
      b = entre(1, facil ? 10 : 30);
      operador = '+';
      resultado = a + b;
  }

  return {
    a,
    b,
    operador,
    tema,
    resultado,
    expresion: `${a} ${operador} ${b}`,
    nombre: azar(pack.curriculo.matematicas.nombresLocales),
    contexto: azar(pack.curriculo.matematicas.contextosNarrativos),
  };
}

/* ============================================================
   2. EL LLM SOLO VISTE EL PROBLEMA DE HISTORIA
   ============================================================ */

function promptNarrativa(p, edad) {
  // Medido en Gemma 3 1B: un ejemplo resuelto sube el acierto de ~1/3 a ~2/3.
  // En modelos de mil millones de parámetros, mostrar vale más que instruir.
  const ej = EJEMPLOS[p.tema];
  return `Eres un tutor de primaria en Colombia. Escribes problemas de matemáticas para niños de ${edad} años.

EJEMPLO
Operación: ${ej.op}
Personaje: ${ej.nombre}
Contexto: ${ej.contexto}
Problema: ${ej.problema}

AHORA HAZLO TÚ
Operación: ${p.a} ${p.operador} ${p.b}
Personaje: ${p.nombre}
Contexto: ${p.contexto}
Problema:`;
}

const EJEMPLOS = {
  suma: {
    op: '4 + 2', nombre: 'Marisol', contexto: 'pelotas en la cancha',
    problema: 'Marisol tiene 4 pelotas y su amiga le regala 2 más. ¿Cuántas pelotas tiene ahora?',
  },
  resta: {
    op: '9 − 3', nombre: 'Danilo', contexto: 'plátanos en el río',
    problema: 'Danilo llevaba 9 plátanos y se le cayeron 3 al río. ¿Cuántos plátanos le quedaron?',
  },
  multiplicacion: {
    op: '4 × 2', nombre: 'Yurany', contexto: 'gallinas en el patio',
    problema: 'Yurany tiene 4 corrales y en cada corral hay 2 gallinas. ¿Cuántas gallinas hay en total?',
  },
};

/**
 * Limpia la salida del modelo.
 * Un 1B con frecuencia repite el formato del prompt antes de responder;
 * esto rescata la frase útil en vez de descartar toda la generación.
 */
function limpiarNarrativa(texto) {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // Descarta ecos del andamiaje del prompt.
    .filter((l) => !/^(problema|operaci[oó]n|tipo|personaje|contexto|ejemplo|ahora)\s*:?\s*$/i.test(l))
    .map((l) => l.replace(/^(problema|contexto)\s*:\s*/i, '').trim())
    .filter((l) => !/^(operaci[oó]n|tipo|personaje)\s*:/i.test(l));

  // Nos quedamos con la primera línea que parezca un problema de verdad.
  const conPregunta = lineas.find((l) => l.includes('?') && l.length > 25);
  return (conPregunta || lineas[0] || '').replace(/^["'¡\s]+|["'\s]+$/g, '').trim();
}

/** Redacción de respaldo, sin IA. Se usa si el modelo falla o alucina. */
export function narrativaRespaldo(p) {
  const { nombre, contexto, a, b, tema } = p;
  if (tema === 'multiplicacion')
    return `${nombre} tiene ${a} grupos de ${contexto} y en cada grupo hay ${b}. ¿Cuántos hay en total?`;
  if (tema === 'resta')
    return `${nombre} tenía ${a} de ${contexto} y regaló ${b}. ¿Cuántos le quedaron?`;
  return `${nombre} tiene ${a} de ${contexto} y le dan ${b} más. ¿Cuántos tiene ahora?`;
}

/**
 * Valida la narrativa del modelo antes de mostrársela a un niño.
 * Un output que no pasa se descarta y se usa el respaldo.
 */
function narrativaValida(texto, p) {
  if (!texto || texto.length < 15 || texto.length > 320) return false;
  if (!texto.includes(String(p.a)) || !texto.includes(String(p.b))) return false;
  // Si el modelo se adelantó y escribió la respuesta, no sirve como ejercicio.
  const regexResultado = new RegExp(`\\b${p.resultado}\\b`);
  if (regexResultado.test(texto)) return false;
  if (/\[|\]|respuesta\s*:/i.test(texto)) return false;
  return true;
}

/**
 * Devuelve un ejercicio listo para mostrar.
 * `resultado` SIEMPRE viene del cálculo determinista, nunca del modelo.
 */
export async function generarEjercicio(tema = 'suma', edad = 8) {
  const p = crearProblema(tema, edad);

  // Dos intentos: el primero falla ~1 de cada 3 veces en un modelo de 1B, y
  // reintentar cuesta ~3 s. Si ambos fallan, el respaldo ya está listo y el
  // niño nunca ve una pantalla vacía ni un enunciado roto.
  for (let intento = 0; intento < 2; intento++) {
    try {
      const bruto = await backend.generar(promptNarrativa(p, edad), {
        maxTokens: 80,
        temperatura: intento === 0 ? 0.7 : 0.55, // el reintento va más conservador
        señal: AbortSignal.timeout(18000),
      });
      const limpio = limpiarNarrativa(bruto);
      if (narrativaValida(limpio, p)) {
        return { ...p, enunciado: limpio, fuente: 'ia' };
      }
    } catch {
      break; // sin backend: no tiene sentido reintentar
    }
  }

  return { ...p, enunciado: narrativaRespaldo(p), fuente: 'respaldo' };
}

/* ============================================================
   3. VERIFICACIÓN — código, nunca IA
   ============================================================ */

export function verificar(problema, respuestaNino) {
  const n = parseInt(String(respuestaNino).trim(), 10);
  return Number.isFinite(n) && n === problema.resultado;
}

/* ============================================================
   4. EXPLICACIÓN DEL ERROR — el LLM ya recibe la respuesta correcta
   ============================================================ */

function promptExplicacion(p, respuestaNino) {
  return `Eres un tutor de primaria cálido y alentador, en Colombia.

Un niño resolvió "${p.expresion}" y respondió ${respuestaNino}.
La respuesta correcta es ${p.resultado}.

Escribe una explicación breve y amable:
- Máximo 3 oraciones, lenguaje muy simple.
- Empieza reconociendo su esfuerzo, nunca lo regañes.
- Explica el paso a paso usando la respuesta correcta ${p.resultado}, que ya te di.
- NO calcules nada por tu cuenta. Usa exactamente ${p.resultado}.
- Responde SOLO con la explicación.`;
}

export function explicacionRespaldo(p) {
  const { a, b, tema, resultado } = p;
  if (tema === 'multiplicacion')
    return `¡Casi! Multiplicar ${a} × ${b} es sumar ${a} veces el número ${b}. Si lo cuentas de a ${b}, llegas a ${resultado}.`;
  if (tema === 'resta')
    return `¡Buen intento! Si tienes ${a} y quitas ${b}, puedes contar hacia atrás desde ${a}. Vas a llegar a ${resultado}.`;
  return `¡Casi lo tienes! Empieza en ${a} y cuenta ${b} más, uno por uno. Llegas a ${resultado}.`;
}

export async function explicarError(p, respuestaNino) {
  try {
    const texto = await backend.generar(promptExplicacion(p, respuestaNino), {
      maxTokens: 110,
      temperatura: 0.6,
      señal: AbortSignal.timeout(20000),
    });
    const limpio = texto.trim();
    // Solo la aceptamos si menciona la respuesta correcta: garantiza que no inventó otra.
    if (limpio.length > 20 && limpio.length < 400 && limpio.includes(String(p.resultado))) {
      return { texto: limpio, fuente: 'ia' };
    }
  } catch {
    // cae al respaldo
  }
  return { texto: explicacionRespaldo(p), fuente: 'respaldo' };
}

/* ============================================================
   5. LECTURA — frase corta para leer en voz alta
   ============================================================ */

const FRASES_RESPALDO = [
  'El río suena bajito por la mañana.',
  'Mi mamá cocina plátano con queso.',
  'El perro corre por el patio.',
  'La lluvia moja las hojas grandes.',
  'Mi amigo canta una canción bonita.',
];

export async function generarFraseLectura(edad = 6) {
  const prompt = `Escribe UNA frase muy corta y simple en español para que un niño de ${edad} años la lea en voz alta.
- Máximo 8 palabras.
- Palabras comunes y fáciles.
- Contexto rural del Pacífico colombiano (río, casa, animales, comida, familia).
- Responde SOLO con la frase, sin comillas ni explicación.`;

  try {
    const texto = await backend.generar(prompt, {
      maxTokens: 40,
      temperatura: 0.9,
      señal: AbortSignal.timeout(15000),
    });
    const limpio = texto.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();
    if (limpio.length > 8 && limpio.length < 90 && limpio.split(/\s+/).length <= 12) {
      return { texto: limpio, fuente: 'ia' };
    }
  } catch {
    // cae al respaldo
  }
  return { texto: azar(FRASES_RESPALDO), fuente: 'respaldo' };
}

export async function backendDisponible() {
  return backend.disponible();
}
