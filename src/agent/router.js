/**
 * Enrutador por tema — decide QUIÉN responde
 * ==========================================
 *
 * Esta decisión no la toma un modelo. La toma código, y es la pieza central
 * de la arquitectura de seguridad.
 *
 *   🛡️ CRISIS    → respuesta fija + derivación humana. El modelo ni lo ve.
 *   📖 GUION      → temas emocionales y del sismo. Texto escrito por personas.
 *   🧠 LIBRE      → todo lo demás. Gemma improvisa.
 *
 * POR QUÉ ESTÁ SEPARADO ASÍ — y esto lo medimos, no lo supusimos:
 * probamos Gemma 3 1B con mensajes reales de niño. En temas cotidianos
 * respondía bien ("tengo un perro" → "¡Qué chévere! ¿Y cómo se llama?").
 * En temas emocionales producía frases incoherentes y potencialmente
 * dañinas — "unos cuantos temblores pueden hacer que la gente se sienta más
 * segura" — que ningún filtro de palabras puede atrapar, porque el daño no
 * está en las palabras sino en el sinsentido.
 *
 * Un modelo de mil millones de parámetros sabe charlar de un perro.
 * No sabe contener a un niño que acaba de vivir un sismo.
 *
 * Sesgo deliberado: ante la duda, guion. Una respuesta pre-escrita de más
 * cuesta poco; una improvisación dañina cuesta demasiado.
 */

import { revisarEntrada, normalizar } from './seguridad.js';

/**
 * Temas que SIEMPRE responde el guion escrito.
 * El orden importa: gana la primera coincidencia.
 */
const TEMAS_GUION = [
  // ⚠️ EL ORDEN ES LA LÓGICA. Gana la primera coincidencia, así que los temas
  // con señales específicas ("mi mamá", "mi casa", "mi escuela") van antes que
  // los emocionales genéricos. Sin esto, "mi mamá está llorando" caería en
  // tristeza en vez de familia, y el niño recibiría contención del tema
  // equivocado.
  {
    nodo: 'tema_sismo',
    claves: [
      'temblor', 'tembló', 'temblo', 'temblar', 'sismo', 'terremoto', 'se movio',
      'se movió', 'la tierra', 'replica', 'réplica', 'volver a temblar',
    ],
  },
  {
    nodo: 'tema_casa',
    claves: [
      'mi casa', 'se cayo', 'se cayó', 'se rompio', 'se rompió', 'derrumbo',
      'derrumbó', 'la pared', 'el techo', 'albergue', 'carpa', 'nos fuimos',
      'perdimos', 'ya no tenemos',
    ],
  },
  {
    nodo: 'tema_escuela',
    claves: [
      'mi escuela', 'la escuela', 'el colegio', 'mi colegio', 'mi profesora',
      'mi profesor', 'mis companeros', 'mis compañeros', 'extrano', 'extraño',
      'no hay clases', 'no puedo estudiar',
    ],
  },
  {
    nodo: 'tema_familia',
    claves: [
      'mi mama', 'mi mamá', 'mi papa', 'mi papá', 'mi abuela', 'mi abuelo',
      'mi hermano', 'mi hermana', 'mi familia', 'esta llorando', 'está llorando',
      'esta preocupado', 'está preocupada',
    ],
  },
  {
    nodo: 'tema_dormir',
    claves: [
      'no puedo dormir', 'dormir', 'pesadilla', 'pesadillas', 'sueno feo',
      'sueño feo', 'me despierto', 'en la noche', 'de noche',
    ],
  },
  {
    nodo: 'tema_miedo',
    claves: [
      'miedo', 'susto', 'asustado', 'asustada', 'asusta', 'terror', 'panico',
      'pánico', 'nervioso', 'nerviosa', 'tiemblo', 'me da cosa',
    ],
  },
  {
    nodo: 'tema_tristeza',
    claves: [
      'triste', 'tristeza', 'llorar', 'lloro', 'llore', 'lloré', 'llorando',
      'deprimido', 'sin ganas', 'no quiero nada', 'me siento mal',
    ],
  },
  {
    nodo: 'tema_rabia',
    claves: ['rabia', 'bravo', 'brava', 'enojado', 'enojada', 'furioso', 'odio', 'injusto'],
  },
  {
    nodo: 'tema_solo',
    // 'solo' suelto NO va: "yo solo quiero jugar" no es soledad.
    claves: [
      'me siento solo', 'me siento sola', 'estoy solo', 'estoy sola',
      'muy solo', 'muy sola', 'soledad', 'nadie juega', 'nadie quiere jugar',
      'no tengo amigos', 'no tengo con quien',
    ],
  },
];

/**
 * Decide quién responde.
 * @param {string} texto lo que dijo el niño
 * @returns {{via:'crisis'|'guion'|'libre', nodo?:string, respuesta?:string, derivar?:boolean}}
 */
export function enrutar(texto) {
  // 1. Crisis: nunca pasa por el modelo.
  const seguridad = revisarEntrada(texto);
  if (seguridad.nivel === 'crisis') {
    return { via: 'crisis', respuesta: seguridad.respuesta, derivar: true };
  }

  const t = normalizar(texto);
  if (!t) return { via: 'libre' };

  // 2. Temas emocionales y del sismo: guion escrito por personas.
  for (const tema of TEMAS_GUION) {
    if (tema.claves.some((c) => t.includes(normalizar(c)))) {
      return {
        via: 'guion',
        nodo: tema.nodo,
        derivar: seguridad.nivel === 'angustia',
      };
    }
  }

  // 3. Todo lo demás: el modelo improvisa.
  return { via: 'libre', derivar: seguridad.nivel === 'angustia' };
}

/** Para la tarjeta de transparencia y el panel del docente. */
export const TEMAS_PROTEGIDOS = TEMAS_GUION.map((t) => t.nodo);
