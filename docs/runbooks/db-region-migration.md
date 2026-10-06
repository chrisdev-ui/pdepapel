# MySQL de us-west2 a us-east4 (Railway)

**Por qué:**
- Las funciones de Vercel de la tienda y del panel corren en **iad1** (Virginia), igual que el edge que atiende a Colombia y Upstash Redis (us-east-1).
- MySQL estaba en Railway **us-west2** (California). Cada consulta cruzaba el país, a unos 65–80 ms por ida y vuelta (estimado): una ficha sin caché pasaba ~1,3 s esperando a la base.
- Con MySQL en **us-east4** todo lo que está en la ruta de cada petición queda en la misma costa (auditoría del 2026-10-06, §11.10 de `docs/seo/2026-10-05-seo-maintenance.md`).

**Quién usa la base:**
- Solo **pdepapel-admin** (`DATABASE_URL`). La tienda no toca MySQL.
- Fuera de Vercel también la usan:
  - la copia diaria (`.github/workflows/db-backup.yml`, secretos `BACKUP_DB_*`);
  - el `.env` local de solo lectura (`pdepapel_ro`);
  - `.env.prod-write` (escrituras aprobadas con `npm run prod:write`).

## Estado preparado (2026-10-06)

| | Producción hoy | Nueva |
|---|---|---|
| Servicio Railway | «MySQL Database» | «MySQL US East» (`735dd22e-860e-4b48-8e56-c11bb1930eba`) |
| Región | us-west2 | **us-east4-eqdc4a** |
| Imagen | `mysql:8` (8.4.11) | `mysql:8.4` (8.4.11) |
| Volumen | `c1893ab4…` (us-west2) | `21e943a0…` (us-east4-eqdc4a), en `/var/lib/mysql` |
| Arranque | `--performance_schema=0 --max-connections=300` | además `--slow-query-log=1 --long-query-time=0.5 --log-output=TABLE --performance-schema=1` |
| Límites | máximo del plan | 2 vCPU / 2 GB |
| Proxy TCP | 3306 | 3306 (`RAILWAY_TCP_PROXY_DOMAIN` / `RAILWAY_TCP_PROXY_PORT`) |
| Usuarios | `root` (lo usa la app), `pdepapel_ro` (`SELECT, SHOW VIEW` en `railway.*`; también es el de las copias) | `root` (contraseña en `MYSQL_ROOT_PASSWORD`), `pdepapel_ro` con los mismos permisos (contraseña en `PDEPAPEL_RO_PASSWORD`) |

- **Memoria con `performance_schema` activo:** 237 MiB para el propio esquema y 518 MiB instrumentados en total. Con el tope de 2 GB quedan unos 1,4 GB en reposo.
- **Consultas lentas:** las de más de 0,5 s quedan en `mysql.slow_log`. Para leerlas, root o un `GRANT SELECT ON mysql.slow_log TO pdepapel_ro` que todavía no se ha aplicado.

**Restauración inicial** (copia cifrada del 2026-10-05 19:16 UTC, en streaming, nada en claro en disco):

```bash
railway run -s 735dd22e-860e-4b48-8e56-c11bb1930eba -- sh -c \
  'age -d -i ~/pdepapel-backups/keys/pdepapel-db-backups-age.key "$0" | gunzip | \
   MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -h "$RAILWAY_TCP_PROXY_DOMAIN" -P "$RAILWAY_TCP_PROXY_PORT" railway' \
  railway-2026-10-05T19-17-03Z.sql.gz.age
```

- Tardó 554 s desde la laptop, por internet.
- **Comprobación:**
  - 96 de 96 tablas. 78 con el mismo número de filas que producción.
  - Las 18 restantes difieren solo por filas creadas después de la copia: cada conteo en la nueva es igual al de producción con `createdAt <= 2026-10-05 19:16`.
  - `ShippingQuote` es una caché con `expiresAt` que se purga sola.
  - En las 10 tablas más grandes, la huella de claves primarias (`BIT_XOR(CRC32(pk))`) de las filas hasta la copia es igual en las dos bases.
  - `CHECKSUM TABLE` es igual donde la tabla no cambió (`ShippingTrackingEvent`).

## Cómo se ejecutan comandos sin mostrar secretos

- **`railway run -s <servicio> -- <comando>`:** corre en la laptop con las variables del servicio inyectadas. Usar `"$MYSQL_ROOT_PASSWORD"` y similares dentro de `sh -c '…'` o de un script, nunca en la línea de comandos expandida.
- **Sin carpeta vinculada:** `railway run -p 7b019502-da48-4234-98c4-b348862220b9 -e cd420bfa-a0ad-450c-aeee-9ca43e6c711e -s 735dd22e-860e-4b48-8e56-c11bb1930eba -- bash script.sh` (proyecto «PdePapel Database», entorno production, servicio «MySQL US East»).
- **Contraseñas nuevas:** `openssl rand -hex 24 | tr -d '\n' | railway variable set NOMBRE --stdin -s <servicio> --skip-deploys`.
- **`railway ssh`** (dentro del contenedor) une los argumentos y los ejecuta en un shell remoto; pasar el script codificado en base64 como una sola cadena. Desde el 2026-10-06 pide una llave SSH registrada en la cuenta (`railway ssh keys add`).
- **CLI 4.33.0:** `railway environment edit` responde «No changes to apply» con cualquier cambio y `railway scale` falla por un cambio de la API. Región, arranque y límites se cambian en el panel.

## Workflow de copia: `.github/workflows/db-region-sync.yml`

- **Disparo:** solo a mano (`workflow_dispatch`), con `mode` = `rehearsal` | `cutover` y la confirmación literal `SYNC-TO-US-EAST`. Concurrencia exclusiva (`db-region-sync`) y 30 min de tope.
- **Origen:** producción leída con `pdepapel_ro`, a través de los secretos `BACKUP_DB_*` que ya usa la copia diaria. No existe ningún secreto con escritura en producción.
- **Destino:** el secreto `NEW_DB_URL` (root en el proxy TCP de «MySQL US East»). Lo creó Claude el 2026-10-06 pasando el valor de las variables de Railway a `gh secret set` por stdin, sin mostrarlo.
- **Guardas antes de escribir** (`pdepapel-admin/scripts/backup/db-region-sync.sh`):
  - el usuario de origen es `pdepapel_ro`, y la base responde como tal;
  - el host de destino tiene la huella SHA-256 esperada (el host no se escribe en el repo);
  - el destino no es el host de producción;
  - el destino tiene la marca `migration_meta.target` (`us-east4-eqdc4a`) y el origen no la tiene;
  - en `cutover`, producción está en `super_read_only = 1`.
- **Qué hace:**
  1. Borra y recrea el esquema `railway` del destino, con la misma colación.
  2. `mysqldump --single-transaction --routines --triggers … | mysql`, sin pasar por disco.
  3. Compara la lista de tablas, rutinas, triggers y el número de filas de cada tabla.
- **Resultado:** en `cutover` falla con cualquier diferencia. Solo imprime tiempos, conteos y el resultado; todo lo demás va enmascarado.
- **Después del corte, el workflow queda peligroso:** volvería a borrar la base nueva, que ya estaría en uso. La guarda «el destino no es el host de producción» lo frena en cuanto `BACKUP_DB_*` apunte a la base nueva, pero igual hay que desactivarlo y borrar `NEW_DB_URL` (paso 10 del día).

## Ensayo del 2026-10-06 (sin congelar producción y sin cambiar conexiones)

Corrida [37516685927](https://github.com/chrisdev-ui/pdepapel/actions/runs/37516685927), modo `rehearsal`, verde:

| Paso | Tiempo |
|---|---|
| Runner, checkout e instalación del cliente MySQL | ~15 s |
| Guardas | OK (producción `super_read_only = 0`) |
| Borrar y recrear el esquema de destino | 2 s |
| Volcado y carga (tubería) | **121 s** |
| Verificación: 96 tablas, 0 rutinas y 0 triggers en las dos bases, filas | 2 s |
| **Total del script** | **125 s** (corrida completa: 2 min 21 s) |
| Tablas con distinto número de filas | **0** |

Al terminar, la base nueva quedó resincronizada:
- 96 tablas y 2066 productos, igual que producción a las 19:08 UTC.
- La marca `migration_meta` sigue en su sitio.
- `pdepapel_ro` conserva sus permisos después del `DROP`/`CREATE DATABASE`.

## El día del corte: domingo 11 de octubre de 2026, 06:00–07:00 Bogotá (11:00–12:00 UTC)

**Por qué esa hora:** en los últimos 90 días no hubo ningún pedido entre las 00:00 y las 08:59 de ningún día. Los domingos tampoco hubo ningún webhook ni mensaje entre las 04:00 y las 08:59. De 02:00 a 04:00 sí los hubo, y además corre la copia diaria (03:30, que GitHub suele correr horas tarde).

Marcas: **[Christian]** = lo haces tú (tokens, secretos, panel). **[Claude]** = lo hago yo, con tu sí en el chat cuando toca producción.

**Antes del domingo (pendiente):**
- Escribir y revisar `pdepapel-admin/scripts/db-read-only.mjs` (`--on` / `--off` / `--status`). Lo ejecuta `npm run prod:write` con tu token y hace `SET GLOBAL super_read_only = ON|OFF` en la base vieja. No existe todavía.
- Repetir un ensayo el sábado para confirmar el tiempo.

| Hora (Bogotá) | Quién | Paso |
|---|---|---|
| 05:45 | Christian | Variable de GitHub `BACKUP_ENABLED=false`. Confirmar en Actions que no hay corridas de «Database backup» ni de «Admin scheduled tasks» en curso. |
| 05:45 | Claude | Solo lectura: «MySQL US East» arriba, marca presente, producción sana. Tabla de TTFB «antes». |
| 05:50 | Claude | Corrida `rehearsal` del workflow (~2,5 min), para confirmar que el camino funciona ese día. |
| 06:00 | Christian | `npm run prod:approve -- "congelar escrituras en la base vieja (super_read_only ON) para el corte a us-east4"` |
| 06:01 | Claude | `npm run prod:write -- scripts/db-read-only.mjs --on`. Comprobar con `pdepapel_ro` que `@@super_read_only = 1`. **Desde aquí no hay escrituras en el panel ni en los webhooks.** |
| 06:02 | Claude | Corrida `cutover` del workflow, con confirmación `SYNC-TO-US-EAST` (~2,5 min). Tiene que salir verde con **0 diferencias**. Si falla → «Rollback dentro de la ventana». |
| 06:05 | Christian | Cambiar las conexiones, una por una, editando sin borrar primero (tabla de abajo). |
| 06:08 | Claude (con tu sí) | Deploy **nuevo** del admin (`vercel deploy --prod` desde `pdepapel-admin`, o un commit vacío con push). Un redeploy no sirve, porque reutiliza el entorno anterior. Esperar READY (~2,5 min, más la cola si la hay). |
| 06:12 | Christian + Claude | Prueba de escritura: tú haces un cambio inocuo en el panel (por ejemplo, una nota interna en un pedido de prueba). Yo confirmo con `pdepapel_ro` que está en la base **nueva** y no en la vieja. |
| 06:14 | Claude | Smoke test: `/`, `/tienda`, una categoría, 3 fichas, `/carrito`, login del panel, Pedidos y Productos. Los 5 webhooks sin firma responden 401/403, no 5xx. Tabla de TTFB «después». |
| 06:20 | Christian | `BACKUP_ENABLED=true` y una copia manual. Confirmar que sale verde y que el tamaño es similar (~10,7 MB cifrado). |
| 06:25 | Christian o Claude (con tu sí) | Desactivar el workflow (`gh workflow disable db-region-sync.yml`) y borrar el secreto `NEW_DB_URL`. |
| siguiente corrida | Claude | Crons de «Admin scheduled tasks» y feeds de Merchant y Meta en verde con la base nueva. |
| +7 días | Christian | Apagar o borrar la base vieja, que sigue en `super_read_only`. Ese modo no sobrevive a un reinicio, pero ya nada apunta a ella. |

**Conexiones que cambias tú** (los valores salen de las variables de «MySQL US East» en Railway):

| Dónde | Variable | Nuevo valor |
|---|---|---|
| Vercel › pdepapel-admin › **Production** | `DATABASE_URL` | `mysql://root:<MYSQL_ROOT_PASSWORD>@<RAILWAY_TCP_PROXY_DOMAIN>:<RAILWAY_TCP_PROXY_PORT>/railway`, con los mismos parámetros que tenga hoy (si trae `connection_limit`, se conserva) |
| GitHub › Actions secrets | `BACKUP_DB_HOST`, `BACKUP_DB_PORT`, `BACKUP_DB_PASSWORD` | host y puerto del proxy nuevo; contraseña `PDEPAPEL_RO_PASSWORD`. `BACKUP_DB_USER` y `BACKUP_DB_NAME` no cambian |
| `pdepapel-admin/.env` (local) | `DATABASE_URL` | `pdepapel_ro` con host, puerto y contraseña nuevos |
| `pdepapel-admin/.env.prod-write` (local) | URL de escritura | `root` en la base nueva |

La tienda (pdepapel-store) no tiene `DATABASE_URL`: no se toca.

**Durante el corte:**
- El panel y los webhooks reciben el error 1290 (solo lectura). Bold, Wompi, Mercado Libre y Meta reintentan los webhooks.
- La tienda sigue mostrando páginas desde ISR.
- No hay un modo de mantenimiento en el panel.

**Cómo se congela:** `SET GLOBAL super_read_only = ON` activa también `read_only` y bloquea hasta a root.
- Se revierte con `SET GLOBAL super_read_only = OFF; SET GLOBAL read_only = OFF;`.
- Probado el 2026-10-06 en la base **nueva**: `root` tiene permisos globales y `partial_revokes = 0`; con `ON`, un `CREATE TABLE` de root da `ERROR 1290`, y con `OFF` escribe de nuevo.
- **No sirve** un `REVOKE … ON railway.* FROM root`: con permisos globales y sin `partial_revokes`, un revoke por base no le quita nada.

**Caída esperada:** solo escrituras, unos **12–15 min** (de 06:01 a ~06:14). Congelar 1 min, copia y verificación ~2,5 min, conexiones ~3 min, deploy ~2,5 min más cola, prueba de escritura 1 min. La lectura de la tienda no se cae mientras haya ISR.

## Rollback

**Dentro de la ventana** (el workflow falla, el deploy falla o la verificación falla):
1. **[Christian]** Si ya cambiaste `DATABASE_URL`, devolver el valor viejo en Vercel. **[Claude, con tu sí]** Deploy nuevo del admin.
2. **[Christian]** Token, y **[Claude]** `npm run prod:write -- scripts/db-read-only.mjs --off` en la base vieja. Comprobar `@@super_read_only = 0`.
3. **[Christian]** Devolver los secretos `BACKUP_DB_*` y los `.env` locales, si se cambiaron. Volver a poner `BACKUP_ENABLED=true`.
4. Mientras la vieja estuvo congelada no se escribió nada en ninguna de las dos bases: no hay datos que copiar.

**Después de la ventana** (si hay que volver con escrituras ya hechas en la nueva):
- Los pasos 1–3 anteriores.
- **[Claude, con aprobación]** Copiar a la base vieja lo escrito en la nueva después del corte (pedidos, pagos, movimientos de inventario y eventos de webhook con `createdAt` posterior). Por prod-write, una tabla a la vez.

## Costo de la transición (estimado)

- No se pudo leer el plan de Railway: la CLI no tiene comando de facturación y el panel no está disponible para el agente.
- Con las tarifas públicas de uso de Railway (≈ $10 por GB de RAM al mes, ≈ $20 por vCPU al mes, ≈ $0,15 por GB de volumen al mes), la base nueva en reposo (~0,5–0,6 GB de RAM, CPU mínima, ~0,2 GB de volumen) cuesta **~$0,20–0,30 al día** mientras conviven las dos.
- Vercel no cambia: las funciones siguen en iad1.
