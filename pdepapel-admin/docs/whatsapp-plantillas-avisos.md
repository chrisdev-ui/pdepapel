# Plantillas de WhatsApp para avisos de pedido

Cinco plantillas de categoría **Utilidad** (enviadas a revisión en WhatsApp Manager el 2026-10-27), idioma **Español (Colombia) — es_CO**. Se crean en WhatsApp Manager → Plantillas de mensajes. Mientras no estén aprobadas y escritas en Configuración (y el interruptor «Avisos de envío por WhatsApp» encendido), el panel no manda ningún WhatsApp: el correo sale siempre.

Reglas para que Meta no las pase a Marketing: nada de promociones, cupones, «vuelve a comprar», reseñas ni enlaces a la tienda; solo el estado del pedido de esa clienta.

El orden de las variables importa: el panel las llena en este orden (`lib/whatsapp-order-templates.ts`). Si se cambia el orden en Meta, hay que cambiarlo allí.

---

## 1. `guia_creada`: «Tu pedido ya tiene guía»

**Cuerpo:**

> Hola {{1}}, tu pedido {{2}} de P de Papel ya tiene guía de envío 📦
> Transportadora: {{3}}
> Número de guía: {{4}}
> Puedes ver el estado de tu envío en el botón de abajo.

**Botón:** tipo «Visitar sitio web», texto `Ver mi pedido`, URL **dinámica**: `https://papeleriapdepapel.com/pedido/{{1}}`

**Ejemplos que pide Meta:**
- {{1}} = `Laura`
- {{2}} = `ORD-1792983196243-511`
- {{3}} = `ENVIA`
- {{4}} = `014151234567`
- variable del botón = `3f2a9c1e-0000-4000-8000-000000000000`

Variables que manda el panel: {{1}} el primer nombre de la clienta, {{2}} el número del pedido, {{3}} la transportadora, {{4}} el número de guía. Variable del botón: el id del pedido.

---

## 2. `pedido_entregado`: «Tu pedido fue entregado»

**Cuerpo:**

> Hola {{1}}, tu pedido {{2}} de P de Papel fue entregado ✅
> Si algo no llegó bien, escríbenos por este chat y lo resolvemos.

**Botón:** tipo «Visitar sitio web», texto `Ver mi pedido`, URL **dinámica**: `https://papeleriapdepapel.com/pedido/{{1}}`

**Ejemplos:** {{1}} = `Laura`, {{2}} = `ORD-1792983196243-511`, variable del botón = un id de pedido.

---

## 3 a 5. `pedido_en_transito`, `pedido_en_reparto`, `pedido_novedad`

Mismo formato que `pedido_entregado`: **cuerpo** con {{1}} = primer nombre y {{2}} = número de pedido, **botón** «Ver mi pedido» con URL dinámica `https://papeleriapdepapel.com/pedido/{{1}}` (el id del pedido), sin pie, validez 12 h. Salen en los hitos «en tránsito» (`en_camino`), «en reparto» y «novedad» (`lib/shipment-notifications.ts`, `templateNameFor`).

---

## Después de la aprobación
1. Configuración → «Avisos de envío por WhatsApp»: escribir el nombre exacto de cada plantilla aprobada en su casilla («ya tiene guía» `guia_creada`, «en tránsito» `pedido_en_transito`, «en reparto» `pedido_en_reparto`, «entregado» `pedido_entregado`, «novedad» `pedido_novedad`) y encender el interruptor. Una casilla vacía = ese aviso sale solo por correo.
2. Probar con un pedido propio que tenga la casilla marcada: crear la guía y revisar que llegue el WhatsApp y el correo.
3. Revisar la calidad de las plantillas en WhatsApp Manager la primera semana.

Si a una plantilla le faltaría un dato (por ejemplo `guia_creada` sin número de guía), no se manda: el aviso queda «Omitido» con el dato que faltó en el historial del pedido y el correo sale igual (`missingTemplateParams`).

Desde el 2026-10-27 el chat lee «BAJA», «STOP» o «no más avisos»: anota la baja en sus pedidos y le confirma una vez. Las plantillas siguen sin pie de «BAJA»: agregarlo es una versión nueva de la plantilla en Meta. Paula también puede quitar los avisos desde el pedido («Quitar avisos por WhatsApp»).
