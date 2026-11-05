#!/usr/bin/env bash
# Paso «Ignored Build Step» de Vercel para los dos proyectos del monorepo
# (`ignoreCommand` en pdepapel-store/vercel.json y pdepapel-admin/vercel.json).
# Vercel lo corre dentro de la carpeta raíz de cada proyecto.
#
#   exit 0 → NO se compila (no cambió nada que llegue al build)
#   exit 1 → se compila
#
# Ante cualquier duda compila: sin commit base, si el base no se puede traer,
# o si cambió cualquier archivo de la carpeta del proyecto fuera de la lista
# de abajo (package.json, lockfile, next.config, vercel.json, prisma/,
# public/, app/, lib/, tipos de env…). Solo mira la carpeta del proyecto, así
# que un commit que solo toca la tienda no recompila el admin, y viceversa.
#
# Prueba local (sin Vercel):
#   cd pdepapel-store && VERCEL_GIT_PREVIOUS_SHA=<base> IGNORE_BUILD_HEAD=<commit> bash ../ops/vercel-ignore-build.sh
set -u

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
HEAD_REF="${IGNORE_BUILD_HEAD:-HEAD}"
# Cómo llegó el clon, siempre (VERCEL_DEEP_CLONE=true en los dos proyectos desde 2026-11-05: sin él, un base a más de
# 10 commits no está en el clon superficial y se compilaba de más).
echo "ignore-build: base=${BASE:-ninguno} · clon superficial: $(git rev-parse --is-shallow-repository 2>/dev/null) · commits en el clon: $(git rev-list --count HEAD 2>/dev/null)"

if [[ -z "$BASE" ]]; then
  echo "ignore-build: sin despliegue anterior; se compila"
  exit 1
fi
FETCH_ERR=""
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  FETCH_ERR=$(git fetch --depth=100 origin "$BASE" 2>&1 >/dev/null)
fi
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "ignore-build: no se encontró $BASE; se compila"
  # Diagnóstico (2026-11-03: el clon superficial no traía el base y el fetch fallaba en silencio).
  # Solo nombres de remotos y la primera línea del error, sin usuario:clave@ ni cadenas tipo token.
  echo "ignore-build: remotos: $(git remote 2>/dev/null | tr '\n' ' ')· clon superficial: $(git rev-parse --is-shallow-repository 2>/dev/null) · commits en el clon: $(git rev-list --count HEAD 2>/dev/null)"
  if [[ -n "$FETCH_ERR" ]]; then
    echo "ignore-build: fetch: $(printf '%s\n' "$FETCH_ERR" | head -n 1 | sed -E -e 's#([a-z]+://)[^/@[:space:]]*@#\1#g' -e 's#[A-Za-z0-9_-]{30,}#***#g' | cut -c1-200)"
  fi
  exit 1
fi

# Lo que nunca llega al build ni al runtime de la app.
NON_RUNTIME=(
  ':(exclude)docs'
  ':(exclude)ops'
  ':(exclude)scripts'
  ':(exclude)tests'
  ':(exclude)e2e'
  ':(exclude).github'
  ':(exclude)*.md'
  ':(exclude)*.log'
)

if git diff --quiet "$BASE" "$HEAD_REF" -- . "${NON_RUNTIME[@]}"; then
  echo "ignore-build: desde $BASE solo cambiaron documentos, pruebas, scripts u ops (o nada de este proyecto); no se compila"
  exit 0
fi
echo "ignore-build: hay cambios que afectan el build; se compila"
exit 1
