/**
 * Captura de audio crudo — corre en el hilo de audio del navegador
 * ================================================================
 *
 * Por qué existe, si `MediaRecorder` ya grababa:
 *
 *  1. NO SE PODÍA GRABAR HACIA ATRÁS. La grabadora arrancaba cuando el
 *     detector confirmaba que había voz, así que el primer fonema —la "Ho" de
 *     "Hola"— nunca llegaba al modelo. Whisper con la palabra descabezada
 *     inventa: "hoy jugué" salía como "hoy juguenas". Aquí el audio va
 *     siempre a un buffer circular, y cuando se detecta voz se recupera el
 *     medio segundo anterior, que ya está guardado.
 *
 *  2. HABÍA QUE DESCOMPRIMIR PARA VOLVER A COMPRIMIR. `MediaRecorder` daba
 *     WebM/Opus, que había que decodificar y remuestrear a 16 kHz para
 *     Whisper. Aquí el `AudioContext` se abre directamente a 16 kHz y lo que
 *     sale ya es lo que el modelo necesita.
 *
 *  3. EL HILO PRINCIPAL ESTÁ OCUPADO. Mientras Whisper transcribe y Gemma
 *     responde, un `ScriptProcessorNode` —que corre en ese mismo hilo— se
 *     salta bloques y deja huecos en la grabación. El worklet corre en el
 *     hilo de audio, que tiene prioridad de tiempo real.
 *
 * No decide nada: solo entrega bloques. Quién habla y cuándo termina se
 * resuelve en `stt.js`.
 */

const MUESTRAS_POR_ENVIO = 1024; // ~64 ms a 16 kHz: fino para el detector, barato para el hilo

class CapturaAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.acumulado = new Float32Array(MUESTRAS_POR_ENVIO);
    this.escritos = 0;
  }

  process(entradas) {
    const canal = entradas[0]?.[0];
    // Sin entrada todavía (el micrófono aún no arrancó): seguir vivo.
    if (!canal) return true;

    for (let i = 0; i < canal.length; i++) {
      this.acumulado[this.escritos++] = canal[i];
      if (this.escritos === MUESTRAS_POR_ENVIO) {
        // Se manda una copia y se transfiere: el bloque original se reutiliza.
        const bloque = this.acumulado.slice();
        this.port.postMessage(bloque, [bloque.buffer]);
        this.escritos = 0;
      }
    }
    return true;
  }
}

registerProcessor('captura-audio', CapturaAudio);
