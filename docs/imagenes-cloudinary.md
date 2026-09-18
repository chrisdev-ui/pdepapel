# Imágenes en Cloudinary: reglas y mantenimiento

Cloudinary aloja todas las fotos del catálogo (subidas desde el panel con el
widget de `components/ui/image-upload.tsx`) y las entrega directamente a los
navegadores de la tienda y del panel. El plan gratuito da 25 créditos al mes y
cada crédito equivale a 1 GB almacenado, 1 GB transferido **o** 1 000
transformaciones. En septiembre de 2026 la cuenta superó el plan (29,7 créditos)
sin que subiera el tráfico: el 91 % del almacenamiento (10,9 de 12 GB) eran
**copias derivadas** acumuladas, unas 25 por foto, generadas por tres formas
distintas de pedir la misma imagen y por listas de anchos demasiado largas.

## Cómo funciona el cobro

- Cada URL distinta `…/image/upload/<transformación>/<foto>` que un navegador
  pide por primera vez cuenta como **una transformación** y deja una **copia
  derivada almacenada para siempre** (Cloudinary no las purga en el plan
  gratuito). Pedir `w_1920`, `w_2048` y `w_3840` de una foto de 1200 px crea
  tres copias idénticas.
- El ancho de banda es lo que pesan las copias servidas; `f_auto,q_auto` ya lo
  minimiza.
- Los originales pesan poco (1,1 GB para 3 400 fotos). El problema siempre son
  las derivadas.

## Reglas (tienda y panel)

1. **Una sola cadena de transformación**: `f_auto,q_auto,c_limit,w_<ancho>`,
   con el ancho limitado a 1600 px. Vive en
   `pdepapel-store/lib/cloudinary-loader.ts` y en
   `pdepapel-admin/lib/cloudinary-image-loader.ts` (misma cadena para que panel
   y tienda compartan copias). La calidad numérica de `next/image` se ignora a
   propósito. **Cambiar la cadena regenera todo el catálogo** (miles de
   transformaciones y otro juego de copias): solo se cambia con una razón de
   peso y sabiendo el coste.
2. **Tienda**: toda foto de Cloudinary se muestra con
   `components/ui/cloudinary-image.tsx` (`CloudinaryImage`). Nada de
   `next-cloudinary`, de `<Image>` con `loader` propio ni de `<img>` con la URL
   cruda. Las miniaturas de tamaño fijo usan `width`/`height` (el `srcset` solo
   tiene 1x y 2x); `fill` + `sizes` se reserva para cajas fluidas (tarjetas del
   catálogo, galería, portadas).
3. **Panel**: `next.config.mjs` declara `images.loader: "custom"` con ese
   archivo, así que cualquier `<Image>` del panel ya pasa por Cloudinary sin
   tocar el optimizador de Vercel. No se añade `unoptimized` a fotos del
   catálogo (serviría el original completo); sí a placeholders locales, logos
   de transportadoras y otros orígenes ajenos.
4. **Listas de anchos** (`images.deviceSizes` / `imageSizes` en cada
   `next.config.mjs`): cada entrada es una copia derivada más por foto. Desde
   2026-09-18 son cinco anchos en las dos apps, `128, 384, 640, 1080, 1600`
   (`CLOUDINARY_DELIVERY_WIDTHS`), y el loader **redondea cualquier ancho que
   pida `next/image` al siguiente de esa lista** (`snapCloudinaryWidth`), así
   que un `sizes` mal calculado ya no inventa anchos nuevos. Los tests
   `tests/unit/lib/cloudinary-*loader*.test.ts` fallan si el loader emite otro
   ancho o si alguien vuelve a ampliar las listas. `f_auto` se mantiene a
   propósito: cada ancho se materializa en uno o dos formatos (webp y jpg/png,
   según el navegador), y fijar un formato regeneraría todas las copias del
   catálogo (unas 15 000 transformaciones), lo que no cabe en un ciclo del
   plan gratuito.
5. **Subidas**: el widget del panel reduce la foto en el navegador a 2000 px
   por lado (`maxImageWidth`/`maxImageHeight`), así el original nunca pesa
   varios MB. Los scripts que suben por API (`prisma/scripts/category-covers.ts`)
   ya generan imágenes de 1024 px.
6. Nunca se enlaza una foto de Cloudinary sin transformación desde correos,
   feeds o marketplaces si existe una alternativa; el feed de Merchant y las
   publicaciones de Mercado Libre usan el original una vez y lo cachean, eso
   es aceptable.

## Vigilancia

```bash
cld admin usage            # créditos por almacenamiento, ancho de banda y transformaciones
cld search "resource_type:image" -n 0   # total de originales
```

El informe **Delivery** de la consola (Reports → Delivery, últimos 30 días)
dice qué transformaciones, páginas y rastreadores consumen el ancho de banda.
Lectura de 2026-09-18: `c_limit,w_3840/c_limit,w_3840/f_auto/q_auto` (6 % del
ancho de banda) y las cadenas duplicadas venían del código anterior al
2026-09-11 (`next/image` con los anchos por defecto hasta 3840 y la
transformación encadenada dos veces) y de páginas cacheadas de esa época; el
código actual solo emite los cinco anchos, y ambos loaders limpian también
las URL sin versión que ya traían una transformación. AhrefsBot bajaba el
catálogo entero (otro 6 %): está bloqueado en `app/robots.ts`
(`BLOCKED_CRAWLERS`); Googlebot-Image se deja pasar porque alimenta Google
Imágenes y Merchant.

Señales de alarma: `derived_resources` muy por encima de `resources × 6`,
almacenamiento muy superior al peso de los originales, o un salto de
transformaciones el mes en que se cambió un `sizes` o la cadena.

## Purga de copias derivadas (mantenimiento)

**Regla previa: nunca se purgan copias derivadas antes de que una reducción
de anchos o de cadena esté desplegada y sirviendo.** Cada copia purgada que
un visitante vuelve a pedir es otra transformación (un crédito por cada
1 000): la purga del 2026-09-11 bajó las derivadas de 83 000 a 955, pero el
catálogo se regeneró con la matriz vieja y en una semana volvió a 9 800
copias y 19 000 transformaciones, que fue lo que llevó la cuenta al 127 %
del plan. Primero se reduce la matriz, se espera a que el tráfico haya
pedido las copias nuevas, y solo entonces se borran las viejas.

Después de desplegar un cambio que reduce las variantes, las copias antiguas
siguen ocupando espacio. Se borran **conservando los originales** con la
Admin API (`delete_resources` con `keep_original: true`), en lotes de hasta
100 `public_id`, respetando el límite de 500 llamadas por hora del plan
gratuito. Cloudinary vuelve a generar bajo demanda solo las variantes que los
visitantes piden de verdad, que con la cadena única son pocas. No se usa
`delete_all_resources` ni `delete_resources_by_prefix`: sin `keep_original`
borran las fotos.

La purga se hace desde la CLI ya autenticada (`cld`), nunca desde el panel ni
desde un cron.

## Originales huérfanos y rutas que borran

- `GET /api/[storeId]/cleanup-images` lista los originales que **ninguna fila
  de la base** referencia (`lib/cloudinary-orphans.ts`): fotos de productos y
  grupos, historial de pedidos (`OrderItem.imageUrl`), videos, portadas de
  categoría, contenido del inicio, logo y políticas de la tienda, guías de
  envío, descripciones con imágenes y medios de conversaciones. Antes solo
  miraba las fotos de productos y una foto que solo conservaba un pedido salía
  como «huérfana». `DELETE` vuelve a comprobar cada id contra la base en ese
  momento y responde 409 nombrando quién lo usa si alguno dejó de ser huérfano.
- Toda ruta que quita filas de `Image` o reemplaza una portada borra el archivo
  **después de confirmar la transacción** con
  `lib/cloudinary-cleanup.ts › deleteCloudinaryImages`, que salta cualquier URL
  que otra fila siga usando (las variantes comparten fotos por URL, los pedidos
  las guardan como historial). Cubiertas: `PATCH/DELETE /products/[id]`,
  `DELETE /products` (lote), `POST /product-groups` (fotos previas de los
  productos adoptados), `PATCH /product-groups/[id]` (foto del grupo
  reemplazada y variantes quitadas), `DELETE /product-groups/[id]` (con o sin
  variantes), `POST /products/[id]/convert-to-variants/review`,
  `PATCH/DELETE /categories/[id]` (portadas, también en carpeta
  `category-covers/`) y `DELETE /stores/[id]`. Prueba de todas:
  `tests/integration/cloudinary-orphan-paths.test.ts`.
- `getPublicIdFromCloudinaryUrl` (`lib/utils.ts`) entiende ids en carpeta,
  URLs sin versión y URLs con transformación; antes solo ids en la raíz.

## Copias de seguridad y originales grandes

- La cuenta tiene activo el **backup automático** de Cloudinary para los
  3 673 originales (≈1,15 GB duplicados, ≈1,15 créditos por ciclo). Es un
  ajuste de cuenta (Settings → Upload → Backup), no del preset ni de la API:
  se apaga solo desde la consola y con decisión explícita.
- 319 originales subidos antes del tope de 2000 px pesan 346 MB; re-encodarlos
  a 2000 px dejaría unos 94 MB. Es solo almacenamiento (la entrega ya está
  limitada a 1600 px), así que se hace con `explicit`/re-subida controlada y
  con lista revisada, nunca con un borrado masivo.

## Qué no hacer

- Instalar otra librería de imágenes o crear otro loader "para un caso".
- Añadir `quality={…}`, `dpr`, `crop` o `gravity` a una foto suelta: cada
  variante nueva es otra copia por foto.
- Borrar recursos en Cloudinary desde el Media Library sin comprobar que la
  base de datos no los referencia (`cleanup-images` lo comprueba por ti).
- Purgar derivadas «para liberar espacio» sin haber reducido antes la matriz:
  el espacio vuelve y las transformaciones se pagan otra vez.
