/**
 * Capa de seguridad — determinista, corre ANTES que el modelo
 * ===========================================================
 *
 * La conversación con Rumi es abierta: el niño habla de lo que quiera y el
 * modelo improvisa. Pero hay una franja donde un modelo generativo no puede
 * ser quien responda, y ahí no hay negociación posible:
 *
 *   → señales de autolesión, violencia o abuso
 *
 * Eso se detecta con reglas, no con IA, y dispara derivación humana directa.
 * Un modelo alucina; una lista de palabras no. Es la única parte del sistema
 * que un modelo NO puede saltarse.
 *
 * Diseño deliberado: preferimos falsos positivos. Mostrarle a un niño las
 * líneas de ayuda cuando no hacía falta cuesta poco. No mostrárselas cuando
 * hacía falta cuesta demasiado.
 */

/** Quita tildes y signos para comparar sin sorpresas. */
function normalizar(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Señales que activan derivación humana inmediata. */
const CRISIS = [
  // autolesión / ideación
  'quiero morir', 'quiero morirme', 'me quiero morir', 'no quiero vivir',
  'matarme', 'me mato', 'quitarme la vida', 'desaparecer para siempre',
  'hacerme dano', 'cortarme', 'lastimarme',
  // violencia y abuso
  'me pegan', 'me pega', 'me golpean', 'me golpea', 'me maltratan',
  'me lastiman', 'me hacen dano', 'me toca', 'me tocan', 'abusan de mi',
  'tengo miedo de mi papa', 'tengo miedo de mi mama', 'me amenaza',
  // desamparo grave
  'estoy solo y nadie', 'nadie me cuida', 'me dejaron solo', 'no tengo a nadie',
];

/* Señales de angustia alta: no son crisis, pero conviene ofrecer ayuda humana. */
const ANGUSTIA = [
  'no puedo dejar de llorar', 'lloro todo el dia', 'no puedo dormir',
  'tengo mucho miedo', 'tengo mucha rabia', 'me duele mucho',
  'no quiero hablar con nadie', 'estoy muy triste', 'me siento muy mal',
];

/**
 * Revisa lo que dijo el niño ANTES de que llegue al modelo.
 * @returns {{nivel:'crisis'|'angustia'|'ok', respuesta?:string, derivar?:boolean}}
 */
export function revisarEntrada(texto) {
  const t = normalizar(texto);
  if (!t) return { nivel: 'ok' };

  if (CRISIS.some((f) => t.includes(normalizar(f)))) {
    return {
      nivel: 'crisis',
      derivar: true,
      // Texto fijo, escrito por personas. Nunca generado.
      respuesta:
        'Gracias por contarme algo tan importante. Lo que me dices es serio y ' +
        'yo soy solo un osito: esto necesita que lo sepa una persona adulta que ' +
        'te pueda cuidar de verdad. Por favor busca a alguien en quien confíes, ' +
        'o llamemos juntos a una línea de ayuda. No estás solo.',
    };
  }

  if (ANGUSTIA.some((f) => t.includes(normalizar(f)))) {
    return { nivel: 'angustia', derivar: true };
  }

  return { nivel: 'ok' };
}

/* ============================================================
   Filtro de SALIDA — revisa lo que el modelo quiere decir
   ============================================================ */

/*
 * Un modelo de 1B se desvía. Si aparece algo de esto, no se muestra.
 *
 * Son RAÍCES, no palabras completas, y ese detalle importa: la lista original
 * tenía 'muerte' y 'murieron' pero no 'murió', y dejaba pasar entera la frase
 * "mucha gente murió en el temblor". Con raíces, una conjugación nueva no
 * abre un hueco.
 */
const PROHIBIDO = [
  // muerte y daño físico
  'muert', 'muri', 'morir', 'fallec', 'cadaver', 'sangre', 'herido', 'heridos',
  'matar', 'mataron', 'suicid', 'lastimar a',
  // objetos y sustancias
  'arma', 'pistola', 'cuchillo', 'droga', 'alcohol', 'sexo', 'sexual',
  // amenaza y culpa
  'infierno', 'castigo de dios', 'te van a', 'vas a morir', 'es tu culpa',
];

/* Palabras que no existen en español: si aparecen, el modelo cambió de idioma. */
const INGLES =
  /\b(the|and|you|your|what|that|this|with|have|they|there|here|about|tell|sounds|because|hello|please|thank|sorry|would|could|should|i am|it is|going to)\b/i;

/* Frases alarmistas: prohibidas hablando con un niño tras un sismo. */
const ALARMISTA = [
  'va a pasar otra vez', 'puede volver a pasar', 'sera peor', 'mas fuerte que',
  'nadie puede', 'no hay nada que hacer', 'estas en peligro',
];

/**
 * Valida la respuesta del modelo antes de mostrársela a un niño.
 * @returns {{ok:boolean, motivo?:string}}
 */
export function revisarSalida(texto) {
  if (!texto || texto.trim().length < 2) return { ok: false, motivo: 'vacia' };
  if (texto.length > 420) return { ok: false, motivo: 'muy_larga' };

  const t = normalizar(texto);

  if (PROHIBIDO.some((p) => t.includes(normalizar(p)))) return { ok: false, motivo: 'contenido' };
  if (ALARMISTA.some((p) => t.includes(normalizar(p)))) return { ok: false, motivo: 'alarmista' };

  // El modelo se fue al inglés (pasa mucho en modelos pequeños).
  // La lista corta de antes dejaba pasar frases enteras como
  // "that sounds nice, tell me more about it": ninguna de sus palabras
  // estaba en ella. Estas son palabras que no existen en español.
  if (INGLES.test(texto)) return { ok: false, motivo: 'idioma' };

  // Se puso a hablar consigo mismo o repitió el andamiaje del prompt.
  if (/^(rumi|asistente|usuario|ni[nñ]o)\s*:/i.test(texto.trim())) return { ok: false, motivo: 'formato' };

  return { ok: true };
}

export { normalizar };
