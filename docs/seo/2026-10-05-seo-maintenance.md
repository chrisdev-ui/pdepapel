# Mantenimiento SEO — 2026-10-05 (Fase 0: auditoría)

Alcance: `papeleriapdepapel.com` (tienda en línea) y la parte de administración que la alimenta (sitemap, feeds, slugs y alias). Fuentes: Google Search Console (propiedad de dominio `sc-domain:papeleriapdepapel.com`), GA4 (propiedad «Papelería P de Papel», `p550061543`), Microsoft Clarity (proyecto `sc857ich8n`), peticiones de solo lectura a producción y lectura del repositorio.

Todo lo que sigue es de **solo lectura**. No se cambió código, configuración ni datos. No se pulsó «Validar corrección», «Solicitar indexación» ni «Enviar sitemap». En Search Console solo se usó Inspección de URLs y la «Prueba en tiempo real», que no modifican nada. Este documento es el único archivo nuevo y no está en ningún commit.

> **Fechas.** «28 días» = **2026-09-05 → 2026-10-02**, la ventana que muestra Search Console por su retraso de datos. «28 días anteriores» = **2026-08-08 → 2026-09-04**. Clarity: «Last 30 days» leído el 2026-10-05. El informe de **Indexación de páginas** de Search Console dice «Última actualización: 20/9/26». Sus cifras tienen dos semanas.
>
> **Umbral de «impresiones significativas»**: ≥ 10 impresiones en 28 días. Úsalo igual el próximo mes para que las tablas sean comparables.

---

## 1. Resumen

1. **El 22 % de las impresiones de Google ya lleva a un 404.** De las 526 URL de producto con ≥ 5 impresiones en 28 días, 127 terminan hoy en 404: 35 clics y 2.808 impresiones de un total de 12,7 mil. Son productos archivados o borrados con demanda viva: los termos Owala (rojo, negro y lila), el pliego de cartulina blanco, el llavero peluche Lucifer, el block mantequilla, la lata de pañitos y los marcadores Guangna. Algunos llegan por una cadena del mapa antiguo: `/producto/termo-owala-rojo-aesthetic-l` → 308 → `/producto/termo-owala-rojo` → 404.
2. **La migración `/product/` → `/producto/` está a medias en Google.** El 40 % de las impresiones (541 URL, 56 clics) sigue mostrándose con la URL inglesa antigua. Además, 708 páginas `/producto/` aparecen como «Duplicada: Google ha elegido una versión canónica diferente». En `tapete-de-corte-mini`, Google elige como canónica la URL **antigua**, que solo redirige. Las dos señales se contradicen: Inspección de URLs dice que ninguna de las dos está indexada (la antigua es «Página con redirección» y la nueva «Duplicada»), pero Rendimiento sigue mostrando la antigua en los resultados. Esa contradicción es el hallazgo: Google está a medio consolidar. La tendencia es buena pero lenta: la URL antigua bajó de 7.203 a 5.045 impresiones y la nueva subió de 2.799 a 6.662 entre ventanas.
3. **Google no puede descargar los JS ni las imágenes `/_next/image` del sitio.** `robots.txt` bloquea `/_next/` para todos menos Clarity. En la prueba en tiempo real de un producto, **49 de 61 recursos no cargaron y 45 por robots.txt** (39 chunks JS y 5 imágenes `/_next/image`, entre ellas el logo).
4. **101 fichas de comerciante no son válidas por un solo bug.** El ProductGroup declara `variesBy: color, size, pattern` fijo (`lib/product-schema.ts:134-138`), aunque las variantes no tienen talla. Google exige entonces el campo `size`: «Falta el campo "size"», 101 elementos, que son críticos. Las fichas de comerciante son la superficie que más convierte: **17,4 % de CTR en posición 2,5** (68 clics de 390 impresiones).
5. **Las páginas de producto no se cachean.** `cookies()` en `app/(routes)/producto/[slug]/page.tsx:77`, el aviso de acceso anticipado añadido el 2026-09-09 en 49554a8e, vuelve dinámica la ruta pese a `revalidate = 300`. Respuesta observada: `cache-control: private, no-store` y `x-vercel-cache: MISS` dos veces seguidas. Core Web Vitals móvil: 81 URL «necesitan mejora» por LCP > 2,5 s (grupo «/» 3,1 s; grupo de producto 3,2 s). Clarity registra cargas de unos 4,8–4,9 s en sesiones que llegan de Google a un producto.
   > **Corrección (Fase 1, 2026-10-05):** `cookies()` no es la única causa. Sin `generateStaticParams`, Next 14 renderiza `/producto/[slug]` en cada visita aunque la ruta exporte `revalidate`. Se probó con `next build` + `next start`: sin la cookie seguía en `no-store`, y con `generateStaticParams()` → `[]` pasó a `HIT`. Esa función nunca existió en el repositorio (`git log -S`), así que la ficha probablemente nunca estuvo en caché ISR, ni antes del 2026-09-09. Ver §7.
6. **Las categorías casi no existen para Google.** Solo 4 categorías tienen impresiones: blocks 184, agendas 91, lápices 8 y borradores 2. 9 categorías están en «Descubierta: actualmente sin indexar». En enlaces internos, `/categoria/agendas` tiene 47 y `/categoria/blocks-de-hojas-decorativas` 20, frente a unos 2.100 de `/nosotros`. Los «tipos» del menú (Escritura, etc.) solo existen como `/tienda?typeId=<uuid>`, bloqueado en robots. Las demandas genéricas con impresiones no tienen página donde aterrizar: «cuaderno 5 materias» (67 + 39 + 15 + 14 + 10 impresiones, posición ~12), «crayones/crayolas cremosas», «folder», «papel crepé», «termo owala».
7. **GA4 no sirve hoy para medir conversión.** Los **25 eventos están marcados como eventos clave**, incluidos `page_view`, `session_start`, `scroll` y `user_engagement`. Por eso el porcentaje de interacción es 100 % en todos los canales. Toda la facturación ($92.794) cae en «Unassigned» / landing «(not set)». Además, ni `catalog_search` ni `catalog_no_results` envían el término buscado, así que no se pueden listar las búsquedas sin resultados.

---

## 2. Línea base (para el diff del próximo mes)

| Métrica | Valor | Rango | Fuente |
|---|---:|---|---|
| Clics web (Google) | 249 (antes 244) | 28 d vs 28 d anteriores | GSC › Rendimiento |
| Impresiones | 12,7 mil (antes 11 mil) | ídem | GSC › Rendimiento |
| CTR medio / posición media | 2,0 % / 8,1 (antes 2,2 % / 8,6) | ídem | GSC › Rendimiento |
| Clics, 3 meses | 737 | ~2026-07-03 → 10-02 | GSC › Descripción general |
| Clics de marca («p de papel») | 13 de 60 clics atribuibles a consulta | 28 d | GSC › Consultas (regex `pdepapel\|p\s*de\s*papel`) |
| Clics sin consulta visible (anonimizadas) | ~189 de 249 (76 %) | 28 d | GSC (la suma de las 1.000 consultas = 60 clics) |
| Impresiones con URL `/product/` (antigua) | 5.045 (40 %) · 56 clics · 541 URL | 28 d | GSC › Páginas |
| Impresiones que hoy terminan en 404 | 2.808 (22 %) · 35 clics · 127 URL | 28 d, estado medido 2026-10-05 | GSC › Páginas + barrido propio |
| Móvil / ordenador | 148 clics · 8.732 impr. / 98 · 3.841 | 28 d | GSC › Dispositivos |
| Colombia | 213 clics · 7.865 impr. | 28 d | GSC › Países |
| Fragmentos de productos | 93 clics · 5.370 impr. · 1,7 % | 28 d | GSC › Aparición en búsquedas |
| Fichas de comerciantes | 68 clics · 390 impr. · 17,4 % · pos 2,5 | 28 d | GSC › Aparición en búsquedas |
| Indexadas / sin indexar | 1.939 / 2.691 | informe a 2026-09-20 | GSC › Páginas |
| Sitemap: URL descubiertas | 890 (867 productos, 14 categorías, 9 fijas) | leído 2026-09-29 | GSC › Sitemaps + `sitemap.xml` en vivo |
| Fichas de comerciantes válidas / no válidas | 51 / 101 | 2026-10-02 | GSC › Fichas de comerciantes |
| Fragmentos de producto / Rutas de exploración | 73 / 0 · 59 / 0 | 2026-10-02 | GSC › Descripción general |
| CWV móvil (buenas / mejora / malas) | 0 / 81 / 0 (LCP) | CrUX a 2026-10-02 | GSC › Core Web Vitals |
| CWV ordenador | sin datos suficientes | 90 d | GSC › Core Web Vitals |
| Enlaces externos | 0 | — | GSC › Enlaces |
| Acciones manuales / seguridad | ninguna / ninguna | 2026-10-05 | GSC |
| Usuarios GA4 | 335 (línea base 2026-09-22: 282) | 28 d | GA4 › Eventos (`page_view`) |
| Sesiones Organic Search (GA4) | 140 | 28 d | GA4 › Adquisición de tráfico |
| Compradores / `add_to_cart` | 2 / 112 eventos · 39 usuarios | 28 d | GA4 › Eventos |
| `catalog_no_results` | 45 eventos · 26 usuarios (antes 35 · 18) | 28 d | GA4 › Eventos |
| Sesiones Clarity / rebote rápido / clics muertos | 697 / 41,46 % / 17,07 % (antes 464 / 42,2 % / 19,6 %) | 30 d | Clarity › Dashboard |
| Sesiones Clarity desde Google | 181 · rebote rápido 32,6 % · clics muertos 14,36 % · LCP 2,8 s | 30 d | Clarity (referrer `https://www.google.com/`) |

GSC cuenta 249 clics y GA4 140 sesiones orgánicas. La diferencia se explica porque la analítica solo se activa con consentimiento. Para volumen, la fuente principal es Search Console.

---

## 3. Hallazgos con evidencia

### A. Search Console

**A1. Consultas.** Hay 72 consultas en posición 4–20 con ≥ 10 impresiones. Las más grandes:

| Consulta | Clics | Impr. | Pos. |
|---|---:|---:|---:|
| cuaderno 5 materias | 0 | 67 | 12,3 |
| termo owala negro | 0 | 52 | 8,9 |
| crayones cremosos | 0 | 49 | 9,5 |
| escarcha gruesa | 3 | 46 | 10,5 |
| crayolas cremosas | 0 | 46 | 10,1 |
| termo owala rojo | 0 | 45 | 10,4 |
| impresora kawaii | 0 | 41 | 9,1 |
| cuadernos 5 materias | 0 | 39 | 12,6 |
| folder blanco | 0 | 36 | 10,6 |
| marcadores acrilicos gipao | 0 | 33 | 7,8 |

**Top 3 sin clics** (posible imagen o carrusel; candidatas a título y descripción): «block iris» 0/138 en pos 1,6, «un pliego de cartulina» 0/61 en 2,7, «stiker» 0/22 en 2,8, «separador de paginas» 0/18 en 1,2.

**Lejos** (> 20): «cenefa papel» 0/85 en 26,9. La lista completa está en el registro de evidencia de la sesión.

**A2. Páginas.**

- Páginas con más impresiones: `/` 47 clics · 408 impr.; `/producto/cuaderno-5-materias-peq-norma` 4 · 349; `/producto/block-iris-x35-hojas` 2 · 286; `/producto/lapiceros-marfil-pastel-x10` 7 · 222.
- Páginas con muchas impresiones y 0 clics: `marcador-acrilico-punta-pincel-profesional-gipao-x12` (171), `pliego-cartulina-blanco-clasico-l` (169, hoy 404), `termo-owala-rojo-aesthetic-l` (162, hoy 404), `block-hojas-blancas-oficio-x70h` (138).
- `/sign-in` sigue con 58 impresiones. Además, 329 URL `/sign-in?redirectUrl=…` aparecen como «Página alternativa con etiqueta canónica adecuada». Es ruido viejo y se resolverá solo.

**A3. Indexación** (a 2026-09-20; reparto por patrón de URL sobre la lista de ejemplos, hasta 1.000):

| Motivo | Páginas | Composición |
|---|---:|---|
| Duplicada: Google eligió otra canónica | 881 | `/producto/<slug>` 708 · `/product/<uuid>` 113 · `/product/<slug>` 53 · `/shop?` 7 |
| Página con redirección | 734 | `/producto/<uuid>` 321 · `/product/<uuid>` 314 · `/product/<slug>` 57 · `/producto/<slug>` 36 · www/http 3 |
| Rastreada: sin indexar | 331 | `/product/<uuid>` 222 · `/producto/<slug>` 48 · `/sign-in?` 42 · `/shop?` 18 |
| Alternativa con canónica adecuada | 329 | todas `/sign-in?redirect…` |
| Excluida por noindex | 233 | `/producto/<uuid>` 76 · `/producto/<slug>` 66 · `/product/<uuid>` 47 · `/tienda?` 13 · `/shop?` 11 · `/categoria/*` 10 (p. ej. organizadores, guillotinas) · páginas privadas |
| No encontrada (404) | 122 | `/product/<uuid>` 100 · `/product/<slug>` 14 · `/producto` 7 |
| Descubierta: sin indexar | 48 | `/producto` 37 · `/categoria` 9 (argollados, boligrafos-lapiceros, cartucheras, libretas, llaveros, marcadores, notas-adhesivas, resaltadores, stickers) · `/politicas/privacidad` · `/proximamente` |
| Bloqueada por robots.txt | 13 | `/shop?…`, `/sign-in?…`, una fuente `/_next/static/media/*.woff2` |

**Inspección de URL** de `/producto/tapete-de-corte-mini`: rastreada el 20 sept 2026 por el robot móvil, rastreo e indexación permitidos. Canónica declarada: `/producto/tapete-de-corte-mini`. **Canónica elegida por Google: `/product/tapete-de-corte-mini`.** Esa URL antigua, inspeccionada aparte, figura como «Página con redirección» y también se elige a sí misma como canónica.

**A4. Sitemaps.** `sitemap.xml` se envió el 31 jul 2026, se leyó por última vez el 29 sept 2026, estado «Correcto», 890 URL. El sitemap en vivo (2026-10-05) tiene 890 URL: 867 de producto (antes 857), 14 categorías y 9 fijas, entre ellas `/proximamente`. No tiene duplicados ni URL con parámetros. Las 12 muestras de producto y las 3 de categoría responden 200 sin redirección.

**A5. Experiencia.** Móvil: «LCP > 2,5 s» en 81 URL, en dos grupos: `/` (64 URL, 3,1 s) y `/product/block-carta-cuadriculado` (17 URL, 3,2 s). Hasta el ~19 ago estaban en «malas» (60–125 URL). Ordenador: datos insuficientes. HTTPS: 63/0.

**A6. Compras y mejoras.**

- Fichas de comerciantes (2026-10-02):
  - **Crítico:** falta `size` en 101 elementos. Ejemplos: `/producto/lapices-mafalda-x6` y `/producto/resaltadores-mafalda-pastel`. Se verificó en vivo: el JSON-LD de `lapices-mafalda-x6` tiene `variesBy` [color, size, pattern]; las 4 variantes comparten color «Multicolor», difieren solo en pattern y ninguna tiene talla.
  - **No críticos:** sin `hasMerchantReturnPolicy` (152), sin `shippingDetails` (152), sin GTIN o marca (107), sin `validFrom` (4), sin `description` (1).
- Fragmentos de productos: 73 válidos, 0 no válidos.
- Rutas de exploración: 59 válidas, 0 no válidas.

**A7. Enlaces.** Enlaces externos: 0. Internos: 12.175, concentrados en las páginas del pie (`/` 4.190, `/nosotros` 2.189, `/tienda` 2.170, `/contacto` 2.146). Categorías: agendas 47, blocks 20.

### B. GA4 (2026-09-05 → 10-02)

- **Canales (sesiones):** Unassigned 156, Organic Search 140, Organic Social 139, Direct 101, Organic Shopping 59, Referral 46, AI Assistant 15.
- **Porcentaje de interacción de 100 % en todos los canales.** En Administrar › Eventos › «Eventos clave» aparecen los 25 eventos del flujo, incluidos `page_view`, `session_start`, `first_visit`, `scroll`, `user_engagement` y `click`. Toda la facturación ($92.794) se atribuye a «Unassigned» / página de destino «(not set)». La compra se registra sin la sesión del navegador.
- **Organic Search por página de destino** (140 sesiones):
  - `/` 38 (3 min 20 s)
  - `/tienda` 15 (18 s)
  - productos, en conjunto 72: escarcha gruesa plateada 4, lapiceros marfil 4, llavero peluche Lucifer 3 (hoy 404), cuaderno 5 materias 2, …
  - `/finalizar-compra` 3
  - categorías 5
- **Búsqueda interna:**
  - Eventos: `search` 137/51 usuarios, `view_search_results` 52/23, `catalog_search` 62/4, `catalog_no_results` 45/26.
  - Los informes estándar no tienen una dimensión «ruta + cadena de consulta» para páginas internas. Tampoco hay dimensión personalizada `search_term`, y el código no envía el término en `catalog_search` ni en `catalog_no_results` (§F). **Por eso no se pudieron listar términos sin resultados.** No se creó ninguna Exploración, porque eso guarda un objeto en la propiedad.
  - Lo único disponible es la página de destino con cadena de consulta (las 250 primeras filas): 18 sesiones entraron por `/tienda?search=`, con los términos «el principito», «harry potter», «block», «carpeta» y «lapicero». Siguen aterrizando búsquedas de Instagram, aunque menos de lo que sugería la línea base.

### C. Clarity (30 días)

- **Todo el tráfico:** 697 sesiones (60 de bots excluidas), rebote rápido 41,46 %, clics muertos 17,07 %, clics de rabia 0,29 %, scroll medio 61 %, rendimiento 76/100 (LCP 2,4 s, INP 220 ms, **CLS 0,28 «poor»**). JS: 8 errores, todos «error invoking postmessage: java object is gone», propio del navegador embebido de una app.
- **Desde Google** (referrer `https://www.google.com/`, que incluye Shopping; el filtro «Channel» de Clarity no tiene orgánico):
  - 181 sesiones, 4,4 páginas/sesión, rebote rápido 32,6 %, clics muertos 14,36 %, LCP 2,8 s, CLS 0,2.
  - Entradas: `/tienda` 59, `/` 42, `/finalizar-compra` 10, `/categoria/boligrafos-lapiceros` 7, `/categoria/agendas` 6.
  - En las 100 grabaciones más recientes, 58 son móviles y 23 duran ≤ 20 s en una sola página.
- **Grabaciones vistas** (6):
  1. `/producto/llavero-peluche-lucifer` (27 sept, móvil): 2 s, 0 clics. Esa URL hoy da 404.
  2. `/producto/cuaderno-5-materias-peq-norma` (2 oct, app de Google): abre la foto al segundo 1 y se va al 8. Clarity estima la carga en unos 4,9 s.
  3. `/producto/lapices-mafalda-x6` (3 oct, visitante de Argentina): la ficha dice «Agotado» con el botón «Avísame». Se va a los 9 s.
  4. Entrada en `/` desde Google → «Escritura» (`/tienda?typeId=…`) → un producto → vuelve a la lista. Los tipos son la navegación real, pero Google no puede rastrearlos.
  5. `/producto/lapicero-retractil-furia-de-intensamente-rojo` (20 sept, móvil): 8 s sin interacción, carga de unos 4,8 s.
  6. `/producto/lata-mini-de-panitos-humedos` (24 sept, PC): 9 s, 0 clics. Hoy es 404.
- **Notas:**
  - Los clics de fichas de comerciantes llegan con `?srsltid=…`. La canónica descarta parámetros, así que no hay problema.
  - Las grabaciones antiguas se reproducen sin CSS (los assets con hash ya no existen tras los despliegues). Es un artefacto de la reproducción, no un defecto para el usuario.

### D. Tablas cruzadas de oportunidad

**D1. Distancia de ataque** (pos 4–20, ≥ 10 impresiones) **contra lo que existe en el catálogo:**

| Demanda (GSC) | ¿Página propia? | Lectura |
|---|---|---|
| cuaderno(s) 5 materias (~145 impr.) | solo productos; no hay categoría «cuadernos» en el sitemap | hueco de categoría |
| termo owala negro/rojo/lila (~170 impr.) | productos archivados o borrados → 404 | hueco de surtido (decisión de Paula) |
| crayones/crayolas cremosos (95) | producto `crayones-cremosos-x12`, vía `/product/` | consolidar URL y título |
| folder blanco / bolsillos / financiero / pequeño (70) | no hay categoría | hueco de categoría |
| papel crepé azul/verde/amarillo (46) | productos sueltos | categoría «papeles» |
| marcadores gipao / guangna / klipp (~100) | productos; guangna → 404 | títulos con marca primero |
| llavero gato Lucifer (36) | 404 | decisión de surtido o redirección |
| block hojas blancas / cuadriculado (~70) | productos | título y descripción |

**D2. CTR bajo para su posición** (candidatas a reescribir título y descripción):

- `block-iris-x35-hojas` (286 impr. en 2,9; 2 clics). El título termina en «- Clásico, Multicolor» y la descripción es la plantilla genérica «Descubre … en Papelería P de Papel».
- `pliego-cartulina-blanco-clasico-l` (169 impr. en 2,8; 0 clics; hoy 404).
- `marcador-acrilico-punta-pincel-profesional-gipao-x12` (171 impr. en 7,3; 0 clics; el título tiene 70 caracteres).
- La página de inicio (408 impr. en 7,2; 11,5 %) está bien.

**D3. Clics con rebote rápido.** No se puede cruzar con precisión: Clarity no da el rebote rápido por página de entrada para el segmento de Google sin crear segmentos. Las 23 sesiones cortas se reparten sobre todo en `/tienda` (5) y productos sueltos.

**D4. Canibalización por variantes y renombres.**

- Cada variante es autocanónica (`app/(routes)/producto/[slug]/page.tsx:31`) y todas están en el sitemap.
- Los selectores de color son `<button>`, no enlaces (`components/product-info.tsx:362, 399-405, 455`). Los listados agrupan por representante, así que las variantes no representativas solo se descubren por el sitemap.
- No se observó canibalización entre variantes en GSC. El problema real es **`/product/x` contra `/producto/x`** (A3).
- **Regla recomendada:** mantener variantes autocanónicas (cada color es un producto comprable con su propio precio y stock, y es lo que piden las fichas de comerciante con `ProductGroup`), y hacer rastreables los selectores (`<a href>` + `preventDefault`). No canonicalizar al grupo: Google perdería las variantes en Shopping.

**D5. Huecos de demanda.** No se pueden calcular desde GA4 (sin término). Desde GSC: categorías de cuadernos, folders, papeles y cartulina, crayones y termos; productos archivados con demanda (D1).

### E. Verificación técnica en vivo (2026-10-05, 04:09–05:15 UTC, solo GET/HEAD)

- **Sin bloqueo de bots:** Chrome y Googlebot reciben el mismo HTML.
- **`robots.txt`:**
  - `*` → `Disallow: /_next/`, `/tienda?`, `/categoria/*?` y las rutas privadas.
  - Clarity-Bot tiene `Allow: /_next/static/` y `/_next/image`.
  - AhrefsBot y Amazonbot: `Disallow: /`.
  - Las entradas privadas acaban en `/` (`/carrito/`), y las rutas reales no llevan barra. Esas páginas ya son noindex por metadatos.
- **Redirecciones:**
  - Las rutas inglesas (`/shop`, `/cart`, `/about`, `/wishlist`, `/checkout`, `/product/<slug>`) dan un solo 308.
  - **`https://www.` → apex responde 307 (temporal).** `http://www.…/tienda` hace 2 saltos (308 y luego 307).
  - `/sign-in` → `/iniciar-sesion/` → `/iniciar-sesion` (2 saltos).
  - `/Tienda` da 404.
- **Alias del 2026-09-17:** se confirmaron 3 de 5 (308 → 200):
  - `carpeta-plastica-oficio-lila` → `-verde-pastel`
  - `carpeta-van-gogh` → `carpeta-hermetica-carta-de-van-gogh-verde`
  - `carpeta-archivadora-fashion-pastel-con-5-compartimientos-azul-pastel-moderno` → `…-moderno-lila`
  - Los slugs antiguos del planillero y del archivador media carta x13 no están en el repositorio (ver §7).
- **404 reales:** productos y categorías inexistentes devuelven 404 con `noindex`. `/tienda?search=zzzzqqq` devuelve 200 con `noindex`, pero robots impide que Google lo lea.
- **Metadatos:**
  - Marca duplicada en `/tienda` («Tienda | P de Papel | Papelería P de Papel»), `/nosotros` y las categorías. En las categorías es por datos: el `seoTitle` ya trae «| P de Papel».
  - Títulos de producto con sufijo «- {estampado}, {color}» que repite o no aporta («Colores NORMA x12 doble punta - Clásico, Amarillo»).
  - Variantes hermanas con la misma descripción truncada.
  - Descripciones de más de 160 caracteres en políticas, nosotros y contacto.
- **`og:image`:** `/opengraph-image.png`, referenciado en `/` y `/tienda`, **responde 404**. `/opengraph-image.jpg` sí existe.
- **JSON-LD:**
  - Producto sin `shippingDetails`, `hasMerchantReturnPolicy`, `priceValidUntil`, gtin ni `seller`. A veces también sin `brand`.
  - `ProductGroup` sin url, imagen ni marca.
  - La tarjeta regalo no tiene `image`.
  - Organization sin dirección (solo `/contacto` tiene PostalAddress de Medellín).
  - La SearchAction apunta a `/tienda?search=`, que robots bloquea.
- **Caché:**
  - Productos, `/tienda`, categorías y `/proximamente`: `private, no-store`, MISS. TTFB de 0,4 a 1,4 s, y `/tienda?search=` 3,6 s.
  - Inicio, políticas, nosotros, contacto y tarjeta regalo salen de caché (HIT).
- **Paginación:** «Cargar más» y la paginación son `<button>`, sin `href`. El HTML de `/tienda` enlaza solo 12 productos.
- **LCP:** en el inicio, la imagen principal está bien configurada (`fetchpriority=high`, preload y `sizes`). En `/tienda` se precargan 9 imágenes de tarjeta, 5 con `fetchpriority=high`.

### F. Repositorio y ciclo de vida de URL

- **`/_next/` en robots:** lo añadió f5914b09 (2026-01-27) sin justificación. La excepción solo para Clarity llegó con cd9327af (2026-08-31; `docs/analitica-microsoft-clarity.md:57-59`). Los tests fijan el estado actual en `tests/unit/app/robots.test.ts:36-44, 54-55`.
- **Feeds de Merchant y Meta: precio base contra precio con descuento.**
  - `lib/google-merchant-feed.ts:185` y `lib/meta-catalog-feed.ts:200` envían `product.price` sin `sale_price`. La ficha y su JSON-LD muestran el precio con descuento (la API aplica `calculateDiscountedPrice`, `app/api/[storeId]/products/[productId]/route.ts:155-168`).
  - Con una oferta activa, Merchant marcaría «precio no coincide».
  - Preventa con stock 0: el feed dice `out_of_stock` y la ficha dice PreOrder.
  - **No se verificó en Merchant Center.**
- **Caminos que todavía producen URL muertas** (todos en administración):
  - Borrar un producto: DELETE en `products/[productId]/route.ts:529-588`. Los alias se borran en cascada (`schema.prisma:515-528`).
  - Borrar una variante desde la ficha del producto.
  - Quitar una variante sin hermana superviviente en el PATCH del grupo (`[productGroupId]/route.ts:276`).
  - Borrar un grupo entero (`:499`).
  - Borrar una categoría (`categories/[categoryId]/route.ts:232-255`, `categories/route.ts:222-226`).
  - Fusionar categorías: la URL de la categoría origen queda en 404, y un test lo afirma a propósito (`lib/attribute-merge.ts:271-276`, `lib/category-slugs.ts:62-82`, `tests/integration/attribute-merge-flow.test.ts:149`).
  - Archivar una categoría.
  - Archivar un producto también da 404 por la política vigente.
  - Renombrar un producto o una categoría, y convertir un producto en variantes (`convert-to-variants/review`), sí conservan alias.
- **Mapa de redirecciones antiguo congelado:** `lib/legacy-product-redirects.mjs` tiene 1.128 reglas fijadas el 2026-08-24 (5d316033). Varios destinos se renombraron o archivaron después, lo que crea cadenas y destinos en 404 (p. ej. `termo-owala-rojo-aesthetic-l` → `termo-owala-rojo` → 404; `carpeta-van-gogh-van-gogh-amarillo-l` → `carpeta-van-gogh` → alias → verde). Se puede regenerar con `scripts/export-product-slug-redirects.ts`.
- **Otros:**
  - `catalog_search` envía solo `query_length` (`app/(routes)/tienda/components/shop-search-bar.tsx:39`). `catalog_no_results` no lleva el término (`components/shop-content.tsx:193-196`).
  - `/proximamente` es una página delgada y está en el sitemap (`app/sitemap.ts:70-72`).
  - `sitemap.ts:27-32` traga los errores: si la API falla, se publica un sitemap casi vacío durante 5 min.
  - `alternates.canonical: "/"` en `app/layout.tsx:92-94` lo heredan las páginas sin canónica propia.
  - `twitter.site` no es un @usuario.
  - `/boletin/[slug]` es indexable pero no está en el sitemap.
  - `Product.slug` no es único en la base de datos, y el slug se calcula fuera de la transacción (`route.ts:369`).
  - El E2E público no prueba un alias 308, el mapa antiguo, la canónica ni el JSON-LD.

---

## 4. Backlog propuesto

Impacto: A/M/B · Esfuerzo: S (< 1 h), M (medio día), L (más) · Confianza: qué tan seguro estoy de la causa y del efecto. Rutas relativas a cada app (S = `pdepapel-store`, A = `pdepapel-admin`). Nada toca diseño.

### P0

| # | Cambio | Impacto | Esfuerzo | Confianza | Archivos | Cómo verificar |
|---|---|---|---|---|---|---|
| P0-1 | `variesBy` calculado a partir de los atributos que realmente varían y que todas las variantes tienen (hoy es fijo) | **A**: 101 fichas no válidas | S | Alta, verificado en vivo | S `lib/product-schema.ts:134-138` + test en `tests/unit` | Test unitario con un grupo que solo varía en estampado; Rich Results Test de `/producto/lapices-mafalda-x6`; después, Christian pulsa «Validar corrección» en GSC › Fichas de comerciantes |
| P0-2 | Permitir `/_next/static/` y `/_next/image` a `*`, igual que a Clarity-Bot | **A**: renderizado e imágenes para Google | S | Alta, prueba en tiempo real: 45 recursos bloqueados | S `app/robots.ts:55-58`, `tests/unit/app/robots.test.ts:36-44,55` | `curl /robots.txt`; GSC › Inspección › Prueba en tiempo real: 0 recursos «bloqueados por robots.txt» |
| P0-3 | Quitar `cookies()` del render de la ficha: leer `EARLY_ACCESS_COOKIE` en el cliente para que la ruta vuelva a ser ISR | **A**: TTFB y LCP de 867 fichas, CPU de Vercel, rastreo | S–M | Alta en la causa (dinámica desde 49554a8e; los fetch de `getProduct` y `getProducts` ya usan `CATALOG_FETCH_CACHE` con revalidate, `lib/catalog-fetch.ts:26`, así que `cookies()` es el único disparador que encontré); media en cuánto mejora el LCP. **Condición previa:** si `next build` sigue marcando la ruta como ƒ, hay otro disparador y hay que buscarlo antes de seguir | S `app/(routes)/producto/[slug]/page.tsx:2,77`, `components/single-product-page.tsx` | `next build`: la ruta sale como ISR (●), no como dinámica (ƒ); en producción, segundo **GET** con `x-vercel-cache: HIT`; el aviso de acceso anticipado sigue funcionando con la cookie |
| P0-4 | Recuperar las URL con demanda que hoy dan 404 (127 URL, 22 % de las impresiones). (a) Regenerar `legacy-product-redirects.mjs` para que ningún destino esté renombrado o en 404. `scripts/export-product-slug-redirects.ts` usa `PrismaClient`, es decir, **lee la base de datos de producción**: necesita tu permiso, o se hace sin base de datos a partir del sitemap público y un barrido HEAD, que es más lento. (b) **Decisión de negocio**, a elegir entre tres caminos. **(b1) Datos, sin código:** para los productos que vuelven, Paula los desarchiva con stock 0 y la ficha queda viva como «Agotado» (OutOfStock) con el mismo slug. **(b2)** 308 a la variante hermana viva del mismo grupo, que es una redirección limpia. **(b3)** 308 a la categoría; Google suele tratar esto como soft 404, así que vale como último recurso. (b2) y (b3) revierten una decisión deliberada: el 2026-09-17 se dejaron a propósito como 404 los ~1.200 alias que apuntan a archivados, y AGENTS.md dice «archivado = 404». Necesitan aprobación explícita | **A** | (a) S–M · (b1) datos · (b2/b3) M | Alta en el diagnóstico; media en cuánto se recupera | S `lib/legacy-product-redirects.mjs`, `middleware.ts:73-80`; A `scripts/export-product-slug-redirects.ts`, `app/api/[storeId]/products/[productId]/route.ts:124-151` | Volver a correr el barrido de las URL de GSC (receta en §6): 0 cadenas que terminen en 404 entre las que tienen ≥ 5 impresiones; test unitario de que el mapa no tiene destinos inexistentes |

### P1

| # | Cambio | Impacto | Esfuerzo | Confianza | Archivos | Cómo verificar |
|---|---|---|---|---|---|---|
| P1-1 | `sale_price` y `sale_price_effective_date` en los feeds de Google y Meta; preventa → `preorder` | A en Merchant cuando haya ofertas activas. Hoy parece **latente**: `/tienda?isOnSale=true` no mostró ninguna marca de descuento el 2026-10-05 | M | Media (leído en código, no visto en Merchant Center) | A `lib/google-merchant-feed.ts:38-58,170,185`, `lib/meta-catalog-feed.ts:182,200` | Tests unitarios de los feeds con una oferta activa; comparar el feed con el JSON-LD de un producto en oferta |
| P1-2 | `shippingDetails` (COP, CO, umbral de envío gratis de `Store.freeShippingThreshold`) y `hasMerchantReturnPolicy` (política de devoluciones) en el Offer; `priceValidUntil` cuando la oferta tiene fecha de fin | M: 152 avisos; mejora el fragmento de Shopping | M | Alta | S `lib/product-schema.ts:75-97` | Rich Results Test; GSC › Fichas: los avisos bajan tras volver a rastrear |
| P1-3 | Títulos: quitar el sufijo de marca manual en `/tienda`, `/nosotros` y `/boletin`; en las fichas, quitar «- estampado, color» cuando no aporta («Clásico», «Multicolor») o repite el nombre; descripción de respaldo con precio y «envío a toda Colombia» | M: CTR de unas 1.900 páginas indexadas | S–M | Media | S `app/(routes)/tienda/page.tsx:64`, `nosotros/page.tsx:61`, `boletin/[slug]/page.tsx:22`, `lib/product-metadata.ts:6-18`, generación de la descripción en `producto/[slug]/page.tsx` | Tests de `product-metadata`; muestreo con curl de títulos y longitudes; GSC: CTR de `block-iris-x35-hojas` y del top de D2 en la próxima ronda |
| P1-4 | `og:image` roto: cambiar `/opengraph-image.png` por la imagen `.jpg` que existe | B–M (redes y mensajería) | S | Alta, 404 verificado | S `app/(routes)/page.tsx` (~:104), `app/(routes)/tienda/page.tsx:56` | `curl` de la `og:image` de `/` y `/tienda` → 200 |
| P1-5 | Categorías y tipos rastreables: selectores de variante como `<a href>`; paginador con `<a href="?page=N">` (sigue siendo noindex con canónica a la base); habilitar `seoEnabled` en las categorías con demanda (carpetas, sombrillas y las del menú) | A a medio plazo: categorías e indexación | M | Media | S `components/product-info.tsx:362,399-405,455`, `app/(routes)/tienda/components/paginator.tsx`, `components/ui/pagination.tsx`; datos en el panel | GSC › Enlaces: más enlaces internos a `/categoria/*`; «Descubierta: sin indexar» de categorías → 0 |
| P1-6 | Páginas de destino para tipos (p. ej. `/tienda/escritura` con `Type.slug`, que ya existe con alias) y categorías nuevas para los huecos de D1 (cuadernos, folders, papeles y cartulinas). Es un cambio de rutas, así que sigue la convención de AGENTS.md: ruta en español, sitemap, nav y tests | A en no-marca | L | Media | S `lib/routes.ts:85-89`, nueva ruta, `app/sitemap.ts`; datos en el panel | Nuevas URL en el sitemap con 200 e indexables; impresiones de «cuaderno 5 materias» sobre una página de categoría en 4–8 semanas |
| P1-7 | Cerrar los caminos de URL muerta en administración: DELETE de producto con variantes → `deleteGroupedVariantKeepingUrls`; variante sin superviviente → apuntar a la variante recién creada; borrar grupo → alias a una hermana viva o a la categoría, o bloquearlo; fusión y archivo de categoría → liberar el slug de la origen y crear el alias en la destino | M (evita futuros incidentes como el del 2026-09-17). La parte de categorías revierte un comportamiento deliberado: el test `attribute-merge-flow.test.ts:149` afirma a propósito el 404 de la categoría fusionada | M | Alta (leído en código) | A `app/api/[storeId]/products/[productId]/route.ts:529-588`, `product-groups/[productGroupId]/route.ts:256-276,499`, `lib/attribute-merge.ts:271-276`, `lib/category-slugs.ts:62-82`, `categories/...` + tests de integración (incluido cambiar el de `attribute-merge-flow.test.ts:149`) | Tests de integración por camino: la URL vieja responde 308 a una viva |
| P1-8 | GA4: (a) dejar como eventos clave solo `purchase`, `begin_checkout`, `add_to_cart` y `whatsapp_cta_clicked`, que es un cambio de **configuración de GA4** y necesita tu aprobación; (b) enviar `search_term` en `catalog_search` y `catalog_no_results` y registrar la dimensión personalizada (también es configuración); (c) revisar por qué la compra llega sin sesión: pasar `client_id` y `session_id` del navegador en el evento del servidor | A para medir | (a) S · (b) S · (c) M | Alta en (a) y (b); media en (c) | GA4 Administrar; S `components/shop-content.tsx:193-196`, `app/(routes)/tienda/components/shop-search-bar.tsx:39`; A el envío de `purchase` por Measurement Protocol | GA4 › Adquisición: porcentaje de interacción < 100 %; la dimensión `search_term` con datos al día siguiente; la próxima compra atribuida a un canal |
| P1-9 | Migración `/product/`: con P0-4 hecho, comprobar en Merchant Center que los enlaces de producto son `/producto/…` (no lo pude ver) y dejar que Google consolide. **No** solicitar indexación en masa | M | S | Media | — | Próxima ronda: impresiones `/product/` < 20 %; «Duplicada: Google eligió otra canónica» en descenso |
| P1-10 | Redirección www → apex como 308 (hoy 307). Se cambia en el panel de dominios de Vercel; es configuración y necesita tu aprobación | B | S | Alta | Vercel › Domains | `curl -sI https://www.papeleriapdepapel.com/` → 308 |

### P2

| # | Cambio | Archivos | Verificación |
|---|---|---|---|
| P2-1 | Quitar la SearchAction (Google retiró el cuadro de búsqueda de sitelinks y su destino está bloqueado) | S `app/(routes)/page.tsx:52-59` | JSON-LD del inicio sin `potentialAction` |
| P2-2 | `/proximamente`: `noindex` cuando no hay productos, o sacarla del sitemap | S `app/(routes)/proximamente/page.tsx`, `app/sitemap.ts:70-72` | `sitemap.xml` / meta robots |
| P2-3 | El sitemap relanza el error en vez de publicarse degradado | S `app/sitemap.ts:27-32` | Test unitario con la API caída |
| P2-4 | Quitar `alternates.canonical: "/"` del layout raíz | S `app/layout.tsx:92-94` | 404 sin canónica a la home |
| P2-5 | Organization u OnlineStore con dirección (Medellín) y `sameAs` en una sola fuente; `image` en la tarjeta regalo; url, imagen y marca en el `ProductGroup` | S `app/(routes)/page.tsx:25-62`, `tarjeta-regalo/page.tsx:46-60`, `lib/product-schema.ts` | Rich Results Test |
| P2-6 | `PRIVATE_PATHS` sin barra final, para que coincidan con las rutas reales | S `app/robots.ts` + test | `robots.txt` |
| P2-7 | E2E público: un alias 308, una regla del mapa antiguo, la canónica y el JSON-LD de un producto | S `tests/e2e/public-catalog.spec.ts` | CI `public-health.yml` |
| P2-8 | Categorías y `/tienda` siguen siendo dinámicas (leen `searchParams`). Evaluar si conviene separar la vista sin filtros cacheable | S `app/(routes)/categoria/[slug]/page.tsx`, `tienda/page.tsx` | HIT en la vista base |
| P2-9 | CLS de 0,28 en Clarity (todo el tráfico): averiguar qué página lo genera antes de tocar nada (posible relación con el rediseño en curso; no se toca diseño) | — | Clarity › Rendimiento por URL |

### Datos para Paula (no es código)

- **Surtido con demanda que hoy da 404:** termos Owala (unas 170 impresiones/28 d), pliegos de cartulina (blanco, rosa, amarillo, verde y azul), llavero peluche Lucifer, block mantequilla, lata de pañitos, marcadores Guangna, corrector cinta Klipp, cuaderno Pusheen, regla Kuromi. ¿Vuelven? Si vuelven, conviene reactivarlos con el **mismo slug**.
- **`seoTitle` de categorías** que ya incluyen la marca (p. ej. «Blocks de hojas decorativas en Colombia | P de Papel» se duplica con la plantilla).
- **Incoherencias de datos:** `lapiceros-marfil-pastel-x10` dice «x 12 unidades» en la descripción; `colores-norma-x12-doble-punta` tiene color «Amarillo» siendo un set de 12; descripciones de una línea (sombrilla, 39 caracteres).

---

## 5. Lo que no se pudo cargar o verificar

- **Términos de búsqueda interna y sin resultados en GA4:** el código no envía el término y no hay dimensión. No se creó ninguna Exploración.
- **Rebote rápido por página de entrada solo para Google en Clarity:** haría falta guardar un segmento. Se usaron las métricas del filtro, las tarjetas de sesión y 6 grabaciones.
- **Merchant Center** (enlaces del feed, desaprobaciones por precio): no está entre las fuentes abiertas.
- **Dos de los cinco alias del 2026-09-17** (planillero y archivador media carta x13): resuelto en la Fase 1 con una consulta de solo lectura aprobada (§7.3).
- **Archivado o borrado:** resuelto en la Fase 1 (§7.3).
- **Informe de Indexación:** su fecha es 2026-09-20. Lo que cambió después no aparece.
- **Core Web Vitals de ordenador:** sin datos suficientes en CrUX.
- **El orden «brand» y «no-brand»:** el 76 % de los clics está en consultas anonimizadas, así que la división de marca solo cubre 60 clics.
- **Un aviso de permiso de red local en Chrome:** un `fetch` de la pestaña de Search Console a `127.0.0.1` (intento de exportar datos a un servidor local) se quedó colgado, probablemente esperando un aviso de Chrome. No se pulsó nada. Si aparece en la barra de direcciones, recházalo.

---

## 6. Método (para repetir la ronda)

1. GSC (cuenta `/u/3/` en el navegador): en Rendimiento, `num_of_days=28` con `metrics=CLICKS,IMPRESSIONS,CTR,POSITION` y `breakdown=page|query|device|country`; para el periodo anterior, `start_date=YYYYMMDD&end_date=…`. Con 500 filas, la tabla deja las 1.000 filas en el DOM; se leen con JavaScript.
2. **Barrido de estado:** URL de producto de GSC con ≥ 5 impresiones, pasadas por el hash a una pestaña de `papeleriapdepapel.com` y consultadas con `fetch(u, {redirect: 'follow'})` en serie, sin temporizadores (Chrome ralentiza los `setTimeout` en pestañas ocultas). 526 URL en unos 25 min, alrededor de 1 req/s.
3. **Indexación:** abrir cada motivo y agrupar los ejemplos por patrón (`/product/<uuid>`, `/product/<slug>`, `/producto/<uuid>`, `/producto/<slug>`).
4. **GA4** (`?authuser=3`, propiedad `p550061543`): página de destino con dimensión secundaria «Grupo de canales principal de la sesión» y luego «Página de destino y cadena de consulta».
5. **Clarity:** el filtro por referrer funciona con el valor completo `https://www.google.com/` (por URL: `&referrer=https%3A%2F%2Fwww.google.com%2F`). Con `www.google.com` o `google` devuelve 0 sesiones.

---

## 7. Estado de la Fase 1 (lote aprobado: P0-1, P0-2, P0-3, P1-4)

Los cuatro ítems están en producción. P0-3 estuvo detenido hasta probarlo en una vista previa de Vercel (§7.2, §7.6) y se fusionó como `10843e01` (§7.7).

| Ítem | Commit | Estado | Tests añadidos |
|---|---|---|---|
| P0-2 robots.txt | `1344c582` | Hecho. `*` → `Allow: /`, `/_next/static/`, `/_next/image`; `Disallow` intacto, incluido `/_next/` | `tests/unit/app/robots.test.ts`: las tres rutas permitidas exactas, `/_next/` sigue bloqueado, filtros y rutas privadas siguen bloqueados |
| P0-1 `variesBy` | `bb214548` | Hecho. `variesBy` sale del marcado de las variantes: un atributo entra solo si todas lo tienen y hay ≥ 2 valores; sin atributos o con combinaciones repetidas se publica `Product` | `tests/unit/lib/product-schema.test.ts`: solo color, solo talla, ambos, ninguno, solo estampado (caso `lapices-mafalda-x6`), atributo faltante en una variante, talla interna de envío. 6 de 7 fallaban con el código anterior |
| P0-3 caché de la ficha | `10843e01` (un solo commit; la rama `seo/p0-3-en-espera` quedó fusionada) | Hecho y en producción. Ver §7.7 | `tests/components/single-product-page.test.tsx` (estado público sin cookie, botón de compra con cookie, HTML del servidor nunca trae el estado desbloqueado) y `tests/unit/app/producto-page-cache.test.ts` |
| P1-4 `og:image` | `6e99902a` | Hecho. `/images/og-p-de-papel-1200x630.jpg`: el logo `text-beside-white-bg.webp` reducido y completado con su mismo blanco `#FFFFFF`, 1200×630, 38,5 KB. Es la **primera** `og:image` de inicio y la de `/tienda` (constante `DEFAULT_SHARE_IMAGE`). En inicio, `/images/no-text-lightpink-bg.webp` queda segunda (declara 800×600, pero el archivo es 4000×4000), y `twitter.images` de inicio sigue apuntando a ese webp: sin cambio, fuera del lote | `tests/unit/app/share-images.test.ts`: tamaño leído del marcador SOF del JPEG (sin `sharp`, que solo llega como dependencia transitiva de Next) y peso < 100 KB; ninguna página apunta a una imagen local inexistente (fallaba con el código anterior) |

**Puertas (en `main`, 2026-10-05):** tienda `lint` sin avisos, `test:coverage` 131 archivos / 624 tests, `type-check`, `build`. Administración `tsc --noEmit` sin errores, `test:coverage` 396 archivos / 3.261 tests e integración contra MySQL local en Docker 63 archivos / 456 tests. En una primera pasada de cobertura de administración, dos tests de componentes (`bulk-manual-update-modal`, `product-group-unassigned-images`) superaron el límite de 5 s porque la cobertura de la tienda corría a la vez. Solos tardan 172 y 513 ms, y la pasada sin carga salió verde: no se tocaron. Administración `test:unit` tenía **1 fallo previo y ajeno** a este lote: `tests/components/coupon-form.test.tsx` usa un cupón que vence el `2026-10-01T04:59:59Z`, y con el reloj real dejó de mostrar «Desactivar». Christian pidió arreglar todos los tests, así que se corrigió en un commit aparte que fija solo `Date` en 2026-09-15 (`vi.useFakeTimers({ toFake: ["Date"] })`).

**Muestra de P0-1** (HTML local de `next start` contra la API de producción, comparado con producción antes del cambio):

| Producto | Antes (producción) | Después (local) |
|---|---|---|
| `lapices-mafalda-x6` (grupo) | `variesBy` color, size, pattern; 4/4 variantes sin algún atributo declarado | `variesBy` pattern; 0 variantes incompletas |
| `resaltadores-mafalda-pastel` (grupo) | color, size, pattern; 4/4 incompletas | pattern; 0 incompletas |
| `carpeta-plastica-oficio-verde-pastel` (grupo) | color, size, pattern; 3/3 incompletas | color; 0 incompletas |
| `block-iris-x35-hojas` | `Product` (sin cambio) | `Product` (sin cambio) |
| `cuaderno-5-materias-peq-norma` | `Product` (sin cambio) | `Product` (sin cambio) |

### 7.1 P0-3: qué controla la cookie de acceso anticipado

- **Qué controla:** solo el estado de compra de los productos «Próximamente» (`availableAt` futuro), en `lib/product-availability.ts:80`. Sin la cookie se muestra «Avísame cuando llegue» y no se puede comprar; con la cookie se muestra el estado normal de stock y el botón de compra. No cambia precios, contenido ni datos estructurados.
- **Dónde se lee:**
  - la ficha, en `app/(routes)/producto/[slug]/page.tsx:77` con `cookies()`;
  - `/proximamente`, en `proximamente/page.tsx:33` con `cookies()` (fuera de alcance, sin cambios);
  - el checkout, en el navegador, en `multi-step-checkout-form.tsx:1176` con `readEarlyAccessCookie()`.
- **Dónde se hace cumplir:** en el checkout del panel. `pdepapel-admin/app/api/[storeId]/checkout/route.ts:585-608` verifica el token firmado (`verifyEarlyAccessToken`) y rechaza el pedido si falta. La cookie la pone `acceso-anticipado/route.ts:30` sin `httpOnly`, así que leerla en el navegador es legítimo.
- **Otras API dinámicas en la ruta:** ninguna. Se revisaron `cookies()`, `headers()`, `searchParams`, `noStore` y `force-dynamic` en la página, `app/layout.tsx`, `app/(routes)/layout.tsx`, `RelatedProducts` y `Newsletter`. Los fetch de `getProduct` y `getProducts` ya usan `CATALOG_FETCH_CACHE` (revalidate 300, etiqueta `products`).
- **Cambio en la rama:** el hook `useEarlyAccess` (`hooks/use-early-access.ts`) arranca en `false` y lee la cookie después de hidratar. El HTML que se cachee siempre trae el estado público.

### 7.2 Por qué P0-3 se detuvo (resuelto en §7.6 y §7.7)

Mover la cookie al navegador **no basta**. Con `next build` + `next start` (API de producción, solo lectura), la ficha seguía en `private, no-store`. La causa es que, sin `generateStaticParams`, Next 14 renderiza la ruta dinámica en cada visita. Con `generateStaticParams()` → `[]` sí funciona:

| Petición | 1ª | 2ª |
|---|---|---|
| `block-iris-x35-hojas`, `lapices-mafalda-x6`, `carpeta-plastica-oficio-verde-pastel` | 200 MISS, `s-maxage=300, stale-while-revalidate` | **200 HIT** |
| `no-existe-jamas-e2e`, `mini-kit-lector` (archivado) | 404 MISS | 404 HIT |
| Alias `carpeta-plastica-oficio-lila`, `carpeta-van-gogh` | 308 **con** `Location` | 308 HIT **sin `Location`** |

**El problema:** la 308 de un alias, servida desde la caché, pierde la cabecera `Location`. `curl -L` se queda en la 308 y el destino solo viaja dentro del payload RSC (`NEXT_REDIRECT;replace;…;308`) para el JavaScript del navegador. Activar ISR así rompería todas las redirecciones que hace la propia página: los alias de producto (incluidos los cinco del 2026-09-17) y las rutas por UUID (`/producto/<uuid>` → slug; Search Console todavía rastrea 321 de esas). No se probó si Vercel guarda la cabecera de otra forma; haría falta un despliegue de vista previa.

Opciones (ninguna elegida):

1. **Probar en una vista previa de Vercel** la rama `seo/p0-3-en-espera` con un alias, antes de decidir. Si Vercel conserva `Location`, se fusiona tal cual. Requiere tu permiso para desplegar una vista previa.
2. **Mover los alias fuera de la página:** el middleware consulta un mapa de alias en caché (endpoint del panel con todos los `ProductSlugAlias` vivos, cacheado unos minutos) y responde la 308 antes de llegar a la página ISR. Esfuerzo M y una pieza más que mantener; el riesgo es que un alias nuevo tarde unos minutos en redirigir.
3. **Dejar la ficha dinámica** y fusionar solo el commit del hook (`b82e9ba5`). No mejora la caché por sí solo, pero quita una API dinámica y deja preparada cualquier opción futura.
4. **Ruta separada para alias:** la página resuelve solo slugs canónicos y `notFound()` para el resto, y un route handler dinámico hace la 308. Necesita un rewrite en el middleware para distinguirlos; esfuerzo similar a la opción 2.

### 7.3 Consulta de solo lectura en producción (aprobada)

Solo `findMany`, con `pdepapel-admin/.env` contra la base de producción. El script queda en el scratchpad de la sesión, no en el repositorio. Universo: las 526 URL de producto de GSC con ≥ 5 impresiones (2026-09-05 → 10-02), extraídas otra vez de Search Console. La resolución replica la de la tienda: `/product/` → `/producto/`, el mapa antiguo del middleware, y luego producto directo y alias.

| Estado | URL | Clics | Impr. |
|---|---:|---:|---:|
| Vivo | 396 | 127 | 7.645 |
| Vivo vía alias | 3 | 0 | 38 |
| **Archivado** | **117** | 35 | 2.692 |
| **Alias que apunta a un archivado** | **4** | 0 | 50 |
| **Ausente en la base de datos (borrado)**; 5 de 6 estaban en el mapa del 2026-08-24 | **6** | 0 | 66 |
| **Total que hoy da 404** | **127** | **35** | **2.808** |

Coincide exactamente con el barrido HTTP del audit (127 URL, 35 clics, 2.808 impr.).

- Las URL «ausentes» son todas papel seda (verde, morado, curuba, lila), `carpeta-tela-oficio-de-cuadros` y un UUID. Al aparecer en Google existieron alguna vez, así que «nunca existió» no aplica a ninguna.
- De los 117 archivados, 27 pertenecían a un grupo de variantes. 9 de las 127 URL llegan por el mapa antiguo del middleware.
- Fechas de última modificación de los archivados: 2026-07-30 → 2026-10-01.

Archivados con más impresiones: pliego cartulina blanco (169, en grupo), termo Owala rojo (162, en grupo), llavero peluche Lucifer (152, 4 clics), block mantequilla (110), termo Owala negro (110, en grupo), lata mini de pañitos húmedos (89), folder carta blanco (87), resaltadores Klipp-line x6 (84), termo Owala lila (65, en grupo), marcadores acrílicos Guangna x12 (52), squishy Harry Potter (50), agenda capibara (48), Lego Zootopia (48), Lego Pochacco (46), crayolas cremosas en tarro (43). La lista completa está en `classify-prod.json` del scratchpad de la sesión.

**Alias del 2026-09-17, los cinco localizados y funcionando** (308 → 200, un salto):

| Id | Slug antiguo | Destino |
|---|---|---|
| `374e3259` | `carpeta-archivadora-fashion-pastel-con-5-compartimientos-azul-pastel-moderno` | `…-moderno-lila` |
| `5e7ebe7a` | `planillero-con-tapa-fashion-pastel` | `planillero-fashion-con-tapa-oficio-azul-pastel-moderno` |
| `b951d550` | `archivador-media-carta-pastel-x13` | `archivador-media-carta-klipp-con-13-compartimentos-lila-clasico` |
| `bc70872c` | `carpeta-plastica-oficio-lila` | `carpeta-plastica-oficio-verde-pastel` |
| `d94784a3` | `carpeta-van-gogh` | `carpeta-hermetica-carta-de-van-gogh-verde` |

No se creó ningún alias ni redirección. P0-4 sigue sin aprobar. Recordatorio: AGENTS.md (tienda) prohíbe redirigir un archivado a una categoría o a otro producto, así que la vía compatible es reactivar con stock 0 (opción b1).

### 7.4 Verificación tras el despliegue (pendiente de tu OK para el push)

- **En producción, con Claude en Chrome, solo lectura:**
  - contenido de `robots.txt`;
  - JSON-LD de los 5 productos de la tabla de arriba;
  - cabeceras de caché de 3 fichas (seguirán en `no-store` mientras P0-3 esté detenido; es lo esperado);
  - la **primera** `og:image` de inicio y la de `/tienda` → `https://papeleriapdepapel.com/images/og-p-de-papel-1200x630.jpg` con 200;
  - Inspección de URL en tiempo real de un producto en Search Console: los recursos bloqueados por robots deberían bajar de 45 (49 de 61 sin cargar).
- **Acciones de Search Console para Christian** (no las hago yo):
  1. Fichas de comerciantes → «Falta el campo "size"» → **Validar corrección**.
  2. Ajustes → Informe de robots.txt: confirmar que Google leyó la versión nueva (o pedir un nuevo rastreo del archivo desde ahí).
  3. Páginas → «Bloqueada por robots.txt» → **Validar corrección** cuando el punto 2 muestre el archivo nuevo.
  4. Opcional: Inspección de URL → «Solicitar indexación» solo para la página de inicio y 1–2 fichas de las de la muestra, no en masa.

### 7.5 Fechas de revisión y métricas a comparar

Fecha base = día del despliegue (D). Si se despliega el 2026-10-05: **+7 = 2026-10-12** y **+28 = 2026-11-02**.

| Métrica (fuente) | Línea base | +7 días | +28 días |
|---|---|---|---|
| Fichas de comerciantes no válidas / «Falta size» (GSC) | 101 / 101 | validación en curso; nuevos rastreos sin el error | < 10 |
| Fichas de comerciantes válidas (GSC) | 51 | ↑ | ↑ |
| Recursos sin cargar en la prueba en tiempo real de una ficha (GSC) | 49/61 (45 por robots) | 0 por robots.txt | — |
| «Bloqueada por robots.txt» (GSC › Páginas) | 13 | sin URL `/_next/` nuevas | ≤ 13 |
| Clics de fichas de comerciantes, 28 d (GSC › Aparición) | 68 · 390 impr. | — | comparar |
| CWV móvil, LCP «necesita mejora» (GSC) | 81 URL | comparar (P0-3 en producción desde 2026-10-05) | comparar |
| `x-vercel-cache` de la ficha (curl) | MISS / `no-store` | MISS → HIT (verificado 2026-10-05) | — |
| `og:image` de inicio y `/tienda` (curl) | 404 | 200 | 200 |
| Cuota de impresiones con URL `/product/` (GSC › Páginas) | 40 % | — | comparar (sin cambio esperado por este lote) |
| Cuota de impresiones que terminan en 404 (barrido) | 22 % | — | comparar (P0-4 no aprobado) |

### 7.6 Resultado tras el despliegue (2026-10-05)

Push de `62a70b22..5270cd09` a `main`. CI «Quality checks» en verde (tienda y administración) y ambos despliegues de producción **Ready**. `seo/p0-3-en-espera` sigue solo en local.

**Producción (solo lectura):**

- `robots.txt`: la única diferencia con el del audit son las dos líneas nuevas, `Allow: /_next/static/` y `Allow: /_next/image`.
- JSON-LD de los 5 productos de muestra: igual que la tabla de §7, con 0 variantes incompletas.
- La primera `og:image` de `/` y de `/tienda` es `/images/og-p-de-papel-1200x630.jpg`: 200, `image/jpeg`, 38.544 B.
- Caché de 3 fichas: sigue en `private, no-store` y MISS, como se esperaba con P0-3 detenido.
- Search Console, prueba en tiempo real de `/producto/tapete-de-corte-mini`: **4 de 88 recursos sin cargar (antes 49 de 61)**. Tres son peticiones de datos bloqueadas a propósito (`/api/catalog?…`, `/tienda?…`, `/categoria/troqueles?…`); la cuarta es un error de redirección del script de Clerk en `clerk.papeleriapdepapel.com`. El total subió a 88 porque Google ya puede bajar los JS, que piden más recursos.

**P0-3 en una vista previa de Vercel** (despliegue con la CLI, sin metadatos de git; responde con `x-robots-tag: noindex` y está protegida por Vercel Authentication). Tres peticiones seguidas a cada URL:

| URL | 1ª | 2ª y 3ª |
|---|---|---|
| alias `carpeta-plastica-oficio-lila` | 308 MISS, `Location` correcta | **308 HIT con `Location`** |
| UUID `e9d20ea4-…` | 308 MISS → `lapicero-halloween-2` | **308 HIT con `Location`** |
| `no-existe-jamas-e2e` | 404 MISS | 404 HIT |
| `block-iris-x35-hojas` | 200 MISS | 200 HIT |

**Diferencia con `next start`:** la caché ISR de Vercel guarda la respuesta completa, con estado y cabeceras, y sirve al navegador con `cache-control: public, max-age=0, must-revalidate`. La caché de archivos de `next start` (Next 14.2 autoalojado) pierde `Location` en la 308 cacheada. Producción corre en Vercel, así que la opción 1 de §7.2 resuelve P0-3 sin cambiar la arquitectura. No se probó el caso «Próximamente» con cookie porque hoy no hay productos en `/proximamente`; lo cubre el test que renderiza el HTML del servidor con la cookie puesta.

**Incidente durante la prueba:** el primer intento de vista previa usó los metadatos de git, cuyos commits estaban firmados con `christian.gabriel.torres@depalmastudios.com`, un correo que ya no existe. Vercel lo bloqueó y envió un aviso de «no es miembro del equipo». Desde entonces el repositorio firma con `121559192+chrisdev-ui@users.noreply.github.com` (solo `git config` del repo; el global queda igual y no se reescribió historia). Ese despliegue bloqueado quedó en estado `UNKNOWN` y no se borró.

### 7.7 P0-3 en producción (2026-10-05)

- **Commit:** `10843e01`, un solo commit (`generateStaticParams()` → `[]` + `useEarlyAccess`), fusionado como fast-forward y sin force-push. Puertas: tienda `type-check`, `lint`, 132 archivos / 630 tests y `build` (la ficha sale como ● ISR). CI «Quality checks» en verde. En producción la tienda se desplegó y la administración se saltó por el Ignored Build Step.
- **Producción, solo lectura:**
  - `block-iris-x35-hojas`, `lapices-mafalda-x6` y `cuaderno-5-materias-peq-norma`: 200, MISS → HIT, `cache-control: public, max-age=0, must-revalidate`, canónica propia, JSON-LD válido (`lapices-mafalda-x6` es ProductGroup con `variesBy` pattern).
  - Alias `carpeta-plastica-oficio-lila` y `planillero-con-tapa-fashion-pastel`: 308 HIT con `Location`.
  - `/product/<uuid>`: 2 saltos y luego 200.
  - `mini-kit-lector` (archivado) y un slug inexistente: 404 MISS → HIT.
  - Inicio, `robots.txt` y `sitemap.xml` (890 URL): 200.
  - `/tienda` y las categorías siguen en `no-store`: leen `searchParams` (P2-8).
- **`public-health.yml`:** desde 2026-09-10 ya no corre tras cada despliegue; corre los lunes a las 14:00 UTC y a mano. Corrida manual 37272537823 sobre `10843e01`: 50 pasaron, 33 se saltaron, **1 inestable**: `tests/e2e/product-sticky-bar.spec.ts:126` («sigue apareciendo cuando el botón queda por encima»). No falló en las 5 corridas anteriores ni en 15 repeticiones locales contra producción. Hay que vigilarlo en la corrida semanal.
- **Vista previa de administración:** cada push de rama marca «Vercel – pdepapel-admin: failure». El build falla en `lib/env.mjs` («Invalid environment variables») porque al ámbito Preview le faltan variables obligatorias. Es previo a este trabajo y no afecta a producción.
- **Revalidación, pendiente:** `POST /api/revalidate` sin el secreto recibe el 401 de la propia ruta y ningún `x-vercel-mitigated`. El proyecto de la tienda no tiene configuración de firewall propia. Todavía no se ha visto un 200 real desde el panel (los registros solo guardan unos 60 minutos y nadie editó el catálogo). Al primer cambio real: buscar `POST /api/revalidate 200` en los registros de la tienda en menos de una hora, y comprobar que la ficha responde MISS una vez y HIT después.
- **Huecos de datos desactualizados (abiertos):**
  - Cuando un producto pasa su `availableAt` no se dispara ninguna invalidación; vale la expiración de 300 s, y una página poco visitada puede servirse vieja una vez mientras se regenera.
  - Opciones aplazadas: refrescar el stock en el navegador con `/api/producto/[slug]`, o bajar `revalidate` (AGENTS.md pide medir antes).
  - El checkout revalida el stock contra la base de datos, así que una página vieja no puede vender de más.
- **Search Console (2026-10-05, con permiso de Christian):**
  - «Falta el campo "size"»: validación iniciada.
  - `robots.txt`: se pidió un nuevo rastreo.
  - «Bloqueada por robots.txt»: pendiente hasta que Search Console muestre el archivo de 1.279 bytes.
