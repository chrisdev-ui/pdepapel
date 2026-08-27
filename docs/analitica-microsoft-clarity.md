# Microsoft Clarity en la tienda pública

## Objetivo

Microsoft Clarity complementa GA4 para explicar **por qué** una persona no
continúa: clics que no producen una acción, desplazamiento, formularios difíciles
y pasos del embudo donde se abandona. GA4 continúa siendo la fuente cuantitativa
para sesiones, eventos y conversiones.

Clarity no reemplaza GA4, no procesa pagos y no debe identificar clientes.

## Condición previa de privacidad

Microsoft indica que Clarity no debe utilizarse en sitios o aplicaciones dirigidos
a personas menores de 18 años. Antes de activar la variable de producción, la
propietaria debe confirmar que la tienda y sus campañas se dirigen a compradores
adultos, aunque venda productos que también puedan usar estudiantes. Si existe
duda, mantener `NEXT_PUBLIC_CLARITY_ENABLED=false` y solicitar revisión jurídica.

## Variables de Vercel

Configurar únicamente en el proyecto `pdepapel-store`:

```text
NEXT_PUBLIC_CLARITY_PROJECT_ID=sc857ich8n
NEXT_PUBLIC_CLARITY_ENABLED=false
```

El ID es público. La variable `NEXT_PUBLIC_CLARITY_ENABLED` es el interruptor de
emergencia. Cambiarla a `true` solo después de completar la lista de activación.
No se requiere ninguna variable en `pdepapel-admin`.

## Diseño técnico

- El SDK oficial `@microsoft/clarity` se descarga en un fragmento separado.
- El navegador espera consentimiento explícito y un periodo ocioso antes de
  solicitar el script de Clarity.
- Publicidad permanece siempre denegada (`ad_Storage: denied`).
- Rechazar o revocar analítica desactiva Clarity y GA4; comprar sigue funcionando.
- El consentimiento cambió a versión `v2`, por lo que cada navegador volverá a
  preguntar una sola vez después del despliegue.
- No se usa la API `identify` ni se envían correo, teléfono, dirección, documento,
  número de pedido, token, SKU o identificadores de cliente.
- Clarity recibe nombres cerrados de eventos, no los parámetros detallados de GA4.

## Alcance medido

Se mide únicamente el embudo público:

- `/`
- `/tienda`
- `/categoria/*`
- `/producto/*`
- `/carrito`
- `/finalizar-compra`

No se inicia una medición nueva en pedidos, cotizaciones, autenticación ni
`/mis-pedidos`. Si una sesión ya estaba activa y navega hacia allí, el contenido
principal se enmascara y el consentimiento de almacenamiento de Clarity se niega.
El formulario de checkout también está enmascarado explícitamente; además,
Clarity enmascara inputs y selectores por defecto.

## Eventos disponibles en Clarity

Los eventos principales son:

- catálogo: `view_item_list`, `catalog_search`, `catalog_filter`,
  `catalog_no_results`, `select_category`;
- producto: `select_item`, `view_item`, `select_item_variant`, `add_to_cart`;
- carrito: `view_cart`, `checkout_initiated`;
- compra: `begin_checkout`, `add_shipping_info`, `add_payment_info`,
  `checkout_stock_unavailable`, `checkout_order_submitted`,
  `checkout_payment_redirect`;
- cuenta: `account_registration_cta_clicked`,
  `account_sign_in_cta_clicked`.

`checkout_order_submitted` no significa pago confirmado. Las ventas pagadas
continúan midiéndose desde el backend mediante GA4 Measurement Protocol.

## Configuración manual en Clarity

1. Abrir el proyecto `P de Papel` en Clarity.
2. En **Settings → Masking**, conservar `Balanced` durante el piloto. No usar
   `Relaxed`.
3. Confirmar que los elementos con `data-clarity-mask="true"` aparecen ocultos en
   una grabación de prueba.
4. En **Settings → IP blocking**, bloquear la IP fija del equipo interno si es
   estable. No bloquear rangos móviles dinámicos.
5. Mantener activa la detección de bots.
6. No conectar Clarity con Microsoft Ads ni Google Ads para este objetivo.
7. Verificar que la política pública de privacidad menciona Clarity, mapas de
   calor, reproducciones técnicas y la posibilidad de revocar el permiso.

## Activación gradual

1. Desplegar con `NEXT_PUBLIC_CLARITY_ENABLED=false`.
2. Confirmar en producción que GA4, carrito, checkout, pedido y preferencias de
   privacidad funcionan sin cambios.
3. Completar la condición de audiencia adulta y la revisión de privacidad.
4. Cambiar `NEXT_PUBLIC_CLARITY_ENABLED=true` solo en **Production** y redesplegar.
5. Aceptar analítica en un navegador de prueba y comprobar en red que
   `clarity.ms/tag/sc857ich8n` no se solicita antes del consentimiento.
6. Rechazar analítica en otro navegador y comprobar que el script no se solicita.
7. Revisar una sesión de checkout: nombres, correo, teléfono, dirección, documento
   y valores escritos deben verse ocultos.
8. Revisar una visita a pedido/cotización: el contenido debe estar enmascarado.

## Presupuesto de rendimiento

Durante los primeros siete días comparar móvil en Vercel Speed Insights:

- INP P75 no debe empeorar más de 20 ms;
- LCP P75 no debe empeorar más de 100 ms;
- CLS debe permanecer por debajo de 0.1;
- no debe aparecer una tarea larga nueva asociada al script de Clarity;
- el script debe cargarse una sola vez por documento y nunca antes del permiso.

Si se supera un límite, cambiar inmediatamente
`NEXT_PUBLIC_CLARITY_ENABLED=false`, redesplegar y revisar la causa sin afectar
GA4 ni el checkout.

## Cómo analizar resultados

Esperar al menos 100 sesiones consentidas o 14 días antes de tomar una decisión
grande. Analizar por dispositivo y por `route_group`:

1. GA4 identifica el paso con caída anormal.
2. Clarity filtra grabaciones por el evento de ese paso.
3. Revisar al menos 15 sesiones del mismo patrón antes de concluir.
4. Crear una hipótesis concreta, por ejemplo: “el botón de continuar queda fuera
   del primer viewport en móvil”.
5. Aplicar una sola mejora por entrega y comparar otros 7-14 días.

No decidir con una grabación aislada ni interpretar movimientos del cursor como
intención segura de compra.
