# Lecturas pesadas de los cargadores de análisis (2026-10-10)

Inventario hecho después del incidente de memoria de MySQL del 2026-10-09. Este bloque **no** reescribe los cargadores: lo hará la v2 del copiloto con fotos diarias (`docs/design/asistente-experto-paula.md` §5). Aquí solo se corrigió lo que era un cambio de una línea que no altera el resultado.

Las cifras de tamaño no van en este archivo. Se miden con `information_schema.TABLES` (aproximado, sin recorrer tablas) cuando haga falta.

## El riesgo es el tamaño de cada fila, no la cantidad de filas

Las tablas son pequeñas. Lo pesado es `Shipping.guidePdfBase64`: el PDF de cada guía en base64, en una columna LongText. Por eso `Shipping` pesa más que `Order` teniendo menos filas. Un `include: { shipping: true }` trae esos PDF a la memoria de la función de Vercel, y MySQL tiene que armarlos en su búfer.

## Corregido en este bloque

| Cargador | Antes | Ahora |
|---|---|---|
| `getCustomerIntelligence` (`actions/get-customer-intelligence.ts`) | todos los pedidos con ingreso desde siempre, con `payment` y `shipping` completos (incluye el PDF de la guía) | mismas filas; de `payment` solo `method` y de `shipping` solo `cost`, que es lo único que lee `getOrderNetProfit` |
| `getMonthlyFinancialSummary` / `getDailyFinancialBreakdown` (`actions/get-financial-analytics.ts`) | un mes de pedidos con `payment` y `shipping` completos | mismo cambio de `select` |

El trabajo de reactivación usa el mismo cargador, así que también deja de leer los PDF.

## Pendiente para la v2 (fotos diarias)

| Cargador | Qué recorre | Riesgo | Por qué no se tocó aquí |
|---|---|---|---|
| `getCustomerIntelligence` | todos los pedidos con ingreso, de siempre, con sus líneas | crece con cada pedido; sin ventana de fechas | una ventana cambiaría quién es VIP o inactiva; un `take` truncaría en silencio |
| `rankProductProfitForSystemJob` con ventana de 180 días (clasificación ABC, apagada) | seis meses de pedidos y ventas de Mercado Libre con líneas | medio | el trabajo está apagado |
| `getDeadInventory` | productos con stock creados hace más de N días, con las filas completas del producto (incluida la descripción HTML) y una subconsulta por producto | medio; crece con el catálogo | se resuelve con la foto diaria por producto |
| `getInventoryRisk` | todos los productos activos y un `IN` con todos sus ids | bajo hoy; crece con el catálogo | igual |
| Inicio: `getGraphRevenue`, `getSalesCount`, `getSalesData`, `getCategorySales` | un año de pedidos, cuatro veces por carga de Inicio | medio; crece con las ventas del año | los cuatro leen el mismo año: una sola foto los resuelve |
| `getMercadoLibreListingProfitability` (`lib/mercadolibre/profitability.ts`) | todas las ventas de Mercado Libre, sin ventana | bajo hoy; crece con las ventas | igual |
| `getMercadoLibreHealthSummary` con finanzas | todas las ventas de Mercado Libre con su neto | bajo hoy | igual |
| `getOrdersWithoutGuide` (`actions/get-orders-without-guide.ts`) | pedidos pagados sin guía con `shipping` completo | bajo | nadie lo llama; candidato a borrar |

## Cargadores sin uso

Nadie los llama desde el panel; solo los usa una prueba de integración o ninguna:

- `actions/get-average-order-value.ts`
- `actions/get-total-revenue.ts`
- `actions/get-orders-without-guide.ts`
- `actions/get-products.ts`

Quedan con guardia de dueña hasta que se decida borrarlos.
