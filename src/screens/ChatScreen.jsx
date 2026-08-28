/**
 * ChatScreen — la conversación con Rumi
 * =====================================
 *
 * NO ES UN CHAT CON UN BOTÓN DE MICRÓFONO. Es un modo de voz: el niño entra,
 * habla, y Rumi le contesta hablando. No hay nada que tocar en todo el ciclo,
 * y el ciclo no termina hasta que se sale de la pantalla.
 *
 * LAS TRES COSAS QUE HACEN QUE SE SIENTA UNA CONVERSACIÓN
 * -------------------------------------------------------
 *
 *  1. SE LE PUEDE INTERRUMPIR. El micrófono sigue abierto mientras Rumi
 *     habla (`sesion.vigilar()`). Si el niño le habla encima, Rumi calla a
 *     media frase, aborta la generación y escucha. Antes había que esperar a
 *     que el osito terminara su turno: eso es un walkie-talkie, no una
 *     charla, y era lo que hacía que la app se sintiera una máquina.
 *
 *  2. EMPIEZA A HABLAR ANTES DE HABER TERMINADO DE PENSAR. La respuesta del
 *     modelo llega por streaming y se habla frase a frase (`crearLocutor`).
 *     El tiempo hasta el primer sonido deja de depender de lo larga que sea
 *     la respuesta ni de lo lento que vaya el modelo en esta CPU.
 *
 *  3. RELLENA EL HUECO CON LA VOZ, NO CON UN SPINNER. Si la primera frase
 *     tarda más de lo que dura un silencio cómodo, Rumi dice "mmm, a ver",
 *     que es exactamente lo que hace una persona mientras piensa. Un
 *     "Rumi está pensando…" en pantalla no lo lee un niño de seis años.
 *
 * LOS BOTONES SON LA RED, NO EL CAMINO.
 *   En modo voz no hay menú: hay un osito, lo que se está diciendo, y nada
 *   más. Las sugerencias solo aparecen si el niño lleva un rato callado, y
 *   el modo de botones completo está detrás de un enlace pequeño, para quien
 *   no puede o no quiere hablar.
 *
 * CUATRO VÍAS, y el modelo solo alcanza la cuarta — ver `agent/router.js`.
 * Lo que dice el niño por voz pasa exactamente por los mismos filtros que lo
 * que escribe. Hablar no es un canal privilegiado.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Mic, MicOff, Sparkles, X } from 'lucide-react';
import RumiAvatar from '../components/RumiAvatar';
import ChatBubble from '../components/ChatBubble';
import EmergencyButton from '../components/EmergencyButton';
import dialogTree from '../data/dialogTree';
import { resolverIntencion } from '../agent/intents';
import { enrutar } from '../agent/router';
import { conversarStream, calentarModelo } from '../services/conversacion';
import { crearLocutor, callar } from '../services/tts';
import {
  crearSesionEscucha, sttDisponible, precargarWhisper, modoSTT, pareceEco, MENSAJES,
} from '../services/stt';

/** Siempre disponibles, sin importar de qué se esté hablando. */
/*
 * Atajos que valen en cualquier momento de la conversación, también cuando
 * está improvisando. Sin ellos, "hagamos cuentas" solo funcionaba si el nodo
 * del guion casualmente ofrecía matemáticas, y el niño acababa teniendo que
 * buscar la frase exacta: un menú invisible, que es peor que un menú.
 */
const ATAJOS = [
  { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos',       next: 'respiracion',
    keywords: ['respirar', 'respiracion', 'calmarme', 'calma'] },
  { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento',    next: 'cuento',
    keywords: ['cuento', 'historia', 'cuentame algo'] },
  { id: 'math',     emoji: '🔢', label: 'Practicar matemáticas', action: 'go_to_math',
    keywords: ['matematicas', 'cuentas', 'numeros', 'sumar', 'sumas', 'restar', 'restas',
               'multiplicar', 'tablas', 'ejercicios', 'aprender', 'estudiar'] },
];

/*
 * Lo que dice una persona mientras piensa.
 *
 * No es decoración: es la diferencia entre un silencio de dos segundos —que
 * un niño lee como "no me oyó"— y una pausa normal de conversación. Se dice
 * solo si la primera frase de verdad se está demorando, y nunca entra al
 * historial: no es parte de lo que Rumi respondió.
 */
const RELLENOS = ['Mmm. ', 'A ver. ', 'Ah, ya. ', 'Mmm, a ver. ', 'Espera. ', 'Ajá. '];
const ESPERA_RELLENO = 950;

/** Tras este rato callado, se le enseñan al niño cosas que puede decir. */
const ESPERA_SUGERENCIAS = 7000;

/*
 * Nunca dos veces seguidas el mismo.
 *
 * Con cuatro frases al azar y un modelo que casi siempre tarda lo justo para
 * disparar el relleno, repetir "mmm, a ver" dos turnos seguidos delata la
 * costura: deja de sonar a que está pensando y pasa a sonar a que es una
 * grabación. Es el mismo problema del que veníamos, en pequeño.
 */
let ultimoRelleno = '';
function relleno() {
  const otros = RELLENOS.filter((r) => r !== ultimoRelleno);
  ultimoRelleno = otros[Math.floor(Math.random() * otros.length)];
  return ultimoRelleno;
}

export default function ChatScreen() {
  const navigate = useNavigate();

  const [vista, setVista] = useState('voz');       // 'voz' | 'botones'
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
  /*
   * Lo último que Rumi entendió.
   *
   * Offline no hay transcripción en vivo —Whisper trabaja por frases enteras,
   * no palabra a palabra—, así que sin esto el niño (y quien esté probando la
   * app) no tiene forma de distinguir "no me oyó" de "me oyó mal". Mostrarlo
   * convierte un fallo mudo en algo que se puede ver y corregir.
   */
  const [oido, setOido] = useState('');
  const [nivel, setNivel] = useState(0);
  const [progresoModelo, setProgresoModelo] = useState(null);
  /*
   * ¿Puede oír ya?
   *
   * Offline hay que descargar el modelo antes de la primera frase. Mientras
   * tanto la app NO puede aceptar turnos: aceptarlos era el fallo reportado
   * —"me saluda, le hablo, sale un porcentaje y no recibo respuesta"—, porque
   * la frase se quedaba esperando a un modelo que aún no existía y el turno
   * no volvía nunca. Online no aplica: el oído es el del navegador.
   */
  const [oidoListo, setOidoListo] = useState(modoSTT !== 'local');
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const [sugerir, setSugerir] = useState(false);
  const [fuenteUltima, setFuenteUltima] = useState('guion');
  const [texto, setTexto] = useState('');

  const sesionRef = useRef(null);
  const locutorRef = useRef(null);   // la boca del turno actual
  const abortoRef = useRef(null);    // corta la generación si lo interrumpen
  const ecoRef = useRef({ texto: '', ts: 0 }); // lo último que dijo Rumi, para descartar su eco
  const locutorEsperandoRef = useRef(null);   // la boca abierta mientras el oído transcribe
  const rellenoRef = useRef(null);
  const sugerenciaRef = useRef(null);
  const vozRef = useRef(true);
  const histRef = useRef([]);
  const opcRef = useRef(opciones);
  const modoRef = useRef(modo);
  const nodoRef = useRef(nodoId);
  const turnoRef = useRef('nadie');  // 'rumi' | 'nino' | 'nadie'
  const oidoListoRef = useRef(modoSTT !== 'local');
  const finRef = useRef(null);

  vozRef.current = vozActiva;
  opcRef.current = opciones;
  modoRef.current = modo;
  nodoRef.current = nodoId;

  const hayVoz = sttDisponible();
  const enVoz = vozActiva && hayVoz;

  /* ============================================================
     Turno del niño
     ============================================================ */

  const cederTurno = useCallback(() => {
    turnoRef.current = 'nino';
    // El micrófono no se abre hasta que haya con qué entender lo que entre.
    if (vozRef.current && hayVoz && oidoListoRef.current && sesionRef.current) {
      sesionRef.current.escuchar();
      setFase('escuchando');
    } else {
      setFase('esperando');
    }
  }, [hayVoz]);

  /* ============================================================
     Turno de Rumi — una boca por turno, que se puede callar
     ============================================================ */

  /** Deja constancia de lo que Rumi acaba de decir, para reconocer su eco. */
  const recordarEco = useCallback(() => {
    const dicho = locutorRef.current?.loQueVaDiciendo();
    if (dicho) ecoRef.current = { texto: dicho, ts: Date.now() };
  }, []);

  /**
   * Abre la boca de Rumi y deja el oído VIGILANDO, no apagado.
   * Devuelve el locutor: se le va dando texto y él lo va hablando.
   */
  const abrirBoca = useCallback(() => {
    recordarEco();
    locutorRef.current?.cortar();
    clearTimeout(rellenoRef.current);
    clearTimeout(sugerenciaRef.current);
    setSugerir(false);
    setParcial('');
    setNivel(0);
    setMensajeRumi('');

    turnoRef.current = 'rumi';
    sesionRef.current?.vigilar();

    const loc = crearLocutor({
      // El texto aparece cuando SUENA, no cuando se genera: si el subtítulo
      // corre por delante de la voz, el niño lee una frase que todavía no ha
      // oído y se rompe la ilusión de que alguien le está hablando.
      onInicio: () => setFase('rumi_habla'),
      onFrase: (f) => setMensajeRumi((prev) => (prev ? `${prev} ${f}` : f)),
      onFin: () => {
        recordarEco();
        if (turnoRef.current === 'rumi') cederTurno();
      },
    });

    locutorRef.current = loc;
    return loc;
  }, [cederTurno, recordarEco]);

  /**
   * La boca del turno, reutilizando la que ya está diciendo "mmm".
   *
   * Si el relleno ya está sonando, abrir una boca nueva lo cortaría a media
   * palabra —"mm—" y silencio—, que suena peor que no haberlo dicho. La
   * respuesta se encola detrás del relleno en el mismo locutor.
   */
  const tomarLocutor = useCallback(() => {
    const esperando = locutorEsperandoRef.current;
    locutorEsperandoRef.current = null;
    if (esperando && locutorRef.current === esperando) return esperando;
    return abrirBoca();
  }, [abrirBoca]);

  /** Turno de Rumi con un texto ya escrito (guion, crisis, despedida). */
  const decir = useCallback((mensaje) => {
    const loc = tomarLocutor();
    loc.decir(mensaje);
    loc.cerrar();
  }, [tomarLocutor]);

  /**
   * El niño habló encima de Rumi. Se le calla, se aborta lo que estuviera
   * generando y se le devuelve el turno en el acto.
   *
   * No se pide confirmación ni se espera al final de la frase: una persona a
   * la que interrumpen deja de hablar, no termina la oración.
   */
  const interrumpir = useCallback(() => {
    if (turnoRef.current !== 'rumi') return;
    clearTimeout(rellenoRef.current);
    recordarEco();
    locutorRef.current?.cortar();
    locutorRef.current = null;
    abortoRef.current?.abort();
    abortoRef.current = null;
    cederTurno();
  }, [cederTurno, recordarEco]);

  /* ============================================================
     La sesión de escucha se crea UNA vez y vive toda la pantalla
     ============================================================ */
  useEffect(() => {
    if (!hayVoz) return undefined;

    if (modoSTT === 'local') {
      precargarWhisper(
        (p) => setProgresoModelo(p < 100 ? p : null),
        () => {
          setProgresoModelo(null);
          setOidoListo(true);
          oidoListoRef.current = true;
          // Se le dice en voz alta, que es como se entera un niño de seis
          // años de que ya puede hablar. Solo si no está pasando otra cosa.
          if (turnoRef.current !== 'rumi') decir('¡Listo! Ya te escucho. Cuéntame.');
        },
      );
    }

    const sesion = crearSesionEscucha({
      onNivel: setNivel,
      onParcial: setParcial,
      onEstado: (e) => {
        if (e === 'escuchando') {
          if (turnoRef.current === 'nino') setFase('escuchando');
          return;
        }

        /*
         * El niño acaba de callarse y empieza el trabajo lento.
         *
         * Offline, entre que termina de hablar y Rumi tiene algo que decir
         * pasan varios segundos: el oído tarda unos tres en entender la frase
         * y el modelo otro más en responderla. Ese hueco, en silencio, es
         * exactamente lo que se vive como "no me contesta" — daba igual lo
         * bien que funcionara todo lo demás.
         *
         * Así que la boca se abre AQUÍ, antes de saber qué dijo: Rumi suelta
         * un "mmm" a los pocos cientos de milisegundos, como haría cualquiera
         * mientras piensa, y la respuesta de verdad se encola detrás cuando
         * llegue. La espera no se acorta; deja de ser un silencio.
         */
        /*
         * Hubo voz, pero no salió texto. Rumi ya tiene la boca abierta
         * esperando qué decir, así que hay que cerrarla — y decir algo, que
         * es lo que haría cualquiera al no entender. Quedarse callado aquí es
         * el fallo que se ve igual que un micrófono roto.
         */
        if (e === 'sin_texto') {
          const abierta = locutorEsperandoRef.current;
          locutorEsperandoRef.current = null;
          clearTimeout(rellenoRef.current);
          if (abierta && locutorRef.current === abierta) {
            abierta.decir('No te escuché bien. ¿Me lo dices otra vez? ');
            abierta.cerrar();
          } else if (turnoRef.current !== 'rumi') {
            cederTurno();
          }
          return;
        }

        if (e === 'transcribiendo' && turnoRef.current === 'nino') {
          setFase('pensando');
          const loc = abrirBoca();
          locutorEsperandoRef.current = loc;
          clearTimeout(rellenoRef.current);
          rellenoRef.current = setTimeout(() => {
            if (locutorRef.current === loc && !loc.loQueVaDiciendo()) loc.decir(relleno());
          }, ESPERA_RELLENO);
        }
      },
      onInterrupcion: () => interrumpir(),
      // Para el filtro de eco de la sesión online: qué lleva dicho Rumi.
      textoDeRumi: () => locutorRef.current?.loQueVaDiciendo() || '',
      onResultado: (t) => {
        if (!vozRef.current) return;

        /*
         * Segunda red contra el eco, y hace falta que sea independiente de la
         * primera: offline, Whisper tarda segundos en devolver el texto, así
         * que cuando llega, Rumi ya se calló y preguntar "¿está hablando?" da
         * que no. Se compara contra lo último que dijo, con ventana de
         * tiempo. Sin esto, su propia voz transcrita entraba en la
         * conversación como si la hubiera dicho el niño.
         */
        const enVivo = locutorRef.current?.hablando()
          && pareceEco(t, locutorRef.current.loQueVaDiciendo());
        const reciente = Date.now() - ecoRef.current.ts < 6000
          && pareceEco(t, ecoRef.current.texto);
        if (enVivo || reciente) return;

        setParcial('');
        procesar(t);
      },
      onAviso: (codigo) => {
        setAviso(MENSAJES[codigo] || MENSAJES.fallo);
        setVozActiva(false);
        vozRef.current = false;
        setVista('botones');
        setMostrarTeclado(true);
      },
    });

    sesionRef.current = sesion;

    // Se cierra ESTA sesión, no la que haya en la ref: en desarrollo React
    // monta el efecto dos veces, y cerrar `sesionRef.current` apagaba el
    // micrófono recién abierto por el segundo montaje. Se veía como dos
    // micrófonos abiertos a la vez en la traza, cada uno oyendo al otro.
    return () => sesion.cerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayVoz]);

  useEffect(() => () => {
    locutorRef.current?.cortar();
    callar();
    abortoRef.current?.abort();
    clearTimeout(rellenoRef.current);
    clearTimeout(sugerenciaRef.current);
    sesionRef.current?.cerrar();
  }, []);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [mensajeRumi, fase]);

  /* --- Silencio largo del niño: recién ahí se le sugiere qué decir --- */
  useEffect(() => {
    clearTimeout(sugerenciaRef.current);
    if (fase !== 'escuchando') { setSugerir(false); return undefined; }
    sugerenciaRef.current = setTimeout(() => setSugerir(true), ESPERA_SUGERENCIAS);
    return () => clearTimeout(sugerenciaRef.current);
  }, [fase, mensajeRumi]);

  /* --- Saludo inicial. Mientras Rumi saluda, el modelo se va calentando --- */
  useEffect(() => {
    calentarModelo();
    decir(dialogTree.start.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (opcion.action === 'go_to_math') { locutorRef.current?.cortar(); callar(); navigate('/math'); return; }
    if (opcion.action === 'end_chat')   { irANodo('despedida'); return; }
    if (opcion.next) {
      if (opcion.next === nodoRef.current && modoRef.current === 'guion') {
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
    setOido(dicho);

    /*
     * Si Rumi estaba hablando o generando, lo que el niño acaba de decir
     * manda: se le calla y se descarta la respuesta a medio hacer.
     *
     * Excepto si lo que está sonando es el "mmm" que él mismo soltó al oír
     * que el niño terminaba: eso no es una respuesta vieja, es el principio
     * de ESTA. Cortarlo sería cortarse a sí mismo a media palabra.
     */
    if (locutorRef.current !== locutorEsperandoRef.current) {
      recordarEco();
      locutorRef.current?.cortar();
      locutorEsperandoRef.current = null;
    }
    abortoRef.current?.abort();
    abortoRef.current = null;

    turnoRef.current = 'rumi';
    sesionRef.current?.vigilar();
    setAviso(null);
    setParcial('');
    setSugerir(false);

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

    /* --- 4. Conversación abierta, hablada mientras se escribe --- */
    apuntarHistorial('nino', dicho);
    setFase('pensando');
    setModo('libre');

    const loc = tomarLocutor();
    const aborto = new AbortController();
    abortoRef.current = aborto;

    // El hueco de pensar se llena con voz, no con un spinner. Si el oído ya
    // hizo sonar un "mmm" mientras transcribía, no se dice otro.
    let sono = Boolean(loc.loQueVaDiciendo());
    clearTimeout(rellenoRef.current);
    rellenoRef.current = setTimeout(() => {
      if (!sono && locutorRef.current === loc) loc.decir(relleno());
    }, ESPERA_RELLENO);

    const r = await conversarStream(dicho, histRef.current, {
      señal: aborto.signal,
      onFrase: (f) => {
        if (locutorRef.current !== loc) return; // lo interrumpieron: ya no habla
        sono = true;
        clearTimeout(rellenoRef.current);
        loc.decir(f);
      },
    });

    clearTimeout(rellenoRef.current);
    if (locutorRef.current !== loc) return;     // el turno ya es de otro
    abortoRef.current = null;

    loc.cerrar();
    setFuenteUltima(r.fuente);
    apuntarHistorial('rumi', r.texto);
    setOpciones([...(r.sugerencias || []), ...ATAJOS].filter(
      (o, i, arr) => arr.findIndex((x) => x.id === o.id) === i
    ));
    if (r.derivar) setMostrarAyuda(true);
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
    if (nuevo) {
      if (turnoRef.current !== 'rumi') cederTurno();
    } else {
      sesionRef.current?.pausar();
      setNivel(0);
      setParcial('');
      setVista('botones');
      setMostrarTeclado(true);
      if (turnoRef.current !== 'rumi') setFase('esperando');
    }
  }

  function salir() {
    locutorRef.current?.cortar();
    callar();
    abortoRef.current?.abort();
    sesionRef.current?.cerrar();
    navigate('/');
  }

  const nodoActual = dialogTree[nodoId];
  const estadoRumi =
    fase === 'rumi_habla' ? 'hablando'
    : fuenteUltima === 'seguridad' ? 'preocupado'
    : modo === 'guion' && nodoActual?.mood === 'happy' ? 'feliz'
    : modo === 'guion' && nodoActual?.mood === 'worried' ? 'preocupado'
    : 'idle';

  const pie = (
    <p className="sec centro pie-fuente">
      {fuenteUltima === 'guion'      && '📖 Respuesta de guion escrito por personas'}
      {fuenteUltima === 'ia'         && <><Sparkles size={10} style={{ verticalAlign: -1 }} /> Respuesta generada por IA, con filtro de seguridad</>}
      {fuenteUltima === 'seguridad'  && '🛡️ Respuesta de seguridad — derivación a una persona'}
      {fuenteUltima === 'respaldo'   && '📖 Respuesta de respaldo'}
    </p>
  );

  /* ============================================================
     MODO VOZ — el osito, lo que se está diciendo, y nada más
     ============================================================ */
  if (vista === 'voz' && enVoz) {
    const halo = 1 + Math.min(0.35, nivel * 0.4);

    return (
      <div className="escena-voz">
        <div className="fila escena-arriba">
          <button className="link-volver" onClick={salir}>
            <ArrowLeft size={18} /> Volver
          </button>
          <div className="espaciador" />
          <span className={`pastilla-estado ${fase}`}>
            {fase === 'escuchando' ? 'Te escucho'
              : fase === 'rumi_habla' ? 'Rumi habla'
              : fase === 'pensando' ? 'Rumi piensa'
              : 'Listo'}
          </span>
        </div>

        {/* --- Rumi, con un halo que respira al ritmo de la voz del niño --- */}
        <div className="escena-centro">
          <div className="halo-wrap">
            <span
              className={`halo ${fase === 'escuchando' ? 'halo-escucha' : ''}`}
              style={{ transform: `scale(${halo})` }}
            />
            <RumiAvatar estado={estadoRumi} tamano={190} />
          </div>

          {/* Lo que Rumi está diciendo, apareciendo al ritmo en que suena */}
          <p className="subtitulo">{mensajeRumi || '…'}</p>

          {/* Lo que el niño está diciendo, o lo último que Rumi le entendió */}
          {(parcial || oido) && (
            <p className="subtitulo-nino">
              {parcial || `“${oido}”`}
            </p>
          )}

          {fase === 'escuchando' && (
            <div className="fila ondas">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="barra-nivel"
                  style={{ height: `${9 + Math.min(34, nivel * 38 * (i === 2 ? 1.5 : i === 1 || i === 3 ? 1.15 : 0.75))}px` }}
                />
              ))}
            </div>
          )}

          {/* Solo si lleva un rato callado: qué le puede decir a Rumi */}
          {sugerir && (
            /* Se muestran, no se tocan. Un chip que se puede pulsar convierte
               la conversación en un menú: el niño deja de hablar y empieza a
               escoger. Aquí son un ejemplo de qué DECIR, y nada más. */
            <div className="sugerencias-voz">
              <span className="sec">Puedes decirle:</span>
              <div className="chips">
                {opciones.slice(0, 3).map((op) => (
                  <span key={op.id} className="chip chip-dicho">
                    {op.emoji && <span>{op.emoji}</span>}
                    <span>“{op.label}”</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {mostrarAyuda && (
            <div className="aviso-suave" style={{ marginTop: 14 }}>
              Hablar con una persona ayuda mucho. Toca el botón naranja o busca a
              un adulto de confianza.
            </div>
          )}

          {!oidoListo && (
            <>
              <div className="aviso-suave" style={{ marginTop: 14 }}>
                <strong>Rumi se está despertando…{progresoModelo !== null ? ` ${progresoModelo}%` : ''}</strong>
                <br />
                Está bajando su oído a este dispositivo. Solo pasa la primera
                vez; después funciona sin internet.
              </div>
              {/* Y mientras tanto se puede conversar escribiendo: esperar sin
                  poder hacer nada es lo que hace abandonar la app. */}
              <form onSubmit={enviarTexto} className="fila" style={{ width: '100%', maxWidth: 360 }}>
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escríbele mientras tanto…"
                  className="entrada"
                  style={{ flex: 1, height: 46 }}
                />
                <button type="submit" aria-label="Enviar" className="btn-enviar">
                  <Send size={19} />
                </button>
              </form>
            </>
          )}
        </div>

        {/* --- Barra inferior: tres cosas, ninguna necesaria para conversar --- */}
        <div className="escena-abajo">
          {pie}
          {/* Un único control en toda la conversación, y es para irse. Apagar
              el micrófono o cambiar a teclado eran decisiones de interfaz que
              el niño no tiene por qué tomar: si el oído falla, la app se pasa
              sola al respaldo escrito. */}
          <div className="fila" style={{ justifyContent: 'center' }}>
            <button className="btn-redondo btn-redondo-salir" onClick={salir} aria-label="Terminar" title="Terminar">
              <X size={22} />
            </button>
          </div>
          <p className="sec centro" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 0 }}>
            Háblale cuando quieras — también para hacer cuentas. Puedes interrumpirlo.
          </p>
        </div>

        <EmergencyButton />
      </div>
    );
  }

  /* ============================================================
     MODO BOTONES — para quien no puede o no quiere hablar
     ============================================================ */
  return (
    <div className="pantalla" style={{ paddingBottom: 110 }}>
      <div className="fila" style={{ marginBottom: 2 }}>
        <button className="link-volver" onClick={salir}>
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

      {enVoz && (
        <div className="centro" style={{ marginBottom: 8 }}>
          <button className="enlace-teclado" onClick={() => setVista('voz')}>
            <Mic size={13} /> Volver a hablar con Rumi
          </button>
        </div>
      )}

      {historial.slice(-3, -1).map((m, i) => (
        <ChatBubble key={i} texto={m.texto} de={m.de} historial />
      ))}

      <ChatBubble texto={mensajeRumi || '…'} />

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

      <div style={{ marginTop: 4 }}>
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
          placeholder="Escríbele a Rumi…"
          className="entrada"
          style={{ flex: 1, height: 46 }}
          autoFocus={mostrarTeclado}
        />
        <button type="submit" aria-label="Enviar" className="btn-enviar">
          <Send size={19} />
        </button>
      </form>

      {pie}

      <div ref={finRef} />
      <EmergencyButton />
    </div>
  );
}
