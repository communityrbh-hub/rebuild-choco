/**
 * Botón de emergencia — SIEMPRE visible en la pantalla de chat.
 *
 * ⚠️ REGLA NO NEGOCIABLE #5
 * Solo números verificados: 123 (emergencias nacional) y 141 (ICBF).
 * Ninguna línea adicional sin confirmación. Un teléfono equivocado en una
 * app para niños en crisis es un error que no se puede cometer.
 *
 * Este flujo es 100% determinista. Ningún modelo decide cuándo mostrarlo
 * ni qué dice: es la garantía de derivación humana del producto.
 */

import { useState } from 'react';
import { LifeBuoy, X, Phone } from 'lucide-react';
import pack from '../packs/choco-sismo-2026.json' with { type: 'json' };

export default function EmergencyButton({ abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const { titulo, lineas } = pack.emergencia;

  return (
    <>
      <button
        className="emergencia-fab"
        onClick={() => setAbierto(true)}
        aria-label="Necesito ayuda ahora"
        title="Necesito ayuda ahora"
      >
        <LifeBuoy size={26} />
      </button>

      {abierto && (
        <div className="modal-fondo" onClick={() => setAbierto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="fila mb-16">
              <h2 style={{ margin: 0, flex: 1 }}>{titulo}</h2>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-sec)' }}
              >
                <X size={24} />
              </button>
            </div>

            <p className="sec mb-16">
              Hablar con una persona siempre ayuda. Estas líneas atienden gratis, todos los días.
            </p>

            {lineas.map((l) => (
              <a key={l.numero} href={`tel:${l.numero}`} className="linea-emergencia">
                <Phone size={22} color="var(--alerta)" />
                <div style={{ flex: 1 }}>
                  <div className="num">{l.numero}</div>
                  <div className="sec">{l.nombre}</div>
                  <div className="sec" style={{ fontSize: 12 }}>{l.disponibilidad}</div>
                </div>
              </a>
            ))}

            <p className="sec" style={{ marginTop: 14, marginBottom: 0 }}>
              Si estás con un adulto de confianza, muéstrale esta pantalla.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
