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
(transferencias por confirmar), **Por despachar** (pagados o contra entrega, sin guía y sin entregar), **En
camino**, **Cotizaciones**, **Todos**. La columna Canal distingue Tienda,
Presencial, Feria, Cotización o Mercado Libre.

La lista muestra 25 pedidos por página. El buscador busca en todos los pedidos
(número, cliente, teléfono, documento o producto, y el total exacto si escribes
un monto como 45000, 45.000 o $45.000), no solo en la página que se ve, y los
contadores de las vistas cuentan todo. La vista, los filtros, la búsqueda y la
página quedan en la dirección: el enlace se puede compartir. Las acciones en
lote (marcar pagado, exportar…) actúan sobre los pedidos marcados de la página
que se está viendo; al cambiar de página, de vista o de filtro se quitan las
marcas.

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

**Regalos.** La sección **Regalo**, debajo de Cliente, tiene el interruptor
«Es un regalo» y, al encenderlo, quién lo recibe (obligatorio), su correo, su
teléfono y un mensaje. El cliente de la sección 1 sigue siendo quien compra:
a su correo va el recibo completo. La guía de EnvioClick sale a nombre y
teléfono de quien recibe, y a su correo llega solo un aviso sin productos ni
precios, con el mensaje, cuando el pedido está pagado y en cada novedad del
envío. En la lista y en el título del pedido aparece la insignia «Regalo».

## 4b. Tarjetas de regalo (`/tarjetas-regalo`, `/tarjetas-regalo/<id>`)

Las tarjetas se venden en la tienda (`/tarjeta-regalo`) y aparecen aquí
cuando el pago se confirma. La lista muestra terminación del código, quien
compró, quien recibe, valor, saldo y estado (Activa, Sin saldo, Anulada;
«Correo pendiente» si el envío del código falló; «N usos»). A la derecha,
**Valores a la venta**: sin filas la tienda ofrece 50.000, 100.000 y
200.000; al agregar un valor manda tu lista, y un valor apagado se retira
sin borrarse.

La ficha tiene el **libro de movimientos** (emitida, reservada por un
pedido, usada, reserva liberada, devuelta al saldo, anulada, código nuevo),
los pedidos que la usaron, y **Reenviar correo**: sale un código nuevo con
el mismo saldo al correo de quien recibe (o de quien compró) y el anterior
deja de valer en ese instante. El panel nunca muestra el código completo.

Reglas: cancelar un pedido que usó una tarjeta devuelve lo usado al saldo;
cancelar la compra de una tarjeta la anula solo si nadie la usó (si ya se
usó, el panel lo rechaza y la diferencia se devuelve por fuera); esa compra
no se elimina, se cancela. Una reserva de un pedido sin pagar por más de
siete días se libera sola cada mañana; si el pedido se paga después, se
vuelve a reservar.

## 5. Punto de venta (`/ventas-rapidas`)

**Vender**

1. Una sola casilla «Buscar o escanear»: nombre, SKU, código de barras o el
   QR de la etiqueta impresa; lector de mano (Enter), cámara o celular
   vinculado. La lista se ordena
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

Para probar una etiqueta recién impresa no hay que vender: en Vender, con el
cursor en «Buscar o escanear», léela; si está bien el producto se agrega solo
y basta con quitarlo de la venta, que solo se registra al pulsar «Registrar
pago». Los avisos distinguen dos casos: «no es un código exacto» (hay
candidatos, elige de la lista) y «no coincide con ningún SKU, código de barras
ni QR de etiqueta» (no se leyó completo o no es de esta tienda). En una feria
la prueba es igual, pero solo responde lo reservado para el evento.

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

Aquí no hay una tabla de clientes: **cada persona se arma agrupando los pedidos
que comparten el mismo teléfono**, y la pantalla lo dice. La consecuencia hay
que tenerla presente al leer las cifras: dos personas que piden con el mismo
número aparecen como un solo cliente, y una persona que pidió con dos números
aparece dos veces. Por eso tampoco se puede crear, fusionar ni borrar a nadie
desde aquí.

La dirección de una ficha (`/clientes/<id>`) lleva una huella del teléfono, no
el número: así no queda en el historial del navegador ni en los registros. Un
enlace viejo que llevara el teléfono ya no abre nada.

Se agrupan los 5.000 pedidos más recientes. Mientras no se llegue a ese tope no
cambia nada; si se llegara, la pantalla avisa de que «gastado» y «compras» se
quedan cortos.

Segmentos: **VIP** (10 % que más gasta), **Recurrente** (2+ compras),
**Ocasional** (1), **Inactivo** (>90 días sin comprar), **Sin compra**. La
ficha muestra compras pagadas, gastado, unidades, última compra, pedidos y lo
que más compra, con botón de WhatsApp.

**Reseñas** (pestaña): vistas Todas, Sin responder, Por atender (≤2
estrellas), Ocultas. Desde el menú de la fila: **Responder** (se publica bajo
la reseña como «Respuesta de P de Papel»), **Ocultar de la tienda** /
**Publicar**, **Eliminar** (solo cuando ocultar no basta).

## 9b. Reservas (`/reservas`, `/reservas/<id>`)

Una reserva guarda unidades para una clienta que todavía no paga: dejan de
venderse en la tienda en línea, Mercado Libre y el punto de venta hasta que se
convierta en pedido, se libere o venza. Una reserva puede tener **varios
productos**, cada uno con su cantidad; nunca aparta más de lo disponible (si
no alcanza, no guarda nada y nombra el producto y lo que queda; con varios es
todo o nada).

- **Crear:** «Reservar» en la lista, en un producto, o «Reservar los N
  productos» en un pedido de WhatsApp (llega con todo lo pedido). Se busca o
  escanea cada producto («Agregar otro producto» suma una línea; el mismo
  producto dos veces se suma), se elige la clienta («Buscar una clienta que ya
  compró» o nombre y celular), los días y «Reservar N unidades».
- **Ya tiene una abierta:** con el celular de una clienta que tiene una
  reserva abierta, la hoja propone «Agregar a la reserva abierta»; «Crear otra
  reserva» queda a mano.
- **Agregar después:** en el detalle, «Agregar productos». Agregar no mueve el
  vencimiento; si vence en menos de 24 h, la casilla «Extender N días al
  guardar» (apagada) lo hace.
- **Editar:** en el detalle, − / + y «Guardar» (sube: aparta la diferencia o
  dice por qué no; baja: devuelve a la venta); la papelera quita un producto;
  quitar el último libera la reserva. El «Historial» guarda cada cambio, quién
  y cuándo.
- **Extender:** la etiqueta dice «vence hoy» (rojo), «vence mañana» (rosado) o
  en cuántos días. Con menos de 24 h, la tarjeta y el detalle muestran «Vence en
  menos de 24 horas» con «Extender N días» (los de la tienda); «+ días» y el
  campo «Días» dejan elegir otro número. Sin extender, vence sola; a las 8:00
  llega el correo con las que vencen al día siguiente.
- **Convertir:** «Convertir en pedido» enseña el resumen (cada producto a su
  precio de hoy, «Total (sin envío)») y «Crear el pedido» crea **un** pedido
  pendiente con todos. Las unidades siguen apartadas; desde ahí se edita en el
  pedido (sus líneas mueven lo reservado). Pagado, se descuenta; cancelado,
  vuelve a la venta.
- **Liberar:** devuelve todo a la venta, con confirmación. Si ya era pedido,
  el pedido sigue abierto.

Pestañas: Activas, Con pedido sin pagar, Sin respaldo (una venta pagada se
llevó unidades reservadas: reponer, ofrecer otro o liberar; llega correo),
Vencidas, Cerradas. Los días por defecto están en Ajustes › Reservas («Días
de una reserva»).

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

## 11b. Marcas (`/marcas`, `/marcas/<id>`, `/marcas/sugerencias`)

Las marcas son los fabricantes de lo que se vende (Norma, Kiut, Scribe…). Cada
marca tiene su página en la tienda (`/marcas/<dirección>`), sale en el filtro
«Marca» del catálogo y su nombre viaja a Google, Meta, Mercado Libre y Google
Analytics.

- **Lista.** Logo (o «Sin logo»), nombre con su dirección debajo, productos
  activos (al pasar por encima: activos y total), los interruptores «Visible» y
  «Compra por marca» con «Deshacer» en el aviso, y el orden: se arrastra o se
  usan ↑ ↓. El orden es el del filtro y el menú de la tienda. El aviso de arriba
  dice cuántos productos activos no tienen marca y lleva a «Revisar
  sugerencias».
- **Visible.** Una marca oculta no sale en la tienda (ni filtro, ni página, ni
  enlace en la ficha), pero su nombre sigue yendo a Google, Meta, Mercado Libre y
  a las líneas de los pedidos. Archivada no sale en ninguna parte.
- **Compra por marca.** Marca la marca para el carrusel del inicio, que llega en
  una segunda fase; hoy solo se guarda.
- **Editar.** Nombre, dirección fija («Cambiar dirección»: la anterior sigue
  funcionando y lleva a la nueva), logo oficial (PNG o SVG sin fondo, de al
  menos 400 px de ancho; el panel avisa si trae fondo o si es pequeño), logo
  claro para fondos oscuros, color con revisión de contraste, texto para
  Google (160 caracteres), alias (otras formas de escribirla: sirven para las
  sugerencias), fabricante, sitio oficial, fuente del logo y «Permiso de uso del
  logo». Con «Pendiente» o «Negado» la tienda muestra el nombre en vez del logo.
  El logo se sube tal cual lo entrega la marca: sin recortarlo ni cambiarle
  colores.
- **Es una línea de.** En la ficha de la marca, elige su marca madre: Flower
  Power es una línea de Primavera; Incolors, de Scribe. Una línea se ve en la
  tienda como una marca propia (su página, su logo, su filtro); su página dice
  «Una línea de Primavera» y en la ficha del producto sale «Marca: Primavera ·
  Línea: Flower Power». Elegir Primavera en el filtro trae también sus líneas.
  Google, Meta y Mercado Libre reciben la marca madre (y Mercado Libre la línea
  en «Línea» cuando la categoría lo pide). Un solo nivel: una línea no tiene
  líneas, y una marca con líneas no se archiva ni se fusiona en una de ellas.
- **Fusionar con otra marca…** Para una marca repetida o un nombre que es otra
  forma de escribirla (por ejemplo «Fashion» de Klipp). Todos los
  productos pasan a la otra marca, la dirección anterior redirige, el nombre y
  los alias se suman como alias y la marca queda archivada. No se puede
  deshacer.
- **Archivar / Eliminar.** Con productos solo se archiva o se fusiona; eliminar
  solo aparece cuando no tiene ninguno.
- **Sugerencias automáticas.** Por cada marca, los productos activos cuyo
  nombre dice la marca o uno de sus alias («coincide por el alias «Fashion»»).
  Si el nombre dice una línea y su marca madre, se sugiere la línea.
  Los que no tienen marca van marcados; los que ya tienen otra salen aparte, sin
  marcar. «Asignar X a N productos» asigna; en un grupo la marca es una sola y
  pasa a todas sus variantes.
- **En Productos.** El campo «Marca» de la ficha (en el teléfono abre una hoja
  desde abajo), con una sola sugerencia: «¿Es de la marca X? Usar X» cuando el
  nombre la dice. En un grupo la marca se elige en el grupo y las variantes
  muestran «X · viene del grupo». La lista tiene la columna y el filtro «Marca»
  (incluye «Sin marca») y la acción en lote «Asignar marca», que avisa cuáles ya
  tienen otra marca: esos solo cambian si se marcan.

## 12. Proveedores y aprovisionamiento (`/proveedores`, `/aprovisionamiento`)

Proveedores: a quién se compra. Aprovisionamiento: pedidos a proveedores; al
recibir, sube el inventario con movimiento «Reposición recibida» y costo. Un
pedido de aprovisionamiento no es una factura: las facturas de compra se
registran para tributarios con su número.

La lista abre con cuatro cifras —esperando mercancía, unidades en camino,
comprometido a costo y con retraso— y vistas por estado (Todo, Borradores, Al
proveedor, Recibiendo, Completados, Cancelados) que quedan en la URL.

- **Líneas del borrador**: el producto ocupa toda la fila y debajo van
  cantidad, costo unitario y subtotal. El botón cerrado muestra «SKU · stock ·
  costo» del catálogo. Cada línea tiene solo el icono de la cámara; el sonido
  y el celular vinculado están una vez en la cabecera de «Líneas del pedido».
  Lo que lee el celular suma una unidad si el producto ya está en el pedido,
  llena la primera línea vacía o abre una línea nueva con el costo de compra.
  Cada lectura muestra un aviso («+1 Producto — ahora 3») con «Deshacer», que
  revierte solo esa lectura.
  En el teléfono la lista de productos se abre en una ventana.
- **Cuándo llega**: la fecha del pedido más el plazo del proveedor
  (`Proveedores` → «Días de entrega»). Sin ese plazo la columna dice «Sin plazo
  del proveedor» en vez de estimar una fecha; vale la pena registrarlo.
- **Recibir mercancía**: cada línea propone lo que falta, recibir de más exige
  confirmarlo y antes de aceptar se lee «Al confirmar», que dice cuántas
  unidades entran, en cuántos movimientos, en qué estado queda el pedido y que
  no se deshace desde ahí (se corrige con un movimiento en Movimientos).
- **Costo al recibir**: con «Actualizar el costo» encendido, el costo del
  producto queda en el **promedio ponderado por unidades** entre lo que ya
  había en bodega y lo que entra, no en el precio de la última compra. Recibir
  2 unidades más caras ya no revalúa las 100 que estaban guardadas.

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
retira a quien lo pida. La persona confirma con el botón «Confirmar mi
suscripción» de la página del correo (abrir el enlace no basta); recibe como
máximo un correo de confirmación al día, y lo que nadie confirma se borra a
los 7 días. Al confirmar, cada suscriptora recibe un cupón de
bienvenida del 10 % (un uso, 30 días). Desde un banner «Cargamento nuevo»
(Contenido › Portada) se envían una sola vez el acceso anticipado (enlace
firmado para comprar lo «Próximamente» antes de su fecha) y el aviso «Ya
llegó».

La revista se sube y se envía **desde esta pantalla** —antes decía que el envío
se hacía por fuera del panel, y era falso—. «Crear número»: título, entradilla
opcional, portada y hasta doce páginas como imágenes, con el mismo cargador de
las fotos de producto. Mientras es borrador se edita o se borra; «Enviar» dice
a cuántas personas llegará y pide confirmar con ese número a la vista.

Un número enviado queda **cerrado**: no se edita ni se borra, porque el correo
ya salió y el enlace que recibió la gente tiene que seguir mostrando lo mismo.
Cada número enviado gana su página pública en `papeleriapdepapel.com/boletin/`,
compartible sin estar suscrito; un borrador responde 404. Las páginas van como
imágenes y no como PDF adjunto: un adjunto en un envío masivo es señal de spam
y saldría del mismo dominio que las confirmaciones de pedido.

## 16b. Métricas de redes (`/redes`, solo la dueña)

Cómo le va a cada publicación de Instagram y TikTok. Solo lee lo guardado:
abrir la pantalla no le pide nada a las redes. Todo se lee cuatro veces al día
(4:15 y 10:15 a. m., 4:15 y 10:15 p. m., hora de Colombia), lo publicado en las
últimas 8 horas además cada hora, y «Sincronizar ahora» no espera a la próxima.

- **Vistas** (en Instagram solo orgánicas), **Alcance** (cuentas distintas),
  **Tiempo promedio**, **% visto** (tiempo promedio ÷ duración), **Salto 3 s**
  (de cada 100, cuántos se van antes de 3 segundos; solo reels de Instagram),
  **Duración** («(a mano)» si la escribiste tú).
- **× mediana**: vistas contra una publicación típica de la misma red **a la
  misma edad**. «aprox.»: era vieja cuando empezamos a medir. «pocos datos»:
  menos de 5 para comparar. «—»: esa red no da el dato.
- **Aviso rojo** «La mayoría deja de verlo muy pronto»: menos del 15 % visto, o
  salto 10 puntos o más sobre lo normal de nuestros reels (90 días).
- **Etiquetas** (Formato y Gancho) en el detalle; el panel agrega tipo,
  duración, día y franja. **Qué funciona** dice qué etiqueta va mejor (filas
  con al menos 2 publicaciones). «Todavía es una pista, no una regla» = sale de
  números aproximados: sirve para probar, no para decidir.
- **Mejor horario**: día × franja, mediana del «× mediana»; «·» = menos de 2.
- **Seguidores por día**: cambio de ayer, 7 y 30 días, y línea de 30 días.
- **La misma pieza en otras redes**: el panel sugiere unir el mismo video de
  las dos redes (≤ 48 h y texto parecido); nunca lo une solo. Unidas, «Copiar
  etiquetas de …» agrega las que faltan, sin quitar nada, una sola vez.
- **Promocionado**: automático mientras la pauta está activa, o «Sí, se
  promocionó» / «No» en el detalle (lo tuyo manda). **¿Promocionado?** aparece
  cuando las vistas totales pasan el doble de las orgánicas y 500; es solo una
  pregunta. Lo promocionado sale de la mediana, el «× mediana», Qué funciona,
  Mejor horario, la base del salto y la alerta temprana.
- **Duración a mano**: para reels con audio con derechos; gana la de Instagram
  si algún día llega.
- **Copiar resumen semanal**: texto para WhatsApp con los últimos 7 días, sin
  enlaces ni datos personales; si el navegador no deja copiar, lo dice.
- **Alerta temprana** (2 a 6 horas de publicada): «🚀 Va despegando» (1,5× o
  más) o «🐢 Va lenta» (0,5× o menos), en Inicio y por correo (máximo 3 al
  día). Cada red se enciende sola con 10 publicaciones medidas en esas horas;
  «Pausar» / «Reanudar» la apaga o enciende en las dos.

## 17. Rendimiento y tributarios (`/rendimiento`, `/reportes-tributarios`)

Rendimiento: Resumen y caja (reserva para impuestos, reinversión, retiro
sugerido), Productos y riesgos (ingresos contra ganancia, sin rotación, se
agotan pronto, clientes inactivos y mejores clientes), Envíos (cuántos
salieron, en qué punto están y con qué transportadora). Este panel decide, no
mueve dinero: registra gastos y retiros reales y valida con el contador.

El **selector de mes** manda en las tres vistas, Envíos incluido —antes esa
pestaña mostraba siempre el mes en curso sin decirlo—. La vista de adentro de
«Resumen y caja» (Resumen, Caja y distribución, Campañas actuales) viaja en la
dirección como `?sub=`, así que se conserva al volver y se puede compartir.
Cada producto y cada cifra de riesgo **abre** lo que nombra: la ficha del
producto, la lista de envíos con novedad, Promociones.

`/negocio` e `/inteligencia-negocio` son las direcciones viejas de las dos
primeras vistas y ahora solo redirigen a `/rendimiento`; ya no existen como
pantallas aparte.

Tributarios: Excel de ventas y compras del periodo; «Antes de exportar» avisa si
algo impide exportar; incluye pedidos pagados o enviados, ventas de Mercado
Libre liquidadas y facturas de compra.

La pantalla **abre en el año en curso** —antes traía escrito a mano jul–dic de
2025, así que envejecía sola— y ofrece atajos: este año, año pasado y cada
semestre. Debajo de «Descargar Excel» dice **qué período se llevará el
archivo**, y si cambias las fechas sin aplicarlas lo avisa: el Excel siempre es
el reporte que estás viendo, nunca el formulario a medio escribir. Las dos
tablas tienen buscador y orden por columna, y el número de orden abre el pedido.

## 18. Ajustes (`/configuracion`)

Tienda (logo, datos, redes, políticas); Envíos y empaques (umbral de envío
gratis, cajas); Pagos (Bold por defecto, Wompi respaldo, transferencia manual;
solo se ve si está configurado); Integraciones (Mercado Libre, transportadoras,
analítica, correos, imágenes, Google Merchant); Avanzado (caché, limpieza de
imágenes, zona de cuidado). «Eliminar tienda» no se puede deshacer.

**WhatsApp mientras la clienta espera.** En Conversaciones, el botón
«Esperando a Paula (N)» filtra los chats donde la clienta escribió de último
(algo de verdad, no «ok», «gracias» ni una reacción) y nadie le responde hace
15 minutos o más; cada uno lleva la insignia «Esperando a Paula · 25 min».
Si ya la atendiste por otro lado, «Marcar como atendido» (en la fila o dentro
del chat) la saca de la lista sin mandarle nada a la clienta; si ella vuelve a
escribir, reaparece. Con el filtro puesto, «Marcar todas como atendidas (N)»
limpia las esperas viejas de una vez, con confirmación. Por defecto no llega
ningún correo por estas esperas (Paula prefirió revisarlas en el panel); el
interruptor «Avisarme por correo cuando un cliente espere», en la misma parte
de Ajustes, lo enciende: como mucho un correo por hora, de 8 a. m. a 11 p. m.,
con la cuenta de esperas de 30 minutos o más del último día. En
Configuración › Tienda › Datos del negocio, «Mientras la clienta te espera»
tiene dos interruptores de tres estados (Apagado, Sombra, Encendido), en
Sombra al empezar: la respuesta del bot a los 10 minutos (solo preguntas que
sabe contestar; en una conversación en vivo o con pedido abierto, solo datos
del negocio; en el chat se marca «El bot contestó por ti») y el mensaje de
espera (una vez por espera: a los 15 minutos de día, enseguida de 12 a 6:59
a. m.). Los dos textos del mensaje de espera los escribe Paula; vacíos, no
sale nada. En Sombra solo se anota lo que haría y a la clienta no le llega
nada.

## 18b. Copiloto (`/copiloto`)

Chat que consulta los datos de la tienda y responde con cifras y su fuente
(«Datos: …» con la fecha). **Solo lee:** no crea, edita ni borra nada, no da
contactos de clientas y no ve métricas de redes ni anuncios. Se abre con el
botón «Copiloto» de la barra de arriba; el chat vacío muestra ejemplos de la
pantalla de origen, y tocar uno lo escribe en la caja sin mandarlo.

Lo que se le puede preguntar (los mismos ejemplos del chat; cada uno lo
responde una consulta concreta y la evaluación lo comprueba):

| Tema | Ejemplo | Responde con |
|---|---|---|
| El día | «¿Cómo voy hoy?» · «¿Cuántos pedidos tengo pendientes?» | ventas, pedidos y unidades de hoy por canal, pendientes, stock bajo |
| Dinero del mes | «¿Cuál fue mi margen este mes?» · «¿Cómo me fue este mes frente al anterior?» | ingresos, utilidad, margen y pedidos por canal; comparación de meses (últimos 24) |
| Punto de venta | «¿Cuánto vendí en el punto de venta ayer?» | ventas presenciales de un día por medio de pago |
| Catálogo | «Busca las libretas con stock» · «¿Qué margen me deja la Libreta Kuromi y cuántas he vendido?» | búsqueda por nombre; detalle con precio, costo, margen, stock y vendidas |
| Inventario | «¿Qué entradas y salidas tuvo la Libreta Kuromi este mes?» · «¿Qué tengo que reponer esta semana?» · «¿Qué se agota en menos de una semana?» | kardex; por reponer por cobertura; riesgo de agotarse |
| Impuestos | «¿Cuánto vendí y cuánto compré con factura este mes, para la declaración?» | ventas por canal y compras con factura (no reemplaza al contador) |
| Mercado Libre | «¿Hay alertas en Mercado Libre?» | conexión, publicaciones por estado, alertas (sin dinero) |
| Promoción y redes | «¿Qué producto me conviene promocionar este mes?» · «Dame 3 ideas de Reel para esta semana» | regla de Campañas con enlace; habilidad de mercadeo |
| Textos y kits | «Escríbeme la descripción para la tienda del Set de washi tape pastel» · «¿Qué productos llevan más de 90 días sin venderse y qué kits podría armar con ellos?» | descripción para la ficha; kits con productos quietos |
| Precios | «Me costó $4.500, ¿a cuánto lo vendo en la tienda?» · «Me llegó un producto a $150 la unidad y tengo 150. ¿Me conviene en packs de 10, 20 o 30? El de 10 lo pensaba a $8.000» · «¿Qué productos quedan por debajo del 35 % y del 40 % de margen?» · «¿A cuánto tendría que venderlo en Mercado Libre si me costó $6.000?» · «Quiero armar un kit con una libreta, un lapicero y un llavero, ¿a cuánto lo vendo?» | precio sugerido con su margen y de dónde sale el aumento; tamaños de pack con ganancia y mezclas; productos por debajo de un margen con el precio para llegar; Mercado Libre siempre como estimado; el precio de un kit con las piezas que elijas (si una pieza no es clara, te pregunta cuál es), con su margen y el margen si pagan con Bold, sin bajar del mínimo de la tienda; si dices que es para rotar mercancía quieta, también el precio para rotar |

Dudas del oficio: usa y cita las notas aprobadas en Copiloto › Conocimiento;
sin nota, lo dice y marca su idea como no verificada. No hay una consulta de
«productos por debajo del costo»: se mira el margen producto por producto.
La lista vive en `lib/copiloto/examples.ts`; una prueba exige que el manual y
esta guía traigan cada ejemplo.

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
| El lector no agrega en el producto | Cursor en «Código de barras o QR» y SKU existente; escríbelo y «Agregar código» |
| La etiqueta escaneada no agrega nada al vender | Si dice «no coincide con ningún SKU…», el QR se leyó a medias: repite más cerca o escribe el SKU impreso |
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

Documentación técnica: `pdepapel-admin/AGENTS.md` (y `pdepapel-store/AGENTS.md`
para la tienda en línea) más los manuales de `pdepapel-admin/docs/` (feria,
punto de venta, Mercado Libre, reportes tributarios).
