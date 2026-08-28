/**
 * Backend OFFLINE — Gemma 3 corriendo local vía Ollama.
 *
 * ⚠️ Este módulo NO se importa desde ninguna pantalla.
 * Solo `aiService.js` y `conversacion.js` lo consumen. Ver regla no negociable #2.
 *
 * ⚠️ CORS: Ollama rechaza peticiones de otro origen por defecto.
 * Antes de arrancar hay que exportar:
 *     setx OLLAMA_ORIGINS "*"      (Windows, y reiniciar Ollama)
 */

const BASE = 'http://localhost:11434';
const OLLAMA_URL = `${BASE}/api/generate`;

export const MODELO = 'gemma3:1b';

function cuerpo(prompt, { maxTokens, temperatura, stream }) {
  return JSON.stringify({
    model: MODELO,
    prompt,
    stream,
    keep_alive: '30m', // mantiene el modelo caliente en RAM entre ejercicios
    options: {
      temperature: temperatura,
      num_predict: maxTokens,
      /*
       * Gemma en CPU tarda unos cientos de milisegundos en arrancar a
       * escribir. Bajar la ventana de contexto a lo que de verdad se usa
       * —el rol más seis turnos— acorta ese arranque, que es exactamente el
       * silencio que el niño percibe como "no me contesta".
       */
      num_ctx: 1024,
    },
  });
}

export async function generar(prompt, { maxTokens = 120, temperatura = 0.7, señal } = {}) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: señal,
    body: cuerpo(prompt, { maxTokens, temperatura, stream: false }),
  });

  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const data = await res.json();
  return (data.response || '').trim();
}

/**
 * Igual que `generar`, pero entrega el texto según se va escribiendo.
 *
 * Es la mitad de la latencia del turno. Ollama emite NDJSON: un objeto JSON
 * por línea, cada uno con el pedacito recién generado. Con eso, la primera
 * frase puede estar sonando por el altavoz mientras el modelo todavía está
 * escribiendo la segunda.
 *
 * @param {string} prompt
 * @param {object} opciones  onTexto(fragmento) se llama por cada pedazo;
 *                           si devuelve `false`, se corta la generación.
 * @returns {Promise<string>} el texto completo que llegó a emitirse
 */
export async function generarStream(prompt, { maxTokens = 120, temperatura = 0.7, señal, onTexto } = {}) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: señal,
    body: cuerpo(prompt, { maxTokens, temperatura, stream: true }),
  });

  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  if (!res.body) return generar(prompt, { maxTokens, temperatura, señal });

  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  let completo = '';

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;

      resto += decodificador.decode(value, { stream: true });
      const lineas = resto.split('\n');
      resto = lineas.pop() || ''; // la última puede venir partida a la mitad

      for (const linea of lineas) {
        const l = linea.trim();
        if (!l) continue;
        let dato;
        try { dato = JSON.parse(l); } catch { continue; }

        const pedazo = dato.response || '';
        if (pedazo) {
          completo += pedazo;
          if (onTexto?.(pedazo) === false) return completo;
        }
        if (dato.done) return completo;
      }
    }
  } finally {
    // Cerrar el lector aborta la generación en el servidor: si el niño
    // interrumpió, no tiene sentido que Ollama siga gastando CPU en una
    // respuesta que ya nadie va a oír.
    try { await lector.cancel(); } catch { /* ya cerrado */ }
  }

  return completo;
}

export async function disponible() {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}
