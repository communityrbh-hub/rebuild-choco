/**
 * MathScreen — aprendizaje (matemáticas y lectura)
 * ================================================
 *
 * ⚠️ ÚNICA PANTALLA QUE PUEDE IMPORTAR `aiService`. Ver regla no negociable #2.
 *
 * Aquí el modelo generativo hace lo único que un modelo de 1B hace bien:
 * convertir "7 × 3" en una historia con mangos y canastas. NO calcula.
 * Los números, el resultado y la verificación son código determinista.
 *
 * Si el modelo falla, tarda o alucina, hay redacción de respaldo y el niño
 * nunca se entera: la app no se queda muda ni muestra un resultado sin verificar.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, Volume2, Sparkles } from 'lucide-react';
import RumiAvatar from '../components/RumiAvatar';
import {
  generarEjercicio,
  verificar,
  explicarError,
  generarFraseLectura,
  infoBackend,
} from '../services/aiService';
import { hablar, callar } from '../services/tts';

const TOTAL = 3;
const TEMAS = ['suma', 'resta', 'multiplicacion'];

function lanzarConfeti() {
  const colores = ['#F4A261', '#E76F51', '#4A9D7F', '#FFD166', '#8AB6D6'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confeti';
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colores[i % colores.length];
    p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.35}s`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}

export default function MathScreen() {
  const navigate = useNavigate();
  const [modo, setModo] = useState('matematicas'); // matematicas | lectura
  const [ejercicio, setEjercicio] = useState(null);
  const [frase, setFrase] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [respuesta, setRespuesta] = useState('');
  const [estado, setEstado] = useState('respondiendo'); // respondiendo | correcto | incorrecto
  const [explicacion, setExplicacion] = useState('');
  const [indice, setIndice] = useState(0);
  const [aciertos, setAciertos] = useState(0);
  const [hablandoRumi, setHablandoRumi] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => callar(), []);
  // `cargar` se redefine en cada render; incluirla en las dependencias
  // dispararía un bucle infinito de generación. El disparo correcto es
  // exactamente "cambió el modo o avanzamos de ejercicio".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [modo, indice]);

  async function cargar() {
    setCargando(true);
    setEstado('respondiendo');
    setRespuesta('');
    setExplicacion('');

    if (modo === 'lectura') {
      const f = await generarFraseLectura(6);
      setFrase(f);
      setCargando(false);
      return;
    }

    const tema = TEMAS[indice % TEMAS.length];
    const ej = await generarEjercicio(tema, 8);
    setEjercicio(ej);
    setCargando(false);
    hablar(ej.enunciado, { onStart: () => setHablandoRumi(true), onEnd: () => setHablandoRumi(false) });
    setTimeout(() => inputRef.current?.focus(), 120);
  }

  async function comprobar(e) {
    e?.preventDefault();
    if (!respuesta.trim() || !ejercicio) return;

    // ⚠️ La verificación es código. El modelo no opina sobre si está bien o mal.
    if (verificar(ejercicio, respuesta)) {
      setEstado('correcto');
      setAciertos((a) => a + 1);
      lanzarConfeti();
      guardarProgreso(true);
      hablar('¡Muy bien! Lo lograste.', { onStart: () => setHablandoRumi(true), onEnd: () => setHablandoRumi(false) });
    } else {
      setEstado('incorrecto');
      guardarProgreso(false);
      setExplicacion('');
      const { texto } = await explicarError(ejercicio, respuesta);
      setExplicacion(texto);
      hablar(texto, { onStart: () => setHablandoRumi(true), onEnd: () => setHablandoRumi(false) });
    }
  }

  function guardarProgreso(acierto) {
    try {
      const prev = JSON.parse(localStorage.getItem('rebuild_progreso') || '[]');
      prev.push({ fecha: new Date().toISOString(), tema: ejercicio?.tema, acierto });
      localStorage.setItem('rebuild_progreso', JSON.stringify(prev.slice(-100)));
    } catch { /* no crítico */ }
  }

  function siguiente() {
    callar();
    if (indice + 1 >= TOTAL) { setIndice(0); setAciertos(0); }
    else setIndice((i) => i + 1);
  }

  const terminado = modo === 'matematicas' && indice + 1 >= TOTAL && estado === 'correcto';

  return (
    <div className="pantalla">
      <div className="fila mb-16">
        <button className="link-volver" onClick={() => { callar(); navigate('/'); }}>
          <ArrowLeft size={18} /> Volver
        </button>
        <div className="espaciador" />
        {modo === 'matematicas' && (
          <span className="sec" style={{ fontWeight: 600 }}>{indice + 1} de {TOTAL}</span>
        )}
      </div>

      {modo === 'matematicas' && (
        <div className="progreso-pasos" style={{ marginBottom: 16 }}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <div key={i} className={`paso ${i <= indice ? 'activo' : ''}`} />
          ))}
        </div>
      )}

      {/* Selector de actividad — no es una pantalla nueva, es un modo */}
      <div className="fila mb-16" style={{ gap: 8 }}>
        {[['matematicas', '🔢 Matemáticas'], ['lectura', '📖 Lectura']].map(([id, etiqueta]) => (
          <button
            key={id}
            onClick={() => { callar(); setIndice(0); setAciertos(0); setModo(id); }}
            style={{
              flex: 1, height: 44, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 14, fontWeight: 640,
              transition: 'all .15s ease',
              border: modo === id ? '2px solid var(--primario)' : '2px solid var(--borde)',
              background: modo === id ? 'var(--primario-luz)' : 'var(--superficie)',
              color: modo === id ? 'var(--primario-osc)' : 'var(--texto-sec)',
              boxShadow: modo === id ? 'var(--sombra-sm)' : 'none',
            }}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="centro mb-16">
        <RumiAvatar
          estado={estado === 'correcto' ? 'feliz' : hablandoRumi ? 'hablando' : 'idle'}
          tamano={124}
        />
      </div>

      {cargando ? (
        <div className="tarjeta centro">
          <span className="cargando" />
          <p className="sec" style={{ marginTop: 12, marginBottom: 0 }}>
            {infoBackend.nombre} está preparando algo para ti…
          </p>
        </div>
      ) : modo === 'lectura' ? (
        /* ---------- MODO LECTURA ---------- */
        <>
          <div className="tarjeta">
            <span className="sec">Lee esta frase en voz alta</span>
            <p style={{ fontSize: 27, lineHeight: 1.5, fontWeight: 650, margin: '12px 0 0', letterSpacing: '-.3px' }}>
              {frase?.texto}
            </p>
          </div>
          <button
            className="btn btn-suave"
            onClick={() => hablar(frase.texto, { onStart: () => setHablandoRumi(true), onEnd: () => setHablandoRumi(false) })}
          >
            <Volume2 size={20} /> Escuchar cómo se dice
          </button>
          <button className="btn btn-primario" onClick={cargar}>
            <RotateCcw size={20} /> Otra frase
          </button>
        </>
      ) : (
        /* ---------- MODO MATEMÁTICAS ---------- */
        <>
          <div className="tarjeta">
            <p style={{ fontSize: 19.5, lineHeight: 1.55, margin: 0, fontWeight: 540, letterSpacing: '-.2px' }}>{ejercicio?.enunciado}</p>
            <button
              onClick={() => hablar(ejercicio.enunciado, { onStart: () => setHablandoRumi(true), onEnd: () => setHablandoRumi(false) })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primario-osc)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginTop: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600 }}
            >
              <Volume2 size={16} /> Escuchar
            </button>
          </div>

          {estado === 'respondiendo' && (
            <form onSubmit={comprobar}>
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                placeholder="Tu respuesta"
                className="entrada"
                style={{ height: 70, fontSize: 30, fontWeight: 750, textAlign: 'center', marginBottom: 12, letterSpacing: '-.5px' }}
              />
              <button type="submit" className="btn btn-primario" disabled={!respuesta.trim()}>
                <Check size={20} /> Comprobar
              </button>
            </form>
          )}

          {estado === 'correcto' && (
            <div className="tarjeta" style={{ background: 'var(--exito-luz)', border: '1.5px solid var(--exito)' }}>
              <div className="fila mb-8">
                <Sparkles size={20} color="var(--exito)" />
                <strong>¡Muy bien! La respuesta es {ejercicio.resultado}.</strong>
              </div>
              <p className="sec" style={{ margin: 0 }}>
                {terminado
                  ? `Terminaste los ${TOTAL} ejercicios con ${aciertos} aciertos. ¡Excelente trabajo!`
                  : 'Vamos con el siguiente.'}
              </p>
            </div>
          )}

          {estado === 'incorrecto' && (
            <div className="tarjeta" style={{ background: 'var(--primario-luz)', border: '1.5px solid var(--primario)' }}>
              <strong>Casi. ¿Qué tal si lo revisamos juntos?</strong>
              {explicacion ? (
                <p style={{ marginTop: 10, marginBottom: 0, lineHeight: 1.55 }}>{explicacion}</p>
              ) : (
                <p className="sec" style={{ marginTop: 10, marginBottom: 0 }}>
                  <span className="cargando" style={{ verticalAlign: -3, marginRight: 8 }} />
                  Rumi está pensando cómo explicarte…
                </p>
              )}
            </div>
          )}

          {estado !== 'respondiendo' && (
            <button className="btn btn-primario" onClick={estado === 'incorrecto' ? cargar : siguiente}>
              {estado === 'incorrecto'
                ? <><RotateCcw size={20} /> Intentar otro</>
                : terminado ? 'Empezar de nuevo' : 'Siguiente ejercicio'}
            </button>
          )}
        </>
      )}

      <div className="espaciador" />

      <p className="sec centro" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
        {infoBackend.modo === 'offline' ? '🔌' : '🌐'} {infoBackend.nombre} · {infoBackend.detalle}
        {ejercicio?.fuente === 'respaldo' && modo === 'matematicas' && ' · ejercicio de respaldo'}
      </p>
    </div>
  );
}
