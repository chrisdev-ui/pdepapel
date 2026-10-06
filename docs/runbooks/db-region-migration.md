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
- **Contraseñas nuevas:** `openssl rand -hex 24 | tr -d '\n' | railway variable set NOMBRE --stdin -s <servicio> --skip-deploys`.
- **`railway ssh`** (dentro del contenedor) une los argumentos y los ejecuta en un shell remoto; pasar el script codificado en base64 como una sola cadena. Desde el 2026-10-06 pide una llave SSH registrada en la cuenta (`railway ssh keys add`).
- **CLI 4.33.0:** `railway environment edit` responde «No changes to apply» con cualquier cambio y `railway scale` falla por un cambio de la API. Región, arranque y límites se cambian en el panel.

## Corte (con autorización aparte; no se ha hecho)

**Ventana:** domingo **06:00–07:00** de Bogotá (11:00–12:00 UTC). En los últimos 90 días no hubo ningún pedido entre las 00:00 y las 08:59 de ningún día. Los domingos tampoco hubo ningún webhook ni mensaje entre las 04:00 y las 08:59; entre las 02:00 y las 03:59 hubo 5 webhooks y 4 mensajes. Ese tramo además choca con la copia diaria de las 03:30 (que GitHub suele correr horas tarde).

Marcas: **[Christian]** = lo haces tú (secretos, aprobaciones, panel). **[Claude]** = lo puedo hacer yo por CLI.

1. **[Christian]** Desactivar la copia programada durante la ventana: variable `BACKUP_ENABLED=false` en GitHub. Confirmar en Actions que no hay una corrida de «Database backup» ni de «Admin scheduled tasks» en curso.
2. **[Claude]** Volcado de ensayo a las 05:30 (ver «Ensayo»), para tener el tiempo real del día.
3. **[Christian] Congelar escrituras** en la base vieja, con aprobación de prod-write:
   ```sql
   SET GLOBAL super_read_only = ON;   -- también activa read_only; bloquea hasta a root
   ```
   - Es reversible al instante con `SET GLOBAL super_read_only = OFF; SET GLOBAL read_only = OFF;`. No sobrevive a un reinicio.
   - Probado el 2026-10-06 en la base **nueva**: `root` tiene permisos globales y `partial_revokes = 0`; con `super_read_only = ON`, un `CREATE TABLE` de `root` da `ERROR 1290`, y al volver a `OFF` escribe de nuevo.
   - **No sirve** un `REVOKE … ON railway.* FROM root`: `root` tiene permisos globales (`*.*`) y sin `partial_revokes` un revoke por base no le quita nada.
   - Durante el corte, el panel y los webhooks reciben el error 1290 (solo lectura). Bold, Wompi, Mercado Libre y Meta reintentan los webhooks.
   - La tienda sigue mostrando páginas desde ISR.
   - No hay un modo de mantenimiento en el panel; un `MAINTENANCE_MODE` sería un cambio de código aparte.
4. **[Claude] Volcado final** vieja → nueva desde dentro de Railway o desde un runner de GitHub en EE. UU., nunca desde la laptop. Se lee con `pdepapel_ro`:
   ```bash
   mysqldump --single-transaction --quick --skip-lock-tables --set-gtid-purged=OFF --hex-blob \
     --no-tablespaces --default-character-set=utf8mb4 --triggers -h <host viejo> -P <puerto> -u pdepapel_ro railway \
   | mysql -uroot -h <host nuevo> -P <puerto> railway
   ```
   `mysqldump` incluye `DROP TABLE IF EXISTS` en cada tabla, así que se puede repetir.
5. **[Claude] Verificación de filas:** el mismo script de conteos y huellas de esta preparación, en las dos bases. Tiene que dar **0 diferencias** con escrituras congeladas.
6. **[Christian] Cambiar las conexiones**, variable por variable, editando sin borrar primero. Los valores salen del panel de Railway, servicio «MySQL US East», o de sus variables.

   | Dónde | Variable | Nuevo valor |
   |---|---|---|
   | Vercel › pdepapel-admin › **Production** | `DATABASE_URL` | `mysql://root:<MYSQL_ROOT_PASSWORD>@<RAILWAY_TCP_PROXY_DOMAIN>:<RAILWAY_TCP_PROXY_PORT>/railway`, con los mismos parámetros que tenga hoy (si trae `connection_limit`, se conserva) |
   | GitHub › Actions secrets | `BACKUP_DB_HOST`, `BACKUP_DB_PORT`, `BACKUP_DB_PASSWORD` | host y puerto del proxy nuevo; contraseña de `pdepapel_ro` nueva (`PDEPAPEL_RO_PASSWORD`). `BACKUP_DB_USER` y `BACKUP_DB_NAME` no cambian |
   | `pdepapel-admin/.env` (local) | `DATABASE_URL` | `pdepapel_ro` con host, puerto y contraseña nuevos |
   | `pdepapel-admin/.env.prod-write` (local) | URL de escritura | `root` en la base nueva |

   La tienda (pdepapel-store) no tiene `DATABASE_URL`: no se toca.
7. **[Christian o Claude con tu sí] Deploy nuevo del admin**, no un redeploy, porque el redeploy reutiliza el entorno anterior. Vale un commit vacío o `vercel deploy --prod` desde `pdepapel-admin`. Esperar READY.
8. **[Claude] Verificación:**
   - `pdepapel_ro` ve en la base **nueva** las escrituras posteriores al corte, por ejemplo un pedido de prueba del panel (o el primer webhook reintentado). La base vieja no las tiene.
   - Smoke test: `/`, `/tienda`, una categoría, 3 fichas, `/carrito`, el login del panel, Pedidos y Productos.
   - Los 5 webhooks (Bold, Wompi, WhatsApp, Mercado Libre, EnvioClick) responden con el estado esperado sin firma (401/403, no 5xx).
   - Crons: `/api/cron/*` con token devuelve 200, desde la próxima corrida de «Admin scheduled tasks».
   - Feeds de Merchant y Meta: 200 con token, mirado en la corrida del cron.
   - La tabla de TTFB de la auditoría, antes y después.
9. **[Christian]** Volver a activar `BACKUP_ENABLED=true` y lanzar una copia manual. Confirmar que lee la base nueva y que el tamaño es similar (~10,7 MB cifrado).
10. **Base vieja:** se deja encendida, sin escrituras, **7 días**. Después la apagas tú o se decide borrarla.

**Caída esperada:** solo escrituras, unos 15–20 min (congelar 1 min, volcado y carga ~5–8 min, verificación 2 min, cambio de variable y deploy ~4 min, smoke test 2 min). Lectura en la tienda: sin caída mientras haya ISR.

## Rollback

1. **[Christian]** Devolver `DATABASE_URL` (Vercel, admin Production) al valor viejo y hacer deploy nuevo del admin.
2. **[Christian]** Volver a permitir escrituras en la base vieja:
   ```sql
   SET GLOBAL super_read_only = OFF; SET GLOBAL read_only = OFF;
   ```
3. **[Claude, con aprobación]** Copiar a mano a la base vieja lo escrito en la nueva después del corte: pedidos, pagos, movimientos de inventario y eventos de webhook con `createdAt` posterior al corte. Mismo procedimiento de prod-write, una tabla a la vez.
4. Devolver los secretos de GitHub y los `.env` locales.

## Ensayo (sin congelar producción y sin cambiar conexiones)

Pendiente. Hace falta correr el volcado desde dentro de Railway o desde un runner de GitHub en EE. UU. Las dos vías:
- **Dentro de Railway:** necesita que la cuenta tenga una llave SSH registrada (`railway ssh keys github` importa las llaves públicas de GitHub). Además, una variable en «MySQL US East» con la URL de `pdepapel_ro` de producción (puesta por `--stdin`) y un redeploy de la base nueva, que todavía no usa nadie.
- **Runner de GitHub:** un workflow `workflow_dispatch` que lea la base vieja con los secretos `BACKUP_DB_*` que ya existen y escriba en la nueva con secretos `NEW_DB_*` nuevos, que tienes que crear tú. El mismo workflow sirve para el corte. Es un cambio en `.github/workflows/`.

Cuando se haga, se anotan aquí el tiempo del volcado, el de la verificación y el total.

## Costo de la transición (estimado)

- No se pudo leer el plan de Railway: la CLI no tiene comando de facturación y el panel no está disponible para el agente.
- Con las tarifas públicas de uso de Railway (≈ $10 por GB de RAM al mes, ≈ $20 por vCPU al mes, ≈ $0,15 por GB de volumen al mes), la base nueva en reposo (~0,5–0,6 GB de RAM, CPU mínima, ~0,2 GB de volumen) cuesta **~$0,20–0,30 al día** mientras conviven las dos.
- Vercel no cambia: las funciones siguen en iad1.
