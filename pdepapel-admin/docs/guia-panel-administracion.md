# Guía del panel de administración (rediseño 2026-09)

Cómo se atiende la tienda desde el panel: qué mirar primero cada día, cómo
mover un pedido de pagado a entregado, cómo vender en mostrador o en una
feria y cómo mantener el catálogo. Pensada para quien administra hoy y para
quien se una al equipo mañana.

La versión ilustrada, con capturas de cada pantalla, índice lateral y modo
claro/oscuro, está dentro del panel, solo para cuentas con sesión:
**https://admin.papeleriapdepapel.com/manual** (el contenido vive en
`pdepapel-admin/content/manual/`). Este archivo es la misma guía en texto,
versionada junto al código.

> Las capturas del manual provienen de una tienda de pruebas; nombres,
> pedidos y cifras son ficticios.

## 1. Antes de empezar

- El panel vive en `admin.papeleriapdepapel.com`. La tienda pública
  (`papeleriapdepapel.com`) lee todo lo que aquí se guarda y se actualiza sola
  en segundos.
- Se entra con la cuenta autorizada por la dueña (correo o Google). Cada
  acción queda registrada con tu usuario: no compartas la sesión.
- Vocabulario: **tienda en línea** (pública), **panel** (privado), **pedido**
  (cualquier venta: tienda, presencial, feria, cotización, personalizado),
  **punto de venta** (mostrador), **feria** (evento presencial con reserva y
  conciliación), **cápsula sorpresa** (producto aleatorio con QR único que por
  dentro es un producto real), **publicación** (anuncio de Mercado Libre, no
  una venta), **venta de Mercado Libre** (pedido pagado allí; se registra el
  neto cobrado), **guía** (etiqueta de envío con seguimiento).

## 2. Cómo se recorre el panel

- **Barra lateral** por grupos: Ventas (Pedidos, Punto de venta, Ferias,
  Mercado Libre, Envíos, Clientes), Catálogo (Productos, Atributos,
  Proveedores, Contenido de la tienda), Inventario (Inventario, Movimientos,
  Aprovisionamiento), Marketing (Promociones, Boletín), Reportes
  (Rendimiento, Tributarios) y Ajustes. Los contadores junto a Pedidos e
  Inventario indican pendientes. El botón superior izquierdo contrae la barra.
- **Buscador de acciones**: `⌘K` / `Ctrl+K` y escribe lo que quieres hacer.
- **Pestañas y vistas**: las vistas (Por atender, Por verificar, En camino…)
  son colas de trabajo con contador; quedan en la URL, así que el enlace se
  puede compartir.
- **Tablas**: buscar filtra todas las columnas; «Columnas» oculta las que no
  uses; marcar filas abre la **barra de selección** con acciones en lote
  (siempre con confirmación); el menú de tres puntos de cada fila tiene las
  acciones individuales; la columna **Siguiente paso** muestra el botón que
  resuelve lo que ese registro necesita.
- **Guardar**: los formularios largos tienen barra fija abajo con «Guardar
  cambios» y «Descartar cambios». Las acciones irreversibles abren un diálogo
  que dice exactamente qué pasa; el botón rojo confirma.
- **Teléfono**: barra inferior con Inicio, Pedidos, Vender (botón central que
  abre el punto de venta), Inventario y Más. Las tablas se ven como tarjetas.

## 3. Inicio: el día de hoy (`/`)

1. Cuatro tarjetas: ventas de hoy (el ojo oculta la cifra), por despachar,
   pagos por verificar y stock crítico. Cada una enlaza a su lista.
2. **Pendientes de acción**: lo urgente en orden; el botón de cada fila lleva
   al lugar donde se resuelve.
3. **Esta semana** (tienda en línea vs presencial) y **Más vendidos · 7 días**.
4. **Registrar venta presencial** abre el punto de venta.
5. **Más análisis** guarda las gráficas por año, inventario y analíticas.

Rutina sugerida: vaciar «Pendientes de acción» y luego Pedidos › Por atender.

## 4. Pedidos (`/pedidos`, `/pedidos/<id>`)

Vistas: **Por atender** (todo lo que necesita acción hoy), **Por verificar**
(transferencias por confirmar), **Por despachar** (pagados sin guía), **En
camino**, **Cotizaciones**, **Todos**. La columna Canal distingue Tienda,
Presencial, Feria, Cotización o Mercado Libre.

La página de un pedido tiene: título con insignias (canal, pago, envío) y
teléfono que abre WhatsApp; línea de tiempo Creado › Pagado › Guía › En camino
› Entregado; banner con el siguiente paso; «Links y Pagos» (link de pago o
datáfono) y «Descargar recibo»; secciones Productos, Cliente, Estado de la
orden, Descuentos y cupones, Envío y empaque, Zona de cuidado.

**Verificar una transferencia**

1. Confirma en el banco que llegó el valor exacto.
2. Pulsa «Marcar como pagado» (lleva a «Estado de la orden»).
3. Selecciona el paso **Pagado**.
4. «Guardar cambios». Ahí se descuenta el inventario, se guarda la fecha de
   pago y el pedido pasa a Por despachar.

Regla: Bold y Wompi confirman solos por webhook. La transferencia solo se
marca pagada a mano tras ver el comprobante. Nunca «para adelantar».

**Crear la guía**: «Ir a envío» › elegir Recoger en tienda, Transportadora
integrada (cotiza y crea la guía) o Envío manual (transportadora, guía y
costo) › guardar. La guía queda en el pedido y se imprime desde Envíos.

**Nuevo pedido**: botón «Nuevo pedido» en cualquier pantalla; cinco pasos
(Productos, Cliente, Descuentos, Pago, Envío). Nada se descuenta hasta marcar
pagado. Las plantillas de cotización viven en el submenú de Pedidos.

Menú de fila: copiar ID o número, link de pago (si no está pagado), datáfono
(pedidos completados), ver detalle; eliminar solo si nunca se pagó.

## 5. Punto de venta (`/ventas-rapidas`)

**Vender**

1. Agrega productos escaneando (lector o cámara), escribiendo el código
   (SKU o código de barras) y «Agregar código», o buscando en el catálogo.
2. Ajusta cantidades en «Venta actual»; no deja vender más de lo que hay.
3. Elige Efectivo o Transferencia.
4. «Registrar pago» y confirma. Se crea el pedido pagado y se descuenta el
   inventario.

«Cierre del día» suma lo presencial de hoy por método de pago.

**Etiquetas**: hoja adhesiva con el código de cada producto; elige producto,
cantidad y formato, agrega a la hoja e imprime. Una etiqueta se reutiliza.

Dentro de un evento vende desde Ferias, no desde el punto de venta.

## 6. Ferias (`/ferias`)

Fases: **Preparar** (reservar stock y armar cápsulas) › **Vender** › **Conciliar**
› **Cerrada**.

1. «Nueva feria»: nombre, lugar y fechas.
2. En Preparar, reserva las unidades que vas a llevar (dejan de venderse en
   línea). Opcional: arma cápsulas sorpresa eligiendo el producto reservado,
   la cantidad y el precio; se valida el margen mínimo y se genera un QR por
   cápsula.
3. «Abrir feria» al llegar al evento.
4. Vender: mismo punto de venta, pero solo con lo reservado y las cápsulas.
   Cada venta queda como pedido pagado del canal Feria.
5. Conciliar y cerrar: por producto, devuelto, dañado y perdido. Lo devuelto
   vuelve a la tienda en línea; daños y pérdidas quedan como movimientos.

El cierre es irreversible. Una feria pasada sin conciliar se resuelve con
«Conciliar feria anterior» en Movimientos (crea movimientos, no ventas).

## 7. Mercado Libre (`/mercadolibre`)

Pestañas: Resumen, Publicaciones, Ventas, Preguntas y reclamos, Envíos,
Anuncios y videos. Reglas: el precio de Mercado Libre es independiente del de
la tienda (nunca se copian solos); el inventario local es la fuente de verdad
(publicación = stock menos reserva de seguridad); una venta registra el neto
cobrado o queda «Liquidación pendiente» hasta que llegue la liquidación. Lo
urgente aparece también en Inicio y en el correo diario.

## 8. Envíos (`/envios`)

Vistas: Por despachar, Despachados hoy, En camino, Con novedad, Entregados.

1. En Por despachar, «Lista de recogida» imprime lo que hay que empacar (o
   solo lo seleccionado).
2. «Abrir en el pedido» para crear la guía si falta.
3. Selecciona filas y «Cambiar estado» para marcar despachado, recogido, en
   tránsito, en reparto, entregado o incidencia.
4. Menú del encabezado: Sincronizar con EnvioClick, actualizar envíos
   manuales, Exportar CSV.

Revisa «Con novedad» a diario.

## 9. Clientes y reseñas (`/clientes`)

Segmentos: **VIP** (10 % que más gasta), **Recurrente** (2+ compras),
**Ocasional** (1), **Inactivo** (>90 días sin comprar), **Sin compra**. La
ficha muestra compras pagadas, gastado, unidades, última compra, pedidos y lo
que más compra, con botón de WhatsApp.

**Reseñas** (pestaña): vistas Todas, Sin responder, Por atender (≤2
estrellas), Ocultas. Desde el menú de la fila: **Responder** (se publica bajo
la reseña como «Respuesta de P de Papel»), **Ocultar de la tienda** /
**Publicar**, **Eliminar** (solo cuando ocultar no basta).

## 10. Productos (`/productos`, `/productos/<id>`)

Vistas: Activos, Sin completar, Stock crítico, Agotados, Archivados, Todos.
Columna «Listo para vender» resume qué falta.

Acciones en lote: Archivar (desaparece de la tienda, conserva historial),
Restaurar, Destacar, Quitar destacado. Cambios de precio o atributos en masa:
Gestión masiva.

Ficha por secciones: Imágenes (marca la principal), Modo Kit / Combo (stock
calculado por componentes), Información básica (nombre 50–65 caracteres, sin
emojis), Precio y margen, Inventario (cambios auditables), Identificadores
(**SKU** interno escaneable; **GTIN** código de barras real, nunca inventado;
**MPN** referencia del fabricante; o «No tiene identificador global»),
Clasificación y atributos (selectores con búsqueda), Visibilidad (Destacado,
Archivado), Descripción (editor con formato). La lista «Listo para vender» se
pone verde cuando todo está completo; Google Merchant exige imagen, precio e
identificador.

Nuevo producto: sube la foto primero; el asistente sugiere nombre, categoría,
color y diseño. Submenú: Grupo con variantes, Gestión masiva, Nombres para
búsqueda, Opciones para clientes.

## 11. Atributos (`/atributos`)

Pestañas: Categorías, Subcategorías, Tamaños, Colores, Diseños, Opciones para
clientes. Interruptor Activos / Archivados.

- **Archivar** retira el atributo de formularios y tienda sin tocar los
  productos que ya lo usan. **Restaurar** lo devuelve. **Eliminar** solo si
  ningún producto lo usa.
- Una subcategoría con productos activos no se archiva (mueve o archiva los
  productos antes); una categoría con subcategorías activas tampoco.
- Los nombres van sin emojis; el icono se elige aparte. Las URL antiguas se
  conservan como alias.

## 12. Proveedores y aprovisionamiento (`/proveedores`, `/aprovisionamiento`)

Proveedores: a quién se compra. Aprovisionamiento: pedidos a proveedores; al
recibir, sube el inventario con movimiento «Reposición recibida» y costo. Un
pedido de aprovisionamiento no es una factura: las facturas de compra se
registran para tributarios con su número.

## 13. Contenido de la tienda (`/contenido`)

Pestañas Portada (diapositivas), Banners (banner principal único y banners con
enlace) y Redes en la tienda (publicaciones sociales). Imágenes horizontales y
ligeras; los cambios se reflejan al guardar.

## 14. Inventario y movimientos (`/inventario`, `/movimientos-inventario`)

Inventario: una lista valorada al costo con vistas Stock crítico, Agotados,
Sin costo y Kits. «Ajustar inventario»: producto, cantidad (+/−) y motivo
(conteo, daño, pérdida, uso interno, promoción); queda un movimiento con
usuario, fecha y stock anterior/nuevo. Movimientos es el historial completo.
Nunca se edita el stock por fuera de un movimiento.

## 15. Promociones (`/promociones`)

Ofertas (rebajan precio por periodo; etiqueta pública) y Cupones (código al
pagar; «Generar códigos» crea varios). Contadores: vigentes, programadas,
vencidas, desactivadas; las vigencias se recalculan cada día. Una oferta
vencida gana sobre «activa».

## 16. Boletín (`/boletin`)

Solo las confirmadas se exportan («Exportar confirmados»); «Dar de baja»
retira a quien lo pida. El envío del boletín se hace fuera del panel.

## 17. Rendimiento y tributarios (`/rendimiento`, `/reportes-tributarios`)

Rendimiento: Resumen y caja (reserva para impuestos, reinversión, retiro
sugerido), Productos y riesgos (ingresos vs beneficio, inventario muerto,
riesgo de agotarse, inactivos, VIP), Envíos. Este panel decide, no mueve
dinero: registra gastos y retiros reales y valida con el contador.

Tributarios: Excel de ventas y compras del periodo; «Revisión previa» avisa si
algo impide exportar; incluye pedidos pagados o enviados, ventas de Mercado
Libre liquidadas y facturas de compra.

## 18. Ajustes (`/configuracion`)

Tienda (logo, datos, redes, políticas); Envíos y empaques (umbral de envío
gratis, cajas); Pagos (Bold por defecto, Wompi respaldo, transferencia manual;
solo se ve si está configurado); Integraciones (Mercado Libre, transportadoras,
analítica, correos, imágenes, Google Merchant); Avanzado (caché, limpieza de
imágenes, zona de cuidado). «Eliminar tienda» no se puede deshacer.

## 19. Estados

| Pago | Significa | Siguiente paso |
| --- | --- | --- |
| Pendiente | Sin pago | Esperar o enviar link de pago |
| Por verificar | El cliente dice que transfirió | Ver comprobante, marcar pagado |
| Pagado | Confirmado; inventario descontado | Crear guía |
| Enviado | Con guía | Seguir rastreo |
| Entregado | Recibido | — |
| Cancelado | No se completó | Si estaba pagado, el inventario volvió |

Envío: Preparando › Despachado › Recogido › En tránsito › En reparto ›
Entregado; con novedad: Entrega fallida, Devuelto, Cancelado, Incidencia.
Feria: Preparar › Vender › Conciliar › Cerrada. Atributos y productos:
Activo / Archivado; «Faltan N» en «Listo para vender».

## 20. Si algo no cuadra

| Lo que ves | Qué revisar |
| --- | --- |
| La tienda muestra lo anterior | Espera y recarga; luego Ajustes › Avanzado › limpiar caché |
| «Pagado» pero no bajó el stock | Movimientos › buscar el pedido; si no hay movimiento, avisa a soporte antes de tocar inventario |
| Transferencia «pendiente» | Normal: verifica en el banco y marca pagado |
| Falta un color o categoría en el formulario | Está archivado: Atributos › Archivados › Restaurar |
| El lector no agrega | Cursor en «Código de barras o QR» y SKU existente; escríbelo y «Agregar código» |
| Mercado Libre «Sin conectar» | Resumen › Conectar (solo la dueña) |
| Aviso rojo al guardar | Falta un dato obligatorio; corrige y guarda |
| «No tienes permisos» | Acción solo para la dueña |

## 21. Primer día en el equipo

- [ ] Entrar y ver la tienda P de Papel.
- [ ] Recorrer Inicio: tarjetas y pendientes.
- [ ] Cambiar de vista en Pedidos y abrir uno.
- [ ] Verificar un pago de prueba acompañado.
- [ ] Crear una guía manual y encontrarla en Envíos.
- [ ] Registrar una venta en el punto de venta escaneando.
- [ ] Buscar un cliente y abrir su WhatsApp.
- [ ] Completar algo que falte en un producto.
- [ ] Archivar y restaurar un color en Atributos.
- [ ] Leer los capítulos 19 y 20.

Documentación técnica: `docs/AI_AGENT_CONTEXT.md` en la raíz del repositorio y
los manuales de `pdepapel-admin/docs/` (feria, punto de venta, Mercado Libre,
reportes tributarios).
