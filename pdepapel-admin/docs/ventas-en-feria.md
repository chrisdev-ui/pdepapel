# Ventas en feria

Este módulo mantiene separado el inventario llevado a una feria del inventario disponible en la tienda en línea. Cada venta presencial se crea como un pedido pagado, por lo que aparece en **Pedidos** y en los **reportes tributarios**.

## Antes de salir

1. En el panel, entra a **Ventas en feria** y crea una nueva feria con su nombre, lugar y fechas si las conoces.
2. Abre la feria creada y, en **Reservar inventario**, busca cada producto y agrega la cantidad física que vas a llevar.
3. Pulsa **Reservar en inventario**. Las unidades se descuentan de la disponibilidad de la tienda en línea y queda un movimiento de inventario auditable.
4. Verifica que los productos físicos cargados coincidan con el resumen de unidades reservadas.
5. Si vas a vender cápsulas sorpresa, en **Cápsulas sorpresa** selecciona un producto ya reservado, define cantidad, precio y margen mínimo. El producto debe tener un costo de adquisición registrado.
6. Pulsa **Crear QR**, imprime las etiquetas y pega un QR único en cada cápsula antes de sellarla. La etiqueta no revela el producto contenido.
7. Cuando el inventario físico esté listo, pulsa **Abrir para ventas**. A partir de este punto podrás registrar cobros.

## Durante la feria

1. Abre la misma feria desde el teléfono en `admin.papeleriapdepapel.com` e inicia sesión con la cuenta propietaria de la tienda.
2. Permite el uso de la cámara si usarás **Escanear**. También funciona un lector Bluetooth: enfoca el campo de código y escanea; o escribe el SKU, GTIN o QR de la cápsula.
3. Revisa los productos agregados y las cantidades antes de cobrar.
4. Selecciona **Efectivo** o **Transferencia** y pulsa **Confirmar pago** una sola vez.
5. Espera el mensaje de venta registrada antes de entregar el producto. El sistema evita cobrar dos veces un mismo envío del formulario y no permite superar el inventario reservado.
6. Para una cápsula, escanea únicamente su QR. El pedido se muestra como **Cápsula sorpresa** y la relación interna conserva el producto real y su costo.

## Conexión y seguridad

- Usa datos móviles o Wi-Fi estable durante los cobros. Este primer lanzamiento registra ventas en línea de forma inmediata para no perder pedidos ni crear duplicados.
- La reserva inicial protege la disponibilidad de la tienda en línea aun si el teléfono se queda sin conexión.
- Si se pierde la conexión, no cierres la feria. Anota temporalmente las ventas físicas y regístralas en la misma feria cuando recuperes señal, antes de conciliar.
- No asignes ni ajustes esas mismas unidades desde otro módulo mientras la feria esté abierta. Cualquier devolución debe hacerse desde la conciliación de la feria.

## Al terminar

1. Cuenta físicamente cada producto no vendido.
2. En **Conciliar y cerrar**, registra para cada producto cuántas unidades regresan, cuántas se dañaron y cuántas se perdieron.
3. Para cada producto, la suma debe coincidir exactamente con las unidades no vendidas. El botón se activa cuando todo cuadra.
4. Pulsa **Conciliar y cerrar** solo después de revisar el conteo: el cierre es irreversible.
5. Las unidades en **Devuelto** se reincorporan al inventario disponible de la tienda en línea. Las unidades en daño o pérdida quedan registradas en la feria y no vuelven al inventario.

## Qué no hace falta configurar

- No hay que crear productos adicionales para cápsulas.
- No hay que modificar manualmente los pedidos que se generan en feria.
- No hay que cambiar la configuración de pagos en línea: las ventas presenciales usan efectivo o transferencia y quedan pagadas al confirmarlas.

## Revisión posterior

- En **Pedidos**, filtra o revisa las ventas creadas desde la feria.
- En **Movimientos de inventario** verás las asignaciones y devoluciones asociadas a la feria.
- En **Reportes tributarios**, las ventas pagadas de feria se incluyen en el período de su fecha real de pago.
