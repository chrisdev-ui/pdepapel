#!/usr/bin/env bash
# Prueba de restauración (mensual, a mano; docs/runbooks/db-backups.md).
#
# Descifra una copia con la llave PRIVADA de age, la restaura en un MySQL de
# borrador y compara el número exacto de filas de cada tabla contra la base de
# origen (producción, con el usuario de SOLO LECTURA). La base de borrador se
# borra al terminar, pase lo que pase. No imprime datos: solo tablas y conteos.
#
#   RESTORE_* = MySQL de borrador (por defecto, el contenedor local de pruebas)
#   SOURCE_*  = base contra la que se compara (producción en solo lectura)
#   scripts/backup/restore-test.sh <copia.sql.gz.age> <llave-privada-age.txt>
#   RESTORE_TEST_PRINT_ALL=1 … también imprime el conteo de cada tabla.
set -euo pipefail

fail() { echo "restore-test: $*" >&2; exit 1; }
[[ $# -eq 2 ]] || fail "uso: restore-test.sh <copia.sql.gz.age> <llave-privada-age.txt>"
backup="$1"; identity="$2"
[[ -r "$backup" ]] || fail "no puedo leer la copia $backup"
[[ -r "$identity" ]] || fail "no puedo leer la llave $identity"

: "${RESTORE_HOST:=127.0.0.1}" "${RESTORE_PORT:=3307}" "${RESTORE_USER:=root}" "${RESTORE_PASSWORD:=root}"
missing=()
for name in SOURCE_HOST SOURCE_PORT SOURCE_USER SOURCE_PASSWORD SOURCE_NAME; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
((${#missing[@]} == 0)) || fail "faltan variables: ${missing[*]}"
for tool in mysql age gunzip; do command -v "$tool" >/dev/null || fail "falta la herramienta $tool."; done

work="$(mktemp -d)"; chmod 700 "$work"
scratch="restore_check_$(date -u +%Y%m%d%H%M%S)"
( umask 077
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$RESTORE_HOST" "$RESTORE_PORT" "$RESTORE_USER" "$RESTORE_PASSWORD" > "$work/restore.cnf"
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$SOURCE_HOST" "$SOURCE_PORT" "$SOURCE_USER" "$SOURCE_PASSWORD" > "$work/source.cnf" )
cleanup() {
  mysql --defaults-extra-file="$work/restore.cnf" -e "DROP DATABASE IF EXISTS \`$scratch\`" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

mysql --defaults-extra-file="$work/restore.cnf" -e "CREATE DATABASE \`$scratch\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
age --decrypt --identity "$identity" "$backup" | gunzip | mysql --defaults-extra-file="$work/restore.cnf" "$scratch"

counts() { # <cnf> <base>: «tabla<TAB>filas», ordenado
  local cnf="$1" db="$2"
  mysql --defaults-extra-file="$cnf" -N -B -e \
    "SELECT table_name FROM information_schema.tables WHERE table_schema = '$db' AND table_type = 'BASE TABLE' ORDER BY table_name" \
    | while read -r t; do
        printf '%s\t%s\n' "$t" "$(mysql --defaults-extra-file="$cnf" -N -B -e "SELECT COUNT(*) FROM \`$db\`.\`$t\`")"
      done
}
counts "$work/restore.cnf" "$scratch" | LC_ALL=C sort > "$work/restored.tsv"
counts "$work/source.cnf" "$SOURCE_NAME" | LC_ALL=C sort > "$work/source.tsv"

restored_tables="$(wc -l < "$work/restored.tsv" | tr -d ' ')"
source_tables="$(wc -l < "$work/source.tsv" | tr -d ' ')"
restored_rows="$(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$work/restored.tsv")"
echo "restore-test: restauradas $restored_tables tablas y $restored_rows filas (origen: $source_tables tablas)"

# Una tabla que falta o tiene MÁS filas restauradas que en origen es un fallo.
# Menos filas restauradas es normal si el origen siguió recibiendo datos
# después de la copia: se informa, no falla.
status=0
LC_ALL=C join -t $'\t' -a 1 -a 2 -e MISSING -o 0,1.2,2.2 "$work/restored.tsv" "$work/source.tsv" > "$work/joined.tsv"
while IFS=$'\t' read -r table restored source; do
  if [[ "$restored" == MISSING || "$source" == MISSING ]]; then
    echo "restore-test: FALLO $table (restaurada=$restored origen=$source)"; status=1
  elif ((restored > source)); then
    echo "restore-test: FALLO $table tiene más filas restauradas ($restored) que en origen ($source)"; status=1
  elif ((restored < source)); then
    echo "restore-test: aviso $table creció desde la copia ($restored → $source)"
  fi
done < "$work/joined.tsv"
if [[ "${RESTORE_TEST_PRINT_ALL:-}" == "1" ]]; then
  # Solo nombres de tabla y conteos: nunca datos.
  printf 'restore-test: %-40s %12s %12s\n' tabla restaurada origen
  while IFS=$'\t' read -r table restored source; do
    printf 'restore-test: %-40s %12s %12s\n' "$table" "$restored" "$source"
  done < "$work/joined.tsv"
fi
same="$(awk -F'\t' '$2 == $3' "$work/joined.tsv" | wc -l | tr -d ' ')"
echo "restore-test: $same de $source_tables tablas con el mismo número exacto de filas"
((status == 0)) && echo "restore-test: OK" || echo "restore-test: FALLÓ"
exit "$status"
