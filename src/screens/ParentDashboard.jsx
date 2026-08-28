/**
 * ParentDashboard — la capa de supervisión humana.
 *
 * Mockup con datos precargados (regla no negociable #8): sin Firestore, sin
 * lógica real. Lo que sí es real: si el niño usó la app en este dispositivo,
 * se muestran sus señales guardadas en localStorage.
 *
 * Su función en el producto no es decorativa. El criterio de IA Responsable
 * exige supervisión humana en decisiones sensibles: aquí es donde un adulto
 * ve la señal y decide. La IA nunca cierra un caso ni deriva sola.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, MapPin, BookOpen, Ear } from 'lucide-react';
import AISafetyCard from '../components/AISafetyCard';
import pack from '../packs/choco-sismo-2026.json' with { type: 'json' };
import { infoOido, precargarWhisper, probarOido, modoSTT } from '../services/stt';

const mockData = {
  nombre: 'Yeison',
  edad: 8,
  leccionesHoy: 2,
  leccionesTotal: 5,
  estadoEmocional: [
    { dia: 'Lun', emoji: '😟' },
    { dia: 'Mar', emoji: '😟' },
    { dia: 'Mié', emoji: '😐' },
    { dia: 'Jue', emoji: '😐' },
    { dia: 'Vie', emoji: '😊' },
  ],
  alerta:
    'Yeison reportó miedo 2 veces esta semana. La tendencia mejora, pero si vuelve a aparecer, considera hablar con un profesional de apoyo psicosocial.',
  brechaMatematicas: 'Multiplicación: 3 de 5 aciertos — conviene practicar más',
};

/**
 * Prueba del oído — para no tener que adivinar por qué no responde
 * ================================================================
 *
 * "Le hablo y no me contesta" tiene al menos cinco causas distintas que desde
 * fuera se ven idénticas: falta el permiso del micrófono, el modelo todavía
 * se está descargando, el motor cargó pero devuelve basura, hay demasiado
 * ruido en la sala, o simplemente tarda. Cada una se arregla de otra manera.
 *
 * Este botón las separa: pasa un audio conocido por la misma ruta que la voz
 * del niño y enseña qué entendió, con qué motor y cuánto tardó. Va en el
 * panel del docente porque es quien puede hacer algo con la respuesta.
 */
function PruebaDeOido() {
  const [estado, setEstado] = useState('listo');
  const [resultado, setResultado] = useState(null);

  if (modoSTT !== 'local') return null; // online el oído es el del navegador

  async function probar() {
    setEstado('probando');
    setResultado(null);
    try {
      await precargarWhisper();
      const r = await probarOido(new URL('oido-referencia.wav', document.baseURI).href);
      setResultado({ ...r, info: infoOido() });
      setEstado('listo');
    } catch (e) {
      setResultado({ error: String(e?.message || e) });
      setEstado('listo');
    }
  }

  const esperado = 'el gato duerme en la casa';
  const bien = resultado?.texto
    && ['gato', 'duerme', 'casa'].filter((w) => resultado.texto.toLowerCase().includes(w)).length >= 2;

  return (
    <div className="tarjeta">
      <div className="fila mb-8">
        <Ear size={18} color="var(--primario)" />
        <strong>Prueba del oído</strong>
      </div>
      <p className="sec" style={{ marginTop: 0 }}>
        Pasa una frase grabada («{esperado}») por el mismo camino que usa la voz
        del niño. Dice qué motor está corriendo, qué entendió y cuánto tardó.
      </p>

      <button className="btn btn-suave" onClick={probar} disabled={estado === 'probando'}>
        {estado === 'probando' ? 'Probando…' : 'Probar el oído'}
      </button>

      {estado === 'probando' && (
        <p className="sec" style={{ marginBottom: 0 }}>
          La primera vez descarga el modelo: puede tardar un minuto.
        </p>
      )}

      {resultado?.error && (
        <p className="sec" style={{ color: 'var(--alerta)', marginBottom: 0 }}>
          No se pudo probar: {resultado.error}
        </p>
      )}

      {resultado?.texto !== undefined && (
        <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.7 }}>
          <div>
            <strong style={{ color: bien ? 'var(--exito)' : 'var(--alerta)' }}>
              {bien ? '✓ Entiende bien' : '✗ No entendió la frase'}
            </strong>
          </div>
          <div>Entendió: «{resultado.texto || '—'}»</div>
          <div className="sec">
            Motor: <code>{resultado.info?.configuracion || '—'}</code> ·
            {' '}tardó {(resultado.msTranscripcion / 1000).toFixed(1)} s ·
            {' '}{resultado.info?.webgpu ? 'GPU disponible' : 'sin GPU, va por CPU'}
          </div>
        </div>
      )}
    </div>
  );
}

/** Señales reales guardadas en este dispositivo, si las hay. */
function leerLocal() {
  try {
    const emociones = JSON.parse(localStorage.getItem('rebuild_emociones') || '[]');
    const progreso = JSON.parse(localStorage.getItem('rebuild_progreso') || '[]');
    return { emociones, progreso };
  } catch {
    return { emociones: [], progreso: [] };
  }
}

export default function ParentDashboard() {
  const navigate = useNavigate();
  const { emociones, progreso } = leerLocal();
  const aciertosReales = progreso.filter((p) => p.acierto).length;

  return (
    <div className="pantalla">
      <button className="link-volver" style={{ marginBottom: 14 }} onClick={() => navigate('/')}>
        <ArrowLeft size={18} /> Volver
      </button>

      <h1>Panel de seguimiento</h1>
      <div className="fila sec mb-16">
        <MapPin size={15} />
        {pack.territorio.municipio}, {pack.territorio.departamento}
      </div>

      <div className="tarjeta">
        <div className="fila">
          <div
            style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(150deg,#F8B173,var(--primario))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 740, boxShadow: 'var(--sombra-pri)', flexShrink: 0 }}
          >
            {mockData.nombre[0]}
          </div>
          <div>
            <strong style={{ fontSize: 17 }}>{mockData.nombre}</strong>
            <div className="sec">{mockData.edad} años</div>
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <div className="fila mb-8">
          <TrendingUp size={18} color="var(--exito)" />
          <strong>Progreso de hoy</strong>
        </div>
        <p style={{ fontSize: 33, fontWeight: 780, margin: '6px 0 10px', letterSpacing: '-.8px' }}>
          {mockData.leccionesHoy}
          <span className="sec" style={{ fontSize: 17, fontWeight: 500 }}> / {mockData.leccionesTotal} lecciones</span>
        </p>
        <div style={{ height: 9, background: 'var(--borde)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${(mockData.leccionesHoy / mockData.leccionesTotal) * 100}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#F8B173,var(--primario))', transition: 'width .5s ease' }} />
        </div>
        {progreso.length > 0 && (
          <p className="sec" style={{ marginTop: 10, marginBottom: 0 }}>
            En este dispositivo: {aciertosReales} aciertos de {progreso.length} intentos.
          </p>
        )}
      </div>

      <div className="tarjeta">
        <strong>Cómo se ha sentido esta semana</strong>
        <div className="fila" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          {mockData.estadoEmocional.map((d) => (
            <div key={d.dia} className="centro" style={{ flex: 1 }}>
              <div style={{ fontSize: 25, width: 42, height: 42, margin: '0 auto', borderRadius: 13, background: 'var(--fondo-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.emoji}</div>
              <div className="sec" style={{ fontSize: 11.5, marginTop: 5 }}>{d.dia}</div>
            </div>
          ))}
        </div>
        {emociones.length > 0 && (
          <p className="sec" style={{ marginTop: 12, marginBottom: 0 }}>
            Registros reales en este dispositivo: {emociones.length}
            {' · último: '}{emociones[emociones.length - 1].emoji}
          </p>
        )}
      </div>

      <div className="tarjeta" style={{ background: 'var(--alerta-luz)', border: '1.5px solid var(--alerta)' }}>
        <div className="fila mb-8">
          <AlertTriangle size={18} color="var(--alerta)" />
          <strong>Señal para revisar</strong>
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{mockData.alerta}</p>
        <p className="sec" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
          Esta señal la genera una regla, no un modelo. La decisión de derivar
          siempre la toma una persona.
        </p>
      </div>

      <div className="tarjeta">
        <div className="fila mb-8">
          <BookOpen size={18} color="var(--primario)" />
          <strong>Brecha detectada</strong>
        </div>
        <p style={{ margin: 0, fontSize: 15 }}>{mockData.brechaMatematicas}</p>
      </div>

      <PruebaDeOido />

      <AISafetyCard />

      <p className="sec centro" style={{ fontSize: 12, marginBottom: 0 }}>
        Vista de demostración con datos de ejemplo.
      </p>
    </div>
  );
}
