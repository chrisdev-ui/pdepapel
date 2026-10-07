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

## El corte: martes 6 → miércoles 7 de octubre de 2026, 01:00 Bogotá (06:00 UTC)

El corte se adelantó: estaba planeado para el domingo 11-oct, 06:00–07:00.

**Por qué esa hora:** en 90 días no hubo ningún pedido entre las 00:00 y las 08:59 de ningún día, y entre la 01:00 y las 01:59 casi no hubo webhooks (1 en 90 días). La copia diaria (03:30 Bogotá, que GitHub suele correr horas tarde) se apaga durante la ventana con `BACKUP_ENABLED=false`.

Marcas: **[Christian]** = lo haces tú (tokens, secretos, panel). **[Claude]** = lo hago yo; lo que toca producción, solo con tu sí en el chat.

### GO / NO-GO (00:50 y 01:00, solo lectura)

```bash
cd pdepapel-admin && node --env-file=.env scripts/backup/cutover-go-no-go.mjs
```

| Comprobación | Tiene que dar |
|---|---|
| Pedidos creados o pagados en los últimos 30 min | 0 |
| Pedidos `PENDING`/`CREATED` (pago abierto) creados en los últimos 60 min | 0 |
| Escrituras del panel en los últimos 15 min (`updatedAt` de pedidos, productos, envíos, pagos, categorías, ofertas, cupones, reposición, ajustes y `createdAt` del kardex) | 0 |
| Webhooks y mensajes de los últimos 10 min (`MarketplaceWebhookEvent`, `PaymentWebhookEvent`, `ConversationMessage`) | 0 |

Si algo falla, se espera y se repite cada 10 min. Nunca se empieza con una comprobación en falla, salvo «GO ANYWAY» de Christian.

### Paso a paso

| # | Quién | Paso |
|---|---|---|
| 0 | Christian | Decir «estoy listo». |
| 1 | Claude | GO/NO-GO. Si sale GO, sigue. |
| 2 | Christian | GitHub › repo › Settings › Secrets and variables › Actions › pestaña **Variables** › `BACKUP_ENABLED` › Edit › `false` › Update. Claude confirma en Actions que no hay corridas en curso de «Database backup» ni de «Admin scheduled tasks». |
| 3 | Claude | Corrida `rehearsal` de `db-region-sync` (~2,5 min). Tiene que salir verde. |
| 4 | Christian | En tu terminal, desde `pdepapel-admin`: `npm run prod:approve -- "congelar escrituras de la base vieja (super_read_only ON) para el corte a us-east4"` |
| 5 | Claude | `npm run prod:write -- scripts/db-read-only.mjs --on --expect old`. El guion confirma que es la base vieja, congela y prueba una escritura que no cambia nada: tiene que fallar con 1290. Además, un `--status --expect old` con `pdepapel_ro` tiene que mostrar `super_read_only: 1`. **Desde aquí no hay escrituras en el panel ni en los webhooks.** |
| 6 | Claude | Corrida `cutover` de `db-region-sync`, con confirmación `SYNC-TO-US-EAST` (~2,5 min). Verde y **0 diferencias**, o «Rollback». |
| 7 | Christian | Cambiar los secretos (instrucciones abajo). Claude solo mira nombres y fechas, nunca valores. |
| 8 | Claude (con tu sí) | Deploy **nuevo** de producción del admin **por git** (ver «Paso 8 en detalle»). Nunca `vercel deploy` desde la carpeta local, y nunca un redeploy, porque reutiliza el entorno anterior. |
| 9 | Christian + Claude | Prueba de escritura: un cambio inocuo en el panel (por ejemplo, la nota interna de un pedido de prueba). Claude confirma con `pdepapel_ro` que está en la base **nueva** y no en la vieja. |
| 10 | Claude | Smoke test: `/`, `/tienda`, una categoría, 3 fichas, `/carrito`, login del panel. Los 5 webhooks sin firma responden 4xx, no 5xx. Tabla de TTFB contra la de antes. |
| 11 | Christian | `BACKUP_ENABLED` → `true`. Claude lanza una copia manual («Database backup», `workflow_dispatch`): tiene que salir verde con un tamaño similar (~10,7 MB cifrado). |
| 12 | Claude | `gh workflow disable db-region-sync.yml --repo chrisdev-ui/pdepapel` y `gh secret delete NEW_DB_URL --repo chrisdev-ui/pdepapel`. Comprobar con `gh workflow list` y `gh secret list` que quedó desactivado y sin el secreto. |
| 13 | Claude | En la próxima corrida de «Admin scheduled tasks», crons y feeds de Merchant y Meta en verde. |
| — | — | La base vieja queda en `super_read_only` **7 días** como respaldo para volver atrás. Ese modo no sobrevive a un reinicio, pero ya nada apunta a ella. Pasados los 7 días, Christian la apaga o se decide borrarla. |

**Caída:** solo escrituras, de los pasos 5 a 9, unos 10–15 min. La tienda sigue mostrando páginas desde ISR. Los webhooks que fallen con 1290 los reintentan Bold, Wompi, Mercado Libre y Meta.

### Paso 8 en detalle: deploy nuevo del admin por git

Método validado el 2026-10-06:
- Commit `d8623cb6` (`chore(admin): sello de deploy…`): el admin compiló desde git y la tienda quedó Canceled por ignore-build.
- El deploy `dpl_Hf4nBtVuZNiNp8au7SdPtKy87bAE` quedó Ready en unos 3 min y `admin.papeleriapdepapel.com` pasó a él. `/iniciar-sesion` y `/api/<store>/public/storefront` respondieron 200. Mismo código y entorno, sin cambio funcional.
- `pdepapel-admin/deploy-stamp.txt` está fuera de la lista que salta el ignore-build. Cambiar su única línea compila **solo el admin**, desde git, con las variables de entorno vigentes en ese momento. No se sube nada local.

**Antes del sello**, el push tiene que llevar solo el sello (más docs), nunca código de la app. El trabajo aprobado de esa tarde vive en la rama local `post-corte`, no en `main`:

```bash
git switch main
git status --short                 # vacío
git fetch origin && git log --oneline origin/main..main   # vacío (o solo commits de docs)
```

Si alguna de las dos no sale vacía, se para y se revisa antes de seguir.

```bash
cd <raíz del repo>
printf '%s\n' "$(date -u '+%Y-%m-%d %H:%M UTC') · corte de la base a us-east4: nueva DATABASE_URL" > pdepapel-admin/deploy-stamp.txt
git add pdepapel-admin/deploy-stamp.txt
git commit -m "chore(admin): deploy del panel con la base en us-east4"
git push origin main          # con tu sí en el chat
```

Después:
1. Esperar en Vercel › pdepapel-admin › Deployments el deploy de ese commit en **Ready**, con «Production» y el dominio `admin.papeleriapdepapel.com` asignado. La tienda debe salir Canceled.
2. Comprobar que el panel abre (`/iniciar-sesion`) y que la API responde.
3. Hacer el paso 9 (prueba de escritura en la base nueva).

**Prohibido** (incidente 2026-10-06, `docs/ops/2026-10-06-incidente-env-subidos-a-vercel.md`): `vercel deploy`, `vercel --prod` o `vercel` desde el árbol local. La CLI sube todo lo que hay en disco, incluidos `.env` y `.env.prod-write`.

### Secretos que cambias tú (paso 7)

Todos los valores nuevos están en Railway: proyecto «PdePapel Database» › servicio **«MySQL US East»** › pestaña **Variables** (el ojo muestra el valor y el ícono de copiar lo copia).

| Dónde | Qué | Valor que copias de «MySQL US East» |
|---|---|---|
| Vercel › pdepapel-admin › Settings › Environment Variables › `DATABASE_URL` (**Production**) › ⋯ › Edit | Reemplazar el valor y guardar. **No borrar la variable.** | `MYSQL_PUBLIC_URL` (ya resuelta: `mysql://root:…@…:…/railway`). Si la `DATABASE_URL` actual trae parámetros después de `?` (por ejemplo `connection_limit` o `sslaccept`), agrégalos al final igual que hoy. |
| Vercel › pdepapel-admin › `DATABASE_URL` (**Development**) | Solo si hoy apunta a producción: lo ves al editarla. Si apunta a otra base, no se toca. | igual que arriba |
| GitHub › repo › Settings › Secrets and variables › Actions › Secrets › `BACKUP_DB_HOST` › Update | — | `RAILWAY_TCP_PROXY_DOMAIN` |
| `BACKUP_DB_PORT` › Update | — | `RAILWAY_TCP_PROXY_PORT` |
| `BACKUP_DB_PASSWORD` › Update | — | `PDEPAPEL_RO_PASSWORD` |
| `pdepapel-admin/.env` (tu editor) | La línea `DATABASE_URL=` | `PDEPAPEL_RO_PUBLIC_URL` |

- `BACKUP_DB_USER` (`pdepapel_ro`) y `BACKUP_DB_NAME` (`railway`) no cambian.
- **`pdepapel-admin/.env.prod-write` NO se cambia esta noche.** Sigue apuntando a la base vieja, porque el rollback (`db-read-only --off --expect old`) la necesita así. Se separa en dos archivos después de verificar el corte (sección «e»).
- La tienda (pdepapel-store) no tiene `DATABASE_URL` en ningún entorno.
- **Integración Railway → Vercel:** las variables de los servicios de Railway se copian solas al proyecto **pdepapel-admin** de Vercel, en Production y Preview. Ya llegaron `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE` y `PDEPAPEL_RO_PASSWORD` de la base nueva; `MYSQL_PRIVATE_URL` existe desde hace 912 días. La app no las usa (solo `DATABASE_URL`), pero quedan replicadas, cifradas. Revisar después del corte si conviene acotar o quitar esa integración.

## Después del corte (solo con el corte verificado; nada de esto antes)

### a. Cortar la integración Railway → Vercel y borrar lo que copió

La integración es «railway», configuración `icfg_5gxxP1bdRhFoDIa0cjLK0Yos`, alcance **solo pdepapel-admin**, con permiso de lectura y escritura sobre sus variables de entorno. `DATABASE_URL` **no** la gestiona la integración (Production y Development no tienen `configurationId`), así que no se toca.

1. **[Christian] Railway:**
   - Proyecto «PdePapel Database» › **Settings** › **Integrations** › Vercel.
   - Anotar qué servicios y entornos sincroniza.
   - **Disconnect / Remove** del proyecto `pdepapel-admin`.
2. **[Christian] Vercel:**
   - Team «christian-torres-projects» › **Settings** › **Integrations** › **Railway** › **Manage**.
   - Si solo se usa para esto: **Uninstall / Remove Integration**.
   - Si se quiere conservar para otro proyecto: **Manage Access** y quitar `pdepapel-admin`.
3. **[Claude, con tu sí por variable]** Borrar de Vercel › pdepapel-admin las variables que gestionaba la integración, por nombre y entorno. Primero hay que cortar la integración, o volvería a escribirlas.
   ```bash
   cd pdepapel-admin
   for name in MYSQL_DATABASE MYSQL_ROOT_PASSWORD PDEPAPEL_RO_PASSWORD MYSQL_PUBLIC_URL PDEPAPEL_RO_PUBLIC_URL MYSQL_PRIVATE_URL; do
     vercel env rm "$name" preview --yes
     vercel env rm "$name" production --yes
   done
   ```
   - Hay que nombrar siempre el entorno: `vercel env rm NOMBRE` sin entorno borra en todos.
   - Comprobar con la API (`/v9/projects/<id>/env?decrypt=false`, solo nombres) que no queda ninguna variable con `configurationId` y que `DATABASE_URL` (Production y Development) sigue igual.

### b. `.vercelignore` en la raíz y en las dos apps

- Excluir `.env*` salvo `*.example`, y las carpetas de borradores (`tmp/`, `output/`, `outputs/`, `Claude outputs/`, `_gitlock_trash/`, logs locales).
- Comprobar que ningún `.env` quedaría incluido con un listado que aplique las mismas reglas de ignorado sobre el árbol, sin subir nada: por ejemplo, un script que recorra el árbol con esas reglas e imprima solo nombres.
- Es un cambio de configuración; va en un commit sin código de la app.

### c. Credenciales de la base vieja (subidas en el incidente)

Lo que ocurra primero:
- **Retirar la base vieja** (apagar o borrar «MySQL Database») a los 7 días del corte. Con eso las credenciales dejan de servir.
- **Rotarlas antes**, si se quiere conservarla más tiempo. Está en `super_read_only`, que bloquea `ALTER USER` hasta para root, así que:
  1. **[Christian]** `npm run prod:approve -- "rotar root y pdepapel_ro de la base vieja (OFF breve, ALTER USER, ON)"`. La corrida va con `--expect old`, que después de la sección «e» usa `.env.prod-write.old-db`.
  2. **[Claude]** En una sola corrida de prod:write:
     - `--off --expect old`;
     - `ALTER USER 'pdepapel_ro'@'%' IDENTIFIED BY <nueva>` y `ALTER USER 'root'@'%' IDENTIFIED BY <nueva>`, con contraseñas generadas en variables de Railway del servicio viejo por `--stdin`;
     - `--on --expect old`.

     Hace falta un guion propio (`scripts/rotate-old-db-users.mjs`), que se escribe y revisa antes; todavía no existe.
  3. **[Christian]** Actualizar las variables del servicio viejo en Railway, que el panel muestra, si se quiere conservar el acceso.

### d. Rotar la llave de Cloudinary del monitor (la haces tú)

- La llave es **exclusiva del monitor**, distinta de la de la app.
- Vive solo en `pdepapel-admin/scripts/cloudinary-monitor/.env` como `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`.

Pasos:
1. Cloudinary Console › **Settings** (engranaje) › **API Keys** › **Generate New API Key**.
2. Copiar la llave y el secreto nuevos. En `scripts/cloudinary-monitor/.env`, reemplazar la línea `CLOUDINARY_URL=` con la llave y el secreto nuevos; el `cloud_name` no cambia.
3. Probar en local: `cd pdepapel-admin && node scripts/cloudinary-monitor/usage.mjs`. Tiene que imprimir el uso del día sin errores.
4. En **API Keys**, desactivar y luego borrar la llave vieja del monitor (la que no es la de la app). Para distinguirlas, mirar el nombre o la fecha de creación; la de la app sigue en Vercel como `CLOUDINARY_API_KEY`.
5. La próxima corrida diaria (launchd, 08:00 local) debe quedar sin errores en `monitor-errors.log`.

### e. Separar `.env.prod-write` y exigir `--expect` (después de verificar el corte)

Hasta aquí `.env.prod-write` sigue en la base **vieja** para el rollback. Con el corte verificado:

1. **[Claude]** Tener en la copia local el commit `e21d12e6` (rama `post-corte`). Trae la guarda `--expect new|old` de `prod:write`/`prod:migrate` y la línea de `.gitignore` para `.env.prod-write.old-db`. Sin esa línea, el archivo nuevo quedaría sin ignorar.
2. **[Christian]**, desde `pdepapel-admin`, sin imprimir nada:
   ```bash
   cp .env.prod-write .env.prod-write.old-db && chmod 600 .env.prod-write.old-db
   git check-ignore -q .env.prod-write.old-db && echo ignorado   # tiene que decir «ignorado»
   ```
   Luego, en tu editor, la línea `DATABASE_URL=` de `.env.prod-write` pasa a ser `MYSQL_PUBLIC_URL` de «MySQL US East».
3. **[Claude]** Comprobar sin token, solo con lecturas (el modo `--status` no escribe):
   ```bash
   node --env-file=.env.prod-write        scripts/db-read-only.mjs --status --expect new   # base: nueva
   node --env-file=.env.prod-write.old-db scripts/db-read-only.mjs --status --expect old   # base: vieja, super_read_only 1
   ```
4. Desde aquí, toda escritura dice a qué base va:
   - `npm run prod:write -- <guion> --expect new`;
   - `npm run prod:migrate -- <archivo.sql> --expect new`;
   - `--expect old` solo para el rollback, la rotación de credenciales (sección «c») o el retiro de la base vieja. Con `--expect old`, el envoltorio usa `.env.prod-write.old-db`.
   - **Qué hace la guarda:** antes de ejecutar, pregunta a la base qué base es. La nueva tiene el esquema `migration_meta`; la vieja no. Si no coincide con `--expect`, se niega sin gastar la aprobación.
   - `pdepapel_ro` no ve ese esquema (no tiene SELECT global), así que con ese usuario la identidad sale «unknown» y no se escribe nada.
5. Al retirar la base vieja, borrar `.env.prod-write.old-db` (con tu sí).

### f. Despliegue de `Color.swatchType` (issue #3), después de la sección «e»

El orden es obligatorio. Sin la columna, el código nuevo hace que la API del catálogo responda 500 y la tienda se cae.

1. **[Christian]** `npm run prod:approve -- "migración 20261007_add_color_swatch_type en la base nueva"`.
2. **[Claude]** `npm run prod:migrate -- prisma/manual-migrations/20261007_add_color_swatch_type.sql --expect new`. Después, las consultas de verificación del propio archivo, con `pdepapel_ro` de la base nueva.
3. **[Claude, con tu sí]** Push de la rama `color-swatch-type`, rebasada sobre `main`. Compilan los dos proyectos.
4. **[Christian]** Aprobación nueva. **[Claude]** `npm run prod:write -- scripts/backfill-color-swatch-type.mjs --expect new`: ensayo, que solo lista los 13 colores y no escribe.
5. **[Christian]** Aprobación nueva. **[Claude]** `npm run prod:write -- scripts/backfill-color-swatch-type.mjs --apply --expect new`.
6. Commit de `pdepapel-admin/ops/prod-writes.log`.

## Rollback (cualquier falla desde el paso 5)

**Nunca dejar la base vieja en solo lectura mientras la app siga apuntando a ella.**

1. **[Christian]** Si ya cambiaste `DATABASE_URL` (Vercel, admin Production), volver a poner el valor viejo. **[Claude, con tu sí]** Deploy nuevo de producción del admin y esperar READY.
2. **[Christian]** `npm run prod:approve -- "descongelar la base vieja (super_read_only OFF): rollback del corte a us-east4"`.
3. **[Claude]** `npm run prod:write -- scripts/db-read-only.mjs --off --expect old`. Esta noche, `.env.prod-write` sigue en la vieja. Después de la sección «e», `--expect old` usa `.env.prod-write.old-db`. El guion comprueba que es la vieja, descongela y prueba que una escritura pasa. Luego `--status --expect old` con `pdepapel_ro` tiene que mostrar 0/0.
4. **[Christian]** Devolver los secretos `BACKUP_DB_*` y los `.env` locales, si se cambiaron, y `BACKUP_ENABLED=true`.
5. Mientras la vieja estuvo congelada no se escribió nada en ninguna base, así que no hay datos que copiar. Si se vuelve atrás después de abrir escrituras en la nueva, hay que copiar a mano lo escrito ahí (pedidos, pagos, kardex, webhooks), por prod-write y con aprobación.

## Incidente del 2026-10-06: `.env` subidos a Vercel

Al validar el paso 8 con `vercel deploy --prod --skip-domain` desde `pdepapel-admin`, la CLI subió el árbol local antes de fallar por el Root Directory: `.env`, `.env.prod-write`, `scripts/cloudinary-monitor/.env` y otros.
- El deploy (`dpl_4UsGDT3m…`, Error, nunca promovido) se borró a las **19:49:07 UTC**.
- Alcance: solo el equipo de Vercel.
- Remediación: la regla nueva en los `AGENTS.md`, `.vercelignore`, la rotación o el retiro de la base vieja y la rotación de la llave de Cloudinary (sección «Después del corte»).

Detalle: `docs/ops/2026-10-06-incidente-env-subidos-a-vercel.md`.

## Costo de la transición (estimado)

- No se pudo leer el plan de Railway: la CLI no tiene comando de facturación y el panel no está disponible para el agente.
- Con las tarifas públicas de uso de Railway (≈ $10 por GB de RAM al mes, ≈ $20 por vCPU al mes, ≈ $0,15 por GB de volumen al mes), la base nueva en reposo (~0,5–0,6 GB de RAM, CPU mínima, ~0,2 GB de volumen) cuesta **~$0,20–0,30 al día** mientras conviven las dos.
- Vercel no cambia: las funciones siguen en iad1.
