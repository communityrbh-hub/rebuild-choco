/**
 * ChatScreen — conversación con Rumi
 * ==================================
 *
 * MODO CONVERSACIÓN (manos libres):
 *   Rumi habla → escucha solo → detecta que el niño terminó → responde →
 *   vuelve a escuchar. El niño no toca nada en todo el ciclo.
 *
 * DOS FUENTES DE RESPUESTA, y el niño no nota la diferencia:
 *
 *   📖 GUION FIJO (`dialogTree.js`)
 *      El arranque y los ejercicios con valor terapéutico real: respiración
 *      guiada, cuento, explicación del sismo. Texto escrito por personas,
 *      auditable por un profesional.
 *
 *   🧠 CONVERSACIÓN ABIERTA (`conversacion.js`)
 *      Todo lo demás: su perro, su casa, sus amigos, lo que se le ocurra.
 *      Gemma improvisa, con filtro de seguridad antes y después.
 *
 * ⚠️ LO QUE NUNCA PASA POR EL MODELO
 *   Señales de autolesión, violencia o abuso se detectan con reglas en
 *   `seguridad.js` y disparan derivación humana directa. El modelo ni
 *   siquiera ve ese mensaje. Ver regla #5.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Mic, MessageSquare, Volume2, Sparkles } from 'lucide-react';
import RumiAvatar from '../components/RumiAvatar';
import ChatBubble from '../components/ChatBubble';
import EmergencyButton from '../components/EmergencyButton';
import dialogTree from '../data/dialogTree';
import { resolverIntencion } from '../agent/intents';
import { enrutar } from '../agent/router';
import { conversar } from '../services/conversacion';
import { hablar, callar } from '../services/tts';
import { escuchar, sttDisponible, precargarWhisper, modoSTT, MENSAJES } from '../services/stt';

const ESTADOS = {
  rumi_habla: { etiqueta: 'Rumi está hablando', color: 'var(--primario)' },
  escuchando: { etiqueta: 'Te escucho…',        color: 'var(--alerta)' },
  pensando:   { etiqueta: 'Rumi está pensando…', color: 'var(--texto-sec)' },
  esperando:  { etiqueta: '',                    color: 'var(--texto-sec)' },
};

/** Siempre disponibles, sin importar de qué se esté hablando. */
const ATAJOS = [
  { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos',   next: 'respiracion' },
  { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento' },
  { id: 'math',     emoji: '🔢', label: 'Practicar matemáticas', action: 'go_to_math' },
];

export default function ChatScreen() {
  const navigate = useNavigate();

  // 'guion' = navegando el árbol · 'libre' = conversando con la IA
  const [modo, setModo] = useState('guion');
  const [nodoId, setNodoId] = useState('start');
  const [mensajeRumi, setMensajeRumi] = useState(dialogTree.start.message);
  const [opciones, setOpciones] = useState(dialogTree.start.options);
  const [historial, setHistorial] = useState([]);
  const [fase, setFase] = useState('esperando');
  const [conversacionVoz, setConversacionVoz] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [parcial, setParcial] = useState('');
  const [nivel, setNivel] = useState(0);
  const [progresoModelo, setProgresoModelo] = useState(null);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const [fuenteUltima, setFuenteUltima] = useState('guion');
  const [texto, setTexto] = useState('');

  const detenerRef = useRef(null);
  const intentosRef = useRef(0);
  const convRef = useRef(conversacionVoz);
  const histRef = useRef([]);
  const opcRef = useRef(opciones);
  const finRef = useRef(null);

  convRef.current = conversacionVoz;
  opcRef.current = opciones;

  const hayVoz = sttDisponible();

  useEffect(() => {
    if (modoSTT === 'local' && hayVoz) {
      precargarWhisper((p) => setProgresoModelo(p < 100 ? p : null))
        .then(() => setProgresoModelo(null))
        .catch(() => {});
    }
  }, [hayVoz]);

  useEffect(() => () => { callar(); detenerRef.current?.(); }, []);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [historial, mensajeRumi, fase]);

  /* --- Saludo inicial --- */
  useEffect(() => {
    decir(dialogTree.start.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
     Turno del niño
     ============================================================ */
  const escucharAlNino = useCallback(() => {
    if (!hayVoz || !convRef.current) { setFase('esperando'); return; }

    setParcial('');
    detenerRef.current = escuchar(
      {
        onEstado: (e) => {
          if (e === 'grabando') { setFase('escuchando'); setAviso(null); }
          else if (e === 'transcribiendo' || e === 'preparando') setFase('pensando');
        },
        onNivel: setNivel,
        onParcial: setParcial,
        onResultado: (t) => { setParcial(''); procesar(t); },
        onError: (codigo) => {
          setParcial('');
          setFase('esperando');
          intentosRef.current += 1;
          if (codigo === 'no_escuche' && intentosRef.current < 2 && convRef.current) {
            setTimeout(() => { if (convRef.current) escucharAlNino(); }, 500);
          } else {
            setAviso(MENSAJES[codigo] || MENSAJES.fallo);
            intentosRef.current = 0;
          }
        },
      },
      { auto: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayVoz]);

  /* ============================================================
     Turno de Rumi
     ============================================================ */
  const decir = useCallback((mensaje) => {
    setFase('rumi_habla');
    hablar(mensaje, {
      onEnd: () => {
        if (convRef.current && hayVoz) {
          setTimeout(() => { if (convRef.current) escucharAlNino(); }, 420);
        } else {
          setFase('esperando');
        }
      },
    });
  }, [escucharAlNino, hayVoz]);

  /** Guarda la señal emocional en el dispositivo, para el panel del docente. */
  function registrarEmocion(id) {
    const mapa = { bien_flow: '😊', regular_flow: '😐', mal_flow: '😟', muy_mal_flow: '😢' };
    if (!mapa[id]) return;
    try {
      const previo = JSON.parse(localStorage.getItem('rebuild_emociones') || '[]');
      previo.push({ fecha: new Date().toISOString(), emoji: mapa[id], nodo: id });
      localStorage.setItem('rebuild_emociones', JSON.stringify(previo.slice(-50)));
    } catch { /* no crítico */ }
  }

  function apuntarHistorial(de, textoMsg) {
    histRef.current = [...histRef.current, { de, texto: textoMsg }].slice(-12);
    setHistorial(histRef.current);
  }

  /* ---------- Ir a un nodo del guion ---------- */
  function irANodo(id) {
    const n = dialogTree[id];
    if (!n) return;
    detenerRef.current?.();
    intentosRef.current = 0;
    setModo('guion');
    setNodoId(id);
    setMensajeRumi(n.message);
    setOpciones(n.options);
    setMostrarAyuda(Boolean(n.showEmergency));
    setFuenteUltima('guion');
    apuntarHistorial('rumi', n.message);
    registrarEmocion(id);
    decir(n.message);
  }

  /* ---------- Elegir una opción (botón o intención de voz) ---------- */
  function elegir(opcion, dicho) {
    detenerRef.current?.();
    setAviso(null);
    setParcial('');
    intentosRef.current = 0;
    apuntarHistorial('nino', dicho || `${opcion.emoji || ''} ${opcion.label}`.trim());

    if (opcion.action === 'go_to_math') { callar(); navigate('/math'); return; }
    if (opcion.action === 'end_chat')   { irANodo('despedida'); return; }
    if (opcion.next) {
      if (opcion.next === nodoId && modo === 'guion') {
        // Repetir el mismo nodo (ej. "otra vez"): hay que volver a hablar.
        decir(dialogTree[opcion.next].message);
      } else {
        irANodo(opcion.next);
      }
    }
  }

  /* ============================================================
     Enrutador — decide QUIÉN responde. Es código, no un modelo.
     ============================================================

       1. INTENCIÓN   → el niño eligió una opción, hablando
       2. CRISIS      → texto fijo + derivación. El modelo ni lo ve.
       3. GUION       → tema emocional o del sismo: nodo pre-escrito
       4. LIBRE       → todo lo demás: Gemma improvisa, con filtros

     El orden es la garantía de seguridad: para que el modelo llegue a
     hablar, el mensaje tuvo que pasar antes por los tres filtros de arriba.
     ============================================================ */
  async function procesar(transcripcion) {
    const dicho = (transcripcion || '').trim();
    if (!dicho) return;

    // 1. ¿Encaja con una opción del momento o con un atajo?
    const candidatas = modo === 'guion' ? [...opcRef.current, ...ATAJOS] : ATAJOS;
    const hit = resolverIntencion(dicho, candidatas);
    if (hit) { elegir(hit.opcion, dicho); return; }

    detenerRef.current?.();
    setAviso(null);
    intentosRef.current = 0;

    const ruta = enrutar(dicho);

    // 2. Crisis: autolesión, violencia o abuso. Respuesta fija y derivación.
    //    Este mensaje nunca se le envía al modelo.
    if (ruta.via === 'crisis') {
      apuntarHistorial('nino', dicho);
      setModo('libre');
      setMensajeRumi(ruta.respuesta);
      setFuenteUltima('seguridad');
      apuntarHistorial('rumi', ruta.respuesta);
      setOpciones([
        { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion' },
        { id: 'adulto',   emoji: '🤗', label: 'Buscar a un adulto', next: 'buscar_adulto' },
      ]);
      setMostrarAyuda(true);
      decir(ruta.respuesta);
      return;
    }

    // 3. Tema emocional o del sismo: contención pre-escrita, revisable por
    //    un profesional. Medimos que un modelo de 1B se desvía justo aquí.
    if (ruta.via === 'guion') {
      apuntarHistorial('nino', dicho);
      irANodo(ruta.nodo);
      if (ruta.derivar) setMostrarAyuda(true); // gana sobre el flag del nodo
      return;
    }

    // 4. Conversación abierta. Gemma improvisa, con filtro de entrada y salida.
    apuntarHistorial('nino', dicho);
    setFase('pensando');
    setModo('libre');

    const r = await conversar(dicho, histRef.current);

    setMensajeRumi(r.texto);
    setFuenteUltima(r.fuente);
    apuntarHistorial('rumi', r.texto);
    setOpciones([...(r.sugerencias || []), ...ATAJOS].filter(
      (o, i, arr) => arr.findIndex((x) => x.id === o.id) === i
    ));
    if (r.derivar) setMostrarAyuda(true);
    decir(r.texto);
  }

  function enviarTexto(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    const t = texto;
    setTexto('');
    procesar(t);
  }

  function alternarVoz() {
    const nuevo = !conversacionVoz;
    setConversacionVoz(nuevo);
    convRef.current = nuevo;
    if (!nuevo) { detenerRef.current?.(); setFase('esperando'); setParcial(''); }
    else if (fase === 'esperando') escucharAlNino();
  }

  const nodoActual = dialogTree[nodoId];
  const estadoRumi =
    fase === 'rumi_habla' ? 'hablando'
    : fuenteUltima === 'seguridad' ? 'preocupado'
    : modo === 'guion' && nodoActual?.mood === 'happy' ? 'feliz'
    : modo === 'guion' && nodoActual?.mood === 'worried' ? 'preocupado'
    : 'idle';

  const info = ESTADOS[fase];

  return (
    <div className="pantalla" style={{ paddingBottom: 120 }}>
      <div className="fila" style={{ marginBottom: 4 }}>
        <button className="link-volver" onClick={() => { callar(); detenerRef.current?.(); navigate('/'); }}>
          <ArrowLeft size={18} /> Volver
        </button>
        <div className="espaciador" />
        {hayVoz && (
          <button
            onClick={alternarVoz}
            className="fila"
            style={{
              gap: 6, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 640, padding: '7px 13px',
              border: conversacionVoz ? '1.5px solid var(--primario)' : '1.5px solid var(--borde)',
              background: conversacionVoz ? 'var(--primario-luz)' : 'var(--superficie)',
              color: conversacionVoz ? 'var(--primario-osc)' : 'var(--texto-sec)',
              transition: 'all .15s ease',
            }}
          >
            {conversacionVoz ? <Mic size={13} /> : <MessageSquare size={13} />}
            {conversacionVoz ? 'Hablando' : 'Botones'}
          </button>
        )}
      </div>

      <div className="centro" style={{ marginBottom: 2 }}>
        <RumiAvatar estado={estadoRumi} tamano={140} />
      </div>

      {/* Indicador de turno */}
      <div className="centro" style={{ height: 34, marginBottom: 8 }}>
        {fase === 'escuchando' ? (
          <div className="fila" style={{ justifyContent: 'center', gap: 4, height: 34 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="barra-nivel"
                style={{ height: `${8 + Math.min(26, nivel * 32 * (i === 2 ? 1.5 : i === 1 || i === 3 ? 1.15 : 0.75))}px` }}
              />
            ))}
            <span style={{ marginLeft: 10, fontSize: 13.5, fontWeight: 640, color: 'var(--alerta)' }}>
              Te escucho…
            </span>
          </div>
        ) : info.etiqueta ? (
          <div className="fila" style={{ justifyContent: 'center', gap: 7, height: 34 }}>
            {fase === 'rumi_habla' && <Volume2 size={15} color={info.color} />}
            {fase === 'pensando' && <span className="cargando" style={{ width: 14, height: 14 }} />}
            <span style={{ fontSize: 13.5, fontWeight: 620, color: info.color }}>{info.etiqueta}</span>
          </div>
        ) : null}
      </div>

      {historial.slice(-3, -1).map((m, i) => (
        <ChatBubble key={i} texto={m.texto} de={m.de} historial />
      ))}

      <ChatBubble texto={mensajeRumi} />

      {parcial && <ChatBubble texto={parcial} de="nino" historial />}

      {mostrarAyuda && (
        <div className="tarjeta" style={{ background: 'var(--alerta-luz)', border: '1.5px solid var(--alerta)', marginBottom: 15 }}>
          <strong style={{ fontSize: 15 }}>Hablar con una persona ayuda mucho</strong>
          <p className="sec" style={{ marginTop: 6, marginBottom: 0 }}>
            Toca el botón naranja de abajo para ver las líneas de ayuda, o busca a
            un adulto de confianza.
          </p>
        </div>
      )}

      {progresoModelo !== null && (
        <div className="sec centro" style={{ marginBottom: 12 }}>
          Preparando el oído de Rumi… {progresoModelo}%
        </div>
      )}

      {aviso && (
        <div
          className="sec"
          style={{ background: 'var(--primario-luz)', border: '1px solid rgba(244,162,97,.4)', borderRadius: 12, padding: '11px 14px', marginBottom: 12, color: 'var(--primario-osc)', fontWeight: 540 }}
        >
          {aviso}
        </div>
      )}

      <div style={{ marginTop: 4 }}>
        {conversacionVoz && hayVoz && (
          <p className="sec centro" style={{ fontSize: 12, marginBottom: 10 }}>
            Cuéntale lo que quieras, o toca una opción
          </p>
        )}
        {opciones.map((op) => (
          <button key={op.id} className="btn-opcion" onClick={() => elegir(op)}>
            {op.emoji && <span className="emoji">{op.emoji}</span>}
            <span>{op.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={enviarTexto} className="fila" style={{ marginTop: 12 }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="O escribe lo que quieras…"
          className="entrada"
          style={{ flex: 1, height: 46 }}
        />
        <button
          type="submit"
          aria-label="Enviar"
          style={{ width: 46, height: 46, borderRadius: 12, border: 'none', background: 'linear-gradient(150deg,#F8B173,var(--primario))', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--sombra-pri)' }}
        >
          <Send size={19} />
        </button>
      </form>

      {/* Transparencia: de dónde salió lo último que dijo Rumi */}
      <p className="sec centro" style={{ fontSize: 11, marginTop: 12, marginBottom: 0, opacity: .75 }}>
        {fuenteUltima === 'guion'      && '📖 Respuesta de guion escrito por personas'}
        {fuenteUltima === 'ia'         && <><Sparkles size={10} style={{ verticalAlign: -1 }} /> Respuesta generada por Gemma, con filtro de seguridad</>}
        {fuenteUltima === 'seguridad'  && '🛡️ Respuesta de seguridad — derivación a una persona'}
        {fuenteUltima === 'respaldo'   && '📖 Respuesta de respaldo'}
      </p>

      <div ref={finRef} />
      <EmergencyButton />
    </div>
  );
}
