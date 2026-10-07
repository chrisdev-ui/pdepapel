# Incidente: el correo de un pedido nuevo no salió (2026-10-07)

## Qué pasó

- **Pedido:** `ORD-1791380325794-318` (id `40ac0651-0d47-4680-bbf4-11f45eb45bb5`). Creado por el checkout de la tienda el 2026-10-07 a las 13:38:45 UTC (08:38 en Bogotá), por transferencia bancaria, en PENDING, de una clienta invitada.
- **No salió ningún correo:** ni el aviso al admin (`[Admin] Pedido #… - Pendiente`) ni la confirmación a la clienta.

## Causa raíz

El checkout mandaba el correo en un `setImmediate`, programado antes de responder y que Vercel **no espera**. A esa hora no había tráfico: después de responder, la instancia se congeló con el envío a Resend a medias. Lo retomó casi dos minutos después, cuando llegó otra petición, y la conexión TLS ya estaba muerta.

**Evidencia:**
- **Registro de Vercel**, despliegue `dpl_FitwPHSa…`, región `iad1`: a las 13:40:35 UTC, dentro de una petición sin relación (`GET /api/<store>/products/notas-rayadas`, `request=lvfzb-1791380435131-…`), aparece `Error sending email: TypeError: fetch failed … Client network socket disconnected before secure TLS connection was established · ECONNRESET · api.resend.com`.
- **`FailedNotification`:** una fila `EMAIL · order:PENDING · 40ac0651… · 2026-10-07T13:40:35Z · "TypeError: fetch failed"`. Era la única desde que la tabla existe (2026-09-14): 1 de 27 pedidos desde el 15 de septiembre.

**Por qué también se perdió el de la clienta:** `sendOrderEmail` mandaba primero el del admin y después el de la clienta en el mismo `try`; el primer fallo cortó el segundo.

**Otro hueco encontrado:** el SDK `resend` 2.1.0 no lanza ante un error de la API, devuelve `{ error }`, y eso pasaba como enviado.

**No tuvo que ver con los cambios del día**, uno por uno:
- el corte de la base (07:21);
- la `DATABASE_URL` de Preview;
- los deploys de 08:00, 08:03, 08:26 y 08:29;
- el pool de conexiones;
- la guarda `--expect`;
- el corte de la integración y el retiro del proxy viejo (posteriores).

El patrón existía desde junio de 2025 y solo falla cuando la instancia se queda sin tráfico justo después de responder.

## Alcance

**Había 12 `setImmediate`** en checkout, pedidos y los webhooks de Bold, Wompi y EnvioClick:
- 6 con `sendOrderEmail`;
- 1 con `sendShippingEmail`;
- 3 con `createGuideForOrder`, la guía de EnvioClick, que también podía perderse en silencio.

## Arreglo

- **`runInBackground`** (`lib/background.ts`): pasa la promesa a `waitUntil` de `@vercel/functions`, así la función vive hasta que termina, dentro de su `maxDuration` de 60 s.
  - Ya no queda ningún `setImmediate` en `app/api` ni en `lib`, y una prueba lo vigila.
- **`lib/email-delivery.ts`:**
  - el admin y la clienta se mandan por separado (`Promise.allSettled`);
  - un `{ error }` de Resend cuenta como fallo;
  - hay hasta dos reintentos (≈1 s y ≈3 s) ante fallos de red, 429 o 5xx, nunca ante un 4xx de validación;
  - cada destinatario que no recibe su correo deja su fila en `FailedNotification`, con el rol (`admin`/`customer`) y nunca la dirección.
- **Barrido** `/api/cron/notification-retry` (`lib/notification-retry.ts`), desde «Admin scheduled tasks»:
  - reenvía los correos de las últimas 48 h, hasta 4 intentos por pedido, tipo y rol;
  - toma cada fila con un único `UPDATE … WHERE resolvedAt IS NULL`, así dos corridas nunca mandan dos veces;
  - no manda un aviso viejo si el pedido ya cambió de estado.
  - No hubo cambio de esquema.
  - El SDK 2.1.0 no admite clave de idempotencia y subir a 6.x cambia el renderizado de React Email; por eso el bloqueo es por fila.
- **Guías** (`lib/guide-background.ts`):
  - si fallan, el motivo queda en `Shipping.guideError` y `guideAttemptedAt`, que el panel muestra en el bloque de la guía del pedido, y además una fila `GUIDE` en `FailedNotification`;
  - **nunca se reintentan solas**, porque se pagan al crearlas.
- **El pedido afectado:** su fila sigue sin resolver y la reenvía el primer barrido tras el deploy, al admin y a la clienta, con el correo oficial.

## Pendiente

Pasar los correos de pedido y la creación de guías a QStash, una cola durable con reintentos. `waitUntil` entrega como máximo una vez: si la función se cae a mitad, el barrido lo recoge para los correos, pero no para las guías.
