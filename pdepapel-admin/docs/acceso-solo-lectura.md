# Cuentas de solo lectura en el panel (fase 1)

Estado: **fase 2 completa.** Una cuenta de solo lectura entra al panel, ve un aviso fijo de «Solo lectura», navega un menú sin las pantallas reservadas y consulta el catálogo, los pedidos, las ferias, los atributos, las promociones y el contenido **sin** el costo de compra ni los datos personales de las clientas. Todo lo que escribe sigue cerrado en el servidor.

## Quién puede qué

| | Dueña | Solo lectura («viewer») |
|---|---|---|
| De dónde sale | `Store.userId` en la base | metadato público de Clerk |
| Escribir (POST/PUT/PATCH/DELETE, acciones de servidor) | sí | **nunca** |
| Leer | todo | las 29 lecturas abiertas en la fase 1 |

La propiedad de la tienda la decide siempre la base. El metadato de Clerk **no puede** convertir a nadie en dueña: un `role: "owner"` escrito a mano no concede nada.

## Crear tiendas: solo con autorización explícita

Crear una tienda exige estar en `ADMIN_ALLOWED_USER_IDS` (`canCreateStore`).
**Tener una tienda ya no basta**: antes cualquier dueña podía crear tiendas
nuevas y lo único que lo impedía era que la lista estuviera vacía.

- `hasAdminAccess` **no cambió**: entrar al panel sigue siendo «tener una
  tienda o estar en la lista», así que cerrar la creación no deja a nadie
  fuera del panel.
- Sin la variable puesta, el panel funciona igual pero la opción «Crea una
  tienda» del selector no aparece y `POST /api/stores` responde 403.
- Crear una tienda pide confirmación con el nombre a la vista y deja una
  línea `[STORE_CREATED]` en los registros del servidor, además de lo que ya
  guarda la fila (`userId`, `createdAt`).

Para volver a habilitarla, en Vercel (proyecto `pdepapel-admin`, entorno
Production) se agrega `ADMIN_ALLOWED_USER_IDS` con el id de Clerk del dueño.

## Invitar sin tocar Clerk a mano

`/[storeId]/invitaciones` (Ajustes → Invitaciones) solo la ve y la abre quien
está en `ADMIN_ALLOWED_USER_IDS` y es dueño de esa tienda. Desde ahí se envía
una invitación de Clerk con el permiso ya puesto:

```
{ role: "viewer", allowedStoreIds: ["<storeId>", ...] }
```

Clerk copia ese metadato a la persona cuando acepta y se registra, así que
`requireStoreRead` la reconoce sin que nadie edite nada en el panel de Clerk.
La pantalla lista las pendientes y permite anularlas. No hay tabla propia: la
invitación vive en Clerk.

El correo lleva a `/aceptar-invitacion` **en el dominio del panel**, no a la
página de registro de la tienda. Esa ruta es pública en el middleware pero
exige el billete (`__clerk_ticket`) con forma válida y sin caducar; sin él
manda a iniciar sesión, para que no se convierta en un registro abierto (la
instancia de Clerk es compartida con la tienda y su registro es público).

## El metadato

Lo normal es **invitar desde el panel** (arriba), que lo escribe solo. A mano, en el panel de Clerk (**Users → la cuenta → Metadata → Public**), se escribe exactamente:

```json
{
  "role": "viewer",
  "allowedStoreIds": ["f23ee5bc-1f6f-4c10-9872-9e6217cc17fd"]
}
```

- `role`: `"owner"` o `"viewer"`. Cualquier otro valor deja la cuenta sin acceso.
- `allowedStoreIds`: lista de ids de tienda, en texto. Una cuenta de solo lectura únicamente ve las tiendas listadas.
- Cualquier desviación de esa forma (falta una clave, `allowedStoreIds` no es una lista, hay un número dentro, el rol está en mayúsculas) se trata como **sin acceso**. Se falla cerrado a propósito: el metadato lo escribe una persona a mano.

Para que el metadato llegue en el token de sesión, sin una consulta extra a Clerk por petición, conviene añadir en Clerk **Sessions → Customize session token** la plantilla:

```json
{ "metadata": "{{user.public_metadata}}" }
```

Sin esa plantilla todo sigue funcionando: el ayudante consulta la API de Clerk (`users.getUser`) cuando los claims no traen el metadato.

Las cuentas se crean a mano en Clerk (Users → Create user) con el correo de la persona. No hay creación de cuentas desde el panel y este repositorio nunca escribe metadatos.

## El ayudante

`lib/store-access.ts`:

- `requireStoreOwner(storeId)` → id de la dueña, o error 401/403. Es el guardia de **toda escritura** y de las lecturas sensibles.
- `requireStoreRead(storeId)` → `{ userId, role }` para la dueña o para una cuenta de solo lectura con esa tienda permitida. Es el guardia de las lecturas abiertas.
- `getStoreAccess(storeId)` → lo mismo sin lanzar (`null` cuando no hay acceso); pensado para que las pantallas sepan si deben esconder lo que escribe.
- `requireAdminSession()` → datos del panel que no cuelgan de una tienda (por ejemplo, municipios DANE).
- `parsePanelMetadata(raw)` → valida la forma del metadato.

## Qué está abierto hoy

Entran la dueña y la cuenta de solo lectura (29 lecturas):

- Catálogo y promociones: ofertas (lista, detalle y buscador de alcance), cupones (lista y detalle), preventas (lista y vista previa de liberación), portada (lista y detalle), publicaciones del bot de WhatsApp, cajas (lista y detalle), tamaños de paquete y plantilla de conciliación de inventario.
- Productos sin costos: búsqueda del punto de venta, videos de un producto, revisión previa al borrado, migración de catálogo, limpieza de imágenes de Cloudinary.
- Ferias: lista y búsqueda dentro de un evento.
- Mercado Libre sin dinero propio: estado de la conexión, categorías y sus atributos, preguntas, revisión de contenido y calidad de una publicación, y el resumen de publicidad (clics, inversión, CPC, ROAS).
- Operación: caché de cotizaciones de envío y caché DANE.

Las dos puertas del panel (`app/(root)/layout.tsx` y `app/(dashboard)/[storeId]/layout.tsx`) dejan pasar a la cuenta de solo lectura: la raíz la lleva a la primera tienda que tiene permitida y el armazón se pinta con esa tienda como única opción del selector.

Trece rutas de la lista original ya eran **públicas** (las consume la tienda en línea: categorías, colores, diseños, tamaños, tipos, publicaciones y productos). No se tocaron: ponerles autenticación habría tumbado la tienda.

## Qué ve y qué no (fase 2)

**Pantallas abiertas:** Inicio (sin la pestaña de inventario, que valora al costo, y **sin el nombre de ninguna clienta**), Pedidos, Productos, Atributos, Promociones, Contenido de la tienda, Ferias, Reseñas y el Manual.

**Pantallas abiertas y depuradas (2026-09-20):** Inventario (sin costo de compra, sin valor a costo, sin proveedor y sin la vista «Sin costo»), Envíos (sin el costo del despacho, sin la guía y sin la lista de recogida) y Preventas (sin el dinero recibido). En Clientes la cuenta de solo lectura ve **solo el agregado** —cuántos hay, cuántos compran, cuántos son VIP o están inactivos, y de qué ciudades vienen—: la lista con nombre y teléfono no se depura, porque el identificador de cada fila **es** el teléfono normalizado y va en la URL de `/clientes/[customerId]`.

**Pantallas reservadas**, escondidas del menú: Punto de venta, Clientes (la lista y el detalle), Mercado Libre, Conversaciones, Proveedores, Movimientos, Aprovisionamiento, Boletín, Rendimiento (y sus dos gemelas `/negocio` e `/inteligencia-negocio`), Tributarios y Ajustes. Si alguien entra por la URL, `app/(dashboard)/[storeId]/error.tsx` explica que la pantalla es solo para la dueña, dentro del panel y sin parecer una falla.

> **Esconder del menú no es cerrar la pantalla.** La bandera `ownerOnly` solo quita el enlace: quien escriba la URL llega igual, y lo que decide es el guardia del cargador. La auditoría de Movimientos (2026-09-19) encontró que ese módulo no tenía ninguno, así que una cuenta de solo lectura podía leer el kardex entero con el costo de compra, el precio de venta y el nombre y el correo de la clienta de cada pedido. Corregido: `getInventoryMovements`, `getProductKardex`, las dos páginas y `GET /inventory/reconciliation-template` exigen `requireStoreOwner`, y `tests/unit/security/movimientos-owner-only.test.ts` falla si alguien agrega otra carga al módulo sin el guardia. Al revisar cualquier otra pantalla reservada, comprobar el cargador, no el menú.
>
> **Segundo caso, mismo patrón: Aprovisionamiento (2026-09-20).** Ni el cargador ni las dos páginas comprobaban nada, mientras `GET /api/[storeId]/restock-orders` ya se reservaba «por costos de compra» en dos pruebas: la pantalla enseñaba el costo unitario, el costo puesto en bodega y el margen que la API negaba. Corregido igual: `getRestockOrders` y las dos páginas exigen `requireStoreOwner`, los controles que escriben pasan por `useCanWrite`, y `tests/unit/security/aprovisionamiento-owner-only.test.ts` repite el escaneo del módulo. Que aparezca dos veces sugiere revisar de una vez el resto de las reservadas.
>
> **Barrido completo con el navegador (2026-09-20).** Se recorrieron todas las pantallas reservadas con una sesión de solo lectura de verdad, y el barrido a ojo había fallado en las **dos** direcciones: dio por cerrado **Rendimiento** —el guardia existía, pero solo en la pestaña de Envíos, y «Resumen y caja» enseñaba ventas netas, utilidad operativa y el retiro personal sugerido— y dio por abierto **Boletín**, que sí estaba cerrado con el ayudante antiguo `verifyStoreOwner`. Además aparecieron dos filtraciones que ningún grep por archivo había visto: el **detalle de una conversación** (teléfono, nombre y el hilo entero) y la **lista de clientas anteriores** del formulario de pedido (nombre, correo, teléfono y documento). Y `/negocio` e `/inteligencia-negocio` servían el mismo resumen de caja que Rendimiento, cada una en su propia URL. Desde entonces `tests/unit/security/read-auth-scan.test.ts` exige que toda carga del panel que consulte la base diga a quién deja entrar, con una lista de excepciones que lleva el motivo escrito.

> **Tercer barrido: Portada y finanzas (2026-09-21).** La pantalla de inicio no tenía guardia, ni ella ni sus cuatro cargadores: `getStoreAccess` solo decidía si se pintaba la pestaña de inventario. Que una cuenta de solo lectura vea las **ventas** es a propósito y sigue igual; lo que no lo era es que viera **el nombre de cada clienta** en la línea de los pendientes (`fullName` está en la lista que borra `scrubOrder`, y Clientes se lo esconde). Corregido en el punto de la consulta: los cuatro cargadores exigen `requireStoreRead`, y `buildTodaySummary` recibe el papel y **no escribe** el nombre cuando quien mira no puede verlo —no se depura después, no se construye—. **Tributarios** estaba abierta por URL: el menú la escondía y nada más; ahora `getTaxReadiness` y su página exigen `requireStoreOwner`.
>
> **Y por qué el barrido anterior no lo vio.** `read-auth-scan.test.ts` daba por guardada una carga si *cualquier archivo de su cadena de imports* nombraba una guardia —y `lib/store-access.ts` y `lib/utils.ts` son donde las guardias se **escriben**, importadas por medio panel por un `cn()`—. Eran **7 de 100 cargas** pasando por cercanía. Desde ahora el archivo que declara una guardia es fontanería y no avala a nadie; `configuracion/cloudinary` y `productos/opciones` quedaron como excepciones declaradas con el mecanismo `client-shell`, que la prueba comprueba (no consultan la base ni esperan a ningún cargador).

**Qué se recorta** (`lib/viewer-payloads.ts`, una sola lista para todas las lecturas):

| Dato | Se quita |
|---|---|
| Producto | `acqPrice`, `transportationCost`, `supplierId`, `supplier`, `abcClassification`, `soldCount` |
| Pedido | nombre, correo, teléfono, dirección, barrio, código DANE, documento, empresa, `totalProductCost`, `netProfit`, `gatewayFee`, `profitMarginPct`, notas internas. **La ciudad y el departamento sí se ven**: dicen de dónde vienen las ventas y solos no identifican a nadie |
| Mercado Libre | `buyerName`, `trackingNumber`, `minimumMarginAmount` |
| Feeds | la URL del feed, que lleva el secreto |
| Reseña | `userId` y la moderación; **el nombre de quien reseña se conserva**, porque ya se ve en la tienda |
| Inventario | `acqPrice`, `transportationCost`, `lastCost`, `lastCostSource`, `lastCostAt`, `supplier`. **Las unidades y las señales de reposición sí se ven**: es lo que sirve para planear una campaña |
| Envío | `cost`, la guía (`trackingCode`, `trackingUrl`, `labelUrl`) y quién recibe. Con el número de guía se consulta el nombre y la dirección en la página de la transportadora, así que se trata como dato personal |
| Preventa | `amountReceived`, `depositAmount` y el total cobrado: es plata de las clientas que la tienda todavía debe |

**Controles que escriben:** apagados o escondidos con `useCanWrite()`. El aviso, el menú, la barra del teléfono, la barra de acciones masivas, las confirmaciones, la cabecera de los formularios, el botón «Nuevo pedido» de la barra superior, los «Nuevo …» de cada lista, el menú de fila de atributos y el botón de WhatsApp responden a ese mismo dato.

**Red de seguridad del navegador:** `ReadOnlyGuard` corta las peticiones que escriben y avisa, **por axios y por `fetch`**. Es comodidad, no seguridad: el servidor rechaza igual. Antes solo cubría axios, y el aviso prometía que «los botones que crean, editan o borran están apagados» mientras Mercado Libre, Envíos y Ajustes seguían escribiendo con `fetch`: el botón «Conectar Mercado Libre» estaba vivo debajo del aviso. Solo se interceptan las peticiones a `/api/` de este mismo origen; las de Next —navegación RSC y acciones de servidor— pasan intactas.

## Qué falta

1. **Mercado Libre sigue pendiente.** El menú la esconde, pero la pantalla carga igual para una cuenta de solo lectura y no tiene depurador propio: el resumen de caja de Mercado Libre enseña dinero. Es el mismo patrón de Movimientos y Aprovisionamiento, todavía sin cerrar, y está fuera del lote de la fase 2 a propósito.
2. Las 24 lecturas reservadas siguen siendo solo de la dueña a propósito (ajustes con cuentas bancarias, proveedores, impuestos, liquidaciones de Mercado Libre, costos de compra, datos de clientas). Abrir alguna exige depurarla primero.
3. Cola larga de la interfaz: quedan tarjetas y menús de fila que todavía dicen «Editar» y llevan a un formulario que ya está apagado. No deja escribir nada, pero se lee raro.
4. Revisar si la lista de tiendas del selector debe mostrar todas las permitidas cuando una cuenta tenga más de una.

## Guardias automáticos

- `tests/unit/security/write-auth-scan.test.ts` falla si una ruta de escritura bajo `/api/[storeId]` o una acción de servidor con efectos deja de comprobar la propiedad. Las excepciones (tienda en línea, crones) están listadas con su motivo.
- `tests/unit/security/server-action-auth.test.ts` prueba, una por una, que cada carga de servidor rechaza sin sesión, rechaza a una sesión ajena y deja pasar a la dueña.
- `tests/unit/security/read-access-routes.test.ts` prueba las 29 lecturas abiertas (dueña, cuenta de solo lectura, cuenta de otra tienda y sin sesión) y comprueba que seis lecturas reservadas siguen respondiendo 403 a una cuenta de solo lectura.
- `tests/unit/security/layout-access.test.tsx` cubre las dos puertas del panel.
- `tests/integration/store-read-access.test.ts` repite la comprobación contra MySQL local, con el guardia real y sin ayudantes simulados.
