/**
 * Backend ONLINE — Gemini, solo para la vitrina web.
 *
 * ⚠️ Este módulo NO se importa desde ninguna pantalla.
 * Solo `aiService.js` y `conversacion.js` lo consumen. Ver regla no negociable #2.
 *
 * La vitrina existe para que un jurado explore la interfaz sin instalar nada.
 * NO es evidencia de la capacidad offline — de ahí el banner obligatorio.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
/*
 * `gemini-1.5-flash` fue retirado: la API responde 404 a los usuarios nuevos.
 * Se eligió flash-lite y no un flash grande a propósito: los modelos de
 * razonamiento gastan parte del presupuesto de salida en pensar, y con un
 * `maxOutputTokens` bajo devuelven la frase cortada a la mitad — "Marisol
 * tiene 7 pel". Para escribir dos oraciones, el lite es más fiable y más
 * rápido, que es justo lo que necesita una vitrina.
 */
const MODELO = 'gemini-3.1-flash-lite';
const BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}`;

// Producto para menores: filtros al máximo razonable.
const SAFETY = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

function cuerpo(prompt, { maxTokens, temperatura }) {
  return JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: SAFETY,
    generationConfig: {
      temperature: temperatura,
      maxOutputTokens: maxTokens,
    },
  });
}

export async function generar(prompt, { maxTokens = 120, temperatura = 0.7, señal } = {}) {
  if (!API_KEY) throw new Error('Falta VITE_GEMINI_API_KEY en .env');

  const res = await fetch(`${BASE}:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: señal,
    body: cuerpo(prompt, { maxTokens, temperatura }),
  });

  if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

/** Extrae el texto de un fragmento de respuesta, venga como venga anidado. */
function textoDe(dato) {
  const partes = dato?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(partes)) return '';
  return partes.map((p) => p.text || '').join('');
}

/**
 * Igual que `generar`, pero entrega el texto según se va escribiendo.
 *
 * `streamGenerateContent` con `alt=sse` devuelve eventos `data: {...}`. La
 * ganancia real no es que Gemini sea más rápido —ya es rápido— sino que la
 * primera frase puede estar sonando mientras llega la segunda, igual que
 * offline. Que las dos rutas se comporten igual es lo que hace que la
 * vitrina siga siendo una demostración honesta del producto.
 *
 * @returns {Promise<string>} el texto completo que llegó a emitirse
 */
export async function generarStream(prompt, { maxTokens = 120, temperatura = 0.7, señal, onTexto } = {}) {
  if (!API_KEY) throw new Error('Falta VITE_GEMINI_API_KEY en .env');

  const res = await fetch(`${BASE}:streamGenerateContent?alt=sse&key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: señal,
    body: cuerpo(prompt, { maxTokens, temperatura }),
  });

  if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
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
      resto = lineas.pop() || '';

      for (const linea of lineas) {
        const l = linea.trim();
        if (!l.startsWith('data:')) continue; // comentarios y líneas en blanco del SSE

        const carga = l.slice(5).trim();
        if (!carga || carga === '[DONE]') continue;

        let dato;
        try { dato = JSON.parse(carga); } catch { continue; }

        const pedazo = textoDe(dato);
        if (pedazo) {
          completo += pedazo;
          if (onTexto?.(pedazo) === false) return completo;
        }
      }
    }
  } finally {
    try { await lector.cancel(); } catch { /* ya cerrado */ }
  }

  return completo;
}

export async function disponible() {
  return Boolean(API_KEY) && navigator.onLine;
}
