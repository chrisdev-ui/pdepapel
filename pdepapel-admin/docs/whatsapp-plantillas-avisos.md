# Plantillas de WhatsApp para avisos de pedido (borrador para revisar)

Dos plantillas de categoría **Utilidad**, idioma **Español (Colombia) — es_CO**. Se crean en WhatsApp Manager → Plantillas de mensajes. Mientras no estén aprobadas y escritas en Configuración (y el interruptor «Avisos de envío por WhatsApp» encendido), el panel no manda ningún WhatsApp: el correo sale siempre.

Reglas para que Meta no las pase a Marketing: nada de promociones, cupones, «vuelve a comprar», reseñas ni enlaces a la tienda; solo el estado del pedido de esa clienta.

El orden de las variables importa: el panel las llena en este orden (`lib/whatsapp-order-templates.ts`). Si se cambia el orden en Meta, hay que cambiarlo allí.

---

## 1. `guia_creada`: «Tu pedido va en camino»

**Cuerpo:**

> Hola {{1}}, tu pedido {{2}} de P de Papel ya va en camino 📦
> Transportadora: {{3}}
> Número de guía: {{4}}
> Puedes ver el estado de tu envío en el botón de abajo.

**Pie (opcional):** `Responde BAJA si no quieres recibir estos avisos.`

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

**Pie (opcional):** `Responde BAJA si no quieres recibir estos avisos.`

**Botón:** tipo «Visitar sitio web», texto `Ver mi pedido`, URL **dinámica**: `https://papeleriapdepapel.com/pedido/{{1}}`

**Ejemplos:** {{1}} = `Laura`, {{2}} = `ORD-1792983196243-511`, variable del botón = un id de pedido.

---

## Después de la aprobación
1. Configuración → «Avisos de envío por WhatsApp»: escribir los nombres exactos (`guia_creada`, `pedido_entregado`) y encender el interruptor.
2. Probar con un pedido propio que tenga la casilla marcada: crear la guía y revisar que llegue el WhatsApp y el correo.
3. Revisar la calidad de las plantillas en WhatsApp Manager la primera semana.

Pendiente aparte: «BAJA» todavía no se lee sola en el chat. Paula quita los avisos desde el pedido («Quitar avisos por WhatsApp»).
