# Feed de Google Merchant

El catálogo público se entrega a Google Merchant Center desde una URL
protegida del administrador, sin cargar archivos a mano y sin modificar
ningún producto.

## Cómo funciona

- **Origen:** los mismos productos no archivados y las mismas reglas del
  exportador manual (`lib/google-merchant-feed.ts`). Imágenes WebP/AVIF de
  Cloudinary se piden como PNG, `identifier_exists=no` cuando no hay GTIN ni
  marca+MPN, y `excluded_destination` deja fuera las destinaciones locales.
- **URL:** `https://admin.papeleriapdepapel.com/api/<storeId>/google-merchant/feed?token=<token>`.
  El token es un HMAC del `storeId` firmado con `GOOGLE_MERCHANT_FEED_SECRET`;
  sin ese secreto la ruta responde 404 y no expone nada. También acepta el
  token como contraseña de autenticación básica (usuario cualquiera).
- **Regeneración:** el flujo de GitHub Actions `admin-scheduled-tasks.yml`
  llama todos los días a las 13:00 UTC (8:00 a. m. Colombia) a
  `/api/cron/google-merchant-feed` con el secreto `PDEPAPEL_ADMIN_CRON_SECRET`
  (= `CRON_SECRET` del administrador). Vercel solo permite dos crons en el plan
  actual y ambos están ocupados. La ruta reconstruye el feed de cada tienda y lo guarda en Upstash Redis durante 7
  días. La ruta pública sirve esa copia; solo genera al vuelo si la caché está
  vacía.
- **Informe:** `GET /api/<storeId>/google-merchant/report` (solo dueño de la
  tienda, sesión de Clerk) devuelve la URL, el horario y el último informe:
  productos activos y exportados, sin stock, sin identificador, sin imagen,
  imágenes convertidas y grupos exportados sin `item_group_id`. `POST` en la
  misma ruta regenera el feed de inmediato. Todo esto se ve en
  **Configuración → Feed de Google Merchant**.

## Activación (una sola vez)

1. Genera el secreto y guárdalo solo en el proyecto **pdepapel-admin** de
   Vercel, entorno Production:

   ```bash
   cd pdepapel-admin
   openssl rand -hex 32 | vercel env add GOOGLE_MERCHANT_FEED_SECRET production
   ```

2. Despliega (o `vercel redeploy` del último despliegue de producción).
3. En Administración → Configuración copia la URL del feed.
4. En Merchant Center: **Productos → Feeds → Añadir feed principal →
   Obtención programada**. Nombre del archivo: `google-merchant-feed.txt`,
   frecuencia diaria, hora posterior a las 8:30 a. m. (Colombia), pega la URL.
   Si Merchant pide credenciales, usuario `merchant` y contraseña el valor de
   `token`.
5. Deja desactivados los listados locales en la cuenta de Merchant.

## Operación

- Cambiar el secreto invalida la URL anterior: rota el valor en Vercel,
  despliega y actualiza la URL en Merchant Center.
- El feed nunca escribe en el catálogo. Los productos que Merchant rechace se
  corrigen en Productos (imagen principal, GTIN legítimo o marca+MPN, variantes
  duplicadas en un grupo).
- `npm run export:products-merchant` sigue disponible para auditorías con
  verificación HTTP de cada URL de la tienda; usa el mismo constructor de filas.
- Pruebas: `tests/unit/lib/google-merchant-feed.test.ts` (filas, token, caché) y
  `tests/unit/routes/google-merchant-feed.test.ts` (rutas de feed, informe y
  cron).
