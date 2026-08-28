/**
 * ChatScreen — conversación con Rumi
 * ==================================
 *
 * MODO CONVERSACIÓN (manos libres, el que importa):
 *   Rumi habla → el turno pasa al niño → habla cuando quiera → Rumi responde
 *   → y otra vez. El niño no toca nada en todo el ciclo, y el ciclo **no
 *   termina nunca** hasta que se sale de la pantalla.
 *
 *   Eso último es una corrección, no un detalle de diseño: la versión anterior
 *   dejaba de escuchar tras dos silencios seguidos y mostraba un aviso. Un
 *   niño de seis años se queda callado seis segundos sin ningún esfuerzo, así
 *   que en la práctica la conversación se moría enseguida y solo quedaban los
 *   botones. Ahora el micrófono sigue abierto y esperando indefinidamente.
 *
 * LOS BOTONES SON LA RED, NO EL CAMINO.
 *   En modo voz se muestran pequeños y en una fila: están para el niño que no
 *   quiere hablar, o para cuando el micrófono no existe. Si ocupan la pantalla
 *   entera, la app se lee como un menú y nadie intenta hablarle.
 *
 * CUATRO VÍAS, y el modelo solo alcanza la cuarta — ver `agent/router.js`.
 * Lo que dice el niño por voz pasa exactamente por los mismos filtros que lo
 * que escribe. Hablar no es un canal privilegiado.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Mic, MicOff, Volume2, Sparkles, Keyboard } from 'lucide-react';
import RumiAvatar from '../components/RumiAvatar';
import ChatBubble from '../components/ChatBubble';
import EmergencyButton from '../components/EmergencyButton';
import dialogTree from '../data/dialogTree';
import { resolverIntencion } from '../agent/intents';
import { enrutar } from '../agent/router';
import { conversar, calentarModelo } from '../services/conversacion';
import { hablar, callar } from '../services/tts';
import { crearSesionEscucha, sttDisponible, precargarWhisper, modoSTT, MENSAJES } from '../services/stt';

/** Siempre disponibles, sin importar de qué se esté hablando. */
const ATAJOS = [
  { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos',       next: 'respiracion' },
  { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento',    next: 'cuento' },
  { id: 'math',     emoji: '🔢', label: 'Practicar matemáticas', action: 'go_to_math' },
];

export default function ChatScreen() {
  const navigate = useNavigate();

  const [modo, setModo] = useState('guion');       // 'guion' | 'libre'
  const [nodoId, setNodoId] = useState('start');
  const [mensajeRumi, setMensajeRumi] = useState(dialogTree.start.message);
  const [opciones, setOpciones] = useState(dialogTree.start.options);
  const [historial, setHistorial] = useState([]);
  const [fase, setFase] = useState('esperando');   // rumi_habla | escuchando | pensando | esperando
  const [vozActiva, setVozActiva] = useState(true);
  const [mostrarTeclado, setMostrarTeclado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [parcial, setParcial] = useState('');
  const [nivel, setNivel] = useState(0);
  const [progresoModelo, setProgresoModelo] = useState(null);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const [fuenteUltima, setFuenteUltima] = useState('guion');
  const [texto, setTexto] = useState('');

  const sesionRef = useRef(null);
  const vozRef = useRef(true);
  const histRef = useRef([]);
  const opcRef = useRef(opciones);
  const modoRef = useRef(modo);
  const nodoRef = useRef(nodoId);
  const ocupadoRef = useRef(false); // Rumi habla o piensa: lo que llegue se ignora
  const respaldoRef = useRef(null); // por si el navegador no avisa de que terminó de hablar
  const finRef = useRef(null);

  vozRef.current = vozActiva;
  opcRef.current = opciones;
  modoRef.current = modo;
  nodoRef.current = nodoId;

  const hayVoz = sttDisponible();

  /* ============================================================
     La sesión de escucha se crea UNA vez y vive toda la pantalla
     ============================================================ */
  useEffect(() => {
    if (!hayVoz) return undefined;

    if (modoSTT === 'local') {
      precargarWhisper((p) => setProgresoModelo(p < 100 ? p : null));
    }

    sesionRef.current = crearSesionEscucha({
      onNivel: setNivel,
      onParcial: setParcial,
      onEstado: (e) => {
        if (ocupadoRef.current) return;
        if (e === 'escuchando') setFase('escuchando');
        else if (e === 'transcribiendo') setFase('pensando');
      },
      onResultado: (t) => {
        // Llegó mientras Rumi hablaba: es eco o impaciencia, no un turno.
        if (ocupadoRef.current || !vozRef.current) return;
        setParcial('');
        procesar(t);
      },
      onAviso: (codigo) => {
        setAviso(MENSAJES[codigo] || MENSAJES.fallo);
        setVozActiva(false);
        vozRef.current = false;
        setMostrarTeclado(true);
      },
    });

    return () => sesionRef.current?.cerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayVoz]);

  useEffect(() => () => { callar(); clearTimeout(respaldoRef.current); sesionRef.current?.cerrar(); }, []);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [mensajeRumi, fase]);

  /* --- Saludo inicial. Mientras Rumi saluda, el modelo se va calentando --- */
  useEffect(() => {
    calentarModelo();
    decir(dialogTree.start.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
     Los dos turnos
     ============================================================ */

  /** Cede el turno al niño. Si no puede escuchar, al menos no miente. */
  const cederTurno = useCallback(() => {
    ocupadoRef.current = false;
    if (vozRef.current && hayVoz && sesionRef.current) {
      sesionRef.current.escuchar();
      setFase('escuchando');
    } else {
      setFase('esperando');
    }
  }, [hayVoz]);

  /** Turno de Rumi: mientras habla, no se le atiende al niño (evita el eco). */
  const decir = useCallback((mensaje) => {
    ocupadoRef.current = true;
    sesionRef.current?.pausar();
    setNivel(0);
    setFase('rumi_habla');

    hablar(mensaje, {
      // Sin `onEnd` no habría ciclo: cada vez que Rumi calla, el turno vuelve
      // al niño automáticamente. Es lo único que hace que esto sea una
      // conversación y no un intercambio de formularios.
      onEnd: () => setTimeout(cederTurno, 260),
    });

    // Red de seguridad: si el navegador nunca dispara `onEnd` —pasa cuando la
    // pestaña pierde el foco a mitad de frase— la conversación no se queda
    // colgada esperando para siempre.
    clearTimeout(respaldoRef.current);
    respaldoRef.current = setTimeout(
      () => { if (ocupadoRef.current) cederTurno(); },
      2500 + mensaje.length * 90,
    );
  }, [cederTurno]);

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
    setAviso(null);
    setParcial('');
    apuntarHistorial('nino', dicho || `${opcion.emoji || ''} ${opcion.label}`.trim());

    if (opcion.action === 'go_to_math') { callar(); navigate('/math'); return; }
    if (opcion.action === 'end_chat')   { irANodo('despedida'); return; }
    if (opcion.next) {
      if (opcion.next === nodoRef.current && modoRef.current === 'guion') decir(dialogTree[opcion.next].message);
      else irANodo(opcion.next);
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

    ocupadoRef.current = true;
    sesionRef.current?.pausar();
    setAviso(null);
    setParcial('');

    // 1. ¿Encaja con una opción del momento o con un atajo?
    const candidatas = modoRef.current === 'guion' ? [...opcRef.current, ...ATAJOS] : ATAJOS;
    const hit = resolverIntencion(dicho, candidatas);
    if (hit) { elegir(hit.opcion, dicho); return; }

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
    const nuevo = !vozActiva;
    setVozActiva(nuevo);
    vozRef.current = nuevo;
    setAviso(null);
    if (nuevo) { setMostrarTeclado(false); if (!ocupadoRef.current) cederTurno(); }
    else { sesionRef.current?.pausar(); setNivel(0); setParcial(''); setFase('esperando'); setMostrarTeclado(true); }
  }

  const nodoActual = dialogTree[nodoId];
  const estadoRumi =
    fase === 'rumi_habla' ? 'hablando'
    : fuenteUltima === 'seguridad' ? 'preocupado'
    : modo === 'guion' && nodoActual?.mood === 'happy' ? 'feliz'
    : modo === 'guion' && nodoActual?.mood === 'worried' ? 'preocupado'
    : 'idle';

  const enVoz = vozActiva && hayVoz;

  return (
    <div className="pantalla" style={{ paddingBottom: 110 }}>
      <div className="fila" style={{ marginBottom: 2 }}>
        <button className="link-volver" onClick={() => { callar(); sesionRef.current?.cerrar(); navigate('/'); }}>
          <ArrowLeft size={18} /> Volver
        </button>
        <div className="espaciador" />
        {hayVoz && (
          <button onClick={alternarVoz} className={`pastilla-voz ${enVoz ? 'activa' : ''}`}>
            {enVoz ? <Mic size={13} /> : <MicOff size={13} />}
            {enVoz ? 'Micrófono encendido' : 'Micrófono apagado'}
          </button>
        )}
      </div>

      <div className="centro" style={{ marginBottom: 2 }}>
        <RumiAvatar estado={estadoRumi} tamano={132} />
      </div>

      {/* ---- El turno, siempre visible: es lo que hace legible la conversación ---- */}
      <div className="centro turno">
        {fase === 'escuchando' && (
          <div className="fila turno-escuchando">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="barra-nivel"
                style={{ height: `${9 + Math.min(30, nivel * 34 * (i === 2 ? 1.5 : i === 1 || i === 3 ? 1.15 : 0.75))}px` }}
              />
            ))}
            <span className="turno-texto" style={{ color: 'var(--alerta)' }}>Te escucho…</span>
          </div>
        )}
        {fase === 'rumi_habla' && (
          <div className="fila turno-escuchando">
            <Volume2 size={15} color="var(--primario)" />
            <span className="turno-texto" style={{ color: 'var(--primario)' }}>Rumi está hablando</span>
          </div>
        )}
        {fase === 'pensando' && (
          <div className="fila turno-escuchando">
            <span className="cargando" style={{ width: 14, height: 14 }} />
            <span className="turno-texto" style={{ color: 'var(--texto-sec)' }}>Rumi está pensando…</span>
          </div>
        )}
        {fase === 'esperando' && !enVoz && (
          <span className="turno-texto" style={{ color: 'var(--texto-sec)' }}>Toca una opción o escríbele</span>
        )}
      </div>

      {historial.slice(-3, -1).map((m, i) => (
        <ChatBubble key={i} texto={m.texto} de={m.de} historial />
      ))}

      <ChatBubble texto={mensajeRumi} />

      {parcial && <ChatBubble texto={parcial} de="nino" historial />}

      {mostrarAyuda && (
        <div className="tarjeta" style={{ background: 'var(--alerta-luz)', border: '1.5px solid var(--alerta)', marginBottom: 14 }}>
          <strong style={{ fontSize: 15 }}>Hablar con una persona ayuda mucho</strong>
          <p className="sec" style={{ marginTop: 6, marginBottom: 0 }}>
            Toca el botón naranja de abajo para ver las líneas de ayuda, o busca a
            un adulto de confianza.
          </p>
        </div>
      )}

      {progresoModelo !== null && (
        <div className="sec centro" style={{ marginBottom: 10 }}>
          Preparando el oído de Rumi… {progresoModelo}%
        </div>
      )}

      {aviso && <div className="aviso-suave">{aviso}</div>}

      {/* ---- Las opciones: chips discretos con voz, botones grandes sin ella ---- */}
      {enVoz ? (
        <>
          <p className="sec centro invitacion">Háblale a Rumi cuando quieras</p>
          <div className="chips">
            {opciones.map((op) => (
              <button key={op.id} className="chip" onClick={() => elegir(op)}>
                {op.emoji && <span>{op.emoji}</span>}
                <span>{op.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 4 }}>
          {opciones.map((op) => (
            <button key={op.id} className="btn-opcion" onClick={() => elegir(op)}>
              {op.emoji && <span className="emoji">{op.emoji}</span>}
              <span>{op.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* El teclado existe para quien ya escribe, pero no se le pone delante a
          quien todavía no. En modo voz vive detrás de un enlace pequeño. */}
      {mostrarTeclado || !enVoz ? (
        <form onSubmit={enviarTexto} className="fila" style={{ marginTop: 12 }}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escríbele a Rumi…"
            className="entrada"
            style={{ flex: 1, height: 46 }}
            autoFocus={mostrarTeclado}
          />
          <button type="submit" aria-label="Enviar" className="btn-enviar">
            <Send size={19} />
          </button>
        </form>
      ) : (
        <button className="enlace-teclado" onClick={() => setMostrarTeclado(true)}>
          <Keyboard size={13} /> Prefiero escribir
        </button>
      )}

      {/* Transparencia: de dónde salió lo último que dijo Rumi */}
      <p className="sec centro pie-fuente">
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
