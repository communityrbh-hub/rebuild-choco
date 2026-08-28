/**
 * Mapeo VOZ → INTENCIÓN
 * =====================
 *
 * ⚠️ REGLA NO NEGOCIABLE #3
 * La transcripción de la voz del niño NUNCA se envía a un modelo generativo.
 * Aquí se compara contra las `keywords` del árbol de diálogo y se resuelve a
 * una opción concreta. Hablar equivale exactamente a tocar un botón.
 *
 * Motivo: si la voz alimentara al LLM, el input emocional del niño acabaría
 * en un modelo generativo, que es justo lo que la regla #1 prohíbe.
 */

/** Quita tildes, signos y mayúsculas para comparar sin sorpresas. */
function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resuelve una transcripción a una de las opciones del nodo actual.
 * @returns {{opcion: object, confianza: number}|null}
 */
export function resolverIntencion(transcripcion, opciones = []) {
  const dicho = normalizar(transcripcion);
  if (!dicho || !opciones.length) return null;

  const palabrasDichas = dicho.split(' ').filter((p) => p.length > 2);
  let mejor = null;
  let mejorPuntaje = 0;

  for (const opcion of opciones) {
    const claves = [...(opcion.keywords || []), opcion.label || ''].map(normalizar).filter(Boolean);
    let puntaje = 0;

    for (const clave of claves) {
      if (!clave) continue;
      // Frase completa presente: señal fuerte.
      if (dicho.includes(clave)) {
        puntaje = Math.max(puntaje, clave.includes(' ') ? 1.0 : 0.9);
        continue;
      }
      // Coincidencia de palabra suelta.
      for (const palabra of palabrasDichas) {
        if (clave === palabra) puntaje = Math.max(puntaje, 0.8);
        else if (clave.length > 4 && palabra.length > 4 && (clave.startsWith(palabra) || palabra.startsWith(clave))) {
          puntaje = Math.max(puntaje, 0.6);
        }
      }
    }

    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = opcion;
    }
  }

  // Umbral deliberadamente alto: ante la duda, es preferible pedirle al niño
  // que toque el botón antes que llevarlo a un nodo emocional equivocado.
  if (mejor && mejorPuntaje >= 0.6) {
    return { opcion: mejor, confianza: mejorPuntaje };
  }
  return null;
}

export { normalizar };
