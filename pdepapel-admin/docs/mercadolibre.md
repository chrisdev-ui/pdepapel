# Configuración de Mercado Libre

Esta guía se ejecuta en orden. P de Papel conserva el inventario como fuente de verdad: Mercado Libre recibe el stock local menos el colchón de seguridad definido para cada publicación.

No compartas en chat, correo ni capturas el `Client Secret`, los tokens de QStash ni la llave de cifrado.

## 1. Crear la aplicación de Mercado Libre

1. Abre [Mis aplicaciones de Mercado Libre](https://applications.mercadolibre.com/) e inicia sesión con la **cuenta vendedora principal de P de Papel**. No uses una cuenta personal de desarrollador, un colaborador u operador.
2. Confirma que la cuenta corresponde a Colombia. La integración solo acepta vendedores del sitio `MCO`.
3. En **Mis aplicaciones**, pulsa **Crear nueva aplicación**.
4. Completa el formulario así:

   | Campo | Valor que debes usar |
   | --- | --- |
   | Nombre | `P de Papel Mercado Libre` |
   | Nombre corto, si aparece | `pdepapel-ml` |
   | Descripción | `Conecta el catálogo de P de Papel con Mercado Libre Colombia para publicar productos y sincronizar ventas e inventario.` |
   | Logo | Escoge el logo oficial de P de Papel en versión cuadrada. Usa PNG o JPG nítido y sigue el tamaño que indique el formulario. |
   | Sitio web, si aparece | `https://papeleriapdepapel.com` |

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

   | Permiso | Nivel |
   | --- | --- |
   | Usuarios | **Lectura** |
   | Comunicaciones pre y post ventas | **Sin acceso** |
   | Publicación y sincronización | **Lectura y escritura** |
   | Publicidad de un producto | **Sin acceso** |
   | Facturación de una venta | **Sin acceso** |
   | Métricas del negocio | **Sin acceso** |
   | Promociones, cupones y descuentos de una venta | **Sin acceso** |
   | Venta y envíos de un producto | **Lectura** |

   No selecciones lectura y escritura para todo: la integración solo publica y actualiza productos, y consulta órdenes confirmadas.
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

   | Nombre | Valor | Sensible |
   | --- | --- | --- |
   | `MERCADOLIBRE_CLIENT_ID` | APP ID de Mercado Libre | Sí |
   | `MERCADOLIBRE_CLIENT_SECRET` | Client Secret de Mercado Libre | Sí |
   | `MERCADOLIBRE_OAUTH_REDIRECT_URI` | `https://admin.papeleriapdepapel.com/api/integrations/mercadolibre/callback` | No |
   | `MERCADOLIBRE_TOKEN_ENCRYPTION_KEY` | Resultado del comando `openssl` | Sí |
   | `QSTASH_TOKEN` | Token de Quickstart de QStash | Sí |
   | `QSTASH_CURRENT_SIGNING_KEY` | Clave actual de QStash | Sí |
   | `QSTASH_NEXT_SIGNING_KEY` | Clave siguiente de QStash | Sí |
   | `ADMIN_WEB_URL` | `https://admin.papeleriapdepapel.com` | No |

4. Si `ADMIN_WEB_URL` ya existe, verifica que sea exactamente `https://admin.papeleriapdepapel.com`.
5. Guarda cada variable. Los cambios de variables solo se aplican en un despliegue nuevo.

## 5. Desplegar y activar

1. Antes de desplegar, aplica el esquema Prisma a Railway. El despliegue no crea las tablas automáticamente.
2. Confirma que el despliegue de producción terminó correctamente.
3. Inicia sesión en [Administración](https://admin.papeleriapdepapel.com), abre **Ventas** → **Mercado Libre**.
4. Comprueba que no aparezca el aviso de variables faltantes.
5. Pulsa **Conectar Mercado Libre**.
6. Inicia sesión con la cuenta vendedora principal de P de Papel, no con un operador o colaborador, y acepta los permisos solicitados.
7. Al volver al panel, confirma que el estado diga **Conectada**.
8. Pulsa **Activar procesamiento seguro** y espera el mensaje de confirmación. Esto crea una recuperación automática cada cinco minutos.

## 6. Activar notificaciones de ventas

Haz este paso únicamente después de terminar la sección anterior.

1. Vuelve a [Mis aplicaciones de Mercado Libre](https://applications.mercadolibre.com/).
2. Abre **Configurar** en `P de Papel Mercado Libre`.
3. En **Configuraciones de notificaciones**, pega esta URL exacta:

   ```
   https://admin.papeleriapdepapel.com/api/webhook/mercadolibre
   ```

4. En tópicos, abre **Orders / Órdenes** y activa solo **`orders_v2`**.
5. No actives por ahora `payments`, `items`, `shipments`, `messages`, `questions` ni otros temas: todavía no forman parte del flujo automático.
6. Guarda los cambios.

La notificación no descuenta inventario por sí misma. P de Papel consulta la orden autenticada en Mercado Libre y solo descuenta una vez cuando el estado real es `paid`.

## 7. Validación inicial sin afectar ventas ni existencias

1. No publiques ni compres productos reales todavía.
2. Verifica que Mercado Libre muestre la cuenta como conectada y que QStash muestre el schedule creado por P de Papel.
3. No hagas una venta entre usuarios de prueba conectada a la tienda de producción: una orden de prueba vinculada a un producto real descontaría el stock real por diseño.
4. Para una prueba de compra completa, usa una tienda y base de datos de pruebas separadas, conectadas a un vendedor y comprador de prueba de Mercado Libre. Mercado Libre indica que las pruebas se hacen exclusivamente entre usuarios de prueba, no con cuentas personales.
5. Cuando se apruebe la primera publicación real, crea primero un **borrador** en Administración y revísalo manualmente antes de pulsar **Publicar**.

## Preparar una publicación real

1. Abre **Ventas** → **Mercado Libre** y pulsa **Nuevo borrador**.
2. Escoge el producto local. El precio de la tienda es una referencia: define un precio de Mercado Libre que cubra comisión, envío y margen.
3. Define un colchón de seguridad. Ejemplo: con stock local de 5 y colchón de 1, Mercado Libre mostrará máximo 4 unidades.
4. Pulsa **Sugerir categoría** y elige una propuesta. La selección siempre requiere revisión humana; nunca se publica automáticamente en catálogo.
5. Si Mercado Libre solicita características, agrégalas una por línea como `CODIGO=Valor`. Marca, MPN y GTIN se agregan si ya existen en el producto.
6. Revisa precio, fotos, categoría y stock. Pulsa **Publicar** y confirma la acción.

## Reglas de inventario

- Los precios de Mercado Libre no modifican el precio ni las ofertas de `papeleriapdepapel.com`.
- Una venta confirmada descuenta inventario una sola vez y deja un movimiento auditable.
- Si falta un vínculo del producto, falta stock o existe una condición insegura, la venta queda como excepción y no se descuenta parcialmente.
- Una cancelación de Mercado Libre no repone automáticamente las unidades. El administrador debe confirmar el retorno físico antes de registrar un movimiento de devolución.
- No publiques productos archivados, sin fotos, sin categoría o sin precio de Mercado Libre configurado.
