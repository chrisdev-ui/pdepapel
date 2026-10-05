# Diagnóstico del gasto en Vercel (2026-10-05)

Equipo «Christian Torres' projects», plan **Pro**, ciclo **10 de septiembre – 10 de octubre de 2026**. Solo lectura: no se cambió ningún ajuste. El aviso de Vercel (75 % de un presupuesto de $10) corresponde a **$7,51 de cobro bajo demanda**: la infraestructura consumió **$27,51**, de los que $20 los cubre el crédito incluido. La factura prevista es **$37,52**: Pro $20 + Speed Insights Plus $10 + bajo demanda $7,52.

## (a) Consumo por SKU y proyecto (ciclo actual)

| SKU | Uso | Costo | Admin | Tienda |
|---|---|---|---|---|
| Build CPU Minutes | 64 h de CPU | **$13,12** | $10,40 (51 h) | $2,72 (~13 h) |
| Observability Events (Observability Plus) | 4,13 M | **$3,48** | $1,22 | $2,26 |
| Fluid Provisioned Memory | 282,2 GB·h | **$3,00** | $1,64 | $1,36 |
| Fluid Active CPU | 18 h | $2,42 | $0,98 | $1,44 |
| Function Storage | 13 GB·mes | $1,34 | $1,21 | $0,13 |
| Fast Origin Transfer | 16 GB | $0,96 | $0,24 | $0,72 |
| Function Invocations | 1,36 M | $0,81 | $0,37 | $0,44 |
| Speed Insights Plus Events | 5,15 K | $0,65 | — | $0,65 |
| Deployment Storage | 5 GB·mes | $0,53 | $0,25 | $0,28 |
| ISR Writes | 130 K | $0,52 | — | $0,52 |
| Web Analytics Events | 9,04 K | $0,27 | — | $0,27 |
| ISR Reads | 394 K | $0,16 | $0,00 | $0,16 |
| Fast Data Transfer / CDN Requests | 16 GB / 974 K | $0,24 | $0,04 | $0,20 |
| Image Optimization | 129 transformaciones | $0,01 | — | $0,01 |
| **Infraestructura** | | **$27,51** | **$16,34** | **$11,17** |
| Speed Insights Plus (complemento fijo, fuera del presupuesto bajo demanda) | 1 proyecto | **$10,00** | | |

Fuente: Usage (por producto y por proyecto) y Upcoming Invoice del panel.

**Días:** el gasto diario fue mayor del 10 al 18 de septiembre (hasta ~$2,3 al día) y el 5 de octubre (~$1,7). Coincide con los días de más pushes: el 14 de septiembre el admin sumó 66 min de build; el 5 de octubre hubo 11 builds del admin y 17 de la tienda. Del 2 al 4 de octubre no hubo builds y el gasto bajó a $0,4–1,0 al día.

## (b) Las tres causas, por dólares

1. **Builds: $13,12.** Hubo 179 builds de producción del admin (~7 al día, 2,8 min de media) y 93 de la tienda (1,1 min) en 26 días. Las dos usan **máquinas elásticas** (`buildMachineSelection: elastic`) con concurrencia bajo demanda. Vercel cobra $0,0035 por **minuto de CPU** = minutos × vCPU asignadas (4 a 30). El admin facturó ~6 vCPU de media (51 h de CPU sobre ~8,5 h de reloj). El desperdicio por builds innecesarios es pequeño (~6 %, ver c); el costo viene del **volumen de pushes × tamaño de máquina**.
2. **Speed Insights Plus: $10,65** ($10 fijos por 1 proyecto + $0,65 de eventos). Es un complemento fijo que no entra en el presupuesto bajo demanda, pero sí en la factura.
3. **Rastreadores contra páginas sin caché: ~$11** en funciones, ISR y observabilidad.
   - En los últimos 7 días la tienda recibió 242 K peticiones; **meta-externalagent** (el rastreador de IA de Meta) hizo **132 K (55 %)**, con solo 27,8 % servido desde caché. Le siguen Googlebot 4,8 K, PetalBot 3,6 K (1,9 % en caché), facebookexternalhit 3 K (93 % en caché) y Bingbot 2,1 K.
   - `/producto/[slug]` se sirve desde caché solo el ~34 % de las veces, y cada regeneración cuesta P75 4,6 s y llama a la API del admin. El admin, en 12 h, registró 7 K llamadas a `/api/[storeId]/products` (P75 2,5 s) y 4,6 K a `/products/[productId]`.
   - `/tienda` y `/categoria/[slug]` son dinámicas (0 % de caché; P2-8 pendiente).
   - Observability Plus cobra $1,20 por millón de eventos: $3,48.

## (c) Builds desperdiciados (cambios que no afectan la aplicación)

El `ignoreCommand` actual compila si cambió cualquier archivo de la carpeta del proyecto. Builds de producción de este ciclo que solo tocaron pruebas, `ops/`, `scripts/` o `.md`:

- **Admin (11, ~30 min de reloj):** `29375fcd` y `cc9abb25` (pruebas), `3f85b6dd` (`ops/prod-writes.log`), `bad2b0ad` (log + scripts), `cb9e0917` (log), `0d53d824` (log + script), `ec716364` (pruebas), `5270cd09` (prueba), `4d18e9ee` y `52a83b8e` (`scripts/backup`), `3421ecfb` (log).
- **Tienda (8, ~7 min):** `b45bbe22`, `509c058f`, `7d3f301a`, `a46de60e`, `9a521c1f` (E2E), `affbad48`, `b51aca75` y `3b1e0db1` (`AGENTS.md`).

`content/manual/` no cuenta como desperdicio: el admin la sirve. Ningún flujo de GitHub Actions ni cron hace commits: los 386 commits del ciclo son manuales. Previews: solo 4 en el ciclo (rama `seo/p0-3-en-espera` y CLI).

## (d) Propuesta, ordenada por ahorro / esfuerzo (nada aplicado)

| # | Cambio | Ahorro estimado por ciclo | Esfuerzo | Riesgo |
|---|---|---|---|---|
| 1 | Bloquear `meta-externalagent` y `PetalBot` en `robots.txt` | ~$3–5 (funciones, ISR, observabilidad, llamadas al admin) | 1 línea | Meta dice que el agente respeta robots.txt. No afecta `facebookexternalhit` (vistas previas) ni el feed del catálogo. Revisar Commerce Manager tras el cambio |
| 2 | Apagar **Speed Insights Plus** (Settings › Billing) | **$10,65** | 1 clic (+ quitar `<SpeedInsights/>` si se apaga del todo) | Se pierden métricas de rendimiento por ruta; Web Analytics sigue |
| 3 | Máquina de build **fija Standard (4 vCPU)** en vez de Elastic, en los dos proyectos | ~$4–5 (CPU = minutos × 4) | 2 ajustes | Builds algo más lentos; medir 3–4 builds. Probar Basic (2 vCPU) si sobra margen |
| 4 | Agrupar pushes (≤ 3 al día; la regla de memoria «squash antes de push») | ~$5–6 si el admin baja de ~7 a ~3 builds al día | Proceso | Despliegues menos frecuentes |
| 5 | Apagar **Observability Plus** si no se usan sus consultas | $3,48 | 1 clic | Se pierde la consulta avanzada de logs (la API ya fallaba por tiempo) |
| 6 | `ignoreCommand` que ignore pruebas, `ops/`, `scripts/`, `docs/` y `.md` | ~$0,75 | 2 archivos | Probado con el historial: salta exactamente los 19 builds de (c) y no salta ninguno real |
| 7 | Retención de despliegues de producción de 365 a 90 días (se mantienen los 10 últimos) | ~$0,9 (Function Storage) | 1 ajuste | No se puede volver a un despliegue de hace más de 90 días |
| 8 | `revalidate` de `/producto/[slug]` de 300 a 3600 s (la revalidación por etiqueta ya refresca al editar el catálogo) | ~$0,5–1 | 1 línea + prueba del flujo de revalidación | Precios u ofertas que vencen por tiempo tardarían hasta 1 h |

**Diff 1** (`pdepapel-store/app/robots.ts`):

```diff
-const BLOCKED_CRAWLERS = ["AhrefsBot", "Amazonbot"];
+const BLOCKED_CRAWLERS = ["AhrefsBot", "Amazonbot", "meta-externalagent", "PetalBot"];
```

**Diff 6** (`pdepapel-admin/vercel.json` y `pdepapel-store/vercel.json`, mismo cambio al final del `ignoreCommand`):

```diff
-… git diff --quiet "$BASE" HEAD -- .
+… git diff --quiet "$BASE" HEAD -- . ':(exclude)tests' ':(exclude)e2e' ':(exclude)ops' ':(exclude)scripts' ':(exclude)docs' ':(exclude)*.md'
```

**Ajustes 2, 3, 5 y 7** (panel):
- 2 y 5: Team Settings › Billing › Add-ons › Speed Insights Plus / Observability Plus.
- 3: Project › Settings › Build and Deployment › Build Machine › Standard (fixed).
- 7: Project › Settings › Deployment Retention › Production 90 días.

## (e) Presupuesto y alertas (sin pausar producción)

- **Nunca** activar «Pause production deployments»: pone en 503 producción de todos los proyectos.
- Proyección del ciclo actual: ~$1,06 al día → ~$12 bajo demanda al 10 de octubre, por encima del presupuesto de $10. Recomendación: **subir el presupuesto a $20 para este ciclo**, con alertas en 50/75/100 % (automáticas, por correo) y la pausa apagada. Opcional: un webhook a correo o Slack.
- Después de aplicar 1–3, se espera $0–3 bajo demanda por ciclo: dejar el presupuesto en **$15** con las mismas alertas.

Capturas: Usage por producto y por proyecto, Billing (presupuesto y complementos), Upcoming Invoice, Observability (funciones y CDN por bot) del 2026-10-05, en las capturas de la sesión.

## Decisiones aplicadas (2026-10-05)

Christian aprobó solo los puntos 1, 2, 3, 5 y 6 y el presupuesto de $15. Lo demás queda igual.

**En el panel (antes del push):**

| Ajuste | Antes | Después |
|---|---|---|
| Máquina de build, admin y tienda | Elastic, concurrencia elástica («Run all builds immediately») | **Standard fija (4 vCPU)**, concurrencia elástica apagada (`buildMachineSelection: fixed`) |
| Presupuesto bajo demanda | $10 | **$15**, alertas 50/75/100 % por correo, **pausa apagada**, sin webhook ni SMS |
| Speed Insights Plus (tienda) | Encendido ($10 al mes + eventos) | **Apagado** |
| Observability Plus | Encendido ($1,20 por millón de eventos) | **Apagado** |

**En el código (un solo push):**

- `robots.txt` bloquea `meta-externalagent` y `PetalBot`. Siguen permitidos `facebookexternalhit`, `meta-externalfetcher`, Googlebot, Google-InspectionTool, Storebot-Google, AdsBot-Google y Bingbot. El feed de Meta vive en el host del admin (`/api/[storeId]/meta-catalog/feed`), que no tiene este robots.txt, y `meta-externalagent` no aparece entre los bots del admin. Por eso no hace falta un `Allow`. Prueba: `tests/unit/app/robots.test.ts`.
- `ops/vercel-ignore-build.sh` reemplaza el `ignoreCommand` de los dos `vercel.json`. No compila si en la carpeta del proyecto solo cambió `docs/`, `ops/`, `scripts/`, `tests/`, `e2e/`, `.github/`, `*.md` o `*.log`. Ante cualquier otra cosa compila. Se probó con los últimos 40 despliegues de cada proyecto:
  - Admin: 27 → 22 builds.
  - Tienda: 19 → 15 builds.
  - Solo cambian los builds desperdiciados de (c): `ec716364`, `5270cd09`, `4d18e9ee`, `3421ecfb`, `52a83b8e` en el admin; `7d3f301a`, `a46de60e`, `9a521c1f`, `3b1e0db1` en la tienda.
  - Ninguno pasa de «no compilar» a «compilar».
- Se quitó `@vercel/speed-insights` (`<SpeedInsights />` del layout, dependencia y lockfile). Web Analytics sigue.
- Regla «Deployment budget» en los tres `AGENTS.md`.

**Lo que NO se cambió, a propósito:**

- **Retención de despliegues:** sigue en 365 días para producción y 180 para previews. Ahorra ~$0,9 por ciclo y quitaría la opción de volver a despliegues viejos. No se aprobó.
- **`revalidate` de `/producto/[slug]`:** sigue en 300 s. Primero hay que medir cuánto baja el tráfico sin caché ahora que los dos rastreadores están bloqueados. Solo después se decide si vale la pena que un precio u oferta vencida tarde hasta 1 h en verse.
- **Máquina Basic (2 vCPU):** no se probó. Primero se miden 3–4 builds en Standard.
- **Pausa de producción:** nunca. Pone en 503 todos los proyectos.

**Qué revisar:** el 8 de octubre, en Usage, comparar los minutos de CPU de build por día con el 5 de octubre. En Commerce Manager, confirmar que el catálogo sigue leyendo el feed.
