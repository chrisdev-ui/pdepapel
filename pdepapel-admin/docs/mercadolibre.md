# Configuración de Mercado Libre

Esta guía se ejecuta en orden. P de Papel conserva el inventario como fuente de verdad: Mercado Libre recibe el stock local menos el colchón de seguridad definido para cada publicación.

Para el uso diario del equipo consulta la [guía práctica de Mercado Libre](guia-uso-mercadolibre.md) o su [PDF listo para compartir](../../output/pdf/guia-practica-mercadolibre-p-de-papel.pdf). Este documento conserva la configuración técnica y operativa de la integración.

No compartas en chat, correo ni capturas el `Client Secret`, los tokens de QStash ni la llave de cifrado.

La migración `prisma/manual-migrations/20260808_add_marketplace_operations.sql` fue aplicada en Railway el 2026-08-08. Es un cambio aditivo: agrega preguntas, envíos, reclamos, plantillas, biblioteca multimedia y acciones seguras en cola; no altera ventas ni existencias existentes. La migración posterior `prisma/manual-migrations/20260808_add_marketplace_publication_profiles.sql` fue aplicada en Railway el 2026-08-09 y habilita perfiles rápidos por categoría local.

## 1. Crear la aplicación de Mercado Libre

1. Abre [Mis aplicaciones de Mercado Libre](https://applications.mercadolibre.com/) e inicia sesión con la **cuenta vendedora principal de P de Papel**. No uses una cuenta personal de desarrollador, un colaborador u operador.
2. Confirma que la cuenta corresponde a Colombia. La integración solo acepta vendedores del sitio `MCO`.
3. En **Mis aplicaciones**, pulsa **Crear nueva aplicación**.
4. Completa el formulario así:

   | Campo                    | Valor que debes usar                                                                                                        |
   | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
   | Nombre                   | `P de Papel Mercado Libre`                                                                                                  |
   | Nombre corto, si aparece | `pdepapel-ml`                                                                                                               |
   | Descripción              | `Conecta el catálogo de P de Papel con Mercado Libre Colombia para publicar productos y sincronizar ventas e inventario.`   |
   | Logo                     | Escoge el logo oficial de P de Papel en versión cuadrada. Usa PNG o JPG nítido y sigue el tamaño que indique el formulario. |
   | Sitio web, si aparece    | `https://papeleriapdepapel.com`                                                                                             |

   Si Mercado Libre avisa que el nombre o nombre corto ya existe, conserva el texto y añade `Colombia` al final.

5. En **URIs de redirect**, agrega esta dirección exacta, sin barra final, parámetros ni espacios:

   ```
   https://admin.papeleriapdepapel.com/api/integrations/mercadolibre/callback
   ```

6. Si aparece **Use PKCE / Usar PKCE**, déjalo **desactivado por ahora**. La versión que se desplegará usa OAuth de servidor con `Client Secret` y estado de un solo uso; activar PKCE antes de añadir su soporte específico bloquearía la conexión.
7. En **Scopes / Permisos**, activa:
   - **Lectura / Read**
   - **Escritura / Write**
   - **Acceso offline / offline_access**, si aparece como opción separada

   El acceso offline es necesario para renovar el acceso de manera automática y mantener sincronizadas ventas y existencias.

8. En la sección detallada de **Permisos**, selecciona solo lo necesario:

   | Permiso                                        | Nivel                     |
   | ---------------------------------------------- | ------------------------- |
   | Usuarios                                       | **Lectura**               |
   | Comunicaciones pre y post ventas               | **Lectura y escritura**   |
   | Publicación y sincronización                   | **Lectura y escritura**   |
   | Publicidad de un producto                      | **Lectura y escritura\*** |
   | Facturación de una venta                       | **Lectura**               |
   | Métricas del negocio                           | **Sin acceso**            |
   | Promociones, cupones y descuentos de una venta | **Sin acceso**            |
   | Venta y envíos de un producto                  | **Lectura**               |

   No selecciones lectura y escritura para todo: la integración solo publica y actualiza productos, consulta órdenes confirmadas y lee los cargos de cada venta para registrar el neto real.

   \*Este permiso permite consultar y, únicamente después de una confirmación explícita del administrador, pausar, activar o ajustar una campaña existente de **Product Ads**. P de Papel no crea campañas, no agrega anuncios y no modifica presupuestos automáticamente.

9. Si el formulario muestra **Notificaciones**, déjalo sin temas seleccionados por ahora. Si ya marcaste `orders_v2`, vuelve a **Tópicos** y desmárcalo: Mercado Libre exige una Callback URL al seleccionar un tema. No registres todavía la URL de producción porque el endpoint aún no está desplegado; una venta existente podría recibir intentos fallidos y Mercado Libre podría desactivar las notificaciones.
10. Pulsa **Guardar** o **Crear aplicación**.
11. En la pantalla de la aplicación, copia en el administrador de contraseñas de la empresa:
    - **APP ID / Client ID**
    - **Client Secret / Secret Key**

No los pegues en este documento, Git, mensajes ni capturas. No renueves el Client Secret sin actualizar Vercel primero: las nuevas autorizaciones fallarán hasta que el valor nuevo esté desplegado.

## 2. Crear la cuenta de QStash

1. Abre [QStash en Upstash](https://console.upstash.com/qstash) e inicia sesión o crea la cuenta de la empresa.
2. Si Upstash solicita crear o seleccionar un proyecto/entorno de QStash, crea uno llamado `pdepapel-production`. Si solicita una región, elige la más cercana a la ejecución de Vercel del panel de administración; normalmente `US East / Virginia` cuando esté disponible.
3. En la sección **Quickstart**, copia y guarda en el administrador de contraseñas:
   - `QSTASH_TOKEN`
4. En **Signing Keys / Claves de firma**, copia y guarda:
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`
5. No crees manualmente una cola, URL Group, schedule ni webhook en Upstash. P de Papel creará el schedule de recuperación y verificará cada entrega firmada al activar la integración.

QStash reintenta los trabajos y una recuperación programada cada 15 minutos vuelve a encolar lo que quedó pendiente. Cada evento (aviso de venta o tarea de sincronización) tiene un tope de **12 intentos**: al agotarlos pasa a **FAILED**, deja de reintentarse y aparece en la salud de Mercado Libre (Resumen y correo diario). Una liquidación que Mercado Libre todavía no publicó no cuenta para ese tope: se reintenta cada 6 horas hasta que exista. Ningún reintento aplica inventario dos veces.

## 3. Generar la llave de cifrado

1. Abre una terminal en tu computador.
2. Ejecuta una sola vez:

   ```bash
   openssl rand -base64 32
   ```

3. Copia el resultado completo, sin comillas ni salto de línea, al administrador de contraseñas. Será el valor de `MERCADOLIBRE_TOKEN_ENCRYPTION_KEY`.
4. No vuelvas a generarla. Si se pierde o se cambia, las credenciales guardadas dejan de poder leerse y tendrás que reconectar Mercado Libre.

## 4. Agregar las variables en Vercel

Haz este paso solo cuando el código y el esquema de base de datos hayan sido aprobados para despliegue.

1. Abre [Vercel](https://vercel.com/dashboard), selecciona el proyecto de **administración** (`pdepapel-admin`), no el sitio de clientes.
2. Abre **Settings** → **Environment Variables** → **Add New**.
3. Agrega cada valor al entorno **Production**. Marca como sensible los secretos.

   | Nombre                              | Valor                                                                        | Sensible |
   | ----------------------------------- | ---------------------------------------------------------------------------- | -------- |
   | `MERCADOLIBRE_CLIENT_ID`            | APP ID de Mercado Libre                                                      | Sí       |
   | `MERCADOLIBRE_CLIENT_SECRET`        | Client Secret de Mercado Libre                                               | Sí       |
   | `MERCADOLIBRE_OAUTH_REDIRECT_URI`   | `https://admin.papeleriapdepapel.com/api/integrations/mercadolibre/callback` | No       |
   | `MERCADOLIBRE_TOKEN_ENCRYPTION_KEY` | Resultado del comando `openssl`                                              | Sí       |
   | `QSTASH_TOKEN`                      | Token de Quickstart de QStash                                                | Sí       |
   | `QSTASH_CURRENT_SIGNING_KEY`        | Clave actual de QStash                                                       | Sí       |
   | `QSTASH_NEXT_SIGNING_KEY`           | Clave siguiente de QStash                                                    | Sí       |
   | `ADMIN_WEB_URL`                     | `https://admin.papeleriapdepapel.com`                                        | No       |

4. Si `ADMIN_WEB_URL` ya existe, verifica que sea exactamente `https://admin.papeleriapdepapel.com`.
5. Guarda cada variable. Los cambios de variables solo se aplican en un despliegue nuevo.

## 5. Desplegar y activar

1. Antes de desplegar, aplica el esquema Prisma a Railway. El despliegue no crea las tablas automáticamente.
2. Confirma que el despliegue de producción terminó correctamente.
3. Inicia sesión en [Administración](https://admin.papeleriapdepapel.com), abre **Ventas** → **Mercado Libre**.
4. Comprueba que no aparezca el aviso de variables faltantes.
5. Pulsa **Conectar Mercado Libre**.
6. Inicia sesión con la cuenta vendedora principal de P de Papel, no con un operador o colaborador, y acepta los permisos solicitados.
7. Al volver al panel, confirma que el estado diga **Conectada**. Si cambiaste un permiso después de haber conectado la cuenta, pulsa **Reconectar Mercado Libre** para emitir un token con el nuevo alcance.
8. Pulsa **Activar procesamiento seguro** y espera el mensaje de confirmación. Esto crea una recuperación automática cada quince minutos. Si ya aparece como activa, usa **Actualizar programación** para reemplazar el schedule existente sin reconectar Mercado Libre ni crear uno adicional.

### Activar y gestionar Product Ads (opcional)

Hazlo solo si quieres administrar desde P de Papel una campaña que ya existe en Mercado Libre. Consultar métricas no genera cobros; activar una campaña sí puede volver a producir gasto por clic según el presupuesto confirmado.

1. En **Mis aplicaciones**, confirma que **Publicidad de un producto** esté en **Lectura y escritura**.
2. Guarda el cambio y vuelve a **Ventas** → **Mercado Libre** en P de Papel.
3. Pulsa **Reconectar Mercado Libre** y acepta los permisos. Sin este paso el token anterior no recibe el permiso nuevo.
4. En la cuenta vendedora, abre **Mi perfil** → **Publicidad** y activa Product Ads si Mercado Libre todavía no lo ofrece como activo.
5. Regresa al panel y, en **Product Ads**, pulsa **Consultar métricas**.

Mercado Libre puede no habilitar Product Ads hasta que la cuenta cumpla sus propias condiciones comerciales. Ese caso no afecta ventas, publicaciones, existencias ni el webhook.

### Decidir sobre una campaña sin confundir ventas con utilidad

1. En **Ventas** → **Mercado Libre** → **Product Ads**, pulsa **Consultar métricas**. La consulta muestra los últimos 30 días y no cambia nada.
2. Revisa **Gasto publicitario real** y **Ventas atribuidas por Mercado Libre**. Las ventas atribuidas son valor bruto: no incluyen comisión, envío, impuestos, devoluciones ni costo de compra. El dinero realmente recibido se consulta en la liquidación neta de cada venta.
3. Para dejar de invertir, pulsa **Pausar** junto a la campaña y confirma. La publicación sigue activa para ventas orgánicas; no se devuelven clics cobrados antes de pausar.
4. Para reanudarla, pulsa **Activar** y revisa el presupuesto mostrado antes de confirmar. La acción no garantiza ventas y puede volver a generar cobros por clic.
5. En **Ajustar**, revisa el presupuesto promedio diario, el ROAS objetivo y la estrategia antes de guardar. El panel calcula una referencia de 30 días y advierte que Mercado Libre puede usar hasta el doble del promedio en un día para compensar días previos con menor consumo.
6. Cada cambio queda registrado con la configuración anterior, el cambio solicitado, la persona que lo confirmó y la respuesta de Mercado Libre. Nunca se ejecutan cambios automáticos ni se crean campañas desde P de Papel.

### Consultar dinero por retirar

Este panel sirve para entender el dinero de Mercado Libre sin confundir una venta con dinero que ya puede retirarse. No crea retiros, no guarda cuentas bancarias y no cambia campañas, publicaciones, inventario ni ventas.

1. En **Ventas** → **Mercado Libre**, busca **Dinero de Mercado Libre** y pulsa **Consultar dinero**. La consulta es manual para no hacer llamadas innecesarias a Mercado Libre.
2. Revisa **Por liberar**: suma los netos ya liquidados por Mercado Libre que todavía no aparecen liberados. Ejemplo: si una venta dejó un neto de `$46.457`, ese es el valor que puede aparecer aquí; no se usa el precio total que pagó el comprador.
3. Revisa **Liquidación pendiente**: son ventas pagadas cuyo valor neto aún no fue publicado por Mercado Libre. No las cuentes como dinero disponible ni como ingreso definitivo.
4. En **Próximas liberaciones**, compara las fechas con Mercado Pago. Un reclamo, devolución u otra retención puede mover la disponibilidad real.
5. Mercado Libre no entrega el saldo disponible de la cuenta de Mercado Pago con esta conexión. Para ver el saldo exacto y retirar, pulsa **Abrir Mercado Pago para retirar**, elige la cuenta bancaria y confirma allí. P de Papel no puede iniciar un retiro por seguridad y porque Mercado Pago debe mostrar la confirmación final.

Si una venta sigue sin fecha después de actualizar, verifica el permiso **Facturación de una venta → Lectura**, reconecta Mercado Libre y revisa la venta directamente en Mercado Pago. La actualización conserva el neto, los cargos y el inventario existentes.

## 6. Activar notificaciones de ventas

Haz este paso únicamente después de terminar la sección anterior.

1. Vuelve a [Mis aplicaciones de Mercado Libre](https://applications.mercadolibre.com/).
2. Abre **Configurar** en `P de Papel Mercado Libre`.
3. En **Configuraciones de notificaciones**, pega esta URL exacta:

   ```
   https://admin.papeleriapdepapel.com/api/webhook/mercadolibre
   ```

4. En tópicos, abre las secciones necesarias y activa: **`orders_v2`**, **`questions`**, **`shipments`**, **`claims`** y **`claims_actions`**.
5. No actives `payments`, `items`, `messages` u otros temas. P de Papel no toma decisiones automáticas de reembolso, devolución ni reclamo: solo muestra el caso para revisión.
6. Guarda los cambios.

La notificación no descuenta inventario por sí misma. P de Papel consulta la orden autenticada en Mercado Libre y solo descuenta una vez cuando el estado real es `paid`. El correo administrativo se envía al registrarse el pago; si Mercado Libre aún no publica la liquidación, indicará que el neto está pendiente y se actualizará después.

## 7. Validación inicial sin afectar ventas ni existencias

1. No publiques ni compres productos reales todavía.
2. Verifica que Mercado Libre muestre la cuenta como conectada y que QStash muestre el schedule creado por P de Papel.
3. No hagas una venta entre usuarios de prueba conectada a la tienda de producción: una orden de prueba vinculada a un producto real descontaría el stock real por diseño.
4. Para una prueba de compra completa, usa una tienda y base de datos de pruebas separadas, conectadas a un vendedor y comprador de prueba de Mercado Libre. Mercado Libre indica que las pruebas se hacen exclusivamente entre usuarios de prueba, no con cuentas personales.
5. Cuando se apruebe la primera publicación real, usa el último paso del asistente para guardarla como **borrador** o publicarla desde Administración después de revisarla.

## Preparar una publicación real

1. Abre **Ventas** → **Mercado Libre** y pulsa **Preparar publicación**.
2. En **Producto**, escoge el producto local. Verás el **precio de la tienda en línea** únicamente como referencia: no se puede modificar desde este asistente. Si ya existe un perfil rápido para su categoría, el panel propone la categoría de Mercado Libre, la ficha técnica, las fotos y otros datos editables. Nada se publica todavía. Al pulsar **Continuar** se crea el borrador en la lista y el producto queda fijado a él; para publicar otro producto se abre una publicación nueva. Los pasos 2 y 3 guardan lo completado al avanzar, así que cerrar la ventana no pierde nada; con cambios sin guardar, el cierre pide confirmación.
3. En **Precio de venta en Mercado Libre**, escribe el valor que verá y pagará la clienta en Mercado Libre. Es independiente del precio de la tienda en línea; el panel muestra la diferencia para compararlos. Cambiarlo actualiza solamente Mercado Libre, nunca el precio ni las ofertas de `papeleriapdepapel.com`. El **costo por unidad** de referencia es el precio de compra más el campo **Envío y otros gastos** del producto (Productos › Precios); un precio por debajo de ese piso no se guarda ni se publica sin un motivo escrito en el paso 4, y el motivo queda registrado en la publicación.
4. Si lo necesitas, abre **Ajustes de stock y precio**. Las **unidades de seguridad** empiezan en `0`: solo aumenta este número si quieres guardar unidades fuera de Mercado Libre. Ejemplo: con stock local de 5 y seguridad de 1, Mercado Libre mostrará máximo 4 unidades. Deja activa la sincronización de precio solo si Administración debe mantener el precio de Mercado Libre.
5. En **Categoría y fotos**, pulsa **Sugerir categoría** y elige una propuesta verificada. Cada sugerencia muestra la ruta desde la raíz y el dominio de Mercado Libre; la lista se conserva mientras escribes o pegas un código y la elegida aparece marcada. Administración verifica las sugerencias de a tres a la vez; si Mercado Libre no respondió por alguna, lo dice bajo la lista con la cantidad y basta volver a sugerir en unos minutos. Marca solo las fotos que correspondan al artículo: la primera será la portada. Si falta una foto, usa **Agregar fotos** (abre el producto en otra pestaña). Al continuar, Administración confirma con Mercado Libre que la categoría exista, sea final y tenga una ficha técnica disponible; no uses una categoría general escrita a mano. Si Mercado Libre retiró una categoría antigua, el asistente quita solo esa selección, conserva el resto del borrador y la ficha técnica ya escrita, y muestra alternativas nuevas.
6. En **Ficha técnica**, el asistente carga los campos obligatorios de la categoría una sola vez por categoría verificada (volver atrás y adelante no los pide de nuevo; **Actualizar campos** los vuelve a pedir). Marca, GTIN, MPN, color y tamaño llegan desde el producto cuando existen, solo en los campos vacíos y, en listas cerradas, solo cuando el valor coincide con una opción. Un producto marcado «No tiene identificador global» no exige GTIN: el campo lo muestra y Mercado Libre recibe el motivo `EMPTY_GTIN_REASON`. En una lista sin coincidencia, **Ninguna coincide: escribir otro valor** permite un valor libre. Usa una plantilla solo si aplica a este producto. Las características adicionales quedan disponibles para casos especiales con el formato `CODIGO=Valor`. Antes de enviar la publicación, Administración vuelve a comprobar categoría y campos para evitar un rechazo de Mercado Libre.
7. En **Revisar y publicar**, selecciona las cuotas que Mercado Libre permite para ese producto y cuenta. En Colombia, Administración presenta **Hasta 3 cuotas con 0% interés** o **Hasta 6 cuotas con 0% interés** únicamente cuando Mercado Libre devuelve esas modalidades. Cada tarjeta separa el cargo total y el costo adicional de ofrecer más cuotas. Más cuotas pueden facilitar la compra, pero reducen el dinero que recibe P de Papel.
8. Elige quién asume el envío. **La compradora paga el envío** protege mejor el margen. **P de Papel ofrece envío gratis** puede facilitar la venta, pero Mercado Libre descontará el costo estimado a P de Papel. Para comparar ambas opciones, registra alto, ancho, largo y peso del paquete ya empacado y pulsa **Comparar costos de envío**. Estos datos deben corresponder a una unidad lista para despachar, no solo al producto sin empaque.
9. Activa **Permitir retiro acordado** únicamente si realmente existe un lugar y proceso para entregar el producto personalmente. Esta opción no reemplaza Mercado Envíos ni debe activarse por defecto.
10. Revisa el resumen financiero: precio público de Mercado Libre, cargo base, costo adicional por financiación, comisión total, envío asumido por P de Papel, liquidación estimada y ganancia operativa después del costo de compra. Si las comisiones no se pudieron consultar, el asistente no pasa al paso 4 y lo dice. Si registraste una **ganancia objetivo**, el precio sugerido incluye la comisión por vender, el cargo por publicar, el **Envío y otros gastos** del producto y, cuando P de Papel paga el envío, exige calcular primero ese costo (el envío que paga la compradora no se cuenta). La liquidación final de Mercado Libre sigue siendo el valor contable real porque impuestos, devoluciones, campañas o ajustes posteriores pueden cambiarla.
11. Si el precio está por debajo del costo por unidad, el paso 4 muestra el piso y pide el **Motivo para publicar por debajo del costo** (5 a 200 caracteres). Sin motivo, ni **Guardar borrador** ni **Publicar ahora** avanzan; con motivo, la publicación guarda `belowCostOverride` (motivo, piso, precio y fecha).
12. Elige **Guardar borrador** si quieres revisarlo después o **Publicar ahora** para enviarlo a Mercado Libre desde Administración. Antes de salir, el panel pregunta **¿Guardar y publicar?** con el producto y el precio. Qué pasa después se explica en «Qué ocurre al publicar».
13. Para una publicación ya activa, abre **Editar**. Administración vuelve a consultar las cuotas permitidas, el envío actual y el costo real estimado para la cuenta. Antes de aplicar, muestra cuánto cambia el cargo por venta, el costo de envío y el neto esperado en pesos. Mercado Libre puede exigir envío gratis; en ese caso la opción de trasladarlo a la compradora queda bloqueada. Confirma solo después de revisar ese impacto.

### Qué ocurre al publicar

1. **Publicar ahora** y la acción masiva «publicar borradores» usan el mismo camino: un evento `PUBLISH_LISTING` en la cola de Mercado Libre. La ruta lo reserva de forma atómica y lo procesa en línea, así que dos clics, dos pestañas o un clic más la cola no crean el ítem dos veces. Si el evento ya está en proceso, el panel responde «ya se está enviando» y no repite nada.
2. Administración valida de nuevo categoría, ficha, título, precio, fotos y unidades, crea el ítem en Mercado Libre y guarda el id **antes** de enviar la descripción. La descripción es un paso aparte: si falla, la publicación queda creada con un aviso en «último error» y se puede sincronizar contenido después. En cuanto hay id, se encola la sincronización de stock.
3. Cada fallo se clasifica y se muestra según su tipo:
   - **Revisión** (Mercado Libre rechazó un dato): la publicación vuelve a **borrador** con el mensaje, el paso y el campo señalados. **Editar** abre el asistente en ese paso con el campo marcado. Sin reintentos automáticos.
   - **Temporal** (Mercado Libre no respondió, 5xx, 429 o tiempo agotado): la publicación conserva su estado y el evento se reintenta solo, hasta 12 veces, con la programación de recuperación cada 15 minutos. El panel lo dice: «Se reintentará automáticamente en unos minutos; no hace falta volver a publicar».
   - **Autorización** (401 o 403): la conexión pasa a «Reautorización requerida» y nada se reintenta hasta reconectar la cuenta.
   - Agotados los intentos, la publicación queda en **error** con el último mensaje.
4. Al terminar, el estado local sigue el de Mercado Libre: `active` → activa, `paused` → pausada, `under_review` o `payment_required` → en revisión, con el id guardado y un mensaje claro; el mapeo es el mismo desde la ruta y desde la cola.

### Perfiles rápidos, plantillas y rentabilidad

1. Cuando una publicación de una categoría local ya quedó correcta, en **Ficha técnica** pulsa **Crear perfil rápido**. Guarda la categoría de Mercado Libre, características, unidades de seguridad y utilidad objetivo para próximos productos de esa categoría local.
2. En un producto futuro de la misma categoría, el perfil se aplica como propuesta automáticamente. Revisa cada valor: un producto puede necesitar otra categoría, foto de portada, característica o precio.
3. Si el perfil ya no sirve, modifica los valores y pulsa **Actualizar perfil rápido**. El cambio solo afecta propuestas futuras; no cambia publicaciones existentes.
4. **Guardar ficha técnica** conserva una plantilla para la categoría exacta de Mercado Libre. Úsala cuando necesites repetir una ficha, incluso si no quieres que se aplique automáticamente por categoría local.
5. La **utilidad objetivo** es una guía. El cálculo usa el costo de compra, la comisión estimada actual y el envío estimado cuando P de Papel decidió pagarlo; no sustituye la liquidación real de una venta. Si falta peso o dimensiones, Administración no sugiere un precio que pudiera ocultar el costo del envío.
6. En la fila de la publicación, pulsa **Revisar contenido** para recibir una lista de verificación. No cambia el producto ni publica nada; corrige lo necesario desde **Editar**.

### Acciones masivas de publicaciones

1. Marca las publicaciones en la tabla (la casilla de cada fila o la del encabezado). Aparece la barra de selección con la acción y **Aplicar de forma segura**; el tope es 20 por tanda y la barra lo avisa antes de confirmar.
2. Elige la acción: publicar borradores, sincronizar stock/precios/contenido, pausar o activar.
3. Confirma. P de Papel la envía a la cola con reintentos para no dejar acciones a medio camino.
4. Cada fila muestra su resultado: «Programada en segundo plano» o el motivo por el que se omitió (por ejemplo «Solo se publican borradores o publicaciones con error», «Ya se está enviando a Mercado Libre», «Solo se pausan publicaciones activas»). Publicar solo acepta borradores o publicaciones con error sin un rechazo pendiente de Mercado Libre; pausar solo lo activo y activar solo lo pausado.

## La tabla de publicaciones

- Busca por producto, SKU o id de Mercado Libre; filtra por estado; ordena por precio o stock; 25 filas por página. En el celular cada fila es una tarjeta.
- Las **señales** de cada fila dicen lo que antes había que abrir para saber: rechazo de Mercado Libre (paso y campo), venta bajo costo autorizada, si el stock y el precio se sincronizan desde el panel, cantidad de fotos, envío gratis, si fue importada, moneda distinta de pesos y publicaciones de catálogo. **Stock** muestra las unidades para publicar (stock local menos reserva) y, si difiere, lo que Mercado Libre tiene.
- Acciones por fila: **Editar** y **Publicar** a la vista; en el menú **Más acciones**: ver en Mercado Libre, revisar contenido, revisar calidad, sincronizar contenido, pausar o activar (también por fila, sin pasar por la selección) y eliminar borrador.
- **Revisar calidad** y **Revisar contenido** abren un panel lateral con la puntuación, las acciones pendientes, el recordatorio de clip y la revisión local; desde ahí se actualizan sin cerrar la tabla.
- Las recargas después de una acción no borran la selección ni cierran el panel. Los mensajes de éxito y de error aparecen arriba de la tabla y se cierran al actuar de nuevo.

## Actualizar una publicación activa

1. Pulsa **Editar** para modificar el precio, la reserva de seguridad, las fotos elegidas o la ficha técnica guardada en P de Papel. Si otra pestaña cambió la misma publicación mientras editabas, el guardado responde «La publicación cambió mientras la editabas»: recarga la lista y repite el cambio.
2. Guarda los cambios. Si la casilla de sincronización de precio está activa, el nuevo precio se envía de manera segura a Mercado Libre. Un cambio de categoría, fotos, ficha técnica o nombre de familia programa una sincronización de contenido, y un cambio de reserva de seguridad programa una de stock: la publicación de Mercado Libre ya no queda distinta a la del panel. Editar una publicación activa exige el procesamiento seguro activo.
3. Al editar justo el dato que Mercado Libre rechazó, el rechazo guardado se borra y el asistente deja de abrir en ese paso.
4. **Sincronizar contenido** sigue disponible para reenviar fotos, descripción y características a demanda. Si la sincronización falla, la fila muestra el motivo en rojo hasta que se resuelva.
5. **Revisar calidad** muestra oportunidades y advertencias que Mercado Libre reporta. No corrige información automáticamente. Abrir **Condiciones de venta** (cuotas y envío) solo consulta; nada se guarda hasta confirmar un cambio, y el modo de envío que se guarda es el real de Mercado Libre.

## Centro de operaciones

Después de reconectar Mercado Libre y activar los tópicos, abre **Ventas → Mercado Libre → Centro de operaciones**:

1. **Preguntas:** pulsa **Actualizar preguntas**, revisa el borrador sugerido, edítalo y pulsa **Enviar respuesta**. Nunca se responde solo.
2. **Envíos y despachos:** revisa los envíos que Mercado Libre marca como listos. P de Papel los vincula con su venta usando los ítems que Mercado Libre reporta para cada paquete; nunca descuenta existencias al recibir este aviso. Prepara o despacha desde Mercado Libre; este panel no compra guías ni cambia la logística.
3. **Reclamos:** abre el caso en Mercado Libre y toma la decisión allí. P de Papel no devuelve dinero ni suma stock por un reclamo o una devolución sin confirmar el retorno físico.
4. **Ganancia real:** muestra por publicación el neto que Mercado Libre liquidó, menos el costo de compra registrado en P de Papel. Una venta sin liquidación sigue como pendiente y no se usa como ingreso real. La tabla muestra 20 publicaciones y ofrece ver el resto.
5. Recibirás un correo diario si hay publicaciones con error, poco stock frente al colchón, preguntas, envíos por despachar, reclamos o alertas de margen. La revisión se ejecuta desde un flujo programado de GitHub, separado de los dos cron de Vercel. Es un recordatorio para revisar; no ejecuta cambios automáticos ni puede interrumpir la actualización de ofertas.

## Importar publicaciones existentes

Usa este proceso para publicaciones que ya existían en Mercado Libre antes de activar la integración. No crea productos, no cambia precios y no modifica inventario hasta la confirmación final.

1. Abre **Ventas** → **Mercado Libre** → **Publicaciones**.
2. Pulsa **Importar existentes**. La revisión solo consulta Mercado Libre; todavía no cambia nada. Los detalles se leen de a 20 publicaciones y tres tandas a la vez; si Mercado Libre no responde por alguna tanda, la lista se muestra igual con el aviso «Mercado Libre no respondió por N publicaciones» para volver a revisar en unos minutos.
3. Revisa cada publicación:
   - Si tiene el mismo SKU que un producto local, P de Papel propone el vínculo automáticamente.
   - Si aparece **Sin SKU** o no reconoce el SKU, usa el selector **Producto local** para elegir manualmente el producto correcto.
   - Si ya está vinculada, no la selecciones otra vez.
   - Un producto local solo puede vincularse una vez. Si varias publicaciones tienen el mismo SKU, deja marcada únicamente la publicación que corresponde a ese producto y revisa las demás manualmente.
   - Si el producto elegido ya tiene un **borrador** en Administración, la fila lo dice y no se puede marcar hasta aceptar **Reemplazar el borrador**: la publicación de Mercado Libre pasa a ocupar ese borrador (su reserva de seguridad se conserva).
   - Los avisos en ámbar no bloquean pero importan: publicación en otra moneda (el panel muestra el precio como pesos), publicación de catálogo (Mercado Libre controla el precio) y publicaciones en revisión o con pago pendiente (quedan pausadas con su nota, ya no en error).
4. Marca solo las publicaciones correctas y pulsa **Vincular y sincronizar**. Confirma la acción. La vinculación vuelve a leer únicamente las publicaciones elegidas (no toda la cuenta) y, si alguna cambió o ya no existe, lo dice con su nombre e id.
5. Al terminar, el panel lista las publicaciones vinculadas (y cuáles reemplazaron un borrador). Las activas o pausadas recibirán el stock local de P de Papel. Las cerradas quedan registradas, pero no se actualiza su stock.
6. Revisa el precio y la reserva de seguridad de cada publicación importada. El precio importado se conserva como referencia exclusiva de Mercado Libre y nunca altera el de la tienda.

Si aparece un aviso de que un producto local fue elegido varias veces, no es una falla de Mercado Libre: desmarca los vínculos repetidos. Cada publicación o variación necesita su propio producto local para que el stock pueda sincronizarse correctamente.

## La pestaña Ventas

**Ventas → Mercado Libre → Ventas** lista todas las ventas sincronizadas o importadas con vistas en la URL (`?vista=`): **Por atender** (excepciones de inventario, retornos por confirmar y liquidaciones pendientes), **Pagadas**, **Canceladas y reembolsos** y **Todas**. Cada fila muestra el estado de la venta, el estado del inventario con su motivo, lo cobrado, los cargos (o «—» mientras no se conozcan), el neto y de dónde salió ese neto (confirmado por Mercado Libre, liberado, pendiente o ingresado a mano al importar).

Acciones por fila:

- **Re-sincronizar** (venta pagada con «Inventario con excepción» o sin aplicar): vuelve a leer la venta en Mercado Libre, la relaciona con las publicaciones de hoy y aplica el inventario una sola vez. Primero lee, luego libera la excepción: si Mercado Libre no responde, la venta sigue marcada como excepción.
- **Confirmar retorno físico** (venta cancelada o reembolsada con «Retorno físico pendiente»): devuelve cada unidad al inventario por el mismo helper del kardex que usan los pedidos (los kits devuelven componentes), deja la venta como «Inventario devuelto», reenvía el stock a Mercado Libre y, si alguna línea no pudo entrar, la deja como incidencia en **Movimientos de inventario**. `POST /api/[storeId]/marketplaces/mercadolibre/orders/[externalOrderId]/restock`.

El enlace del correo de salud (`?order=<id>`) muestra esa venta destacada arriba de la lista aunque no esté en la página visible.

### Reembolsos y estados

La sincronización lee los pagos de la orden. Si Mercado Libre mantiene la orden como `paid` pero devolvió dinero, la venta sigue **Pagada** con el monto reembolsado registrado y el neto se recalcula. `partially_refunded` se guarda como **Reembolso parcial** (sigue siendo ingreso por su neto real). `pending_cancel` y un contracargo se guardan como **Reembolsada**: no es ingreso y, si el inventario ya se había descontado, queda pendiente de retorno físico como una cancelación. Todo reporte de dinero usa la misma lista de estados con ingreso (Pagada y Reembolso parcial), nunca «Pagada» a secas.

## Importar ventas anteriores

Usa este proceso solo para ventas hechas en Mercado Libre antes de activar esta integración. No es necesario crear un pedido manual en P de Papel. Una venta reciente que no descontó inventario se arregla con **Re-sincronizar** en su fila, no importándola.

1. En Mercado Libre abre el detalle de la venta y confirma que figure como **Pagada**.
2. Copia el número que aparece como **Venta #...**. Puede ser un pack que contiene una o más órdenes; P de Papel identificará las órdenes reales automáticamente.
3. En Administración abre **Ventas** → **Mercado Libre** → **Ventas** y baja hasta **Importar una venta anterior a la integración**.
4. Pega el número y pulsa **Revisar venta**. Esta acción no cambia inventario ni crea registros. Si la venta ya está registrada, la tarjeta lo dice y remite a **Re-sincronizar**.
5. Revisa que cada producto local sugerido sea el correcto y que el stock mostrado aún incluya las unidades vendidas (la tarjeta marca en rojo el stock insuficiente). Si ya descontaste esa venta manualmente, no la importes: evita descontar dos veces.
6. Pulsa **Traer cargos de Mercado Libre** (`GET …/historical-sales/financials`) para rellenar **Cargo por venta**, **Envío a cargo tuyo** e **Impuestos** desde la facturación; si aún no está publicada, cópialos del resumen de la venta. El sistema calcula el neto automáticamente.
7. Pulsa **Importar venta pagada** y confirma. La confirmación enumera lo que P de Papel hará una sola vez:
   - registra la orden real, el pack y los valores financieros, con el neto marcado como **ingresado a mano** (la sincronización nunca lo sobrescribe, pero tampoco lo verifica);
   - descuenta las unidades con un movimiento auditable (los kits descuentan componentes);
   - crea o vincula la publicación de Mercado Libre con el producto local, con sincronización de stock activa y sin reserva de seguridad;
   - programa la actualización del stock publicado en Mercado Libre.
8. La venta aparece en la lista de arriba. Una venta ya importada no puede descontarse otra vez.

Si aparece **Sin vínculo local**, el SKU de la publicación de Mercado Libre no coincide con el SKU del producto en P de Papel. Corrige el SKU en Mercado Libre o solicita soporte antes de conciliar; nunca adivines el producto.

## Reglas de inventario

- Los precios de Mercado Libre no modifican el precio ni las ofertas de `papeleriapdepapel.com`.
- Una venta confirmada descuenta inventario una sola vez y deja un movimiento auditable.
- Cada venta pagada nueva consulta el detalle de liquidación de Mercado Libre. P de Papel registra como ingreso el **neto para P de Papel**: valor cobrado al cliente menos cargos de Mercado Libre, envío subsidiado e impuestos aplicados.
- Si Mercado Libre todavía no publicó ese detalle, la venta muestra **Liquidación pendiente** y se reintenta de forma diferida. Nunca se presenta el valor bruto como ingreso de P de Papel.
- Cada venta pagada nueva genera un correo administrativo con un enlace directo a su registro en **Ventas de Mercado Libre** solo después de confirmar el neto. El enlace resalta la venta y sus productos locales vinculados.
- Si falta un vínculo del producto, falta stock o existe una condición insegura, la venta queda como excepción y no se descuenta parcialmente.
- Cuando Mercado Libre cancela una venta que todavía no se había despachado, el envío deja de mostrarse como listo para preparar y pasa a **Cancelado**. La cancelación (o un reembolso total) no repone automáticamente las unidades: la venta queda «Retorno físico pendiente» hasta que alguien pulse **Confirmar retorno físico** en la pestaña Ventas.
- La cantidad que se envía a Mercado Libre es el stock local leído en el momento de sincronizar, no el que tenía el evento al encolarse; si el stock cambió mientras se enviaba, el evento se vuelve a ejecutar en vez de darse por hecho.
- No publiques productos archivados, sin fotos, sin categoría o sin precio de Mercado Libre configurado.
