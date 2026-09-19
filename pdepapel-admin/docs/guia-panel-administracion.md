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
pagado. Las cotizaciones por enlace y sus plantillas se retiraron en
septiembre de 2026: los pedidos de tipo cotización que ya existían se siguen
viendo en la pestaña «Cotizaciones», pero no se crean nuevos.

Menú de fila: copiar ID o número, link de pago (si no está pagado), datáfono
(pedidos completados), ver detalle; eliminar solo si nunca se pagó.

## 5. Punto de venta (`/ventas-rapidas`)

**Vender**

1. Una sola casilla «Buscar o escanear»: nombre, SKU o código de barras,
   lector de mano (Enter), cámara o celular vinculado. La lista se ordena
   para vender: código exacto, con unidades (más vendidos primero),
   agotados al final y sin poderse agregar. Cada fila trae color/tamaño y el
   precio con la oferta vigente.
2. En la venta cada línea muestra la variante, «antes $ …» si hay oferta y,
   en un kit, qué descuenta. Ajusta cantidades; no deja vender más de lo que
   hay.
3. Elige Efectivo, Transferencia (pide la referencia, mínimo 4 caracteres) o
   Datáfono (el cobro va a Bold; la venta queda pendiente hasta que Bold
   confirma y solo entonces descuenta inventario).
4. «Registrar pago» (en celular está en la barra fija de abajo) y confirma.
   Aparece la tarjeta Venta registrada: enlace al pedido, recibo PDF,
   WhatsApp, «Deshacer» durante 30 minutos (cancela el pedido y devuelve el
   inventario) y «Nueva venta».

Las ofertas de la tienda aplican en el mostrador; no hay descuento manual.
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
3. «Abrir para ventas» al llegar al evento.
4. Vender: mismo punto de venta, pero solo con lo reservado y las cápsulas.
   Cada venta queda como pedido pagado del canal Feria. Una venta equivocada
   se anula desde «Últimas ventas» en la feria (vuelve a la reserva; el
   inventario en línea no cambia); Pedidos no deja editarla ni borrarla.
5. «Pasar a conciliación» detiene las ventas (se puede «Reabrir ventas»).
   Por producto: devuelto, dañado y perdido; cada fila dice si cuadra. El
   botón «Cerrar la feria» se activa cuando todo cuadra y el diálogo repite
   las cifras: lo devuelto vuelve a la tienda en línea, daños y pérdidas
   quedan solo en la feria, las cápsulas empacadas se anulan.

El cierre es irreversible. La feria cerrada muestra sus cifras y enlaces al
kardex, a sus ventas y a «Conciliar feria anterior» (también desde el botón
en la lista de Ferias), que crea movimientos, no ventas.

## 7. Mercado Libre (`/mercadolibre`)

Pestañas: Resumen, Publicaciones, Ventas, Preguntas y reclamos, Envíos,
Anuncios y videos. Reglas: el precio de Mercado Libre es independiente del de
la tienda (nunca se copian solos); el inventario local es la fuente de verdad
(publicación = stock menos reserva de seguridad); una venta registra el neto
cobrado o queda «Liquidación pendiente» hasta que llegue la liquidación. Lo
urgente aparece también en Inicio y en el correo diario.

Ventas: la lista abre en «Por atender». Cada fila muestra el estado de la
venta y el del inventario. «Inventario con excepción» → corrige la causa y
pulsa «Re-sincronizar»; «Retorno físico pendiente» (venta cancelada o
reembolsada) → con la mercancía en la mano pulsa «Confirmar retorno físico»;
«Esperando liquidación» → nada, se reintenta solo. Un reembolso parcial
sigue contando como venta por su neto; uno total no. La tarjeta «Importar
una venta anterior a la integración» es solo para ventas de antes de
conectar la cuenta y puede traer los cargos desde Mercado Libre.

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

Vistas: Activos, Sin completar, Sin identificador (sin GTIN y sin la marca
«No tiene identificador global»), Stock crítico, Agotados, Archivados, Todos.
Columna «Listo para vender» resume qué falta; la columna GTIN muestra el
código, «Sin identificador» o «Falta».

Acciones en lote: Archivar (desaparece de la tienda, conserva historial),
Restaurar, Destacar, Quitar destacado, Marcar sin identificador (para los que
de verdad no tienen código de barras: se marcan y se vacían GTIN y MPN; nunca
se inventa un GTIN) y Marcar/Quitar próximamente (fecha de llegada: la tienda
los muestra «Llega el…» sin botón de compra). Cambios de precio o atributos en
masa: Gestión masiva.

Ficha por secciones: Imágenes (marca la principal), Modo Kit / Combo (stock
calculado por componentes), Información básica (nombre 50–65 caracteres, sin
emojis), Precio y margen, Inventario (cambios auditables), Identificadores
(**SKU** interno escaneable; **GTIN** código de barras real, nunca inventado;
**MPN** referencia del fabricante; o «No tiene identificador global»),
Clasificación y atributos (selectores con búsqueda), Visibilidad (Destacado,
Archivado, Disponible desde), Descripción (editor con formato). La lista «Listo para vender» se
pone verde cuando todo está completo; Google Merchant exige imagen, precio e
identificador.

Nuevo producto: sube la foto primero; el asistente sugiere nombre, categoría,
color y diseño. Nace marcado «No tiene identificador global»; si el empaque
trae código de barras, desmarca la casilla y escribe el GTIN real. Submenú: Grupo con variantes, Gestión masiva, Nombres para
búsqueda, Opciones para clientes.

## 11. Atributos (`/atributos`)

Una sola pantalla con seis pestañas: Categorías, Subcategorías, Tamaños,
Colores, Diseños y Opciones para clientes. Cada pestaña tiene su interruptor
Activos / Archivados, su buscador y su botón «Nuevo…». En celular la fila de
pestañas se convierte en el selector «Qué atributo ver» (las seis con su
conteo) y cada fila es una tarjeta con su casilla y su menú «···».

### Lo que es igual en las cinco listas

- **Orden por nombre** (tamaños por código: XS, XS+, S, S+…), así los
  parecidos quedan juntos.
- **Columnas:** nombre con sus pistas, uso (barra proporcional a la fila más
  usada y número), Estado, Actualizado (hace cuánto se tocó) y el menú.
- **Pistas junto al nombre:**
  - «Repetido con «X»»: mismo nombre salvo mayúsculas, tildes o espacios.
  - «Parecido a «X»»: singular/plural (Cinta / Cintas), uno es el otro más
    palabras (Osito / Osito panda) o comparten raíz (Rosa pastel / Rosado).
  - «Sin productos» (o «Sin subcategorías» en categorías).
  - «Nombre por corregir»: empieza en minúscula o trae espacios de más. Al
    abrir la ficha ya se ve cómo quedará al guardar.
  - Solo colores: «Valor con espacio al final», «Valor no válido», «Mismo
    tono que N más». Solo categorías: «Sin icono».
- **Filtro «Revisar»:** deja solo las filas con una pista concreta; cada
  opción dice cuántas hay. Se combina con el buscador y con «Limpiar».
- **Menú de fila («···»)**, en este orden: Editar · Ver sus productos (abre
  Productos filtrado por ese valor, archivados incluidos) · Ver en la tienda
  (categorías y subcategorías) · Unir con… · Archivar o Restaurar · Eliminar
  (apagado con la razón: «tiene 92 productos») · Copiar ID.
- **Con filas marcadas** aparece la barra de lote: Unir en uno… (dos o más
  activas), Mover a otra categoría… (solo subcategorías), Archivar o
  Restaurar, y Eliminar… solo cuando ninguna de las marcadas tiene uso. En
  celular los botones van a todo el ancho con el texto completo.
- **Archivar** retira el valor de formularios y tienda sin tocar los
  productos que ya lo usan; **Restaurar** lo devuelve. **Eliminar** solo si
  ningún producto lo usa (los archivados también cuentan).

### Unir con…

Para juntar dos valores que son el mismo (Rosa pastel y Rosado, Osito panda
y Osito, Cinta y Cintas resaltadoras). Vale para subcategorías, tamaños,
colores y diseños; no para categorías.

1. Desde el menú de una fila («Unir con…»), desde varias marcadas («Unir en
   uno…», eliges cuál se queda; por defecto la más usada) o desde la ficha
   (tarjeta «Unir con otro», o el botón que aparece bajo el nombre cuando hay
   un parecido).
2. Elige el valor que **se queda**. La ventana dice cuántos productos pasan
   (archivados incluidos), cuántos grupos con variantes toca y, en
   subcategorías, cuántas ofertas y alias de URL se llevan.
3. Si algún grupo quedaría con **dos variantes iguales** (mismo tamaño, color
   y diseño), la unión se detiene y muestra el grupo con enlace: cambia el
   atributo de una de las dos variantes y vuelve a intentar. No se toca nada.
4. Al confirmar, los productos pasan al destino y el valor que desaparece
   **queda archivado, no borrado** (restaurarlo no devuelve los productos,
   pero conserva el valor). Los SKU y las etiquetas impresas no cambian. La
   tienda y los feeds se refrescan solos.

### Categorías

- Lista: icono, nombre, subcategorías, productos (suma de todas sus
  subcategorías), estado, actualizado. Pistas: parecido, nombre por corregir,
  sin subcategorías, sin icono.
- Menú: Ver sus subcategorías (abre la pestaña Subcategorías filtrada por esa
  categoría, con «Ver todas» para quitar el filtro) y Ver en la tienda.
- No tiene «Unir con…»: fusionar categorías mueve subcategorías con URL
  propia; se resuelve moviendo las subcategorías (lote «Mover a otra
  categoría…») y archivando la categoría vacía.
- Archivar exige que no queden subcategorías activas; eliminar, que no tenga
  subcategorías.
- Ficha: nombre (sin emojis; avisa si ya existe o se parece a otra categoría),
  icono Lucide o generado con IA, tarjeta Uso con sus subcategorías.

### Subcategorías

- Lista: nombre, categoría, productos, «Página en la tienda» (Indexada ·
  destacada / Indexada / No indexada), estado, actualizado. Filtros:
  Categoría, Página en la tienda y Revisar (sin productos, parecidos, nombre
  por corregir).
- Menú: Ver sus productos, Ver en la tienda, Unir con… Lote: Mover a otra
  categoría… (cambia la sección del menú; la URL no cambia).
- Unir: los productos y las ofertas pasan al destino, las opciones para
  clientes también, y la URL de la que desaparece queda como alias de la que
  se queda (los enlaces viejos siguen abriendo). Si cruza de categoría, la
  ventana lo avisa.
- Archivar exige que no queden productos activos; eliminar, que no tenga
  productos (borra sus alias de URL y sus opciones para clientes).
- Ficha: nombre con pistas (se guardará como…, ya existe, parecido con unión
  a un clic), categoría, URL en la tienda (al renombrar, la anterior queda
  como alias), página SEO (indexar, portada, destacar, título, descripción,
  intro), tarjeta Uso (productos activos y archivados, grupos con variantes,
  ofertas, último cambio, Ver sus productos), Unir con otra, Archivar o
  eliminar.

### Tamaños

- Son internos (SKU y cotización de envío); el cliente nunca los ve. Lista:
  tamaño, código, dimensión, peso, productos, estado. Pista: sin productos.
- Solo existen 10 combinaciones (5 dimensiones × 2 pesos). Cuando ya están
  todas creadas, «Nuevo tamaño» se apaga y lo dice.
- Menú: Ver sus productos, Unir con… Al unir, la ventana recuerda que el peso
  entra en la cotización de envío: los productos movidos se cotizarán como el
  tamaño que se queda.
- Ficha: dimensión y peso (el nombre y el código salen de la combinación);
  si la combinación ya existe, avisa con enlace y no deja guardar. Tarjeta
  Uso con grupos y último cambio, Ver sus productos, Unir con otro.

### Colores

- Lista: muestra, nombre, valor hexadecimal, productos, estado, actualizado.
  Pistas: parecido, repetido, sin productos, nombre por corregir, valor con
  espacio o no válido, mismo tono que N más (Pastel, Multicolor y otros
  comparten #FFFFFF a propósito: la pista es solo para revisar).
- Menú: Ver sus productos, Unir con…; lote: Unir en uno…
- Ficha: nombre con pistas y unión a un clic; valor hexadecimal con selector
  de color, que se guarda sin espacios y en mayúsculas; aviso (sin bloqueo)
  cuando otro color activo usa el mismo tono. Tarjeta Uso con grupos y último
  cambio, Ver sus productos, Unir con otro. El SKU de los productos no cambia
  al editar un color.

### Diseños

- Lista: nombre, productos, estado, actualizado. Pistas: parecido, repetido,
  sin productos, nombre por corregir. Es la familia con más valores: el
  filtro «Sin productos» y «Eliminar…» en lote limpian los que sobran.
- Menú: Ver sus productos, Unir con…; lote: Unir en uno…
- Ficha: nombre con «se guardará como…», «ya existe» con enlace (no se puede
  repetir) y «parecido» con unión a un clic. Tarjeta Uso, Ver sus productos,
  Unir con otro.

### Opciones para clientes

- Lo que el cliente ve como formato, capacidad, medida, cantidad o punta. La
  pestaña solo las muestra (nombre, valores, productos y subcategorías que
  las usan); se crean y asignan desde Productos › Opciones para clientes.

### Productos filtrado por atributo

«Ver sus productos» abre Productos con un aviso («12 productos con color
«Rosado», incluidos los archivados») y el botón «Quitar filtro». Mientras el
filtro está puesto, las vistas de Productos no aplican.

## 12. Proveedores y aprovisionamiento (`/proveedores`, `/aprovisionamiento`)

Proveedores: a quién se compra. Aprovisionamiento: pedidos a proveedores; al
recibir, sube el inventario con movimiento «Reposición recibida» y costo. Un
pedido de aprovisionamiento no es una factura: las facturas de compra se
registran para tributarios con su número.

## 13. Contenido de la tienda (`/contenido`)

Pestañas Portada y Redes en la tienda (publicaciones sociales). Portada tiene
dos ubicaciones: el hero (primer pantallazo: etiqueta corta, título, texto,
botones e imagen) y el banner de campaña (temporada, cargamento nuevo,
colección u oferta), cada entrada con fechas Desde/Hasta y estado En vivo,
Programada, Vencida o Borrador. Solo hay una entrada en vivo por ubicación (la
de inicio más reciente); sin hero la portada usa el texto por defecto y sin
campaña vigente esa sección no se muestra. Un banner «Cargamento nuevo» puede
llevar hasta tres productos «Próximamente» y pide el correo para el acceso
anticipado. Imágenes horizontales, sin texto dentro; los cambios se reflejan al
guardar.

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
retira a quien lo pida. Al confirmar, cada suscriptora recibe un cupón de
bienvenida del 10 % (un uso, 30 días). Desde un banner «Cargamento nuevo»
(Contenido › Portada) se envían una sola vez el acceso anticipado (enlace
firmado para comprar lo «Próximamente» antes de su fecha) y el aviso «Ya
llegó». El boletín general se envía fuera del panel.

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
