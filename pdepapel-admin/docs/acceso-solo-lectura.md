# Cuentas de solo lectura en el panel (fase 1)

Estado: **la infraestructura existe, todavía no hay ninguna pantalla ni ruta abierta a una cuenta de solo lectura.** Hoy el panel sigue siendo solo para la dueña de la tienda. Este documento describe cómo se representa el permiso y qué falta.

## Quién puede qué

| | Dueña | Solo lectura («viewer») |
|---|---|---|
| De dónde sale | `Store.userId` en la base | metadato público de Clerk |
| Escribir (POST/PUT/PATCH/DELETE, acciones de servidor) | sí | **nunca** |
| Leer | todo | solo lo que se abra en la fase 2 |

La propiedad de la tienda la decide siempre la base. El metadato de Clerk **no puede** convertir a nadie en dueña: un `role: "owner"` escrito a mano no concede nada.

## El metadato

En el panel de Clerk: **Users → la cuenta → Metadata → Public**, se escribe exactamente:

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
- `requireStoreRead(storeId)` → `{ userId, role }` para la dueña o para una cuenta de solo lectura con esa tienda permitida. Todavía **no** se usa en ninguna ruta.
- `getStoreAccess(storeId)` → lo mismo sin lanzar (`null` cuando no hay acceso); pensado para que las pantallas sepan si deben esconder lo que escribe.
- `requireAdminSession()` → datos del panel que no cuelgan de una tienda (por ejemplo, municipios DANE).
- `parsePanelMetadata(raw)` → valida la forma del metadato.

## Qué falta (fase 2)

1. Aplicar `requireStoreRead` a las lecturas que se clasifiquen como seguras, y dejar `requireStoreOwner` en las que devuelven costos, márgenes, datos personales, proveedores, impuestos, liquidaciones de Mercado Libre o ajustes de la tienda.
2. Depurar los campos sensibles de las lecturas que se abran (varias devuelven filas enteras de `Product` u `Order`, con `acqPrice` o el teléfono de la clienta).
3. En la interfaz: aviso «Solo lectura», menú sin las pantallas de escritura, formularios abiertos pero deshabilitados y un interceptor que convierta un 403 en un mensaje claro.

## Guardias automáticos

- `tests/unit/security/write-auth-scan.test.ts` falla si una ruta de escritura bajo `/api/[storeId]` o una acción de servidor con efectos deja de comprobar la propiedad. Las excepciones (tienda en línea, crones) están listadas con su motivo.
- `tests/unit/security/server-action-auth.test.ts` prueba, una por una, que cada carga de servidor rechaza sin sesión, rechaza a una sesión ajena y deja pasar a la dueña.
