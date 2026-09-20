# Cápsulas sorpresa

Una cápsula sorpresa es un **producto normal** del catálogo. No es un kit, no
está atada a una feria y no tiene una pantalla de venta propia: se vende igual
que una agenda, en el punto de venta, en la tienda en línea y en una feria.

Lo único que la distingue es de dónde sale su stock. Una agenda entra por una
compra a un proveedor; una cápsula entra por un **lote empacado**: unas
unidades salen de la bodega y vuelven a aparecer, ya empacadas, como cápsulas.

## Antes de empezar

1. Crea el producto cápsula en **Productos**, en la categoría **Kits sorpresa**.
2. Ponle el precio de venta y déjalo **sin stock**: el stock lo pone el lote.
3. Escribe una descripción honesta: cuántos artículos trae y de qué tipo
   pueden ser. No prometas un producto concreto (ver «Qué se puede prometer»).

La categoría importa: es la que hace que la cápsula no se cuente dos veces en
Inventario —sus unidades ya se descontaron de los productos de origen— y la
que hace que la tienda muestre el aviso de contenido al azar.

## Empacar un lote

**Productos → Empacar cápsulas.**

1. Elige el producto cápsula y cuántas cápsulas salen del lote.
2. Agrega los productos que entran, con su cantidad. Busca por nombre o SKU.
3. El panel calcula el **costo por cápsula** (lo que entró, dividido entre las
   cápsulas) y el **margen** contra el precio de venta. Si el margen queda
   bajo, la tarjeta lo marca.
4. Guarda. En la misma operación: baja el stock de cada producto de origen,
   sube el stock de la cápsula y se escriben los movimientos de los dos lados
   en el kardex, enlazados por el lote.

Dos cosas que el panel no deja hacer, porque romperían la contabilidad:

- **Empacar un producto sin costo registrado.** Sin eso no se puede saber
  cuánto cuesta la cápsula, y el margen de cada venta saldría inventado.
- **Empacar más unidades de las que hay en bodega.** Si una sola línea del
  lote no alcanza, no se guarda nada: no queda medio lote empacado.

El costo del producto cápsula se actualiza al del último lote. Es lo que de
verdad costó lo que hoy está en la estantería.

## Deshacer un lote

Mientras no se haya vendido ninguna cápsula del lote, **Deshacer** lo revierte:
las unidades vuelven a sus productos de origen y la cápsula pierde ese stock.

Si ya se vendió aunque sea una, el botón no aparece. Devolver esas unidades a
bodega inventaría stock que ya salió por la puerta.

## Precio por cantidad

Una cápsula suele venderse más barata por unidad cuando se llevan varias. Eso
se configura como una **escalera de precio por cantidad** en el producto: desde
3 unidades cuesta tanto, desde 5 tanto, desde 10 tanto.

La escalera no es propia de las cápsulas: cualquier producto puede tener una.

Tres reglas que conviene tener claras:

- Gana el peldaño más alto que no pase de lo que se lleva. Con peldaños en 3, 5
  y 10, quien lleva 7 paga el de 5.
- **Una oferta y un peldaño nunca se suman.** Se cobra el más barato de los
  dos, nunca la oferta rebajada otra vez por el peldaño. Así es como se termina
  vendiendo por debajo del costo sin darse cuenta.
- Dos líneas del mismo producto suman para el peldaño: pedir «5 y 5» cuesta lo
  mismo que pedir 10.

El precio lo decide siempre el servidor, en la tienda y en el mostrador, para
que lo que se ve y lo que se cobra sean el mismo número.

## Qué se puede prometer en la tienda

La cápsula se vende sin decir qué trae. Lo que sí se dice, y la ficha lo
muestra solo:

- Que el contenido es **al azar** y que **no se puede escoger**.
- **Cuántos artículos** lleva quien compra (una cápsula, un artículo).
- Que el contenido **puede repetirse** entre cápsulas.

Se puede listar qué **podría** venir («stickers, lapiceros, notas adhesivas»)
como ejemplo de la clase de producto. Lo que no se puede es prometer un artículo
concreto, ni ofrecer elegir personaje o color: si se promete, hay que cumplirlo.

## Dónde ver los números

- **Inventario** no cuenta las cápsulas como existencias sueltas: sus unidades
  ya se contaron al empacar el lote.
- **Movimientos de inventario** muestra las dos patas de cada lote («Empaque de
  cápsulas»), y el kardex de un producto de origen deja ver en qué lote entró.
- **Rendimiento** reparte la plata del mes por canal: tienda en línea, punto de
  venta, feria y Mercado Libre. Los cuatro suman el total.
