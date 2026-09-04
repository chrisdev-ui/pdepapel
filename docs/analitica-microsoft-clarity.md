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

Las variables públicas de GA4 y Clarity deben existir solo en **Production**.
No configurarlas en Preview ni Development: las visitas de pruebas, E2E y ramas
temporales contaminarían los mismos informes de producción. En
`pdepapel-admin`, `GA4_MEASUREMENT_ID` y `GA4_API_SECRET` también deben limitarse
a Production.

## Diseño técnico

- El SDK oficial `@microsoft/clarity` se descarga en un fragmento separado.
- El navegador espera consentimiento explícito y un periodo ocioso antes de
  solicitar el script de Clarity.
- Publicidad permanece siempre denegada (`ad_Storage: denied`).
- Rechazar o revocar analítica desactiva Clarity y GA4; comprar sigue funcionando.
- El consentimiento cambió a versión `v2`, por lo que cada navegador volverá a
  preguntar una sola vez después del despliegue.
- La decisión se guarda en `localStorage` y se replica en una cookie de un año
  emitida por `POST /api/consent` (`pdepapel_analytics_consent_v2`). Safari e
  iOS borran el almacenamiento escrito por scripts tras 7 días sin visitar el
  sitio, pero conservan las cookies fijadas por el servidor, así que quien vuelve
  no ve el aviso de nuevo. Al cambiar el alcance del consentimiento, sube
  `ANALYTICS_CONSENT_VERSION` para renombrar ambos a la vez.
- No se usa la API `identify` ni se envían correo, teléfono, dirección, documento,
  número de pedido, token, SKU o identificadores de cliente.
- Clarity recibe nombres cerrados de eventos, no los parámetros detallados de GA4.
- `robots.txt` conserva privadas las rutas de pedido, cuenta y checkout, pero
  permite específicamente a `Clarity-Bot` leer `/_next/static/` y
  `/_next/image`. Esos recursos versionados son necesarios para reconstruir
  estilos, fuentes e imágenes en las reproducciones.

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
  `checkout_payment_redirect`, `checkout_validation_error`,
  `checkout_submit_failed`, `checkout_payment_redirect_failed`,
  `shipping_quote_requested`, `shipping_quote_succeeded`,
  `shipping_quote_no_results`, `shipping_quote_failed`;
- minicarrito: `cart_preview_view`, `cart_preview_action`,
  `cart_preview_dismiss_manual`, `cart_preview_dismiss_auto`;
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

## Embudos que deben quedar guardados

### GA4: descubrimiento y carrito

Crear una exploración de embudo **abierto**, con seguimiento indirecto y
desglose por `device category`:

1. `view_item_list`
2. `select_item`
3. `view_item`
4. `add_to_cart`
5. `view_cart`

Duplicarla con desglose por `session source / medium` para diferenciar tráfico
orgánico, directo y campañas.

### GA4: checkout confirmado

Crear una exploración de embudo **cerrado**, dentro de la misma sesión, con:

1. `begin_checkout`
2. `add_shipping_info`
3. `add_payment_info`
4. `checkout_order_submitted`
5. `purchase`

`purchase` se envía únicamente desde Administración después de una transición
real y verificada a `PAID`. El `transaction_id` evita confundir reintentos con
ventas distintas. Si no existe una venta pagada real, cero compras es el
resultado correcto; nunca generar una compra ficticia en producción.

### Clarity: segmentos equivalentes

Guardar segmentos por evento para `add_to_cart`, `begin_checkout`,
`checkout_validation_error`, `shipping_quote_failed`,
`checkout_submit_failed` y `checkout_payment_redirect_failed`. Combinar cada
segmento con `Device = Mobile` y con la etiqueta `route_group` correspondiente.
Clarity explica el patrón visual; GA4 conserva el conteo y la conversión.

## Higiene de tráfico interno

- La propietaria y quien haga pruebas deben rechazar analítica en su navegador
  habitual de QA o usar un perfil dedicado sin consentimiento.
- En GA4, definir tráfico interno solo para una IP fija y activar primero el
  filtro en modo de prueba antes de excluirlo definitivamente.
- En Clarity, usar **Settings → IP blocking** únicamente para IP fija. No
  bloquear una red móvil o IP dinámica compartida.
- Mantener activada la exclusión de bots y revisar sesiones anormalmente largas
  antes de interpretar promedios.

## Reproducciones que parecen no tener estilos

Una reproducción de Clarity no es un video: reconstruye el DOM y vuelve a
solicitar CSS, fuentes e imágenes. Si parece desordenada:

1. Revisar **More details** y anotar URL, dispositivo, navegador, hora, LCP, INP,
   CLS y errores JavaScript.
2. Abrir la misma URL en un dispositivo equivalente. Si la navegación real es
   correcta y la persona continúa interactuando normalmente, tratarlo primero
   como artefacto de reproducción.
3. Confirmar que la hoja `/_next/static/css/*`, una fuente
   `/_next/static/media/*.woff2` y `/_next/image` responden `200` a
   `User-Agent: Clarity-Bot`, con tipos `text/css`, `font/woff2` e imagen.
4. Revisar el `robots.txt` publicado: el grupo específico `Clarity-Bot` debe
   permitir los recursos de Next.js y seguir bloqueando rutas privadas.
5. Si varias sesiones nuevas comparten la misma ruta, dispositivo y error,
   correlacionar la hora con Vercel antes de concluir que fue solo el reproductor.

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

## Revisión semanal mínima

1. Comparar móvil y escritorio en usuarios, engagement y pasos del embudo.
2. Registrar la mayor caída del embudo de catálogo y del checkout.
3. Revisar hasta 15 grabaciones del mismo evento o insight, no sesiones al azar.
4. Separar errores técnicos de decisiones de compra y falta de intención.
5. Priorizar JavaScript errors, checkout failures y dead clicks repetibles.
6. Cambiar una hipótesis por entrega y comparar durante otros 7-14 días.
