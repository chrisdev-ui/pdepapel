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

   | Permiso                                        | Nivel                   |
   | ---------------------------------------------- | ----------------------- |
   | Usuarios                                       | **Lectura**             |
   | Comunicaciones pre y post ventas               | **Lectura y escritura** |
   | Publicación y sincronización                   | **Lectura y escritura** |
   | Publicidad de un producto                      | **Lectura y escritura\*** |
   | Facturación de una venta                       | **Lectura**             |
   | Métricas del negocio                           | **Sin acceso**          |
   | Promociones, cupones y descuentos de una venta | **Sin acceso**          |
   | Venta y envíos de un producto                  | **Lectura**             |

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

QStash reintenta los trabajos. Si se agotan los intentos, conserva el mensaje en su DLQ y P de Papel registra el error para recuperarlo sin aplicar inventario dos veces.

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
8. Pulsa **Activar procesamiento seguro** y espera el mensaje de confirmación. Esto crea una recuperación automática cada cinco minutos.

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

La notificación no descuenta inventario por sí misma. P de Papel consulta la orden autenticada en Mercado Libre y solo descuenta una vez cuando el estado real es `paid`.

## 7. Validación inicial sin afectar ventas ni existencias

1. No publiques ni compres productos reales todavía.
2. Verifica que Mercado Libre muestre la cuenta como conectada y que QStash muestre el schedule creado por P de Papel.
3. No hagas una venta entre usuarios de prueba conectada a la tienda de producción: una orden de prueba vinculada a un producto real descontaría el stock real por diseño.
4. Para una prueba de compra completa, usa una tienda y base de datos de pruebas separadas, conectadas a un vendedor y comprador de prueba de Mercado Libre. Mercado Libre indica que las pruebas se hacen exclusivamente entre usuarios de prueba, no con cuentas personales.
5. Cuando se apruebe la primera publicación real, usa el último paso del asistente para guardarla como **borrador** o publicarla desde Administración después de revisarla.

## Preparar una publicación real

1. Abre **Ventas** → **Mercado Libre** y pulsa **Preparar publicación**.
2. En **Producto**, escoge el producto local. Si ya existe un perfil rápido para su categoría, el panel propone la categoría de Mercado Libre, la ficha técnica, las fotos del producto, el colchón de seguridad y un precio sugerido. Nada se publica ni queda bloqueado: revisa y edita cualquier valor.
3. Define o ajusta el precio de Mercado Libre. Cuando el perfil tiene costo de compra y utilidad objetivo, el valor sugerido busca cubrir el costo y esa utilidad después de la comisión estimada; envío, impuestos y descuentos posteriores pueden cambiar el neto real. El precio de la tienda es solo una referencia.
4. Si lo necesitas, abre **Ajustes de stock y precio**. Ejemplo: con stock local de 5 y seguridad de 1, Mercado Libre mostrará máximo 4 unidades. Deja activa la sincronización de precio solo si Administración debe mantener el precio de Mercado Libre.
5. En **Categoría y fotos**, pulsa **Sugerir categoría** y elige una propuesta. Marca solo las fotos que correspondan al artículo: la primera será la portada. Si falta una foto, agrégala primero desde **Productos**.
6. En **Ficha técnica**, el asistente carga los campos obligatorios de la categoría. Complétalos y usa una plantilla solo si aplica a este producto. Las características adicionales quedan disponibles para casos especiales con el formato `CODIGO=Valor`. Marca, MPN y GTIN se agregan si ya existen en el producto.
7. En **Revisar y publicar**, confirma producto, precio, categoría, fotos y stock disponible. Pulsa **Calcular comisión** para una estimación: no incluye envío, impuestos o descuentos posteriores y no reemplaza el valor contable real.
8. Elige **Guardar borrador** si quieres revisarlo después o **Publicar ahora** para enviarlo a Mercado Libre desde Administración. La publicación siempre pide confirmación antes de salir.

### Perfiles rápidos, plantillas y rentabilidad

1. Cuando una publicación de una categoría local ya quedó correcta, en **Ficha técnica** pulsa **Crear perfil rápido**. Guarda la categoría de Mercado Libre, características, unidades de seguridad y utilidad objetivo para próximos productos de esa categoría local.
2. En un producto futuro de la misma categoría, el perfil se aplica como propuesta automáticamente. Revisa cada valor: un producto puede necesitar otra categoría, foto de portada, característica o precio.
3. Si el perfil ya no sirve, modifica los valores y pulsa **Actualizar perfil rápido**. El cambio solo afecta propuestas futuras; no cambia publicaciones existentes.
4. **Guardar ficha técnica** conserva una plantilla para la categoría exacta de Mercado Libre. Úsala cuando necesites repetir una ficha, incluso si no quieres que se aplique automáticamente por categoría local.
5. La **utilidad objetivo** es una guía antes de envío e impuestos. El cálculo usa la comisión estimada actual de Mercado Libre y el costo de compra registrado; no sustituye la liquidación real de una venta.
6. Pulsa **Revisar contenido** para recibir una lista de verificación. No cambia el producto ni publica nada; corrige lo necesario desde **Editar**.

### Acciones masivas de publicaciones

1. Marca máximo 20 publicaciones en la lista.
2. Elige la acción: publicar borradores, sincronizar stock/precios/contenido, pausar o activar.
3. Pulsa **Aplicar de forma segura** y confirma. P de Papel la envía a una cola con reintentos para no dejar acciones a medio camino.
4. Espera la actualización de la lista. Si una publicación no cumplía la acción elegida, el panel la mantiene sin cambios y muestra el motivo.

## Actualizar una publicación activa

1. Pulsa **Editar** para modificar el precio, el colchón, las fotos elegidas o la ficha técnica guardada en P de Papel.
2. Guarda los cambios. Si la casilla de sincronización de precio está activa, el nuevo precio se envía de manera segura a Mercado Libre. No cambies esta casilla si el precio se gestiona manualmente allá.
3. Para actualizar fotos, descripción y características en Mercado Libre, pulsa **Sincronizar contenido** y confirma. Esta acción reemplaza esos tres elementos en Mercado Libre con la selección y los datos locales; nunca se ejecuta sola.
4. Pulsa **Revisar calidad** para ver oportunidades y advertencias que Mercado Libre reporta sobre fotos, atributos, título o condiciones de venta. No corrige información automáticamente: el administrador decide cada ajuste.

## Centro de operaciones

Después de reconectar Mercado Libre y activar los tópicos, abre **Ventas → Mercado Libre → Centro de operaciones**:

1. **Preguntas:** pulsa **Actualizar preguntas**, revisa el borrador sugerido, edítalo y pulsa **Enviar respuesta**. Nunca se responde solo.
2. **Envíos y despachos:** revisa los envíos que Mercado Libre marca como listos. P de Papel los vincula con su venta usando los ítems que Mercado Libre reporta para cada paquete; nunca descuenta existencias al recibir este aviso. Prepara o despacha desde Mercado Libre; este panel no compra guías ni cambia la logística.
3. **Reclamos:** abre el caso en Mercado Libre y toma la decisión allí. P de Papel no devuelve dinero ni suma stock por un reclamo o una devolución sin confirmar el retorno físico.
4. **Ganancia real:** muestra por publicación el neto que Mercado Libre liquidó, menos el costo de compra registrado en P de Papel. Una venta sin liquidación sigue como pendiente y no se usa como ingreso real.
5. Recibirás un correo diario si hay publicaciones con error, poco stock frente al colchón, preguntas, envíos por despachar, reclamos o alertas de margen. La revisión se ejecuta desde un flujo programado de GitHub, separado de los dos cron de Vercel. Es un recordatorio para revisar; no ejecuta cambios automáticos ni puede interrumpir la actualización de ofertas.

## Importar publicaciones existentes

Usa este proceso para publicaciones que ya existían en Mercado Libre antes de activar la integración. No crea productos, no cambia precios y no modifica inventario hasta la confirmación final.

1. Abre **Ventas** → **Mercado Libre** → **Publicaciones**.
2. Pulsa **Importar existentes**. La revisión solo consulta Mercado Libre; todavía no cambia nada.
3. Revisa cada publicación:
   - Si tiene el mismo SKU que un producto local, P de Papel propone el vínculo automáticamente.
   - Si aparece **Sin SKU** o no reconoce el SKU, usa el selector **Producto local** para elegir manualmente el producto correcto.
   - Si ya está vinculada, no la selecciones otra vez.
4. Marca solo las publicaciones correctas y pulsa **Vincular y sincronizar**. Confirma la acción.
5. Las publicaciones activas o pausadas recibirán el stock local de P de Papel. Las cerradas quedan registradas, pero no se actualiza su stock.
6. Revisa el precio y el colchón de seguridad de cada publicación importada. El precio importado se conserva como referencia exclusiva de Mercado Libre y nunca altera el de la tienda.

## Conciliar ventas anteriores

Usa este proceso para ventas hechas en Mercado Libre antes de activar esta integración. No es necesario crear un pedido manual en P de Papel.

1. En Mercado Libre abre el detalle de la venta y confirma que figure como **Pagada**.
2. Copia el número que aparece como **Venta #...**. Puede ser un pack que contiene una o más órdenes; P de Papel identificará las órdenes reales automáticamente.
3. En Administración abre **Ventas** → **Mercado Libre** → **Ventas de Mercado Libre**.
4. Pega el número y pulsa **Revisar venta**. Esta acción no cambia inventario ni crea registros.
5. Revisa que cada producto local sugerido sea el correcto y que el stock mostrado aún incluya las unidades vendidas. Si ya descontaste esa venta manualmente, no la concilies: evita descontar dos veces.
6. Copia del resumen de Mercado Libre los valores de **Cargos por venta**, **Envíos** e **Impuestos**. El sistema calcula el neto recibido automáticamente.
7. Pulsa **Conciliar venta pagada** y confirma. P de Papel hará una sola vez lo siguiente:
   - registra la orden real, el pack y los valores financieros;
   - descuenta las unidades con un movimiento auditable;
   - vincula la publicación existente de Mercado Libre con el producto local;
   - programa la actualización del stock publicado en Mercado Libre.
8. Revisa la sección **Ventas registradas**. Una venta ya conciliada no puede descontarse otra vez.

Si aparece **Sin vínculo local**, el SKU de la publicación de Mercado Libre no coincide con el SKU del producto en P de Papel. Corrige el SKU en Mercado Libre o solicita soporte antes de conciliar; nunca adivines el producto.

## Reglas de inventario

- Los precios de Mercado Libre no modifican el precio ni las ofertas de `papeleriapdepapel.com`.
- Una venta confirmada descuenta inventario una sola vez y deja un movimiento auditable.
- Cada venta pagada nueva consulta el detalle de liquidación de Mercado Libre. P de Papel registra como ingreso el **neto para P de Papel**: valor cobrado al cliente menos cargos de Mercado Libre, envío subsidiado e impuestos aplicados.
- Si Mercado Libre todavía no publicó ese detalle, la venta muestra **Liquidación pendiente** y se reintenta de forma diferida. Nunca se presenta el valor bruto como ingreso de P de Papel.
- Cada venta pagada nueva genera un correo administrativo con un enlace directo a su registro en **Ventas de Mercado Libre** solo después de confirmar el neto. El enlace resalta la venta y sus productos locales vinculados.
- Si falta un vínculo del producto, falta stock o existe una condición insegura, la venta queda como excepción y no se descuenta parcialmente.
- Una cancelación de Mercado Libre no repone automáticamente las unidades. El administrador debe confirmar el retorno físico antes de registrar un movimiento de devolución.
- No publiques productos archivados, sin fotos, sin categoría o sin precio de Mercado Libre configurado.
