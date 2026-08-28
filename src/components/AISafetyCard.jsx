/**
 * Tarjeta de IA Responsable.
 *
 * Hace visible la decisión de diseño más importante del producto: qué genera
 * la IA y qué no. El criterio de IA Responsable del jurado pide explicabilidad
 * y supervisión humana; esto las hace auditables por cualquiera que abra la app.
 */

import { ShieldCheck, Check, X } from 'lucide-react';
import { infoBackend, infoSTT } from '../services/runtime';

const SI = [
  'Charla de lo cotidiano: su casa, sus animales, su día',
  'Genera ejercicios de matemáticas con contexto local',
  'Explica un error paso a paso',
  'Propone frases cortas de lectura',
];

const NO = [
  'Nunca responde sobre miedo, tristeza o el sismo: eso lo escribieron personas',
  'Nunca ve un mensaje que suene a crisis: ese va directo a derivación',
  'Nunca calcula: la aritmética la hace el código',
  'Nunca decide cuándo activar una línea de emergencia',
];

export default function AISafetyCard({ compacta = false }) {
  return (
    <div className="tarjeta">
      <div className="fila mb-8">
        <ShieldCheck size={20} color="var(--exito)" />
        <h2 style={{ margin: 0, fontSize: 17 }}>Cómo usamos la IA</h2>
      </div>

      {!compacta && (
        <p className="sec">
          Todo lo que el niño dice pasa antes por un enrutador que no es un modelo:
          si suena a crisis, o habla de miedo, tristeza, su casa, su familia o el
          sismo, responde un texto escrito por personas y revisable por un
          profesional. El modelo solo alcanza la charla cotidiana, y lo que
          contesta se revisa antes de que el niño lo oiga.
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        {SI.map((t) => (
          <div key={t} className="fila" style={{ alignItems: 'flex-start', marginBottom: 7 }}>
            <Check size={16} color="var(--exito)" style={{ flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: 14, lineHeight: 1.45 }}>{t}</span>
          </div>
        ))}
        {NO.map((t) => (
          <div key={t} className="fila" style={{ alignItems: 'flex-start', marginBottom: 7 }}>
            <X size={16} color="var(--alerta)" style={{ flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: 14, lineHeight: 1.45 }}>{t}</span>
          </div>
        ))}
      </div>

      <div
        className="sec"
        style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--borde)', fontSize: 13 }}
      >
        <div><strong>Cerebro:</strong> {infoBackend.nombre} · {infoBackend.modo}</div>
        <div><strong>Oído:</strong> {infoSTT.nombre} · {infoSTT.modo}</div>
        <div style={{ marginTop: 4 }}>
          En modo offline, ni la voz ni el texto ni las emociones salen del dispositivo.
        </div>
      </div>
    </div>
  );
}
