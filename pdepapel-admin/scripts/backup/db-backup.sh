#!/usr/bin/env bash
# Copia de seguridad lógica de la base de producción (docs/runbooks/db-backups.md).
#
#   mysqldump (usuario de SOLO LECTURA, instantánea consistente)
#     | gzip | age (llave PÚBLICA) → <nombre>.sql.gz.age → R2 (daily/ y, el día 1, monthly/)
#
# Nada sale en claro: el volcado se comprime y se cifra en el mismo tubo, sin
# escribirse antes en disco, y las credenciales viajan en un archivo de
# opciones 0600 (nunca en la línea de comandos ni en el registro).
#
#   scripts/backup/db-backup.sh --check-config   # solo valida variables; no se conecta a nada
#   scripts/backup/db-backup.sh                  # volcado + cifrado + subida
#   BACKUP_UPLOAD=skip scripts/backup/db-backup.sh   # deja el archivo en BACKUP_OUTPUT_DIR (pruebas locales)
set -euo pipefail
umask 077

DB_VARS=(BACKUP_DB_HOST BACKUP_DB_PORT BACKUP_DB_USER BACKUP_DB_PASSWORD BACKUP_DB_NAME BACKUP_AGE_RECIPIENT)
R2_VARS=(BACKUP_R2_ACCOUNT_ID BACKUP_R2_ACCESS_KEY_ID BACKUP_R2_SECRET_ACCESS_KEY BACKUP_R2_BUCKET)
UPLOAD="${BACKUP_UPLOAD:-r2}"

fail() { echo "db-backup: $*" >&2; exit 1; }

missing=()
required=("${DB_VARS[@]}")
[[ "$UPLOAD" == "skip" ]] || required+=("${R2_VARS[@]}")
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if ((${#missing[@]})); then
  fail "faltan variables: ${missing[*]} (ver docs/runbooks/db-backups.md › Secretos)."
fi
[[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || fail "BACKUP_AGE_RECIPIENT no parece una llave pública de age (debe empezar por age1)."
[[ "$UPLOAD" == "r2" || "$UPLOAD" == "skip" ]] || fail "BACKUP_UPLOAD debe ser r2 o skip."

if [[ "${1:-}" == "--check-config" ]]; then
  echo "db-backup: configuración completa (subida: $UPLOAD)."
  exit 0
fi

for tool in mysqldump gzip age awk; do
  command -v "$tool" >/dev/null || fail "falta la herramienta $tool."
done
[[ "$UPLOAD" == "skip" ]] || command -v aws >/dev/null || fail "falta la herramienta aws (AWS CLI)."

work="$(mktemp -d)"
out=""
done_ok=0
# Si algo falla a medias no queda un archivo incompleto que parezca una copia.
trap 'rm -rf "$work"; ((done_ok)) || { [[ -n "$out" ]] && rm -f "$out"; }' EXIT
chmod 700 "$work"
cnf="$work/client.cnf"
( umask 077
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
    "$BACKUP_DB_HOST" "$BACKUP_DB_PORT" "$BACKUP_DB_USER" "$BACKUP_DB_PASSWORD" > "$cnf" )

stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
name="${BACKUP_DB_NAME}-${stamp}.sql.gz.age"
out_dir="${BACKUP_OUTPUT_DIR:-$work}"
mkdir -p "$out_dir"
out="$out_dir/$name"

# Opciones: --single-transaction da una instantánea consistente sin bloquear
# tablas (InnoDB). Sin --routines/--events: la base no tiene ninguno y el
# usuario de lectura (SELECT, SHOW VIEW) no tiene SHOW_ROUTINE. awk deja pasar
# el volcado intacto y anota cuántas tablas tiene y su última línea, para
# comprobar que terminó («-- Dump completed»).
mysqldump --defaults-extra-file="$cnf" \
  --single-transaction --quick --no-tablespaces --skip-lock-tables \
  --set-gtid-purged=OFF --hex-blob --default-character-set=utf8mb4 \
  --triggers "$BACKUP_DB_NAME" \
  | LC_ALL=C awk -v stats="$work/stats" '{ print } /^CREATE TABLE /{ tables++ } { last = $0 } END { print tables + 0 > stats; print last >> stats }' \
  | gzip -9 \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$out"

tables="$(sed -n 1p "$work/stats")"
footer="$(sed -n 2p "$work/stats")"
[[ "$footer" == "-- Dump completed"* ]] || fail "el volcado no terminó (falta «-- Dump completed»); no se sube."
((tables > 0)) || fail "el volcado no tiene tablas; no se sube."
bytes="$(wc -c < "$out" | tr -d ' ')"
sha="$(shasum -a 256 "$out" 2>/dev/null || sha256sum "$out")"
sha="${sha%% *}"
echo "db-backup: $name · $tables tablas · $bytes bytes cifrados · sha256 $sha"

if [[ "$UPLOAD" == "skip" ]]; then
  echo "db-backup: BACKUP_UPLOAD=skip; archivo en $out_dir"
  done_ok=1
  exit 0
fi

export AWS_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
# AWS CLI 2.23+ añade sumas de comprobación nuevas por defecto; con
# «when_required» se comporta como antes con servicios compatibles con S3.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
endpoint="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

keys=("daily/$name")
[[ "$(date -u +%d)" == "01" ]] && keys+=("monthly/$name")
for key in "${keys[@]}"; do
  aws s3 cp "$out" "s3://$BACKUP_R2_BUCKET/$key" --endpoint-url "$endpoint" --only-show-errors \
    --metadata "sha256=$sha,tables=$tables"
  remote="$(aws s3api head-object --bucket "$BACKUP_R2_BUCKET" --key "$key" --endpoint-url "$endpoint" \
    --query ContentLength --output text)"
  [[ "$remote" == "$bytes" ]] || fail "$key quedó con $remote bytes en R2 y se esperaban $bytes."
  echo "db-backup: subido $key ($remote bytes)"
done
done_ok=1
