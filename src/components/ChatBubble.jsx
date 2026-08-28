/** Burbuja de mensaje. Rumi a la izquierda, el niño a la derecha. */

export default function ChatBubble({ texto, de = 'rumi', historial = false }) {
  const clases = [
    'burbuja',
    de === 'nino' ? 'burbuja-nino' : '',
    historial ? 'burbuja-historial' : '',
  ].filter(Boolean).join(' ');

  return <div className={clases}>{texto}</div>;
}
