/**
 * Rumi — el avatar.
 *
 * SVG + animaciones CSS. Sin librerías, sin assets externos: pesa nada y
 * funciona sin red, que es el punto de todo el producto.
 *
 * Es el ancla emocional de la app: un niño de 6 años que acaba de vivir un
 * sismo tiene que querer mirarlo. Por eso lleva volumen (gradientes), peso
 * (sombra de apoyo) y una cara que cambia de verdad según el ánimo.
 *
 * El personaje vive en el pack territorial, no aquí.
 */

import { useId } from 'react';
import pack from '../packs/choco-sismo-2026.json' with { type: 'json' };

const { colorCuerpo, colorPanza } = pack.personaje;

export default function RumiAvatar({ estado = 'idle', tamano = 120 }) {
  const uid = useId().replace(/:/g, '');
  const gPelo = `pelo-${uid}`;
  const gPanza = `panza-${uid}`;

  const clase =
    estado === 'feliz' ? 'rumi rumi-feliz'
    : estado === 'hablando' ? 'rumi rumi-hablando'
    : estado === 'preocupado' ? 'rumi rumi-preocupado'
    : 'rumi rumi-idle';

  const boca =
    estado === 'feliz'        ? 'M 40 63 Q 50 75 60 63'
    : estado === 'preocupado' ? 'M 42 70 Q 50 64 58 70'
    : estado === 'hablando'   ? 'M 43 63 Q 50 74 57 63'
    : 'M 42 64 Q 50 71 58 64';

  const ojoRy = estado === 'feliz' ? 3.4 : 4.8;

  return (
    <div className="rumi-wrap" style={{ width: tamano, height: tamano * 1.12 }}>
      <svg
        className={clase}
        width={tamano}
        height={tamano * 1.12}
        viewBox="0 0 100 112"
        role="img"
        aria-label={`${pack.personaje.nombre}, tu compañero`}
      >
        <defs>
          <radialGradient id={gPelo} cx="38%" cy="30%" r="78%">
            <stop offset="0%"   stopColor="#E8C39E" />
            <stop offset="55%"  stopColor={colorCuerpo} />
            <stop offset="100%" stopColor="#B98757" />
          </radialGradient>
          <radialGradient id={gPanza} cx="42%" cy="32%" r="75%">
            <stop offset="0%"   stopColor="#FFFBF0" />
            <stop offset="100%" stopColor={colorPanza} />
          </radialGradient>
        </defs>

        {/* Sombra de apoyo: da peso, evita que flote */}
        <ellipse className="rumi-sombra" cx="50" cy="106" rx="26" ry="4.5" fill="#3C4043" opacity="0.13" />

        {/* Cuerpo */}
        <g className="rumi-cuerpo">
          <ellipse cx="50" cy="90" rx="27" ry="21" fill={`url(#${gPelo})`} />
          <ellipse cx="50" cy="93" rx="17" ry="14" fill={`url(#${gPanza})`} />
          {/* Bracitos */}
          <ellipse cx="24" cy="86" rx="8"  ry="10" fill="#C29464" transform="rotate(-16 24 86)" />
          <ellipse cx="76" cy="86" rx="8"  ry="10" fill="#C29464" transform="rotate(16 76 86)" />
          {/* Piecitos */}
          <ellipse cx="38" cy="107" rx="9" ry="5.5" fill="#C29464" />
          <ellipse cx="62" cy="107" rx="9" ry="5.5" fill="#C29464" />
        </g>

        {/* Cabeza */}
        <g className="rumi-cabeza">
          {/* Orejas */}
          <circle cx="23" cy="27" r="13.5" fill="#C29464" />
          <circle cx="77" cy="27" r="13.5" fill="#C29464" />
          <circle cx="23" cy="27" r="7"    fill="#E8A0A0" opacity="0.75" />
          <circle cx="77" cy="27" r="7"    fill="#E8A0A0" opacity="0.75" />

          <circle cx="50" cy="52" r="35" fill={`url(#${gPelo})`} />

          {/* Hocico */}
          <ellipse cx="50" cy="64" rx="18.5" ry="14" fill={`url(#${gPanza})`} />

          {/* Cejas — solo en preocupado */}
          {estado === 'preocupado' && (
            <g stroke="#9A7248" strokeWidth="2.8" strokeLinecap="round">
              <line x1="31" y1="37" x2="43" y2="42" />
              <line x1="69" y1="37" x2="57" y2="42" />
            </g>
          )}

          {/* Ojos */}
          <g className="rumi-ojo">
            <ellipse cx="38.5" cy="47" rx="4.8" ry={ojoRy} fill="#2B2B2B" />
            <ellipse cx="61.5" cy="47" rx="4.8" ry={ojoRy} fill="#2B2B2B" />
            <circle cx="40.2" cy="45.2" r="1.8" fill="#FFF" />
            <circle cx="63.2" cy="45.2" r="1.8" fill="#FFF" />
          </g>

          {/* Nariz */}
          <ellipse cx="50" cy="57.5" rx="5.4" ry="3.9" fill="#2B2B2B" />
          <ellipse cx="48.4" cy="56.4" rx="1.7" ry="1.1" fill="#FFF" opacity="0.4" />

          {/* Boca */}
          <path d={boca} stroke="#2B2B2B" strokeWidth="2.4" fill="none" strokeLinecap="round" />

          {/* Cachetes */}
          {(estado === 'feliz' || estado === 'hablando') && (
            <>
              <ellipse cx="27" cy="59" rx="6" ry="4.4" fill="#E8A0A0" opacity="0.5" />
              <ellipse cx="73" cy="59" rx="6" ry="4.4" fill="#E8A0A0" opacity="0.5" />
            </>
          )}

          {/* Brillo de volumen */}
          <ellipse cx="37" cy="33" rx="11" ry="8" fill="#FFF" opacity="0.13" transform="rotate(-22 37 33)" />
        </g>
      </svg>

      {/* Ondas al hablar: señal visual de que está sonando */}
      {estado === 'hablando' && (
        <>
          <span className="onda onda-1" />
          <span className="onda onda-2" />
        </>
      )}
    </div>
  );
}
