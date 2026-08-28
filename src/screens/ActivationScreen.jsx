/**
 * Pantalla de activación — la entrada.
 *
 * Es la primera impresión, y también donde se establece la tesis del producto:
 * la app sabe DÓNDE está y QUÉ pasó, y por eso funciona sin red. Esa
 * parametrización vive en el pack territorial, no en el código.
 *
 * El saludo de Rumi es texto fijo. Ningún modelo interviene aquí.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Heart, Users, MapPin, Volume2, WifiOff } from 'lucide-react';
import RumiAvatar from '../components/RumiAvatar';
import pack from '../packs/choco-sismo-2026.json' with { type: 'json' };
import { hablar, callar } from '../services/tts';
import { infoBackend } from '../services/runtime';

const SALUDO = 'Hola, soy Rumi. Estoy aquí para acompañarte. ¿Qué quieres hacer hoy?';

// Se calcula una vez al cargar el módulo, no en cada render: los días
// transcurridos desde el sismo no cambian mientras la app está abierta.
const DIAS_DESDE_EVENTO = Math.max(
  0,
  Math.floor((Date.now() - new Date(pack.evento.fecha).getTime()) / 86400000),
);

export default function ActivationScreen() {
  const navigate = useNavigate();
  const [hablando, setHablando] = useState(false);
  const { territorio, evento } = pack;

  useEffect(() => () => callar(), []);

  const decirSaludo = () =>
    hablar(SALUDO, { onStart: () => setHablando(true), onEnd: () => setHablando(false) });



  return (
    <div className="pantalla">
      {/* --- Encabezado de contexto --- */}
      <div className="fila mb-16" style={{ justifyContent: 'space-between' }}>
        <span className="badge">
          <span className="punto-vivo" />
          MODO RESILIENCIA
        </span>
        <span
          className="fila sec"
          style={{ gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--exito)' }}
          title={infoBackend.detalle}
        >
          <WifiOff size={13} /> {infoBackend.modo === 'offline' ? 'Sin internet' : 'Vista previa'}
        </span>
      </div>

      {/* --- Rumi, protagonista --- */}
      <div className="centro" style={{ marginBottom: 6 }}>
        <RumiAvatar estado={hablando ? 'hablando' : 'idle'} tamano={168} />
      </div>

      <p
        className="centro"
        style={{ fontSize: 18.5, fontWeight: 600, lineHeight: 1.45, padding: '0 6px', margin: '4px 0 10px', letterSpacing: '-.2px' }}
      >
        {SALUDO}
      </p>

      <div className="centro" style={{ marginBottom: 18 }}>
        <button
          onClick={decirSaludo}
          className="fila"
          style={{ background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: 999, cursor: 'pointer', color: 'var(--primario-osc)', fontWeight: 640, fontSize: 13.5, fontFamily: 'inherit', padding: '8px 16px', margin: '0 auto', boxShadow: 'var(--sombra-sm)' }}
        >
          <Volume2 size={15} /> Escuchar a Rumi
        </button>
      </div>

      {/* --- Contexto territorial: la tesis del producto --- */}
      <div className="tarjeta" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="fila" style={{ padding: '15px 17px', borderBottom: '1px solid var(--borde)' }}>
          <MapPin size={17} color="var(--primario)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 15.5, letterSpacing: '-.2px' }}>
              {territorio.municipio}
            </strong>
            <div className="sec" style={{ fontSize: 12.5 }}>{territorio.departamento}, Colombia</div>
          </div>
          <div className="centro">
            <div style={{ fontSize: 21, fontWeight: 780, color: 'var(--alerta)', lineHeight: 1, letterSpacing: '-.5px' }}>
              {evento.magnitud}
            </div>
            <div className="sec" style={{ fontSize: 10.5, letterSpacing: '.4px' }}>SISMO</div>
          </div>
        </div>

        <div style={{ padding: '13px 17px', display: 'flex', gap: 18 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 720 }}>{DIAS_DESDE_EVENTO}</div>
            <div className="sec" style={{ fontSize: 11.5 }}>días después</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--borde)', paddingLeft: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 720, textTransform: 'capitalize' }}>
              {territorio.conectividad}
            </div>
            <div className="sec" style={{ fontSize: 11.5 }}>conectividad</div>
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #FFF3E4, #FFE9D2)', padding: '13px 17px', fontSize: 13, lineHeight: 1.55, color: 'var(--primario-osc)', fontWeight: 540 }}>
          Por eso Rumi funciona <strong>sin internet</strong>: la inteligencia
          artificial corre dentro de este dispositivo.
        </div>
      </div>

      <div className="espaciador" style={{ minHeight: 10 }} />

      {/* --- Las tres puertas --- */}
      <button className="btn btn-primario" onClick={() => navigate('/math')}>
        <GraduationCap size={21} /> Quiero aprender
      </button>
      <button className="btn btn-secundario" onClick={() => navigate('/chat')}>
        <Heart size={21} /> Me siento asustado
      </button>
      <button className="btn btn-suave" onClick={() => navigate('/padre')}>
        <Users size={21} /> Soy docente o cuidador
      </button>

      <p className="sec centro" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
        REBUILD · pack territorial <code>{pack.id}</code>
      </p>
    </div>
  );
}
