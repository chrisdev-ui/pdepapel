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
   `next.config.mjs`): cada entrada es una copia derivada más por foto. No se
   amplían sin necesidad; nunca se vuelve a los valores por defecto de Next
   (hasta 3840 px).
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

Señales de alarma: `derived_resources` muy por encima de `resources × 6`,
almacenamiento muy superior al peso de los originales, o un salto de
transformaciones el mes en que se cambió un `sizes` o la cadena.

## Purga de copias derivadas (mantenimiento)

Después de desplegar un cambio que reduce las variantes (como el de 2026-09),
las copias antiguas siguen ocupando espacio. Se borran **conservando los
originales** con la Admin API (`delete_resources` con `keep_original: true`),
en lotes de hasta 100 `public_id`, respetando el límite de 500 llamadas por
hora del plan gratuito. Cloudinary vuelve a generar bajo demanda solo las
variantes que los visitantes piden de verdad, que con la cadena única son
pocas. No se usa `delete_all_resources` ni `delete_resources_by_prefix`: sin
`keep_original` borran las fotos.

La purga se hace desde la CLI ya autenticada (`cld`), nunca desde el panel ni
desde un cron. El endpoint `GET/DELETE /api/[storeId]/cleanup-images` del panel
solo detecta y borra **originales huérfanos** (fotos que ya no referencia ningún
producto), que es otra cosa.

## Qué no hacer

- Instalar otra librería de imágenes o crear otro loader "para un caso".
- Añadir `quality={…}`, `dpr`, `crop` o `gravity` a una foto suelta: cada
  variante nueva es otra copia por foto.
- Borrar recursos en Cloudinary desde el Media Library sin comprobar que la
  base de datos no los referencia (`cleanup-images` lo comprueba por ti).
