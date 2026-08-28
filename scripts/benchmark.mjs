/**
 * Benchmark de selección de modelo.
 *
 * No mide "¿por qué el cielo es azul?". Mide EXACTAMENTE las cuatro tareas que
 * el modelo va a hacer en producción, con los prompts reales de `aiService.js`.
 *
 * Uso:  node scripts/benchmark.mjs
 */

const URL = 'http://localhost:11434/api/generate';
const MODELOS = ['gemma3:1b', 'qwen3:0.6b', 'qwen3:1.7b'];

const TAREAS = [
  {
    nombre: '1. Vestir una operación de historia',
    maxTokens: 90,
    temp: 0.8,
    prompt: `Eres un tutor de primaria paciente y cálido, en Colombia.

Convierte esta operación en UN problema de palabras para un niño de 8 años:
  Operación: 7 × 3
  Tipo: multiplicacion (grupos iguales de la misma cantidad)
  Personaje: Yeison
  Contexto: canastas de mangos

REGLAS ESTRICTAS:
- Máximo 2 oraciones. Lenguaje muy simple.
- Los números 7 y 3 deben aparecer tal cual.
- Termina con una pregunta.
- NO escribas la respuesta. NO resuelvas nada. NO uses números distintos a 7 y 3.
- Responde SOLO con el problema, sin encabezados ni explicaciones.`,
    validar: (t) => ({
      'contiene 7 y 3': t.includes('7') && t.includes('3'),
      'NO revela el 21': !/\b21\b/.test(t),
      'termina en pregunta': t.includes('?'),
      'breve (<320 car.)': t.length < 320,
    }),
  },
  {
    nombre: '2. Explicar un error sin calcular',
    maxTokens: 110,
    temp: 0.6,
    prompt: `Eres un tutor de primaria cálido y alentador, en Colombia.

Un niño resolvió "12 − 5" y respondió 8.
La respuesta correcta es 7.

Escribe una explicación breve y amable:
- Máximo 3 oraciones, lenguaje muy simple.
- Empieza reconociendo su esfuerzo, nunca lo regañes.
- Explica el paso a paso usando la respuesta correcta 7, que ya te di.
- NO calcules nada por tu cuenta. Usa exactamente 7.
- Responde SOLO con la explicación.`,
    validar: (t) => ({
      'usa el 7 correcto': /\b7\b/.test(t),
      'no inventa otro resultado': !/\b(8|9|6)\b\s*(es|sería|da)\s*(la|el)?\s*(respuesta|resultado)/i.test(t),
      'breve (<400 car.)': t.length < 400,
    }),
  },
  {
    nombre: '3. Frase corta de lectura',
    maxTokens: 40,
    temp: 0.9,
    prompt: `Escribe UNA frase muy corta y simple en español para que un niño de 6 años la lea en voz alta.
- Máximo 8 palabras.
- Palabras comunes y fáciles.
- Contexto rural del Pacífico colombiano (río, casa, animales, comida, familia).
- Responde SOLO con la frase, sin comillas ni explicación.`,
    validar: (t) => ({
      'máximo 12 palabras': t.split(/\s+/).length <= 12,
      'una sola línea': !t.trim().includes('\n'),
      'longitud razonable': t.length > 8 && t.length < 90,
    }),
  },
];

async function correr(modelo, tarea) {
  const t0 = Date.now();
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        prompt: tarea.prompt,
        stream: false,
        keep_alive: '30m',
        options: { temperature: tarea.temp, num_predict: tarea.maxTokens },
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    const segundos = (Date.now() - t0) / 1000;
    const tokens = d.eval_count || 0;
    const texto = (d.response || '').trim();

    return {
      texto,
      segundos,
      tokens,
      tokPorSeg: d.eval_duration ? tokens / (d.eval_duration / 1e9) : 0,
      checks: tarea.validar(texto),
    };
  } catch (e) {
    return { error: e.message, segundos: (Date.now() - t0) / 1000 };
  }
}

console.log('\n' + '='.repeat(72));
console.log('  BENCHMARK REBUILD — tareas reales de producción');
console.log('='.repeat(72));

const resumen = {};

for (const modelo of MODELOS) {
  console.log(`\n\n${'█'.repeat(72)}`);
  console.log(`  MODELO: ${modelo}`);
  console.log('█'.repeat(72));

  resumen[modelo] = { velocidades: [], aprobados: 0, total: 0, fallo: false };

  for (const tarea of TAREAS) {
    console.log(`\n── ${tarea.nombre}`);
    const r = await correr(modelo, tarea);

    if (r.error) {
      console.log(`   ❌ ERROR: ${r.error}`);
      resumen[modelo].fallo = true;
      continue;
    }

    console.log(`\n   "${r.texto.replace(/\n/g, '\n    ')}"\n`);
    console.log(`   ⏱  ${r.segundos.toFixed(1)} s · ${r.tokPorSeg.toFixed(1)} tok/s · ${r.tokens} tokens`);

    const entradas = Object.entries(r.checks);
    const ok = entradas.filter(([, v]) => v).length;
    resumen[modelo].aprobados += ok;
    resumen[modelo].total += entradas.length;
    resumen[modelo].velocidades.push(r.tokPorSeg);

    console.log('   ' + entradas.map(([k, v]) => `${v ? '✅' : '❌'} ${k}`).join('  ·  '));
  }
}

console.log(`\n\n${'='.repeat(72)}`);
console.log('  RESUMEN');
console.log('='.repeat(72));
console.log(`\n${'Modelo'.padEnd(16)}${'Velocidad'.padEnd(16)}${'Validaciones'.padEnd(16)}Veredicto`);
console.log('-'.repeat(72));

for (const [modelo, r] of Object.entries(resumen)) {
  const vel = r.velocidades.length
    ? (r.velocidades.reduce((a, b) => a + b, 0) / r.velocidades.length).toFixed(1) + ' tok/s'
    : '—';
  const calidad = r.total ? `${r.aprobados}/${r.total}` : '—';
  const pct = r.total ? r.aprobados / r.total : 0;
  const veredicto = r.fallo ? '❌ falló' : pct >= 0.85 ? '✅ apto' : pct >= 0.6 ? '⚠️  dudoso' : '❌ no apto';
  console.log(`${modelo.padEnd(16)}${vel.padEnd(16)}${calidad.padEnd(16)}${veredicto}`);
}

console.log(`\n${'='.repeat(72)}`);
console.log('  Criterio: velocidad ≥ 10 tok/s y validaciones ≥ 85%.');
console.log('  Las validaciones son las que hace aiService.js en producción:');
console.log('  un output que no pasa se descarta y se usa la redacción de respaldo.');
console.log('='.repeat(72) + '\n');
