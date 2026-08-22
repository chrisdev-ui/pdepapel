# Ruta corta de renombrado: el experimento de los 371

> **Este documento reemplaza en la práctica al plan por fases** (`docs/plan-naming-productos.md`), que sigue siendo la referencia para la gramática (§2), las restricciones duras (§2.4) y la auditoría completa de UI (§5). Lo que cambia aquí es el **orden y el alcance**: en vez de industrializar el proceso para 898 productos, se prueba la tesis con un experimento controlado y se decide con datos.
>
> **Costo total:** ~1 semana de trabajo. **Riesgo sobre ingresos: prácticamente cero.**

---

## Por qué cambió el plan

Dos números salidos de `prod_dump.sql` que no tenía cuando escribí el plan largo:

### 1. La concentración de ingresos es alta, no plana

| Cohorte | % de los ingresos del catálogo activo |
|---|---:|
| Top 25 | 28,7 % |
| Top 50 | 43,8 % |
| **Top 100** | **63,4 %** |
| Top 150 | 77,2 % |
| Top 200 | 86,7 % |

Es decir: **100 productos cargan casi dos tercios de tu facturación.** Renombrarlos primero maximiza el beneficio… y también el daño si algo sale mal. Son exactamente los productos que no quieres usar como conejillo de indias.

### 2. La mitad de tu catálogo activo nunca ha vendido nada

De los 726 productos activos que aparecen en el dump:

| | Productos |
|---|---:|
| Con al menos una venta registrada | 355 |
| **Sin una sola unidad vendida** | **371 (51 %)** |

Esos 371 productos son el hallazgo. **No tienen nada que perder.** Si renombras uno y el tráfico no se mueve, perdiste 3 minutos. Si el tráfico sube, tienes la prueba que necesitas para justificar tocar los otros 500.

> **Caveat obligatorio:** el dump es del **2026-02-22** y el feed es de julio. 172 productos activos del feed no existen en el dump (fueron creados después) y algunos de los 371 pueden haber vendido entre febrero y hoy. **La cohorte real hay que regenerarla contra producción** con la consulta de §C1 antes de arrancar. El método es correcto; la lista exacta, no.

---

## La conclusión operativa

Mi recomendación anterior — *"renombra el top 100 primero"* — era la equivocada. Correcta:

> **Experimenta con los que no venden. Aplica a los que sí venden solo cuando tengas la prueba.**

Los 371 productos sin ventas te dan algo que un despliegue por oleadas nunca te da: **un grupo de control**. Renombras la mitad, dejas la otra mitad intacta, y a los 60 días comparas dos grupos que arrancaron desde el mismo punto (cero) en el mismo sitio, con la misma autoridad de dominio y el mismo periodo. Eso responde la pregunta *"¿los nombres mueven la aguja?"* de forma limpia, cosa que ningún antes/después puede hacer, porque el antes/después no separa tu cambio de la estacionalidad.

---

## Las cuatro rutas

Las rutas **A** y **B** son independientes del experimento y valen la pena aunque decidas no renombrar nada. Hazlas primero.

| Ruta | Qué es | Esfuerzo | Riesgo |
|---|---|---|---|
| **A** | Arreglar lo que ya está roto en la UI | 1–2 días | Ninguno — son bugs actuales |
| **B** | Datos estructurados del feed | ½ día | Ninguno — no toca nombres ni UI |
| **C** | El experimento: 371 productos, mitad y mitad | 2–3 días + ~4 h de tu criterio | Casi cero: productos con 0 ventas |
| **D** | Decidir a los 60 días | 1 hora | — |

---

## Ruta A · Arreglar lo que ya está roto

Solo cinco puntos, no los doce del plan largo. Los otros siete (etiquetas QR, emails, exportaciones) solo importan cuando los nombres se alarguen de verdad; estos importan **hoy**.

### A1 · La tarjeta de producto no tiene clamp

`pdepapel-store/components/ui/product-card.tsx:170`

```diff
- <p className="font-sans text-lg font-semibold">{product.name}</p>
+ <p
+   className="line-clamp-2 min-h-[3.5rem] font-sans text-lg font-semibold"
+   title={product.name}
+ >
+   {product.name}
+ </p>
```

La `<article>` es `flex flex-col justify-between` dentro de un CSS grid: las filas se estiran a la tarjeta más alta, así que **un nombre largo desalinea el precio de toda la fila**. El `min-h` de 2 líneas iguala todas las tarjetas independientemente del largo del nombre.

Y para que el esqueleto no provoque CLS al hidratar, en `app/(routes)/tienda/components/skeletons.tsx:44` y `components/home-skeletons.tsx:71`:

```diff
- <Skeleton className="h-4 w-3/4" />
+ <Skeleton className="h-[3.5rem] w-full" />
```

### A2 · El resumen del checkout se desborda

`pdepapel-store/app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx:981-984`

El contenedor es `flex max-h-20 items-center` (80 px) y adentro caben: el nombre a `text-sm` (~20 px por línea) más hasta tres líneas de variante a `text-xs` (~16 px cada una). Con una línea de nombre son 68 px y entra justo. **Con dos líneas de nombre son 88 px y no hay `overflow-hidden`**, así que el texto se sale de la caja en lugar de recortarse. Tus 49 productos de más de 40 caracteres ya están al filo hoy.

```diff
- <div className="flex max-h-20 items-center justify-between">
+ <div className="flex max-h-20 items-center justify-between overflow-hidden">
```
```diff
- <span>{item.name}</span>
+ <span className="line-clamp-1" title={item.name}>{item.name}</span>
```

### A3 · El tope de 60 de Mercado Libre

`pdepapel-admin/lib/mercadolibre/listings.ts:117` manda `listing.product.name.trim()` sin verificar nada. La API rechaza con `item.title.invalid_length` y hoy el único chequeo (`lib/mercadolibre/content-assistant.ts:52`) es informativo.

```ts
// lib/mercadolibre/marketplace-title.ts (nuevo)
export const ML_TITLE_MAX = 60;

export function buildMarketplaceTitle(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length <= ML_TITLE_MAX) return clean;
  // recorta por palabra, nunca a media palabra
  const words = clean.split(" ");
  let out = "";
  for (const w of words) {
    if ((out + " " + w).trim().length > ML_TITLE_MAX) break;
    out = (out + " " + w).trim();
  }
  return out;
}
```

En `listings.ts:117`, `title: buildMarketplaceTitle(listing.product.name)`, y lanzar un error propio si el resultado quedara vacío. Test unitario con casos de 40 / 59 / 60 / 61 / 80 caracteres.

### A4 · Recuperar el presupuesto del `<title>`

`pdepapel-store/app/(routes)/producto/[slug]/page.tsx:48-51` concatena los atributos de variante, y `app/layout.tsx:32-35` añade `" | Papelería P de Papel"` (25 caracteres). Entre los dos se comen el SERP.

```diff
  return {
-   title,
+   title: { absolute: title },
```

Esto **solo** afecta a las fichas de producto; home, categorías y el resto del sitio conservan el sufijo de marca. Recuperas ~25–40 caracteres. Es el cambio que hace viable cualquier nombre largo.

### A5 · Las tablas de admin

`pdepapel-admin/components/ui/data-table.tsx:248` pone `whitespace-nowrap` en **toda celda de toda tabla**. Un nombre de 60 caracteres empuja precio, stock y acciones fuera de la pantalla. En las columnas de nombre (`productos/components/columns.tsx:41`, `gestion-masiva`, `agotados`, `stock-bajo`, `movimientos-inventario:105`, `resenas`):

```ts
{
  accessorKey: "name",
  header: "Nombre",
  cell: ({ row }) => (
    <div className="max-w-[280px] truncate" title={row.original.name}>
      {row.original.name}
    </div>
  ),
}
```

El patrón correcto ya existe en el repo: `movimientos-inventario/components/columns.tsx:152` (columna `reason`) y `components/ui/async-product-select.tsx:97-101`.

**Criterio de salida de la ruta A:** renombras un producto de prueba en local a 65 caracteres y se ve bien en tarjeta (móvil 2 col. y desktop 4 col.), ficha, checkout y tabla de admin. Ninguna prueba existente se rompe.

---

## Ruta B · Datos estructurados del feed

Cero riesgo de naming, cero riesgo de UI, beneficio inmediato en Merchant Center.

### B1 · Poblar `brand` (hoy 0 de 898)

Extraje los candidatos reales de los nombres actuales. Son pocos:

| Marca detectada | Productos |
|---|---:|
| GIPAO | 7 |
| NORMA | 3 |
| SCRIBE | 3 |
| ETERNA | 3 |
| TESA | 1 |

O sea: **la enorme mayoría de tu catálogo no tiene marca de fabricante** — son productos genéricos importados que vendes bajo tu tienda. La guía de Google para *"Missing brand"* pide la marca que el consumidor reconoce, y desde 2025 Merchant Center acepta explícitamente usar tu propia marca. Propuesta:

- Marca de fabricante real donde exista (los ~17 de arriba, más los que salgan al revisar).
- `brand = "P de Papel"` para el resto de productos genéricos.
- **Nunca** meter una licencia en `brand`: *Sanrio*, *Stitch*, *Snoopy*, *Harry Potter* van en `design`, no en `brand`. Declarar una licencia como marca propia es el error que sí puede costarte la cuenta.

### B2 · `size` está exportando el código interno

`prisma/utils/products-to-google-merchant.ts` manda `Size.value` (`S-L`, `M-P`, `XS-L`) cuando `Size.name` es `S`, `M`, `L`, `XS`. Para Google, `S-L` es basura. Cambiar a `Size.name`, y evaluar dejar `size` vacío en categorías donde la talla no significa nada (un borrador no tiene talla).

### B3 · El emoji en `product_type`

`Type.name` contiene el emoji (`🖊️ Escritura`), y se exporta tal cual: `🖊️ Escritura > Bolígrafos / Lapiceros`. Sacar el emoji a una constante de UI o a un campo aparte y exportar la taxonomía limpia.

### B4 · Los 265 productos mal clasificados

El 29,5 % del catálogo tiene un nombre que no contiene el sustantivo de su propia categoría. Buena parte son errores de clasificación reales — los dos `portaminas` archivados bajo *Lápices*, los `foami` bajo *Blocks de papel*. Sacar la lista y triarla es una tarea de calidad de datos **independiente del renombrado**, y mejora la navegación por categorías aunque nunca cambies un nombre.

---

## Ruta C · El experimento

### C0 · Congelar los slugs (único cambio de código que exige el experimento)

Sin esto, cada renombrado regenera el slug y crea una fila en `ProductSlugAlias` — 371 redirecciones nuevas y ruido permanente en Search Console.

En `pdepapel-admin/app/api/[storeId]/products/[productId]/route.ts` (la lógica de slug vive en `:266-273` y el alias en `:357-366`): aceptar `preserveSlug?: boolean` en el body y, cuando sea `true`, saltarse por completo `generateProductSlug`, `getUniqueProductSlug` y `preserveProductSlugAlias`, dejando `slug` como está.

Test de integración: renombrar con `preserveSlug: true` y verificar que (a) `slug` no cambió y (b) `ProductSlugAlias` no ganó filas.

### C1 · Sacar la cohorte real de producción

```sql
SELECT p.id, p.sku, p.name, p.price, c.name AS categoria,
       d.name AS diseno, co.name AS color, s.name AS talla
FROM Product p
JOIN Category c  ON c.id  = p.categoryId
JOIN Design   d  ON d.id  = p.designId
JOIN Color    co ON co.id = p.colorId
JOIN Size     s  ON s.id  = p.sizeId
WHERE p.isArchived = 0
  AND NOT EXISTS (
    SELECT 1 FROM OrderItem oi
    JOIN `Order` o ON o.id = oi.orderId
    WHERE oi.productId = p.id
      AND o.status NOT IN ('CANCELLED','QUOTATION')
  )
ORDER BY c.name, p.sku;
```

Ordenar por `categoria, sku` importa: es lo que permite el reparto estratificado del paso siguiente.

### C2 · Repartir en dos brazos

Asignación **determinista y estratificada por categoría**: recorriendo el resultado ordenado, los índices pares van a `RENOMBRAR`, los impares a `CONTROL`. Así ambos brazos quedan con la misma mezcla de categorías, de rangos de precio y de antigüedad — que es lo que hace comparable la medición. Nada de aleatorio: quieres poder reproducir el reparto.

### C3 · Generar propuestas a CSV, no una pantalla de admin

Aquí es donde la ruta corta se separa del plan largo: **no construyas la pantalla de revisión todavía**. Un script que exporta CSV y otro que lo reimporta cuestan un día; la pantalla cuesta una semana. Si el experimento sale negativo, te ahorraste la semana.

```
sku, nombre_actual, categoria, diseno, color, talla, precio,
nombre_propuesto, largo, ok_ml_60, aprobado
```

Las propuestas se redactan con la gramática de `docs/plan-naming-productos.md` §2:
`[Tipo canónico] [Formato/Material] [Diseño/Licencia] [Color] [Medida/Cantidad]`, objetivo 50–65 caracteres.

El script calcula `largo` y `ok_ml_60` solo; tú abres el CSV en Numbers o Excel, corriges lo que no te suene y pones `1` en `aprobado`. **A 3 minutos por producto son unas 9 horas** para 185 nombres — repártelas en varios días o recorta la cohorte a 120 por brazo (≈ 6 horas) sin perder validez.

### C4 · Aplicar

Un script que lee el CSV, toma solo las filas con `aprobado = 1`, y para cada una:

1. `PATCH /api/{storeId}/products/{id}` con `{ name, preserveSlug: true }`
2. Guarda `nombre_anterior` en un CSV de rollback antes de escribir
3. Revalida en lotes de 25 con espera entre lotes — 371 llamadas seguidas a `/api/revalidate` no son viables

**El brazo de control no se toca.** Es la mitad del experimento.

### C5 · Marcar la fecha

Anotar el día exacto de aplicación en `docs/seguimiento-seo.md` y **no desplegar ningún otro cambio de SEO durante los 60 días siguientes.** Si cambias dos cosas a la vez, el experimento no vale nada.

---

## Ruta D · Decidir a los 60 días

Comparar los dos brazos en Search Console, filtrando por las URLs de cada uno:

| Señal | Brazo renombrado | Brazo control | Lectura |
|---|---|---|---|
| Impresiones | ↑ | ≈ igual | **Funciona.** Continúa. |
| Consultas únicas | ↑ | ≈ igual | **Funciona**, y es la señal más limpia: nombres más ricos = más consultas hacen match |
| Impresiones | ≈ igual en ambos | | No funciona. El problema no eran los nombres; el cuello de botella está en autoridad de dominio o en indexación. |
| Impresiones ↑ en **ambos** brazos | | | Es estacionalidad, no tu cambio. Por eso existe el control. |
| CTR renombrado ↓ | | | Los nombres quedaron largos y el SERP los corta. Bajar el objetivo a 45–55 antes de seguir. |

Mide también, aunque no forme parte del experimento formal:

- **Búsquedas internas con 0 resultados.** Es lo que se mueve más rápido y no depende de Google. Si no tienes esa telemetría, instrumentarla en `search-bar.tsx` es media hora y es la métrica de mejor relación esfuerzo/valor de todo este documento.
- **Rechazos en Merchant Center**, que deberían bajar por la ruta B sola.

**Si el resultado es positivo:** entonces sí, el top 100 (63,4 % de tus ingresos) por oleadas de 25, y después construyes la pantalla de revisión del plan largo para los ~500 restantes.

**Si es negativo:** gastaste una semana en lugar de un mes, las rutas A y B te quedaron igual, y sabes que tu problema de tráfico está en otro lado.

---

## Resumen de esfuerzo

| | Trabajo de dev | Tu criterio | Riesgo sobre ingresos |
|---|---|---|---|
| Ruta A | 1–2 días | — | Ninguno |
| Ruta B | ½ día | 1 h (revisar marcas) | Ninguno |
| Ruta C | 2–3 días | 6–9 h | Casi cero (productos con 0 ventas) |
| Ruta D | — | 1 h | — |
| **Total** | **~1 semana** | **~10 h** | **Casi cero** |

Comparado con el plan largo: ~2 semanas de dev, 6–8 horas de revisión, y tocando el 100 % del catálogo — incluidos los productos que cargan dos tercios de tu facturación — antes de tener una sola prueba de que la tesis funciona.
