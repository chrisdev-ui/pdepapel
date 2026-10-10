# Plan: usuario de MySQL con el mínimo privilegio para el panel

Estado: **plan, sin ejecutar**. Escrito el 2026-10-10. Christian decide la fecha.

## Por qué

`DATABASE_URL` de Production (pdepapel-admin en Vercel) entra hoy como `root`. Con root, un error de código o una consulta inyectada puede:

- borrar tablas;
- crear usuarios;
- leer `mysql.user`;
- cambiar variables globales.

El panel solo necesita leer y escribir filas de su propio esquema.

## Los usuarios, separados por trabajo

| Usuario | Para qué | Privilegios | Dónde vive la URL |
|---|---|---|---|
| `pdepapel_app` (nuevo) | la app en Vercel | `SELECT, INSERT, UPDATE, DELETE` en el esquema de la app; `SELECT` en `performance_schema` | `DATABASE_URL` de Production |
| `root` | migraciones manuales (`npm run prod:migrate`) y escrituras aprobadas (`npm run prod:write`) | todo | `.env.prod-write` local de Christian; nunca en Vercel después del cambio |
| `pdepapel_ro` | respaldos, réplica de región, diagnóstico | lectura + `PROCESS` + `performance_schema`/`sys` (`scripts/grant-diagnostics-read.mjs`) | secretos de GitHub del respaldo y `.env` de herramientas |
| `copilot_ro` (bloque del copiloto) | herramientas del copiloto | `SELECT` en tablas y columnas contadas | `COPILOT_DATABASE_URL` |

### Por qué estos privilegios y no otros

Se revisó todo el SQL que corre la app (`$queryRaw` y `$executeRaw` en `lib/`, `app/` y `actions/`):

- **Prisma** necesita solo DML: no crea tablas al arrancar. Las migraciones son manuales y corren con root.
- **`SELECT … FOR UPDATE`** (tarjetas de regalo, ferias) necesita `SELECT` y `UPDATE` sobre la tabla; los dos ya están.
- **`INSERT IGNORE` y los `UPDATE` atómicos** (alertas de Mercado Libre, reclamos de correos) son DML normal.
- **`lib/db-health.ts`** lee `performance_schema.memory_summary_global_by_event_name`, así que necesita `SELECT` en `performance_schema`. Su `SHOW GLOBAL STATUS` no necesita privilegios.
- **No hace falta:**
  - `PROCESS`: el panel no lista las conexiones de otros usuarios.
  - `CREATE`, `ALTER`, `DROP`, `INDEX`, `REFERENCES`: no hay llaves foráneas (`relationMode = "prisma"`).
  - `CREATE TEMPORARY TABLES`, `LOCK TABLES`, `EVENT`, `TRIGGER`, `FILE`, `SUPER`, `GRANT OPTION`.

Si una función nueva necesita algo más, falla con el error 1142 o 1227 y se ve en los registros. Ese privilegio se agrega con este mismo plan, no se vuelve a root.

## Pasos

Durante todo el proceso, root sigue funcionando. Nada se borra ni se revoca hasta el paso 7.

| # | Quién | Qué |
|---|---|---|
| 0 | Christian | Elige una ventana con poco tráfico, fuera del respaldo diario y de los trabajos de 09:00 y 13:00 UTC. Guarda la URL actual de `DATABASE_URL` en su gestor de contraseñas: es la vuelta atrás. |
| 1 | Christian, en la consola de Railway (servicio MySQL, pestaña de datos o consola) | Crea el usuario con una contraseña que genera él. La contraseña nunca pasa por el chat, el repositorio ni la terminal de Claude: `CREATE USER 'pdepapel_app'@'%' IDENTIFIED BY '<contraseña de Christian>';` |
| 2 | Claude, con su sí y el token de `prod:approve` | Un guion `scripts/grant-app-user.mjs` con la forma de `grant-diagnostics-read.mjs`, que corre con `npm run prod:write -- … --expect new`. Comprueba que existe una sola cuenta `pdepapel_app`, ejecuta `GRANT SELECT, INSERT, UPDATE, DELETE ON <esquema>.* TO …` y `GRANT SELECT ON performance_schema.* TO …`, e imprime `SHOW GRANTS`. |
| 3 | Christian | Prueba local sin desplegar: arma la URL nueva en un archivo ignorado propio y corre el panel en su máquina contra producción solo en lectura (abrir Inicio, Pedidos, Productos). Ninguna escritura. |
| 4 | Christian, en Vercel › pdepapel-admin › Settings › Environment Variables › `DATABASE_URL` (Production) › Edit | Reemplaza el valor por la URL de `pdepapel_app` y conserva los parámetros que tenga después de `?`. **Editar, nunca borrar y volver a crear** (`vercel env rm` sin entorno borra la variable en todos). |
| 5 | Claude, con su sí | Deploy **nuevo** por git: cambia la línea de `pdepapel-admin/deploy-stamp.txt`, commit y push. Nunca un redeploy (reusa el entorno viejo) ni `vercel deploy` local (subió archivos `.env` el 2026-10-06). Espera `READY` y compara `/api/version` con el commit. |
| 6 | Claude | Verificación, la misma tarde (ver abajo). |
| 7 | Christian, días después | Cuando lleve una semana sin errores de permisos: rotar la contraseña de root, porque la vieja vivió en Vercel y en la integración de Railway que se cortó el 2026-10-07. Root sigue existiendo para `prod:migrate`. Actualizar `.env.prod-write`. |

### Verificación del paso 6

1. Con `pdepapel_ro` (tiene `PROCESS`): `SELECT USER, COUNT(*) FROM information_schema.PROCESSLIST GROUP BY USER`. Las conexiones de la app aparecen como `pdepapel_app` y no queda ninguna de root que no sea de una herramienta local.
2. Corrida manual de «Admin scheduled tasks» con `only: db-health`. Ejercita `performance_schema`, `SHOW GLOBAL STATUS` y una escritura propia de la app (`JobRun`), y debe quedar en verde en «Sistemas».
3. Una escritura normal desde el panel que no toque dinero ni stock. Por ejemplo, editar y restaurar la descripción de un producto de prueba archivado.
4. Registros de Vercel durante 30 minutos sin `1142` (sin permiso sobre la tabla), `1227` (sin privilegio) ni `Access denied`.
5. El webhook de pagos y el bot de WhatsApp escriben con el mismo usuario. Revisar el primer evento real de cada uno después del cambio.

## Vuelta atrás

En cualquier momento antes del paso 7:

1. Christian vuelve a poner en `DATABASE_URL` (Production) la URL de root que guardó en el paso 0. Se edita, no se borra.
2. Deploy nuevo por git con `deploy-stamp.txt`, nunca un redeploy.
3. `READY`, `/api/version` y una lectura del panel.
4. El usuario `pdepapel_app` puede quedarse creado y sin uso. Se borra solo si se abandona el plan, con `DROP USER` por `prod:write`.

Después del paso 7 la vuelta atrás es la misma, con la contraseña nueva de root.

## Lecciones de rotaciones anteriores aplicadas aquí

- Un **redeploy reutiliza las variables viejas**: siempre un deploy nuevo por git (corte de región, 2026-10-07).
- **Nunca `vercel deploy` desde la carpeta local**: subió archivos `.env` (incidente del 2026-10-06).
- Las variables **Sensitive** se descargan vacías con `vercel env pull`: no sirven para comprobar el valor. La prueba es la conexión, no leer la variable.
- **Root sigue válido hasta verificar** el usuario nuevo en vivo. Revocar o rotar root es lo último.
- Las contraseñas las genera y las escribe Christian. Claude no las lee, no las imprime y no las guarda.

## Fuera de este plan

- El `.env` local de `pdepapel-admin` también usa root contra producción. Conviene pasarlo a `pdepapel_ro` y dejar root solo en `.env.prod-write`, en el mismo cambio o justo después.
- Preview no tiene una base propia documentada. Antes de cambiar Production, confirmar qué `DATABASE_URL` usa Preview, sin leer su valor: solo a qué usuario apunta, preguntándole a Christian.
