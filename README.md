# 🐻 REBUILD

**Un tutor de resiliencia que funciona sin internet, para niños de 5 a 10 años en zonas afectadas por desastres.**

Hackathon **GoFest 26 — Rebuild Colombia** · Google Developers · Google DeepMind · Platzi

---

## El problema

El 10 de agosto de 2026, un sismo de magnitud 7,4 con epicentro en **San José del Palmar, Chocó** dejó a la región con escuelas inhabilitadas e infraestructura de telecomunicaciones dañada.

Cuando eso pasa, se abren **dos brechas al mismo tiempo** que hoy nadie atiende junto:

1. **Brecha educativa.** Los niños pierden meses de continuidad escolar. En primaria, una interrupción larga no se recupera sola: se vuelve rezago permanente y, con frecuencia, deserción.
2. **Brecha de contención emocional.** Los niños expuestos a un desastre presentan miedo, alteración del sueño y ansiedad. La atención psicosocial profesional llega tarde, es escasa y se concentra en las cabeceras urbanas.

### Por qué las soluciones existentes no llegan

Toda la educación digital de emergencia asume conectividad. **Chocó es el peor lugar del país para asumir eso**: es el departamento con mayor pobreza multidimensional de Colombia y una de las coberturas de internet fijo más bajas. San José del Palmar es un municipio rural y disperso.

> Una plataforma que necesita internet, en un territorio sin internet, después de un sismo que además tumbó las telecomunicaciones, **no existe para quien la necesita**.

### Y su costo económico

```
Escuela cerrada → el cuidador no puede volver a trabajar → cae el ingreso familiar
                → el niño pierde el año escolar        → capital humano perdido a 10 años
```

Sostener la continuidad educativa **libera adultos para la reactivación productiva** y protege el capital humano del municipio.

---

## La solución

REBUILD corre **dentro del dispositivo, sin conexión**, y hace dos cosas:

| | |
|---|---|
| 📚 **Continuidad educativa** | Ejercicios de matemáticas y lectura generados con IA, con contexto cotidiano del Pacífico colombiano |
| 💙 **Contención emocional de Primer Nivel** | Guion pre-escrito, respiración guiada y **derivación obligatoria a profesionales humanos** |

Y está diseñado para niños que **todavía no leen ni escriben**: Rumi habla en voz alta, el niño responde hablándole o tocando botones grandes con emoji.

### Qué lo hace distinto

No es "otro tutor con IA". El diferencial es la combinación de tres cosas:

| | |
|---|---|
| 🔌 **IA en el borde** | Gemma 3 corriendo local. Cero conectividad, cero costo por token, cero datos del niño saliendo del dispositivo |
| 🛡️ **Contención determinista** | La IA generativa **nunca** genera ni recibe contenido emocional. Ese guion es fijo, auditable y revisable por un profesional |
| 🗺️ **Territorio parametrizable** | El contenido es un *pack territorial*. Cambiar de municipio, idioma o tipo de desastre = editar un archivo JSON |

---

## Arquitectura

```
┌───────────────────────────────────────────────────────────────┐
│                    REACT PWA  ·  4 pantallas                  │
│                  instalable · funciona sin red                │
└───────────────────────────────┬───────────────────────────────┘
                                │
                  ┌─────────────▼─────────────┐
                  │       ORQUESTADOR         │
                  │   DETERMINISTA — decide   │
                  │   qué herramienta corre.  │
                  │   El LLM nunca decide.    │
                  └─────────────┬─────────────┘
                                │
      ┌──────────────┬──────────┴───────┬──────────────┐
      ▼              ▼                  ▼              ▼
┌───────────┐  ┌───────────┐    ┌─────────────┐  ┌──────────┐
│  🛡️ CAPA  │  │  👂 OÍDO  │    │  🗣️ VOZ     │  │ 🧠 CEREBRO│
│ DETERMIN. │  │   (STT)   │    │   (TTS)     │  │   (LLM)  │
├───────────┤  ├───────────┤    ├─────────────┤  ├──────────┤
│dialogTree │  │ offline:  │    │ speech      │  │ offline: │
│contención │  │  Whisper  │    │ Synthesis   │  │  Gemma 3 │
│emergencia │  │  local    │    │ voz LOCAL   │  │  1B      │
│grounding  │  │ online:   │    │ del sistema │  │ online:  │
│           │  │  WebSpeech│    │             │  │  Gemini  │
│ SIN IA    │  │           │    │             │  │          │
│ 100% fijo │  │push-to-   │    │             │  │ NUNCA lo │
│ enruta    │  │talk       │    │             │  │ emocional│
└───────────┘  └───────────┘    └─────────────┘  └──────────┘
      ▲
      │
┌─────┴────────────────────────────────┐
│  packs/choco-sismo-2026.json         │
└──────────────────────────────────────┘
```

### Misma app, dos modos

El backend se elige por `hostname`. El código de las pantallas es idéntico.

| Capacidad | 🔌 Offline (el producto real) | 🌐 Online (vitrina para el jurado) |
|---|---|---|
| 🧠 Cerebro | **Gemma 3 1B** vía Ollama | **Gemini 3.1 Flash Lite** |
| 👂 Oído | **Whisper-tiny** local (WASM) | **Web Speech API** |
| 🗣️ Voz | `speechSynthesis`, voz local del SO | `speechSynthesis` |
| 💾 Datos | `localStorage` — nada sale del equipo | `localStorage` |

> **Honestidad sobre el trade-off:** el oído offline es más lento que el online. Es una limitación del CPU, no un defecto de implementación. Se mitiga con push-to-talk (frases de 1-3 s) y se declara abiertamente.

---

## 🛡️ IA Responsable — cómo está construido

Esta es la decisión de diseño más importante del producto.

### Cuatro vías, y el modelo solo alcanza la cuarta

Todo lo que el niño dice —hablando o escribiendo— pasa antes por un **enrutador determinista**. Es código, no un modelo, y decide quién responde:

| | Vía | Cuándo | Quién responde |
|---|---|---|---|
| 🎯 | **Intención** | El niño eligió una opción hablando: *"quiero respirar"* | El guion. Hablar equivale a tocar el botón |
| 🚨 | **Crisis** | Señales de autolesión, violencia o abuso | Texto fijo + derivación a 123/141. **El modelo no ve el mensaje** |
| 📖 | **Guion** | Nueve temas: miedo, tristeza, sueño, casa, escuela, familia, rabia, soledad, el sismo | Contención pre-escrita, auditable por un profesional |
| 🧠 | **Libre** | Todo lo demás: su perro, la lluvia, el arroz con coco | **Aquí sí improvisa Gemma**, con filtro de entrada y de salida |

Para que el modelo llegue a hablar, el mensaje tuvo que pasar los tres filtros anteriores. El orden **es** la garantía.

**Por qué la cuarta vía existe.** Sin ella esto es un menú de botones, no una conversación. Un niño de seis años que quiere contarle a Rumi que su perro se llama Kiko merece que le pregunten por el perro, y un modelo de 1B hace eso bien. Lo que no sabe hacer es contener a un niño que acaba de vivir un sismo: probándolo, Gemma 3 1B llegó a producir *"unos cuantos temblores pueden hacer que la gente se sienta más segura"*. Ningún filtro de palabras atrapa eso, porque el daño no está en las palabras sino en el sinsentido. Por eso esa franja no la toca.

**Sesgo deliberado: ante la duda, guion.** Una respuesta pre-escrita de más cuesta poco. Una improvisación dañina cuesta demasiado.

### Y es verificable en un comando, no una promesa

```bash
npm test
```

Veintiséis casos que corren en tres segundos y afirman exactamente lo de arriba: que *"me quiero morir"* y *"mi papá me pega"* nunca llegan al modelo, que los nueve temas emocionales caen en su nodo escrito, que *"yo solo quiero jugar"* **no** se confunde con soledad, y que el filtro de salida bloquea lo que un modelo pequeño se desvía a decir.

> Ese test no es decorativo: al escribirlo encontró tres huecos reales que la capa de seguridad tenía. Están documentados en el historial de commits.

```bash
# Solo MathScreen.jsx puede importar el servicio de ejercicios
grep -rl "services/aiService" src/screens src/components
#   → src/screens/MathScreen.jsx

# Y solo dos archivos en todo el proyecto pueden hablarle a un modelo
grep -rl "from './ollama.js'\|from './gemini.js'" src/
#   → src/services/aiService.js      (matemáticas)
#   → src/services/conversacion.js   (charla cotidiana, vía 4)
```

Ninguna pantalla, ningún componente y ningún nodo del árbol de diálogo puede invocar un modelo por su cuenta.

### El modelo nunca calcula

Un modelo pequeño puede escribir un ejercicio impecable y dar **el resultado equivocado** con total seguridad. En un tutor infantil, eso es enseñarle mal a un niño.

```
1. CÓDIGO elige los números y calcula la respuesta   →  exacto siempre
2. LLM  solo lo viste de historia con contexto local →  su única tarea
3. CÓDIGO verifica lo que responde el niño           →  exacto siempre
4. LLM  explica el error, con la respuesta ya dada   →  no calcula nada
```

Si el modelo falla, tarda o alucina, hay **redacción de respaldo** y validación de formato: la app nunca se queda muda ni muestra un resultado sin verificar.

### Cuánto acierta el modelo, medido

No decimos "funciona bien". Lo medimos, y el número está aquí porque el diseño se sostiene precisamente cuando el modelo falla:

```bash
npm run probar:mates 18
#   7/18 redactados por Gemma · 11/18 al respaldo · 4,3 s por ejercicio
```

Gemma 3 1B produce un enunciado que pasa todas las validaciones **cuatro de cada diez veces**. Las otras seis, la redacción de respaldo entra sin que el niño note nada: ve un ejercicio con un nombre y un contexto de su región igual. Y en los dos casos **la respuesta correcta la calculó el código**, no el modelo.

**Por qué el número es bajo a propósito.** La validación más estricta es la que compara el enunciado con la operación. Nació de un fallo real: para `28 + 9`, el modelo escribió *"Marisol tiene 28 flores y le regalan 9 a su abuela. ¿Cuántas flores le queda?"*. Los dos números están, el resultado no aparece, y describe una resta. Un niño que leyera bien respondería 19 y la app le diría que está mal. Preferimos descartar la mitad de los enunciados del modelo antes que castigar a un niño por un error nuestro.

> Un modelo de mil millones de parámetros en un CPU sin GPU falla más de la mitad de las veces. Esa es la realidad del hardware que hay en un aula de San José del Palmar. La pregunta de diseño no es cómo evitarlo: es qué ve el niño cuando pasa.

### El modelo nunca decide derivar

Que un modelo de 1B **no pueda** activar por su cuenta el protocolo de emergencia no es una limitación que estemos disculpando: es la garantía de seguridad del producto. Un modelo alucina; un `if` no.

| Pieza | Archivo | ¿Usa LLM? | ¿Toca lo emocional? |
|---|---|---|---|
| Enrutar lo que dijo el niño | `agent/router.js` | ❌ **nunca** | ✅ decide, con reglas |
| Detectar crisis y derivar | `agent/seguridad.js` | ❌ **nunca** | ✅ **determinista** |
| Responder un tema emocional | `data/dialogTree.js` | ❌ **nunca** | ✅ **100% pre-escrito** |
| Filtrar lo que el modelo va a decir | `agent/seguridad.js` | ❌ **nunca** | ✅ lo bloquea |
| Escuchar (voz → intención) | `services/stt.js` | ❌ | ❌ mapea a un botón |
| Hablar | `services/tts.js` | ❌ | ✅ lee el guion fijo |
| Charlar de lo cotidiano | `services/conversacion.js` | ✅ | ❌ solo llega lo que pasó los filtros |
| Generar un ejercicio | `services/aiService.js` | ✅ | ❌ |
| Explicar un error de matemáticas | `services/aiService.js` | ✅ | ❌ |

### Privacidad

En modo offline **ni la voz, ni el texto, ni las emociones del niño salen del dispositivo.** No hay servidor. No hay telemetría. No hay cuenta de usuario.

### Líneas de emergencia

Solo números verificados: **123** (emergencias nacional) y **141** (ICBF, protección a niños, niñas y adolescentes, 24 h). Ninguna línea adicional sin confirmar. Un teléfono equivocado en una app para niños en crisis es un error que no se puede cometer.

---

## 🔷 Tecnologías de Google

| Tecnología | Para qué | Por qué esa y no otra |
|---|---|---|
| **Gemma 3 1B** | Cerebro offline | Pesos abiertos, 815 MB, corre en CPU sin GPU. Es el modelo que la documentación de Google recomienda para inferencia on-device |
| **Gemini 3.1 Flash Lite** | Cerebro de la vitrina online | Latencia baja y filtros de seguridad configurables. Lite y no un flash grande a propósito: los modelos de razonamiento gastan parte del presupuesto de salida en pensar y devuelven la frase cortada |
| **Firebase Hosting** | Vitrina web | Despliegue estático inmediato para que el jurado explore sin instalar nada |
| **Google AI Edge / LiteRT** | Camino a producción | Vía oficial para llevar Gemma a Android on-device, sin reescribir el producto |

**Coherencia de arquitectura:** el mismo modelo abierto de Google que corre hoy en la laptop del aula es el que mañana corre en la tablet del docente. No es un cambio de proveedor entre el prototipo y el producto.

---

## 📈 Escalabilidad

El contenido está separado del motor en un **pack territorial**:

```
src/packs/choco-sismo-2026.json
├── territorio    → municipio, departamento, idioma, contexto cultural
├── evento        → tipo de desastre, magnitud, fecha, explicación infantil
├── personaje     → nombre y colores del avatar
├── emergencia    → líneas verificadas de ese país
└── curriculo     → temas, contextos narrativos, nombres locales
```

Llevar REBUILD a otro municipio, otro país o **otro tipo de desastre** (inundación, deslizamiento, conflicto) es clonar y editar ese archivo. El motor no cambia.

---

## 🌐 Vitrina en línea

**https://rebuild-choco-2026-b5c14.web.app**

Desplegada en Firebase Hosting para que cualquiera explore la interfaz sin instalar nada. Lleva un banner permanente porque **no es evidencia de la capacidad offline**: ahí el cerebro es Gemini, no Gemma corriendo en el dispositivo. Para ver el producto real hay que correrlo local, o mirar el video demo.

## 🚀 Cómo correrlo

### Modo offline — el producto real

```bash
# 1. Instalar Ollama y el modelo (una sola vez, con internet)
ollama pull gemma3:1b

# 2. Permitir que el navegador llame a Ollama (CORS)
#    Windows:
setx OLLAMA_ORIGINS "*"
#    macOS / Linux:
export OLLAMA_ORIGINS="*"
#    Reiniciar Ollama después de esto.

# 3. Arrancar la app
npm install
npm run dev
#    → http://localhost:5173

# 4. Desconectar el WiFi y usarla.
```

### Modo online — la vitrina

```bash
cp .env.example .env       # y pegar la API key de Google AI Studio
npm run build
firebase deploy
```

### Verificar que la voz funciona sin red

Riesgo real: Chrome expone voces **remotas** de Google. Si se toma la voz por defecto, en modo avión Rumi se queda mudo. La app fuerza una voz local del sistema. Para comprobarlo, en la consola del navegador:

```js
import('./src/services/tts.js').then(m => console.log(m.diagnosticoVoz()))
// → aptaParaOffline: true
```

---

## 📁 Estructura

```
src/
├── packs/choco-sismo-2026.json   🗺️ territorio parametrizado
├── data/dialogTree.js            🛡️ contención — 100% pre-escrito, sin IA
├── agent/
│   ├── router.js                 🎯 decide QUIÉN responde. Determinista
│   ├── seguridad.js              🚨 crisis y filtro de salida. Determinista
│   └── intents.js                👂 voz → intención por palabras clave
├── services/
│   ├── runtime.js                    detección de modo (offline/online)
│   ├── conversacion.js           🧠 charla cotidiana, vía 4 del enrutador
│   ├── aiService.js              🧠 ejercicios y explicaciones
│   ├── ollama.js                     backend offline · Gemma 3
│   ├── gemini.js                     backend online
│   ├── stt.js                    👂 Whisper local / Web Speech
│   ├── vad.js                        detecta cuándo el niño terminó de hablar
│   └── tts.js                    🗣️ fuerza voz LOCAL del sistema
├── components/
│   ├── RumiAvatar.jsx                SVG + animaciones CSS
│   ├── ChatBubble.jsx                burbuja de mensaje
│   ├── EmergencyButton.jsx           123 · 141
│   ├── OnlinePreviewBanner.jsx       aviso de vitrina
│   └── AISafetyCard.jsx              transparencia de IA
└── screens/
    ├── ActivationScreen.jsx      /        activación por territorio
    ├── ChatScreen.jsx            /chat    contención · enruta las 4 vías
    ├── MathScreen.jsx            /math    aprendizaje · ejercicios con IA
    └── ParentDashboard.jsx       /padre   supervisión humana

scripts/
├── test-seguridad.mjs            ✅ npm test — las 26 aserciones de seguridad
├── probar-matematicas.mjs        📊 mide la tasa de acierto del modelo
└── benchmark.mjs                     comparación de modelos locales
```

---

## Estado y limitaciones

**Es un prototipo funcional de hackathon.** Lo que sí funciona y lo que no:

| | |
|---|---|
| ✅ | Las 4 pantallas, el árbol de diálogo completo, voz de Rumi, ejercicios generados por IA local, dashboard, PWA instalable |
| ⚠️ | El oído offline (Whisper en WASM) es más lento que el online. Push-to-talk lo mitiga, no lo elimina |
| ⚠️ | El dashboard del docente es un mockup con datos de ejemplo, más las señales reales guardadas en ese dispositivo |
| ❌ | No hay sincronización entre dispositivos ni backend. Es deliberado: en este territorio no hay red que sincronizar |
| 📋 | Las cifras del territorio marcadas `VERIFICAR` en el pack no se muestran hasta tener fuente oficial |

---

## Créditos y uso de herramientas

Construido durante el hackathon GoFest 26. Desarrollo asistido con Claude Code (Anthropic), declarado según las reglas del evento. Modelos: Gemma 3 (Google, pesos abiertos), Gemini 3.1 Flash Lite (Google), Whisper tiny (OpenAI, vía transformers.js). Iconos: lucide-react. Sin frameworks de UI: CSS puro.
