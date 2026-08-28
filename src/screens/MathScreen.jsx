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
import { ArrowLeft, Sparkles, Mic } from 'lucide-react';
import RumiAvatar from '../components/RumiAvatar';
import {
  generarEjercicio,
  verificar,
  explicarError,
  generarFraseLectura,
  infoBackend,
} from '../services/aiService';
import { hablar, callar } from '../services/tts';
import { crearSesionEscucha, sttDisponible, pareceEco } from '../services/stt';

const TOTAL = 3;
const TEMAS = ['suma', 'resta', 'multiplicacion'];

/*
 * El niño dice el número, no lo teclea. Whisper y la Web Speech API
 * devuelven a veces dígitos ("32") y a veces palabras ("treinta y dos"),
 * según el motor y la frase; hay que entender las dos formas o la mitad de
 * las respuestas correctas se contarían como falladas.
 */
const UNIDADES = {
  cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29,
};
const DECENAS = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90, cien: 100, ciento: 100,
};

function limpiar(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Devuelve el número que dijo el niño, o null si no dijo ninguno. */
function numeroDicho(texto) {
  const t = limpiar(texto);
  if (!t) return null;

  const digito = t.match(/\d{1,3}/);
  if (digito) return Number(digito[0]);

  const palabras = t.split(' ');
  let total = null;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    if (DECENAS[p] !== undefined) {
      let valor = DECENAS[p];
      // "treinta y dos" -> 32
      if (palabras[i + 1] === 'y' && UNIDADES[palabras[i + 2]] !== undefined) {
        valor += UNIDADES[palabras[i + 2]];
        i += 2;
      }
      total = valor;
      break;
    }
    if (UNIDADES[p] !== undefined) { total = UNIDADES[p]; break; }
  }
  return total;
}

/** Órdenes que no son un número: repetir, cambiar de actividad, irse. */
function ordenDicha(texto) {
  const t = limpiar(texto);
  if (!t) return null;
  if (/(repite|repetir|otra vez|no escuche|no entendi|que dijiste)/.test(t)) return 'repetir';
  if (/(otro|otra|siguiente|siga|sigamos|next)/.test(t)) return 'otro';
  if (/(leer|lectura|lee|leyendo)/.test(t)) return 'lectura';
  if (/(cuentas|matematicas|numeros|sumar|restar|multiplicar)/.test(t)) return 'matematicas';
  if (/(ya no|terminar|termine|adios|chao|salir|volver|listo)/.test(t)) return 'salir';
  return null;
}

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
  const [oido, setOido] = useState('');
  const [escuchando, setEscuchando] = useState(false);
  const inputRef = useRef(null);
  const sesionRef = useRef(null);
  const ecoRef = useRef({ texto: '', ts: 0 });
  const manejarRef = useRef(null);
  const hayVoz = sttDisponible();

  useEffect(() => () => callar(), []);

  /*
   * Rumi habla y luego escucha, igual que en el chat. Se dice en voz alta el
   * enunciado, se abre el micrófono, y lo que el niño responde entra por aquí.
   * `manejarRef` existe porque la sesión se crea una sola vez (montaje) pero
   * la función que interpreta la respuesta cambia con cada ejercicio.
   */
  useEffect(() => {
    if (!hayVoz) return undefined;
    const sesion = crearSesionEscucha({
      onEstado: (e) => setEscuchando(e === 'escuchando'),
      onNivel: () => {},
      onResultado: (t) => {
        // No confundir su propia voz con la del niño.
        if (Date.now() - ecoRef.current.ts < 6000 && pareceEco(t, ecoRef.current.texto)) return;
        manejarRef.current?.(t);
      },
      onAviso: () => setEscuchando(false),
      textoDeRumi: () => ecoRef.current.texto,
    });
    sesionRef.current = sesion;
    sesion.escuchar?.();
    return () => sesion.cerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayVoz]);

  /** Decir algo y volver a escuchar en cuanto se calle. */
  function decir(texto, alTerminar) {
    if (!texto) return;
    ecoRef.current = { texto, ts: Date.now() };
    sesionRef.current?.pausar();
    hablar(texto, {
      onStart: () => setHablandoRumi(true),
      onEnd: () => {
        setHablandoRumi(false);
        ecoRef.current = { texto, ts: Date.now() };
        alTerminar?.();
        sesionRef.current?.escuchar?.();
      },
    });
  }
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

    setOido('');

    if (modo === 'lectura') {
      const f = await generarFraseLectura(6);
      setFrase(f);
      setCargando(false);
      decir(`Lee esto en voz alta: ${f.texto}`);
      return;
    }

    const tema = TEMAS[indice % TEMAS.length];
    const ej = await generarEjercicio(tema, 8);
    setEjercicio(ej);
    setCargando(false);
    decir(ej.enunciado);
  }

  /*
   * Lo que el niño dijo mientras hay un ejercicio abierto. Un número es una
   * respuesta; lo demás son órdenes de conversación. No hay ningún botón que
   * haga esto: se dice y ya.
   */
  function alOir(texto) {
    const t = (texto || '').trim();
    if (!t) return;
    setOido(t);

    const orden = ordenDicha(t);
    if (orden === 'salir')       { callar(); sesionRef.current?.cerrar(); navigate('/chat'); return; }
    if (orden === 'lectura')     { callar(); setIndice(0); setAciertos(0); setModo('lectura'); return; }
    if (orden === 'matematicas' && modo === 'lectura') { callar(); setIndice(0); setModo('matematicas'); return; }
    if (orden === 'repetir')     { decir(modo === 'lectura' ? frase?.texto : ejercicio?.enunciado); return; }
    if (orden === 'otro')        { if (estado === 'correcto') siguiente(); else cargar(); return; }

    if (modo === 'lectura') { decir('Muy bien leído. Vamos con otra.', null); setTimeout(cargar, 900); return; }

    const numero = numeroDicho(t);
    if (numero === null) {
      decir('No te entendí el número. Dímelo otra vez, despacito.');
      return;
    }
    comprobar(null, String(numero));
  }
  manejarRef.current = alOir;

  async function comprobar(e, dicho) {
    e?.preventDefault();
    const valor = dicho ?? respuesta;
    if (!String(valor).trim() || !ejercicio || estado === 'correcto') return;
    setRespuesta(String(valor));

    // ⚠️ La verificación es código. El modelo no opina sobre si está bien o mal.
    if (verificar(ejercicio, valor)) {
      setEstado('correcto');
      setAciertos((a) => a + 1);
      lanzarConfeti();
      guardarProgreso(true);
      // Avanza sola: pedirle al niño que toque "siguiente" rompe la conversación.
      decir(
        indice + 1 >= TOTAL
          ? `¡Muy bien! Lo lograste. Terminaste los tres. ¿Quieres otra ronda?`
          : '¡Muy bien! Lo lograste. Va la siguiente.',
        () => { if (indice + 1 < TOTAL) setTimeout(siguiente, 300); },
      );
    } else {
      setEstado('incorrecto');
      guardarProgreso(false);
      setExplicacion('');
      const { texto } = await explicarError(ejercicio, valor);
      setExplicacion(texto);
      // Método socrático: hace UNA pregunta y deja el micrófono abierto para
      // que el niño conteste. El estado sigue en 'incorrecto' para que se vea
      // la pregunta, pero se admite otro intento sin tocar nada.
      decir(texto);
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
        <button className="link-volver" onClick={() => { callar(); sesionRef.current?.cerrar(); navigate('/chat'); }}>
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

      {/* Aquí no se escoge actividad con botones: se dice. "quiero leer" o
          "hagamos cuentas" cambian de modo desde la propia conversación. */}

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
          <p className="sec centro" style={{ marginTop: 14 }}>
            Léela en voz alta. Si quieres oírla, dile <em>“repite”</em>; para otra,
            <em> “otra”</em>.
          </p>
        </>
      ) : (
        /* ---------- MODO MATEMÁTICAS ---------- */
        <>
          <div className="tarjeta">
            <p style={{ fontSize: 19.5, lineHeight: 1.55, margin: 0, fontWeight: 540, letterSpacing: '-.2px' }}>{ejercicio?.enunciado}</p>

          </div>

          {/* La respuesta se dice. El teclado numérico solo aparece si este
              navegador no tiene oído: es un respaldo de accesibilidad, no una
              opción entre dos formas de contestar. */}
          {hayVoz ? (
            <div className="centro" style={{ margin: '18px 0 6px' }}>
              <div className={`escucha-punto ${escuchando ? 'viva' : ''}`}>
                <Mic size={20} />
              </div>
              <p className="sec" style={{ margin: '10px 0 0', fontSize: 13.5 }}>
                {hablandoRumi ? 'Rumi está hablando…'
                  : escuchando ? 'Dime el número en voz alta'
                  : 'Un momento…'}
              </p>
              {oido && <p className="subtitulo-nino" style={{ marginTop: 6 }}>“{oido}”</p>}
            </div>
          ) : estado === 'respondiendo' && (
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
                Comprobar
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

          {/* No hay "siguiente ejercicio": cuando acierta, Rumi lo anuncia y
              pasa solo. Y si quiere otro antes, lo pide hablando. */}
          {!hayVoz && estado !== 'respondiendo' && (
            <button className="btn btn-primario" onClick={estado === 'incorrecto' ? cargar : siguiente}>
              {estado === 'incorrecto' ? 'Intentar otro' : terminado ? 'Empezar de nuevo' : 'Siguiente ejercicio'}
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
