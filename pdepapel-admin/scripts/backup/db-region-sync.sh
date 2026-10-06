#!/usr/bin/env bash
# Copia la base de producción (Railway us-west2) a la base nueva «MySQL US East»
# (us-east4) desde un runner de GitHub: docs/runbooks/db-region-migration.md.
#
#   SYNC_MODE=rehearsal|cutover bash pdepapel-admin/scripts/backup/db-region-sync.sh
#
# Origen: los secretos BACKUP_DB_* (pdepapel_ro, solo lectura). Destino:
# NEW_DB_URL (root en el proxy TCP de la base nueva). Antes de escribir nada
# comprueba que el origen se lea con pdepapel_ro, que el destino sea el host
# esperado (huella SHA-256, el host no se escribe en el repo), que no sea el de
# producción y que tenga la marca migration_meta.target. En modo cutover exige
# además que producción esté en super_read_only y que no quede ninguna
# diferencia de filas. Solo imprime tiempos, conteos y el resultado.
set -euo pipefail

MODE="${SYNC_MODE:-}"
EXPECTED_TARGET_HOST_SHA256="d30d9658bdf10637ceeddba2c9017387660d69a7b4bec4dde98c8a24ffc36b9e"
SOURCE_DB="${BACKUP_DB_NAME:-}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

fail() { echo "ABORTADO: $*" >&2; echo "**Abortado:** $*" >> "$SUMMARY"; exit 1; }
step_time() { echo $(( $(date +%s) - $1 )); }

[[ "$MODE" == "rehearsal" || "$MODE" == "cutover" ]] || fail "SYNC_MODE debe ser rehearsal o cutover"
for name in BACKUP_DB_HOST BACKUP_DB_PORT BACKUP_DB_USER BACKUP_DB_PASSWORD BACKUP_DB_NAME NEW_DB_URL; do
  [[ -n "${!name:-}" ]] || fail "falta el secreto $name"
done

# Destino: se separa la URL sin mostrarla y se enmascara todo lo que sale de ella.
mapfile -t TARGET < <(python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["NEW_DB_URL"])
print(u.hostname or ""); print(u.port or 3306)
print(urllib.parse.unquote(u.username or "")); print(urllib.parse.unquote(u.password or ""))
print((u.path or "/").lstrip("/"))
PY
)
T_HOST="${TARGET[0]}"; T_PORT="${TARGET[1]}"; T_USER="${TARGET[2]}"; T_PASS="${TARGET[3]}"; T_DB="${TARGET[4]}"
for value in "$T_HOST" "$T_PORT" "$T_PASS" "$BACKUP_DB_HOST" "$BACKUP_DB_PORT"; do echo "::add-mask::$value"; done

# Guardas antes de conectarse a nada.
[[ "$BACKUP_DB_USER" == "pdepapel_ro" ]] || fail "el origen no se lee con pdepapel_ro"
[[ "$(printf '%s' "$T_HOST" | sha256sum | cut -d' ' -f1)" == "$EXPECTED_TARGET_HOST_SHA256" ]] || fail "el destino no es el proxy de «MySQL US East»"
[[ "$T_HOST" != "$BACKUP_DB_HOST" ]] || fail "el destino tiene el mismo host que producción"
[[ "$T_DB" == "$SOURCE_DB" ]] || fail "la base de destino no se llama igual que la de origen"

src() { MYSQL_PWD="$BACKUP_DB_PASSWORD" mysql -h "$BACKUP_DB_HOST" -P "$BACKUP_DB_PORT" -u "$BACKUP_DB_USER" --batch -N "$@"; }
dst() { MYSQL_PWD="$T_PASS" mysql -h "$T_HOST" -P "$T_PORT" -u "$T_USER" --batch -N "$@"; }

# Guardas con conexión.
[[ "$(src -e 'SELECT CURRENT_USER()')" == pdepapel_ro@* ]] || fail "el origen no responde como pdepapel_ro"
[[ "$(src -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='migration_meta'")" == "0" ]] || fail "el origen tiene la marca del destino: origen y destino invertidos"
[[ "$(dst -e "SELECT COUNT(*) FROM migration_meta.target WHERE role='db-region-sync-target' AND region='us-east4-eqdc4a'" 2>/dev/null || echo 0)" == "1" ]] || fail "el destino no tiene la marca migration_meta.target"
SOURCE_READ_ONLY="$(src -e 'SELECT @@super_read_only')"
if [[ "$MODE" == "cutover" && "$SOURCE_READ_ONLY" != "1" ]]; then
  fail "modo cutover sin super_read_only en producción"
fi
COLLATION="$(src -e "SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${SOURCE_DB}'")"
CHARSET="$(src -e "SELECT DEFAULT_CHARACTER_SET_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${SOURCE_DB}'")"
echo "Guardas: OK (modo $MODE, producción super_read_only=$SOURCE_READ_ONLY)"
{
  echo "## Sincronización $MODE"
  echo "- Guardas: OK · producción super_read_only=$SOURCE_READ_ONLY"
} >> "$SUMMARY"

T_ALL=$(date +%s)

# 1. Destino limpio: se borra y se recrea el esquema con la misma colación.
T0=$(date +%s)
dst -e "DROP DATABASE IF EXISTS \`${T_DB}\`; CREATE DATABASE \`${T_DB}\` CHARACTER SET ${CHARSET} COLLATE ${COLLATION};"
RESET_S=$(step_time "$T0")

# 2. Volcado y carga en una sola tubería (nada en disco).
T0=$(date +%s)
MYSQL_PWD="$BACKUP_DB_PASSWORD" mysqldump \
  --single-transaction --quick --skip-lock-tables --set-gtid-purged=OFF --hex-blob \
  --no-tablespaces --default-character-set=utf8mb4 --routines --triggers \
  -h "$BACKUP_DB_HOST" -P "$BACKUP_DB_PORT" -u "$BACKUP_DB_USER" "$SOURCE_DB" \
| MYSQL_PWD="$T_PASS" mysql -h "$T_HOST" -P "$T_PORT" -u "$T_USER" --default-character-set=utf8mb4 "$T_DB"
LOAD_S=$(step_time "$T0")

# 3. Verificación: mismas tablas, rutinas y triggers; mismo número de filas.
T0=$(date +%s)
TABLES_SQL="SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
mapfile -t SRC_TABLES < <(src "$SOURCE_DB" -e "$TABLES_SQL")
mapfile -t DST_TABLES < <(dst "$T_DB" -e "$TABLES_SQL")
[[ "${SRC_TABLES[*]}" == "${DST_TABLES[*]}" ]] || fail "las listas de tablas no coinciden (${#SRC_TABLES[@]} en origen, ${#DST_TABLES[@]} en destino)"
COUNT_SQL=""
for t in "${SRC_TABLES[@]}"; do COUNT_SQL+="${COUNT_SQL:+ UNION ALL }SELECT '${t}', COUNT(*) FROM \`${t}\`"; done
src "$SOURCE_DB" -e "$COUNT_SQL" | LC_ALL=C sort > "${RUNNER_TEMP:-/tmp}/src-counts.tsv"
dst "$T_DB" -e "$COUNT_SQL" | LC_ALL=C sort > "${RUNNER_TEMP:-/tmp}/dst-counts.tsv"
OBJ_SQL="SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()), (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE())"
SRC_OBJ="$(src "$SOURCE_DB" -e "$OBJ_SQL")"; DST_OBJ="$(dst "$T_DB" -e "$OBJ_SQL")"
VERIFY_S=$(step_time "$T0")

DIFFS="$(LC_ALL=C join -t $'\t' "${RUNNER_TEMP:-/tmp}/src-counts.tsv" "${RUNNER_TEMP:-/tmp}/dst-counts.tsv" | awk -F'\t' '$2 != $3 { printf "%s: origen=%s destino=%s\n", $1, $2, $3 }')"
DIFF_COUNT=$(printf '%s' "$DIFFS" | grep -c . || true)
TOTAL_S=$(step_time "$T_ALL")

{
  echo "- Tablas: ${#SRC_TABLES[@]} en origen y destino"
  echo "- Rutinas/triggers origen: ${SRC_OBJ//$'\t'//} · destino: ${DST_OBJ//$'\t'//}"
  echo "- Tiempos: limpiar ${RESET_S} s · volcado y carga ${LOAD_S} s · verificación ${VERIFY_S} s · total ${TOTAL_S} s"
  echo "- Tablas con distinto número de filas: ${DIFF_COUNT}"
  [[ -n "$DIFFS" ]] && { echo '```'; echo "$DIFFS"; echo '```'; }
} >> "$SUMMARY"
echo "Tablas: ${#SRC_TABLES[@]} · rutinas/triggers origen ${SRC_OBJ//$'\t'//} destino ${DST_OBJ//$'\t'//}"
echo "Tiempos (s): limpiar ${RESET_S} · volcado+carga ${LOAD_S} · verificación ${VERIFY_S} · total ${TOTAL_S}"
echo "Tablas con distinto número de filas: ${DIFF_COUNT}"
[[ -n "$DIFFS" ]] && echo "$DIFFS"

[[ "$SRC_OBJ" == "$DST_OBJ" ]] || fail "rutinas o triggers distintos"
if [[ "$MODE" == "cutover" && "$DIFF_COUNT" != "0" ]]; then
  fail "modo cutover con ${DIFF_COUNT} tablas distintas"
fi
echo "Resultado: OK"
echo "- **Resultado: OK**" >> "$SUMMARY"
