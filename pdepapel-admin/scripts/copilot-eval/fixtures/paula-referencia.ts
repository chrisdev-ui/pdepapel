/**
 * Texto de referencia de Paula (su estilo preferido: tono, estructura y nivel
 * de detalle), en la forma que guarda el editor de productos. Los datos del
 * texto son reales para «Set de lapiceros Primavera tinta negra 3 unidades
 * retráctil»; aquí no va ninguna cifra del negocio.
 *
 * Escasez y popularidad: la línea «uno de los sets más buscados» NO está
 * respaldada por los datos (el producto es clase B). «¡Stock limitado!» y «se
 * agota rápido» solo valen mientras el stock esté en el umbral de stock bajo
 * (corrección del 2026-10-12: en producción ese día sí lo estaba). En la
 * evaluación se siembra con stock por encima del umbral, así que la respuesta
 * esperada cierra con un llamado neutral, sin escasez ni popularidad.
 */
export const PAULA_REFERENCE_PRODUCT = {
  name: "Set de lapiceros Primavera tinta negra 3 unidades retráctil",
  brand: null,
  abcClassification: "B",
  /** Por encima del umbral de stock bajo (5 por defecto): sin escasez. */
  stock: 40,
  html:
    "<h3><strong>¡La combinación perfecta de precisión, elegancia y suavidad al escribir!</strong></h3>" +
    "<p>¿Buscas un bolígrafo con el que tus notas fluyan sin interrupciones ni borrones? ✨ El <strong>Set de Lapiceros Primavera x3</strong> está diseñado para ofrecerte una experiencia de escritura ultra fluida y ligera, ideal para tomar apuntes en clase, firmar documentos o llenar tu agenda.</p>" +
    "<p>Su <strong>punta fina de 0.7 mm</strong> proporciona un trazo definido, nítido y de secado rápido, mientras que su práctico mecanismo retráctil elimina las tapas perdidas para siempre. <strong>¡Es un infaltable para el día a día y uno de los sets más buscados!</strong></p>" +
    "<h3><strong>🔥 ¿Por qué te van a encantar?</strong></h3>" +
    "<ul>" +
    "<li><p><strong>Escritura ultra fluida (0.7 mm):</strong> Punta fina de alta precisión para trazos limpios, suaves y sin acumulaciones de tinta.</p></li>" +
    "<li><p><strong>Mecanismo Retráctil:</strong> Práctico y rápido de usar con un solo clic, sin preocuparte por perder tapas en el bolso o la cartuchera.</p></li>" +
    "<li><p><strong>Tinta Negra Intensa:</strong> Pigmentación oscura y constante, de secado rápido para evitar manchas al escribir.</p></li>" +
    "<li><p><strong>Diseño Cómodo y Ligero:</strong> Cuerpo liviano pensado para largos periodos de escritura sin fatiga en la mano.</p></li>" +
    "<li><p><strong>Pack por 3 Unidades:</strong> Para que tengas uno en el escritorio, otro en la cartuchera y otro siempre de repuesto.</p></li>" +
    "</ul>" +
    "<h3><strong>📌 Especificaciones Técnicas</strong></h3>" +
    "<ul>" +
    "<li><p><strong>Marca:</strong> Primavera</p></li>" +
    "<li><p><strong>Cantidad:</strong> Set de 3 lapiceros / bolígrafos</p></li>" +
    "<li><p><strong>Color de Tinta:</strong> Negra</p></li>" +
    "<li><p><strong>Grosor de la Punta:</strong> 0.7 mm (Punta Fina)</p></li>" +
    "<li><p><strong>Mecanismo:</strong> Retráctil (con clic)</p></li>" +
    "<li><p><strong>Tinta:</strong> A base de aceite / secado rápido</p></li>" +
    "<li><p><strong>Presentación:</strong> Blíster protector x3</p></li>" +
    "</ul>" +
    "<p>⚡ ¡Stock limitado! Un básico de alta calidad que se agota rápido. <strong>¡Agrégalo a tu carrito hoy mismo y disfruta de la mejor escritura!</strong> 🛒🖊️</p>",
} as const;

/** Frases que la respuesta para este producto no puede repetir con los datos sembrados. */
export const UNBACKED_CLAIMS = /stock limitado|se agota|más buscad|más vendid|favorit/i;
