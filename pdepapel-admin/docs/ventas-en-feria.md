# Ventas en feria

Este módulo mantiene separado el inventario llevado a una feria del inventario disponible en la tienda en línea. Cada venta presencial se crea como un pedido pagado, por lo que aparece en **Pedidos** y en los **reportes tributarios**.

## Antes de salir

1. En el panel, entra a **Ventas en feria** y crea una nueva feria con su nombre, lugar y fechas si las conoces.
2. Abre la feria creada y, en **Reservar inventario**, busca cada producto y agrega la cantidad física que vas a llevar.
3. Pulsa **Reservar en inventario**. Las unidades se descuentan de la disponibilidad de la tienda en línea y queda un movimiento de inventario auditable.
4. Verifica que los productos físicos cargados coincidan con el resumen de unidades reservadas.
5. Si vas a vender cápsulas sorpresa, en **Cápsulas sorpresa** selecciona un producto ya reservado, define cantidad, precio y margen mínimo. El producto debe tener un costo de adquisición registrado.
6. Pulsa **Crear QR**, imprime las etiquetas y pega un QR único en cada cápsula antes de sellarla. La etiqueta no revela el producto contenido. Las cápsulas usan el formato seguro de 40 por hoja A4 (48 × 28 mm) para que cada código se lea bien.
7. En la ventana de impresión selecciona papel **A4**, escala **100%** o **tamaño real** y calidad **Normal** u **Óptima**. Prueba primero una hoja con el celular antes de sellar todas las cápsulas.
8. Cuando el inventario físico esté listo, pulsa **Abrir para ventas**. A partir de este punto podrás registrar cobros.

## Durante la feria

1. Abre la misma feria desde el teléfono en `admin.papeleriapdepapel.com` e inicia sesión con la cuenta propietaria de la tienda.
2. Permite el uso de la cámara si usarás **Escanear**. También funciona un lector Bluetooth: enfoca el campo de código y escanea; o escribe el SKU, GTIN o QR de la cápsula.
3. Revisa los productos agregados y las cantidades antes de cobrar.
4. Selecciona **Efectivo** o **Transferencia**, pulsa **Registrar pago** y confirma en el diálogo una sola vez. Es la misma pantalla del Punto de venta, pero solo ofrece lo reservado para la feria.
5. Espera el mensaje de venta registrada antes de entregar el producto. El sistema evita cobrar dos veces un mismo envío del formulario y no permite superar el inventario reservado.
6. Para una cápsula, escanea únicamente su QR. El pedido se muestra como **Cápsula sorpresa** y la relación interna conserva el producto real y su costo.
7. Si te equivocaste en una venta, anúlala desde **Últimas ventas** en la misma feria (botón **Anular**). Las unidades vuelven a la reserva de la feria y una cápsula vuelve a «empacada»; el inventario de la tienda en línea no cambia porque la reserva sigue vigente. Desde **Pedidos** no se puede editar ni borrar una venta de feria: hacerlo duplicaría inventario.

## Conexión y seguridad

- Usa datos móviles o Wi-Fi estable durante los cobros. Este primer lanzamiento registra ventas en línea de forma inmediata para no perder pedidos ni crear duplicados.
- La reserva inicial protege la disponibilidad de la tienda en línea aun si el teléfono se queda sin conexión.
- Si se pierde la conexión, no cierres la feria. Anota temporalmente las ventas físicas y regístralas en la misma feria cuando recuperes señal, antes de conciliar.
- No asignes ni ajustes esas mismas unidades desde otro módulo mientras la feria esté abierta. Cualquier devolución debe hacerse desde la conciliación de la feria.

## Al terminar

1. Pulsa **Pasar a conciliación**. La feria queda en **Conciliando**: el panel de venta se bloquea y aparece la tabla de conteo. Si todavía falta vender, **Reabrir ventas** la devuelve a **Abierta** sin perder nada.
2. Cuenta físicamente cada producto no vendido.
3. En **Conciliación**, reparte para cada producto las unidades no vendidas entre **Devuelto**, **Dañado** y **Perdido**. Cada fila muestra «Cuadra», «Faltan N» o «Sobran N»; las cápsulas que sigan empacadas se cuentan por el producto que contienen.
4. Debajo de la tabla ves el resumen: cuántas unidades vuelven al stock en línea, cuántas quedan como daño o pérdida y cuántas cápsulas empacadas se anularán. El botón **Cerrar la feria** se activa cuando todas las filas cuadran.
5. Al pulsarlo, el diálogo repite esas cifras y pide confirmar que contaste físicamente. El cierre es definitivo: no se puede reabrir la feria, registrar más ventas ni anular las existentes.
6. Las unidades en **Devuelto** entran al inventario de la tienda en línea como «Devolución de feria». Las unidades en daño o pérdida quedan registradas solo en la feria. Si alguna devolución no pudo entrar (por ejemplo, el producto ya no existe), la feria se cierra igual y la línea queda como incidencia en **Movimientos de inventario** para reintentarla o conciliarla a mano.

## Qué no hace falta configurar

- No hay que crear productos adicionales para cápsulas.
- No hay que modificar manualmente los pedidos que se generan en feria.
- No hay que cambiar la configuración de pagos en línea: las ventas presenciales usan efectivo o transferencia y quedan pagadas al confirmarlas.

## Revisión posterior

- La feria cerrada muestra sus cifras (ventas, vendidas/reservadas, devueltas, dañadas o perdidas), la tabla conciliada y la tarjeta **Después del cierre** con los enlaces de abajo.
- **Movimientos en el kardex** abre Movimientos de inventario filtrado por esta feria (reserva y devolución).
- **Ventas de la feria** lista todos sus pedidos pagados; también aparecen en **Pedidos** y en **Reportes tributarios** en el período de su fecha real de pago.
- **¿Faltó registrar ventas?** abre «Conciliar feria anterior» con la feria como contexto. Es la única forma de corregir después del cierre y solo ajusta cantidades, nunca crea ventas: sigue [Arreglar el inventario después de una feria anterior](./conciliar-inventario-feria-anterior.md) o la [guía rápida](./guia-rapida-conciliar-stock-feria-anterior.md).
