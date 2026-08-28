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
│ 100% fijo │  │push-to-   │    │             │  │ SOLO     │
│           │  │talk       │    │             │  │ contenido│
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
| 🧠 Cerebro | **Gemma 3 1B** vía Ollama | **Gemini 1.5 Flash** |
| 👂 Oído | **Whisper-tiny** local (WASM) | **Web Speech API** |
| 🗣️ Voz | `speechSynthesis`, voz local del SO | `speechSynthesis` |
| 💾 Datos | `localStorage` — nada sale del equipo | `localStorage` |

> **Honestidad sobre el trade-off:** el oído offline es más lento que el online. Es una limitación del CPU, no un defecto de implementación. Se mitiga con push-to-talk (frases de 1-3 s) y se declara abiertamente.

---

## 🛡️ IA Responsable — cómo está construido

Esta es la decisión de diseño más importante del producto.

### El modelo nunca toca lo emocional

Un modelo de 1B alucina. En contención emocional con menores, una alucinación causa daño real. Por eso todo el contenido emocional es **texto fijo, pre-escrito y auditable** en [`src/data/dialogTree.js`](src/data/dialogTree.js), revisable por un profesional de salud mental antes de desplegarse.

**Y es verificable en un comando, no una promesa:**

```bash
# Solo MathScreen.jsx puede importar el servicio de IA generativa
grep -rl "services/aiService" src/screens src/components
#   → src/screens/MathScreen.jsx

# Solo aiService puede tocar los backends de IA
grep -rl "services/ollama\|services/gemini" src/
#   → src/services/aiService.js
```

### El modelo nunca calcula

Un modelo pequeño puede escribir un ejercicio impecable y dar **el resultado equivocado** con total seguridad. En un tutor infantil, eso es enseñarle mal a un niño.

```
1. CÓDIGO elige los números y calcula la respuesta   →  exacto siempre
2. LLM  solo lo viste de historia con contexto local →  su única tarea
3. CÓDIGO verifica lo que responde el niño           →  exacto siempre
4. LLM  explica el error, con la respuesta ya dada   →  no calcula nada
```

Si el modelo falla, tarda o alucina, hay **redacción de respaldo** y validación de formato: la app nunca se queda muda ni muestra un resultado sin verificar.

### El modelo nunca decide derivar

Que un modelo de 1B **no pueda** activar por su cuenta el protocolo de emergencia no es una limitación que estemos disculpando: es la garantía de seguridad del producto. Un modelo alucina; un `if` no.

| Herramienta | ¿Usa LLM? | ¿Toca lo emocional? |
|---|---|---|
| `escuchar()` | ❌ | ❌ solo mapea a un botón |
| `hablar(texto)` | ❌ | ✅ lee guion fijo |
| `responderEmocion(nodo)` | ❌ **nunca** | ✅ **100% pre-escrito** |
| `generarEjercicio(tema)` | ✅ | ❌ |
| `explicarError(ej, resp)` | ✅ | ❌ |
| `activarDerivación()` | ❌ **nunca** | ✅ **determinista** |

### Privacidad

En modo offline **ni la voz, ni el texto, ni las emociones del niño salen del dispositivo.** No hay servidor. No hay telemetría. No hay cuenta de usuario.

### Líneas de emergencia

Solo números verificados: **123** (emergencias nacional) y **141** (ICBF, protección a niños, niñas y adolescentes, 24 h). Ninguna línea adicional sin confirmar. Un teléfono equivocado en una app para niños en crisis es un error que no se puede cometer.

---

## 🔷 Tecnologías de Google

| Tecnología | Para qué | Por qué esa y no otra |
|---|---|---|
| **Gemma 3 1B** | Cerebro offline | Pesos abiertos, 815 MB, corre en CPU sin GPU. Es el modelo que la documentación de Google recomienda para inferencia on-device |
| **Gemini 1.5 Flash** | Cerebro de la vitrina online | Latencia baja y filtros de seguridad configurables, necesarios en un producto para menores |
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
├── agent/intents.js              👂 voz → intención por palabras clave
├── services/
│   ├── runtime.js                    detección de modo (offline/online)
│   ├── aiService.js              🧠 ÚNICO punto de entrada al LLM
│   ├── ollama.js                     backend offline · Gemma 3
│   ├── gemini.js                     backend online
│   ├── stt.js                    👂 Whisper local / Web Speech
│   └── tts.js                    🗣️ fuerza voz LOCAL del sistema
├── components/
│   ├── RumiAvatar.jsx                SVG + animaciones CSS
│   ├── MicButton.jsx                 push-to-talk
│   ├── EmergencyButton.jsx           123 · 141
│   ├── OnlinePreviewBanner.jsx       aviso de vitrina
│   └── AISafetyCard.jsx              transparencia de IA
└── screens/
    ├── ActivationScreen.jsx      /        activación por territorio
    ├── ChatScreen.jsx            /chat    contención · SIN IA generativa
    ├── MathScreen.jsx            /math     aprendizaje · ÚNICA con IA
    └── ParentDashboard.jsx       /padre    supervisión humana
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

Construido durante el hackathon GoFest 26. Desarrollo asistido con Claude Code (Anthropic), declarado según las reglas del evento. Modelos: Gemma 3 (Google, pesos abiertos), Gemini 1.5 Flash (Google), Whisper tiny (OpenAI, vía transformers.js). Iconos: lucide-react. Sin frameworks de UI: CSS puro.
