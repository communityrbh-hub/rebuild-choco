/**
 * Mide la tasa real de acierto del modelo redactando enunciados.
 *   node scripts/probar-matematicas.mjs [n]
 * No es un test que falle: es un termómetro del modelo antes de una demo.
 */
import { readFileSync } from 'node:fs';

// El pack se lee directo: importar aiService arrastraría el backend online,
// que solo existe dentro de Vite.
const pack = JSON.parse(readFileSync(new URL('../src/packs/choco-sismo-2026.json', import.meta.url)));
const azar = (a) => a[Math.floor(Math.random() * a.length)];
const entre = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Misma generación determinista que `aiService.crearProblema`. */
function crearProblema(tema) {
  let a, b, operador, resultado;
  if (tema === 'multiplicacion') { a = entre(2, 9); b = entre(2, 9); operador = '×'; resultado = a * b; }
  else if (tema === 'resta')     { a = entre(10, 40); b = entre(1, a - 1); operador = '−'; resultado = a - b; }
  else                           { a = entre(1, 30); b = entre(1, 30); operador = '+'; resultado = a + b; }
  return {
    a, b, operador, resultado, tema,
    expresion: `${a} ${operador} ${b}`,
    nombre: azar(pack.curriculo.matematicas.nombresLocales),
    contexto: azar(pack.curriculo.matematicas.contextosNarrativos),
  };
}

const cosas = (c, n) => (n === 1 ? c.singular : c.plural);
const cuantos = (c) => (c.genero === 'f' ? 'Cuántas' : 'Cuántos');
const contextoTexto = (c) => `${c.plural} ${c.lugar}`;

function narrativaRespaldo({ nombre, contexto: c, a, b, tema }) {
  if (tema === 'multiplicacion')
    return `${nombre} tiene ${a} ${a === 1 ? c.grupo : c.grupos} y en cada ${c.grupo} hay ${b} ${cosas(c, b)}. ¿${cuantos(c)} ${c.plural} hay en total?`;
  if (tema === 'resta')
    return `${nombre} tenía ${a} ${cosas(c, a)} ${c.lugar} y regaló ${b}. ¿${cuantos(c)} le quedaron?`;
  return `${nombre} tiene ${a} ${cosas(c, a)} ${c.lugar} y le dan ${b} más. ¿${cuantos(c)} tiene ahora?`;
}

const N = Number(process.argv[2] || 9);
const temas = ['suma', 'resta', 'multiplicacion'];
let ia = 0, respaldo = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const tema = temas[i % 3];
  const p = crearProblema(tema);
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3:1b', stream: false, keep_alive: '30m',
      options: { temperature: 0.7, num_predict: 80 },
      prompt: `Eres un tutor de primaria en Colombia. Escribes problemas de matemáticas para niños de 8 años.

EJEMPLO
Operación: 4 + 2
Personaje: Marisol
Contexto: pelotas en la cancha
Problema: Marisol tiene 4 pelotas y su amiga le regala 2 más. ¿Cuántas pelotas tiene ahora?

AHORA HAZLO TÚ
Operación: ${p.a} ${p.operador} ${p.b}
Personaje: ${p.nombre}
Contexto: ${contextoTexto(p.contexto)}
Problema:`,
    }),
  }).then((r) => r.json());

  const bruto = (res.response || '').trim();
  const lineas = bruto.split(/\r?\n/).map((l) => l.replace(/[*_`#]/g, '').trim()).filter(Boolean)
    .filter((l) => !/^(problema|operaci[oó]n|tipo|personaje|contexto|ejemplo|ahora)\s*:?\s*$/i.test(l))
    .map((l) => l.replace(/^(problema|contexto|enunciado)\s*:\s*/i, '').trim())
    .filter((l) => !/^(operaci[oó]n|tipo|personaje)\s*:/i.test(l));
  const limpio = (lineas.find((l) => l.includes('?') && l.length > 25) || lineas[0] || '')
    .replace(/^["'¡\s]+|["'\s]+$/g, '').trim();

  // Mismas reglas que `aiService.narrativaValida`, incluida la coherencia
  // entre el verbo del enunciado y la operación que calculó el código.
  const sinTildes = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const QUITAR = ['queda', 'quedan', 'quedaron', 'quedo', 'sobran', 'sobra', 'perdio', 'perdieron',
    'se le cayeron', 'se le cayo', 'regalo', 'regalaron', 'comio', 'comieron', 'vendio', 'quito',
    'se fueron', 'se escaparon', 'presto'];
  const AGREGAR = ['mas', 'le dan', 'le da', 'le regalan', 'le regala', 'recibe', 'recibio',
    'encuentra', 'encontro', 'consigue', 'gana', 'junta', 'agrega'];
  const AGRUPAR = ['cada', 'grupos', 'grupo', 'canasta', 'corral', 'racimo', 'bolsa', 'canoa', 'caja'];
  const tt = sinTildes(limpio || '');
  const quita = QUITAR.some((m) => tt.includes(m));
  const agrega = AGREGAR.some((m) => tt.includes(m));
  const agrupa = AGRUPAR.some((m) => tt.includes(m));
  const coherente =
    p.tema === 'suma' ? agrega && !quita
    : p.tema === 'resta' ? quita
    : agrupa && !quita;

  const valido = Boolean(
    limpio && limpio.length >= 15 && limpio.length <= 320 &&
    limpio.includes(String(p.a)) && limpio.includes(String(p.b)) &&
    !new RegExp(`\b${p.resultado}\b`).test(limpio) &&
    !/\[|\]|respuesta\s*:/i.test(limpio) &&
    coherente,
  );

  if (valido) ia++; else respaldo++;
  console.log(`${valido ? '✅ ia      ' : '↩️  respaldo'}  ${p.expresion} = ${p.resultado}`);
  console.log(`             ${valido ? limpio : narrativaRespaldo(p)}`);
  if (!valido && limpio) console.log(`             (descartado: "${limpio.slice(0, 80)}")`);
}

const seg = ((Date.now() - t0) / 1000 / N).toFixed(1);
console.log(`\n${ia}/${N} redactados por Gemma · ${respaldo}/${N} al respaldo · ${seg} s por ejercicio`);
console.log('La respuesta correcta siempre la calculó el código, en los dos casos.\n');
