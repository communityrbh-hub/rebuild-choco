/**
 * Backend OFFLINE — Gemma 3 corriendo local vía Ollama.
 *
 * ⚠️ Este módulo NO se importa desde ninguna pantalla.
 * Solo `aiService.js` lo consume. Ver regla no negociable #2.
 *
 * ⚠️ CORS: Ollama rechaza peticiones de otro origen por defecto.
 * Antes de arrancar hay que exportar:
 *     setx OLLAMA_ORIGINS "*"      (Windows, y reiniciar Ollama)
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate';

export const MODELO = 'gemma3:1b';

export async function generar(prompt, { maxTokens = 120, temperatura = 0.7, señal } = {}) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: señal,
    body: JSON.stringify({
      model: MODELO,
      prompt,
      stream: false,
      keep_alive: '30m', // mantiene el modelo caliente en RAM entre ejercicios
      options: {
        temperature: temperatura,
        num_predict: maxTokens,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
  const data = await res.json();
  return (data.response || '').trim();
}

export async function disponible() {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}
