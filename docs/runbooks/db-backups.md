# Copias de seguridad de la base de datos

La base de producción (MySQL en Railway) **no tiene copias de Railway** («No Backups» en el panel) y tiene el binlog apagado, así que no hay recuperación a un punto en el tiempo. Esta copia diaria es la red de seguridad.

## Cómo funciona

`.github/workflows/db-backup.yml` corre todos los días a las 08:30 UTC (03:30 en Colombia) y ejecuta `pdepapel-admin/scripts/backup/db-backup.sh`:

1. `mysqldump` con el usuario de **solo lectura** (`SELECT, SHOW VIEW`): `--single-transaction` (instantánea consistente sin bloquear tablas), `--quick`, `--no-tablespaces`, `--skip-lock-tables`, `--set-gtid-purged=OFF`, `--hex-blob`, `--default-character-set=utf8mb4`, `--triggers`. Sin `--routines` ni `--events`: la base no tiene ninguno (comprobado el 2026-10-05) y el usuario de lectura no tiene `SHOW_ROUTINE`. Si algún día se crean, hay que darle ese permiso y añadir la opción.
2. En el mismo tubo: `gzip -9` y `age` con la llave **pública**. El volcado nunca se escribe en claro en disco.
3. Comprueba que el volcado terminó («-- Dump completed») y que tiene tablas; si no, falla sin subir nada.
4. Sube `daily/<base>-<fecha>.sql.gz.age` a R2 y, el día 1 de cada mes, también `monthly/…`. Después compara el tamaño en R2 con el local.

El 2026-10-05 un volcado así ocupó 10,6 MB comprimido (95 tablas, 36.645 filas) y tardó unos 5 minutos.

**Interruptor:** el trabajo solo corre si la variable del repositorio `BACKUP_ENABLED` vale `true`. Con el interruptor encendido y un secreto faltante, el primer paso falla y nombra lo que falta, antes de conectarse a nada.

**Avisos de fallo:** GitHub manda un correo cuando falla una corrida programada, a quien editó por última vez el `cron` del archivo. Revisa también la pestaña Actions.

## Secretos y variables

En GitHub › Settings › Secrets and variables › Actions:

| Nombre | Tipo | Qué es |
|---|---|---|
| `BACKUP_DB_HOST` | secreto | Host público de Railway (el de `.env`) |
| `BACKUP_DB_PORT` | secreto | Puerto público de Railway |
| `BACKUP_DB_USER` | secreto | Usuario de **solo lectura** (`pdepapel_ro`); nunca el de escritura |
| `BACKUP_DB_PASSWORD` | secreto | Su contraseña |
| `BACKUP_DB_NAME` | secreto | Nombre de la base (`railway`) |
| `BACKUP_R2_ACCOUNT_ID` | secreto | ID de la cuenta de Cloudflare |
| `BACKUP_R2_ACCESS_KEY_ID` | secreto | Llave del token de R2 |
| `BACKUP_R2_SECRET_ACCESS_KEY` | secreto | Secreto del token de R2 |
| `BACKUP_R2_BUCKET` | secreto | Nombre del bucket privado |
| `BACKUP_AGE_RECIPIENT` | variable | Llave **pública** de age (`age1…`). No es secreta |
| `BACKUP_ENABLED` | variable | `true` para activar la copia diaria |

La **llave privada** de age no vive en GitHub, ni en el repositorio, ni en Cloudflare. La guarda Christian fuera de línea (gestor de contraseñas o un medio offline). Sin ella las copias no se pueden leer, y si se pierde, las copias existentes no sirven.

## Estado actual

- **Activa desde el 2026-10-05, 19:16 UTC** (`BACKUP_ENABLED=true`). Corre todos los días a las **08:30 UTC** (03:30 en Colombia).
- **Primera copia:** corrida manual [37362198609](https://github.com/chrisdev-ui/pdepapel/actions/runs/37362198609), 3 min 42 s, `daily/railway-2026-10-05T19-17-03Z.sql.gz.age`, 96 tablas, 10.742.533 bytes cifrados.
  - Prueba de restauración con la llave real: 96 de 96 tablas con el mismo número exacto de filas que producción (36.786 filas).
- **Dónde viven:** bucket privado `pdepapel-db-backups` en la cuenta de Cloudflare de P de Papel (sin acceso público, sin r2.dev, sin dominio propio).
  - `daily/`: se borra a los 35 días (`daily-35-dias`), con bloqueo de 30 días (`daily-lock-30-dias`): nada se puede borrar ni sobrescribir antes.
  - `monthly/`: la copia del día 1 de cada mes, se borra a los 400 días (`monthly-400-dias`).
- **Token de R2:** «Account API token» `pdepapel-db-backups-github`, permiso Object Read & Write solo sobre `pdepapel-db-backups`, sin vencimiento, sin filtro de IP. Sus valores están solo en los secretos de GitHub.
- **Llave de age:** la privada la custodia Christian en su gestor de contraseñas, más una copia fuera de línea; nunca en el repositorio, GitHub ni Cloudflare. **Sin ella, ninguna copia se puede descifrar.** La pública está en la variable `BACKUP_AGE_RECIPIENT`.

## Correr la copia a mano

```bash
gh workflow run db-backup.yml --repo chrisdev-ui/pdepapel -f keep_artifact=true
gh run list --repo chrisdev-ui/pdepapel --workflow db-backup.yml -L 1
```

`keep_artifact=true` deja además el archivo **cifrado** (`.age`, nada en claro) como artefacto del run por 1 día, para la prueba de restauración. Sin esa opción solo se sube a R2. En el resumen del run salen la clave y el tamaño.

## Si falla la corrida diaria

- **Aviso:** GitHub manda un correo a la cuenta que editó por última vez el `cron` del flujo (chrisdev-ui, Christian). Revisarlo con `gh run list --repo chrisdev-ui/pdepapel --workflow db-backup.yml`.
- **«faltan variables»:** falta un secreto o la variable; ver la tabla de arriba.
- **Access denied / no conecta con la base:** el usuario de lectura o la red de Railway. Revisar el usuario en Railway y `BACKUP_DB_*`.
- **403 de R2:** el token se revocó o cambió de alcance. Rotarlo (ver Rotación).
- **«el volcado no terminó»:** el volcado se cortó; volver a correrlo a mano.
- Después de arreglarlo, correrlo a mano y confirmar el objeto nuevo en `daily/`.

## Preparación (una sola vez)

1. **Bucket privado** en R2 (por ejemplo `pdepapel-db-backups`), sin acceso público ni dominio.
2. **Reglas de ciclo de vida** (R2 › bucket › Settings › Object lifecycle rules, o `npx wrangler r2 bucket lifecycle add`): prefijo `daily/` → borrar a los 35 días; prefijo `monthly/` → borrar a los 400 días. R2 borra «typically within 24 hours» después del vencimiento.
3. **Bloqueo del bucket** (opcional y recomendado; R2 › bucket › Settings › Bucket lock rules, o `npx wrangler r2 bucket lock add <bucket>`): impide borrar o sobrescribir objetos durante un plazo. Por ejemplo `daily/` 30 días y `monthly/` 365 días, siempre menor que la regla de borrado del mismo prefijo. Así un token robado no puede borrar las copias. La documentación de Cloudflare no dice en qué planes está: si el panel no muestra la tarjeta «Bucket lock rules», el plan no lo incluye.
4. **Token de R2** (R2 › Manage API tokens): permiso **Object Read & Write**, limitado a ese único bucket. R2 no ofrece un permiso de solo escritura: lo más estrecho es lectura y escritura sobre un bucket. El bloqueo del paso 3 cubre el riesgo de borrado.
5. **Par de llaves de age**, en una máquina de confianza: `age-keygen -o pdepapel-backups.key`. La línea `# public key: age1…` va a `BACKUP_AGE_RECIPIENT`; el archivo es la llave privada.
6. Crear los secretos y variables de la tabla, y luego `BACKUP_ENABLED=true`.
7. Primera corrida a mano: Actions › Database backup › Run workflow. Debe terminar con «subido daily/…» y el objeto debe aparecer en el bucket.

## Restaurar

Para una emergencia, o para revisar datos de una fecha:

1. **Conseguir la copia cifrada:** Cloudflare › R2 › `pdepapel-db-backups` › `daily/` (o `monthly/`) › descargar el `.age` más reciente. O, si es de una corrida manual de hoy, `gh run download <run-id> --repo chrisdev-ui/pdepapel -n db-backup-encrypted -D <carpeta>`.
2. **Sacar la llave privada** del gestor de contraseñas a un archivo temporal 0600, solo para este paso.
3. **Restaurar en una base NUEVA**, nunca encima de producción:

```bash
age --decrypt --identity <llave.txt> railway-<fecha>.sql.gz.age | gunzip | mysql <base-nueva>
```

4. Borrar el archivo temporal de la llave y la base de prueba al terminar.

Volver a poner datos en producción es una escritura en producción: pasa por `npm run prod:write` / `prod:migrate` con aprobación (`pdepapel-admin/AGENTS.md`), nunca por un `mysql` directo.

## Prueba de restauración (mensual)

Repite la comprobación del 2026-10-05: restaurar en un MySQL de borrador y comparar el número exacto de filas de cada tabla con producción.

```bash
cd pdepapel-admin
npm run test:db:up                       # MySQL local de borrador (puerto 3307)
SOURCE_HOST=… SOURCE_PORT=… SOURCE_USER=pdepapel_ro SOURCE_PASSWORD=… SOURCE_NAME=railway \
  bash scripts/backup/restore-test.sh ~/Descargas/railway-<fecha>.sql.gz.age ~/ruta/pdepapel-backups.key
npm run test:db:down
```

Usa la copia diaria más reciente. «OK» quiere decir que están todas las tablas y que ninguna tiene más filas restauradas que en producción. Las tablas que crecieron desde la copia (pedidos, eventos de webhooks) salen como aviso, no como fallo. La base de borrador se borra al terminar.

## Rotación

- **Token de R2:** crear uno nuevo con el mismo alcance, actualizar `BACKUP_R2_ACCESS_KEY_ID` y `BACKUP_R2_SECRET_ACCESS_KEY`, correr el flujo a mano y revocar el viejo.
- **Llave de age:** generar un par nuevo y actualizar `BACKUP_AGE_RECIPIENT`. Guardar la privada vieja hasta que venzan las copias cifradas con ella (400 días para `monthly/`).
- **Usuario de lectura:** si cambia su contraseña en Railway, actualizar `BACKUP_DB_PASSWORD` y el `.env` local.

## Cuidado

- Las copias tienen **datos personales de clientas** (nombres, direcciones, teléfonos). No se descifran en equipos compartidos, y las restauraciones locales se borran al terminar.
- Ningún paso imprime el contenido del volcado ni las credenciales: van en un archivo de opciones 0600 temporal.
- Costo esperado: unos 10 MB al día; 35 diarias más 13 mensuales son menos de 1 GB, dentro de la capa gratuita de R2. En GitHub Actions son unos 5 minutos al día.
