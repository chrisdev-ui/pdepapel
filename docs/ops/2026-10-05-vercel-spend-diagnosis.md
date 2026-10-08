# Diagnóstico del gasto en Vercel (2026-10-05)

Equipo «Christian Torres' projects», plan **Pro**, ciclo **10 de septiembre – 10 de octubre de 2026**. Solo lectura: no se cambió ningún ajuste durante el diagnóstico. El aviso de Vercel por el presupuesto bajo demanda llevó a revisar el consumo por SKU y por proyecto en Usage y Upcoming Invoice.

> Cifras (factura, consumo por SKU y proyecto, gasto diario, conteos de builds y peticiones, ahorros estimados) guardadas en local en `output/sensitive-docs/docs/ops/2026-10-05-vercel-spend-diagnosis.md`.

## (a) Dónde se fue el gasto

Los SKU que más pesaron fueron, en orden: minutos de CPU de build, eventos de Observability Plus, memoria y CPU activa de funciones, y el complemento fijo Speed Insights Plus. El gasto diario subió los días con más pushes y bajó los días sin builds.

## (b) Las tres causas

1. **Builds.** Muchos builds de producción al día en los dos proyectos, en **máquinas elásticas** (`buildMachineSelection: elastic`) con concurrencia bajo demanda. Vercel cobra por **minuto de CPU** = minutos × vCPU asignadas. El costo viene del **volumen de pushes × tamaño de máquina**; los builds innecesarios pesan poco (ver c).
2. **Speed Insights Plus.** Complemento fijo por proyecto más eventos. No entra en el presupuesto bajo demanda, pero sí en la factura.
3. **Rastreadores contra páginas sin caché**, en funciones, ISR y observabilidad.
   - **meta-externalagent** (el rastreador de IA de Meta) hacía más de la mitad de las peticiones de la tienda y casi siempre sin caché; PetalBot también, en menor medida. Googlebot, facebookexternalhit y Bingbot pesan poco.
   - `/producto/[slug]` se sirve desde caché solo una parte de las veces, y cada regeneración es lenta y llama a la API del admin.
   - `/tienda` y `/categoria/[slug]` son dinámicas (sin caché; P2-8 pendiente).

## (c) Builds desperdiciados (cambios que no afectan la aplicación)

El `ignoreCommand` de entonces compilaba si cambiaba cualquier archivo de la carpeta del proyecto. Builds de producción del ciclo que solo tocaron pruebas, `ops/`, `scripts/` o `.md`:

- **Admin:** `29375fcd` y `cc9abb25` (pruebas), `3f85b6dd` (`ops/prod-writes.log`), `bad2b0ad` (log + scripts), `cb9e0917` (log), `0d53d824` (log + script), `ec716364` (pruebas), `5270cd09` (prueba), `4d18e9ee` y `52a83b8e` (`scripts/backup`), `3421ecfb` (log).
- **Tienda:** `b45bbe22`, `509c058f`, `7d3f301a`, `a46de60e`, `9a521c1f` (E2E), `affbad48`, `b51aca75` y `3b1e0db1` (`AGENTS.md`).

`content/manual/` no cuenta como desperdicio: el admin la sirve. Ningún flujo de GitHub Actions ni cron hace commits. Previews: muy pocas en el ciclo (rama `seo/p0-3-en-espera` y CLI).

## (d) Propuesta, ordenada por ahorro / esfuerzo (nada aplicado en el diagnóstico)

| # | Cambio | Esfuerzo | Riesgo |
|---|---|---|---|
| 1 | Bloquear `meta-externalagent` y `PetalBot` en `robots.txt` | 1 línea | Meta dice que el agente respeta robots.txt. No afecta `facebookexternalhit` (vistas previas) ni el feed del catálogo. Revisar Commerce Manager tras el cambio |
| 2 | Apagar **Speed Insights Plus** (Settings › Billing) | 1 clic (+ quitar `<SpeedInsights/>` si se apaga del todo) | Se pierden métricas de rendimiento por ruta; Web Analytics sigue |
| 3 | Máquina de build **fija Standard (4 vCPU)** en vez de Elastic, en los dos proyectos | 2 ajustes | Builds algo más lentos; medir 3–4 builds. Probar Basic (2 vCPU) si sobra margen |
| 4 | Agrupar pushes (la regla de memoria «squash antes de push») | Proceso | Despliegues menos frecuentes |
| 5 | Apagar **Observability Plus** si no se usan sus consultas | 1 clic | Se pierde la consulta avanzada de logs (la API ya fallaba por tiempo) |
| 6 | `ignoreCommand` que ignore pruebas, `ops/`, `scripts/`, `docs/` y `.md` | 2 archivos | Probado con el historial: salta exactamente los builds de (c) y no salta ninguno real |
| 7 | Retención de despliegues de producción de 365 a 90 días (se mantienen los 10 últimos) | 1 ajuste | No se puede volver a un despliegue de hace más de 90 días |
| 8 | `revalidate` de `/producto/[slug]` de 300 a 3600 s (la revalidación por etiqueta ya refresca al editar el catálogo) | 1 línea + prueba del flujo de revalidación | Precios u ofertas que vencen por tiempo tardarían hasta 1 h |

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
- La proyección del ciclo pasaba el presupuesto. Recomendación: subirlo con alertas en 50/75/100 % (automáticas, por correo) y la pausa apagada. Opcional: un webhook a correo o Slack.
- Después de aplicar 1–3 se espera poco gasto bajo demanda por ciclo.

Capturas: Usage por producto y por proyecto, Billing (presupuesto y complementos), Upcoming Invoice, Observability (funciones y CDN por bot) del 2026-10-05, en las capturas de la sesión.

## Decisiones aplicadas (2026-10-05)

Christian aprobó solo los puntos 1, 2, 3, 5 y 6 y el nuevo presupuesto. Lo demás queda igual.

**En el panel (antes del push):**

| Ajuste | Antes | Después |
|---|---|---|
| Máquina de build, admin y tienda | Elastic, concurrencia elástica («Run all builds immediately») | **Standard fija (4 vCPU)**, concurrencia elástica apagada (`buildMachineSelection: fixed`) |
| Presupuesto bajo demanda | El anterior | **Más alto**, alertas 50/75/100 % por correo, **pausa apagada**, sin webhook ni SMS |
| Speed Insights Plus (tienda) | Encendido | **Apagado** |
| Observability Plus | Encendido | **Apagado** |

**En el código (un solo push):**

- `robots.txt` bloquea `meta-externalagent` y `PetalBot`. Siguen permitidos `facebookexternalhit`, `meta-externalfetcher`, Googlebot, Google-InspectionTool, Storebot-Google, AdsBot-Google y Bingbot. El feed de Meta vive en el host del admin (`/api/[storeId]/meta-catalog/feed`), que no tiene este robots.txt, y `meta-externalagent` no aparece entre los bots del admin. Por eso no hace falta un `Allow`. Prueba: `tests/unit/app/robots.test.ts`.
- `ops/vercel-ignore-build.sh` reemplaza el `ignoreCommand` de los dos `vercel.json`. No compila si en la carpeta del proyecto solo cambió `docs/`, `ops/`, `scripts/`, `tests/`, `e2e/`, `.github/`, `*.md` o `*.log`. Ante cualquier otra cosa compila. Se probó con los últimos despliegues de cada proyecto:
  - Solo cambian los builds desperdiciados de (c): `ec716364`, `5270cd09`, `4d18e9ee`, `3421ecfb`, `52a83b8e` en el admin; `7d3f301a`, `a46de60e`, `9a521c1f`, `3b1e0db1` en la tienda.
  - Ninguno pasa de «no compilar» a «compilar».
- Se quitó `@vercel/speed-insights` (`<SpeedInsights />` del layout, dependencia y lockfile). Web Analytics sigue.
- Regla «Deployment budget» en los tres `AGENTS.md`.

**Lo que NO se cambió, a propósito:**

- **Retención de despliegues:** sigue en 365 días para producción y 180 para previews. Ahorraría poco y quitaría la opción de volver a despliegues viejos. No se aprobó.
- **`revalidate` de `/producto/[slug]`:** sigue en 300 s. Primero hay que medir cuánto baja el tráfico sin caché ahora que los dos rastreadores están bloqueados. Solo después se decide si vale la pena que un precio u oferta vencida tarde hasta 1 h en verse.
- **Máquina Basic (2 vCPU):** no se probó. Primero se miden 3–4 builds en Standard.
- **Pausa de producción:** nunca. Pone en 503 todos los proyectos.

**Qué revisar:** el 8 de octubre, en Usage, comparar los minutos de CPU de build por día con el 5 de octubre. En Commerce Manager, confirmar que el catálogo sigue leyendo el feed.

**Verificado (2026-10-05):** el push `9c4d4bca` compiló una vez cada proyecto en máquina de 4 núcleos (admin 2 min 23 s, tienda 1 min 11 s, ambos READY) y el registro muestra el paso `ops/vercel-ignore-build.sh`. El push siguiente, que solo tocó este documento y los `AGENTS.md`, no compiló ninguno de los dos.
