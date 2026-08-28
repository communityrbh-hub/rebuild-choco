# 🐻 REBUILD — Borrador de pitch

**GoFest 26 · Rebuild Colombia** — 8 slides · 4 a 5 minutos

> Borrador para revisión. El contenido está mapeado a los 6 criterios de evaluación.
> Cifras marcadas `[VERIFICAR]` no se presentan hasta tener fuente.

---

## Slide 1 — El gancho

**Visual:** pantalla negra, una sola línea de texto.

> ### El 10 de agosto, un sismo de 7,4 dejó a San José del Palmar, Chocó, sin escuelas.
> ### Y sin internet para reemplazarlas.

**Guion (20 s):**
> "Todas las soluciones de educación de emergencia asumen conectividad. Chocó es el peor lugar del país para asumir eso. Nosotros construimos la que no la necesita."

---

## Slide 2 — El problema, en dos capas

**Visual:** dos columnas.

| 📚 Brecha educativa | 💙 Brecha emocional |
|---|---|
| Los niños pierden meses de escuela | Miedo, alteración del sueño, ansiedad |
| El rezago de primaria no se recupera solo | La atención psicosocial llega tarde y se concentra en cabeceras urbanas |
| Se convierte en deserción | Nadie acompaña el día a día |

**Guion (30 s):**
> "Cuando cae una escuela se abren dos brechas al mismo tiempo, y hoy nadie las atiende juntas. Hay apps educativas y hay líneas de atención psicosocial. Pero un niño de 7 años en una vereda del Chocó no tiene acceso a ninguna de las dos."

**Y la conexión económica —dila explícitamente:**
> "Además: escuela cerrada significa que un cuidador no puede volver a trabajar. Esto no es solo un problema social. Es la condición de posibilidad de la reactivación económica."

---

## Slide 3 — La solución

**Visual:** el teléfono con Rumi, y tres etiquetas.

> # REBUILD
> ### Un tutor de resiliencia que funciona sin internet
> **Para niños de 5 a 10 años · IA corriendo dentro del dispositivo**

| 🔌 | 🛡️ | 🗺️ |
|---|---|---|
| **IA en el borde** | **Contención determinista** | **Territorio parametrizable** |
| Gemma 3 local. Sin red, sin costo por token, sin datos saliendo | La IA nunca genera ni recibe contenido emocional | Cambiar de municipio o de desastre = un archivo JSON |

**Guion (25 s):**
> "Rumi habla en voz alta y el niño le responde hablando. No necesita saber leer ni escribir. Y todo el modelo de IA corre dentro del aparato."

---

## Slide 4 — 🎬 DEMO EN VIVO

**Visual:** la app. **Con el WiFi apagado y visible en pantalla.**

**Recorrido (90 s):**
1. **Muestra el WiFi apagado.** Este es el momento más importante del pitch.
2. Activación: la app sabe dónde está y qué pasó.
3. El niño toca 😟 → Rumi lo acompaña con respiración guiada. *"Este texto no lo escribió una IA. Lo escribiría un profesional de salud mental."*
4. El niño **le habla al micrófono** → Rumi entiende, sin internet.
5. Matemáticas: ejercicio generado por Gemma **local**, con mangos y canastas.
6. Terminal al lado: Gemma corriendo, cero conexiones de red.

**La frase de cierre de la demo:**
> "Todo lo que acaban de ver ocurrió sin un solo byte saliendo de este computador."

---

## Slide 5 — 🛡️ IA Responsable *(nuestro punto más fuerte)*

**Visual:** tabla de dos columnas, verde y roja.

| ✅ La IA sí hace | ❌ La IA nunca hace |
|---|---|
| Genera ejercicios con contexto local | Responder sobre emociones o miedo |
| Explica un error paso a paso | Calcular — la aritmética la hace el código |
| Propone frases de lectura | Decidir cuándo activar una línea de emergencia |

**Guion (40 s) — este es el momento de mayor puntaje:**
> "Un modelo de mil millones de parámetros alucina. En contención emocional con menores, una alucinación causa daño real. Por eso toda la contención es texto pre-escrito, auditable, revisable por un profesional.
>
> Y no se lo pedimos por confianza: **es verificable en un comando.**"

```bash
grep -rl "services/aiService" src/screens src/components
#   → src/screens/MathScreen.jsx      (una sola pantalla)
```

> "Además, el modelo nunca calcula. El código elige los números y calcula la respuesta; el modelo solo lo viste de historia. Que Gemma **no pueda** decidir sola activar el protocolo de emergencia no es una limitación que estemos disculpando: es la garantía de seguridad del producto. Un modelo alucina; un `if` no."

---

## Slide 6 — Arquitectura y tecnologías de Google

**Visual:** el diagrama de 4 capas del README.

| | Offline (el producto real) | Online (vitrina) |
|---|---|---|
| 🧠 Cerebro | **Gemma 3 1B** · Ollama | **Gemini 1.5 Flash** |
| 👂 Oído | Whisper local | Web Speech API |
| 🗣️ Voz | Voz local del sistema | Voz local del sistema |

**Guion (30 s):**
> "Gemma no es una decisión de sponsor, es de arquitectura: es un modelo abierto de Google de 815 megas que corre en CPU sin GPU. Y es el modelo que la propia documentación de Google recomienda para llevar a Android on-device. El mismo modelo que hoy corre en la laptop del aula es el que mañana corre en la tablet del docente. No cambiamos de proveedor entre el prototipo y el producto."

---

## Slide 7 — Escala y despliegue real

**Adelántate a la pregunta que te van a hacer.**

> ### "¿Quién tiene un computador en San José del Palmar?"

**No es una app por niño.** Es un **punto comunitario**: el portátil del aula, la tablet del docente, el kit del ICBF en el albergue. Un dispositivo atiende ~20 niños por turno.

```
HOY    →  Ollama + Gemma 3 1B      ·  laptop del aula
MAÑANA →  Google AI Edge + LiteRT  ·  Android del docente
```

**Y para escalar de territorio:**
```
packs/choco-sismo-2026.json  →  packs/[cualquier-municipio].json
```
Otro municipio, otro país, u **otro tipo de desastre** — inundación, deslizamiento — es editar un archivo. El motor no cambia.

---

## Slide 8 — Cierre

**Visual:** Rumi, y una línea.

> ### La conectividad llega a las zonas de desastre semanas después que la necesidad.
> ### REBUILD no espera.

**Guion (20 s):**
> "No construimos un tutor con IA. Construimos el único tipo de tutor que puede existir donde no hay red. Y lo construimos de forma que un profesional de salud mental pueda auditar cada palabra que un niño va a escuchar."

---

## 📋 Preguntas que te van a hacer — y las respuestas

| Pregunta | Respuesta |
|---|---|
| **"¿Quién tiene el dispositivo?"** | Punto comunitario, no app por niño. Ver slide 7 |
| **"¿Por qué no usar Gemini para todo?"** | Porque en San José del Palmar no hay red. La vitrina online existe para que ustedes la exploren; el producto es el offline |
| **"¿Un modelo de 1B es suficiente?"** | Para calcular, no — y por eso no calcula. El código hace la aritmética y el modelo solo redacta. Es una decisión de diseño, no una limitación aceptada |
| **"¿Qué pasa si la IA le dice algo dañino a un niño?"** | No puede: no participa en la conversación emocional. Verificable con un grep |
| **"¿Cómo miden el impacto?"** | Lecciones completadas, brechas por tema, y la señal emocional que ve el docente. La derivación la decide una persona, no el sistema |
| **"¿Y la privacidad de los datos del niño?"** | En offline no salen del dispositivo. No hay servidor, ni telemetría, ni cuenta de usuario |
| **"¿Está validado con niños reales?"** | No. Es un prototipo de hackathon. El siguiente paso es validación con docentes y profesionales psicosociales antes de cualquier despliegue |

---

## ⏱ Distribución del tiempo

| Slide | Tiempo |
|---|---|
| 1-2 Problema | 50 s |
| 3 Solución | 25 s |
| **4 Demo en vivo** | **90 s** ← el corazón |
| 5 IA Responsable | 40 s |
| 6 Arquitectura | 30 s |
| 7-8 Escala y cierre | 35 s |
| **Total** | **≈ 4:30** |

**Si te quedas sin tiempo, sacrifica la slide 6, nunca la 4 ni la 5.**
