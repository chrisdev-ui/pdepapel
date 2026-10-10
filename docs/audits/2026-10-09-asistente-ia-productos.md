# Auditoría del asistente de IA para crear y editar productos (2026-10-09)

Pedido de Paula: que el asistente piense por ella, que los nombres sigan el estilo de la tienda y que lea **todas** las fotos. Auditoría solo de lectura: ninguna escritura en productos, los modelos se llamaron en local con las mismas piezas de código del panel.

## 1. Resumen

- **El error de «no lee todas las fotos» es real.** El asistente envía como máximo **3 fotos**, siempre las tres primeras de la galería (portada + las dos siguientes). En la muestra de 20 productos se analizaron **42 de 77 fotos**; 12 productos tenían más de 3. El tope está en tres lugares a la vez: el componente, el esquema de la petición y el esquema de la respuesta.
- **Los nombres salen cortos y sin la gramática.** Media de 28 caracteres (objetivo 50–65, tope 60). El prompt prohíbe poner marca, color, diseño y medida en el nombre base, y el armado final solo pega la marca al final: la cantidad (`x24`, `12 colores`) se lee pero se pierde.
- **La marca se confunde con la licencia o la línea de diseño.** `Sanrio`, `Flower Power` y `William Morris` aparecieron como marca; la regla «una licencia es un diseño» no existe ni en el prompt ni en el código.
- **Casi nunca llena color ni talla.** Color en 3 de 18, talla en 0 de 18; diseño en 6 de 18.
- **Latencia:** mediana 15 s, pero 3 de 18 llamadas pasaron de 45 s (máx. 70 s). La función del panel corta a los 60 s: esas fallarían en producción. Se mandan las fotos originales sin reducir.
- **La propuesta (prototipo local con todas las fotos)** sube los nombres a 34–56 caracteres con cantidad y marca bien escrita, devuelve evidencia por foto y detecta variantes reales (los 4 diseños del folder en 10 fotos). Falta acotar el largo en código, quitar las barras de los nombres de categoría y repartir las fotos en tandas para no pasar de 60 s.

## 2. El nombre de referencia de Paula

El producto del enlace (`/producto/marcador-acrilico-punta-pincel-profesional-gipao-x12`; el slug se congela al renombrar) se llama hoy:

> **«Set en caja de marcadores acrílicos GIPAO punta pincel profesional 12 colores»** — 77 caracteres.

| Ranura de la gramática (`docs/plan-naming-productos.md` §2) | En el nombre de Paula | Observación |
|---|---|---|
| 1 · Tipo canónico | `Set … de marcadores` | Correcto: con varias unidades la regla es `Set de {plural}`. |
| 2 · Formato / material / descriptor | `en caja`, `acrílicos`, `punta pincel profesional` | Es lo que da la cola larga; bien. |
| Marca de fabricante | `GIPAO` | La marca real puede ir en el nombre, pero la grafía de la regla es `Gipao` (sin mayúscula sostenida). |
| 3 · Diseño / licencia | — | No aplica (el producto no tiene diseño). |
| 4 · Color | — | Correcto: `12 colores` es surtido, no un color de variante. |
| 5 · Medida / cantidad | `12 colores` | La regla pide `x12`. |
| Largo | 77 | Pasa el tope de 60 de Mercado Libre y el objetivo de 65. |

Lectura: el **estilo** de Paula (tipo + set + material + marca + punta + cantidad) coincide con la gramática; lo que difiere es la grafía de la marca, `12 colores` frente a `x12` y el largo. Versión dentro de las reglas: «Set de marcadores acrílicos Gipao punta pincel x12» (50).

**Decisiones para Christian:** ¿`12 colores` o `x12` cuando la cantidad es de colores? ¿Marca en mayúscula sostenida como la escribe el empaque o con la grafía normal?

## 3. Cómo funciona hoy

| Pieza | Dónde | Qué hace |
|---|---|---|
| Botón «Analizar fotos» | `components/products/product-name-assistant.tsx` (montado en la ficha de producto y en la de grupo) | Llama a `POST /api/[storeId]/products/image-analysis`. |
| Fotos | `product-name-assistant.tsx:386-389` (`.slice(0, 3)`), `lib/product-image-analysis.ts:13` (`MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES = 3`) | Quita duplicados y se queda con las 3 primeras. El servidor rechaza más de 3 («Puedes analizar hasta 3 imágenes a la vez»). La pantalla dice «Revisa hasta 3 fotos» pero no cuáles. |
| Envío | `route.ts:185-189` | URL original de Cloudinary, sin reducir. |
| Modelo | `route.ts:167` | `gemini-3.5-flash-lite`, salida estructurada, sin temperatura, sin tope de tokens, sin reintentos; la función tiene 60 s. |
| Prompt | `lib/product-image-analysis.ts:618-659` | Un solo texto. Pide 1–3 nombres de ≤65 caracteres **sin marca, color, diseño ni medida**, y descripción HTML de hasta 1.800 caracteres. |
| Listas | `route.ts:95-120` | Todas las subcategorías, tamaños, colores y diseños activos, sin recortar. La respuesta se cruza por coincidencia exacta normalizada; las parecidas salen como «alternativas». |
| Nombre final | `lib/product-naming.ts` `buildProductNameSuggestion` | Base de la IA + marca al final; color y diseño apagados por defecto; quita códigos de tamaño. No sabe de licencias. |
| Aplicar | `applyReviewedProposal` | Una casilla por campo, pre-marcada solo si hay coincidencia local; **pisa lo que Paula escribió** (la descripción pide confirmación en la ficha de producto, no en la de grupo). |
| Límites | `route.ts:40-56` | 20 análisis por tienda al día; caché de 24 h por fotos. |
| Variantes | `convert-product-to-variants-modal.tsx:48` | Reutiliza `variantCandidates` (índice de foto 0–2) y convierte hasta 3 opciones. |
| Errores | `route.ts` | Mensajes en español en la pantalla; uso de tokens solo en la consola. |

## 4. Medición: 20 productos reales

Muestra: un producto por subcategoría, los más recientes con fotos, 12 de ellos con más de 3 fotos. **Medido sin pista de subcategoría** (como un producto nuevo sin subcategoría elegida). En el panel, si Paula ya eligió la subcategoría, el formulario la manda como pista (verificado en `product-name-assistant.tsx:504`), así que la columna de subcategoría es el peor caso. «✓» acierta, «~» parcial, «✗» falla, «—» no aplica.

| Producto actual (largo) | Fotos usadas | Nombre propuesto hoy (largo) | Subcat. | Color / diseño / talla | Marca |
|---|---|---|---|---|---|
| Sello acrílico de viajes (24) | 1/1 | Sellos decorativos transparentes (32) ~ | ✓ | ✓ / ✓ / — | ✓ |
| Planeador block de hojas Stitch (31) | 3/6 | Planeador Stitch (16) ✗ | ✓ | ✗ / ✓ / ✗ | ✓ |
| Lapiceros Offi-Esco semi gel x10 con aroma (42) | 3/4 | Bolígrafos semi gel con aroma Offi-Esco (39) ~ pierde x10 | ✓ | — | ✓ |
| Washi pastel x6 (15) | 1/1 | Notas adhesivas (15) ✗ | ✗ | — | ✓ |
| Marcadores escarchados Flower Power x10 (39) | 3/6 | Marcadores escarchados de 10 colores Flower Power (49) ~ | ✓ | — | ✗ línea como marca |
| Cuaderno Argollado Flower Power de 1 Materia Pequeño (52) | 3/4 | Cuaderno argollado Flower Power (31) ~ | ✓ | — / ✗ / ✗ | ✗ (la marca es Primavera) |
| Paquete hojas decorativas Life is like a dream | — | **error: una foto del producto da 404 en Cloudinary** | — | — | — |
| Set de plumones SCRIBE … 24 colores … (69) | 3/7 | Plumones punta delgada Scribe (29) ✗ pierde x24 | ✓ | — | ✓ |
| Lámina stickers Hello Kitty (27) | 1/1 | Stickers decorativos Sanrio (27) ✗ | ✓ | ~ / ✓ / — | ✗ licencia como marca |
| Set de plumígrafos AIHAI 12 colores (35) | 3/4 | Set de plumígrafos AIHAI 12 unidades (36) ~ | ✓ | — | ✓ |
| Cajita Journalera para dummies (30) | 1/1 | Kit de papelería sorpresa (25) ~ | ✗ | — | ✓ |
| Troqueles de figuras en Maletin x8 de 1cm (41) | 1/1 | Kit de troqueles KAMEI (22) ✗ pierde x8 | ✗ | — | ~ |
| Cuaderno para colorear «Colorear para crecer» (45) | 3/6 | Cuaderno argollado (18) ✗ | ✗ | — / ✗ / — | ✓ |
| Cartuchera impermeable lila (27) | 3/4 | Cartuchera transparente con compartimentos (42) ~ | ✓ | ✓ / — / ✗ | ✓ |
| Reto de lectura (15) | 3/10 | Kit de lectura (14) ✗ | ✓ | — · variantes falsas | ✓ |
| Folder tarjetero kawaii (23) | 3/10 | Libreta de argollas (19) ✗ | ✗ | — · variantes ✓ | ✓ |
| Impresora térmica mini | — | **error: la respuesta no cumplió el esquema** | — | — | — |
| Agendas Flores Azul (19) | 3/6 | Libreta de apuntes William Morris (33) ~ | ✗ | — / ✗ / ✗ | ✗ diseño como marca |
| Cuaderno Argollado NORMA 5 Materias Grande (42) | 3/4 | Cuaderno argollado con diseño Norma (35) ✗ pierde 5 materias | ~ | — | ✓ |
| Bisturí mini Azul pastel (24) | 1/1 | Bisturí mini retráctil (22) ~ | ✓ | ✗ / — / ✗ | ✓ |

**Totales (18 respuestas):** nombre dentro de la gramática 0, parcial 9; nombres de 40+ caracteres 2; subcategoría igual a la real 11 (algunas reales parecen mal clasificadas, ver §5); color 3, talla 0, diseño 6; marca equivocada 4; 2 errores; 3 respuestas de más de 45 s.

### Patrones de falla

1. **Tope de 3 fotos**: etiquetas, cantidades y variantes que están en la foto 4 en adelante nunca se leen.
2. **El prompt prohíbe lo que la gramática pide**: sin marca, medida ni cantidad en el nombre base, y el armado no usa los atributos leídos (`Cantidad = 24` se lee y no llega al nombre).
3. **Marca ≠ licencia ≠ línea**: no hay regla; `Sanrio`, `Flower Power`, `William Morris` terminan en marca.
4. **Color y talla casi siempre vacíos**: el prompt exige «determinístico» y la talla solo acepta códigos internos que nunca están en la foto.
5. **Subcategoría a la deriva sin pista**: Washi → Notas adhesivas, Folder → Libretas, Libro para colorear → Argollados (cuando Paula elige la subcategoría antes, el panel sí la manda).
6. **Variantes falsas** en dos productos (planeador y kit de lectura).
7. **Latencia y fallos**: fotos originales sin reducir. Una foto rota tumba el análisis completo: la de «Paquete hojas decorativas Life is like a dream» ya está marcada como «Imagen rota» desde 2026-09-09 (`Image.brokenAt`), pero el asistente la envía igual. Una respuesta fuera de esquema (la impresora) no se reintenta; no se investigó más, el reintento propuesto la cubre.
8. **Sin nada que aprender**: ni ejemplos de buenos nombres ni lista de sustantivos canónicos.

## 5. Propuesta

**Fotos**
- Todas las fotos (tope 10), con la URL exacta que arma el cargador del panel para el ancho 1080 (`f_auto,q_auto,c_limit,w_1080`, verificado igual a `cloudinaryImageLoader`). Es uno de los cinco anchos fijos: para fotos ya vistas en el panel la copia existe; para fotos nuevas se crea una vez y la tienda la reutiliza. Ojo: `f_auto` para un cliente que no es navegador puede resolver a otro formato, que sería otra copia derivada; conviene medirlo antes de activarlo. La pantalla dice cuántas fotos leyó.
- En tandas de hasta 4 fotos en paralelo (lectura de etiquetas, cantidad, punta, medidas, color/diseño por foto) y una pasada final de solo texto que arma la ficha. Así ninguna llamada pasa de ~20 s.
- Se saltan las fotos marcadas como rotas (`brokenAt`) y cualquier foto que falle al descargar, con aviso; no tumban el análisis.

**Nombre**
- 3 opciones de ≤60 caracteres con el conteo visible, siguiendo `[Tipo canónico] [Formato/Material] [Marca real] [Diseño/Licencia] [Color] [Medida/Cantidad]`.
- Pocos ejemplos (few-shot). Hoy el catálogo casi no tiene de dónde sacarlos: solo 19 de 885 nombres vivos tienen 40–62 caracteres y una cantidad, y la mediana es de 26 caracteres. El primer juego se escribe a mano (los ejemplos del plan §2.5 y el de Paula ajustado); se pueden renovar solos cuando haya nombres aprobados con la gramática.
- El largo y las prohibiciones se validan en código (más de 60 se descarta o se pide otra), no solo en el prompt.
- Diccionario de sustantivos canónicos por subcategoría (`constants/product-naming.ts`, plan §3.1): nunca «Sketchbook / Bitácora» con barra en un nombre.

**Campos**
- Nombre, descripción corta en el tono de la tienda (sin «lindo», «hermoso» ni usos inventados), subcategoría, color/diseño/talla **de nuestras listas** (uno nuevo solo marcado «nuevo»), material, marca de fabricante (licencia → diseño), cantidad, punta, medidas, palabras clave y los atributos de Mercado Libre `MODEL` y `UNITS_PER_PACK`.
- Cada campo con confianza (alta/media/baja) y los números de foto que lo prueban.
- Si Paula ya eligió subcategoría, se sigue mandando como pista (hoy ya se hace).

**Variantes**
- Si las fotos muestran colores o diseños distintos del mismo producto, propone el grupo con una variante por foto, lista para «Convertir en variantes» (sin el tope de 3 opciones).

**Pantalla**
- «Aplicar todo» de un clic y aceptar por campo; nunca pisa lo que Paula escribió (lo escrito queda y la sugerencia se muestra al lado).
- Junto a cada campo, la miniatura de la foto de donde salió.
- Nunca precio ni costo; si hay costo, solo se muestra el precio sugerido de las reglas de margen existentes.

**Robustez y costo**
- Reintento único ante respuesta fuera de esquema; uso de tokens guardado por análisis para ver el gasto real.
- La cuota de 20 análisis por tienda al día cuenta un análisis por producto aunque haya varias tandas; con uso intensivo (una tanda grande de productos nuevos) se puede alcanzar.

## 6. Antes y después (5 productos, prototipo local)

| Producto actual | Fotos hoy → propuesta | Hoy | Propuesta (3 opciones con largo) | Lo que cambia |
|---|---|---|---|---|
| Set de plumones SCRIBE punta delgada 24 colores… | 3 → 7 | Plumones punta delgada Scribe (29) | Set de plumones Scribe punta delgada tonos vibrantes x24 (56) · Set de marcadores Scribe punta delgada con sellos x24 (53) · Set de plumones Scribe punta delgada x24 (40) | Cantidad, marca bien escrita, «Set de» por varias unidades; ve los sellos en las fotos 4–6. |
| Cuaderno Argollado NORMA 5 Materias Grande | 3 → 4 | Cuaderno argollado con diseño Norma (35) | Cuaderno argollado Norma 5 materias cuadriculado grande Let's Fly Away (**70**) · Cuaderno argollado Norma 5 materias diseño Anime (48) · … Estampado (52) | Marca y 5 materias; una opción pasa de 60 (el código debe descartarla). |
| Folder tarjetero kawaii | 3 → 10 | Libreta de argollas (19) | Mini archivador argollado argollas metálicas diseño Animalitos (**62**) · Carpeta argollada transparente diseño Animalitos x80 hojas (58) · Mini argollado PVC diseño Animalitos con bolsillos (50) | Material y medidas leídos en la foto 4; **detecta 4 diseños en las fotos 0, 1, 8 y 9** listos para variantes. Tardó 84 s: justifica las tandas. |
| Agendas Flores Azul | 3 → 6 | Libreta de apuntes William Morris (33) | Sketchbook / Bitácora William Morris diseño Van Gogh (52) · … | William Morris pasa a modelo/diseño (no marca), pero copia la barra de la subcategoría: falta el diccionario de sustantivos. |
| Washi pastel x6 | 1 → 1 | Notas adhesivas (15) | Set de notas adhesivas tonos pastel x10 (39) · … | Mejor nombre, pero ve notas adhesivas x10 en la foto: hay que revisar si la foto o el nombre del producto real están cruzados. |

Tiempos de la propuesta: 7–26 s con hasta 7 fotos; 84 s con 10 fotos en una sola llamada.

## 7. Costo

Medido con el uso de tokens de cada llamada, con el precio público de `gemini-3.5-flash-lite` (US$0,30 por millón de tokens de entrada y US$2,50 por millón de salida; **estimado**, tomado de una página de precios de terceros, agosto de 2026, no de la de Google):

| | Tokens entrada / salida | Costo estimado |
|---|---|---|
| Hoy (3 fotos, una llamada) | ~5.200 / ~500 | ~US$0,003 por análisis |
| Prototipo (todas las fotos en una llamada) | ~7.900 / ~670 | ~US$0,004 por producto |
| Diseño propuesto (tandas de ≤4 fotos + una pasada de texto) | ~(fotos ÷ 4) + 1 llamadas | ~US$0,006–0,01 por producto de 7–10 fotos |

Las tandas están diseñadas, no medidas: una llamada de 7 fotos tardó ~10 s, así que ~20 s por tanda en paralelo es razonable, más la pasada final de texto.

## 8. Lo que vería Paula

1. Sube las fotos y pulsa «Analizar fotos». Ve «Leyendo 7 de 7 fotos».
2. A los ~15–20 s aparece la ficha propuesta: 3 nombres con su largo, subcategoría, marca, diseño, color, talla, material, cantidad, descripción y palabras clave, cada uno con su confianza y la miniatura de la foto que lo prueba.
3. «Aplicar todo» llena lo que está vacío; lo que ya escribió queda y la sugerencia aparece al lado para aceptarla si quiere.
4. Si hay variantes en las fotos: «Encontré 4 diseños: ¿crear el grupo?», que abre «Convertir en variantes» con cada foto ya asignada.

## 9. Decisiones (Christian, 2026-10-09)

1. **Cantidad:** `N colores` o `N diseños` cuando el empaque mezcla colores o diseños; `xN` cuando las unidades son iguales. Gramática y ejemplos actualizados en `docs/plan-naming-productos.md` §2.2, §2.3 y §2.5, y en `pdepapel-admin/constants/product-naming.ts`.
2. **Marcas** en Title Case: `Gipao`, `Norma`, `Scribe`, `Offi-Esco`.
3. **Modelo:** las tandas de fotos siguen en `gemini-3.5-flash-lite`. La pasada final se comparó con un modelo más capaz (§11) y se adopta solo si gana con claridad y el total queda en ≤ US$0,02 por producto.
4. Implementar §5 completo, medir de nuevo los mismos 20 productos (§11) y dejar a Paula una lista corta de productos que parecen mal clasificados, sin cambiar nada.
5. El informe sale en el mismo push que la implementación.

## 10. Reproducción

Los guiones de la medición viven en `pdepapel-admin/tmp/ai-audit/` (ignorado por Git). Solo leen la base (una conexión) y llaman al modelo con la clave local; nunca escriben.
- Primera medición: `pick.ts`, `eval-current.ts` y `eval-proposed.ts`.
- Rondas 3 y 4:
  - `eval-r3.ts`: mismo enrutador y orden que la ruta. `PROVIDER=openai|gemini` fuerza un proveedor. Graba cada respuesta en `raw` para re-puntuar sin llamar al modelo.
  - `score3.ts`: barras fijadas antes de mirar resultados.
  - `replay-guard.ts`: re-puntuación con el código actual.
  - `category-votes.ts`: solo el paso de subcategoría, sobre hechos grabados.
- Las claves locales deben ser de un proyecto distinto al de producción: la cuota gratuita de Gemini es por proyecto y día.

## 11. Rondas 3 y 4 (2026-10-10): OpenAI principal, Gemini de respaldo

**Decisión de Christian:**
- Para el asistente de productos y los iconos, OpenAI `gpt-6-luna` es el principal y Gemini `gemini-3.5-flash-lite` el respaldo.
- Para el asistente de Respuestas y el clasificador del bot, solo OpenAI, porque leen mensajes de clientas. Si el clasificador falla, el bot sigue con las palabras clave.
- Motivos:
  - la clave de OpenAI es de pago y no tiene la cuota diaria gratuita;
  - el token cuesta menos;
  - la API no entrena con los datos.

**Fuentes (leídas el 2026-10-10):**
- Precios: developers.openai.com/api/docs/pricing. `gpt-6-luna` cuesta US$0,10 por millón de tokens de entrada (US$0,01 en caché) y US$0,50 de salida. Admite imagen y salida estructurada, y no tiene fecha de retiro.
- Datos: developers.openai.com/api/docs/guides/your-data. La API no entrena con los datos salvo que la organización lo pida, y guarda registros de abuso hasta 30 días. Todas las llamadas van con `store: false`.
- Gemini: precio de `gemini-3.5-flash-lite` en ai.google.dev, leído el 2026-10-09.

**Mismos 20 productos, lado a lado:**

| | Antes (commit) | Ronda 1 | Ronda 2 | Ronda 3, Gemini | Ronda 4, OpenAI (final) |
|---|---|---|---|---|---|
| Gramática completa (base de 16 / los 20) | 0 % | 38 % (6/16) | 30 % (6/20) | 43,8 % / 35 % | 37,5 % (6/16) / 40 % |
| Subcategoría | 50 % | 25 % | 50 % | 50 % | 45 % |
| Estabilidad de la subcategoría | — | — | — | 100 % | 90 % (3 votos) |
| Cambios de tipo sin aviso | — | — | — | 0 | 0 (también revisado a mano) |
| Fallas | 0 | 4 | 0 | 0 | 0 |
| Fotos leídas | 25 % de productos completos | 70 % | 79/80 | 79/80 | 79/80 |
| Costo por producto | US$0,0028 | US$0,0064 | US$0,0067 | US$0,0073 | US$0,0024 |
| p95 | — | — | 16,8 s | 29,2 s | 13,1 s |

Las cantidades se comprobaron en cada ronda desde la 2: Scribe da «24 colores», Norma queda sin cantidad y Offi-Esco da «10 colores».

**Ejemplos:**

| Nombre actual | Gemini (ronda 3) | OpenAI (final) |
|---|---|---|
| Set de plumones SCRIBE punta delgada 24 colores… | Set de plumones Scribe punta delgada 2,3 mm 24 colores | Set de marcadores Scribe punta delgada 2.3 mm 24 colores (con aviso) |
| Set de lapiceros semi gel Offi-Esco 10 colores con aroma | Lapicero semi gel de plástico Offi-Esco con aroma 10 colores | Set de lapiceros semi gel Offi-Esco trazo ancho 10 colores |
| Planeador block de hojas Stitch | Set de notas adhesivas diseño de papel Stitch (con aviso) | Planeador diario Stitch |
| Impresora térmica mini | Organizador kawaii 11 cm x 8.2 cm x 4.5 cm (con aviso) | Impresora térmica mini kawaii 11 cm × 8.2 cm × 4.5 cm |
| Cuaderno Argollado Flower Power de 1 Materia Pequeño | Cuaderno argollado Flower Power diseño Girly | Cuaderno argollado Flower Power diseño Aesthetic |

**Qué cambió en el código:**
- La subcategoría es un paso propio: lista cerrada más «Ninguna de la lista».
  - En Gemini va a temperatura 0.
  - En OpenAI son 3 preguntas en paralelo con voto de mayoría; con un voto, la estabilidad era 85 %.
- Esfuerzo de razonamiento en OpenAI, medido solo en el paso de subcategoría sobre los mismos hechos:
  - `none`: 10/20 en las dos pasadas, estable 20/20;
  - `low`: 11/20 y 9/20, estable 17/20.
  - Se dejó `none`.
- La pasada final en OpenAI va en modo estricto: el modo libre devolvía JSON ilegible en 3 de 22 llamadas, y con el modo estricto fueron 0 de 20.
- El aviso de tipo también salta cuando el sustantivo propuesto no se reconoce y no hay subcategoría que lo respalde: Washi → «Set de tizas…».
- Los demás arreglos están en `pdepapel-admin/AGENTS.md`, sección «Product AI assistant»: lectura de fotos tolerante, nombres cortos completados solo con datos leídos, sinónimos al sustantivo canónico, licencias con su grafía y tope de 60 sin rótulos colgando.

**Productos con aviso de tipo** (los 10 justificados; el de la impresora sobra porque esa propuesta no trajo subcategoría): Plumígrafos, plumones Scribe, Folder tarjetero, Agendas, Reto de lectura, Troqueles, Impresora, Washi, Paquete de hojas decorativas y Cajita Journalera.

**Para Paula** (sin cambios en el catálogo):
- «Washi pastel x6»: la IA ve tizas o crayones. Hay que revisar si las fotos o el nombre están cruzados.
- «Agendas Flores Azul»: la IA ve un cuaderno o una libreta. ¿La subcategoría es correcta?
- «Folder tarjetero kawaii»: la IA dice carpeta o libreta.
- «Cajita Journalera»: las fotos muestran lapiceros o un surtido.
- «Bisturí mini»: «9 colores» sale de una foto de la gama, no de la unidad que se vende.
- Troqueles: la IA dice perforadoras.
- Norma: ¿Argollados o Multimaterias?

**Otras funciones de IA** (todas con pruebas propias más una llamada real a OpenAI con texto inventado):

| Función | Principal | Respaldo | Llamada real |
|---|---|---|---|
| Clasificador del bot | OpenAI | palabras clave (nunca Gemini) | 5 de 5; mediana 1,5 s, máximo 3,9 s (corte 20 s) |
| Asistente de Respuestas | OpenAI | ninguno | 2,9 s |
| Sugerencias de icono | OpenAI | Gemini | 3,2 s |

**Respaldo Gemini:**
- Desde `@ai-sdk/google` 4.0.5x el SDK manda el JSON Schema sin convertir, y Gemini rechaza el esquema grande de la pasada final («invalid argument»). Todas las llamadas a Gemini mandan solo la forma (`toGeminiSchema`), como hacía la conversión anterior.
- La lectura de fotos y la subcategoría con ese esquema se probaron con llamadas reales.
- La pasada final y los iconos quedan para verificar después del despliegue, cuando se reponga la cuota local.

**Tope de gasto:** US$1 al día, compartido por las cuatro funciones.
- El asistente ya está limitado a 20 análisis por tienda al día, de unos US$0,0024 cada uno.
- Un mensaje del bot cuesta unos US$0,00006.
- El uso realista queda muy por debajo de US$0,20 al día, y un ciclo desbocado se corta en unos US$30 al mes.
- Al llegar al tope:
  - el asistente y los iconos pasan a Gemini;
  - Respuestas dice «La IA está ocupada, intenta más tarde.»;
  - el bot sigue con las palabras clave.

**xAI Grok como tercer proveedor** (docs.x.ai y registro de npm, leídos el 2026-10-09): no se adopta.
- Cuesta unas 10 veces más que `gpt-6-luna`: `grok-4.3` vale US$1,25 por millón de tokens de entrada y US$2,50 de salida.
- No acepta imágenes WebP, así que harían falta copias derivadas nuevas en Cloudinary.
- Los créditos gratis solo vienen por un programa de compartir datos que no se pudo confirmar en fuentes oficiales.
- Por defecto no entrena con datos de la API y los guarda 30 días. El endpoint que garantiza procesamiento en EE. UU. solo sirve los modelos más caros y cuesta 10 % más.
- Solo `@ai-sdk/xai@5.0.20` usa la misma versión de `@ai-sdk/provider`.
- Si algún día se usa: nivel de pago, y solo fotos del catálogo y texto de producto, nunca texto de clientas.
