# Plan de renombrado profesional del catálogo

> **Estado:** propuesta aprobada en decisiones marco, pendiente de ejecución.
> **Alcance:** los ~898 productos activos de `Store` (más archivados al final).
> **Objetivo:** pasar de nombres tipo etiqueta de estante (`Pin gato`) a nombres tipo ficha comercial (`Pin decorativo metálico diseño Gatito kawaii multicolor`) **sin romper layout, sin rotar URLs y sin degradar Mercado Libre**.
> **Documento hermano:** `docs/seguimiento-seo.md` (medición) y `docs/revalidacion-catalogo.md` (contrato admin → tienda).
>
> **Nota sobre las referencias `archivo:línea`:** capturadas del árbol de trabajo el **2026-08-21**. Verificar contra `HEAD` antes de abrir cada tarea; el número de línea puede haberse corrido, el patrón descrito no.

---

## 0. Decisiones marco (bloqueadas)

| Decisión | Elección | Consecuencia principal |
|---|---|---|
| Gramática del nombre | **Comercial completa**, objetivo **50–65 caracteres** | Máxima cobertura de cola larga. Obliga a endurecer UI *antes* de tocar datos y a derivar títulos cortos para etiquetas/POS/ML. |
| Producción de los nombres | **IA + revisión humana** en una pantalla nueva de admin | Calidad editorial con trazabilidad; nada se escribe sin aprobación explícita. |
| URLs | **Slugs congelados** | 0 redirecciones 301, 0 filas nuevas en `ProductSlugAlias`, 0 rotación en Search Console. El slug queda más corto que el nombre — es aceptable y deseable. |
| Orden de ejecución | Endurecer UI → plumbing → generar → revisar → oleadas → medir | Ninguna fase escribe nombres hasta que la anterior tenga criterio de salida cumplido. |

**Regla de oro del plan:** *ningún nombre de producto se modifica en producción antes de que la Fase 1 esté desplegada.* El layout debe soportar nombres largos aunque todavía no existan.

---

## 1. Línea base: qué hay hoy en producción

Fuente: `pdepapel-admin/google_merchant_feed_20260730_175954.txt` (898 productos activos, 2026-07-30) y `pdepapel-admin/prod_dump.sql`.

### 1.1 Longitud

| Métrica | Valor |
|---|---|
| Mínimo | 8 caracteres (`Pin gato`) |
| Mediana | **25** |
| Media | 25,4 |
| Máximo | 54 (`Set de plumones x24 doble punta PRIMAVERA tonos tierra`) |

| Rango | Productos |
|---|---:|
| 0–9 | 3 |
| 10–19 | 213 |
| 20–29 | **447** |
| 30–39 | 186 |
| 40–49 | 42 |
| 50–59 | 7 |

Es decir: **el 74 % del catálogo vive por debajo de 30 caracteres**. Hay entre 25 y 40 caracteres de presupuesto sin usar en prácticamente cada producto — presupuesto que hoy no aporta ni una sola palabra clave.

### 1.2 Defectos medidos

| Defecto | Incidencia | Ejemplo real |
|---|---:|---|
| El nombre **no contiene el sustantivo de su propia categoría** | **265 / 898 (29,5 %)** | `Block BLOOMING AS FLOWERS` en categoría *Stickers* |
| No menciona el color aunque lo tiene en BD | 615 / 898 (68 %) | `Mug cute` → color *Pastel* |
| No menciona el diseño aunque lo tiene en BD | 594 / 898 (66 %) | `Clips Love` → diseño *Corazones* |
| **Códigos internos de talla filtrados al nombre** | 11 | `Correctores Clásico Café S-L` |
| Palabras en MAYÚSCULA SOSTENIDA | 50 | `Cuaderno argollado ... SNOOPY` |
| Conflictos singular/plural en el sustantivo cabeza | 20 pares | `lapicero`(48) vs `lapiceros`(14) |
| **Categorías con más de un sustantivo cabeza** | **53 / 95 (56 %)** | *Blocks de papel* → `foami`(10) + `block`(8) |
| Sustantivos cabeza distintos en total | **140** para 95 categorías | — |
| Nombres duplicados exactos | 1 par | `Monedero Capibara` ×2 (colores distintos) |

### 1.3 Campos estructurados vacíos (impacto directo en Google Merchant)

| Campo del feed | Poblado |
|---|---|
| `brand` | **0 / 898** |
| `gtin` | 0 / 898 |
| `mpn` | 0 / 898 |
| `identifier_exists` | `no` en el 100 % |
| `item_group_id` (agrupación de variantes) | 357 / 898 |
| `additional_image_link` | 575 / 898 |

Dos fallas adicionales del feed, que este plan corrige de paso:

- **`size` exporta el código interno** (`S-L`, `M-P`, `XS-L`…). `Size.name` es `S`/`M`/`L` y `Size.value` es el código; el feed está enviando el código. Para Google eso es basura.
- **`product_type` lleva emoji** (`🖊️ Escritura > Bolígrafos / Lapiceros`) porque el emoji vive dentro de `Type.name`.

### 1.4 Diagnóstico

Los nombres actuales son **etiquetas de estante**, no **fichas de producto**. Funcionan cuando ya tienes el producto en la mano; fallan en los tres momentos donde se gana o se pierde la venta:

1. **Búsqueda en Google** — `Pin gato` no compite por *"pin decorativo gatito kawaii"*, que es como se busca.
2. **Búsqueda interna de la tienda** — `search-item.tsx` busca sobre `name`; con nombres de 8 caracteres el buscador no tiene sobre qué hacer *match*.
3. **Comparación en la grilla** — dos variantes del mismo producto se ven como el mismo nombre repetido, sin nada que las distinga.

---

## 2. La gramática objetivo

### 2.1 Fórmula

```
[Tipo canónico] [Formato/Material/Descriptor] [Diseño o Licencia] [Color] [Medida o Cantidad]
```

- **Objetivo:** 50–65 caracteres.
- **Piso duro:** 30 caracteres (por debajo, el nombre no está terminado).
- **Techo duro:** 70 caracteres (ver §2.4).
- Las ranuras vacías **colapsan sin dejar separadores** — nunca `Pin decorativo  Gatito`, nunca `Pin - - Gatito`.

### 2.2 Reglas por ranura

| # | Ranura | Regla | Ejemplo |
|---|---|---|---|
| 1 | **Tipo canónico** | Obligatorio. Sustantivo **singular**, tomado del diccionario canónico (§3.1). Debe coincidir con la categoría del producto. | `Pin`, `Cuaderno`, `Lapicero` |
| 2 | **Formato / Material / Descriptor** | Opcional pero muy recomendado. Es la ranura que aporta la cola larga: material, formato, mecanismo, uso. | `decorativo metálico`, `argollado cuadriculado`, `retráctil de gel` |
| 3 | **Diseño o Licencia** | Obligatorio si `design` no es un centinela (`Clásico`, `S-D`, `Sin Diseño`). Licencias con su grafía oficial. | `Stitch`, `Sanrio`, `Harry Potter`, `Capibara` |
| 4 | **Color** | Obligatorio **solo si el producto pertenece a un `ProductGroup` con más de un miembro** y el color es lo que los distingue. Se omite si `color` es `Multicolor` y el diseño ya lo implica. | `rosa pastel`, `lila` |
| 5 | **Medida o Cantidad** | Obligatorio si existe. Cantidad `x12`; medidas `0.7 mm`, `350 ml`, `80 hojas`, `A5`. | `x24`, `80 hojas`, `0.5 mm` |

### 2.3 Reglas de estilo

**Obligatorio**

- **Sentence case.** Primera palabra en mayúscula; el resto en minúscula, salvo nombres propios y licencias.
- **Grafía oficial de licencias:** `Sanrio`, `Hello Kitty`, `Kuromi`, `Cinnamoroll`, `Pompompurin`, `Badtz-Maru`, `Stitch`, `Snoopy`, `Mafalda`, `Harry Potter`, `El Principito`, `One Piece`, `Minnie Mouse`, `Disney`, `Lego`. Marcas de fabricante: `Norma`, `Scribe`, `Gipao`, `Tesa`, `Faber-Castell`.
- **Términos que el cliente colombiano realmente escribe.** El catálogo ya usa `tajalápiz` (13/13) mientras la categoría dice *Sacapuntas*: mantener `tajalápiz` en el nombre y dejar `sacapuntas` en descripción/categoría cubre ambas búsquedas.
- Cantidades siempre en formato `x12` (sin espacio, con `x` minúscula).
- Medidas con espacio antes de la unidad: `0.7 mm`, `350 ml`, `16 × 24 cm`.

**Prohibido**

| Prohibición | Motivo | Ocurrencias hoy |
|---|---|---|
| MAYÚSCULA SOSTENIDA | Google la penaliza en `title`; Mercado Libre la desaconseja | 50 |
| Códigos internos (`S-L`, `S-P`, `S-D`, `N/A`, `DEFAULT`) | Son centinelas de BD, no lenguaje | 11 |
| Emoji | Rompen feeds y `<title>` | 0 en nombres, sí en `Type.name` |
| Barras en el sustantivo cabeza (`Bolígrafos / Lapiceros`) | Ambiguo para el buscador; elegir uno | 21 nombres con `/` |
| Adjetivos de venta (`increíble`, `hermoso`, `super`) | Ruido sin volumen de búsqueda | — |
| Repetir la misma palabra clave dos veces | *Keyword stuffing* | — |
| El nombre de la tienda dentro del nombre | Ya lo añade la plantilla de `<title>` | — |

### 2.4 Restricciones duras (el presupuesto real de caracteres)

| Consumidor | Límite | Fuente | Qué pasa si se excede |
|---|---:|---|---|
| **Mercado Libre `item.title`** | **60** | `lib/mercadolibre/listings.ts:117` envía `product.name` crudo | **Falla funcional**: la API rechaza con `item.title.invalid_length`. Hoy solo existe un aviso informativo en `lib/mercadolibre/content-assistant.ts:52` que **no bloquea ni recorta**. |
| Etiqueta QR `COMPACT_65` (38,1 × 21,2 mm) | **~38** | `components/labels/qr-label-print-sheet.tsx:110-126` | Corte físico a 2 líneas **sin elipsis**. Variantes hermanas quedan indistinguibles en el estante. |
| Etiqueta QR `STANDARD_40` (48 × 28 mm) | **~48** | `qr-label-print-sheet.tsx:128-144` | Igual. |
| Email de reactivación | **~48** | `emails/reactivation-email.tsx:311-320` (`height: 40px; overflow: hidden`) | Corte a media palabra sin elipsis. |
| `<title>` en SERP | ~55–60 visibles | `app/layout.tsx:32-35` añade `" \| Papelería P de Papel"` (25 car.) + `producto/[slug]/page.tsx:44-51` añade los atributos de variante | Un nombre de 60 se come el presupuesto entero: la marca y los atributos no se ven. **Se resuelve en Fase 2.** |
| Twitter card / OG | ~70 / ~60 | mismo `title` reutilizado | Truncado en la vista previa social. |
| Google Merchant `title` | 150 (recomendado ≤ 70) | `prisma/utils/products-to-google-merchant.ts:88` | Sin riesgo a 65. |
| GA4 `item_name` | 100 | `lib/customer-analytics.ts:51` | Sin riesgo a 65. |
| Columna en BD | `VARCHAR(191)` | `schema.prisma:268` (`name String`) | Sin riesgo. |

> **El límite operativo es 60**, impuesto por Mercado Libre y por el `<title>`. El objetivo 50–65 lo roza a propósito: la Fase 2 introduce derivaciones para que los casos de 61–65 no rompan nada.

### 2.5 Ejemplos reales del catálogo

| SKU / categoría | Hoy | Propuesto | Long. |
|---|---|---|---:|
| Pines · diseño Gatito · Multicolor | `Pin gato` (8) | `Pin decorativo metálico diseño Gatito kawaii multicolor` | 54 |
| Mugs · Kawaii · Pastel · $30.000 | `Mug cute` (8) | `Mug cerámico kawaii tonos pastel diseño Gatito 350 ml` | 53 |
| Clips · Corazones · Palo de rosa | `Clips Love` (10) | `Clips decorativos metálicos Corazones palo de rosa x12` | 53 |
| Lego · Stitch · Azul | `Lego Stitch` (11) | `Bloques armables tipo Lego Stitch coleccionable azul` | 52 |
| Borradores · Conejito · Lila | `Borrador aplique Conejo` (23) | `Borrador de nata con aplique Conejito lila escolar` | 49 |
| Agendas · Cierre hermético · Rosa pastel | `Agenda A5 Simple Life` (21) | `Agenda A5 Simple Life tapa acolchada rosa pastel con cierre` | 58 |
| Correctores · Clásico · Café | `Correctores Clásico Café S-L` (28) | `Corrector de cinta lateral café pastel 5 mm × 6 m` | 48 |

---

## 3. Higiene de datos previa

Nombres profesionales no se pueden generar sobre taxonomía sucia. Esto va **antes** de generar un solo nombre.

### 3.1 Diccionario canónico de sustantivos cabeza

53 de 95 categorías usan más de un sustantivo cabeza. Punto de partida medido:

| Categoría | n | Cabezas observadas | Canónico propuesto |
|---|---:|---|---|
| Bolígrafos / Lapiceros | 73 | `lapicero`(47), `lapiceros`(14), `bolígrafos`(4), `set`(3), `promo`(2) | **Lapicero** (`Set de lapiceros` si `x>1`) |
| Stickers | 56 | `stickers`(26), `sticker`(7), `block`(5), `sobre`(5), `caja`(4) | **Stickers** (formato en ranura 2: `en block`, `en sobre`) |
| Agendas | 36 | `agenda`(32), `agendas`(4) | **Agenda** |
| Llaveros | 33 | `llavero`(31), `llaveros`(2) | **Llavero** |
| Borradores | 28 | `borrador`(25), `borradores`(2), `set`(1) | **Borrador** |
| Papeles | 27 | `papel`(18), `pliego`(5), `rollo`(2), `cartulina`(1) | **Papel** (formato en ranura 2) |
| Notas adhesivas | 26 | `notas`(24), `block`(2) | **Notas adhesivas** |
| Marcadores | 26 | `marcadores`(13), `marcador`(12) | **Marcador** |
| Lápices | 23 | `lápiz`(15), `lapices`(4), `caja`(2), `portaminas`(2) | **Lápiz** (los 2 `portaminas` están mal categorizados) |
| Resaltadores | 23 | `resaltadores`(16), `resaltador`(7) | **Resaltador** |
| Argollados | 21 | `cuaderno`(13), `cuadernos`(8) | **Cuaderno argollado** |
| Planeadores | 20 | `planeador`(17), `agenda`(2), `planeador/`(1) | **Planeador** |
| Blocks de papel | 18 | `foami`(10), `block`(8) | **Foami** vs **Block** → *la categoría mezcla dos productos; separar* |
| Libretas | 18 | `libreta`(8), `libretas`(5), `mini`(5) | **Libreta** |
| Sacapuntas | 13 | `tajalápiz`(13) | **Tajalápiz** (mantener el regionalismo) |

**Regla de plural:** singular siempre, excepto cuando el producto es intrínsecamente un conjunto (`Notas adhesivas`, `Colores`, `Stickers`, `Banderitas adhesivas`) o cuando lleva `x{n}` con `n>1`, donde el patrón es `Set de {plural}`.

**Entregable:** `pdepapel-admin/constants/product-naming.ts` con `CANONICAL_HEAD_NOUNS: Record<categoryId, { singular, plural, setPrefix }>` — dato versionado en Git, no en BD.

### 3.2 Correcciones de taxonomía

| Tarea | Detalle |
|---|---|
| Sacar el emoji de `Type.name` | Guardar el emoji en un campo/constante aparte para la UI; `product_type` del feed queda limpio. Verificar `products-to-google-merchant.ts`. |
| Dividir `Bolígrafos / Lapiceros` | Elegir `Lapiceros` como categoría canónica; `Bolígrafos` como alias/`CategorySlugAlias`. **No borrar el slug antiguo** (`docs/seguimiento-seo.md`). |
| Revisar `Blocks de papel` | Contiene *foami* y *blocks*: dos categorías. |
| Exportar `Size.name` y no `Size.value` en el feed | `S-L`/`M-P` no son tallas para Google. Evaluar además mapear a `size_type`/`size_system` o dejar `size` vacío cuando no aplique. |
| Poblar `Product.brand` | Hoy 0/898. Extraer de los nombres actuales (`NORMA`, `SCRIBE`, `GIPAO`, `TESA`, `MAFALDA`…) distinguiendo **fabricante** (→ `brand`) de **licencia/diseño** (→ `design`). Para productos sin marca real, usar `P de Papel` solo si de verdad son marca propia. |
| No fabricar GTIN | Regla del repo. Mantener `hasNoProductIdentifier` cuando no haya GS1 real. |

---

## 4. Decisión de arquitectura: un solo nombre no alcanza

Con nombres de 50–65 caracteres hay superficies con presupuesto físico de 38–48 (etiquetas impresas, email de reactivación, POS, carrito lateral). Recortarlas por CSS produce cortes a media palabra y hace que dos variantes se vean idénticas.

**Propuesta: una columna nueva y ninguna más.**

```prisma
model Product {
  // ...
  name      String                      // nombre comercial completo, 50-65
  shortName String? @db.VarChar(60)     // NUEVO: nombre operativo, objetivo <= 32
}
```

`shortName` se genera **al mismo tiempo** que `name`, con la misma gramática truncada a las ranuras 1–3 (`Tipo + Descriptor + Diseño`), y es editable en la misma pantalla de revisión.

### 4.1 Qué nombre usa cada superficie

| Superficie | Usa | Motivo |
|---|---|---|
| `<h1>` de la ficha de producto | `name` | Es la señal SEO principal |
| Tarjeta de producto, grilla, relacionados | `name` | Es donde el cliente compara |
| JSON-LD `Product.name`, sitemap, OG | `name` | Datos estructurados |
| Feed Google Merchant `title` | `name` | Límite 150, sin riesgo |
| **Título Mercado Libre** | derivado con tope duro de 60 | Ver §4.2 |
| `<title>` del navegador / SERP | `name` en modo `absolute` | Ver §4.3 |
| Carrito lateral, resumen de checkout | `shortName ?? name` | Columnas estrechas |
| Etiquetas QR / SKU | `shortName ?? name` | Presupuesto físico de 38–48 |
| POS (`ventas-rapidas`) y ferias | `shortName ?? name` | El cajero necesita leerlo de un vistazo |
| Tablas de admin | `shortName ?? name` + `truncate` + `title=` | `data-table.tsx` aplica `whitespace-nowrap` a todo |
| Email de reactivación | `shortName ?? name` | Recorte duro a 40 px de alto |
| PDF de factura y catálogo | `name` | Ajusta por salto de línea, no recorta |
| `OrderItem.name` (histórico) | **congelado** | Instantánea de la compra; renombrar **no** la toca |

> **Invariante:** renombrar un producto **nunca** modifica `OrderItem.name` (`schema.prisma:589`). Un pedido pasado sigue mostrando lo que el cliente compró. Esto ya funciona así; hay que **probarlo con un test de regresión**, no asumirlo.

### 4.2 Título de Mercado Libre

`MarketplaceListing.title` **ya existe** en el esquema (`schema.prisma:1450`) — no hace falta columna nueva.

1. `buildMarketplaceTitle(product)` genera desde `name` recortando por ranuras (quita ranura 5, luego 4, luego acorta la 2) hasta **≤ 60**, nunca a media palabra.
2. Tope duro en `lib/mercadolibre/listings.ts:117`: si el título supera 60, **lanzar antes de llamar a la API**, no dejar que la rechace ML.
3. El aviso de `content-assistant.ts:46-56` deja de ser informativo y pasa a bloquear la publicación.
4. **Verificar antes de la oleada masiva** si Mercado Libre permite editar el título de publicaciones con ventas; si no, esas publicaciones se marcan y se resuelven a mano o por relistado. Los reintentos van por el `MarketplaceOutbox` existente, con `delay` en unidades explícitas (`"30s"`, `"5m"`).

### 4.3 Título SEO sin columna nueva

Hoy: `name` + `" - " + atributos de variante` + `" | Papelería P de Papel"` ≈ hasta 115 caracteres, de los que Google muestra ~60.

Cambio en `pdepapel-store/app/(routes)/producto/[slug]/page.tsx`:

```ts
export async function generateMetadata(...) {
  return {
    title: { absolute: product.name },   // corta la plantilla de app/layout.tsx
    // ...
  }
}
```

- El sufijo de marca desaparece **solo en fichas de producto** (se conserva en home, categorías y resto del sitio).
- Los atributos de variante ya no se concatenan: la gramática los mete dentro del nombre cuando corresponde.
- Se recuperan ~25–40 caracteres de presupuesto SERP. **Es esto lo que hace viable la fórmula de 50–65.**

---

## 5. Fases

### Fase 0 — Línea base y congelamiento *(medio día, sin despliegue)*

| Acción | Detalle |
|---|---|
| Congelar métricas | Exportar de Search Console: impresiones, clics, CTR y posición media por URL de producto, 90 días. Guardar el CSV con fecha en `outputs/` (gitignored) y anotar el rango en `docs/seguimiento-seo.md`. |
| Congelar ML | Exportar visitas e impresiones por publicación. |
| Congelar búsqueda interna | Si hay telemetría de `search-bar.tsx`: consultas con 0 resultados. Si no la hay, **instrumentarla ahora** — es la métrica que más rápido va a mejorar. |
| Snapshot del catálogo | `products_export_*.csv` fresco con `id, sku, name, slug, categoryId, colorId, sizeId, designId`. Es la base del rollback. |

**Criterio de salida:** existe un CSV congelado y fechado del que se puede reconstruir cualquier nombre anterior.

---

### Fase 1 — Endurecimiento de UI *(se despliega sola, no toca ni un dato)*

Objetivo: que un nombre de 65 caracteres no rompa nada **antes** de que exista uno. Se puede validar hoy mismo renombrando un solo producto en local.

**P0 — rotura funcional o de negocio**

| # | Archivo:línea | Problema | Corrección |
|---|---|---|---|
| 1 | `pdepapel-admin/lib/mercadolibre/listings.ts:117` | `title: listing.product.name.trim()` sin tope; ML rechaza > 60 | `buildMarketplaceTitle()` + `throw` propio antes de la llamada |
| 2 | `pdepapel-store/app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx:984` | `<span>` sin clamp dentro de `max-h-20`; el texto se escapa y se superpone al precio | `line-clamp-2` + `min-w-0` + `title=` |
| 3 | `pdepapel-admin/components/labels/qr-label-print-sheet.tsx:213` | `line-clamp-2` sin elipsis, presupuesto físico 38/48 car. | Consumir `shortName`; añadir `text-overflow: ellipsis`; validar en la pantalla de revisión |
| 4 | `pdepapel-store/app/(routes)/producto/[slug]/page.tsx:44-51` + `app/layout.tsx:32-35` | Título SERP sobrepresupuestado | `title: { absolute: product.name }` (§4.3) |
| 5 | `pdepapel-admin/emails/reactivation-email.tsx:311-320` | `height: 40px; overflow: hidden` corta a ~48 car. sin aviso | Consumir `shortName`; sustituir por `line-clamp` con elipsis |

**P1 — degradación visible de layout**

| # | Archivo:línea | Problema | Corrección |
|---|---|---|---|
| 6 | `pdepapel-store/components/ui/product-card.tsx:170` | `<p className="font-sans text-lg font-semibold">` sin clamp; **un nombre largo infla toda la fila de la grilla** | `line-clamp-2` + `min-h` equivalente a 2 líneas para igualar las tarjetas |
| 7 | `pdepapel-store/app/(routes)/tienda/components/skeletons.tsx:44` y `components/home-skeletons.tsx:71` | `Skeleton h-4` asume 1 línea → **CLS** al hidratar | Ajustar el esqueleto al `min-h` de 2 líneas del punto 6 |
| 8 | `pdepapel-admin/components/ui/data-table.tsx:248` | `whitespace-nowrap` en **toda celda de toda tabla**; la columna de nombre empuja el resto fuera de pantalla | `cell` propio en cada columna de nombre: `max-w-[280px] truncate` + `title=`. El patrón correcto ya existe en `movimientos-inventario/components/columns.tsx:152` |
| 9 | `pdepapel-store/components/kit-contents.tsx:49-52` | Columna flex sin `min-w-0` junto a imagen `flex-shrink-0` → desborda y la `Card` la recorta | Añadir `min-w-0` |
| 10 | `pdepapel-store/components/product-info.tsx:209` | `<h1 class="text-3xl">` sin `max-w`; 3 líneas empujan el botón de compra bajo el pliegue en móvil | `text-2xl sm:text-3xl` + `text-balance` |

**P2 — truncado silencioso sin tooltip** *(añadir `title={product.name}` en todos)*

`components/search-item.tsx:53` · `components/navbar-cart-content.tsx:97` · `ventas-rapidas/.../point-of-sale-workspace.tsx:384` · `ferias/.../fair-event-workspace.tsx:845, 1113, 1236` · `components/ui/product-selector.tsx:109` · `components/ui/enhanced-product-selector.tsx:278` · `productos/[productId]/components/component-selector.tsx:291` · `modals/product-import-modal.tsx:273`

> Referencia del patrón correcto ya presente en el repo: `components/ui/async-product-select.tsx:97-101` (`truncate` **con** `title=`).

**P3 — exportaciones**

| # | Archivo:línea | Problema |
|---|---|---|
| 11 | `components/ui/data-table-action-options.tsx:328-368` | `generateCSV` no escapa comillas dobles; nombres más largos y descriptivos elevan la probabilidad de `"` y rompen la alineación de columnas |
| 12 | `lib/fair-reconciliation-template-xlsx.ts:134-190` | Columna B a 42 de ancho con `row.height = 30` fijo: por encima de ~84 car. recorta visualmente |

**Validación de la fase**

1. Test de Playwright que renombra un producto de prueba a 65 caracteres y hace *snapshot* de: tarjeta en grilla (móvil 2 col. y desktop 4 col.), ficha, carrito lateral, checkout, tabla de admin.
2. Test unitario de `buildMarketplaceTitle()` con casos de 40/59/60/61/80 caracteres.
3. Impresión de una hoja de etiquetas real con el nombre de 65 y verificación física.

**Criterio de salida:** un producto con nombre de 65 caracteres se ve correcto en las 5 superficies, ML publica sin error, y ninguna prueba existente se rompe.

---

### Fase 2 — Plumbing de datos *(1 migración manual)*

1. **Migración** `prisma/manual-migrations/AAAAMMDD_add_product_short_name.sql`:
   ```sql
   ALTER TABLE `Product` ADD COLUMN `shortName` VARCHAR(60) NULL;
   ```
   Protocolo del repo: editar schema → `prisma generate` → tests → SQL revisado → **aprobación explícita** → aplicar a Railway. Sin runner automático.
2. **Validación de longitud, que hoy no existe en ninguna capa:**
   - `product-form.tsx:76`: `z.string().min(1).max(70)` + `maxLength={70}` en el `<Input>`.
   - `shortName`: `z.string().max(60).optional()`.
   - Ruta API `products/route.ts:148` y la de update: rechazar > 70 en servidor.
   - Mismo tratamiento en `product-group-form.tsx:75`, `quotation-form.tsx:59`, `order-form.tsx:284`.
   *(El repo ya usa `.max(120)` para `brand` y `.max(70)` para `mpn`: la ausencia en `name` es un descuido, no un patrón.)*
3. **`preserveSlug`** en `PATCH /api/[storeId]/products/[productId]`: cuando es `true`, saltar `generateProductSlug` y `preserveProductSlugAlias` por completo (`route.ts:266-273` y `:357-366`). Es lo que materializa la decisión de congelar URLs.
4. **Consumidores de `shortName`** según la tabla de §4.1, siempre con `shortName ?? name`.
5. **Revalidación por lotes:** 898 llamadas a `POST /api/revalidate` no son viables de golpe. Encolar por lotes (p. ej. 25) con espera entre lotes, o revalidar por etiqueta de categoría. Documentar el comportamiento nuevo en `docs/revalidacion-catalogo.md`.

**Criterio de salida:** migración aplicada, tests de integración en Docker MySQL local (`TEST_DATABASE_URL` terminado en `pdepapel_test`) en verde, y renombrar un producto **no** cambia su slug ni crea alias.

---

### Fase 3 — Motor de generación

**Entrada por producto:** `name` actual, `description` (HTML de Tiptap, sanitizado a texto), `category.name`, `type.name`, `design.name`, `color.name`, `size.name`, `brand`, `price`, `sku`, si pertenece a `ProductGroup` y con qué hermanos, y la imagen principal.

**Salida por producto:**
```ts
{
  productId, currentName,
  proposedName,       // 50-65
  proposedShortName,  // <= 32
  proposedBrand,      // extraída, si es fabricante real
  slots: { tipo, descriptor, diseno, color, medida },
  confidence: 'alta' | 'media' | 'baja',
  flags: string[],    // 'licencia', 'categoria-dudosa', 'sin-descripcion', 'excede-ml'
  rationale: string   // una línea, para que el revisor no adivine
}
```

**Validador determinista** que corre **después** de la IA y antes de mostrar nada (esto no se delega al modelo):

- longitud dentro de 30–70; título ML derivado ≤ 60; `shortName` ≤ 32
- el sustantivo cabeza pertenece al diccionario canónico de esa categoría
- sin MAYÚSCULA SOSTENIDA, sin centinelas, sin emoji, sin nombre de tienda
- sin palabra repetida dentro del nombre
- **unicidad entre las 898 propuestas y contra los nombres existentes**
- si el producto está en un `ProductGroup`, los hermanos **deben** diferir en al menos una ranura
- marca licenciada → bandera de revisión obligatoria (riesgo legal/marcario)

**Confianza baja** cuando falta descripción, la categoría no coincide con el nombre actual (los 265 casos de §1.2), o el diseño es `Clásico`. Estos van a revisión manual sí o sí.

---

### Fase 4 — Pantalla de revisión `/{storeId}/productos/renombrado-masivo`

Es la pieza que convierte esto en un proceso repetible en vez de un script de un solo uso.

```
Filtros: [categoría ▾] [confianza ▾] [estado ▾] [solo con banderas ☐]     892 pendientes · 6 aprobados

[ ] SKU              Actual                 Propuesto                                    Long  ML  Validación
[x] PIN-GAT-MUL-S-L  Pin gato               Pin decorativo metálico diseño Gatito ...     54   ✅  ok
[x] MUG-KAW-PAS-S-L  Mug cute               Mug cerámico kawaii tonos pastel ... 350 ml   53   ✅  ok
[ ] LEG-STI-AZU-S-L  Lego Stitch            Bloques armables tipo Lego Stitch ... azul    52   ✅  ⚠️ licencia
[ ] BLO-CLA-MUL-S-L  Block BLOOMING AS ...  Stickers en block Blooming as Flowers ...     51   ✅  ⚠️ categoría dudosa

┌ Vista previa ────────────────────────────────────────────────────────────┐
│  [tarjeta móvil 2 col.]  [tarjeta desktop]  [<title> SERP]  [etiqueta QR] │
└──────────────────────────────────────────────────────────────────────────┘

[Aprobar seleccionados]  [Editar]  [Rechazar]  [Exportar CSV]  [Aplicar oleada →]
```

- **Vista previa en vivo** con los componentes reales, no maquetas: la tarjeta a ancho de móvil 2 columnas (el peor caso, `featured-products.tsx:88` usa `grid-cols-2 gap-1`), el `<title>` con conteo de píxeles, y la etiqueta QR a escala.
- Estado por producto: `pendiente | aprobado | rechazado | aplicado`.
- **Nada se escribe en `Product` hasta pulsar "Aplicar oleada".**

**Tabla de auditoría y rollback:**
```prisma
model ProductNameProposal {
  id            String   @id @default(uuid())
  storeId       String
  productId     String
  previousName  String
  previousShort String?
  proposedName  String
  proposedShort String?
  status        String   // pendiente | aprobado | rechazado | aplicado | revertido
  wave          Int
  appliedAt     DateTime?
  createdAt     DateTime @default(now())
  @@index([storeId, status])
  @@index([productId])
}
```
`previousName` es el rollback: revertir es un `UPDATE` desde esta tabla, no un restore de backup.

**Endpoint:** `POST /api/[storeId]/products/rename-batch` — recibe IDs aprobados, aplica en transacción con `preserveSlug: true`, escribe `InventoryMovement`… **no** (renombrar no es movimiento de inventario), encola revalidación por lotes y encola resync de ML por el outbox.

---

### Fase 5 — Despliegue en oleadas

| Oleada | Alcance | Criterio de avance |
|---|---|---|
| **0 — Piloto** | 25 productos de 8 categorías distintas, incluyendo 3 con variantes en `ProductGroup` y 3 publicados en ML | QA visual en móvil y desktop; las 3 publicaciones de ML actualizan sin error; etiquetas impresas legibles |
| **1 — Cabeza de catálogo** | Top 100 por ingresos de los últimos 12 meses | 14 días de observación en Search Console antes de continuar |
| **2 — Cola larga por categoría** | Resto de activos, categoría por categoría, empezando por las de mayor tráfico | Sin caída > 10 % de clics en la categoría anterior |
| **3 — Archivados** | `isArchived = true` | Sin urgencia; mantiene la consistencia para reactivaciones |

**Ritmo:** máximo una oleada por semana. Renombrar 898 productos en un día hace imposible atribuir cualquier cambio de tráfico.

**Regla de aborto:** si una oleada pierde > 15 % de clics orgánicos frente a la línea base a los 14 días, revertir esa oleada desde `ProductNameProposal.previousName` y revisar la gramática antes de seguir.

---

### Fase 6 — Medición

| Métrica | Fuente | Ventana | Expectativa |
|---|---|---|---|
| Impresiones de URLs de producto | Search Console | 30 / 60 / 90 días | ↑ — es el efecto principal: más consultas hacen *match* |
| Consultas únicas por URL de producto | Search Console | 60 días | ↑ fuerte (cola larga) |
| CTR | Search Console | 60 días | Neutro o ↑; una **caída** indica nombres demasiado largos, cortados en el SERP |
| Posición media | Search Console | 90 días | Puede empeorar levemente al principio: se rankea por más consultas, muchas más profundas |
| Búsquedas internas con 0 resultados | Telemetría propia | 14 días | ↓ — es lo que se mueve más rápido |
| Visitas por publicación en ML | ML | 30 días | ↑ |
| Rechazos en Google Merchant | Merchant Center | continuo | ↓ (por `brand` poblado y `size` corregido) |

Registrar cada oleada con su fecha en `docs/seguimiento-seo.md`, junto a la migración de slugs anterior, para que cualquier análisis futuro sepa qué cambió y cuándo.

---

## 6. Tabla de modos de falla

| Falla | Detección | Mitigación |
|---|---|---|
| Un nombre > 60 rompe la publicación en ML | Test unitario de `buildMarketplaceTitle`; validador de la pantalla | Tope duro que lanza antes de llamar a la API (Fase 1, P0-1) |
| ML no permite editar el título de publicaciones con ventas | Fallo del outbox en la oleada 0 | Verificar **antes** de la oleada 1; marcar esas publicaciones y resolverlas a mano o por relistado |
| La tarjeta se descuadra en móvil 2 columnas | Snapshot de Playwright a ancho móvil | `line-clamp-2` + `min-h` de 2 líneas (Fase 1, P0-6/7) |
| Un pedido histórico cambia de nombre | Test de regresión sobre `OrderItem.name` | El campo es instantánea (`schema.prisma:589`); el renombrado no lo toca |
| El slug rota y se pierde autoridad | Test de integración: renombrar y verificar que `slug` no cambia y no hay alias nuevo | `preserveSlug: true` (Fase 2-3) |
| Dos hermanos de `ProductGroup` reciben el mismo nombre | Validador de unicidad entre propuestas | Regla: los hermanos deben diferir en ≥ 1 ranura |
| Uso indebido de marca licenciada | Bandera obligatoria de revisión | Aprobación humana caso por caso; no describir un genérico como si fuera oficial |
| 898 revalidaciones tumban la tienda | Monitoreo de Vercel durante la oleada | Revalidación por lotes de 25 con espera (Fase 2-5) |
| La etiqueta física se vuelve ilegible | Impresión de prueba en la oleada 0 | `shortName` + elipsis; el SKU ya está en la etiqueta como respaldo |
| El CSV exportado se rompe con comillas | Prueba con un nombre que contenga `"` | Escapado correcto en `data-table-action-options.tsx` |
| Caída de tráfico atribuible a otra cosa | Solapamiento de cambios | Una oleada por semana; nada de despliegues SEO en paralelo |

---

## 7. Definición de hecho

Por fase, según `AI_AGENT_CONTEXT.md` §18 y §20:

- [ ] Causa raíz atendida dentro de la arquitectura y las reglas de negocio del repo
- [ ] Pruebas relevantes en verde + prueba de regresión del comportamiento que se estaba rompiendo
- [ ] Impacto considerado en UI, SEO, caché, inventario y pagos
- [ ] Sin secretos, archivos temporales ni archivos de agente en el *stage*
- [ ] Migración documentada en `prisma/manual-migrations/` y aplicada de forma deliberada
- [ ] Servidores y contenedores locales detenidos
- [ ] **Aprobación explícita del usuario antes de cualquier `git push`**
- [ ] `docs/AI_AGENT_CONTEXT.md` y `docs/seguimiento-seo.md` actualizados en el mismo commit

---

## 8. Orden recomendado de ejecución

1. **Fase 1 completa y desplegada** — es reversible, no toca datos y hace visible cualquier problema de layout de inmediato.
2. **Fase 0** en paralelo (solo exportar y medir).
3. **Fase 2** (migración + `preserveSlug` + validaciones).
4. **Fase 3** sobre una muestra de 40–60 productos para calibrar la gramática antes de construir la pantalla.
5. **Fase 4** (pantalla de revisión).
6. **Fase 5** oleada 0 → 1 → 2 → 3.
7. **Fase 6** en continuo, con corte a 30/60/90 días.

> El punto 4 es deliberadamente anterior al 5: es mucho más barato descubrir que la gramática no funciona con 50 nombres a mano que con una pantalla ya construida alrededor de ella.
