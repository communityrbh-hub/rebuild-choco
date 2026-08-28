/**
 * ÁRBOL DE DIÁLOGO — CONTENCIÓN EMOCIONAL
 * ========================================
 *
 * ⚠️ REGLA NO NEGOCIABLE #1
 * Todo el contenido de este archivo es TEXTO FIJO, PRE-ESCRITO Y AUDITABLE.
 * Ningún mensaje de este archivo se genera con IA.
 * Ningún input emocional del niño se envía jamás a un modelo generativo.
 *
 * Motivo: en contención emocional de Primer Nivel con menores, un modelo que
 * alucina puede causar daño real. Este guion es revisable por un profesional
 * de salud mental antes de desplegarse. Un modelo generativo, no.
 *
 * Los `keywords` existen para mapear la VOZ del niño a una opción concreta
 * (equivale a tocar el botón). La transcripción nunca llega al LLM.
 */

const dialogTree = {
  start: {
    id: 'start',
    message: 'Hola, soy Rumi. Me alegra mucho verte. ¿Cómo te sientes hoy?',
    options: [
      { id: 'bien',     emoji: '😊', label: 'Bien',     next: 'bien_flow',     keywords: ['bien', 'feliz', 'contento', 'contenta', 'alegre', 'genial'] },
      { id: 'regular',  emoji: '😐', label: 'Regular',  next: 'regular_flow',  keywords: ['regular', 'mas o menos', 'más o menos', 'normal', 'ahi', 'ahí'] },
      { id: 'mal',      emoji: '😟', label: 'Mal',      next: 'mal_flow',      keywords: ['mal', 'triste', 'miedo', 'asustado', 'asustada', 'susto'] },
      { id: 'muy_mal',  emoji: '😢', label: 'Muy mal',  next: 'muy_mal_flow',  keywords: ['muy mal', 'terrible', 'horrible', 'pesimo', 'pésimo', 'llorando'] },
    ],
  },

  bien_flow: {
    id: 'bien_flow',
    message: '¡Qué bueno escuchar eso! Me pone muy contento. ¿Quieres que practiquemos algo juntos?',
    mood: 'happy',
    options: [
      { id: 'math',  emoji: '🔢', label: 'Sí, matemáticas', action: 'go_to_math', keywords: ['matematicas', 'matemáticas', 'numeros', 'números', 'si', 'sí', 'vamos'] },
      { id: 'chat',  emoji: '💬', label: 'Quiero hablar',   next: 'topic_selector', keywords: ['hablar', 'contar', 'decir'] },
      { id: 'salir', emoji: '👋', label: 'Ahora no',        action: 'end_chat', keywords: ['no', 'nada', 'despues', 'después'] },
    ],
  },

  regular_flow: {
    id: 'regular_flow',
    message: 'Gracias por contarme. A veces uno se siente así, y está bien. ¿Qué te gustaría hacer?',
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos',     next: 'respiracion', keywords: ['respirar', 'respiracion', 'respiración', 'calma'] },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento',  next: 'cuento',      keywords: ['cuento', 'historia', 'escuchar'] },
      { id: 'math',     emoji: '🔢', label: 'Practicar matemáticas', action: 'go_to_math', keywords: ['matematicas', 'matemáticas', 'numeros', 'números'] },
    ],
  },

  mal_flow: {
    id: 'mal_flow',
    message: 'Gracias por decírmelo. Es normal sentirse así después de algo tan fuerte, y no estás solo. ¿Quieres que hagamos algo juntos?',
    mood: 'worried',
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos',        next: 'respiracion',    keywords: ['respirar', 'respiracion', 'respiración', 'calma'] },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento',     next: 'cuento',         keywords: ['cuento', 'historia', 'escuchar'] },
      { id: 'hablar',   emoji: '🌍', label: 'Hablar de lo que pasó',  next: 'explicar_sismo', keywords: ['hablar', 'que paso', 'qué pasó', 'temblor', 'sismo', 'terremoto'] },
      { id: 'math',     emoji: '🔢', label: 'Practicar matemáticas',  action: 'go_to_math',   keywords: ['matematicas', 'matemáticas', 'numeros', 'números'] },
    ],
  },

  muy_mal_flow: {
    id: 'muy_mal_flow',
    message: 'Lamento mucho que te sientas así. Lo que sientes es importante y estoy aquí contigo. Vamos a intentar algo juntos, ¿sí?',
    mood: 'worried',
    showEmergency: true,
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos',    next: 'respiracion', keywords: ['respirar', 'respiracion', 'respiración', 'calma', 'si', 'sí'] },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento',      keywords: ['cuento', 'historia', 'escuchar'] },
    ],
  },

  topic_selector: {
    id: 'topic_selector',
    message: 'Te escucho. ¿De qué te gustaría que habláramos?',
    options: [
      { id: 'sismo',    emoji: '🌍', label: 'De lo que pasó',    next: 'explicar_sismo', keywords: ['temblor', 'sismo', 'terremoto', 'lo que paso', 'lo que pasó'] },
      { id: 'respirar', emoji: '🌬️', label: 'Quiero calmarme',  next: 'respiracion',    keywords: ['calmar', 'respirar', 'tranquilo'] },
      { id: 'math',     emoji: '🔢', label: 'Mejor practiquemos', action: 'go_to_math',  keywords: ['matematicas', 'matemáticas', 'practicar'] },
    ],
  },

  respiracion: {
    id: 'respiracion',
    message: 'Perfecto. Pon tu mano en tu pancita y siente cómo sube. Vamos a inhalar: 1... 2... 3... 4... Ahora suelta despacito: 1... 2... 3... 4... Lo hiciste muy bien.',
    isExercise: true,
    options: [
      { id: 'again', emoji: '🔁', label: 'Otra vez',            next: 'respiracion', keywords: ['otra vez', 'otra', 'de nuevo', 'mas', 'más', 'si', 'sí'] },
      { id: 'listo', emoji: '💚', label: 'Ya me siento mejor',  next: 'post_calm',   keywords: ['mejor', 'listo', 'ya', 'bien', 'gracias'] },
    ],
  },

  cuento: {
    id: 'cuento',
    message: 'Había una vez un osito que vivía junto al río y le daba mucho miedo cuando la tierra se movía. Un día su abuela le dijo: "el miedo también se cansa". El osito la abrazó fuerte, respiró tres veces, y descubrió que ella tenía razón. ¿Quieres que practiquemos algo juntos ahora?',
    options: [
      { id: 'math',     emoji: '🔢', label: 'Sí, vamos',         action: 'go_to_math', keywords: ['si', 'sí', 'vamos', 'matematicas', 'matemáticas'] },
      { id: 'respirar', emoji: '🌬️', label: 'Respirar primero', next: 'respiracion',  keywords: ['respirar', 'calma'] },
      { id: 'salir',    emoji: '👋', label: 'Gracias Rumi',      action: 'end_chat',   keywords: ['gracias', 'adios', 'adiós', 'chao', 'no'] },
    ],
  },

  /**
   * ⚠️ NODO CRÍTICO — TEXTO FIJO, NO GENERADO.
   *
   * El grounding (la tierra se mueve · ya pasó · los adultos cuidan) es la
   * base clínica del mensaje y no puede quedar a merced de un modelo.
   * Un modelo de 1B podría producir una explicación alarmista o incorrecta
   * a un niño que acaba de vivir un sismo. Este texto no se toca en runtime.
   */
  explicar_sismo: {
    id: 'explicar_sismo',
    message: 'Te explico. La tierra está hecha de placas enormes que a veces se acomodan, como cuando estiras una goma y de pronto suelta un poquito. Eso fue el temblor: algo natural, no fue culpa de nadie. Y lo más importante: ya pasó, y hay muchos adultos trabajando para que todo esté seguro.',
    options: [
      { id: 'math',     emoji: '🔢', label: 'Entendí, practiquemos', action: 'go_to_math', keywords: ['entendi', 'entendí', 'si', 'sí', 'vamos', 'matematicas', 'matemáticas'] },
      { id: 'respirar', emoji: '🌬️', label: 'Quiero respirar',      next: 'respiracion',  keywords: ['respirar', 'calma', 'miedo'] },
    ],
  },


  /* ============================================================
     NODOS TEMATICOS - contencion por tema
     ============================================================

     A estos llega el enrutador (`agent/router.js`) cuando el nino habla
     libremente de algo emocional o del sismo. Son los temas donde medimos
     que un modelo de 1B produce respuestas incoherentes o daninas.

     Todos siguen la misma estructura de contencion de Primer Nivel:
       1. validar lo que siente   ("es normal", "gracias por contarme")
       2. normalizar              ("le pasa a muchos ninos")
       3. anclar en seguridad     ("ya paso", "hay adultos cuidandote")
       4. ofrecer una accion      (respirar, cuento, hablar con un adulto)

     Lo que NUNCA hacen: prometer que no volvera a pasar (seria mentir),
     minimizar lo que siente, ni hablar de heridos o danos graves.
     ============================================================ */

  tema_sismo: {
    id: 'tema_sismo',
    message: 'La tierra esta hecha de placas enormes que a veces se acomodan, como cuando estiras una goma y de pronto suelta un poquito. Eso fue el temblor: algo de la naturaleza, no fue culpa de nadie. Ya paso, y hay muchos adultos trabajando para que todo este seguro.',
    mood: 'worried',
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Quiero respirar', next: 'respiracion', keywords: ['respirar', 'calma', 'si'] },
      { id: 'cuento',   emoji: '📖', label: 'Cuentame un cuento', next: 'cuento', keywords: ['cuento', 'historia'] },
      { id: 'math',     emoji: '🔢', label: 'Mejor practiquemos', action: 'go_to_math', keywords: ['matematicas', 'practicar'] },
    ],
  },

  tema_miedo: {
    id: 'tema_miedo',
    message: 'Gracias por contarme que tienes miedo. Sentir miedo despues de algo tan fuerte es completamente normal, y le esta pasando a muchos ninos de tu pueblo ahora mismo. No estas solo, y el miedo tambien se va cansando poquito a poco.',
    mood: 'worried',
    showEmergency: true,
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion', keywords: ['respirar', 'calma', 'si'] },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento', keywords: ['cuento', 'historia'] },
      { id: 'sismo',    emoji: '🌍', label: 'Por que temblo?', next: 'tema_sismo', keywords: ['por que', 'temblor'] },
    ],
  },

  tema_tristeza: {
    id: 'tema_tristeza',
    message: 'Gracias por confiar en mi y contarme que estas triste. La tristeza no es algo malo, es como una lluvia por dentro que despues escampa. Y llorar tambien ayuda, no tiene nada de malo.',
    mood: 'worried',
    showEmergency: true,
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion', keywords: ['respirar', 'calma'] },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento', keywords: ['cuento', 'historia'] },
      { id: 'adulto',   emoji: '🤗', label: 'Buscar a un adulto', next: 'buscar_adulto', keywords: ['adulto', 'mama', 'papa'] },
    ],
  },

  tema_dormir: {
    id: 'tema_dormir',
    message: 'Dormir mal despues de un susto grande le pasa a casi todos los ninos, y se va mejorando con los dias. Ayuda mucho tener cerca algo tuyo: una cobijita, un peluche, o la mano de alguien. Y respirar despacito antes de cerrar los ojos.',
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Ensename a respirar', next: 'respiracion', keywords: ['respirar', 'ensename', 'si'] },
      { id: 'cuento',   emoji: '📖', label: 'Un cuento para dormir', next: 'cuento', keywords: ['cuento', 'historia'] },
    ],
  },

  tema_casa: {
    id: 'tema_casa',
    message: 'Debio ser muy duro ver tu casa asi. Que las cosas se rompan da mucha tristeza, y esta bien sentirlo. Hay personas trabajando en tu pueblo para arreglar las casas, y lo mas importante ya esta a salvo: tu.',
    mood: 'worried',
    showEmergency: true,
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion', keywords: ['respirar', 'calma'] },
      { id: 'adulto',   emoji: '🤗', label: 'Buscar a un adulto', next: 'buscar_adulto', keywords: ['adulto', 'mama'] },
      { id: 'math',     emoji: '🔢', label: 'Pensar en otra cosa', action: 'go_to_math', keywords: ['otra cosa', 'matematicas'] },
    ],
  },

  tema_escuela: {
    id: 'tema_escuela',
    message: 'Extranar la escuela quiere decir que te gustaba estar ahi, y eso es bonito. Las clases van a volver. Mientras tanto podemos seguir aprendiendo tu y yo, aqui mismo, para que no te quedes atras.',
    options: [
      { id: 'math',   emoji: '🔢', label: 'Practicar matematicas', action: 'go_to_math', keywords: ['matematicas', 'si', 'vamos'] },
      { id: 'cuento', emoji: '📖', label: 'Escuchar un cuento', next: 'cuento', keywords: ['cuento', 'historia'] },
    ],
  },

  tema_familia: {
    id: 'tema_familia',
    message: 'Los adultos tambien se asustan y tambien se ponen tristes, aunque a veces intenten disimularlo. Eso no significa que esten mal contigo ni que sea culpa tuya. Un abrazo suyo, o tuyo para ellos, ayuda a los dos.',
    options: [
      { id: 'adulto',   emoji: '🤗', label: 'Voy a buscarlos', next: 'buscar_adulto', keywords: ['buscar', 'abrazo', 'si'] },
      { id: 'respirar', emoji: '🌬️', label: 'Respirar juntos', next: 'respiracion', keywords: ['respirar', 'calma'] },
    ],
  },

  tema_rabia: {
    id: 'tema_rabia',
    message: 'Sentir rabia tambien esta permitido. Cuando pasan cosas injustas, el cuerpo se pone bravo, y eso es normal. Lo importante es sacarla sin lastimar a nadie: respirando fuerte, corriendo un ratico, o contandolo como me lo estas contando a mi.',
    options: [
      { id: 'respirar', emoji: '🌬️', label: 'Respirar fuerte', next: 'respiracion', keywords: ['respirar', 'si'] },
      { id: 'cuento',   emoji: '📖', label: 'Escuchar un cuento', next: 'cuento', keywords: ['cuento', 'historia'] },
    ],
  },

  tema_solo: {
    id: 'tema_solo',
    message: 'Sentirse solo es de las cosas mas dificiles, y me alegra que me lo digas. Ahorita estoy aqui contigo. Y hay personas cerca que quieren cuidarte, aunque a veces esten ocupadas con muchas cosas.',
    mood: 'worried',
    showEmergency: true,
    options: [
      { id: 'adulto', emoji: '🤗', label: 'Buscar a alguien', next: 'buscar_adulto', keywords: ['buscar', 'adulto', 'si'] },
      { id: 'cuento', emoji: '📖', label: 'Acompaname con un cuento', next: 'cuento', keywords: ['cuento', 'historia'] },
      { id: 'math',   emoji: '🔢', label: 'Hagamos algo juntos', action: 'go_to_math', keywords: ['juntos', 'matematicas'] },
    ],
  },

  buscar_adulto: {
    id: 'buscar_adulto',
    message: 'Muy bien. Piensa en una persona grande en la que confies: tu mama, tu papa, tu abuela, una profesora, un vecino. Cuentale lo mismo que me contaste a mi. Los adultos que te quieren necesitan saberlo para poder ayudarte.',
    showEmergency: true,
    options: [
      { id: 'listo',    emoji: '👍', label: 'Ya se a quien', next: 'post_calm', keywords: ['ya se', 'listo', 'si'] },
      { id: 'respirar', emoji: '🌬️', label: 'Respirar primero', next: 'respiracion', keywords: ['respirar', 'primero'] },
    ],
  },

  post_calm: {
    id: 'post_calm',
    message: '¡Muy bien! Recuerda esto: respirar despacito ayuda siempre que sientas miedo, y puedes hacerlo tú solo cuando quieras. ¿Practicamos matemáticas?',
    mood: 'happy',
    options: [
      { id: 'math', emoji: '🔢', label: 'Sí',              action: 'go_to_math', keywords: ['si', 'sí', 'vamos', 'bueno', 'matematicas', 'matemáticas'] },
      { id: 'end',  emoji: '👋', label: 'No, gracias Rumi', action: 'end_chat',  keywords: ['no', 'gracias', 'adios', 'adiós', 'chao'] },
    ],
  },

  despedida: {
    id: 'despedida',
    message: 'Me dio mucho gusto estar contigo. Vuelve cuando quieras, aquí voy a estar. ¡Cuídate mucho!',
    mood: 'happy',
    options: [
      { id: 'volver', emoji: '🔄', label: 'Empezar de nuevo', next: 'start', keywords: ['volver', 'de nuevo', 'otra vez'] },
    ],
  },
};

export default dialogTree;
