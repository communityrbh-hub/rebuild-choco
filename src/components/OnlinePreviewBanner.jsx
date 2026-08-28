/**
 * Banner de vitrina online — REGLA NO NEGOCIABLE #4
 *
 * La versión desplegada en la web existe para que un jurado explore la
 * interfaz sin instalar nada. NO es evidencia de la capacidad offline.
 * Decirlo de forma visible es parte del entregable, no un detalle.
 *
 * Solo aparece cuando la app NO corre en localhost.
 */

import { Wifi } from 'lucide-react';

export default function OnlinePreviewBanner() {
  const esLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (esLocal) return null;

  return (
    <div className="banner-online">
      <Wifi size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
      Estás viendo la versión de vista previa en línea. La versión real usa IA 100% local,
      sin internet — mira el video demo.
    </div>
  );
}
