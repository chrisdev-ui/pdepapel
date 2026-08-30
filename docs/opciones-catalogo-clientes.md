# Opciones de catálogo para clientes

Esta guía explica cómo reemplazar filtros confusos como `S`, `S+` o `M-P` sin modificar la logística, el SKU ni el inventario de los productos.

## Qué cambia y qué no

### Se agrega

- Un **perfil logístico interno** separado para conservar el significado operativo del tamaño actual.
- Opciones visibles y comprensibles para clientes, por ejemplo:
  - `Formato: A5`
  - `Capacidad: 500 ml`
  - `Medida: 15 cm`
  - `Cantidad: 12 colores`
  - `Punta: Fina`
- Iconos de categorías y tipos guardados aparte del nombre. La tienda puede mostrar `📒 Cuadernos`, mientras APIs, búsquedas y SEO usan el nombre canónico `Cuadernos`.

### No se modifica

- Tamaño interno existente.
- SKU.
- Stock o movimientos de inventario.
- Precio o costo.
- Nombre del producto.
- URL/slug.
- Fotos.
- Pedidos históricos.
- Publicaciones de Mercado Libre.

## Antes del despliegue

1. Crear un respaldo verificable de Railway.
2. Revisar `pdepapel-admin/prisma/manual-migrations/20260828_add_catalog_options.sql`.
3. Aplicar esa migración manual antes de desplegar el código correspondiente.
4. Confirmar que la migración terminó sin errores.
5. Desplegar administración y tienda en línea juntas.
6. Verificar que `/tienda`, una categoría y un producto cargan normalmente antes de preparar propuestas.

No ejecutar `prisma db push` ni pruebas de integración contra Railway.

## Migrar productos existentes

1. Abrir **Productos → Opciones para clientes**.
2. Revisar los indicadores:
   - **Productos activos:** productos disponibles para revisar.
   - **Perfil logístico separado:** productos ya migrados.
   - **Pendientes:** productos que todavía usan solo la estructura anterior.
3. Pulsar **Preparar propuestas**.
   - Revisa hasta 100 productos pendientes por vez.
   - No guarda cambios en productos.
   - Detecta únicamente valores explícitos en el nombre, como A5, 500 ml o 12 hojas.
4. Abrir **Revisar o editar opciones visibles** en cada fila.
5. Mantener solo opciones que ayuden a una clienta a elegir entre productos o variantes.
6. Pulsar **Guardar opciones** si se editó una fila. Una fila con cambios sin guardar no puede seleccionarse ni aplicarse.
7. Seleccionar únicamente las propuestas revisadas.
8. Opcionalmente pulsar **Analizar fotos** cuando una característica comercial sea visible y no aparezca en el nombre.
   - Analiza hasta 20 filas seleccionadas por ejecución.
   - Usa como máximo tres fotos por producto.
   - Reutiliza análisis en caché y no aplica cambios automáticamente.
   - Solo deben enviarse fotos públicas del catálogo, nunca datos de clientes, pedidos o facturas.
9. Revisar nuevamente cualquier propuesta marcada **Revisar IA**.
10. Pulsar **Aplicar seleccionadas**, leer el resumen y confirmar.
11. Repetir el proceso hasta que **Pendientes** llegue a cero.

## Cómo decidir una opción visible

Agregarla cuando la clienta pueda reconocerla y usarla para escoger el producto correcto.

| Situación | Decisión |
| --- | --- |
| Cuaderno A5 y cuaderno Carta | Usar `Formato` |
| Botella de 500 ml y 1 L | Usar `Capacidad` |
| Marcador de punta fina y gruesa | Usar `Punta` |
| Paquete de 12 y 24 colores | Usar `Cantidad` |
| Código interno `M-P` | No mostrar |
| Producto sin una medida elegible | No inventar una opción |
| Color/diseño ya gestionado como variante | Evitar duplicarlo como opción genérica |

Una propuesta puede quedar sin opción comercial. En ese caso es válido aplicar únicamente la separación del perfil logístico.

## Productos nuevos y ediciones futuras

El formulario de producto contiene **Opciones visibles para clientes**.

1. Elegir primero una característica sugerida para la subcategoría, cuando corresponda.
2. Al escribir en **Característica**, seleccionar el nombre existente que aparece en el autocompletado; por ejemplo `Formato`, no crear `Formato del cuaderno`.
3. Después elegir un valor existente sugerido para esa característica; por ejemplo `A5`.
4. Escribir una característica o valor nuevo únicamente cuando ninguna sugerencia describa correctamente el producto. La opción nueva no se crea hasta guardar el producto.
5. Agregar solo datos confirmables y usar valores limpios: `A5`, no `A5 interno M-P`.
6. No repetir una característica dentro del mismo producto. El formulario avisa y bloquea el guardado si detecta una repetición canónica.
7. Mantener un máximo de ocho opciones; normalmente una o dos son suficientes.
8. Revisar cualquier propuesta cargada por IA antes de guardar el formulario.

Al guardar, la sincronización elimina de ese producto las asignaciones visibles que ya no estén en el formulario. No elimina valores compartidos por otros productos.

## Verificación después de cada lote

1. Abrir `/tienda` en móvil y escritorio.
2. Confirmar que no aparece un filtro con `S`, `S+`, `M-P` o códigos equivalentes.
3. Confirmar que cada opción muestra valores y cantidades correctas.
4. Seleccionar un valor y comprobar que solo aparecen productos compatibles.
5. Combinar dos opciones diferentes y comprobar que ambas condiciones se cumplen.
6. Abrir una categoría y confirmar que solo muestra opciones asignadas a esa categoría.
7. Abrir un producto migrado y confirmar sus opciones comerciales.
8. Revisar stock, SKU, precio y URL del mismo producto en administración.
9. Confirmar que una URL anterior de categoría/tipo continúa funcionando.

## Si algo no se ve bien

- No editar el tamaño interno para corregir un filtro público.
- Corregir las opciones visibles desde el producto o desde la propuesta pendiente.
- Si el producto ya fue aplicado, editarlo en su formulario normal.
- Si la tienda muestra datos anteriores, revisar la revalidación del catálogo y `REVALIDATION_SECRET` en ambos proyectos.
- No borrar tablas ni ejecutar una reversión masiva mientras existan productos usando las nuevas relaciones. Primero detener el despliegue, restaurar la versión anterior del código y preparar una reversión de datos revisada.

## Resultado esperado

La clienta filtra por términos reales de compra y deja de ver códigos internos. Administración conserva sus reglas de logística, inventario y SKU sin tener que editar cada producto manualmente antes de iniciar el proceso: las propuestas se preparan por lotes, se pueden enriquecer con IA y siempre requieren revisión humana antes de aplicar.
