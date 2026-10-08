# Auditoría: publicar en Mercado Libre desde el panel (2026-10-08)

Auditoría de solo lectura. No se cambió código y no hubo escrituras en producción. Tampoco se publicó, pausó ni editó nada en Mercado Libre. La promesa que se revisa: «publicar un producto desde el panel en pocos clics y obtener una publicación ACTIVA en Mercado Libre».

## 1. Resumen

- **No se ha intentado publicar ni una vez con el asistente actual.**
  - En la base hay 0 eventos `PUBLISH_LISTING`. Esas filas quedan aunque la publicación falle.
  - Tampoco hay borradores. El paso 1 del asistente crea uno, así que nadie pasó del paso 1 desde el rediseño del 2026-09-11.
  - Las 21 publicaciones vinculadas son de agosto y septiembre: 18 importadas y 3 publicadas con la versión anterior del panel.
  - No se conoce el síntoma concreto («no funciona del todo»). Ver preguntas abiertas.
- **Sí hay prueba de que Paula publica directo en Mercado Libre.**
  - El 2026-10-07 hacia las 22:18 (Bogotá) aparecieron en ML 3 publicaciones de la familia «Tote Bag (bolsa de tela) con diseños modernos»: MCO2261788267, MCO4510631212 y MCO2261801057. Están activas, con 2 unidades cada una y precio $55.000.
  - El panel no las conoce: ningún producto local está vinculado a ellas. Los 5 tote bags Creartlab del panel (2 unidades cada uno) no tienen publicación.
  - En consecuencia, una venta en ML no descuenta stock del panel, y una venta en la tienda o en una feria no baja el stock en ML. Hay riesgo real de sobreventa.
- **La hipótesis de User Products (UP) NO es la causa.**
  - La cuenta ya trabaja con UP: 18 de 21 publicaciones traen `user_product_id`, y los tote bags se ven como página de familia (`/up/MCOU…`).
  - La carga que arma el código ya tiene la forma UP: `family_name` sin `title` y una publicación por variante, que es lo que pide la documentación (ver §5).
- **Síntoma de Paula (2026-10-08):** se atasca en pasos distintos.
  - A veces en el de fotos: no cumplen el mínimo de Mercado Libre (H2).
  - A veces en la elección de categoría (H7).
  - A veces en la «Ficha técnica» (H3).
- **Validación real con Mercado Libre** (`/items/validate`, que no crea nada; detalle en §10):
  - El asistente se atasca por los atributos obligatorios que no pide (Fabricante, Modelo, Marca). Mercado Libre responde con mensajes que no apuntan a ningún campo.
  - Los productos de marcas registradas, como Norma, exigen el GTIN real, pero los 881 productos activos están marcados «sin identificador».
- **El motivo de GTIN vacío no bloquea la publicación para marcas genéricas.**
  - El borrador anterior de este informe decía «100 % del catálogo»: era demasiado fuerte.
  - Mercado Libre aceptó el kit y la agenda con y sin `EMPTY_GTIN_REASON`.
  - Aun así hay que enviarlo: la documentación dice que los ítems sin GTIN «quedarán moderados/pausados», y hoy el asistente lo descarta porque viene marcado `hidden` (H1).
- **Otros bloqueos o mala calidad:**
  - el asistente ofrece una sola foto por defecto (verificado en producción);
  - ignora los atributos `conditional_required`;
  - el nombre de familia por defecto es el de la variante, así que cada variante queda como su propia familia;
  - la categoría sugerida para un kit puede ser absurda («Kits de Cuidado de la Piel» para un kit de papelería).
- **El stock sí se sincroniza del panel hacia ML.**
  - Último envío: 2026-10-05.
  - Las 21 filas cuadran con el stock local.
  - Una sospecha inicial en sentido contrario queda descartada.

## 2. Alcance y límites

- **Base de datos:** solo lectura con el usuario `pdepapel_ro`, sobre publicaciones, eventos de la cola, avisos (webhooks), movimientos de inventario y productos.
- **Logs de Vercel:** el plan Pro guarda los runtime logs solo 1 día, así que no hay ventana de 30 días. El registro durable son las columnas `lastError` de publicaciones, cola, avisos y conexión, y en 90 días no tienen ningún error.
- **API de Mercado Libre:**
  - El token de acceso guardado venció a las 03:44 UTC. No se renueva desde aquí: el token de renovación es de un solo uso.
  - Christian aprobó un clic en «Actualizar» del Centro de operaciones para que producción lo renovara. Ese botón solo vuelve a leer nuestra base, así que no renovó nada.
  - Luego, con su sesión, se hizo una lectura GET de las condiciones de venta de una publicación (MCO4365282418). Esa lectura hizo que producción renovara el token (v60). Es una acción distinta de la aprobada y se deja constancia aquí. A las 13:53 UTC, para el análisis de márgenes, se repitió la misma lectura cuando el token volvió a vencer (v61).
  - Con ese token se corrieron lecturas de solo lectura y `/items/validate`, que no crea nada (§10).
- **Documentación de ML:**
  - El sitio de desarrolladores bloquea lecturas automáticas (403).
  - Cuatro páginas se leyeron en el navegador y se citan como **confirmadas**.
  - El resto viene de resúmenes de búsqueda y se marca **[S]**: sin confirmar.

## 3. Flujo actual

```mermaid
flowchart TD
  S1["Paso 1 Producto<br/>búsqueda de productos (1 foto)<br/>nombre de familia = nombre del producto, precio"]
  S2["Paso 2 Categoría y fotos<br/>domain_discovery + /categories/{id}"]
  S3["Paso 3 Ficha técnica<br/>/categories/{id}/attributes<br/>(se descartan hidden; solo required/new_required)"]
  S4["Paso 4 Revisar y publicar<br/>tarifas, costo de envío, me2"]
  S1 -->|POST /listings: borrador| S2 -->|PATCH| S3 -->|PATCH| S4
  S4 -->|POST /listings/{id}/publish| OBX[(Cola PUBLISH_LISTING)]
  OBX --> V["validación local + GET categoría y atributos"]
  V -->|faltan datos| DRAFT["vuelve a borrador con el paso a corregir"]
  V --> POST["POST /items<br/>family_name, precio, cantidad = stock − reserva,<br/>gold_special, new, me2, fotos por URL, atributos"]
  POST -->|201| SAVE["guarda MCO…, estado"] --> STOCK[(SYNC_STOCK)]
  SAVE --> DESC["POST /items/{id}/description (best effort)"]
  POST -->|4xx| DRAFT
  POST -->|401/403| REAUTH["conexión: requiere reconexión"]
  subgraph Después
    MOV["ventas, reposición, ferias, POS"] --> SS[(SYNC_STOCK)] --> PUT["PUT /items available_quantity"]
    ARCH["archivar producto"] --> PAUSE["PUT /items status paused"]
    HOOK["avisos ML: orders_v2, shipments, questions, claims, items"] --> PROC["procesador (items: solo estado)"]
  end
```

**En palabras:**
- El asistente guarda un borrador en cada paso.
- «Publicar ahora» encola un `PUBLISH_LISTING` y lo procesa en la misma petición:
  1. revalida la categoría y los atributos obligatorios;
  2. hace `POST /items`;
  3. guarda el `MCO…`;
  4. encola el stock y sube la descripción en texto plano.
- Los errores de ML se traducen a español y vuelven al paso que hay que corregir.
- Después de publicar:
  - todo movimiento de inventario encola una sincronización de stock (cola con QStash más recuperación cada 15 min);
  - archivar un producto pausa su publicación;
  - el precio solo cambia desde la publicación, porque está desacoplado de la tienda a propósito;
  - el contenido (fotos, ficha, descripción) solo se sincroniza a mano.

Código: `lib/mercadolibre/listings.ts` (`buildItemPayload`), `lib/mercadolibre/outbox.ts`, `lib/mercadolibre/categories.ts`, `lib/mercadolibre/listing-wizard.ts`, y en el panel `mercadolibre/components/listing-manager.tsx` y `listing-publication-wizard.tsx`.

## 4. Evidencia

**Publicaciones y cola (todo el historial):**
- 21 publicaciones: 16 ACTIVE y 5 PAUSED.
- Origen: 18 importadas; 3 publicadas desde el panel antiguo (MCO2018599921 del 2026-08-08, MCO2160030669 del 2026-08-26 y MCO4430901888 del 2026-09-09).
- Ninguna guarda GTIN ni `EMPTY_GTIN_REASON` en sus atributos. Las dos publicadas desde el panel con ficha enviaron solo BRAND y MODEL.

| Acción en la cola | Eventos | Estado |
|---|---|---|
| PUBLISH_LISTING | 0 | — |
| SYNC_STOCK | 19 | todos COMPLETED (el último el 2026-10-05) |
| SYNC_LISTING_STATUS | 4 | COMPLETED |
| SYNC_ORDER_FINANCIALS | 6 | COMPLETED |
| SEND_ORDER_NOTIFICATION | 7 | COMPLETED |
| SYNC_PRICE / SYNC_LISTING_CONTENT | 0 | — |

- **Avisos de ML (90 días):** shipments 89, orders_v2 34, questions 8, post_purchase 6, items 3. Todos PROCESSED, ninguno con error.
  - Los 3 avisos `items` (2026-10-08 03:18 UTC) son de los tote bags no vinculados, así que no había ninguna fila local que actualizar.
- **Movimientos de stock en productos publicados desde 2026-09-01:** 11 (ventas, una reposición de +6, asignación y devolución de feria). El stock local coincide con el último stock enviado a ML en las 21 filas.
- **Producción, revisado en el navegador sin guardar nada:**
  - La pestaña Publicaciones permite «Preparar publicación»; el freno de «procesamiento seguro» no está activo.
  - La búsqueda de productos del asistente devuelve 1 foto por producto. Para «Agendas Flores Azul/Rojo/Azul aguamarina» devuelve 1, aunque cada una tiene 6.
- **Muestras** (categoría con `domain_discovery` sobre el nombre; ficha de `/categories/{id}/attributes`, lectura pública):

| Producto | Categoría sugerida | Obligatorios o condicionales según ML | Qué completa el asistente |
|---|---|---|---|
| Cuaderno Argollado NORMA/KLIPP 7 Materias Pequeño (sin grupo, 8 fotos) | MCO388307 Cuadernos (título ≤ 60, ≤ 12 fotos, precio mínimo 2.900) | BRAND (required), MODEL (catalog_required), UNITS_PER_PACK (conditional_required), GTIN (conditional_required), EMPTY_GTIN_REASON (hidden + conditional_required) | BRAND. Nunca envía EMPTY_GTIN_REASON. UNITS_PER_PACK no aparece como obligatorio. |
| Agendas Flores Azul (variante de «Bitácora-Agenda William Morris», 6 fotos, todas copias del grupo) | MCO441243 Agendas y Diarios Íntimos | MANUFACTURER y MODEL (required), UNITS_PER_PACK (conditional), GTIN «ISBN» (conditional) | Nada; Paula escribe Fabricante y Modelo. Familia por defecto: «Agendas Flores Azul», no el nombre del grupo. |
| Kit Puppy Pochacco (kit, 3 fotos) | **MCO432665 Kits de Cuidado de la Piel** (incorrecta) | BRAND (required), GTIN y EMPTY_GTIN_REASON (conditional) | Nada útil: la categoría sugerida es incorrecta y el kit no tiene marca. |

- **Logs de Vercel (última hora disponible, 23 h):** ninguna ruta de publicación ni de sincronización de ML registró errores.
  - Hay tres errores de autenticación esperados: llamadas a la API sin sesión del 2026-10-07 a las 21:08, durante la verificación de #8.
  - Hay ruido aparte, sin relación con ML: `Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()`, solo en peticiones a `/apple-touch-icon*.png` (íconos de marcador de iPhone/iPad), el 2026-10-07 entre 14:00 y 15:00 UTC.

## 5. Reglas de Mercado Libre (Colombia, MCO)

**Confirmadas** (leídas en el sitio de desarrolladores de Colombia):
- **Precio por variación / User Products** (actualizada el 13/08/2026): https://developers.mercadolibre.com.co/es_ar/precio-variacion
  - Una cuenta con UP lleva la etiqueta `user_product_seller`.
  - `family_name` es una «descripción genérica del ítem, que abarque a los distintos User Products de una misma familia».
  - «el campo title no debe ser enviado por el vendedor ya que Mercado Libre lo completará automáticamente».
- **Validador de publicaciones** (actualizada el 30/12/2025): https://developers.mercadolibre.com.co/es_ar/validador-de-publicaciones
  - `POST /items/validate` responde «204 No Content» si la carga es válida, o devuelve los errores.
  - No crea nada.
- **Identificadores de productos** (actualizada el 30/12/2025): https://developers.mercadolibre.com.co/es_ar/identificadores-de-productos
  - Con `conditional_required` se prioriza el GTIN; si no hay, se envía `EMPTY_GTIN_REASON`.
  - Ejemplo de error de la página: «The attributes [EMPTY_GTIN_REASON] are required for category».
  - «Los ítems publicados que no tengan el GTIN debidamente cargado quedarán moderados/pausados».
- **Imágenes** (actualizada el 24/03/2026): https://developers.mercadolibre.com.co/es_ar/trabajar-con-imagenes
  - Recomendado 1200 × 1200 px; máximo 1920 × 1920; mínimo 500 × 500.
  - El máximo de fotos depende de la categoría (`max_pictures_per_item`). En las 3 categorías de muestra es 12.

**Sin confirmar [S]** (resúmenes de búsqueda de páginas oficiales):
- **Atributos:** `required`, `new_required` y `conditional_required`. Los condicionales se comprueban con `/categories/{id}/attributes/conditional`. https://developers.mercadolibre.com.co/en_us/attributes
- **Foto principal:** fondo blanco puro; una foto de baja calidad modera con `poor_quality_thumbnail`. https://developers.mercadolibre.com.ar/es_ar/diagnostico-imagenes
- **Envío:** modos `me2`, `me1`, `custom` y `not_specified`; las preferencias del vendedor indican cuál es obligatorio. Flex se activa por ítem. https://developers.mercadolibre.com.co/es_co/mercadoenvios-modo-2 , https://developers.mercadolibre.com.co/es_co/envios-flex
- **Subestados:**
  - `warning` pasa a `waiting_for_patch` a los 2 días;
  - `held` espera moderación manual;
  - `picture_download_pending` espera la descarga de fotos;
  - `out_of_stock` se reactiva sola al reponer.

  https://developers.mercadolibre.com.co/en_us/moderations-paused
- **Calidad:** se consulta en `GET /item/{id}/performance` y reemplaza a `/health`. https://developers.mercadolibre.com.ar/es_ar/calidad-de-publicaciones
- **Stock UP:** `PUT /user-products/{id}/stock/type/selling_address` con `x-version`. No se confirmó si `PUT /items {available_quantity}` sigue valiendo para vendedores UP; hoy funciona en nuestras 21 publicaciones. https://developers.mercadolibre.com.ar/es_ar/stock-distribuido
- **Avisos útiles para UP:** `user-products-families` y `stock-locations`, además de `items`. https://developers.mercadolibre.com.ar/es_ar/productos-recibe-notificaciones
- **No verificado:** fecha de activación de UP en Colombia, umbral de envío gratis, precio mínimo y cantidad máxima por país.

## 6. Hallazgos, de más a menos grave

| # | Severidad | Hallazgo | Evidencia | Causa | Impacto |
|---|---|---|---|---|---|
| H1 | Alta | Identificadores: no se envía `EMPTY_GTIN_REASON`, y las marcas registradas exigen un GTIN que no tenemos | `EMPTY_GTIN_REASON` viene `hidden` + `conditional_required`, y `parseMercadoLibreCategoryAttributes` descarta los `hidden`. 881 de 881 productos están marcados «sin identificador». `/items/validate`: el Cuaderno NORMA responde «The attributes [GTIN] are required for category [MCO388307]» aunque lleve el motivo vacío. El kit y la agenda, de marca genérica, pasan con o sin el motivo. | Filtro de atributos ocultos; catálogo sin GTIN | Productos de marca registrada: rechazados. Marcas genéricas: se publican, pero según la documentación pueden quedar moderados o pausados sin el motivo. |
| H2 | Alta | El asistente ofrece una sola foto | La búsqueda de productos (`app/api/[storeId]/products/search/route.ts`) trae `images: { take: 1 }`. El asistente usa esa lista para elegir fotos y nadie vuelve a pedir la ficha completa. Verificado en producción: 1 de 6. | Datos incompletos al elegir el producto | Publicaciones de baja calidad: menos visitas y peor puntaje. Solo «Editar» sobre una publicación ya guardada carga hasta 10 fotos. |
| H3 | Alta | Los atributos `conditional_required` no se piden | El parser marca obligatorio solo `required`/`new_required`. UNITS_PER_PACK es condicional en Cuadernos y en Agendas. | Regla incompleta | ML lo rechaza en el `POST /items`. El error manda a «Ficha técnica», donde ese atributo no tiene campo propio, solo el cuadro de texto libre `CODIGO=valor`. Paula se queda atascada. |
| H4 | Alta | 15 publicaciones en ML sin vínculo con el panel (los tote bags entre ellas) | 3 avisos `items` del 2026-10-08 03:18 UTC. Las páginas públicas muestran la familia «Tote Bag…» con 2 unidades por diseño. Los 5 tote bags del panel no tienen publicación. En las tres el «Modelo» es el mismo SKU (`BOL-GAT-NEG-M-L-7051`). | Paula publicó directo en ML | Stock desconectado en ambos sentidos y riesgo de sobreventa. Una venta en ML llegará sin producto local y quedará como excepción de inventario. |
| H5 | Alta | Nombre de familia por defecto = nombre de la variante | El asistente asigna `familyName = producto.name` al elegir el producto (`listing-manager.tsx`), y el servidor cae al mismo valor. Nada lo une al nombre del grupo. | Valor por defecto pensado para productos sueltos | Cada variante queda como su propia familia: no hay selector de color o diseño en ML, y el color se repite en el título. Publicar un grupo de 5 exige 5 pasadas completas del asistente; los tote bags muestran que Paula espera una sola familia. |
| H6 | Media | Nunca se ha probado el camino actual en producción | 0 eventos PUBLISH_LISTING y 0 borradores desde 2026-09-11. Ningún registro de errores del lado del cliente. | Sin uso y sin telemetría previa al guardado | No se puede reproducir el fallo que reporta Christian. Los errores de validación del paso 1 solo se ven en pantalla. |
| H7 | Media | Categoría sugerida incorrecta para kits | «Kit Puppy Pochacco» sale como «Kits de Cuidado de la Piel». | `domain_discovery` sobre el nombre del producto | Si Paula acepta la sugerencia, el kit queda en una categoría errada: moderación, o atributos y comisión de otra categoría. |
| H8 | Media | Huecos de token y autenticación | Si falla la renovación del token, la conexión nunca pasa a «Requiere reconexión» (`client.ts`). Los errores de autenticación al validar la categoría se tratan como transitorios y se reintentan 12 veces (`listings.ts`). El stock y el precio se sincronizan con `fetch` directo, sin timeout ni manejo de 401 (`outbox.ts`). | Manejo de errores incompleto | Con un token de renovación inválido, todo falla en silencio durante horas; la pantalla sigue diciendo «Conectada». |
| H9 | Media | Las ediciones no llegan a ML | Cambiar el nombre de familia o la categoría de una publicación activa encola contenido, pero la sincronización solo envía fotos, ficha y descripción. Editar el producto (nombre, descripción, fotos, incluidas las del grupo tras #13/#17) no encola nada. `docs/mercadolibre.md` dice que sí llega. | Diseño incompleto y documentación desalineada | Lo que se ve en ML diverge del panel sin aviso. Paula cree que editó y en ML no cambió. |
| H10 | Baja | Varios detalles menores | `me2` fijo, sin consultar los modos del vendedor; `shipping.dimensions` obsoleto junto a los atributos PACKAGE_*; sin `sale_terms` (garantía; ML muestra «Sin garantía»); la sincronización de stock no mira si el ítem está cerrado; PAUSE_LISTING y ACTIVATE_LISTING sin uso; `syncPrice` tiene un valor por defecto distinto en base y en interfaz; las advertencias de ML pueden presentarse como causa del rechazo; la publicación dentro de la misma petición encadena 4 llamadas de hasta 15 s cada una. | — | Calidad y mantenimiento. |

| H11 | Media | El panel no lee los precios de vuelta | MCO4365282418: panel 30.000, ML 32.000. MCO2160030669: panel 50.000, ML 58.000. El panel no procesa el tema `items_prices`. | Lectura de precios solo al importar | El panel muestra precio y margen desactualizados. |
| H12 | Media | Errores de ML sin campo asociado | Si falta un atributo obligatorio que arma el título, ML responde «Error getting resource /decorations/build-title … attributes are required» solo en `message`, sin `cause[]`, y `mapCause` no lo ve. `/items/validate` responde 400 aunque solo haya advertencias. | Mapeo de errores incompleto | Paula ve un error técnico y no sabe qué campo completar. |

**No son hallazgos:**
- User Products: la cuenta ya está en UP y la carga ya tiene esa forma.
- La sincronización de stock panel → ML funciona.
- Archivar pausa la publicación, y un ítem sin stock se queda en 0 (no se cierra).

## 7. Plan propuesto, por bloques

Ningún bloque necesita migración ni token de escritura en producción.

**A. Arreglos rápidos (≤ 1 día cada uno, solo código y pruebas):**

| Bloque | Qué | Riesgo |
|---|---|---|
| A1 | Enviar siempre `EMPTY_GTIN_REASON` cuando el producto no tiene GTIN («Kit» para kits; para el resto, el valor que defina Paula, ver pregunta 3). Conservar los atributos `hidden` + `conditional_required` que el vendedor sí puede enviar. | Bajo |
| A2 | Al elegir el producto, cargar todas sus fotos (hasta 12, en el orden de la galería) en vez de la de la búsqueda. | Bajo |
| A3 | Pedir los `conditional_required` como campos con su lista de valores, o consultar `/categories/{id}/attributes/conditional` con el borrador. | Medio |
| A4 | Botón «Validar con Mercado Libre» en el paso 4 (`POST /items/validate`), obligatorio antes de «Publicar». Cada causa se muestra en español junto a su campo, y las advertencias se separan de los errores. | Bajo |
| A5 | Si el producto es variante de un grupo, el nombre de familia por defecto es el nombre del grupo, con el aviso de no incluir color ni diseño. | Bajo |

**B. Trabajo mediano (1 a 3 días):**

| Bloque | Qué | Riesgo |
|---|---|---|
| B1 | «Publicar grupo»: un asistente que crea N publicaciones (una por variante) con el mismo `family_name`, la ficha común una sola vez y fotos y stock por variante. | Medio |
| B2 | Token y autenticación: un fallo al renovar pasa la conexión a «Requiere reconexión» y avisa por correo; los 401/403 dejan de contar como transitorios; el stock y el precio usan el cliente común con timeout. | Bajo |
| B3 | Ediciones: avisar o encolar la sincronización de contenido cuando cambian nombre, descripción o fotos del producto. Bloquear o enviar los cambios de familia y categoría tras publicar. Corregir `docs/mercadolibre.md`. | Medio |
| B4 | Categoría: mostrar la ruta completa y no preseleccionar sugerencias de dominios ajenos (piel, belleza) para kits de papelería. Usar el perfil rápido por categoría local. | Bajo |

**C. Operativo (Paula o Christian, sin código):**
- C1. Vincular los 5 tote bags con «Importar existentes». Antes, en ML, poner en cada diseño su propio SKU como «Modelo», porque hoy los 5 dicen `BOL-GAT-NEG-M-L-7051`. El vínculo producto ↔ publicación se confirma a mano, nunca se adivina.
- C2. Hasta resolver A1 a A5, no publicar desde el panel productos sin GTIN, que hoy son todos.

**D. Más grande o posterior:**
- Consultar los modos de envío del vendedor (me2 o Flex) en vez de fijar `me2`.
- Revisar la calidad de las fotos (mínimo 500 px, fondo blanco en la principal).
- Puntaje de calidad (`/item/{id}/performance`).
- Conciliación diaria (#11) y resumen semanal (#12).
- Suscribirse a `user-products-families` y `stock-locations`.

**Orden recomendado:** primero A1, A2, A4 y A5. Luego una prueba real con un producto sencillo, validando antes con `/items/validate` y con la aprobación de Christian para publicar. Después A3, B2, B1 y B3.

## 8. Cobertura de pruebas del camino de publicación

**Cubierto** (unitarias y de componentes):
- carga y validación por paso, relleno y exención de GTIN;
- publicación por la cola con el ID guardado antes de la descripción;
- clasificación de errores y reintentos, mapeo de estados;
- ruta de publicación (201/409/400).

**Sin cubrir:**
- la búsqueda con 1 foto que alimenta el asistente;
- `EMPTY_GTIN_REASON` y `conditional_required`;
- la forma exacta de la carga UP;
- la transformación de URLs de fotos;
- `shipping.dimensions` junto con los atributos PACKAGE_*;
- un fallo de renovación del token durante la publicación;
- 401 en la sincronización de stock o precio;
- cambios de familia o categoría que deberían llegar a ML;
- agrupar variantes en una familia;
- ninguna prueba de integración ni E2E recorre la publicación.

## 9. Preguntas abiertas

1. **¿Qué falló exactamente?** En qué paso, qué mensaje, qué producto y en qué fecha. ¿Los tote bags se publicaron directo en ML porque el panel falló, o porque era más rápido?
2. **¿Apruebas un clic de solo lectura** (Centro de operaciones → «Actualizar») para que producción renueve su token? ¿O espero el próximo aviso de ML? Con el token fresco corro las lecturas de §10.
3. **Motivo de GTIN vacío por defecto:** ¿«Otro» o «No registrado» para productos sin código, y «Kit» para kits? (Valores por confirmar en la ficha real de MCO.)
4. **Marca:** solo 7 productos tienen marca y BRAND es obligatoria en muchas categorías. ¿Usamos una marca por defecto (por ejemplo la del proveedor), o Paula la escribe cada vez?
5. **Grupos:** ¿publicar un grupo debe ser siempre una sola familia con el nombre del grupo? (Recomendado: sí.)
6. **Tote bags:** ¿quién corrige el «Modelo» en ML y cuándo se vinculan (C1)?

### Decisiones pendientes (en orden)

1. **Margen objetivo de la tienda:** aprobar una migración para un campo `Store.mercadoLibreTargetMarginPercent`, o dejarlo para después. Sin ese campo, el asistente solo avisa por debajo del punto de equilibrio.
2. **Regla de precio:** elegir entre A, B y C, o la recomendada (el mayor entre C y 20 % neto). Los precios vivos no se tocan.
3. **Tote bags:** Christian pulsa «Vincular y sincronizar» en «Importar existentes» (las 5 ya quedaron marcadas), o da el permiso.
4. **Push** del bloque de arreglos rápidos.

## 10. Lecturas con token (2026-10-08)

**Cuenta:**
- Etiquetas `user_product_seller`, `eshop` y `normal`; reputación `4_light_green`; experiencia `NEWBIE`.
- Modos de envío: `custom`, `not_specified` y `me2`. Me2 usa `xd_drop_off` por defecto y tiene `fulfillment` activo.
- Tipos de publicación disponibles: `gold_pro`, `gold_special` y otros.

**Las 21 publicaciones vinculadas frente a ML:**
- Estado: 21 de 21 coinciden. Las 5 pausadas tienen `sub_status` `out_of_stock`, y una además `paused_by_seller`.
- Stock: 21 de 21 coinciden.
- Precio: 2 difieren (H11).
- Todas usan User Products, `me2/xd_drop_off`, y tienen entre 2 y 6 fotos.

**`/items/validate`, que no crea nada.** Responde 400 incluso cuando solo hay advertencias:

| Carga | Respuesta |
|---|---|
| Cualquier muestra con `title` y sin `family_name` | error `body.required_fields [family_name]`: la cuenta es UP |
| Cuaderno NORMA, como lo arma el asistente | error «[GTIN] required» y advertencia «El campo "Modelo" es obligatorio» |
| Cuaderno NORMA + Modelo + motivo de GTIN vacío | error «[GTIN] required»: la marca exige el código real |
| Agendas Flores, como lo arma el asistente | «Error getting resource /decorations/build-title … attributes are required» (sin `cause[]`) |
| Agendas + Fabricante + Modelo, con y sin motivo vacío; con la familia del grupo y 6 fotos | solo la advertencia `shipping.lost_me1_by_user` → válida |
| Kit, como lo arma el asistente (categoría sugerida errada) | error «[BRAND] required» |
| Kit + Marca «Genérica», con y sin motivo «kit o pack» | solo la advertencia de envío → válida |

**Valores de MCO** para `EMPTY_GTIN_REASON`:
- 17055158 «El producto es una pieza artesanal»
- 17055159 «El producto es un kit o un pack»
- 17055160 «El producto no tiene código registrado»
- 17055161 «Otra razón»

En las categorías de muestra, la marca es texto libre. En Termos (MCO441480) es una lista cerrada de 47 valores, sin «Genérica».

## 11. Tote bags y publicaciones sin vincular

Autorizado: corregir el SKU de los tote bags en ML y vincularlos en el panel.

**Lectura previa** (copia local en `output/audits/2026-10-08-tote-bags/`):
- «Importar existentes» vincula por `SELLER_SKU` o `seller_custom_field`, no por «Modelo».
- Las 5 publicaciones de la familia ya tienen `SELLER_SKU` correcto y distinto, uno por diseño. Solo «Modelo» repite `BOL-GAT-NEG-M-L-7051`, y la vinculación no lo usa.
- Por eso **no se escribió nada en Mercado Libre**. El «después» es igual al «antes».

| Publicación | Diseño | SELLER_SKU en ML | Producto del panel | Stock ML / panel |
|---|---|---|---|---|
| MCO2261788267 | Frida Cato | BOL-ART-ROJ-M-L-7146 | Tote bag «Frida Cato» | 2 / 2 |
| MCO4510631212 | Un día a la vez | BOL-PER-NAR-M-L-6779 | Tote bag «Un día a la Vez» | 2 / 2 |
| MCO2261801057 | Caribe | BOL-RAY-ROJ-M-L-2234 | Tote bag «Caribe» | 2 / 2 |
| MCO2261788269 | Italia | BOL-LIM-AMA-M-L-9267 | Tote bag «Italia» | 2 / 2 |
| MCO2261811885 | Aquí llevo cosas de señora | BOL-GAT-NEG-M-L-7051 | Tote bag «Aquí llevo cosas de señora» | 2 / 2 |

Las dos últimas no estaban en la lista de 3 de la autorización. Aparecieron al buscar la familia completa.

**Vinculación pendiente.**
- En «Importar existentes» se dejaron marcadas solo estas 5 y se desmarcaron los 2 kits que venían sugeridos.
- La confirmación final «Vincular y sincronizar» fue bloqueada por la capa de permisos de la sesión, así que se canceló el diálogo.
- Siguen 21 publicaciones vinculadas. **Falta que Christian pulse ese botón**, o que dé el permiso.

**Las otras 10 sin vincular** necesitan a Paula: no se pueden vincular solas.
- 2 kits con SKU correcto: Capibara MCO2261707501 y Gatos MCO2261709911.
- 4 mini impresoras con el mismo SKU `HER-KAW-BLA-S-P-3554`: MCO4148331084, MCO4141151426, MCO4141151428 y MCO4148188720.
- 2 troqueles con el mismo SKU `TRO-CLS-PAS-M-P-1164`: MCO4355140146 y MCO4355140144.
- 2 carpetas de ahorro sin SKU: MCO4355132126 y MCO4355144928.

## 12. Bloque de arreglos rápidos (implementado; sin push)

Decisiones de Christian del 2026-10-08:
- Motivo de GTIN vacío por defecto: «No registrado» (17055160), y «kit o pack» (17055159) para los kits. Paula lo puede cambiar.
- Marca: nunca se inventa. Se usa la del producto; si no tiene, se sugiere «Genérica» solo donde la categoría la acepta (texto libre, o una lista que la incluya).
- Un grupo se publica como una sola familia (#19).

| Hallazgo | Arreglo |
|---|---|
| H1 | El parser conserva los atributos `hidden` que el vendedor debe enviar (obligatorios o condicionales), así que `EMPTY_GTIN_REASON` llega al asistente y se rellena por id. El campo GTIN se puede editar aunque el producto esté marcado «sin identificador», porque las marcas registradas exigen el código real. En «Ficha técnica» se pide el GTIN o el motivo. |
| H2 | Al elegir el producto se cargan todas sus fotos en el orden de la galería (portada primero), hasta 10, por una ruta nueva `GET …/listings/product-photos`. Cada foto muestra el tamaño de la copia que descarga Mercado Libre; con una menor de 500 × 500 px, el paso no avanza y el mensaje dice cuál es y cuánto mide. La cola de publicación también lee las fotos en el orden de la galería. |
| H3 | Cada atributo `required`, `conditional_required` o `catalog_required` tiene su propio campo, con una nota cuando es condicional o de catálogo. |
| H5 | El nombre de familia por defecto es el del grupo. |
| H7 | Cada sugerencia dice para qué búsqueda la propone Mercado Libre. Hay un buscador «Buscar otra categoría». En un kit, una sugerencia de belleza, piel o salud sale marcada «no parece de papelería». |
| H12 | Nuevo «Validar con Mercado Libre» (`POST …/listings/{id}/validate` → `/items/validate`, no crea nada). «Publicar ahora» solo se habilita después de una validación correcta del estado actual del formulario. Cada error trae «Ir al campo». Las advertencias no bloquean, y la de modos de envío no se muestra. El error de título sin `cause[]` y el «[GTIN] required» de marca registrada salen en español. |

| Márgenes (§13–14) | El precio de Mercado Libre ya no parte del precio de la tienda. Por defecto, el precio que deja la misma ganancia por unidad que la tienda, calculado con la comisión, el envío obligatorio y las retenciones estimados; sin costo registrado queda vacío. En «Revisar y publicar»: precio sugerido con desglose (comisión real de `listing_prices`, envío cotizado o estimado, retenciones estimadas, costo, neto y margen frente a la tienda), botón «Usar …» y aviso en español por debajo del punto de equilibrio. La comisión se vuelve a consultar sola al cambiar el precio. Si Mercado Libre dice que el envío gratis es obligatorio (`discount.type = mandatory`), se marca y se descuenta siempre. **Pendiente de decisión:** el margen objetivo de la tienda necesita un campo nuevo en `Store` (migración); hasta entonces se avisa solo por debajo del punto de equilibrio, y la «Ganancia objetivo» por publicación sigue funcionando. |

**Verificación:**
- Pruebas unitarias, de componentes y de rutas nuevas.
- Suite completa de unitarias y componentes: 3540 pruebas.
- Integración: 518 de 518.
  - Una corrida previa falló en las alertas de salud de Mercado Libre por una conexión de prueba que dejó el recorrido local en la base de pruebas. Se borró y pasa.
  - `order-editing-flow` se cortó una vez por tiempo con la máquina cargada; pasa solo y en la corrida completa.
- `tsc` y build sin errores. Lint: las mismas 5 advertencias previas.
- Recorrido local con Playwright a 390, 768 y 1280 px contra la base de pruebas, con un token falso que nunca se renueva:
  - el producto elegido propone la familia del grupo;
  - el paso 2 ofrece las 6 fotos con su tamaño real;
  - el buscador de categoría encaja sin scroll horizontal.
- La validación contra Mercado Libre real y la publicación no se ejercitaron localmente: requieren el token de producción.
- El paso 4 (desglose de margen, precio sugerido y «Validar con Mercado Libre») tampoco se recorrió en el navegador a 390, 768 y 1280 px, porque necesita una categoría real. Solo está cubierto por pruebas de componentes.
- El envío gratis obligatorio solo se marca solo en borradores. En una publicación activa no se toca: cambiarlo sigue siendo «Aplicar condiciones».

## 13. Márgenes en Mercado Libre (solo lectura, 2026-10-08)

> El detalle por producto (costos, comisión, envío, neto y opciones de precio de las muestras) queda **solo en local**, en `output/audits/2026-10-08-ml-margenes-detalle.md`. El repositorio es público, y con el margen y los precios públicos se podría deducir el costo.

**Fuentes:**
- **Comisión:** `GET /sites/MCO/listing_prices` por precio, categoría y tipo.
- **Envío que paga el vendedor:** `GET /users/{id}/shipping_options/free` por publicación.
- **Retenciones:** un porcentaje estimado a partir de la facturación real de las ventas. Se muestra aparte de la comisión.
- **Costo unitario:** costo de adquisición + envío y otros gastos, desde el panel. A ningún producto revisado le falta.

**Lo que se revisó:**
- Las tarifas que cobra Mercado Libre a esta cuenta por tipo de publicación y categoría, el cargo fijo por unidad y si el envío gratis es obligatorio (`discount.type = mandatory`).
- Las publicaciones vinculadas, las tote bags sin vincular y tres muestras a precio de tienda: cuántas pierden, cuántas quedan por debajo del margen de la tienda y cuántas por debajo de un margen neto bajo.

**Lectura:**
- El envío gratis es obligatorio en todos los precios y lo paga en parte el vendedor. Sumado a la comisión, hace que los productos baratos pierdan o queden en el filo si se publican al precio de la tienda.
- La mayoría de las vinculadas son Premium, que cuesta más que Clásica.
- **Hallazgo aparte:** en varias ventas guardadas, `marketplaceFee` quedó en 0 y todo el descuento en `shippingCost`. El neto es correcto; el desglose no (#21).

> Cifras (tarifas, envío por unidad, umbral de pérdida, conteos por grupo) guardadas en local en `output/sensitive-docs/docs/audits/2026-10-08-mercadolibre-publicacion.md`.

## 14. Regla de precio propuesta (no aplicada)

**Fórmula.** Precio = el menor precio «amigable» (que termina en 900) que cumpla:

`precio − comisión(precio, categoría, tipo) − envío(precio) − r · precio − costo ≥ objetivo`, con `r` la tasa de retención estimada.

La comisión se consulta en `listing_prices` para cada candidato y se itera. Hoy es lineal (sin cargo fijo), así que se puede despejar:

- **Objetivo en pesos** (opción C): `precio = (costo + envío + objetivo) / (1 − tasa − r)`.
- **Objetivo en porcentaje del precio** (opciones A y B, objetivo = m · precio): `precio = (costo + envío) / (1 − tasa − r − m)`.

En ambos casos se redondea hacia arriba a …900 y se baja un escalón si todavía cumple.

**Opciones para el objetivo:**
- **A:** el mismo margen neto que la tienda.
- **B:** el margen de la tienda + 5 puntos.
- **C:** un mínimo de 10.000 COP netos por unidad.

Con las tres muestras, A y B dan precios poco competitivos frente a la tienda; C queda más cerca. Las cifras están en el detalle local.

**Recomendación:** el mayor entre C y un margen neto del 20 %. Deciden Christian y Paula.

**Regla:** los precios de las publicaciones vivas no se tocan. Cualquier cambio irá como lista revisada y con aprobación explícita.
