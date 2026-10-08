# Ola 3, fase 2: propuestas (2026-10-05)

Solo lectura y propuestas. **Nada de esto está implementado ni aplicado**: no hubo cambios de código, escrituras en producción, migraciones ni cambios en Merchant Center o Vercel. La fase 1 (P1-5, canónica de la paginación y marcado de envío) quedó en producción con `a21be221`, `ad4b3247`, `3c73bc5b` y `78e30b43` (`2026-10-05-seo-maintenance.md` §10).

Fuentes: API pública del admin; consultas de solo lectura con el usuario `pdepapel_ro`; GET a producción; Clarity, GA4 y Merchant Center en modo lectura; Playwright local contra producción, solo GET. Los guiones están en el borrador de la sesión, no en el repositorio.

## Decisiones que hacen falta

| # | Tema | Quién | Opciones (recomendación en **negrita**) | Sección |
|---|---|---|---|---|
| 1 | Plazo de devolución en el texto | Christian + Paula | **A: mantener «cinco (5) días hábiles contados desde la entrega»** · B: «siete (7) días calendario» (con un festivo quedan 4 hábiles, por debajo del mínimo legal) · C: 7 calendario «y nunca menos de 5 hábiles» | A.2.2 |
| 2 | Cómo nombrar el costo del envío | Paula | **Opción 1: «tarifa de referencia ronda los $ 13.000; en Medellín suele ser menor»** · opción 2: rangos con 15.000, por encima de lo que declara Merchant Center | A.2.1, A.2.3 |
| 3 | Cotizaciones por encima de 13.000 (p90 de Bogotá y del resto del país) | Christian | Topar el cobro en 13.000 · subir la tarifa de Merchant Center · aceptar la diferencia. Antes, confirmar en la ayuda de Merchant Center si declarar de menos es un problema | A.2.1 |
| 4 | Devoluciones solo por transportadora | Paula | Confirmar que nunca se reciben en persona; si sí, hay que cambiar Merchant Center | A.2.4 |
| 5 | Plazo del reembolso ordinario (Merchant Center dice 5 días) | Christian + Paula | Escribir un plazo en la página o cambiar Merchant Center | A.2.4 |
| 6 | `deliveryEstimate` «2 a 4» → «2 a 6 días hábiles» | Paula (panel) | Lo cambia ella en Configuración, el mismo día del deploy de la etiqueta nueva; no hace falta `prod:write` | A.3 |
| 7 | Textos SEO de 14 tipos y 32 categorías | Paula | Revisar los borradores; las categorías se cargan desde el panel, sin código | B.2 |
| 8 | Páginas propias de tipo (`/tienda/<tipo>`) | Christian | Migración + ruta + 308 desde `?typeId=` (esfuerzo L); candidatos: 8 tipos | B.3.4 |
| 9 | ¿«Lego» es la marca LEGO? | Paula | Si no lo es, renombrar a «Bloques de construcción» y conservar el slug como alias | B.2.2 |
| 10 | `seoEnabled` en categorías donde caen archivados | Paula | **Nivel 1: 10 categorías, desde el formulario y con textos propios**, más exigir al menos un producto vivo para redirigir a una categoría (b4) | C.3 |
| 11 | Caché de listados (P2-8) | Christian | **Opción E: CDN de Vercel con etiqueta `listados`**, probada antes en un Preview (requiere push o deploy aprobado) · B: ISR con gemela (riesgos fuertes, puede salir más cara) | D.2 |
| 12 | Arreglos de CLS | Christian | **Recuadro de `<SignedOut>` debajo del contenido en favoritos**, franja con `transform`, esqueleto del carrito igual al real, carril del inicio con alto fijo; medir en campo antes de tocar `/tienda` | E.4 |
| 13 | Slug de producto único por tienda | Christian | Primero el código (importación por lotes, conversión a variantes y sincronización en dos fases), después la migración propuesta | F.4 |
| 14 | ¿Indexar `?page=N`? | Christian | Hoy: canónica propia + `noindex, follow` (lectura conservadora de la fase 1). Un `noindex` largo termina tratándose como `nofollow` | §10.1 |

Pendiente aparte: confirmar que `StoreSettings.freeShippingThreshold`, que usa el bot de WhatsApp, también vale 250.000. Es otra columna que `Store.freeShippingThreshold` (A.1.6).


## A y B — Textos de envíos y devoluciones, y textos de tipos y categorías (P1-6)

Fecha: 2026-10-05. Trabajo de solo lectura: no se editó ningún archivo del repositorio, no se escribió en ninguna base de datos ni API y no se hizo push. Los datos en vivo salen de la API pública del admin (`/public/storefront`, `/home-content?live=1`, `/types`, `/categories`, `/products`). No se leyó ningún secreto ni dato personal.

Referencias de contexto: `docs/seo/2026-10-05-seo-maintenance.md` §9.13 y §9.13.2 (Merchant Center), `pdepapel-store/lib/commerce-policies.ts`, `pdepapel-store/tests/unit/lib/commerce-policies.test.ts`.

---

### A. Textos de envíos y devoluciones

#### A.0 Lo que dice Merchant Center hoy y lo que dice la tienda

| Tema | Merchant Center (§9.13.2) | Marcado JSON-LD (`lib/commerce-policies.ts`) | Texto visible hoy |
|---|---|---|---|
| Tarifa | Fija 13.000 COP a todo el país | 13.000 (`STANDARD_SHIPPING_RATE`, :47) | «El costo lo calcula la transportadora» (`politicas/envios/page.tsx:111`) |
| Envío gratis | Pedidos de más de 249.999 COP | Desde `Store.freeShippingThreshold` (250.000, inclusive) | «Envío gratis desde $ 250.000» (umbral leído de la base) |
| Preparación | 0–1 día hábil, lunes a viernes, corte 12:00 | 0–1, corte `12:00:00-05:00` | «el mismo día si el pago se confirma antes de las 12:00 m. … si no, el siguiente día hábil» |
| Tránsito / total | 2–5 / 2–6 días hábiles | tránsito 2–5 | `deliveryEstimate` = «2 a 4 días hábiles» (base de datos) |
| Plazo de devolución | 7 días, solo productos nuevos, solo por correo | `merchantReturnDays` 7, `ReturnByMail` | «cinco (5) días hábiles contados desde la entrega» |
| Quién paga la devolución | «Responsabilidad del cliente» | `customerRemorseReturnFees` del cliente, `itemDefectReturnFees` gratis | Igual en el texto (`devoluciones/page.tsx:78-85`) |
| Reembolso | Procesamiento 5 días (el formulario no deja elegir el medio) | — | Retracto: mismo medio de pago, máximo 15 días calendario (`devoluciones/page.tsx:110-115`); devolución ordinaria: no dice medio ni plazo |

Costos reales cobrados por EnvioClick (pedidos pagados, 12 meses): se calcularon p50 y p90 por zona (Medellín metro, Bogotá, resto de Antioquia, resto del país); Medellín metro es la zona más barata. Cifras guardadas en local en `output/sensitive-docs/docs/seo/2026-10-05-wave-3-phase-2-proposals.md`.

#### A.1 Inventario de afirmaciones visibles

Leyenda: **Código** = texto en el repositorio (cambia con un commit y un deploy). **BD** = valor guardado en la base y editable desde el panel; el texto que lo rodea sí es código.

##### A.1.1 Página de envíos — `pdepapel-store/app/(routes)/politicas/envios/page.tsx` (código, con dos valores de BD)

| Línea | Texto actual | Origen |
|---|---|---|
| 13-14 | meta description: «Cómo, cuándo y cuánto cuesta recibir tu pedido de Papelería P de Papel: tiempos de entrega, costo del envío, transportadoras, guía de rastreo y qué hacer si no estás en casa.» | Código |
| 32-41 | Ficha: valor `{deliveryEstimate}` («2 a 4 días hábiles»), etiqueta «después del despacho» | BD (valor) + código (etiqueta) |
| 42-48 | Ficha: «Envío gratis desde $ 250.000» / «en productos, a toda Colombia» | BD (`Store.freeShippingThreshold`) + código |
| 49-54 | Ficha sin umbral: «Sin cargos ocultos» / «el envío que ves es el que pagas» | Código (no se ve hoy: hay umbral) |
| 55-60 | Ficha: «Guía y rastreo» / «en Mis pedidos y en tu correo» | Código |
| 69-72 | «Preparamos y despachamos los pedidos desde Medellín el mismo día si el pago se confirma antes de las 12:00 m. (hora de Colombia), de lunes a viernes; si no, el siguiente día hábil.» | Código |
| 73-78 | «A partir de ahí, la transportadora entrega en **{deliveryEstimate}** en la mayoría de ciudades de Colombia; en municipios lejanos puede tomar un poco más.» | BD + código |
| 80-83 | (sin `deliveryEstimate`) «A partir de ahí el tiempo depende de la ciudad de destino y de la transportadora.» | Código |
| 85-86 | «En el checkout ves el tiempo estimado de cada transportadora antes de pagar.» | Código |
| 90-91 | «En Medellín y el Valle de Aburrá buscamos entregar en un máximo de 48 horas hábiles después de la compra.» | Código |
| 94-95 | «Los pedidos pagados el fin de semana o en días festivos se despachan el siguiente día hábil.» | Código |
| 98-99 | «Si necesitas una entrega urgente, escríbenos antes de comprar y te decimos si podemos acelerarla.» | Código |
| 111-113 | «El costo lo calcula la transportadora según tu ciudad y el tamaño del paquete, y lo ves en el checkout antes de pagar. **Sin cargos ocultos: el envío que ves es el que pagas.**» | Código |
| 117-120 | «Cuando el valor de los productos alcanza **$ 250.000**, el envío es gratis a cualquier ciudad con cobertura. El descuento se aplica solo en el checkout.» | BD + código |
| 132-141 | Transportadoras, guía por correo, «Mis pedidos»; pago contra entrega en algunas ciudades | Código |
| 152-163 | Si no estás en casa: reprogramación, espera de 15 minutos en entregas propias en Medellín, tercer intento con costo | Código |
| 173-176 | «Revisa el paquete al recibirlo. Si llegó con daños, falta algo o no es lo que pediste, escríbenos el mismo día con una foto…» | Código |
| 189 | lede: «Cómo, cuándo y cuánto cuesta recibir tu pedido. Lo que dice aquí es lo mismo que ves en el checkout.» | Código |

##### A.1.2 Página de devoluciones — `pdepapel-store/app/(routes)/politicas/devoluciones/page.tsx` (código)

| Línea | Texto actual |
|---|---|
| 11-12 | meta description: «Cambios y devoluciones en Papelería P de Papel: cinco (5) días hábiles contados desde la entrega, condiciones del producto, quién paga el envío y reembolsos.» |
| 25-26 | Ficha: «5 días hábiles» / «contados desde la entrega para avisarnos» |
| 31-32 | Ficha: «Producto sin usar» / «en su empaque y estado original» |
| 37-38 | Ficha: «Errores nuestros, sin costo» / «asumimos todos los envíos» |
| 49-52 | «Tienes **cinco (5) días hábiles contados desde la entrega** para avisarnos de cualquier cambio o devolución. Escríbenos por WhatsApp o correo con el número de pedido, el producto y, si aplica, una foto del problema. Te respondemos con los pasos a seguir.» |
| 63-68 | «…sin abrir, sin usar y con su empaque completo.» / «No aceptamos devoluciones de productos abiertos, probados o usados…» |
| 79-84 | «Si el cambio o la devolución es por un error nuestro (producto equivocado, defectuoso o incompleto), asumimos todos los costos.» / «Si es por decisión tuya, los costos de envío corren por tu cuenta.» |
| 93-95 | Defectos de fabricación: «lo cambiamos sin costo adicional…» |
| 105-107 | «Si un producto que compraste ya no está disponible, te reembolsamos su valor. El tiempo en que ves el dinero depende del método de pago original (pago en línea o transferencia).» |
| 110-115 | «Si te retractas de la compra, te devolvemos el dinero por el mismo medio de pago, o por el que acordemos contigo, en máximo quince (15) días calendario desde que ejerces el derecho, nos das los datos para el reembolso y nos devuelves el producto. Si lo prefieres, el valor puede quedar como saldo a favor para usar en otros productos de la tienda.» |

Lo que falta frente a Merchant Center: la página no dice que la devolución se hace **por envío** (Merchant Center: «solo por correo»), ni que una devolución ordinaria aceptada se reembolsa **al medio de pago original**.

##### A.1.3 Ficha de producto, carrito, checkout y pedido (código, con valores de BD)

| Archivo:línea | Texto actual | Origen |
|---|---|---|
| `components/product-details-accordion.tsx:65` | Título del acordeón «Envíos y cambios» | Código |
| `components/product-details-accordion.tsx:70-71` | «Enviamos a toda Colombia con transportadora; llega en {deliveryEstimate} después del pago.» (sin valor: «…una vez se confirma el pago.») | BD + código |
| `components/product-details-accordion.tsx:73` | «Envío gratis en pedidos desde $ 250.000.» | BD + código |
| `components/product-details-accordion.tsx:74` | «Pago en línea o transferencia bancaria; si el pago se confirma antes de las 12:00 m. (lunes a viernes), el pedido sale el mismo día; si no, el siguiente día hábil.» | Código |
| `components/product-details-accordion.tsx:75` | «Cambios hasta cinco (5) días hábiles contados desde la entrega, con el producto sin uso y en su empaque.» | Código |
| `components/product-signals.tsx:105-110` | «Llega en **{deliveryEstimate}** a toda Colombia · ver envíos» (sin valor: «Enviamos a toda Colombia») | BD + código |
| `components/product-signals.tsx:82-83` | Preventa: «Pagas el total hoy y lo despachamos el **{fecha}**.» | Código + dato del producto |
| `components/product-signals.tsx:142` | «Cambios hasta cinco (5) días hábiles contados desde la entrega · ver condiciones» | Código |
| `components/product-info.tsx:656` | Sello con enlace: «Envíos a toda Colombia» | Código |
| `components/free-shipping-progress.tsx:37-42` | «Calculando tu envío gratis…» / «¡Tu pedido tiene envío gratis!» / «Te faltan $ X para el envío gratis» | BD (umbral) + código |
| `app/(routes)/carrito/components/cart.tsx:217` | «Te faltan $ X para el envío gratis» | BD + código |
| `app/(routes)/carrito/components/cart.tsx:247-249` | Carrito vacío: «… Envío gratis desde $ 250.000.» | BD + código |
| `app/(routes)/carrito/components/summary.tsx:196` | «Envío gratis incluido» / «Sin envío» · IVA incluido | Código |
| `components/presale-cart-notice.tsx:66-68` | «¿Necesitas lo demás antes? **Haz dos pedidos**: uno con lo disponible, que sale en 2 a 5 días hábiles, y otro con la preventa.» | Código (número fijo, no sigue a `deliveryEstimate`) |
| `finalizar-compra/components/steps/shipping-info-step.tsx:525` | «Transportadoras a todo el país. Cotizamos al instante.» | Código |
| `finalizar-compra/components/steps/shipping-info-step.tsx:531-532, 1009-1014` | «Domicilio mismo día» / «Solo Medellín y Valle de Aburrá.» / «Entregamos con nuestro domiciliario… el valor del domicilio se acuerda allí.» | Código |
| `finalizar-compra/components/steps/shipping-info-step.tsx:553-554` | «Las tarifas se calculan solas cuando completas ciudad y dirección.» | Código |
| `components/ui/shipping-rates-selector.tsx:32-33` y `finalizar-compra/components/steps/payment-info-step.tsx:66` | «Llega en N días hábiles» (N lo da la cotización de la transportadora) | Dato de EnvioClick + código |
| `finalizar-compra/components/steps/payment-info-step.tsx:303` | «Envío gratis» | Código |
| `finalizar-compra/components/multi-step-checkout-form.tsx:1258, 1270, 1281` | «Al continuar aceptas las políticas de entrega y cambios» (el enlace va solo a `/politicas/envios`) | Código |
| `finalizar-compra/components/multi-step-checkout-form.tsx:1518` | «Cambios hasta cinco (5) días hábiles contados desde la entrega.» | Código |
| `finalizar-compra/components/info-country-tooltip.tsx:18` | «Por el momento sólo tenemos envíos a todo Colombia.» | Código |
| `pedido/[orderId]/components/order-help-card.tsx:26-27` | «Cambios y devoluciones» / «Cinco (5) días hábiles contados desde la entrega» | Código |
| `pedido/[orderId]/components/order-shipping-card.tsx:91` | «N días hábiles después del despacho» (N de la cotización guardada) | Dato del pedido + código |
| `lib/order-status.ts:302` | Línea de tiempo del pedido pagado: «Sale en 1 día hábil» | Código |
| `lib/order-status.ts:75` | Cancelado: «…escríbenos y te ayudamos con el reembolso.» | Código |

##### A.1.4 Inicio, barra, pie de página y otras páginas

| Archivo:línea | Texto actual | Origen |
|---|---|---|
| Hero en vivo (`GET /home-content?live=1`, modelo `HomeContent`, panel › Inicio) | título «Papelería bonita desde Medellín con envíos a toda Colombia»; subtítulo «…Pago en línea seguro y envíos a todo el país.» | **BD** |
| `components/home/hero.tsx:16-18` | Respaldo si no hay hero en la base: «…tu pedido sale de Medellín el mismo día si pagas antes del mediodía, o el siguiente día hábil.» | Código (no se ve hoy) |
| `lib/trust-points.ts:9, 14-17` | «Envío gratis desde $ 250.000» / «Desde Medellín enviamos a toda Colombia.» (hero y tienda) | BD + código |
| `components/announcement-bar.tsx:52, 57` | «Envíos a toda Colombia» / «Envío gratis desde $ 250.000» | BD + código |
| `components/footer.tsx:59-60, 123, 142, 150` | «…envíos a toda Colombia», «Tienda online con envíos a todo el país», enlaces «Políticas de devolución o cambio», «Políticas de entrega» | Código |
| `app/(routes)/nosotros/page.tsx:141-142` | «Envíos a toda Colombia» / «Ciudades y municipios con cobertura de transportadoras.» | Código |
| `app/(routes)/contacto/page.tsx:27, 315` | «…envíos a todo el país…» / «A ciudades y municipios con cobertura de las transportadoras» | Código |
| `app/(routes)/tienda/page.tsx:28` | «Cuadernos, stickers, agendas y regalos bonitos con envío a toda Colombia.» | Código |
| `app/(routes)/categoria/[slug]/page.tsx:53` | Meta de respaldo: «…con envíos a toda Colombia.» | Código |
| `lib/product-metadata.ts:83-84` | Meta de la ficha: «Envío a toda Colombia, gratis desde $ 250.000.» | BD + código |
| `app/(routes)/page.tsx:55, 83, 103` | Metas del inicio: «…con envíos a toda Colombia.» | Código |

Ninguna de estas promete costo ni plazo: **no necesitan cambio**. No hay página de preguntas frecuentes (búsqueda de «preguntas frecuentes», «faq», «FAQPage» sin resultados).

##### A.1.5 Correos (admin, `pdepapel-admin/emails/`)

`order-notification.tsx`, `gift-notification.tsx` y `gift-card-delivery.tsx` hablan de estados («Tu pedido salió de la papelería», «Tu pedido llega hoy») pero no prometen costo, plazo ni condiciones de devolución. `gift-card-delivery.tsx:104` enlaza a `/politicas/devoluciones` como «Condiciones de uso». **Sin cambios.**

##### A.1.6 Bot de WhatsApp (admin) y panel

| Archivo:línea | Texto | Origen |
|---|---|---|
| `pdepapel-admin/lib/whatsapp/bot-facts.ts:402-403` | «Desde {umbral} el envío es gratis 💛 Si te falta poquito…» | BD (`StoreSettings.freeShippingThreshold`) + código |
| `pdepapel-admin/lib/whatsapp/bot-facts.ts:404-405` | «Tu pedido llega en {deliveryEstimate} 💛 Te paso el número de guía apenas lo despache.» | BD (`StoreSettings.deliveryEstimate`) + código |
| `pdepapel-admin/app/(dashboard)/[storeId]/(routes)/configuracion/components/business-info-panel.tsx:216-228` | Campo «Cuánto tarda en llegar», placeholder «2 a 4 días hábiles», ayuda «Sobre 106 entregas reales: la mitad llegó en menos de un día y el 94 % en cuatro o menos.» | Código (interno, lo lee Paula) |
| `pdepapel-admin/lib/store-settings.ts:255` | `DEFAULT_DELIVERY_ESTIMATE = "2 a 4 días hábiles"` (solo rellena el formulario cuando el campo está vacío) | Código |

Nota: el umbral del bot sale de `StoreSettings.freeShippingThreshold` (`schema.prisma:1585`), una columna distinta de `Store.freeShippingThreshold` (`schema.prisma:34`), que es la que usan la tienda y el checkout. Conviene confirmar que las dos valen 250.000 (no se pudo leer la de `StoreSettings` sin base de datos; la API pública solo expone la de `Store`).

##### A.1.7 Valores en base de datos (leídos de la API pública el 2026-10-05)

`GET https://admin.papeleriapdepapel.com/api/f23ee5bc-1f6f-4c10-9872-9e6217cc17fd/public/storefront`:

| Campo | Modelo | Valor |
|---|---|---|
| `freeShippingThreshold` | `Store.freeShippingThreshold` | 250000 |
| `deliveryEstimate` | `StoreSettings.deliveryEstimate` (`schema.prisma:1588`, máx. 120 caracteres, `store-settings.ts:90`) | «2 a 4 días hábiles» |
| `cityName` | `StoreSettings.cityName` | «Medellín» |

`StoreSettings` no tiene otros campos de texto sobre envíos o devoluciones; el resto son horarios, ciudad, local físico, pedido mínimo y formas de pago (`schema.prisma:1570-1600`). El hero del inicio está en `HomeContent` (A.1.4).

#### A.2 Textos propuestos (para aprobación de Paula)

##### A.2.1 Riesgo frente a Merchant Center y la redacción menos riesgosa

- El texto «lo calcula la transportadora» por sí solo no contradice a Merchant Center: el checkout de verdad cobra la cotización de EnvioClick. Lo que sí crea una contradicción visible es **escribir en la página un número mayor que 13.000** (por ejemplo «13.000–15.000»): Google vería en la página de la política un costo más alto que el declarado.
- El riesgo de fondo existe con cualquier texto: el checkout ya cobra más de 13.000 en parte de los pedidos de Bogotá y del resto del país. Mi entendimiento es que Merchant Center tolera declarar de más pero no de menos frente a lo que se cobra en el checkout; **conviene confirmarlo en la ayuda de Merchant Center antes de decidir**, porque no lo verifiqué en esta tarea.
- **Recomendación (opción 1):** anclar el texto en la cifra de Merchant Center y mencionar solo números menores: «tarifa de referencia de $ 13.000; en Medellín y el área metropolitana suele ser menos». Nunca escribir una cifra mayor que 13.000.
- **Opción 2 (la del encargo):** rangos «Medellín ≈ 7.000–10.000; Bogotá y el resto del país ≈ 13.000–15.000». Es más honesta con la clienta de Bogotá, pero deja en la página una cifra mayor que la de Merchant Center.
- **Decisión aparte (no de texto):** qué hacer cuando la cotización supera 13.000. Tres salidas: (a) topar el cobro en 13.000 y absorber la diferencia; (b) subir la tarifa de Merchant Center al p90 (≈ 15.300) y declarar de más en Medellín; (c) aceptar la diferencia. Cualquiera de las tres es una decisión de negocio, no de redacción.
- Para que el número no se escriba a mano en dos sitios, la página debería importar `STANDARD_SHIPPING_RATE` de `lib/commerce-policies.ts` y formatearlo con `currencyFormatter`, igual que hace con el umbral.

##### A.2.2 Plazo de devolución: DECISIÓN NECESARIA

El encargo dice «devolución en 7 días». Las dueñas decidieron antes (§9.13) que el texto dice «cinco (5) días hábiles contados desde la entrega» y el marcado y Merchant Center dicen 7. Tres opciones:

| Opción | Texto | A favor | En contra |
|---|---|---|---|
| **A. Mantener** (recomendada) | «cinco (5) días hábiles contados desde la entrega» | Es el mínimo del retracto (Ley 1480, art. 47); sin cambios de código ni de tests; 5 hábiles ≈ 7 calendario en una semana sin festivo | La página y Merchant Center siguen diciendo cosas distintas (diferencia conocida, §9.13) |
| B. Cambiar | «siete (7) días calendario contados desde la entrega» | Coincide literalmente con Merchant Center y el marcado | Siete días calendario siempre traen un fin de semana, o sea 5 hábiles; **con un festivo son 4, por debajo del mínimo legal de 5 hábiles**. Es una debilidad legal, no solo un cambio de tests |
| C. Mixta | «siete (7) días calendario contados desde la entrega, y nunca menos de cinco (5) días hábiles» | Coincide con Merchant Center y respeta el mínimo legal | Frase más larga; hay que cambiar los tests igual que en B |

`tests/unit/lib/commerce-policies.test.ts` protege la opción A: exige la frase de cinco días hábiles en `devoluciones/page.tsx`, `product-signals.tsx`, `product-details-accordion.tsx`, `multi-step-checkout-form.tsx` y `order-help-card.tsx` (:49-104), y falla si aparece «días calendario» cerca de cambio, devolución, retracto, recibir o entrega en cualquier archivo de `app/` o `components/`, salvo «quince (15) días calendario» (:111-125). Con B o C hay que reescribir esas aserciones y el comentario de `lib/commerce-policies.ts:9-17` y `RETURN_WINDOW_DAYS` (:29).

Los textos de abajo usan la **opción A**. Con B o C basta con cambiar la frase del plazo en los seis sitios listados en A.1.2 y A.1.3.

##### A.2.3 Página de envíos — textos nuevos

Supuesto: `deliveryEstimate` pasa a «2 a 6 días hábiles» y se cuenta **desde el pago** (A.3). La página deja de usar el valor como tiempo «después del despacho».

**Meta description (línea 13-14)** — 150 caracteres:
> Cómo, cuándo y cuánto cuesta recibir tu pedido: despacho el mismo día hábil, entrega en 2 a 6 días hábiles, costo del envío y guía de rastreo.

(Si se prefiere que la meta no repita un plazo que puede cambiar en el panel, dejar la actual.)

**Ficha de tiempo (líneas 32-41):** valor `{deliveryEstimate}`; etiqueta nueva:
> desde que se confirma el pago

**Ficha de envío gratis (42-48):** sin cambios («Envío gratis desde $ 250.000» / «en productos, a toda Colombia»).

**Sección «Tiempos de entrega» (69-101):**
> Preparamos y despachamos los pedidos desde Medellín el mismo día si el pago se confirma antes de las 12:00 m. (hora de Colombia), de lunes a viernes; si no, el siguiente día hábil. Desde que se confirma el pago, el pedido llega en **{deliveryEstimate}**, según el destino. En el checkout ves el tiempo estimado de cada transportadora antes de pagar.
>
> - En Medellín y el área metropolitana el pedido normalmente llega en 1 a 2 días hábiles.
> - En Bogotá y el resto del país, la transportadora entrega en {TRANSIT_DAYS.min} a {TRANSIT_DAYS.max} días hábiles después del despacho (hoy, 2 a 5). En algunos municipios con menos cobertura puede tardar un poco más.
> - Los pedidos pagados el fin de semana o en días festivos se despachan el siguiente día hábil.
> - Si necesitas una entrega urgente, escríbenos antes de comprar y te decimos si podemos acelerarla.

Rama sin `deliveryEstimate`: «A partir del despacho, el tiempo depende de la ciudad de destino y de la transportadora.»

Notas: «2 a 5» no se escribe a mano: se pinta con `TRANSIT_DAYS` de `lib/commerce-policies.ts:45`, igual que la tarifa (A.2.1), para que la página no pueda diferir del JSON-LD. «1 a 2» (Medellín) no tiene constante y queda literal. Se conserva literal la frase que exige el test (:142). No usa «después de confirmar el pago» ni «sábado» (prohibidas en :143-144). «1 a 2 días hábiles» queda solo en esta página; el test :146 la prohíbe en `hero.tsx`. «Puede tardar un poco más» es una salvedad por encima de los 6 días de Merchant Center; si se quiere cero diferencia, quitar esa frase.

**Sección «Costo del envío» (110-122), opción 1 (recomendada):**
> El costo lo calcula la transportadora según tu ciudad y el tamaño del paquete, y lo ves en el checkout antes de pagar. La tarifa nacional de referencia ronda los **$ 13.000**; en Medellín y el área metropolitana suele ser menor, entre $ 7.000 y $ 10.000. **Sin cargos ocultos: el envío que ves es el que pagas.**
>
> Cuando el valor de los productos llega a **{umbral}** o más, el envío es gratis a cualquier ciudad con cobertura. Cuenta el valor de los productos antes de aplicar cupones, y el descuento se aplica solo en el checkout.

**Opción 2 (cifras del encargo), con el riesgo de A.2.1:**
> … Como referencia, en Medellín y el área metropolitana suele estar entre $ 7.000 y $ 10.000, y en Bogotá y el resto del país, entre $ 13.000 y $ 15.000. …

«Antes de aplicar cupones» es exacto: `calculateTotals` (`pdepapel-store/lib/utils.ts:185-190`) y `qualifiesForFreeShipping` (`pdepapel-admin/lib/order-totals.ts:69-78`) comparan el subtotal de productos, con precios de oferta y antes del cupón.

**Sección «Si no estás en casa» y «Al recibir el pedido»:** sin cambios. Con «ronda los» la cifra queda como referencia y no como promesa: la cotización del checkout manda.

**Opcional, sección nueva «Domicilio en Medellín»** (la opción ya existe en el checkout, `shipping-info-step.tsx:529-533`, pero la política no la menciona):
> En Medellín y el área metropolitana también puedes elegir «Domicilio mismo día» en el checkout. Lo entregamos con nuestro domiciliario y acordamos por WhatsApp la hora y el valor.

Merchant Center no puede representar este domicilio (§9.13); no contradice la tarifa declarada porque es una opción adicional. Si se añade, la sección suma una entrada al índice de la página: revisar `tests/components/policy-page.test.tsx:63`, que busca enlaces del índice por nombre.

##### A.2.4 Página de devoluciones — textos nuevos (opción A del plazo)

Plazo, condiciones, quién paga y defectos: **sin cambios** (ya coinciden con Merchant Center).

**Sección «Cómo pedir un cambio o una devolución» (49-52)**, añadir al final:
> Las devoluciones se envían por transportadora a la dirección que te indiquemos; no recibimos devoluciones en persona.

Coincide con «solo por correo» de Merchant Center. **Pregunta para Paula:** confirmar que no se reciben devoluciones en mano (por ejemplo, con el domicilio propio en Medellín). Si sí se reciben, hay que cambiar Merchant Center, no la página.

**Sección «Reembolsos» (104-116)**, párrafo nuevo antes del de producto no disponible:
> Si aceptamos tu devolución, te reembolsamos el valor del producto por el mismo medio de pago que usaste. El tiempo en que ves el dinero depende de ese medio (pago en línea o transferencia).

El párrafo del retracto se mantiene literal (lo exige el test :132-136).

**Diferencia a decidir:** Merchant Center declara «procesamiento del reembolso: 5 días»; la página promete como máximo 15 días calendario para el retracto y no da plazo para la devolución ordinaria. Opciones: escribir «en máximo cinco (5) días hábiles desde que recibimos el producto» para la devolución ordinaria (solo si se puede cumplir con transferencias), o cambiar el tiempo en Merchant Center al más largo que admita el formulario.

##### A.2.5 Ficha de producto, carrito, pedido y bot

| Sitio | Texto propuesto | Comentario |
|---|---|---|
| `product-details-accordion.tsx:70-71` | Sin cambios: «Enviamos a toda Colombia con transportadora; llega en 2 a 6 días hábiles después del pago.» | Con el valor nuevo ya dice lo correcto |
| `product-details-accordion.tsx:73-75` | Sin cambios | La frase de :74 la exige el test :145 |
| `product-signals.tsx:105-110` | Sin cambios: «Llega en **2 a 6 días hábiles** a toda Colombia · ver envíos» | Correcto con el valor nuevo |
| `presale-cart-notice.tsx:66-68` | «¿Necesitas lo demás antes? **Haz dos pedidos**: uno con lo disponible, que sale el mismo día hábil o el siguiente, y otro con la preventa. Es la única forma de no esperar por lo que ya tenemos.» | Hoy dice «sale en 2 a 5 días hábiles», que mezcla despacho y tránsito y no sigue al panel |
| `lib/order-status.ts:302` | «Sale a más tardar el siguiente día hábil» | Opcional; «Sale en 1 día hábil» no es falso, pero ignora el despacho del mismo día |
| `info-country-tooltip.tsx:18` | «Por ahora solo enviamos dentro de Colombia.» | Corrección de redacción («a todo Colombia») |
| `multi-step-checkout-form.tsx:1258, 1270, 1281` | Opcional: enlazar «entrega» a `/politicas/envios` y «cambios» a `/politicas/devoluciones` | Hoy las dos palabras van a la página de envíos |
| Bot, `bot-facts.ts:404-405` | Sin cambio de plantilla: «Tu pedido llega en 2 a 6 días hábiles 💛 Te paso el número de guía apenas lo despache.» | Cambiar solo el valor en la base no retira la aprobación de Paula: la aprobación vale mientras `botFactsVersion` sea igual a `BUSINESS_FACT_TEMPLATES_VERSION` (`bot-facts.ts:563`), que depende de las plantillas y no de los valores; editar la plantilla sí la retiraría |
| Panel, `business-info-panel.tsx:220` y `:225-228` | Placeholder «2 a 6 días hábiles»; ayuda: «Se cuenta desde que se confirma el pago. Se muestra en la ficha del producto, en la política de envíos y en el bot. Merchant Center declara 2 a 6 días hábiles.» | La ayuda actual («94 % en cuatro o menos») justifica el valor viejo |
| `store-settings.ts:255` | `DEFAULT_DELIVERY_ESTIMATE = "2 a 6 días hábiles"` y su comentario (:250-254) | Solo afecta formularios vacíos |

Hero en vivo, barra de anuncios, trust points, pie de página y metas: **sin cambios** (no prometen costo ni plazo).

#### A.3 Cambio en base de datos: `deliveryEstimate`

| | |
|---|---|
| Campo | `StoreSettings.deliveryEstimate` (tienda `f23ee5bc-…`) |
| Valor actual | «2 a 4 días hábiles» (API pública, 2026-10-05) |
| Valor propuesto | «2 a 6 días hábiles» |
| Significado | Desde que se confirma el pago (0–1 de preparación + 2–5 de tránsito, igual que Merchant Center) |

**Por qué «2 a 6» y no «2 a 5».** El mismo texto se muestra con cuatro envoltorios: envíos «{X} después del despacho» (`politicas/envios/page.tsx:38`), acordeón «llega en {X} después del pago» (`product-details-accordion.tsx:71`), señales «Llega en {X} a toda Colombia» (`product-signals.tsx:107`) y bot «Tu pedido llega en {X}» (`bot-facts.ts:405`). Con «2 a 5» el acordeón se quedaría corto un día; con «2 a 6» la página de envíos se pasaría un día. Por eso la propuesta cambia la etiqueta de la página de envíos (A.2.3) y deja los otros tres como están. Medellín llega antes (1–2 días): prometer de más no es una promesa falsa.

**Cómo aplicarlo (recomendado):** Paula, en el panel › Configuración › datos del negocio › «Cuánto tarda en llegar», escribe «2 a 6 días hábiles» y guarda (`PATCH /api/[storeId]/settings`). No hace falta script.

**Alternativa por script (solo describir; no creado):** un script en el scratchpad que use `createProdClient()` de `scripts/lib/prod-client.mjs` y haga `storeSettings.update({ where: { storeId }, data: { deliveryEstimate: "2 a 6 días hábiles" } })`, ejecutado con `npm run prod:write -- <script>` después de que Christian genere el token con `npm run prod:approve -- "<motivo>"` (exige TTY). `StoreSettings` no es un modelo del libro mayor, así que el bloqueo de `prod-client` no aplica, pero la escritura se pide en el chat antes, igual que todas, y la línea queda en `ops/prod-writes.log`. Para un solo campo editable en el panel, el script no aporta nada.

**Orden.** Primero el deploy del código de A.2.3 y después el valor nuevo, el mismo día. Si el valor cambia antes, la página de envíos diría «2 a 6 días hábiles después del despacho» durante ese rato: se pasa un día pero no promete nada que no se cumpla.

**Cuándo se ve.** `PATCH /settings` no llama a `triggerStorefrontRevalidation` (`app/api/[storeId]/settings/route.ts`, sin coincidencias de «revalidat»). La tienda pide `/public/storefront` con `revalidate: 300` y la etiqueta `storefront-settings` (`actions/get-storefront-settings.ts:24-26`), y el admin responde con `s-maxage=300, stale-while-revalidate=3600` (`pdepapel-admin/lib/utils.ts:332-334`). En la práctica, entre 5 y 10 minutos. Para forzarlo, `POST /api/revalidate` de la tienda acepta `tags` (`app/api/revalidate/route.ts:41-73`) y puede recibir `storefront-settings`. El bot lee la base directamente: cambia al instante.

**Verificación después:** `curl` de `/public/storefront` → `deliveryEstimate` «2 a 6 días hábiles»; `/politicas/envios` y una ficha de producto muestran el valor nuevo; en el panel, Conversaciones › Respuestas, la respuesta a «cuánto tarda» dice «2 a 6 días hábiles».

#### A.4 Tests y comentarios que cambian con A

| Archivo | Qué cambia |
|---|---|
| `pdepapel-store/tests/unit/lib/commerce-policies.test.ts:150-166` | El comentario dice que, cuando cambie el texto, el test debe comparar la página con las constantes. Añadir: la página importa y pinta `STANDARD_SHIPPING_RATE` y `TRANSIT_DAYS` (no los escribe a mano), contiene `deliveryEstimate` y la etiqueta «desde que se confirma el pago», y ya no contiene «después del despacho» junto al valor. `:165` (`/costo lo calcula la transportadora/`) sigue pasando con las dos opciones de A.2.3 |
| mismo archivo `:142`, `:145`, `:146` | Siguen pasando con los textos propuestos (se conservaron las frases) |
| mismo archivo `:49-136` | Sin cambios con la opción A del plazo; con B o C, reescribir `:51-52`, `:60`, `:69`, `:75`, `:94-104` y `:111-125` |
| `pdepapel-store/lib/commerce-policies.ts:18-27` | Quitar el «Pendiente: la página de envíos todavía dice…» |
| `pdepapel-store/tests/components/*` | Ningún test de componentes fija «2 a 4», «después del despacho» ni «sale en 2 a 5» (búsqueda en `tests/`). `announcement-bar.test.tsx:14,24`, `free-shipping-progress.test.tsx`, `navbar-cart-content.test.tsx:73` y `e2e/product-sticky-bar.spec.ts:221` dependen de textos que no cambian |
| `pdepapel-admin/tests/unit/lib/whatsapp-bot-facts.test.ts:57,173`, `whatsapp-welcome-menu.test.ts:34,149`, `whatsapp-bot.test.ts:159,577` | Usan «2 a 4 días hábiles» como dato de prueba, no como valor real: no fallan. Actualizarlos solo si se quiere que el ejemplo coincida |
| `pdepapel-admin/tests/unit/routes/public-storefront-settings.test.ts:56` | Usa `null`: no cambia |
| Tests nuevos recomendados | `presale-cart-notice` (el texto nuevo, sin «2 a 5»); en `commerce-policies.test.ts`, que `devoluciones/page.tsx` contenga «por el mismo medio de pago que usaste» y «por transportadora» |
| Documentación | `docs/seo/2026-10-05-seo-maintenance.md` §9.13.2, «Diferencia pendiente con la página»: cerrarla en el mismo commit |


---

### B. P1-6: textos de tipos y categorías

#### B.1 Tipos y categorías con su número de productos (API pública, 2026-10-05)

Fuente: `GET /types`, `GET /categories` y `GET /products?typeId|categoryId=…&fromShop=true&page=1&itemsPerPage=1`, con y sin `groupBy=parents` (las mismas rutas que usan `actions/get-types.ts`, `get-categories.ts` y `lib/catalog-params.ts`). El conteo excluye archivados y productos con fecha de llegada futura (`productAvailabilityWhere`, `pdepapel-admin/lib/product-availability.ts:22-26`) e **incluye los agotados**: es el catálogo visible, no el inventario disponible. «Familias» es el número que muestra la cabecera de la tienda (un grupo de variantes cuenta una vez); «Productos» cuenta cada variante. `Type` no expone ni tiene campos SEO.

##### B.1.a Tipos (14)

| Tipo | slug | Familias (como cuenta la tienda) | Productos sueltos | Campos SEO |
|---|---|---:|---:|---|
| Escritura | `escritura` | 107 | 152 | no existen en `Type` |
| Útiles | `utiles` | 85 | 140 | no existen en `Type` |
| Accesorios | `accesorios` | 75 | 101 | no existen en `Type` |
| Journal / Scrap | `journal-scrap` | 49 | 77 | no existen en `Type` |
| Planeación & Organización | `planeacion-organizacion` | 45 | 70 | no existen en `Type` |
| Cuadernos | `cuadernos` | 41 | 56 | no existen en `Type` |
| Lápices & Colores | `lapices-colores` | 37 | 50 | no existen en `Type` |
| Oficina | `oficina` | 33 | 55 | no existen en `Type` |
| Creatividad & Juego | `creatividad-juego` | 22 | 23 | no existen en `Type` |
| Bolsos & Morrales | `bolsos-morrales` | 20 | 37 | no existen en `Type` |
| Lectura | `lectura` | 19 | 39 | no existen en `Type` |
| Carpetas | `carpetas` | 15 | 35 | no existen en `Type` |
| Belleza / Cuidado Personal | `belleza-cuidado-personal` | 13 | 18 | no existen en `Type` |
| Kits | `kits` | 13 | 35 | no existen en `Type` |

##### B.1.b Categorías (107), agrupadas por tipo y ordenadas por familias

| Tipo | Categoría | slug | Familias | Productos | seoEnabled | seoFeatured | seoTitle | seoDescription | seoIntro |
|---|---|---|---:|---:|---|---|---|---|---|
| Escritura | Bolígrafos / Lapiceros | `boligrafos-lapiceros` | 58 | 88 | sí | sí | sí | sí | sí |
| Escritura | Marcadores | `marcadores` | 21 | 25 | sí | sí | sí | sí | sí |
| Escritura | Resaltadores | `resaltadores` | 13 | 22 | sí | sí | sí | sí | sí |
| Escritura | Plumones | `plumones` | 9 | 9 | no | no | no | no | sí |
| Escritura | Micropuntas | `micropuntas` | 4 | 6 | no | no | no | no | sí |
| Escritura | Plumígrafos | `plumigrafos` | 2 | 2 | no | no | no | no | sí |
| Escritura | Rapidógrafos | `rapidografos` | 0 | 0 | no | no | no | no | no |
| Útiles | Notas adhesivas | `notas-adhesivas` | 22 | 29 | sí | sí | sí | sí | sí |
| Útiles | Borradores | `borradores` | 19 | 27 | sí | no | sí | sí | sí |
| Útiles | Pegante | `pegante` | 8 | 14 | no | no | no | no | sí |
| Útiles | Reglas | `reglas` | 8 | 17 | no | no | no | no | sí |
| Útiles | Bisturíes | `bisturies` | 6 | 8 | no | no | no | no | sí |
| Útiles | Juegos geométricos | `juegos-geometricos` | 5 | 13 | no | no | no | no | sí |
| Útiles | Clips | `clips` | 4 | 7 | no | no | no | no | sí |
| Útiles | Correctores | `correctores` | 4 | 10 | no | no | no | no | sí |
| Útiles | Tijeras | `tijeras` | 4 | 7 | no | no | no | no | sí |
| Útiles | Guillotinas | `guillotinas` | 3 | 3 | no | no | no | no | sí |
| Útiles | Cinta | `cinta` | 1 | 1 | no | no | no | no | sí |
| Útiles | Sacapuntas | `sacapuntas` | 1 | 4 | no | no | no | no | sí |
| Útiles | Sellos escolares | `sellos-escolares` | 0 | 0 | no | no | no | no | no |
| Accesorios | Llaveros | `llaveros` | 20 | 29 | sí | sí | sí | sí | sí |
| Accesorios | Porta carnets | `porta-carnets` | 12 | 12 | no | no | no | no | sí |
| Accesorios | Mugs | `mugs` | 10 | 15 | no | no | sí | sí | sí |
| Accesorios | Pines | `pines` | 10 | 10 | no | no | no | no | sí |
| Accesorios | Straps | `straps` | 5 | 5 | no | no | no | no | sí |
| Accesorios | Accesorios personales | `accesorios-personales` | 4 | 7 | no | no | no | no | sí |
| Accesorios | Accesorios de escritorio | `accesorios-de-escritorio` | 2 | 2 | no | no | no | no | sí |
| Accesorios | Bolsos pequeños | `bolsos-pequenos` | 2 | 9 | no | no | no | no | sí |
| Accesorios | Monederos | `monederos` | 2 | 2 | no | no | no | no | sí |
| Accesorios | Protector de cargador | `protector-de-cargador` | 2 | 2 | no | no | no | no | sí |
| Accesorios | Sombrillas | `sombrillas` | 2 | 2 | no | no | no | no | sí |
| Accesorios | Vasos | `vasos` | 2 | 2 | no | no | no | no | sí |
| Accesorios | Alcancías | `alcancias` | 1 | 1 | no | no | no | no | sí |
| Accesorios | Bolsas de agua térmica | `bolsas-de-agua-termica` | 1 | 3 | no | no | no | no | sí |
| Accesorios | Empaques para regalo | `empaques-para-regalo` | 0 | 0 | no | no | no | no | no |
| Accesorios | Lámparas | `lamparas` | 0 | 0 | no | no | no | no | no |
| Accesorios | Termos | `termos` | 0 | 0 | no | no | no | no | no |
| Journal / Scrap | Stickers | `stickers` | 26 | 45 | sí | sí | sí | sí | sí |
| Journal / Scrap | Troqueles | `troqueles` | 9 | 11 | no | no | no | no | sí |
| Journal / Scrap | Blocks de hojas decorativas | `blocks-de-hojas-decorativas` | 4 | 7 | sí | sí | sí | sí | sí |
| Journal / Scrap | Escarcha | `escarcha` | 3 | 5 | no | no | no | no | sí |
| Journal / Scrap | Sellos decorativos | `sellos-decorativos` | 3 | 5 | no | no | no | no | sí |
| Journal / Scrap | Washi tape | `washi-tape` | 3 | 3 | no | no | no | no | sí |
| Journal / Scrap | Cenefas decorativas | `cenefas-decorativas` | 1 | 1 | no | no | no | no | sí |
| Journal / Scrap | Cuadernos de lettering | `cuadernos-de-lettering` | 0 | 0 | no | no | no | no | no |
| Planeación & Organización | Agendas | `agendas` | 16 | 36 | sí | sí | sí | sí | sí |
| Planeación & Organización | Planeadores | `planeadores` | 15 | 20 | no | no | no | no | sí |
| Planeación & Organización | Organizadores | `organizadores` | 4 | 4 | no | no | no | no | sí |
| Planeación & Organización | Calendarios | `calendarios` | 3 | 3 | no | no | no | no | sí |
| Planeación & Organización | Folder | `folder` | 3 | 3 | no | no | no | no | sí |
| Planeación & Organización | Calculadoras | `calculadoras` | 1 | 1 | no | no | no | no | sí |
| Planeación & Organización | Hojas de repuesto | `hojas-de-repuesto` | 1 | 1 | no | no | no | no | sí |
| Planeación & Organización | Set de notas (planner sticky notes) | `set-de-notas-planner-sticky-notes` | 1 | 1 | no | no | no | no | sí |
| Planeación & Organización | Tableros borrables | `tableros-borrables` | 1 | 1 | no | no | no | no | sí |
| Planeación & Organización | Diario devocional | `diario-devocional` | 0 | 0 | no | no | no | no | no |
| Cuadernos | Argollados | `argollados` | 14 | 23 | sí | no | sí | sí | sí |
| Cuadernos | Libretas | `libretas` | 9 | 15 | sí | no | sí | sí | sí |
| Cuadernos | Cosidos | `cosidos` | 8 | 8 | no | no | no | no | sí |
| Cuadernos | Multimaterias | `multimaterias` | 5 | 5 | no | no | no | no | sí |
| Cuadernos | Sketchbook / Bitácora | `sketchbook-bitacora` | 5 | 5 | no | no | no | no | sí |
| Lápices & Colores | Lápices | `lapices` | 16 | 22 | sí | no | sí | sí | sí |
| Lápices & Colores | Portaminas | `portaminas` | 10 | 16 | no | no | no | no | sí |
| Lápices & Colores | Colores | `colores` | 9 | 9 | no | no | no | no | sí |
| Lápices & Colores | Minas | `minas` | 2 | 3 | no | no | no | no | sí |
| Oficina | Herramientas de oficina | `herramientas-de-oficina` | 15 | 19 | sí | no | sí | sí | sí |
| Oficina | Blocks de papel | `blocks-de-papel` | 8 | 17 | no | no | no | no | sí |
| Oficina | Papeles | `papeles` | 6 | 14 | no | no | no | no | sí |
| Oficina | Sobres | `sobres` | 2 | 2 | no | no | no | no | sí |
| Oficina | Cartulinas | `cartulinas` | 1 | 2 | no | no | no | no | sí |
| Oficina | Resmas | `resmas` | 1 | 1 | no | no | no | no | sí |
| Creatividad & Juego | Lego | `lego` | 6 | 7 | no | no | no | no | sí |
| Creatividad & Juego | Pinturas | `pinturas` | 5 | 5 | no | no | no | no | sí |
| Creatividad & Juego | Libros de colorear | `libros-de-colorear` | 4 | 4 | no | no | no | no | sí |
| Creatividad & Juego | Plastilina | `plastilina` | 2 | 2 | no | no | no | no | sí |
| Creatividad & Juego | Crayones | `crayones` | 1 | 1 | no | no | no | no | sí |
| Creatividad & Juego | Cuadros de piedras | `cuadros-de-piedras` | 1 | 1 | no | no | no | no | sí |
| Creatividad & Juego | Juegos de sticker room | `juegos-de-sticker-room` | 1 | 1 | no | no | no | no | sí |
| Creatividad & Juego | Pintar con números | `pintar-con-numeros` | 1 | 1 | no | no | no | no | sí |
| Creatividad & Juego | Squishy | `squishy` | 1 | 1 | no | no | no | no | sí |
| Creatividad & Juego | Hojas de origami | `hojas-de-origami` | 0 | 0 | no | no | no | no | no |
| Bolsos & Morrales | Cartucheras | `cartucheras` | 17 | 34 | sí | no | sí | sí | sí |
| Bolsos & Morrales | Maletas / Morrales | `maletas-morrales` | 2 | 2 | no | no | no | no | sí |
| Bolsos & Morrales | Loncheras | `loncheras` | 1 | 1 | no | no | no | no | sí |
| Lectura | Separadores de páginas | `separadores-de-paginas` | 11 | 19 | no | no | no | no | sí |
| Lectura | Banderitas adhesivas | `banderitas-adhesivas` | 6 | 13 | no | no | no | no | sí |
| Lectura | Cintas resaltadoras | `cintas-resaltadoras` | 2 | 7 | no | no | no | no | sí |
| Lectura | Sellos de lectura | `sellos-de-lectura` | 0 | 0 | no | no | no | no | no |
| Carpetas | Carpetas | `carpetas` | 5 | 11 | no | no | no | no | sí |
| Carpetas | Sobres plásticos | `sobres-plasticos` | 4 | 10 | no | no | no | no | sí |
| Carpetas | Archivadores | `archivadores` | 3 | 7 | no | no | no | no | sí |
| Carpetas | Planilleros | `planilleros` | 3 | 7 | no | no | no | no | sí |
| Belleza / Cuidado Personal | Moñas / Pinzas | `monas-pinzas` | 8 | 8 | no | no | no | no | sí |
| Belleza / Cuidado Personal | Brillos / Bálsamos | `brillos-balsamos` | 1 | 1 | no | no | no | no | sí |
| Belleza / Cuidado Personal | Cepillos | `cepillos` | 1 | 1 | no | no | no | no | sí |
| Belleza / Cuidado Personal | Espejos | `espejos` | 1 | 1 | no | no | no | no | sí |
| Belleza / Cuidado Personal | Jabón en pétalos | `jabon-en-petalos` | 1 | 1 | no | no | no | no | no |
| Belleza / Cuidado Personal | Toallas | `toallas` | 1 | 6 | no | no | no | no | sí |
| Belleza / Cuidado Personal | Antibacterial | `antibacterial` | 0 | 0 | no | no | no | no | no |
| Belleza / Cuidado Personal | Pañitos | `panitos` | 0 | 0 | no | no | no | no | no |
| Kits | Kits para regalar o regalarse | `kits-para-regalar-o-regalarse` | 6 | 13 | no | no | sí | sí | sí |
| Kits | Kits kawaii | `kits-kawaii` | 2 | 12 | no | no | no | no | sí |
| Kits | Kits de Journal / Scrap | `kits-de-journal-scrap` | 1 | 1 | no | no | no | no | sí |
| Kits | Kits de lectura | `kits-de-lectura` | 1 | 1 | no | no | no | no | sí |
| Kits | Kits de oficina | `kits-de-oficina` | 1 | 4 | no | no | no | no | no |
| Kits | Kits escolares | `kits-escolares` | 1 | 3 | no | no | no | no | sí |
| Kits | Kits sorpresa | `kits-sorpresa` | 1 | 1 | no | no | no | no | sí |
| Kits | Kits universitarios | `kits-universitarios` | 0 | 0 | no | no | no | no | no |

Resumen: 107 categorías; 14 con `seoEnabled`; 32 con 6 o más familias; 12 con 0 productos visibles.

#### B.2 Textos propuestos

**Criterios.** Cada texto sale de los nombres reales de los productos de esa categoría (hasta 60 familias por categoría, orden «destacados primero», API pública del 2026-10-05). Sin precios, sin «envío a toda Colombia» (ya lo dicen la barra, el pie y la meta de respaldo), sin afirmar licencias oficiales: los nombres solo dicen el personaje, y en Pines aparece un «Pin Harry Potter (original)» junto a otro sin esa palabra, así que no se puede decir que todo es licenciado.

**Límites que choca el encargo:**
- `seoTitle`: el layout añade « | Papelería P de Papel» (23 caracteres, `app/layout.tsx:46`), no « | P de Papel». El panel recomienda unos 40 caracteres (`pdepapel-admin/lib/category-seo.ts:30`); la columna admite 70. Los títulos de abajo van de 27 a 47: el `<title>` completo queda por debajo de 70.
- `seoDescription`: ≤ 155 (la columna admite 170).
- `seoIntro`: el encargo pide 40–80 palabras (≈ 250–500 caracteres); el panel recomienda 160 (aviso suave, el tope real es 1.200, `category-form.tsx:47-48`) y la tienda muestra la intro recortada a dos líneas con «Leer más» (`components/shop/collapsible-intro.tsx`). El texto completo está en el HTML, así que Google lo lee; por eso **la primera frase de cada intro se sostiene sola** (es lo que se ve sin abrir «Leer más»).
- Las categorías con `seoEnabled` ya tienen título, descripción e intro. Los de abajo los **reemplazan** porque los actuales siguen un molde («X bonitos y kawaii en Colombia» / «…con envíos a toda Colombia»), se repiten casi iguales entre categorías y no dicen qué hay adentro. Si Paula prefiere, se cambian solo las intros.
- Familias = lo que cuenta la tienda en la cabecera (un grupo de variantes cuenta una vez). Productos = cada variante.

##### B.2.1 Tipos (los 14 tienen 13 familias o más)

Hoy `Type` no tiene campos para estos textos (B.3): quedan listos para cuando exista la página.

**Escritura** (107 familias, 152 productos)
- seoTitle: Lapiceros, marcadores y resaltadores
- seoDescription: Lapiceros de gel y retráctiles, marcadores, resaltadores, plumones y micropuntas en tonos pastel, neón y metalizados, por unidad o en set.
- Intro: Todo para escribir y marcar: lapiceros de gel, retráctiles y borrables, marcadores permanentes, acrílicos y escarchados, resaltadores pastel y neón, plumones de doble punta y micropuntas. Hay opciones por unidad y en set, y muchos llevan personajes como Capibara, Kuromi o los escudos de Hogwarts, para tomar apuntes, hacer lettering o armar tu estuche.

**Útiles** (85 / 140)
- seoTitle: Útiles escolares y de escritorio
- seoDescription: Notas adhesivas, borradores, reglas, pegantes, tijeras, bisturíes, correctores y clips con diseños kawaii para el colegio, la universidad o la oficina.
- Intro: Los útiles del día a día con un diseño que dan ganas de usar: notas adhesivas, borradores de miga de pan y eléctricos, reglas flexibles, pegantes en barra y líquidos, tijeras, bisturíes, correctores, clips y juegos geométricos. Sirven para el colegio, la universidad o el escritorio de la casa, y muchos vienen con personajes como Stitch, Cinnamoroll o Capibara.

**Accesorios** (75 / 101)
- seoTitle: Llaveros, mugs, pines y accesorios
- seoDescription: Llaveros, portacarnets, mugs, pines, straps para celular y monederos con personajes de películas, anime y Sanrio. Detalles para usar o regalar.
- Intro: Pequeños accesorios para llevar a diario o regalar: llaveros de peluche y de agua, portacarnets con yoyo, mugs y platos de cerámica, pines, straps para el celular, monederos, vasos térmicos y sombrillas. Muchos traen personajes de películas, anime y Sanrio, como Stitch, Bob Esponja, Kuromi o Toy Story.

**Journal / Scrap** (49 / 77)
- seoTitle: Journal y scrapbook: stickers y más
- seoDescription: Stickers, washi tape, troqueles, sellos, escarcha y blocks de hojas decorativas para decorar tu journal, tu agenda o un scrapbook.
- Intro: Materiales para decorar un journal, un scrapbook o una agenda: sobres y láminas de stickers florales, vintage, en relieve y de personajes, washi tape, troqueles y cortadores de borde, sellos decorativos, escarcha y blocks de hojas decorativas. Se pueden combinar para dar textura y color a cada página.

**Planeación & Organización** (45 / 70)
- seoTitle: Agendas, planeadores y organizadores
- seoDescription: Agendas, planeadores diarios, semanales y mensuales, calendarios, organizadores y tableros borrables para planear clases, trabajo y metas.
- Intro: Para organizar la semana y no olvidar nada: agendas A5, mini y permanentes, planeadores diarios, semanales y mensuales, calendarios, organizadores, folders y tableros borrables. Hay diseños clásicos y pastel, ilustraciones de William Morris y personajes como Harry Potter, El Principito o Capibara.

**Cuadernos** (41 / 56)
- seoTitle: Cuadernos, libretas y sketchbooks
- seoDescription: Cuadernos argollados y cosidos, multimaterias, libretas de bolsillo y sketchbooks en rayado, cuadriculado y puntos, con diseños de personajes.
- Intro: Cuadernos para cada uso: argollados y cosidos de 50 a 100 hojas, multimaterias, libretas de bolsillo y media carta, y sketchbooks o bitácoras para dibujar. Los hay rayados, cuadriculados, de puntos y doble línea, con portadas de Snoopy, Hello Kitty, Mafalda, One Piece o Stitch.

**Lápices & Colores** (37 / 50)
- seoTitle: Lápices, portaminas y colores
- seoDescription: Lápices infinitos y HB, portaminas de 0.5, 0.7 y 2.0 mm, minas de repuesto y cajas de colores para escribir, dibujar y colorear.
- Intro: Lápices infinitos y de grafito HB, portaminas de 0.5, 0.7 y 2.0 mm con sus minas de repuesto, y cajas de colores de 12 a 36 tonos, también de doble punta. Hay modelos con personajes y diseños kawaii para el colegio, y opciones sencillas para dibujar o tomar apuntes.

**Oficina** (33 / 55)
- seoTitle: Oficina: grapadoras, blocks y papeles
- seoDescription: Grapadoras, perforadoras, dispensadores de cinta, blocks carta y oficio, cartulinas, papel iris y resmas para la oficina o el estudio.
- Intro: Lo práctico para el escritorio: grapadoras y perforadoras en colores pastel y con personajes, dispensadores de cinta, lupas y una mini impresora térmica con sus rollos. También hay blocks rayados, cuadriculados y blancos en carta y oficio, papel iris, cartulinas, sobres y resmas.

**Creatividad & Juego** (22 / 23)
- seoTitle: Manualidades y juegos creativos
- seoDescription: Bloques de construcción, acuarelas, témperas, libros para colorear, plastilina, pintar por números y squishies para crear y jugar.
- Intro: Actividades para crear con las manos: sets de bloques de construcción con personajes, acuarelas, témperas y pinceles, libros para colorear, plastilina, crayones, cuadros para pintar por números o decorar con piedras y squishies. Son una buena opción para regalar o para una tarde sin pantallas, para niños y adultos.

**Bolsos & Morrales** (20 / 37)
- seoTitle: Cartucheras, morrales y loncheras
- seoDescription: Cartucheras de uno o varios bolsillos, cosmetiqueras, morrales y loncheras con diseños kawaii y personajes de Sanrio y Stitch.
- Intro: Para llevar los útiles ordenados: cartucheras de un bolsillo, de varios compartimentos y tipo maleta, cosmetiqueras de tela y algunos morrales y loncheras. Hay diseños kawaii, pastel y retro, y personajes como Hello Kitty, Hangyodon o Stitch. Sirven para el colegio, la universidad o para llevar el maquillaje en el bolso.
- Nota: 17 de sus 20 familias son cartucheras. Una página de este tipo indexable sería casi un duplicado de `/categoria/cartucheras` (B.3.4).

**Lectura** (19 / 39)
- seoTitle: Separadores de libros y banderitas
- seoDescription: Separadores de páginas imantados y de cadena, banderitas adhesivas y cintas resaltadoras para marcar y anotar tus libros favoritos.
- Intro: Accesorios para quienes leen mucho: separadores de páginas imantados, de cadena y en forma de pluma, con ilustraciones de flores, obras de arte o El Principito, banderitas adhesivas de colores para marcar citas y cintas resaltadoras. También son un detalle fácil de regalar junto a un libro.

**Carpetas** (15 / 35)
- seoTitle: Carpetas, planilleros y archivadores
- seoDescription: Carpetas de tela, plásticas y herméticas, planilleros oficio y archivadores de 5 y 13 compartimentos, con Harry Potter, Sanrio y Van Gogh.
- Intro: Para guardar tareas, documentos y hojas sueltas: carpetas de tela con botón, plásticas y herméticas en tamaño carta y oficio, planilleros con tapa y carpetas archivadoras de 5 y 13 compartimentos. Hay diseños de Harry Potter, Van Gogh, Sanrio, flores y tonos pastel.

**Belleza / Cuidado Personal** (13 / 18)
- seoTitle: Accesorios de belleza y cuidado personal
- seoDescription: Scrunchies, moñas y pinzas para el cabello, brillos mini de Sanrio, espejitos, cepillos y paños limpia lentes con diseños kawaii.
- Intro: Detalles de cuidado personal con diseño kawaii: scrunchies, moñas y pinzas para el cabello, brillos labiales mini de Sanrio, un espejito doble de Stitch, cepillos pequeños, jabón en pétalos y paños limpia lentes. Son fáciles de llevar en el bolso y de sumar a un regalo.

**Kits** (13 / 35)
- seoTitle: Kits de papelería, escolares y sorpresa
- seoDescription: Kits de papelería armados: temáticos para regalar, kawaii, escolares, de oficina, de journal y cajitas sorpresa, en un solo producto.
- Intro: Productos que vienen armados en un solo paquete: kits temáticos para regalar, como los de Pochacco, Hogwarts o capibaras, kits kawaii, un kit mini escolar, uno de oficina, una cajita para empezar en el journal, un reto de lectura y cajitas sorpresa como la de Snoopy. Sirven para resolver un regalo o empezar un pasatiempo de una vez.

##### B.2.2 Categorías con 6 familias o más (32)

Marcadas con ✱ las que ya tienen `seoEnabled` (se indexan hoy).

**Escritura › Bolígrafos / Lapiceros** ✱ (58 / 88)
- seoTitle: Lapiceros de gel, retráctiles y borrables
- seoDescription: Lapiceros de gel, retráctiles, borrables, escarchados y multiminas, por unidad o en set, en tonos pastel y con personajes como Kuromi o Capibara.
- Intro: La categoría más grande de la tienda: lapiceros de gel, retráctiles, semigel, roller, borrables, escarchados y multiminas, en puntas de 0.5 y 0.7 mm. Se venden por unidad o en sets de 3 a 10, en tonos pastel, degradé o tinta negra, y con personajes como Kuromi, Capibara, Intensamente o los escudos de Hogwarts.

**Escritura › Marcadores** ✱ (21 / 25)
- seoTitle: Marcadores permanentes, acrílicos y más
- seoDescription: Marcadores permanentes, acrílicos, de vinilo, escarchados, metalizados y borrables de tablero, por unidad o en sets de 4 a 36 colores.
- Intro: Marcadores para cada proyecto: permanentes, acrílicos, de vinilo, escarchados y metalizados, de doble punta y de punta pincel para lettering, además de borrables para tablero. Hay sets de 4 a 36 colores y marcadores por unidad, de marcas como Sharpie, Tombow, Eterna y Gipao.

**Escritura › Resaltadores** ✱ (13 / 22)
- seoTitle: Resaltadores pastel, neón y borrables
- seoDescription: Resaltadores pastel, neón y borrables, de doble punta o con personajes, por unidad o en sets de 3 a 15 colores para estudiar y subrayar.
- Intro: Resaltadores para estudiar y organizar apuntes por colores: tonos pastel y neón, de doble punta, borrables y con personajes. Se consiguen por unidad o en sets de 3 a 15 colores, de marcas como Sharpie, Studmark y Gipao. Son útiles para subrayar textos, marcar fórmulas o separar temas en la agenda.

**Escritura › Plumones** (9 / 9)
- seoTitle: Plumones de doble punta y punta pincel
- seoDescription: Plumones de doble punta, punta pincel y punta cónica en sets de 8 a 24 colores, también en pastel y tonos tierra, para lettering y colorear.
- Intro: Plumones para lettering, ilustración y mapas mentales: de doble punta, punta pincel, punta cónica y punta delgada, en sets de 8 a 24 colores. Además de los tonos clásicos hay sets pastel y de tonos tierra, de marcas como Offi-esco, Primavera y Scribe.

**Útiles › Notas adhesivas** ✱ (22 / 29)
- seoTitle: Notas adhesivas de colores y personajes
- seoDescription: Notas adhesivas pastel, neón, translúcidas, rayadas y con personajes como Hello Kitty, Stitch o Capibara, para estudiar y organizar pendientes.
- Intro: Notas adhesivas para apuntes, recordatorios y libros: pastel, neón, negras, translúcidas para escribir encima del texto, con renglones o en formato de lista. Hay diseños de Hello Kitty, Stitch, Capibara y pandas, y otros con obras de Van Gogh y Monet.

**Útiles › Borradores** ✱ (19 / 27)
- seoTitle: Borradores de miga de pan y kawaii
- seoDescription: Borradores de miga de pan, retráctiles, eléctricos y con figuras de animales, por unidad o en set, para el colegio y el dibujo.
- Intro: Borradores para cada uso: de miga de pan para dibujo, retráctiles con repuesto, eléctricos y para tablero, además de borradores con figuras de capibaras, pandas, conejos y pollitos. Se venden por unidad, en blíster de 3 o en sets de 5.

**Útiles › Pegante** (8 / 14)
- seoTitle: Pegante en barra, líquido y silicona
- seoDescription: Pegante en barra, pegante líquido, silicona líquida de 30 y 60 ml y pegantes con personajes como Stitch, para tareas y manualidades.
- Intro: Pegantes para el colegio y las manualidades: en barra, líquido, doble y transparente, y silicona líquida de 30 y 60 ml. Algunos vienen con diseños kawaii o con personajes como Stitch y dinosaurios. Sirven para tareas con papel y cartulina, maquetas y proyectos de journal.

**Útiles › Reglas** (8 / 17)
- seoTitle: Reglas flexibles y con diseños kawaii
- seoDescription: Reglas flexibles, pastel y con diseños de Stitch, Cinnamoroll, capibaras, animales y flores para el colegio y el journal.
- Intro: Reglas para el estuche que se salen de lo común: flexibles, en tonos pastel y con diseños de Stitch, Cinnamoroll, capibaras, animalitos y flores. Sirven para geometría, para los márgenes del cuaderno o para trazar en el journal. Son un buen detalle para completar un estuche nuevo.

**Útiles › Bisturíes** (6 / 8)
- seoTitle: Bisturíes y cuchillas de repuesto
- seoDescription: Bisturíes grandes y mini, tipo lapicero, en pastel o con Sanrio, y cuchillas de repuesto para manualidades y scrapbook.
- Intro: Bisturíes para cortes precisos en manualidades, maquetas y scrapbook: grandes y mini, tipo lapicero, en pastel, con forma de cactus o de Sanrio, además de cuchillas de repuesto. Úsalos sobre un tapete de corte y guárdalos lejos de los niños pequeños.

**Accesorios › Llaveros** ✱ (20 / 29)
- seoTitle: Llaveros de personajes y de peluche
- seoDescription: Llaveros de peluche, de agua y de lujo con personajes como Stitch, Bluey, Minions, Harry Potter o Toy Story, para la maleta, las llaves o regalar.
- Intro: Llaveros para colgar en la maleta, las llaves o la cartuchera: de peluche, de agua con brillos, sencillos y de lujo. Hay personajes de películas y series como Toy Story, Intensamente, Minions, Bluey, Bob Esponja, Harry Potter y Sanrio, así que es fácil encontrar uno para cada fan.

**Accesorios › Porta carnets** (12 / 12)
- seoTitle: Portacarnets con personajes
- seoDescription: Portacarnets con yoyo y diseños de Dragon Ball, Pokémon, One Piece, Doraemon, Kuromi y más, para el carnet del colegio o del trabajo.
- Intro: Portacarnets para llevar a la vista el carnet del colegio, la universidad o el trabajo. Algunos tienen yoyo retráctil, y vienen con personajes de anime y caricaturas como Dragon Ball, Pokémon, One Piece, Doraemon, Bob Esponja, Stitch o Kuromi. También sirven para llevar la tarjeta del transporte o del gimnasio.

**Accesorios › Mugs** (10 / 15)
- seoTitle: Mugs y tazas de cerámica
- seoDescription: Mugs, tazones herméticos y sets de plato y mug en cerámica con gatos, patitas, Snoopy y diseños de temporada. Para tu café o para regalar.
- Intro: Mugs y piezas de cerámica para el desayuno o el escritorio: tazas con gatos, patitas y animales, un set de plato y mug de conejito, platos y un tazón hermético de Snoopy. Funcionan bien como regalo de cumpleaños o de amigo secreto.

**Accesorios › Pines** (10 / 10)
- seoTitle: Pines de personajes y anime
- seoDescription: Pines de Harry Potter, Stitch, One Piece, Intensamente, Pusheen o Timón y Pumba para decorar tu morral, tu chaqueta o la cartuchera.
- Intro: Pines para personalizar un morral, una chaqueta, una gorra o la cartuchera. Hay diseños de Harry Potter, Stitch, One Piece, Intensamente, Pusheen, Timón y Pumba, capibaras y gatos, y combinan bien si quieres armar tu propia colección. Son un regalo pequeño y fácil para fans de una película o una serie.

**Journal / Scrap › Stickers** ✱ (26 / 45)
- seoTitle: Stickers para journal, agenda y scrapbook
- seoDescription: Sobres y láminas de stickers florales, vintage, en relieve y de personajes como Hello Kitty, Snoopy o El Principito, para journal y agendas.
- Intro: Stickers para decorar journals, agendas, cuadernos y tarjetas: sobres de stickers florales y vintage, láminas de El Principito, Snoopy 3D y Hello Kitty, stickers en relieve, metalizados, en vinilo transparente y en rollo. También hay plantillas para bullet journal y paquetes kawaii surtidos.

**Journal / Scrap › Troqueles** (9 / 11)
- seoTitle: Troqueles y perforadoras para scrapbook
- seoDescription: Troqueles de figuras y de borde, perforadoras de encaje, cortador de puntas redondas y corrugador de papel para scrapbook y journal.
- Intro: Herramientas para cortar y dar forma al papel: troqueles de figuras de 1 cm, de borde y de punta encaje, un troquel de anillado, cortador de puntas redondas, corrugador de papel y tapete de corte. Sirven para hacer tarjetas, etiquetas y bordes decorativos en scrapbook y journal.

**Planeación & Organización › Agendas** ✱ (16 / 36)
- seoTitle: Agendas A5, mini y permanentes
- seoDescription: Agendas A5, mini y permanentes con diseños de Harry Potter, El Principito, One Piece, arte clásico y pastel para organizar estudio y trabajo.
- Intro: Agendas para planear clases, trabajo y metas: A5, mini y permanentes (sin fechas impresas), con portadas de Harry Potter y las casas de Hogwarts, El Principito, One Piece, ilustraciones de William Morris y Henri Le Sidaner, o diseños pastel y acolchados.

**Planeación & Organización › Planeadores** (15 / 20)
- seoTitle: Planeadores diarios, semanales y mensuales
- seoDescription: Planeadores diarios, semanales y mensuales, verticales y en block, con flores, Sanrio, Stitch y Capibara, para organizar tareas y pendientes.
- Intro: Planeadores para ver el día, la semana o el mes de un vistazo: daily planners verticales, planeadores semanales y mensuales, blocks de hojas y listas de pendientes. Hay diseños de flores, dorados y girly, y personajes como Sanrio, Stitch, Capibara y gatos.

**Cuadernos › Argollados** ✱ (14 / 23)
- seoTitle: Cuadernos argollados rayados y cuadriculados
- seoDescription: Cuadernos argollados de 1 y 5 materias, grandes y pequeños, rayados o cuadriculados, con Snoopy, Mafalda, Hello Kitty, Stitch y BTS.
- Intro: Cuadernos argollados para clase y apuntes: grandes y pequeños, de una o cinco materias, de 60 y 80 hojas, rayados o cuadriculados. Hay portadas de Snoopy, Mafalda, Hello Kitty, Pochacco, Stitch, BTS y Disney, además de diseños lisos y kraft para quien prefiere algo sencillo.

**Cuadernos › Libretas** ✱ (9 / 15)
- seoTitle: Libretas de bolsillo y media carta
- seoDescription: Libretas pequeñas, de bolsillo, de resorte y media carta, con gatos, capibaras, pandas y flores, para apuntar ideas o llevar en la cartuchera.
- Intro: Libretas para tener siempre a mano: de bolsillo, mini, de resorte y media carta, algunas cuadriculadas y otras con hojas negras. Los diseños van de gatitos y capibaras a pandas, flores y Lotso, y caben en la cartuchera o el bolso para anotar ideas, listas o dibujos rápidos.

**Cuadernos › Cosidos** (8 / 8)
- seoTitle: Cuadernos cosidos de 50 y 100 hojas
- seoDescription: Cuadernos cosidos rayados, cuadriculados, de puntos y doble línea, de 50 y 100 hojas, con Snoopy, One Piece y diseños girly.
- Intro: Cuadernos cosidos, sin argollas que se enreden en la maleta: de 50 y 100 hojas, en rayado, cuadriculado, puntos y doble línea para practicar letra. Hay portadas de Snoopy, One Piece, personajes y diseños girly. Funcionan para el colegio, la universidad o para llevar un diario.

**Lápices & Colores › Lápices** ✱ (16 / 22)
- seoTitle: Lápices infinitos y lápices HB
- seoDescription: Lápices infinitos con figuras, lápices HB y cajas de lápices pastel por unidad o en caja, con gatos, perritos, sirenas y personajes.
- Intro: Lápices para escribir y dibujar: lápices infinitos, que no necesitan tajalápiz, con figuras de gatos, perritos, ositos, aguacates o sirenas, lápices HB como el Mirado #2 y cajas de 6 a 12 unidades en tonos pastel o con personajes. Son útiles para el colegio, para bocetar y para armar un kit de regalo.

**Lápices & Colores › Portaminas** (10 / 16)
- seoTitle: Portaminas de 0.5, 0.7 y 2.0 mm
- seoDescription: Portaminas de 0.5, 0.7 y 2.0 mm, metálicos, pastel y con personajes como Pochacco o Pompompurin; algunos traen minas de repuesto.
- Intro: Portaminas para escribir sin tajar: de 0.5 y 0.7 mm para apuntes y de 2.0 mm para dibujo y bocetos. Hay modelos metálicos, en tonos pastel o mármol y con personajes como Pochacco, Pompompurin, gatos y perritos; algunos traen repuesto de minas.

**Lápices & Colores › Colores** (9 / 9)
- seoTitle: Cajas de colores de 12 a 36 tonos
- seoDescription: Cajas de colores de 12 a 36 tonos, de doble punta, triangulares y en caja metálica, de Norma, Scribe y Offi-esco, para colorear e ilustrar.
- Intro: Colores para colorear, ilustrar y hacer tareas: cajas de 12 a 36 tonos, de doble punta, triangulares en pastel y en caja metálica. Hay marcas como Norma, Scribe y Offi-esco, y una caja de Disney Junior para los más pequeños.

**Oficina › Herramientas de oficina** ✱ (15 / 19)
- seoTitle: Grapadoras, perforadoras y más para oficina
- seoDescription: Grapadoras mini y medianas, perforadoras de 1 y 2 huecos, dispensadores de cinta, lupas y una mini impresora térmica, en pastel y con personajes.
- Intro: Herramientas para el escritorio que también se ven bonitas: grapadoras mini y medianas con sus ganchos, perforadoras de uno y dos huecos, dispensador de cinta y lupa, en colores pastel o con Stitch, Kuromi y Capibara. También hay una mini impresora térmica.

**Oficina › Blocks de papel** (8 / 17)
- seoTitle: Blocks rayados, cuadriculados e iris
- seoDescription: Blocks carta y media carta rayados o cuadriculados, blocks de hojas blancas carta y oficio, y block iris de colores para tareas y manualidades.
- Intro: Blocks para tareas, trabajos y manualidades: carta y media carta en rayado o cuadriculado, hojas blancas tamaño carta y oficio de 70 hojas, y block iris en tonos pastel o de 35 hojas de colores. Son una forma práctica de tener hojas sueltas para el colegio o la oficina.

**Oficina › Papeles** (6 / 14)
- seoTitle: Cartulinas, papel crepé y papel acuarela
- seoDescription: Cartulina de colores, papel crepé por pliego, cartulina para acuarela, block iris neón y rollos para mini impresora térmica.
- Intro: Papeles para manualidades y proyectos del colegio: cartulina de 1/8 en tonos fuertes, papel crepé por pliego, cartulina para acuarela y block iris neón con formas. También están los rollos de repuesto, normales y de sticker, para la mini impresora térmica.

**Bolsos & Morrales › Cartucheras** ✱ (17 / 34)
- seoTitle: Cartucheras kawaii y de varios bolsillos
- seoDescription: Cartucheras de uno o varios bolsillos, tipo maleta e impermeables, y cosmetiqueras, con diseños de Sanrio, capibaras y estilo retro o pastel.
- Intro: Cartucheras para llevar lapiceros, colores y todo lo del estuche en orden: de un bolsillo, de varios compartimentos, tipo maleta e impermeables, además de cosmetiqueras de tela. Hay diseños de Sanrio como Hello Kitty y Hangyodon, capibaras, cajitas de leche kawaii y estilos retro o pastel.

**Lectura › Separadores de páginas** (11 / 19)
- seoTitle: Separadores de páginas imantados
- seoDescription: Separadores de libros imantados, de cadena y en forma de pluma, con flores, obras de arte, El Principito y Harry Potter. Por unidad o en set.
- Intro: Separadores para no perder la página: imantados, de cadena, en forma de pluma y en sets de 2 o 4. Tienen ilustraciones de flores, obras de arte, El Principito y Harry Potter, y son un buen complemento para regalar con un libro.

**Lectura › Banderitas adhesivas** (6 / 13)
- seoTitle: Banderitas adhesivas para marcar páginas
- seoDescription: Banderitas adhesivas de colores, con abecedario y en tonos Morandi, para marcar páginas de libros, apuntes y agendas.
- Intro: Banderitas adhesivas para señalar citas en un libro, temas en los apuntes o fechas en la agenda. Hay paquetes de varios colores, con abecedario para indexar y en tonos Morandi. Funcionan bien para estudiar, para clubes de lectura o para organizar documentos del trabajo.

**Belleza / Cuidado Personal › Moñas / Pinzas** (8 / 8)
- seoTitle: Scrunchies, moñas y pinzas para el cabello
- seoDescription: Scrunchies de flores, encaje y perlas, moñas con lazo y pinzas como la de Kuromi para recoger el cabello con un detalle bonito.
- Intro: Accesorios para el cabello con detalles delicados: scrunchies de florecitas, encaje y perlas, moñas con lazo o flor doble y pinzas como la de Kuromi o la de lazo tornasol. Son un complemento fácil para el día a día o un detalle pequeño para regalar.

**Creatividad & Juego › Lego** (6 / 7)
- seoTitle: Bloques de construcción de personajes
- seoDescription: Sets de bloques para armar personajes de Mario Bros, Bob Esponja, Winnie Pooh, Psyduck, superhéroes y un panda.
- Intro: Sets de bloques para armar figuras de personajes conocidos: Mario Bros, Bob Esponja y sus amigos, Winnie Pooh, Psyduck, superhéroes o un panda. Son un pasatiempo para niños y adultos y un regalo diferente para quien colecciona figuras. Se pueden armar en familia y después quedan como figura de colección.
- **Pregunta:** la categoría y los productos se llaman «Lego». Si no son de la marca LEGO, el nombre es un riesgo de marca registrada y conviene renombrarlos («Bloques de construcción»), conservando el slug viejo como alias. Por eso el texto no dice «Lego».

**Kits › Kits para regalar o regalarse** (6 / 13)
- seoTitle: Kits de papelería para regalar
- seoDescription: Kits armados de papelería con temas como Pochacco, Hogwarts, gatos y capibaras, además de kits de apuntes y de arte, listos para regalar.
- Intro: Kits de papelería ya armados, para regalar sin tener que escoger cada pieza: hay kits temáticos de Pochacco, las casas de Hogwarts, gatos y capibaras, además de un kit básico de apuntes y otro de arte. También sirven para darse un gusto o para empezar un pasatiempo nuevo.

##### B.2.3 Lo que no se redactó y por qué

- 75 categorías tienen menos de 6 familias (12 con cero). Indexarlas daría páginas delgadas.
- **Solapamientos que conviene arreglar en los datos antes de indexar más páginas** (decisión de Paula; no se tocó nada):
  - Lápices contiene «Portaminas 11 minas Capibara» y «… One Piece», que parecen portaminas.
  - Argollados contiene «Cuaderno 5 materias Snoopy A5 argollado», y existe Multimaterias (5 familias).
  - Blocks de papel contiene «Foami x unidad».
  - Papeles contiene cartulinas y rollos para impresora térmica, y existe Cartulinas (1 familia).
  - Carpetas › Sobres plásticos contiene «Carpeta hermética…», y existe Planeación › Folder (3).
  - Carpetas › Carpetas tiene el mismo nombre que su tipo.
  - Bolsos & Morrales es casi todo Cartucheras (17 de 20).


#### B.3 Plan de implementación (no implementado)

##### B.3.1 Dónde vive el texto hoy

- **Categoría:** `Category` ya tiene todos los campos (`pdepapel-admin/prisma/schema.prisma`, modelo `Category`): `seoEnabled`, `seoFeatured`, `seoTitle VarChar(70)`, `seoDescription VarChar(170)`, `seoIntro Text`, `imageUrl`. **No hace falta migración.** Se editan en el panel › Categorías › ficha de la categoría (`categorias/[categoryId]/components/category-form.tsx:521-575`); al activar `seoEnabled` el formulario exige título, descripción e intro (:61-73). El PATCH (`app/api/[storeId]/categories/[categoryId]/route.ts:92`) llama a `triggerStorefrontRevalidation` (:198) después de guardar, así que la tienda se refresca sola.
- **Tipo:** `Type` solo tiene `name`, `slug`, `icon`, `iconSvg`, `isArchived` y alias en `TypeSlugAlias`. **No hay dónde guardar estos textos** sin migración.

##### B.3.2 Cómo los usa la tienda

- `app/(routes)/categoria/[slug]/page.tsx`: `<title>` = `seoTitle || nombre` (:52) más la plantilla « | Papelería P de Papel» (`app/layout.tsx:46`); meta = `seoDescription` o un respaldo genérico (:53); la intro va a `PageHeader` (:118, :158) y se pinta con `CollapsibleIntro` (dos líneas y «Leer más»).
- Indexación (`lib/listing-seo.ts` › `getListingIndexing`, :55 de la página): la URL base se indexa **solo con `seoEnabled`**; cualquier filtro, orden o búsqueda → `noindex` y canónica a la base; `?page=N` (N ≥ 2) → `noindex` con canónica propia. El sitemap solo lista categorías con `seoEnabled` y slug (`app/sitemap.ts:38-41`).
- Con `seoEnabled` en falso, la intro y la meta igual se ven en la página (`noindex`), así que llenar los textos no tiene riesgo; lo que cambia la indexación es activar `seoEnabled`.

##### B.3.3 Categorías: pasos

1. Paula revisa y ajusta los textos de B.2.2.
2. Se cargan de una de dos formas:
   - **Panel (recomendado):** categoría por categoría. Cada guardado refresca la tienda.
   - **Script por lotes:** un script en el scratchpad con `createProdClient()` que actualice `seoTitle`, `seoDescription`, `seoIntro` (y `seoEnabled` donde se apruebe) de las 32 categorías, por `id`, ejecutado con `npm run prod:write` después del token de Christian. `Category` no es modelo del libro mayor. Un script **no** llama a `triggerStorefrontRevalidation`: hay que pedir después `POST /api/revalidate` con la etiqueta `catalog` o esperar el caché de 5 minutos. Antes de escribir, guardar los valores actuales (JSON de la API pública) para poder revertir.
3. `seoEnabled`: hoy 14 categorías están indexables. De las 18 con 6 o más familias que no lo están, activar solo las que tengan demanda (P1-5 del documento SEO: carpetas, sombrillas y las del menú). Las de 6–9 familias (Pegante, Reglas, Bisturíes, Banderitas, Papeles, Lego, Kits para regalar, Plumones, Cosidos, Troqueles, Colores, Moñas/Pinzas, Blocks de papel) quedan delgadas: mejor activarlas después de arreglar los solapamientos de B.2.3.
4. Verificación: `curl` de cada `/categoria/<slug>` → 200, `<title>`, meta y `robots` esperados; el sitemap lista las nuevas con `seoEnabled`; las filtradas siguen `noindex`.

Tests: no hay tests que fijen textos de categorías concretas (los textos son datos). `tests/unit/app/canonical-per-template.test.ts` y `tests/e2e/seo-contract.spec.ts` cubren canónica e indexación por plantilla y no cambian.

##### B.3.4 Tipos: lo que haría falta para una página propia

Hoy el tipo solo existe como filtro: `typePath` = `/tienda?typeId=<id>` (`pdepapel-store/lib/routes.ts:84-86`). Esa URL es `noindex` con canónica a `/tienda`, porque `getListingIndexing` marca así cualquier parámetro (`app/(routes)/tienda/page.tsx:35-39`). No hay ninguna URL de tipo indexable.

P1-6 (`docs/seo/2026-10-05-seo-maintenance.md:275`) propone `/tienda/<slug-del-tipo>` (por ejemplo `/tienda/escritura`). Según la política de rutas de `pdepapel-store/AGENTS.md` («Routing and SEO»), haría falta:

1. **Migración** (protocolo manual, archivo fechado en `prisma/manual-migrations/`): `Type` + `seoEnabled BOOLEAN DEFAULT false`, `seoTitle VARCHAR(70)`, `seoDescription VARCHAR(170)`, `seoIntro TEXT`, `imageUrl TEXT`, igual que `Category`. Aplicarla en Railway **antes** del deploy: varias consultas de tipos leen todas las columnas escalares y fallarían con una columna que no existe.
2. **Admin:** campos en el formulario de tipos (`tipos/[typeId]/components/type-form.tsx`), en POST/PATCH de `app/api/[storeId]/types/` y en el GET público; reutilizar los topes de `lib/category-seo.ts`. El enlace «ver en la tienda» del formulario (`type-form.tsx:163`) y de la lista (`tipos/components/cell-action.tsx:13`) pasa a la ruta nueva.
3. **Tienda, ruta nueva** `app/(routes)/tienda/[tipo]/page.tsx`: resolver por slug, por id o por alias (el GET del admin ya acepta los tres, `types/[typeId]/route.ts:29-55`) y responder `permanentRedirect` al slug canónico si llegó por id o alias; `notFound()` si no existe (un tipo que nunca existió sigue en 404). Metadata con `getListingIndexing(typePath, searchParams, type.seoEnabled)`, breadcrumb e `ItemList` en JSON-LD como la categoría, y `PageHeader` con la intro. La página queda dentro del tipo (`CategoryChips` con `activeTypeId`), como pide AGENTS.md para las categorías. Choca con la carpeta `tienda/components`, que no es ruta: no hay conflicto real, pero `/tienda/components` caería en `[tipo]` y debe dar 404.
4. **Redirección de la URL vieja:** `/tienda?typeId=<id|slug>` sin otros parámetros → 308 a `/tienda/<slug>`. `next.config.mjs` no puede traducir un id a slug, así que va en `tienda/page.tsx` (o en el middleware). Con otros filtros, conservar la URL actual (`noindex`) o redirigir a `/tienda/<slug>?<resto>`. No se borra ninguna redirección existente.
5. **`typePath`** cambia de `{ id }` a `{ slug, id }` y todos sus usos se actualizan: `components/navbar.tsx`, `mega-menu.tsx`, `category-drawer.tsx`, `category-chips.tsx`, `search-bar.tsx`, `app/(routes)/tienda/page.tsx` y `lib/archived-product-redirect.ts:18`. El destino de un producto archivado sin categoría viva lo decide el admin (`pdepapel-admin/lib/archived-product-redirect.ts:84`, que hoy solo devuelve el `id` del tipo): debe devolver también el slug, o la tienda lo busca en la lista de tipos.
6. **Sitemap:** añadir los tipos con `seoEnabled` y slug, igual que las categorías (`app/sitemap.ts:38-41`). `robots` no cambia; el middleware de Clerk no aplica (ruta de catálogo pública, `middleware.ts:32`).
7. **Tests:** rutas (`typePath`), `tests/unit/lib/archived-product-redirect.test.ts`, `tests/components/header-navigation.test.tsx`, `tests/components/search-suggestions.test.tsx` y `pdepapel-admin/tests/components/type-form.test.tsx` (hoy esperan `?typeId=`); `canonical-per-template.test.ts` con la plantilla nueva; sitemap; e2e `seo-contract.spec.ts` y `public-catalog.spec.ts` (200 e indexable con `seoEnabled`, `noindex` con filtros, 308 desde `?typeId=`, 404 para un slug inventado).
8. **Qué tipos activar.** No todos merecen página indexable: Bolsos & Morrales es casi todo Cartucheras (duplicaría `/categoria/cartucheras`); Belleza (13 familias), Kits (13) y Carpetas (15) son delgados. Candidatos claros: Escritura, Útiles, Accesorios, Journal / Scrap, Planeación & Organización, Cuadernos, Lápices & Colores y Oficina. Este plan es la parte «páginas de tipos» de P1-6; la otra parte (categorías nuevas para cuadernos 5 materias, folders, papeles y cartulinas) es de datos y se cruza con B.2.3.

Esfuerzo: L, como estima P1-6. La parte de categorías (B.3.3) es solo de datos y se puede hacer antes, sin código.

---

## C — Productos archivados que caen en categorías noindex

Fecha: 2026-10-05. Solo lectura. Las consultas se hicieron con el usuario `pdepapel_ro` (`node --env-file=.env`, MySQL 8.4.11 en Railway), tienda `f23ee5bc-1f6f-4c10-9872-9e6217cc17fd`. No se aplicó nada, no se tocó el repo ni hubo escrituras.
Guiones de consulta (borrador): `q-archived.mjs`, `q-meta.mjs`. Resultado crudo: `archived-result.json`.

---


#### C.1 Cadena de resolución exacta (código)

Petición `/producto/<ref>` en la tienda:

1. `pdepapel-store/app/(routes)/producto/[slug]/page.tsx:28` y `:79`: si el panel devuelve `redirect`, hace `permanentRedirect` (**308**) a `archivedProductRedirectPath(...)`.
2. `pdepapel-store/actions/get-product.ts:33-51`: `GET /products/<ref>?scope=storefront`; un 404 con `redirect` válido es el destino, y un 404 sin `redirect` es un 404 real.
3. Panel, `pdepapel-admin/app/api/[storeId]/products/[productId]/route.ts`:
   - `:127-131` busca un producto **vivo** por `id` o `slug`;
   - `:133-150` si no lo hay, busca un `ProductSlugAlias` (`storeId_slug`) y su producto, que tiene que estar **vivo**;
   - `:153-165` si ninguno aparece y la petición es de la tienda, llama a `findArchivedProductRedirect`.
4. `pdepapel-admin/lib/archived-product-redirect.ts:42-88`:
   - `:48-51` busca un producto archivado por `id` o `slug`;
   - `:52-63` si no, un alias que apunte a un producto archivado;
   - `:64-68` si no, `DeletedProductUrl` por `slug` o `productId`, el más reciente (`lib/deleted-product-urls.ts:56-62`). Si tampoco hay, devuelve `null`: 404;
   - `:70-77` busca una hermana viva del mismo `productGroupId`, ordenada por `stock desc, createdAt asc`;
   - `:78-85` lee la categoría (por `categoryId`) y su tipo;
   - `chooseArchivedProductRedirect` (`:24-35`) decide en este orden: **hermana**, luego **categoría** si no está archivada y tiene slug, luego **tipo** si no está archivado, luego **tienda**. **No mira `seoEnabled`.**
5. URL final (`pdepapel-store/lib/archived-product-redirect.ts:11-21`), siempre con `#producto-no-disponible`:
   - producto: `/producto/<slug>`;
   - categoría: `/categoria/<slug>`;
   - tipo: `/tienda?typeId=<id>` (`lib/routes.ts:85-86`);
   - tienda: `/tienda`.
6. Indexabilidad de cada destino:
   - categoría: `getListingIndexing(base, params, Boolean(category.seoEnabled))` (`categoria/[slug]/page.tsx:55,60`; `lib/listing-seo.ts:33-42`). Sin `seoEnabled` es **noindex, follow** y queda fuera del sitemap (`app/sitemap.ts:39`);
   - tipo: `/tienda?typeId=…` lleva parámetro, así que es **noindex con canónica a `/tienda`** (`listing-seo.ts:38-41`), y además `robots.ts:39` tiene `Disallow: /tienda?`. Googlebot **ni siquiera puede rastrear** ese destino.

`ProductSlugAlias` y `DeletedProductUrl` sí entran en la cadena (pasos 3 y 4).

#### C.2 Datos (producción, solo lectura)

| Dato | Valor |
|---|---:|
| Productos en la tienda | 2.066 (888 vivos, **1.178 archivados**) |
| Alias `ProductSlugAlias` | 2.276 (1.249 apuntan a archivados; 0 huérfanos; 0 de otra tienda) |
| `DeletedProductUrl` | **0 filas**: el registro empezó hoy y aún no se ha borrado nada |
| Categorías | 107 (0 archivadas; **14** con `seoEnabled`) |
| Tipos | 14 (0 archivados) |
| Alias `CategorySlugAlias` | 0 |

**Destino de cada URL canónica de archivado (`/producto/<slug>`, 1.178 en total):**

| Destino | URLs | % |
|---|---:|---:|
| Categoría **noindex** (`seoEnabled=false`) | **618** | 52,5 % |
| Categoría indexable (`seoEnabled=true`) | 543 | 46,1 % |
| Hermana viva del grupo | 15 | 1,3 % |
| Sirve un producto **vivo** (200, no hay redirección)* | 2 | 0,2 % |
| Tipo (`/tienda?typeId=`) | 0 | — |
| `/tienda` | 0 | — |

\* `carpeta-plastica-oficio-lila` y `carpeta-van-gogh` son slugs de productos archivados que **también son alias de otro producto vivo**. La API resuelve primero el alias hacia el vivo (`route.ts:133-150`), así que nunca llegan a la cadena de archivados.

Así se confirma la estimación previa: **618 de 1.178**.

Otras puertas a los mismos productos:

| Referencia | Categoría noindex | Categoría indexable | Hermana | Total |
|---|---:|---:|---:|---:|
| Por `id` (`/producto/<uuid>`) | 618 | 543 | 17 | 1.178 |
| Por alias que apunta a un archivado | 665 | 565 | 19 | 1.249 |
| **Todas las URL con slug (canónica + alias)** | **1.283** | 1.108 | 34 | 2.427, de las cuales 2 sirven un producto vivo |

- Archivados que tienen grupo pero ninguna hermana viva, y por eso caen a su categoría: **94**.
- Ningún slug archivado está duplicado, así que no hay ambigüedad en el `findFirst` (0 casos).
- Las ramas «tipo» y «tienda» hoy son inalcanzables, porque no hay categorías ni tipos archivados.

**Las 618 URLs que caen en noindex, según cuántos productos vivos tiene la categoría** (77 categorías noindex reciben al menos una):

| Categorías destino | Categorías | URLs canónicas | URLs con alias |
|---|---:|---:|---:|
| **0 productos vivos** (listado vacío) | 12 | **46** | 94 |
| 1–2 vivos | 22 | 123 | 250 |
| 3–5 vivos | 13 | 155 | 329 |
| ≥ 6 vivos | 30 | 294 | 610 |

Las 12 categorías vacías que reciben aterrizajes son: `kits-universitarios` (14), `termos` (14), `sellos-escolares` (3), `antibacterial` (3), `empaques-para-regalo` (2), `diario-devocional` (2), `cuadernos-de-lettering` (2), `rapidografos` (2), `hojas-de-origami` (1), `panitos` (1), `sellos-de-lectura` (1) y `lamparas` (1).

**Las 618, por tipo:**

| Tipo | URLs en noindex | Categorías indexables del tipo |
|---|---:|---|
| Kits | 154 | ninguna |
| Accesorios | 113 | llaveros |
| Útiles | 108 | borradores, notas-adhesivas |
| Planeación & Organización | 48 | agendas |
| Creatividad & Juego | 45 | ninguna |
| Journal / Scrap | 29 | stickers, blocks-de-hojas-decorativas |
| Lectura | 27 | ninguna |
| Belleza / Cuidado Personal | 26 | ninguna |
| Carpetas | 20 | ninguna |
| Lápices & Colores | 18 | lapices |
| Cuadernos | 12 | argollados, libretas |
| Escritura | 8 | boligrafos-lapiceros, resaltadores, marcadores |
| Bolsos & Morrales | 4 | cartucheras |
| Oficina | 6 | herramientas-de-oficina |

Hay 272 URLs (29 categorías) en tipos que **no tienen ninguna categoría indexable**: Kits, Creatividad & Juego, Belleza, Lectura y Carpetas.

##### Tabla por categoría destino

Todas las categorías que reciben al menos un aterrizaje, más las indexables. Columnas:
- **SEO**: `seoEnabled`.
- **Textos**: título, descripción, intro e imagen. `1111` significa que están todos; `0011`, que faltan el título y la descripción SEO.
- **Vivos / con stock / tarjetas**: productos vivos, vivos con stock mayor que 0 y tarjetas del listado (grupos colapsados).
- **Aterr.**: URLs canónicas de archivados que aterrizan ahí. **+alias**: incluyendo los alias.

| Categoría | slug | SEO | Textos | Vivos | Con stock | Tarjetas | Aterr. | +alias |
|---|---|:-:|:-:|---:|---:|---:|---:|---:|
| Bolígrafos / Lapiceros | boligrafos-lapiceros | Sí | 1111 | 88 | 79 | 58 | 134 | 272 |
| Stickers | stickers | Sí | 1111 | 45 | 20 | 26 | 66 | 137 |
| Kits escolares | kits-escolares | no | 0011 | 3 | 2 | 1 | 51 | 113 |
| Resaltadores | resaltadores | Sí | 1111 | 22 | 21 | 13 | 49 | 98 |
| Cartucheras | cartucheras | Sí | 1111 | 34 | 32 | 17 | 45 | 95 |
| Borradores | borradores | Sí | 1111 | 27 | 27 | 19 | 43 | 86 |
| Kits sorpresa | kits-sorpresa | no | 0011 | 1 | 1 | 1 | 40 | 80 |
| Agendas | agendas | Sí | 1111 | 36 | 23 | 16 | 40 | 80 |
| Kits kawaii | kits-kawaii | no | 0011 | 12 | 12 | 2 | 32 | 76 |
| Marcadores | marcadores | Sí | 1111 | 25 | 25 | 21 | 29 | 58 |
| Sacapuntas | sacapuntas | no | 0011 | 4 | 4 | 1 | 28 | 60 |
| Argollados | argollados | Sí | 1111 | 23 | 19 | 14 | 28 | 60 |
| Lego | lego | no | 0011 | 7 | 6 | 6 | 26 | 56 |
| Lápices | lapices | Sí | 1111 | 22 | 20 | 16 | 25 | 54 |
| Notas adhesivas | notas-adhesivas | Sí | 1111 | 29 | 25 | 22 | 25 | 50 |
| Llaveros | llaveros | Sí | 1111 | 29 | 24 | 20 | 23 | 46 |
| Libretas | libretas | Sí | 1111 | 15 | 11 | 9 | 23 | 46 |
| Correctores | correctores | no | 0011 | 10 | 9 | 4 | 22 | 44 |
| Bolsos pequeños | bolsos-pequenos | no | 0011 | 9 | 8 | 2 | 20 | 40 |
| Washi tape | washi-tape | no | 0011 | 3 | 3 | 3 | 19 | 38 |
| Planeadores | planeadores | no | 0011 | 20 | 20 | 15 | 16 | 32 |
| Brillos / Bálsamos | brillos-balsamos | no | 0011 | 1 | 0 | 1 | 15 | 30 |
| Clips | clips | no | 0011 | 7 | 7 | 4 | 14 | 28 |
| Kits universitarios | kits-universitarios | no | 0000 | 0 | 0 | 0 | 14 | 28 |
| Termos | termos | no | 0000 | 0 | 0 | 0 | 14 | 30 |
| Accesorios personales | accesorios-personales | no | 0011 | 7 | 5 | 4 | 14 | 28 |
| Reglas | reglas | no | 0011 | 17 | 10 | 8 | 14 | 28 |
| Porta carnets | porta-carnets | no | 0011 | 12 | 12 | 12 | 13 | 27 |
| Banderitas adhesivas | banderitas-adhesivas | no | 0011 | 13 | 7 | 6 | 13 | 26 |
| Tijeras | tijeras | no | 0011 | 7 | 7 | 4 | 13 | 26 |
| Kits de Journal / Scrap | kits-de-journal-scrap | no | 0011 | 1 | 0 | 1 | 13 | 28 |
| Protector de cargador | protector-de-cargador | no | 0011 | 2 | 2 | 2 | 12 | 24 |
| Portaminas | portaminas | no | 0011 | 16 | 16 | 10 | 12 | 24 |
| Folder | folder | no | 0011 | 3 | 3 | 3 | 11 | 22 |
| Sobres plásticos | sobres-plasticos | no | 0011 | 10 | 9 | 4 | 9 | 18 |
| Mugs | mugs | no | **1111** | 15 | 12 | 10 | 9 | 18 |
| Organizadores | organizadores | no | 0011 | 4 | 4 | 4 | 9 | 18 |
| Sellos decorativos | sellos-decorativos | no | 0011 | 5 | 4 | 3 | 8 | 20 |
| Separadores de páginas | separadores-de-paginas | no | 0011 | 19 | 19 | 11 | 8 | 16 |
| Herramientas de oficina | herramientas-de-oficina | Sí | 1111 | 19 | 18 | 15 | 8 | 16 |
| Pines | pines | no | 0011 | 10 | 10 | 10 | 8 | 16 |
| Vasos | vasos | no | 0011 | 2 | 2 | 2 | 6 | 12 |
| Bisturíes | bisturies | no | 0011 | 8 | 8 | 6 | 6 | 12 |
| Libros de colorear | libros-de-colorear | no | 0011 | 4 | 2 | 4 | 6 | 12 |
| Papeles | papeles | no | 0011 | 14 | 14 | 6 | 5 | 15 |
| Cintas resaltadoras | cintas-resaltadoras | no | 0011 | 7 | 4 | 2 | 5 | 10 |
| Planilleros | planilleros | no | 0011 | 7 | 7 | 3 | 5 | 10 |
| Blocks de hojas decorativas | blocks-de-hojas-decorativas | Sí | 1111 | 7 | 3 | 4 | 5 | 10 |
| Pegante | pegante | no | 0011 | 14 | 13 | 8 | 5 | 10 |
| Plumones | plumones | no | 0011 | 9 | 9 | 9 | 5 | 10 |
| Bolsas de agua térmica | bolsas-de-agua-termica | no | 0011 | 3 | 0 | 1 | 5 | 10 |
| Kits de lectura | kits-de-lectura | no | 0011 | 1 | 1 | 1 | 4 | 8 |
| Sketchbook / Bitácora | sketchbook-bitacora | no | 0011 | 5 | 5 | 5 | 4 | 8 |
| Carpetas | carpetas | no | 0011 | 11 | 10 | 5 | 4 | 8 |
| Cosidos | cosidos | no | 0011 | 8 | 8 | 8 | 4 | 8 |
| Sombrillas | sombrillas | no | 0011 | 2 | 2 | 2 | 4 | 8 |
| Multimaterias | multimaterias | no | 0011 | 5 | 5 | 5 | 4 | 8 |
| Calendarios | calendarios | no | 0011 | 3 | 3 | 3 | 4 | 8 |
| Toallas | toallas | no | 0011 | 6 | 4 | 1 | 3 | 6 |
| Cinta | cinta | no | 0011 | 1 | 1 | 1 | 3 | 6 |
| Sellos escolares | sellos-escolares | no | 0000 | 0 | 0 | 0 | 3 | 6 |
| Pinturas | pinturas | no | 0011 | 5 | 3 | 5 | 3 | 6 |
| Antibacterial | antibacterial | no | 0000 | 0 | 0 | 0 | 3 | 6 |
| Minas | minas | no | 0011 | 3 | 3 | 2 | 3 | 6 |
| Juegos de sticker room | juegos-de-sticker-room | no | 0011 | 1 | 0 | 1 | 3 | 8 |
| Set de notas (planner sticky notes) | set-de-notas-planner-sticky-notes | no | 0011 | 1 | 1 | 1 | 3 | 6 |
| Colores | colores | no | 0011 | 9 | 9 | 9 | 3 | 6 |
| Accesorios de escritorio | accesorios-de-escritorio | no | 0011 | 2 | 2 | 2 | 2 | 4 |
| Hojas de repuesto | hojas-de-repuesto | no | 0011 | 1 | 1 | 1 | 2 | 4 |
| Empaques para regalo | empaques-para-regalo | no | 0000 | 0 | 0 | 0 | 2 | 4 |
| Loncheras | loncheras | no | 0011 | 1 | 1 | 1 | 2 | 4 |
| Moñas / Pinzas | monas-pinzas | no | 0011 | 8 | 8 | 8 | 2 | 4 |
| Diario devocional | diario-devocional | no | 0000 | 0 | 0 | 0 | 2 | 4 |
| Crayones | crayones | no | 0011 | 1 | 1 | 1 | 2 | 4 |
| Cuadernos de lettering | cuadernos-de-lettering | no | 0000 | 0 | 0 | 0 | 2 | 4 |
| Rapidógrafos | rapidografos | no | 0000 | 0 | 0 | 0 | 2 | 4 |
| Plastilina | plastilina | no | 0011 | 2 | 2 | 2 | 2 | 4 |
| Espejos | espejos | no | 0011 | 1 | 1 | 1 | 2 | 4 |
| Maletas / Morrales | maletas-morrales | no | 0011 | 2 | 2 | 2 | 2 | 4 |
| Monederos | monederos | no | 0011 | 2 | 2 | 2 | 2 | 4 |
| Archivadores | archivadores | no | 0011 | 7 | 6 | 3 | 2 | 4 |
| Hojas de origami | hojas-de-origami | no | 0000 | 0 | 0 | 0 | 1 | 2 |
| Blocks de papel | blocks-de-papel | no | 0011 | 17 | 17 | 8 | 1 | 2 |
| Cuadros de piedras | cuadros-de-piedras | no | 0011 | 1 | 1 | 1 | 1 | 2 |
| Pañitos | panitos | no | 0000 | 0 | 0 | 0 | 1 | 2 |
| Calculadoras | calculadoras | no | 0011 | 1 | 1 | 1 | 1 | 2 |
| Sellos de lectura | sellos-de-lectura | no | 0000 | 0 | 0 | 0 | 1 | 2 |
| Squishy | squishy | no | 0011 | 1 | 0 | 1 | 1 | 2 |
| Micropuntas | micropuntas | no | 0011 | 6 | 6 | 4 | 1 | 2 |
| Alcancías | alcancias | no | 0011 | 1 | 1 | 1 | 1 | 2 |
| Lámparas | lamparas | no | 0000 | 0 | 0 | 0 | 1 | 2 |

Hay otras 16 categorías noindex que no reciben aterrizajes (todas con productos vivos). Entre ellas, **`kits-para-regalar-o-regalarse`** ya tiene todos los textos (1111), 13 vivos, 10 con stock y 6 tarjetas, y aun así está en `seoEnabled=false`.

De textos SEO, entre las 93 categorías noindex: 77 tienen `0011` (sin `seoTitle` ni `seoDescription`), 14 tienen `0000` y solo 2 tienen `1111` (`mugs` y `kits-para-regalar-o-regalarse`).

##### 11 ejemplos concretos (slug archivado → destino)

1. `mini-kit-lector` → `/categoria/kits-de-lectura` (noindex, 1 vivo)
2. `stickers-alicia-en-el-pais-de-las-maravillas-amarillo` → `/categoria/juegos-de-sticker-room` (noindex, 1 vivo, 0 con stock)
3. `libro-de-colorear-my-fuzzy-buddies-rosado` → `/categoria/libros-de-colorear` (noindex)
4. `sello-lacre-azul-pastel` → `/categoria/sellos-decorativos` (noindex)
5. `llavero-peluche-stitch` → `/categoria/llaveros` (indexable)
6. `cartuchera-plastica-kuromi` → `/categoria/cartucheras` (indexable)
7. `carpeta-archivadora-pastel` → `/producto/carpeta-archivadora-fashion-pastel-con-5-compartimientos-verde-pastel-moderno` (hermana)
8. `llavero-hermione-naranja` → `/producto/llavero-ron-rojo` (hermana; ojo, es otra variante «personaje», no un equivalente)
9. `lego-don-cangrejo-rojo` → `/producto/lego-calamardo-azul` (hermana, mismo caso que el 8)
10. `carpeta-plastica-oficio-lila` → **200**, sirve `carpeta-plastica-oficio-verde-pastel` por alias (no redirige)
11. `carpeta-van-gogh` → **200**, sirve `carpeta-hermetica-carta-de-van-gogh-verde` por alias (no redirige)

Todas las redirecciones llevan `#producto-no-disponible`.

#### C.3 Opciones

Para empezar, qué significa hoy caer en noindex: una 308 hacia una página `noindex, follow` no se trata como soft 404, porque el destino es pertinente. Pero Google deja de indexar la URL vieja y no hay página indexable que reciba su señal. A efectos de equidad equivale a un 404, aunque la experiencia de usuario es mejor. **El daño real lo tienen las 46 URLs que caen en categorías con 0 productos vivos** (y otras 123 en categorías con 1–2): un listado vacío detrás de una redirección es el patrón típico de soft 404.

##### (a) Activar `seoEnabled` en categorías concretas

Es la **única** opción que gana indexabilidad.

Criterio propuesto:
- al menos 6 productos vivos **con stock** y al menos 6 tarjetas, que es la regla de negocio del propio formulario: «solo con contenido propio y stock estable» (`category-form.tsx:396`);
- al menos 8 aterrizajes canónicos.

**Nivel 1, recomendado (10 categorías, 119 URLs canónicas y 243 con alias).** Todas las filas cambian `seoEnabled false → true`:

| Category.id | slug | Vivos / con stock / tarjetas | Aterr. | Textos |
|---|---|---|---:|:-:|
| a8729e87-34ae-494d-944b-b3a09bab3a42 | lego | 7 / 6 / 6 | 26 | 0011 |
| 546aa796-1fb4-4508-aec2-7455e2fa3189 | planeadores | 20 / 20 / 15 | 16 | 0011 |
| d0e9c269-554e-4b13-a2d9-6144db347fa7 | reglas | 17 / 10 / 8 | 14 | 0011 |
| 9d6376c0-356a-4ea9-bcbb-b7a809ac4be5 | porta-carnets | 12 / 12 / 12 | 13 | 0011 |
| bc7dd508-51c3-4390-ab0d-440ebcf90286 | banderitas-adhesivas | 13 / 7 / 6 | 13 | 0011 |
| d8c8cd8f-bbbe-4288-9eea-9c0158404e34 | portaminas | 16 / 16 / 10 | 12 | 0011 |
| 482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9 | mugs | 15 / 12 / 10 | 9 | **1111** |
| 29e7b364-04d4-4ebc-b84d-69ff5c9d8777 | separadores-de-paginas | 19 / 19 / 11 | 8 | 0011 |
| 6b17c1f5-faa4-4d9e-bf1b-25abd9a714c6 | pines | 10 / 10 / 10 | 8 | 0011 |
| 16408ada-f8b8-4f41-9b88-d983aba64467 | kits-para-regalar-o-regalarse | 13 / 10 / 6 | 0 | **1111** |

`kits-para-regalar-o-regalarse` entra por estar lista, no por sus aterrizajes.

**Nivel 2, con cautela (7 categorías, 124 URLs más).** Tienen 6 o más productos vivos y 8 o más aterrizajes, pero pocas tarjetas, así que el listado queda delgado:
- `kits-kawaii` (9cbd82e6-890c-4435-b653-46a5ec179709): 12 vivos, **2 tarjetas**, 32 aterrizajes;
- `correctores` (0902acd6-3627-458d-898e-f04be20f63f3): 4 tarjetas, 22;
- `bolsos-pequenos` (fec0c257-cb23-4f03-8bb0-c84f7cf911b4): **2 tarjetas**, 20;
- `clips` (1a5804d5-7b72-4945-922a-f3eea3591a62): 4 tarjetas, 14;
- `accesorios-personales` (a6c31801-9507-4119-a5ce-98a8a074136d): 5 con stock y 4 tarjetas, 14;
- `tijeras` (d23d22af-4e65-42b7-86e4-4532bc905691): 4 tarjetas, 13;
- `sobres-plasticos` (3d28e531-9711-4451-97c0-f8e14c9dd5dd): 4 tarjetas, 9.

Cobertura: el nivel 1 cubre 119 de las 618 (19 %), y los niveles 1+2, 243 (39 %). Con la regla más laxa de 6 o más vivos y cualquier número de aterrizajes serían 30 categorías y 294 URLs (48 %). **Las 272 URLs en Kits, Creatividad & Juego, Belleza, Lectura y Carpetas (Kits sola, 154) siguen en noindex con cualquier umbral razonable**: son kits retirados en categorías con 1–3 productos vivos.

Advertencias de la opción (a):
- **Textos obligatorios.** La API solo hace `Boolean(seoEnabled)` (`app/api/[storeId]/categories/[categoryId]/route.ts:178`). El formulario, en cambio, **no deja guardar** con `seoEnabled` si faltan título, descripción o intro (`category-form.tsx:61-72`). Activarlo por SQL en una categoría `0011` deja una página que se ve (la tienda usa el nombre y una descripción genérica, `categoria/[slug]/page.tsx:51-53`), pero queda delgada, y **cualquier edición posterior desde el panel quedará bloqueada** hasta que alguien escriba los textos. La recomendación es que Paula escriba `seoTitle` (≤70) y `seoDescription` (≤170) **antes**, desde el formulario. Lo ideal es activar desde el formulario mismo, que valida y revalida la tienda (`triggerStorefrontRevalidation` en `categories/[categoryId]/route.ts:198`), y no hace falta `prod:write`. Si aun así se hace por guion, el guion debe escribir también esos textos.
- Activarla añade la categoría al sitemap (`sitemap.ts:39`). Si no se marca `seoFeatured`, no cambia la portada.
- Un `prod:write` no pasa por la API, así que no revalida la tienda: hay que llamar `revalidateStore` o esperar el TTL (página de categoría `revalidate = 300` y caché de `getCategories`).

**Esquema del guion `prod:write`, solo descrito; no se creó.**
- Archivo en el borrador, por ejemplo `enable-category-seo-20261006.mjs`.
- Ejecución: `npm run prod:write -- <ruta>` con una aprobación fresca de Christian.

Pasos:
1. Tomar del argumento la lista fija de `Category.id` del nivel aprobado (los 10 de arriba). Nunca un filtro dinámico.
2. Con `storeId = 'f23ee5bc-…'`, leer cada fila y **abortar** si alguna:
   - no existe;
   - está archivada;
   - ya tiene `seoEnabled = true`;
   - tiene `seoTitle`, `seoDescription` o `seoIntro` vacío, salvo que el guion traiga esos textos escritos por Paula.
3. Ensayo por defecto (`--apply` ausente): imprimir `id | slug | seoEnabled false → true`, y los textos si los trae.
4. Con `--apply`, en una transacción: `UPDATE Category SET seoEnabled = 1 [, seoTitle = ?, seoDescription = ?] WHERE id = ? AND storeId = ? AND seoEnabled = 0` por fila. Verificar que afecta exactamente N filas, y si no, revertir.
5. Después: llamar al `POST /api/revalidate` de la tienda o esperar unos 5 minutos, y verificar `curl -s https://papeleriapdepapel.com/categoria/<slug> | grep robots` → `index, follow`. Verificar también el sitemap.
6. Reversión: el mismo guion con `seoEnabled = 0` sobre los mismos ids.

El `ops/prod-writes.log` se versiona con el cambio.

##### (b) Cambiar la cadena de respaldo

- **b1. Saltar la categoría noindex e ir al tipo.** El destino sería `/tienda?typeId=…`, que es **noindex con canónica a `/tienda`** y está **bloqueado por `robots.ts:39` (`Disallow: /tienda?`)**. No gana indexabilidad: Googlebot ni siquiera puede seguir la redirección, y se pierde pertinencia para el usuario (un tipo entero en vez de la subcategoría). **No se recomienda.**
- **b2. Saltar e ir a `/tienda`.** Mandar 618 URLs de producto a la portada de la tienda es el patrón clásico de soft 404 (Google lo considera una redirección a algo no equivalente; el mismo comentario de `archived-product-redirect.ts:8-10` lo advierte). **No se recomienda.**
- **b3. Saltar a una categoría indexable del mismo tipo.** Cubre 346 de las 618 URLs (48 categorías). Las otras 272 están en tipos sin categorías indexables. A cambio, es poco pertinente: `sacapuntas` iría a `borradores`, y `kits-sorpresa` no tendría a dónde ir. Riesgo medio de soft 404 y peor experiencia de usuario. Solo tendría sentido como regla dentro de un tipo con una categoría padre semántica clara, y hoy no la hay.
- **b4, recomendada en combinación con (a). Exigir al menos un producto vivo en el paso «categoría».** Cambiaría `findArchivedProductRedirect`/`chooseArchivedProductRedirect` (`:30-32`) para que, si la categoría tiene 0 productos vivos (o, más estricto, 0 con stock), no se use. Arregla las **46 URLs que hoy aterrizan en un listado vacío** (94 con alias). El siguiente paso es el tipo (`/tienda?typeId=`), que tampoco es indexable y que Googlebot no puede seguir (`Disallow: /tienda?`, igual que en b1), pero al menos muestra productos al usuario. Es un arreglo de experiencia de usuario y de soft 404, no de rastreo. La alternativa equivalente sin tocar código es **archivar esas 12 categorías vacías**: la cadena ya salta a su tipo. Tiene contras:
  - archivar cambia la navegación;
  - hay que revisar que no tengan ofertas ni perfiles de Mercado Libre colgando;
  - en ambos casos el destino sigue sin ser indexable, así que la ganancia es de experiencia de usuario y de riesgo de soft 404, no de índice.
- **b5. Dejar el estado actual para el resto.** Una 308 a una categoría pertinente aunque sea noindex es correcta para el usuario y no daña. Solo se pierde la señal, igual que con un 404.

**Recomendación C:** (a) nivel 1, activado desde el formulario por Paula con textos propios, más b4 para las categorías vacías. Lo demás, sin cambios.

---

## D — P2-8: listados cacheables

Análisis de solo lectura del 2026-10-05. No se editó el repositorio, no se hizo commit ni push y no se tocó Vercel. Solo hubo `npm run build` local en `pdepapel-store` (con `NEXT_PUBLIC_API_URL` público) y GET/HEAD a `https://papeleriapdepapel.com`.

**Resumen.** Las dos rutas son dinámicas por una sola razón: leen `searchParams` en la página y en `generateMetadata`. En Next 14 eso vuelve dinámica toda la ruta, y `export const revalidate = 300` deja de aplicar al HTML. La ISR «de manual» (una gemela estática a la que se llega con un rewrite del middleware) tropieza con dos problemas que comprobé en el código de Next y de nuqs. Primero, `useSearchParams` manda la cuadrícula a renderizarse en el cliente. Segundo, con un rewrite, `usePathname` no coincide entre servidor y cliente. Además, puede salir **más cara** que hoy, por las escrituras ISR que provoca la purga global en cada venta. **Recomiendo la opción E:** cachear la respuesta dinámica en la CDN de Vercel con `Vercel-CDN-Cache-Control` + `Vercel-Cache-Tag` desde `next.config.mjs`, y purgar con `invalidateByTag` en `/api/revalidate`. Toca 3 archivos más pruebas, no cambia el render y se revierte borrando un bloque. Hay que probarla antes en un Preview. La opción B (ISR con gemela) queda especificada completa como alternativa.

---

### 1. Qué vuelve dinámicas las dos rutas

#### 1.1 Lo medido

`next build` (Next 14.2.35, local, 2026-10-05):

```
┌ ○ /                                    9.22 kB         167 kB
├ ƒ /categoria/[slug]                    1.27 kB         300 kB
├ ● /producto/[slug]                     24.5 kB         208 kB
├ ƒ /tienda                              1.68 kB         300 kB
ƒ Middleware                             92.7 kB
```

Producción, dos GET seguidos por URL, con un User-Agent de navegador:

| URL | GET 1 | GET 2 | `cache-control` | `x-matched-path` |
|---|---|---|---|---|
| `/tienda` | MISS, age 0 | MISS, age 0 | `private, no-cache, no-store, max-age=0, must-revalidate` | `/tienda` |
| `/categoria/stickers` | MISS | MISS | igual | `/categoria/[slug]` |
| `/tienda?page=2` | MISS | MISS | igual | `/tienda` |
| `/categoria/stickers?page=2` | MISS | MISS | igual | `/categoria/[slug]` |
| `/producto/portacarnet-doraemon` | REVALIDATED, age 326 | **HIT**, age 20 | `public, max-age=0, must-revalidate` | `/producto/[slug]` |
| `/` | **HIT**, age 53 | **HIT**, age 55 | `public, max-age=0, must-revalidate` | `/` |

Otros datos:

- **Encabezados.** Las dos rutas responden con `vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch`, sin `set-cookie`. La región de funciones es `iad1`.
- **Tiempos** (una muestra desde Colombia):

  | URL | TTFB | Total | HTML |
  |---|---|---|---|
  | `/tienda` | 2,4 s | 6,9 s | 598 KB |
  | `/categoria/stickers` | 2,1 s | 8,2 s | 473 KB |
  | `/` (HIT) | 0,7 s | — | 512 KB |

- **Bots.** Con UA de Googlebot, `/` dio HIT y HIT, y la ficha REVALIDATED y luego HIT. En rutas ISR la CDN no se salta la caché por UA de rastreador. (El UA es falso, así que esto no prueba qué pasa con un Googlebot verificado por IP.)

#### 1.2 La causa, con referencias

1. **`searchParams` en la página y en los metadatos**, en las dos rutas:
   - `app/(routes)/tienda/page.tsx`:
     - `:32-33`: `generateMetadata({ searchParams })` desestructura `typeId, categoryId, search, minPrice, maxPrice`.
     - `:191`, `:203`, `:106-133`: la página pasa `searchParams` a `ShopContentWrapper`, que lo lee entero para `getProducts`.
   - `app/(routes)/categoria/[slug]/page.tsx`:
     - `:46` y `:55`: `generateMetadata({ params, searchParams })` llama a `getListingIndexing(…, searchParams, …)`.
     - `:75`, `:83`, `:86-102`: la página lee `searchParams` para `hasFilters` y `getProducts`.

   En Next 14 leer cualquier propiedad de `searchParams`, en `page` **o** en `generateMetadata`, vuelve dinámica la ruta entera. `export const revalidate = 300` (`tienda/page.tsx:26`, `categoria/[slug]/page.tsx:42`) ya no gobierna el HTML, solo la caché de datos de los `fetch`. Por eso Next responde `private, no-cache, no-store` y Vercel marca MISS siempre.

2. **Nada más en el árbol fuerza lo dinámico.** Lo verifiqué:
   - **Layouts.** `app/layout.tsx:115-190` y `app/(routes)/layout.tsx` no llaman a `cookies()`, `headers()` ni `auth()`. `ClerkProvider` de Clerk v6 es estático por defecto, y la prueba es que `/` (○) y `/producto/[slug]` (●) comparten ese layout y salen HIT. `NuqsAdapter` (`providers/query-client-provider.tsx:17`) tampoco lo impide.
   - **Middleware.** `middleware.ts:83-85`: `/tienda` y `/categoria/*` no están en `requiresServerAuth` (`:32-47`), así que salen por `NextResponse.next()` sin pasar por Clerk.
   - **APIs dinámicas.** `grep` de `next/headers`, `@clerk/nextjs/server`, `unstable_noStore`, `force-dynamic` y `no-store` no da ningún resultado en el árbol de los listados. Las únicas apariciones están en otras rutas: pedido, checkout, login, proximamente, `api/*` y `check-live-stock`.
   - **Fetch.** Todos los fetch del listado llevan `next.revalidate`:
     - `lib/catalog-cache.ts:1-7` (300 s, etiqueta `products`), usado por `lib/catalog-fetch.ts:26`.
     - `actions/get-categories.ts:6-8` y `get-category.ts:7-9` (300 s, `catalog`).
     - `get-types`, `get-colors`, `get-designs` (300 s, `catalog`).
     - `get-catalog-options` (`catalog`, `catalog-options`).
     - `get-storefront-settings` (`storefront-settings`).

     Ninguno es `no-store`.

3. **Lo que se ve de inmediato si se quita `searchParams` del servidor** (importa para el diseño). La parte cliente también lee la URL:
   - `ShopContent` → `useProductFilters` (`hooks/use-product-filters.ts:43`) → `useQueryStates` de nuqs. El adaptador `nuqs/adapters/next/app` llama a `useSearchParams()` (`node_modules/nuqs/dist/impl.app-42AlylyJ.js:45`).
   - `Paginator` (`app/(routes)/tienda/components/paginator.tsx:3,21-22`) y `SaveSearchButton` (`components/shop/save-search-button.tsx:7,30`) llaman a `useSearchParams()` directamente.
   - En un render estático, `useSearchParams` hace que todo el subárbol hasta el `<Suspense>` más cercano se renderice **en el cliente**. El HTML guardado tendría solo el esqueleto.
   - `/tienda` ya envuelve el contenido en `<Suspense>` (`tienda/page.tsx:195-204`), así que «funcionaría», pero guardaría el esqueleto en caché. Eso es justo la regresión de SEO y LCP que el trabajo de P1-5 y LCP evitó.
   - `/categoria/[slug]` no tiene `<Suspense>`, y `next.config.mjs` no desactiva `missingSuspenseWithCSRBailout`.
     - Si se prerenderiza en el build, el build falla con «useSearchParams() should be wrapped in a suspense boundary».
     - Con `generateStaticParams() { return [] }` no se prerenderiza nada, así que `next build` pasa limpio. El fallo aparece en el **primer render bajo demanda**: un 500 o una página renderizada en el cliente; no afirmo cuál.
     - Por eso un build limpio **no** prueba que la gemela sea segura (ver 5.2, paso 3).

---

### 2. Diseño

#### 2.1 Requisitos que dejan fuera opciones

- **SEO ya publicado.** Los commits `ad4b3247` (canónica propia de `?page=N`) y `a21be221` (paginador como enlaces rastreables) dependen de que el servidor lea `searchParams` en las URL con query (`lib/listing-seo.ts:33-42`). Cualquier diseño en el que `?page=2` o `?typeId=…` dejen de llegar a una ruta que lea `searchParams` rompe esos metadatos.
- **Query en la caché.** En Vercel las páginas estáticas de App Router ignoran la query en la clave de caché. Un `force-static` serviría el HTML de la página 1 para `?page=2`.
- **Hoy los filtros ya son solo del cliente.** `useProductFilters` usa `shallow: true` (`use-product-filters.ts:44`), y `ShopContent` vuelve a pedir el catálogo por `/api/catalog` (`components/shop-content.tsx:83-92`). El render en servidor solo importa en la **primera carga** de una URL: enlace compartido, rastreador o recarga.

#### 2.2 Opciones consideradas

| # | Opción | Veredicto |
|---|---|---|
| A | `export const dynamic = "force-static"` en las dos páginas (los filtros pasan a ser solo del cliente) | **Descartada.** `?page=N` y los filtros reciben el HTML y los metadatos de la página 1, con canónica e `index` incorrectos y la cuadrícula equivocada en la primera pintura. Rompe `ad4b3247` y `a21be221` |
| B | ISR con gemela: rewrite del middleware según haya o no query hacia dos segmentos (uno estático y otro dinámico), con `generateStaticParams() { return [] }` en la categoría | **Viable con riesgos fuertes** (2.4). Es la que pide el ticket como «ISR». Queda especificada como alternativa |
| C | `generateStaticParams` con los 14 slugs del sitemap | No sirve sola: mientras la página lea `searchParams` la ruta sigue siendo ƒ. Además añade llamadas al admin y CPU en cada build, que fue el mayor costo del ciclo |
| D | PPR o Cache Components | Es de Next 15/16. En Next 14.2 estable no existe. Es el camino de largo plazo con `next-upgrade` |
| **E** | **CDN de Vercel sobre la respuesta dinámica** con `Vercel-CDN-Cache-Control` + `Vercel-Cache-Tag` (desde `next.config.mjs` `headers()`) y purga por etiqueta con `invalidateByTag` (`@vercel/functions`) en `/api/revalidate` | **Recomendada**, si pasa la prueba en Preview (5.1) |

#### 2.3 Recomendación: opción E

Por qué gana con el menor radio de impacto:

- **El render no cambia.** El HTML, los metadatos, la canónica, el JSON-LD, nuqs y `usePathname` quedan idénticos. No hay rewrite, así que no aparece el desajuste de pathname (2.4, riesgo 2) ni el render en el cliente por `useSearchParams` (1.2.3).
- **El piso de costo es el de hoy.** Un MISS en la CDN es un render dinámico, lo mismo que se paga hoy en **cada** visita. Las lecturas y escrituras de la CDN son gratis. La ISR cobra cada escritura en unidades de 8 KB (sección 4).
- **Cubre también las vistas filtradas y paginadas.** La clave de la CDN incluye la query, y `Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch` separa el HTML del payload RSC. Las combinaciones de `?search=` son ilimitadas, pero no cuestan nada.
- **Se revierte borrando un bloque** de `next.config.mjs`.

**Archivos que cambian (exactamente):**

1. **`pdepapel-store/next.config.mjs`**, dentro de `headers()` (hoy en `:39-52`), dos entradas nuevas:
   ```js
   {
     source: "/tienda",
     headers: [
       { key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=300" },
       { key: "Vercel-Cache-Tag", value: "listados" },
     ],
   },
   { source: "/categoria/:slug", headers: [ /* los mismos dos */ ] },
   ```
   - `s-maxage=300` mantiene la paridad con la caché de datos de 5 min (`AGENTS.md:144` pide no acortarla, y el punto 8 del diagnóstico pide no alargarla todavía). Se sube solo cuando la purga por etiqueta esté probada.
   - `source` sin `has`/`missing` aplica con o sin query.
   - `Vercel-CDN-Cache-Control` solo lo lee la CDN de Vercel, y Next no lo reescribe como hace con `Cache-Control`. **Que Vercel lo respete aunque `Cache-Control` diga `private, no-store` es justamente la premisa sin verificar** (5.1, paso 1).
2. **`pdepapel-store/app/api/revalidate/route.ts`.** Después del bucle de `revalidateTag` (`:72-74`), llamar a `invalidateByTag(["listados"])` de `@vercel/functions`:
   - Con `try/catch` y un tope de tiempo de 1 s: el admin corta a los 3 s (`pdepapel-admin/lib/revalidate-store.ts:6`).
   - Devolver en el JSON `cdnInvalidated: true|false`, para que el registro de trabajos del admin lo muestre.
   - Fuera de Vercel (local o pruebas) la llamada no debe romper la ruta.
3. **`pdepapel-store/package.json` + `package-lock.json`.** Añadir `@vercel/functions`, que hoy no está: `node_modules/@vercel/` solo tiene `analytics`.
4. **Pruebas:**
   - `tests/unit/app/revalidate-route.test.ts`: amplíala. `invalidateByTag` simulado se llama con `listados` además de `revalidateTag`, y si falla o se cuelga, la ruta igual responde 200 con `cdnInvalidated: false`.
   - Una prueba nueva, por ejemplo `tests/unit/next-config-cdn-cache.test.ts`, que importe la config y fije:
     - las dos fuentes y los valores;
     - que **ninguna otra ruta** reciba `Vercel-CDN-Cache-Control`, sobre todo `/pedido`, `/finalizar-compra`, `/mi-cuenta` y `/api/*`.
5. **Documentación, en el mismo commit:** la sección «Cache and revalidation» de `pdepapel-store/AGENTS.md` y `docs/revalidacion-catalogo.md` (la nueva capa CDN, la etiqueta `listados` y cómo purgar a mano).

**Indicio a favor de E, sin verificar.** Producción responde `MISS`, no `BYPASS`, en los listados dinámicos. Eso sugiere que Vercel los trata como cacheables en principio y que solo los frena la directiva `private, no-store`. Sigue siendo una premisa por probar.

**Lo que E NO cambia:** las marcas de `next build` siguen en ƒ para las dos rutas. Eso es lo esperado: la caché vive en la CDN, no en ISR.

**Riesgo propio de E: errores transitorios cacheados.** Si la API del admin cae:

- `fetchCatalogProducts` devuelve `UNAVAILABLE_RESPONSE` (`lib/catalog-fetch.ts:27-30`, `lib/catalog-params.ts:39-42`), y la página responde **200** con la cuadrícula «no disponible».
- La CDN guardaría ese 200 hasta 300 s.
- Mitigación: un `s-maxage` corto y una purga manual de `listados` cuando se recupere el servicio.

La ISR (B) tendría exactamente el mismo problema.

#### 2.4 Alternativa B (ISR con gemela), especificada completa

**Forma preferida:** las URL limpias **no** se reescriben. El HTML que ve Google y que se cachea sale de la ruta real, con el pathname correcto.

1. `app/(routes)/tienda/page.tsx` y `app/(routes)/categoria/[slug]/page.tsx` se vuelven estáticas:
   - sin `searchParams` en las props ni en `generateMetadata`;
   - `revalidate` largo (3600 s o más, ver sección 4);
   - en la categoría, `generateStaticParams() { return [] }`, con el mismo precedente y la misma explicación que `producto/[slug]/page.tsx:61-73`. Sin esa función Next 14 renderiza `no-store` aunque haya `revalidate`.
2. Gemelas dinámicas ocultas: `app/(routes)/vista-filtrada/tienda/page.tsx` y `app/(routes)/vista-filtrada/categoria/[slug]/page.tsx`. Son el código de hoy, que lee `searchParams`.
3. Un componente de servidor compartido por listado, por ejemplo `components/listing/shop-listing.tsx` y `category-listing.tsx`, más el constructor de metadatos. Reciben un objeto `filters` explícito: vacío en la estática, `searchParams` en la dinámica.
4. `middleware.ts`:
   - Si `pathname` es `/tienda` o `/categoria/<slug>` y la query trae **cualquier** parámetro (sin contar `_rsc`), `NextResponse.rewrite` a `/vista-filtrada…`.
   - Un acceso directo a `/vista-filtrada/*` recibe 308 a la ruta pública. El middleware no vuelve a correr sobre un rewrite, así que esto no crea un bucle.
   - Fase 1: **todo** parámetro va a la dinámica, incluidos `utm_*`, `fbclid`, `gclid` y `srsltid`, para que el SEO quede byte a byte igual. Hoy `getListingIndexing` los marca `noindex` (`listing-seo.ts:38-41`). Una lista de parámetros de rastreo permitidos sería un cambio aparte y deliberado.
5. En la variante estática, cambiar el adaptador de nuqs por `nuqs/adapters/react` **anidado** solo alrededor del listado. Lee `location.search` en el cliente y nunca llama a `useSearchParams` (`node_modules/nuqs/dist/adapters/react.js`). Es un **spike**, no algo conocido: hay dos proveedores anidados y `patchHistory` de nuqs junto al parche de historial de Next.
6. `Paginator` y `SaveSearchButton` dejan de llamar a `useSearchParams`/`usePathname` y reciben `basePath` y los filtros por props o desde nuqs.
7. `app/api/revalidate/route.ts`: el `revalidatePath(STOREFRONT_ROUTES.shop)` actual (`:62-70`) sigue valiendo para la estática. Las etiquetas `products` y `catalog` (`:72`) cubren las categorías.
8. Pruebas, como en la sección 5.2.

**Riesgos de B, comprobados en el código:**

1. **`useSearchParams` → render en el cliente**, como en 1.2.3. Lo resuelve el punto 5; sin él, la caché guarda esqueletos.
2. **El pathname no coincide en la ruta reescrita.** El render en servidor toma `urlPathname` de `req.url`, que ya es la ruta reescrita (`node_modules/next/dist/server/app-render/app-render.js:1013-1021`). El cliente lo toma de `location.href` (`next/dist/client/components/router-reducer/create-initial-router-state.js:36`).
   - 13 archivos usan `usePathname`, entre ellos componentes del layout: `navbar`, `mega-menu`, `category-drawer`, `mobile-cart-bar`, `cart-reminder-strip`, `navigation-link` y `customer-analytics-provider`.
   - Ningún prop de página arregla eso sin poner `headers()` en el layout, y eso volvería dinámico todo el sitio.
   - En la forma preferida el problema cae en las URL **con query**, incluida `?page=N`, que Google rastrea con canónica propia. Hay que medirlo (advertencias de hidratación, `href` del paginador) antes de aceptarlo.
   - Con la forma inversa (reescribir la URL limpia hacia una gemela estática) caería sobre el HTML que más se sirve y que lee Google. Por eso la descarto.
3. **Economía:** sección 4. Con `revalidateTag("products")` en cada venta, una categoría con poco tráfico se regenera casi en cada visita, y eso sale **más caro** que hoy. B solo cierra si los listados llevan una etiqueta `listados` separada de `products`, que el admin purgue solo en cambios de catálogo, precio u oferta y no en cada venta. Eso amplía el cambio a las llamadas del admin y a `revalidate/route.ts:72`, que hoy añade `products` y `catalog` a **toda** llamada.

**Marcas esperadas en B:** **○** para `/tienda` (no tiene segmento dinámico, así que Next 14 la imprime como `/`, con su nota de ISR) y **●** para `/categoria/[slug]`. Un ○ en `/tienda` no es un fallo. Las gemelas `/vista-filtrada/*` quedan en ƒ.

---

### 3. Riesgos: frescura de precio, stock y ofertas

#### 3.1 La frescura de hoy

Aunque la página «dinámica» se renderiza en cada visita, sus datos ya pueden tener unos 5 a 10 minutos:

- **Caché de datos de la tienda:** 300 s (`lib/catalog-cache.ts:1`, `actions/get-categories.ts:7`, etc.).
- **Redis del admin:** 300 s para las consultas `fromShop` (`pdepapel-admin/app/api/[storeId]/products/route.ts:1285` y `:1618`).
- **Purga.** `invalidateStoreProductsCache` (`pdepapel-admin/lib/cache.ts:123-140`) dispara **a la vez** la revalidación de la tienda y la purga de Redis.
  - Si la tienda vuelve a pedir datos antes de que termine la purga de Redis, guarda datos viejos otros 300 s.
  - Esa carrera existe ya hoy, también para `/producto`.
- **Quién purga.** El admin llama a `invalidateStoreProductsCache` después de:
  - un checkout cubierto del todo (`checkout/route.ts:1019`);
  - los webhooks de Bold (`:452`, `:587`) y Wompi (`:597`);
  - ediciones del pedido (`orders/[orderId]/route.ts:1075`, `:1289`);
  - el punto de venta (`point-of-sale/sales/route.ts:44`);
  - Mercado Libre, solo si cambió el inventario (`lib/mercadolibre/webhook-processor.ts:124-126`);
  - y en total unas 50 rutas de catálogo.

  Las ofertas purgan desde el cron diario `update-offers` (`invalidateStorePromotionsCache`, `cache.ts:150-172`).
- **Desde el incidente del 2026-09-29**, toda la invalidación corre **después del commit** y con tope:
  - 3,5 s de presupuesto (`cache.ts:16-26`, `:131-139`);
  - 3 s de timeout y un reintento solo ante 5xx o fallos de red (`revalidate-store.ts:6-7`, `:36-41`, `:121-132`).

  Marcar pagado ya no espera a la tienda.

#### 3.2 Ventana de desactualización con E

| Caso | Lo que ve el cliente en el listado sin filtros |
|---|---|
| Revalidación correcta (`revalidateTag` + `invalidateByTag`) | El primer visitante después de la purga recibe una vez la copia vieja (`STALE`, SWR) y dispara la regeneración. Los siguientes ven datos frescos, salvo la carrera con Redis de 3.1, que añade hasta 300 s |
| Funciona `revalidateTag` pero falla `invalidateByTag` | Los datos ya son frescos, pero la CDN sirve el HTML viejo hasta `s-maxage` (300 s), más una visita servida desde SWR |
| Falla toda la revalidación (firewall, secreto, timeout) | En el peor caso, unos 300 (Redis) + 300 (fetch) + 300 (CDN) ≈ **15 min**, más una visita SWR. El admin envía el correo de alerta y deja `storefront-revalidation` en `ok: false` (`revalidate-store.ts:150-165`) |
| Oferta que vence por fecha | Igual que hoy: depende del cron diario más la tabla anterior |

#### 3.3 Firewall

Si `pdepapel-store` tiene Bot Protection en «Challenge» o Attack Challenge Mode, `/api/revalidate` responde `429` con `x-vercel-mitigated: challenge` y la ruta no llega a correr. No se ejecuta ni `revalidateTag` ni `invalidateByTag`. Así falló el 2026-09-11 (`docs/revalidacion-catalogo.md:23-33`).

- El admin ya distingue ese caso en la alerta (`revalidate-store.ts:14-20`).
- **Antes de E o B** hay que confirmar en el panel que la regla Bypass para `/api/revalidate` sigue activa. Es una lectura que hace Christian; no la hice.

#### 3.4 Lo que protege la compra pase lo que pase

- **Stock.** Un listado desactualizado muestra un precio o una insignia de stock viejos, pero no vende stock inexistente:
  - el stock se vuelve a comprobar sin caché justo antes de enviar (`actions/check-live-stock.ts:41-43`, `no-store`);
  - un 422 muestra el bloque de agotado en línea;
  - `/api/catalog` y `/api/producto` son `no-store`.
- **Precio.** El precio que se cobra lo calcula el admin al crear el pedido (`getEffectiveShippingCost` y los totales en `checkout/route.ts`). Conviene confirmarlo en la revisión del cambio.

---

### 4. Ahorro esperado (estimación, no medición)

#### 4.1 Tarifas del ciclo

Tarifas implícitas, sacadas de `docs/ops/2026-10-05-vercel-spend-diagnosis.md`:

| SKU | Consumo del ciclo | Tarifa |
|---|---|---|
| Fluid Active CPU | 18 h por $2,42 | $0,134 por hora de CPU |
| Provisioned Memory | 282,2 GB·h por $3,00 | $0,0106 por GB·h |
| Invocaciones | 1,36 M por $0,81 | $0,60 por millón |
| ISR Writes | 130 K unidades por $0,52 | **$4,0 por millón de unidades de 8 KB** |
| ISR Reads | 394 K por $0,16 | $0,41 por millón |

#### 4.2 Gasto de la tienda que P2-8 puede reducir

Fluid CPU $1,44 + memoria $1,36 + invocaciones $0,44 + Fast Origin Transfer $0,72 ≈ **$4,0 por ciclo**. Esto es antes del bloqueo de `meta-externalagent` y `PetalBot` del 2026-10-05, que ya reducirá esa base.

- La API del admin casi no cambia: los fetch del render dinámico ya salen de la caché de datos de 300 s.
- El diagnóstico **no trae el reparto por ruta**. Observability Plus está apagado, así que `vercel metrics` probablemente no esté disponible; hay que usar Usage u Observability básico por ruta.

#### 4.3 Supuestos

Están marcados como supuestos porque no hay datos:

- **Listados (todas las variantes): 20–40 %** del costo de funciones de la tienda. Son renders pesados (473–598 KB y de 2 a 8 s con streaming).
- **Visitas a la URL limpia: 30–60 %** de los listados. La navegación principal manda a `?typeId=…` e `?isOnSale=true` (`lib/routes.ts:85-89`), y esas URL tienen query.

#### 4.4 Estimación con E

$4,0 × (20–40 %) × tasa de HIT combinada (40–70 %; alta en la URL limpia, baja en filtros) ≈ **$0,3–1,1 por ciclo**, sin costo nuevo.

#### 4.5 Estimación con B

- **Ahorro bruto:** $4,0 × (20–40 %) × (30–60 %) × HIT (50–85 %) ≈ **$0,1–0,8 por ciclo**.
- **Escrituras ISR nuevas.** Cada regeneración guarda el HTML y el RSC:
  - unas 75–150 unidades si se cuenta sin comprimir;
  - unas 15–20 si Vercel cuenta comprimido. El total actual de 130 K unidades para 888 fichas sugiere que podría ser así.
- **Cuántas regeneraciones:** por página y día ≈ mín(visitas, ventanas de `revalidate` + purgas). Con un `revalidate` de 3600 s y unas 10–20 purgas al día por ventas, quedan unas 30–45 regeneraciones diarias en las páginas con tráfico.
- **Cota superior:** 15 páginas × unas 35 al día × 30 días ≈ 16 K regeneraciones ≈ **$1–9,5 por ciclo**.
- **Neto de B: entre −$9 y +$0,7 por ciclo.** Sin la etiqueta `listados` separada, lo más probable es que salga más caro que hoy. Con `revalidate = 300` sería peor.

#### 4.6 Lo que vale más que los dólares

El TTFB de un HIT baja de ~2,1–2,4 s a lo de `/` (~0,7 s desde Colombia), lo que ayuda al LCP móvil y al presupuesto de rastreo de Google en las URL que el sitemap sí lista: `/tienda` y 14 categorías.

#### 4.7 Cómo cerrar la estimación

Antes de decidir, mirar en Observability (básico) o en Usage:

- las invocaciones y la duración de `/tienda` y `/categoria/[slug]` en 7 días;
- qué parte de esas peticiones trae query string;
- después del cambio, comparar día contra día Function Invocations, Fluid CPU e ISR Writes del proyecto.

---

### 5. Plan de pruebas

Nada de esto se ejecutó.

#### 5.1 Opción E

Un Preview requiere push a una rama o `vercel deploy`, y los dos pasos necesitan la aprobación de Christian. Si el Preview tiene Deployment Protection, usar `vercel curl`.

1. **Premisa.** `curl -sI` dos veces a `/tienda` y a `/categoria/<slug>`:
   - el segundo GET debe dar `x-vercel-cache: HIT` aunque `cache-control` siga diciendo `private, no-cache, no-store`;
   - `x-matched-path` no cambia;
   - el navegador no debe recibir `Vercel-CDN-Cache-Control`.

   **Si da MISS, E se descarta** y se pasa a decidir B.
2. **HTML y RSC no se mezclan.** Es el único fallo catastrófico posible. Hay que probar los dos órdenes:
   - en `/tienda`: GET HTML, luego GET con `RSC: 1` y `?_rsc=x`, luego GET HTML. El primero y el último deben ser HTML (`content-type: text/html`), y el del medio `text/x-component`;
   - en `/categoria/<slug>`, el orden inverso.

   Además, navegar en el cliente desde `/` a `/tienda` y de una categoría a otra, sin errores en la consola.
3. **Purga por etiqueta.**
   - Calentar la caché (HIT).
   - Disparar `/api/revalidate` desde el admin del Preview guardando el producto desechable.
   - Observar el estado del primer GET (STALE o MISS/REVALIDATED; no lo predigo) y esperar **HIT con el dato nuevo** en el segundo.
   - Si `Vercel-Cache-Tag` puesto desde `headers()` no se registra, E queda solo por tiempo (300 s) y hay que decirlo así.
4. **Bots.** UA de Googlebot sobre `/tienda`: no debe dar `BYPASS`.
5. **No hay fugas.** `/pedido/<id>`, `/finalizar-compra`, `/mi-cuenta` y `/api/catalog` siguen sin encabezados de CDN y sin HIT.
6. **Unitarias:** `npx vitest run tests/unit/app/revalidate-route.test.ts tests/unit/next-config-cdn-cache.test.ts`, más `npm run test:coverage` y `npm run type-check`.
7. **`next build`:** las marcas no cambian (ƒ, ƒ, ●).

#### 5.2 Opción B, si se elige

1. **Unitarias:**
   - `tests/unit/middleware.test.ts`:
     - la URL limpia no se reescribe;
     - cualquier parámetro (incluidos `utm_source` y `page=1`) se reescribe a `/vista-filtrada…`;
     - `_rsc` no cuenta;
     - un acceso directo a `/vista-filtrada/*` recibe 308.
   - Una prueba como `producto-page-cache.test.ts` para las dos páginas estáticas: sin `next/headers`, sin `searchParams`, con `revalidate` y con `generateStaticParams` en la categoría.
   - Barrera de paridad SEO: `tests/unit/app/listing-canonical.test.ts` y `canonical-per-template.test.ts` sin cambios en lo esperado.
2. **`next build`:** **○** `/tienda`, **●** `/categoria/[slug]`, **ƒ** `/vista-filtrada/*`. Que el build pase no basta: con `generateStaticParams() { return [] }` la categoría no se renderiza en el build, y el filtro real es el paso 3.
3. **Local, `next build && next start`:**
   - el HTML de `/tienda` y de una categoría contiene los enlaces `/producto/…` de la cuadrícula, no el esqueleto (con `curl | grep -c '/producto/'`);
   - `?page=2` trae la canónica `?page=2` y los `href` del paginador sin `/vista-filtrada`;
   - la consola no muestra advertencias de hidratación en los dos casos;
   - revisar a 390, 768, 820, 1280 y 1440 px.
4. **Producción, después del despliegue aprobado:**
   - dos GET seguidos: el segundo es HIT en `/tienda` y en `/categoria/<slug>`;
   - `?page=2` sigue en MISS (`x-matched-path: /vista-filtrada/...`) y con la misma canónica que hoy;
   - `public-health.yml` en verde.
5. **Revalidación** con el mismo procedimiento del paso 3 de 5.1.

#### 5.3 Revalidación tras un cambio de precio en el admin

Descrita, no ejecutada. Respeta `feedback-no-production-sql-past-guards`.

1. Usar un producto **desechable o archivado** en local o Preview. Si tiene que ser en producción, sea un producto de prueba que se archive al final, y con la aprobación de Christian. Sin SQL directo.
2. Anotar el precio que muestra la tarjeta en `/categoria/<su-categoría>` y en `/tienda`, con el estado HIT confirmado.
3. Cambiar el precio en el panel y guardar. En el registro del admin debe aparecer `storefront-revalidation ok: true`, y la respuesta debe traer `cdnInvalidated: true` (E).
4. Hacer GET 1 (anotar el estado) y GET 2: HIT con el precio nuevo. Repetir con un cambio de stock a 0 (insignia) y con una oferta creada y luego terminada.
5. Restaurar el precio o archivar el producto, y comprobar que la purga vuelve a funcionar.

#### 5.4 Reversión

- **E:** revertir el commit, es decir, borrar el bloque de `headers()` y la llamada a `invalidateByTag`. En el siguiente despliegue las respuestas nuevas ya no llevan el encabezado. Que las entradas viejas de la CDN no sobrevivan al despliegue es algo que hay que confirmar en el Preview, no está verificado. Si hiciera falta antes, purgar `listados` a mano desde Vercel (Cache › Invalidate by tag) con aprobación.
- **B:** revertir el commit. Las rutas vuelven a ƒ en el siguiente despliegue y las entradas ISR quedan sin uso. Las gemelas `/vista-filtrada/*` desaparecen con el commit.
- **En los dos casos:** un solo push, aprobado, agrupado con el resto del bloque de trabajo (regla «Deployment budget»).

---

### 6. Fuera de alcance, para después

- **`?typeId=…` y `?isOnSale=true`.** `typePath` y `offersPath` (`lib/routes.ts:85-89`) mandan la navegación principal a URL con query. Con B seguirían dinámicas; con E se cachean por URL. Si los tipos deben indexarse con caché ISR propia, el siguiente candidato es una ruta `/tienda/tipo/[slug]`, con su plan de SEO.
- **El tamaño del HTML.** Pesa 473–598 KB por listado, que se paga en Fast Origin Transfer y, con B, en escrituras ISR. El RSC en línea y el menú del layout pesan bastante. Es una línea de trabajo aparte.
- **Una etiqueta más fina que `products` en `/api/revalidate:72`.** Hoy cada venta invalida las 888 fichas, el inicio y los listados. Hace falta para B y le ayuda también a `/producto`.

---

## E — P2-9: CLS

Solo lectura, 2026-10-05. Nada se cambió.

### E.1 Qué dice el campo (Clarity, últimos 3 días, 42 sesiones)

Clarity › Dashboard › URL performance, ordenado por CLS (la muestra es pequeña: una o dos sesiones mueven estas cifras):

| URL | CLS | LCP | INP |
|---|---:|---:|---:|
| `/tienda` | **1,7** | 3,2 s | 170 ms |
| `/` | **0,63** | 1,7 s | 220 ms |
| `/categoria/libretas` | 0,37 | 6,3 s | 330 ms |
| `/categoria/stickers` | 0,34 | 6,3 s | 330 ms |
| `/producto/stickers-mini-block-de-hello-kitty` | 0,33 | 6,3 s | 330 ms |
| `/categoria/argollados` | 0,31 | 6,3 s | 330 ms |
| `/producto/cuaderno-bts-argollado-rayado-grande-de-60hojas` | 0,30 | 6,3 s | 330 ms |
| `/producto/llavero-de-agua-kawaii` | 0,068 | 6,3 s | 330 ms |

El CLS general del panel de Clarity es 0,31. Los navegadores: MobileSafari 36 %, Chrome 24 %, Chrome móvil 24 %, navegador de Instagram 7 %.

### E.2 Qué se reproduce en el laboratorio

> **Corrección (seguimiento, 2026-10-05):** en la fila del inicio, el carril de categorías no crecía. El navegador recorta el rectángulo al área visible: la sección estaba en y=684 de una pantalla de 800 px, así que 116 px visibles pasaron a 144 al subir 28 px. Lo que se movía era el hero, que se **encogía** 28 px cuando la lista de las tres promesas pasaba de dos líneas a una al llegar Quicksand (`preload: false`), solo desde 1280 px. El arreglo fue en el hero (`xl:h-5`), no en el carril.

Playwright contra producción (solo GET), CPU 4×, red de 1,6 Mbit/s y 150 ms, iPhone 13 y escritorio 1366 px, con un `PerformanceObserver` de `layout-shift` y sus `sources`. Guiones en el borrador: `cls-probe.mjs`, `cls-probe2.mjs` (3 repeticiones), `cls-probe3.mjs` (desplazamiento largo) y `fav-aside.mjs`.

| Plantilla | CLS de laboratorio | Repetible | Elemento que se mueve | Causa |
|---|---:|---|---|---|
| `/favoritos`, móvil, sin sesión | **0,157** | 3 de 3 | El bloque «Todavía no tienes favoritos» baja de y=290 a y=492 | A los 2,1 s se pinta el bloque vacío; a los 4,5 s carga Clerk y aparece **encima** el recuadro de `<SignedOut>` «Guarda tus favoritos en tu cuenta» (170 px). `app/(routes)/favoritos/components/wishlist.tsx:178` |
| `/carrito`, escritorio | **0,078** | 3 de 3 | El pie de página (`footer`) salta de y=666 a fuera de la pantalla | `CartSkeleton` es más bajo que el carrito real: `if (!isMounted) return <CartSkeleton />` (`app/(routes)/carrito/components/cart.tsx:139`). Es el defecto ya conocido (memoria «Cart CLS follow-up») |
| `/`, escritorio | **0,118** | 1 de 3 | La foto del hero sube 14 px y la sección `category-rail` crece de 116 a 144 px | El carril de categorías cambia de alto cuando cargan sus burbujas o etiquetas (`components/home/category-rail.tsx`); depende del orden de llegada de las imágenes |
| `/tienda`, móvil, desplazando | 0,049 | 1 de 1 | El pie baja 48 px mientras se desplaza | Algo encima del pie cambia de alto al final del listado (posible botón «Cargar más» o paginador al hidratar); sin confirmar |
| Todas, móvil, al desplazar | 0,011 cada vez | siempre | `nav.bg-blue-baby` se mueve 32 px | Pasados 80 px de desplazamiento, la franja de anuncios recibe `max-lg:hidden` (`components/navbar.tsx:55,61`) y saca 32 px del flujo. Cada vez cuenta como desplazamiento sin interacción, porque desplazarse no es «input» para el CLS |
| Listados, escritorio | 0,004–0,010 | siempre | La rejilla de filtros (`aside` + chips) cambia de alto | Chips o resumen de filtros que se pintan después de hidratar |

En Chrome (pestaña nueva, sin limitar CPU y **con la sesión abierta**) `/favoritos` y `/carrito` dieron 0: sin limitar CPU el esqueleto dura muy poco, y con sesión el recuadro de `<SignedOut>` no aparece. Confirma la causa del primero: solo afecta a visitantes sin sesión.

**Lo que no se reprodujo:** el 1,7 de `/tienda` ni el 0,63 del inicio. Con 42 sesiones, una sola sesión con muchos desplazamientos (la franja superior suma 0,011 cada vez que se oculta y vuelve) o en el navegador de Instagram puede explicarlo, pero no está probado.

### E.3 Pasos para reproducir

1. `cd pdepapel-store && node <borrador>/cls-probe2.mjs` (Playwright local contra producción, solo GET). Lista el CLS por plantilla y los elementos que se mueven.
2. En Chrome, en una ventana **privada** (sin sesión): DevTools › Performance › CPU 4× slowdown, red «Fast 4G» › Record and reload en `/favoritos`. En el carril «Layout shifts» aparece el desplazamiento al terminar de cargar Clerk, y el bloque vacío está entre las fuentes.
3. Mismo método en `/carrito` con un producto en el carrito: el desplazamiento cae en el `footer` cuando el esqueleto se cambia por el carrito real.

### E.4 Arreglos propuestos (no se implementó nada; cambian diseño o código y necesitan aprobación)

1. **`/favoritos`:** mover el recuadro de `<SignedOut>` **debajo** del contenido (lista o bloque vacío), o reservarle el alto con `<ClerkLoading>` de 170 px. La primera opción no mueve nada arriba de la pantalla para nadie; la segunda haría que los usuarios con sesión vean un hueco que se cierra (otro desplazamiento). Recomiendo la primera. Es un cambio de diseño: necesita el visto bueno de Christian.
2. **`/carrito`:** el mismo patrón que se usó en el checkout (memoria «Checkout CLS fix»): un esqueleto que copie el árbol real (filas de producto, resumen y alturas), y una prueba E2E de CLS como `tests/e2e/checkout-cls.spec.ts`, con CPU 6× y red lenta.
3. **Inicio:** fijar el alto del carril de categorías (alto mínimo de la fila de burbujas y del título) para que no crezca cuando llegan las imágenes.
4. **Franja superior al desplazar** (`components/navbar.tsx:61`, `max-lg:hidden`): ocultarla con `transform: translateY(-100%)` dentro de un contenedor de alto fijo, en vez de sacarla del flujo; un `transform` no cuenta como desplazamiento de diseño. Hay que mantener `--storefront-header-offset` (`app/globals.css`) y el aspecto de la cabecera. Toca la cabecera, que se rompe con facilidad en tableta y móvil: hay que probar a 390, 768, 820, 1280 y 1440 px.
5. **Medir en el campo antes de tocar `/tienda`:** enviar a Clarity o GA4 el elemento del mayor desplazamiento (`web-vitals` en su versión con `attribution`, `largestShiftTarget`), para saber qué produce el 1,7 en usuarios reales. Es un cambio de código pequeño y su propia propuesta.

Prioridad sugerida: 1 y 4 (sencillos, afectan a todas las visitas móviles), luego 2, y 5 antes de cualquier cambio en `/tienda`.

---

## F — Unicidad de `Product.slug`


#### F.1 Esquema e historial

- `prisma/schema.prisma:395`: `slug String @default("")`. **No es `@unique` ni `@@unique`.** Solo tiene `@@index([slug])` (`:467`) y `@@index([storeId, slug])` (`:468`).
- Los modelos hermanos **sí** son únicos por tienda:
  - `Category` `@@unique([storeId, slug])` (`:225`);
  - `ProductSlugAlias` (`:526`);
  - `DeletedProductUrl` (`:546`);
  - `CategorySlugAlias` (`:560`);
  - otros dos modelos en `:575` y `:2523`.
  - `Type` tampoco es único (`@@index([storeId, slug])`).
- En la base, sobre `Product`: `Product_slug_idx (slug)` y `Product_storeId_slug_idx (storeId, slug)`, ambos `NON_UNIQUE=1`.
- Columna: `varchar(191) NOT NULL DEFAULT ''`, `utf8mb4` / **`utf8mb4_unicode_ci`**, que no distingue mayúsculas ni tildes y aplica PAD SPACE. `ProductSlugAlias.slug` y `DeletedProductUrl.slug` usan la misma intercalación.
  - Hallazgo aparte: **`CategorySlugAlias` está en `utf8mb4_0900_ai_ci`**, distinta de `Category` (`utf8mb4_unicode_ci`). Un JOIN entre ambas da el error 1267 «Illegal mix of collations». La tabla tiene 0 filas, así que queda como nota, no como arreglo urgente.
- Migraciones manuales con slug:
  - `20260828_add_catalog_options.sql` crea `TypeSlugAlias` con `UNIQUE (storeId, slug)`;
  - `20260921_add_newsletter_issues.sql`;
  - `20261005_add_deleted_product_url.sql`.
  - **Ninguna** toca la unicidad de `Product.slug`.
  - El precedente de «añadir un índice único con precondición en comentario» es `20260911_add_post_unique_identifier.sql`.

#### F.2 Datos (producción, solo lectura)

| Comprobación | Resultado |
|---|---|
| Tiendas | **1** (todos los 2.066 productos están en la tienda principal) |
| Slugs duplicados en la tienda (intercalación de la columna) | **0** |
| Duplicados exactos (`BINARY`) | **0** |
| Duplicados entre tiendas | **0** (solo hay una tienda) |
| Slugs `NULL` / `''` | **0 / 0** |
| Con espacios a los lados, con mayúsculas, o fuera de `^[a-z0-9]+(-[a-z0-9]+)*$` | **0 / 0 / 0** |
| Longitud máxima | 77 caracteres |
| `Product.slug` igual a un `ProductSlugAlias.slug` de la misma tienda | **2**, ambos archivados, y el alias es de **otro** producto vivo: `carpeta-plastica-oficio-lila` y `carpeta-van-gogh` |
| `Product.slug` igual a un `DeletedProductUrl.slug` | 0 (la tabla está vacía) |
| Alias huérfanos (producto inexistente) / de otra tienda | **0 / 0** (de 2.276) |
| Alias duplicados por mayúsculas o espacios | 0 |
| `Product.slug` igual al `id` de otro producto | 0 |

Conclusión: **hoy el índice único `(storeId, slug)` se crearía sin conflictos.** Los 2 choques con alias no son entre filas de `Product`, así que el índice no los ve. La unicidad producto-alias sigue dependiendo solo del código.

**Conteos repetidos el 2026-10-05, tarde** (seguimiento de la ola 3, usuario `pdepapel_ro`, dentro del sandbox):

| Comprobación | Resultado |
|---|---|
| Productos / tiendas | 2.066 / 1 |
| Slug vacío o nulo | **0** |
| Grupos de slug duplicado en la misma tienda | **0** (0 filas) |
| `Product.slug` igual a un `ProductSlugAlias` de otro producto | **2**: `carpeta-plastica-oficio-lila` y `carpeta-van-gogh`, los dos archivados; 0 de productos vivos |
| `Product.slug` igual a una `DeletedProductUrl` | **0** (la tabla tiene 0 filas) |

**Prerrequisito de código: hecho** (commit `89162095`, seguimiento de la ola 3). La importación por lotes y la conversión a variantes ya crean cada producto con un slug único y no vacío, y `getUniqueProductSlug` y la sincronización del grupo también evitan las URL de productos borrados. Falta la sincronización de grupo «en dos fases» (F.3), que solo importa una vez exista el índice. La migración sigue sin crear ni aplicar.

#### F.3 Dónde se genera y valida el slug (código)

- `lib/product-slugs.ts:57-93`, `getUniqueProductSlug`:
  - comprueba `Product` y `ProductSlugAlias` **por `storeId`** y añade `-2`, `-3`… hasta encontrar uno libre;
  - no consulta `DeletedProductUrl`: un producto nuevo puede quedarse con la URL de uno borrado, y entonces gana el vivo, cosa aceptable;
  - es un `findFirst` seguido de un `create`, **sin índice que lo respalde, así que es vulnerable a carreras**.
- Rutas que lo usan:
  - creación simple: `app/api/[storeId]/products/route.ts:287-295`, que calcula el slug con `prismadb` **fuera** de la transacción;
  - edición: `[productId]/route.ts:379-411`, también fuera de la transacción, más `preserveProductSlugAlias` en `:494-506`;
  - grupos: `product-groups/route.ts:250-283` y `product-groups/[productGroupId]/route.ts:369-412`, más `synchronizeProductGroupSlugs`.
- **Rutas que crean productos con `slug = ""`, y que romperían con el índice único:**
  1. `app/api/[storeId]/products/batch/route.ts:69,97,203`. La importación por lotes (modal `components/modals/product-batch-import-modal.tsx:254`) crea productos **sin `slug`** (0 menciones en el archivo), así que toman el valor por defecto `""`. Va en un bucle dentro de `$transaction`, y con el índice único **la segunda fila fallaría con 1062 y revertiría todo el lote**. Además hoy deja productos sin URL. Que haya 0 slugs vacíos sugiere que se corrigió después con `scripts/backfill-slugs.ts` o `normalize-product-slugs`, no que la ruta esté muerta.
  2. `app/api/[storeId]/products/[productId]/convert-to-variants/review/route.ts:233,337,344-349` crea cada variante nueva con `slug: ""` en un bucle, y solo llama a `synchronizeProductGroupSlugs` al final (`:411`). Con dos o más variantes nuevas, **la segunda inserción falla** y la conversión entera se revierte.
- **Riesgo de orden en `synchronizeProductGroupSlugs`** (`lib/product-slugs.ts:174-219`):
  - excluye de los reservados los slugs **actuales** del propio grupo y actualiza las variantes una a una;
  - si la variante A recibe como nuevo slug el que **todavía** tiene la variante B (por ejemplo, al cambiar qué atributos diferencian el grupo), la actualización de A choca con el índice antes de que B se mueva;
  - hoy funciona porque no hay índice. Con el índice hace falta un paso intermedio: poner primero slugs temporales únicos (por ejemplo `tmp-<id>`) a las variantes que cambian, y luego los definitivos.
- Fuera de la API: los fixtures de `tests/integration/*` y `scripts/seed-e2e-admin-store.ts:142,175` ya ponen slugs únicos. `scripts/sync-staging-db.ts:296` copia el slug de producción.

#### F.4 Migración PROPUESTA (no creada en el repo, no aplicada)

**Alcance: por tienda, `(storeId, slug)`.**
- Es el invariante del resto del esquema: todos los modelos de slug hermanos son `@@unique([storeId, slug])`.
- `getUniqueProductSlug` ya razona por `storeId`.
- El modelo es multitienda por diseño.
- Con una sola tienda, en datos es idéntico a un índice global, pero uno global impediría que una segunda tienda use `cuaderno-argollado`.
- El índice único sustituye a `Product_storeId_slug_idx`, que queda redundante y se elimina en el mismo archivo. `Product_slug_idx (slug)` se mantiene.

**Prerrequisito de código (desplegar ANTES de aplicar la migración):**
- la importación por lotes y `convert-to-variants/review` escriben un slug único antes del `create`, sea con `getUniqueProductSlug` por fila (dentro de la transacción) o con un marcador `p-<uuid>` que la sincronización reemplace después;
- `synchronizeProductGroupSlugs` hace el cambio en dos fases;
- las rutas que capturan errores de Prisma traducen `P2002` sobre `Product_storeId_slug_key` a un 409 legible (o reintentan con el sufijo siguiente).

Archivo propuesto: `prisma/manual-migrations/20261006_product_slug_unique_per_store.sql`

```sql
-- 2026-10-06 · Slug de producto único por tienda (SEO ola 3, fase 2, parte F)
--
-- Product.slug nunca tuvo restricción: la unicidad dependía solo de
-- getUniqueProductSlug (findFirst + create, sin respaldo, con carreras). Los
-- demás slugs del esquema (Category, ProductSlugAlias, DeletedProductUrl,
-- CategorySlugAlias, TypeSlugAlias) ya son UNIQUE (storeId, slug).
--
-- Requiere desplegar ANTES el código que deja de crear productos con slug ''
-- (importación por lotes y convert-to-variants) y que sincroniza los slugs de
-- grupo en dos fases; si no, la segunda fila de un lote falla con 1062.
--
-- Intercalación de la columna: utf8mb4_unicode_ci, así que el índice no
-- distingue mayúsculas, tildes ni espacios finales; todos los slugs son ASCII
-- en minúscula.
--
-- Verificación previa (cada consulta debe devolver 0 filas / 0):
--   SELECT COUNT(*) FROM `Product` WHERE `slug` = '' OR `slug` IS NULL;
--   SELECT `storeId`, `slug`, COUNT(*) FROM `Product`
--     GROUP BY `storeId`, `slug` HAVING COUNT(*) > 1;
--   SELECT `storeId`, LOWER(TRIM(`slug`)) s, COUNT(*) FROM `Product`
--     GROUP BY `storeId`, s HAVING COUNT(*) > 1;
--   SHOW INDEX FROM `Product` WHERE Key_name = 'Product_storeId_slug_key';  -- vacío
--
-- Bloqueo: InnoDB construye un índice secundario UNIQUE en línea
-- (ALGORITHM=INPLACE, LOCK=NONE): lecturas y escrituras siguen durante la
-- construcción; solo hay un bloqueo de metadatos breve al inicio y al final.
-- ~2.066 filas / 2,6 MB: menos de un segundo. Si durante la construcción entra
-- un duplicado, el ALTER falla (sin daño) y se reintenta.
--
-- Dos sentencias separadas a propósito: apply-manual-migration.mjs no es
-- transaccional; si el ADD falla, el índice viejo sigue en su sitio.

ALTER TABLE `Product`
  ADD UNIQUE INDEX `Product_storeId_slug_key` (`storeId`, `slug`),
  ALGORITHM = INPLACE, LOCK = NONE;

ALTER TABLE `Product`
  DROP INDEX `Product_storeId_slug_idx`,
  ALGORITHM = INPLACE, LOCK = NONE;

-- Verificación posterior:
--   SHOW INDEX FROM `Product` WHERE Column_name = 'slug';
--     -- Product_slug_idx (NON_UNIQUE=1) y Product_storeId_slug_key (NON_UNIQUE=0)
--   EXPLAIN SELECT id FROM `Product` WHERE storeId = '<id>' AND slug = 'x';
--     -- usa Product_storeId_slug_key
--
-- Reversión (después de revertir el esquema):
--   ALTER TABLE `Product` ADD INDEX `Product_storeId_slug_idx` (`storeId`, `slug`),
--     ALGORITHM = INPLACE, LOCK = NONE;
--   ALTER TABLE `Product` DROP INDEX `Product_storeId_slug_key`,
--     ALGORITHM = INPLACE, LOCK = NONE;
```

Cambio de `schema.prisma` (modelo `Product`, `:466-468`):

```prisma
  @@index([storeId])
  @@index([slug])
  @@unique([storeId, slug])   // antes: @@index([storeId, slug])
```

Prisma nombra el índice `Product_storeId_slug_key`, igual que el SQL, y añade la clave `storeId_slug` a `ProductWhereUniqueInput`. No cambia ningún tipo existente, así que se puede adoptar `findUnique` más adelante. El ancho del índice es 191 + 191 caracteres × 4 bytes = 1.528 bytes, por debajo del límite de 3.072 de InnoDB DYNAMIC.

**Riesgos:**
- **Escrituras rotas.** Es el riesgo principal: las dos rutas que crean con `''` y la sincronización de grupo descritas en F.3. Sin el prerrequisito de código, la importación por lotes y la conversión a variantes fallan en producción.
- **Bloqueo y tamaño:** despreciables. Es DDL en línea sobre unos 2 mil registros. Lo único que puede esperar es el bloqueo de metadatos si hay una transacción larga abierta sobre `Product`, así que conviene aplicarlo fuera de una feria o de una importación.
- **Orden.** Son dos pasos: (1) desplegar juntos el código y el esquema con `@@unique`. El `@@unique` no cambia nada en ejecución, porque Prisma no comprueba índices, y el código es compatible sin el índice. (2) Aplicar la migración.
- **Endurecimiento opcional.** Quitar `@default("")` de `Product.slug` vuelve `slug` obligatorio en `ProductCreateInput`, así que `tsc` detectaría `batch/route.ts:203` y cualquier creación futura sin slug. La migración ganaría `ALTER TABLE Product ALTER COLUMN slug DROP DEFAULT;` (reversión: `SET DEFAULT ''`). No detecta `convert-to-variants`, que pasa `slug: ""` explícito.
- **Índice eliminado.** Ninguna consulta cruda nombra `Product_storeId_slug_idx` ni usa `FORCE/USE INDEX` (grep en `pdepapel-admin`, `.ts/.mjs/.sql`), así que eliminarlo es seguro.
- **Fuera de alcance del índice.** La colisión entre `Product.slug` y `ProductSlugAlias.slug` (2 casos hoy) solo la previene el código (`lib/product-slugs.ts:66-84,101-118`). Si se quiere cerrar, haría falta un único espacio de nombres (una tabla `ProductUrl`), lo cual está fuera de esta migración.

**Plan de pruebas (solo la base Docker local, `TEST_DATABASE_URL` terminado en `pdepapel_test`):**
1. Editar el esquema, correr `npx prisma generate` y `npx tsc --noEmit`.
2. `npm run test:db:up && npm run test:db:push` (crea el índice único en Docker).
3. Pruebas de regresión nuevas, escritas primero en rojo (deben fallar sin el arreglo de código):
   - importación por lotes con 2 o más filas en una transacción;
   - `convert-to-variants/review` con 2 o más variantes nuevas;
   - `synchronizeProductGroupSlugs` con un intercambio de slugs entre dos variantes;
   - dos `POST /products` concurrentes con el mismo nombre (uno recibe el sufijo, o un 409 controlado, nunca un 500).
4. Suite existente: `npm run test:integration`, con atención a `product-delete-archive`, `product-group-variant-removal`, `product-group-integrity`, `product-conversion-ungroup`, `attribute-merge-flow` y `fair-close-scale`. Los fixtures ya ponen slugs únicos.
5. Aplicar el `.sql` literal a la base Docker con `node scripts/with-test-env.mjs node scripts/apply-manual-migration.mjs <archivo>`, sobre un esquema creado sin el `@@unique`, para validar la sintaxis, el `ALGORITHM/LOCK` y la reversión. Luego `npm run test:db:down`.
6. En producción, solo después de aprobar: correr las precondiciones con `pdepapel_ro`, luego `npm run prod:migrate -- prisma/manual-migrations/20261006_product_slug_unique_per_store.sql` con una aprobación fresca de Christian, y luego la verificación posterior.

---

## Anexo — Fase 3: verificaciones

| Ítem | Estado | Evidencia |
|---|---|---|
| **P1-1: precio del feed frente al JSON-LD** | **Hecho** | El feed no se pudo leer sin su token, así que se reconstruyó con el mismo código de `refreshGoogleMerchantFeed` (`findMany` + `getFeedPricingMap` + `buildGoogleMerchantFeed`) con el usuario `pdepapel_ro` y Redis apuntado a una dirección muerta, para que no se escribiera la caché. Resultado: 888 filas, 34 en oferta. Muestra de 40 (15 en oferta y 25 a precio normal), comparada con el `Offer.price` publicado de cada ficha: **40 de 40 coinciden** (precio de oferta cuando lo hay). El refresco programado del feed corrió bien hoy (job «Google Merchant feed refresh», 8 s, run 37372680240). Guion: `feed-vs-jsonld.mts` en el borrador |
| **`POST /api/revalidate` con 200** | **Lo hace Christian** | Sin secreto, la ruta responde **401** y sin `x-vercel-mitigated`: pasa el firewall y llega a la ruta, así que el bloqueo de Bot Protection del 2026-09-11 no está activo. El 200 necesita `REVALIDATION_SECRET`, que no se lee (y `vercel env pull` trae vacías las variables sensibles). Comando, con el secreto desde su gestor y sin dejarlo en el historial: `read -s S && curl -s -o /dev/null -w '%{http_code}\n' -X POST https://papeleriapdepapel.com/api/revalidate -H "Content-Type: application/json" -H "x-revalidate-secret: $S" -d '{"tags":["catalog"]}'; unset S` → debe imprimir `200`. Alternativa sin secreto: guardar cualquier producto en el panel y revisar que el registro `storefront-revalidation` quede en `ok: true` |
| **Revisión semanal `public-health.yml`** | **Hecho** | Corrida programada 37375514871 (2026-10-05, 21:23 UTC, `schedule`): **éxito**, 56 pruebas pasadas y 38 omitidas, 3 min. La corrida manual de la mañana también pasó (37272537823) |
| **GA4: `search_term` y `session_id`** | **Parcial; esperar 24–48 h** | `search_term` está registrada como dimensión personalizada (ámbito evento, creada el 2026-10-05) y el código la envía en `search`, `catalog_search` y `catalog_no_results` (`components/search-bar.tsx:130`, `components/shop-content.tsx:197`, `app/(routes)/tienda/components/shop-search-bar.tsx:43`). Tiempo real: 0 usuarios en 30 min, nada que ver; no se generó tráfico de prueba. `session_id`: la columna `Order.analyticsSessionId` existe en producción y el código lo manda en la compra (`pdepapel-admin/lib/google-analytics.ts:82`), pero desde el 2026-10-04 solo hay 1 pedido (no pagado y sin consentimiento), así que no hay compra con la cual comprobarlo. Revisar después de la próxima compra con consentimiento |
| **Variables de Preview del admin** (solo nombres) | **Hecho; lo decide Christian** | En Preview general **no** existen `DATABASE_URL`, `FRONTEND_STORE_URL` ni `CRON_SECRET`. `FRONTEND_STORE_URL` y `CRON_SECRET` existen solo para la rama `feat/upgrade-prisma-v7`; `DATABASE_URL` no aparece en ningún Preview. No se cambió nada |
| **Merchant Center: diagnóstico y devoluciones** | **Hecho; volver a mirar** | Productos: **867 aprobados**, 0 limitados, 0 no aprobados, 0 en revisión. «Requiere atención» sin problemas (última actualización 08:00 del 5 de octubre). La política «Estándar para Colombia» sigue **Pendiente** (7 días, «Responsabilidad del cliente»); Google la revisa en hasta 10 días |

**Aparte, encontrado al revisar el cron:** en la corrida de hoy de «Admin scheduled tasks» (37372680240) fallaron los jobs **«WhatsApp webhook event retention»** y **«Payment webhook event retention»** con «The job was not acquired by Runner of type hosted even after multiple attempts». Es un problema de los runners de GitHub, no del código; los otros 4 jobs pasaron. No se volvieron a lanzar, porque esos jobs borran filas de producción y no estaban en lo aprobado. Mañana deberían correr solos; si no, Christian puede relanzarlos con `gh run rerun 37372680240 --failed --repo chrisdev-ui/pdepapel`.
