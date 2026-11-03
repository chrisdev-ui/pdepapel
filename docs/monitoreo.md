# Monitoreo de la tienda

Monitoreo local y programado de `papeleriapdepapel.com`. Corre en el Mac de Christian y es de **solo lectura**: no guarda nada en los paneles, no envía pedidos ni formularios y no toca datos de producción. Los informes salen en español.

| Capa | Qué hace | Cuándo | Cómo |
|---|---|---|---|
| **2 · diaria** | La tienda responde y funciona: páginas, consola, JSON-LD, carrito, paso 1 del checkout, consentimiento, LCP/CLS de laboratorio | Todos los días, 07:17 | `pdepapel-store/scripts/monitoring/daily-check.mjs` (Playwright, sin Claude) |
| **1 · semanal** | Revisión completa de GA4, Clarity, Search Console, Merchant Center, TikTok, Vercel, PageSpeed y el panel | Martes, 07:17 | `run-weekly.sh` → `claude -p --chrome "/monitoreo-semanal"` → `weekly-report.mjs` |

El martes, la capa 1 corre primero la capa 2 y espera a que termine. Así Playwright nunca corre junto a otra carga pesada, y el informe semanal incluye el chequeo de ese día.

## Instalar, desinstalar y probar

Desde el **checkout principal**. El instalador se niega a correr desde un worktree, porque launchd no debe depender de una carpeta temporal.

```bash
pdepapel-store/scripts/monitoring/install.sh                       # diaria 07:17, semanal martes 07:17
pdepapel-store/scripts/monitoring/install.sh --daily 06:45 --weekly 1@08:00   # cambiar horario (0/7=domingo, 1=lunes, 2=martes…)
pdepapel-store/scripts/monitoring/uninstall.sh                     # detiene ambos; los informes se quedan

launchctl print gui/$(id -u)/com.pdepapel.monitoreo-diario         # estado
launchctl kickstart -k gui/$(id -u)/com.pdepapel.monitoreo-diario  # correr ya (igual para -semanal)
```

El horario es la hora del Mac (America/Bogota). Si el Mac está dormido a la hora, launchd corre el trabajo una vez al despertar. Si está apagado, esa corrida se pierde.

## Correr a mano

```bash
pdepapel-store/scripts/monitoring/run-daily.sh [--no-notify]       # capa 2
pdepapel-store/scripts/monitoring/run-weekly.sh [--opus] [YYYY-MM-DD]   # capa 1 completa sin intervención (Chrome abierto); Sonnet salvo --opus
```

También se puede abrir Claude Code en la raíz del repo y escribir `/monitoreo-semanal`. Es la misma revisión, en una sesión que se ve.

## Dónde queda todo

Siempre en `output/monitoreo/` del checkout principal (gitignored), aunque el script corra desde un worktree:

| Ruta | Contenido |
|---|---|
| `YYYY-MM-DD.md` | Informe semanal: resumen en 5 líneas, tabla semana contra semana con tendencia de 4 semanas, hallazgos ordenados por impacto en ventas, prompts en inglés para sesiones de implementación y mensajes para Paula |
| `history.json` | Métricas de cada semana con claves estables (`lib/metrics-schema.mjs`) |
| `raw/YYYY-MM-DD/` | Lo que entregó cada fuente (`ga4.json`, `clarity.json`, …, `findings.json`); de aquí sale el informe |
| `diario/YYYY-MM-DD.json` | Resultado del chequeo diario |
| `targets.json` | Producto y categoría top que la revisión semanal elige en GA4 (los usa la capa 2) |
| `alertas-estado.json` | Antiduplicado de avisos: máximo uno por problema por día |
| `eventos.json` | Opcional, local: eventos que distorsionan la comparación (mismo formato que `scripts/monitoring/known-events.json`) |
| `logs/` | `diario.*.log`, `semanal.*.log` (launchd), `semanal-<fecha>.claude.json` (resultado y costo de la corrida de Claude) |

## Cómo funciona la capa 1 sin intervención

- `claude -p --chrome` maneja Chrome sin sesión interactiva (probado el 2026-11-01 con Claude Code 2.1.316). Necesita Chrome abierto con la extensión de Claude conectada y las sesiones de los paneles iniciadas. El wrapper abre Chrome en segundo plano si está cerrado.
- **Permisos:** `--permission-mode dontAsk` con una lista corta de herramientas:
  - Chrome: leer, navegar, clic y pestañas propias. Sin `javascript_tool` ni formularios.
  - Vercel MCP: solo lectura.
  - `Read` y `Edit` limitados a `output/monitoreo/**`. Las lecturas dentro del checkout siguen permitidas de forma implícita, así que los `.env*` se niegan explícitamente (probado: `.env.example` queda denegado).
  - Tres comandos `node` exactos.
  - Todo lo demás se niega solo.
- **Escritura de datos:** Claude escribe un borrador `raw/<fecha>/<fuente>.draft.json` y corre `save-raw.mjs --date … --source …`. Ese script valida la forma, descarta claves desconocidas y oculta correos y teléfonos. Ningún JSON viaja dentro de un comando de shell: el comparador de prefijos rechaza comandos con `$` o comillas.
- **Escrituras bajo `~/.claude`:** Claude Code las niega en modo headless (carpeta sensible). Por eso la salida no puede vivir ahí.
- **Números:** `weekly-report.mjs` arma la tabla, los porcentajes, las tendencias y los avisos. Si una fuente falla, sale como «falló: motivo» y sin números. No se estima nada.
- **Alarma de cambios:** si `git status` cambia durante la revisión, el wrapper avisa. Esto detecta, no previene. La prevención es la lista de permisos.
- **Tiempo:** `MONITOREO_TIMEOUT_MIN` (90 por defecto) corta la corrida. El compilador corre igual con lo que se alcanzó a recolectar.

## Configuración opcional (`pdepapel-store/scripts/monitoring/.env`, gitignored)

| Variable | Para qué | Estado |
|---|---|---|
| `PSI_API_KEY` | PageSpeed Insights por API (capa 2 y semanal). Sin clave, Google responde 429 desde la primera llamada y la revisión semanal usa pagespeed.web.dev en Chrome. Nunca se imprime | Christian la pega a mano |
| `MONITOREO_PUSH_TOKEN` | Aviso Web Push por el canal de la dueña. Debe ser idéntico a `MONITOREO_PUSH_SECRET` del panel; ver «Web Push» | Christian lo pega a mano |
| `MONITOREO_PUSH_URL` | Solo para apuntar a otro panel; por defecto `https://admin.papeleriapdepapel.com/api/<storeId>/monitoring/alert` | Opcional |
| `MONITOREO_MODEL` | Modelo de la revisión semanal: `sonnet` por defecto; `run-weekly.sh --opus` para una corrida más profunda a mano | Opcional |
| `MONITOREO_BASE_URL` | Apuntar la capa 2 a otra URL (por ejemplo un preview) | Opcional |
| `MONITOREO_NO_MAC_NOTIFY=1` | Silenciar avisos de macOS | Opcional |

### Web Push

`POST /api/<storeId>/monitoring/alert` en el panel (decidido el 2026-11-02, opción a) manda el aviso por el canal push de la dueña (`sendWebPushToStore`).

- **Autorización:** `Authorization: Bearer <MONITOREO_PUSH_SECRET>`. La variable va en Vercel, proyecto del panel, solo Production, con 32 caracteres o más. Sin ella la ruta responde 404.
- **Lo que manda:** solo título (≤ 80) y texto (≤ 240). El enlace del aviso lo fija el servidor al panel.
- **En el Mac:** el mismo valor va en `MONITOREO_PUSH_TOKEN` de `pdepapel-store/scripts/monitoring/.env`. Sin él, solo hay avisos de macOS.

### Cuenta de solo lectura para el monitoreo

Se propone una cuenta propia, sin la sesión de la dueña, con `{ "role": "viewer", "allowedStoreIds": ["<storeId>"] }` (`pdepapel-admin/docs/acceso-solo-lectura.md`).

- **Lo que ve:** Inicio (resumen, pendientes, «Sistemas») y la lista de publicaciones de Mercado Libre con su estado.
- **Lo que no ve:** el `remote-status` de cada publicación, costos y márgenes, y las tarjetas de «clientas esperando» y alertas tempranas de redes.
- **Cómo lo trata la revisión:** cada 403 cuenta como un hueco parcial «cuenta de solo lectura», no como una falla.

## Clarity

Están permitidos los filtros de vista, los rangos de fecha y «Apply» en filtros de informes y grabaciones (Christian, 2026-11-02). Sigue prohibido guardar segmentos o filtros, cambiar la configuración y borrar cualquier cosa.

## Ventas por canal

Antes de la revisión de Claude, `run-weekly.sh` corre `pdepapel-admin/scripts/monitoring-sales-by-channel.ts` con el `.env` de solo lectura del panel. El script escribe `raw/<fecha>/ventas.json` directamente; los números no pasan por la revisión, y `save-raw` no deja que Claude los sobrescriba.

- **Qué cuenta como venta:** un pedido pagado en la semana, más los contra entrega enviados que todavía no se marcaron pagados.
- **Qué cuenta:** pedidos y total en pesos por canal.
- **Cómo se decide el canal:**
  1. El origen que eligió la dueña.
  2. Si no hay, lo que implica el sistema que creó el pedido: tienda en línea, WhatsApp, punto de venta o feria.
  3. Si tampoco, «Sin registrar».
- **Privacidad:** sin datos de clientas.

## Costo

La revisión semanal corre con Sonnet. Cada informe anota modelo, costo, minutos y turnos. La primera corrida, con Opus, costó US$10,95 en 18 min.

## Garantías de solo lectura de la capa 2

- **Escrituras bloqueadas:** cualquier petición que no sea GET/HEAD/OPTIONS se aborta. Las excepciones son `/api/consent` (solo pone la cookie de la decisión) y las Server Actions de la tienda, que hoy solo leen: `check-live-stock`, `get-filtered-products`. `tests/unit/monitoring` falla si aparece un archivo `"use server"` nuevo sin revisar.
- **Analítica bloqueada:** las peticiones de GA4, Clarity, TikTok y Vercel Analytics se registran y se abortan. El monitoreo no infla métricas.
- **Vercel Web Analytics:** carga sin consentimiento porque no usa cookies, así que no cuenta como falla de consentimiento.
- **Carrito y checkout:** el carrito vive en el navegador. El paso 1 del checkout solo se valida con el formulario vacío y nunca se envía.
- **Imágenes y LCP:** las fotos de Cloudinary se reemplazan por un PNG de 1×1, salvo en inicio y producto, donde se mide el LCP. El LCP es de laboratorio sin limitar red ni CPU: sirve para comparar día contra día, no como número absoluto.
- **Regresiones:** una regresión cuenta cuando el LCP o el CLS empeora frente a la mediana de los últimos 7 días (mínimo 3), por proporción y por valor absoluto, y además cruza el umbral «necesita mejora».

## Problemas conocidos

- **TikTok Events Manager, Merchant Center y Search Console:** si la extensión de Chrome no tiene permiso para el dominio, la fuente sale como fallida con el motivo. Hay que dar el permiso en la extensión y volver a correr.
- **Pantallas de inicio de sesión (2026-11-02):** si una fuente pide iniciar sesión, un código de verificación o un captcha, la revisión no toca nada ni reintenta: anota «<fuente>: sin sesión» y sigue. Los reintentos de la primera corrida dejaron TikTok bloqueado («Maximum number of attempts reached»). Inicia sesión a mano en ese perfil de Chrome y la semana siguiente vuelve a leerse.
- **Vercel `get_runtime_errors`:** falla con `since: 7d` en esta cuenta; se usa `3d`.
- **Clarity:** el filtro «Last 7 days» termina hoy, no ayer. La comparación semanal sale de `history.json`.
