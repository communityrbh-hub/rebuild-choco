/**
 * Backend ONLINE — Gemini, solo para la vitrina web.
 *
 * ⚠️ Este módulo NO se importa desde ninguna pantalla.
 * Solo `aiService.js` lo consume. Ver regla no negociable #2.
 *
 * La vitrina existe para que un jurado explore la interfaz sin instalar nada.
 * NO es evidencia de la capacidad offline — de ahí el banner obligatorio.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELO = 'gemini-1.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

// Producto para menores: filtros al máximo razonable.
const SAFETY = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

export async function generar(prompt, { maxTokens = 120, temperatura = 0.7, señal } = {}) {
  if (!API_KEY) throw new Error('Falta VITE_GEMINI_API_KEY en .env');

  const res = await fetch(`${URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: señal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings: SAFETY,
      generationConfig: {
        temperature: temperatura,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function disponible() {
  return Boolean(API_KEY) && navigator.onLine;
}
