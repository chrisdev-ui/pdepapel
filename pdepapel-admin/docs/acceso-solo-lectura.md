# Cuentas de solo lectura en el panel (fase 1)

Estado: **fase 1 completa.** Una cuenta de solo lectura ya entra al panel y puede consultar 29 lecturas que no exponen dinero ni datos personales. Todo lo que escribe sigue cerrado, y las lecturas sensibles también. Falta la fase 2: esconder en la interfaz lo que esa cuenta no puede usar y depurar campos de las lecturas que se abran después.

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

## Qué falta (fase 2)

1. Depurar los campos sensibles de las lecturas reservadas para poder abrirlas (varias devuelven filas enteras de `Product` u `Order`, con `acqPrice` o el teléfono de la clienta).
2. En la interfaz: aviso «Solo lectura», menú sin las pantallas de escritura, formularios abiertos pero deshabilitados y un interceptor que convierta un 403 en un mensaje claro. **Hoy una cuenta de solo lectura que navegue a una pantalla reservada ve un 403 crudo**: es un hueco conocido y aceptado de la fase 1.
3. Revisar si la lista de tiendas del selector debe mostrar todas las permitidas cuando una cuenta tenga más de una.

## Guardias automáticos

- `tests/unit/security/write-auth-scan.test.ts` falla si una ruta de escritura bajo `/api/[storeId]` o una acción de servidor con efectos deja de comprobar la propiedad. Las excepciones (tienda en línea, crones) están listadas con su motivo.
- `tests/unit/security/server-action-auth.test.ts` prueba, una por una, que cada carga de servidor rechaza sin sesión, rechaza a una sesión ajena y deja pasar a la dueña.
- `tests/unit/security/read-access-routes.test.ts` prueba las 29 lecturas abiertas (dueña, cuenta de solo lectura, cuenta de otra tienda y sin sesión) y comprueba que seis lecturas reservadas siguen respondiendo 403 a una cuenta de solo lectura.
- `tests/unit/security/layout-access.test.tsx` cubre las dos puertas del panel.
- `tests/integration/store-read-access.test.ts` repite la comprobación contra MySQL local, con el guardia real y sin ayudantes simulados.
