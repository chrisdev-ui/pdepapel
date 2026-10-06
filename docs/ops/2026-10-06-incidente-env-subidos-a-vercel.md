# Incidente: archivos `.env` subidos a Vercel con un deploy desde la CLI (2026-10-06)

## Qué pasó

- Para validar el deploy del corte de la base (docs/runbooks/db-region-migration.md, paso 8), Claude corrió `vercel deploy --prod --skip-domain` desde `pdepapel-admin/`.
- El deploy falló antes de compilar: «The specified Root Directory "pdepapel-admin" does not exist». Al tener el proyecto Root Directory `pdepapel-admin`, la CLI espera la raíz del repo.
- Antes de fallar, la CLI ya había subido el **árbol de trabajo local**: 2980 archivos, 28 MB. No subió lo versionado (1861 archivos), sino lo que hay en disco.
- Sin `.vercelignore`, la CLI solo ignora `.env.local` y `.env.*.local`, no `.env` ni `.env.prod-write`.

**Deploy:** `dpl_4UsGDT3mPDgdSdTQfK5P2SCtvjFQ` (`pdepapel-admin-grdx3aq0j-christian-torres-projects.vercel.app`), en estado Error, nunca promovido y sin tráfico.

**Archivos sensibles que quedaron como código fuente** (revisados solo por nombre, sin abrirlos):

| Archivo | Contenido | Riesgo |
|---|---|---|
| `.env.prod-write` | URL de **root** de la base de producción vieja (Railway us-west2) | Alto mientras esa base exista |
| `.env` | URL de `pdepapel_ro` de la base vieja | Medio (solo lectura) |
| `scripts/cloudinary-monitor/.env` | Credenciales de la API de Cloudinary del monitor diario | Medio |
| `.env.test`, `.env.e2e.example`, `.env.test.example` | Base local de pruebas y ejemplos | Ninguno |

## Alcance

- El código fuente de un deploy solo lo ve el equipo de Vercel (`christian-torres-projects`), no es público.
- No hubo build, ni alias, ni tráfico.

## Contención

- **2026-10-06 19:49:07 UTC:** deploy borrado con `vercel remove pdepapel-admin-grdx3aq0j-christian-torres-projects.vercel.app --yes`, con aprobación de Christian. La API responde 404 y ya no aparece en la lista de deploys.

## Remediación

1. **Regla nueva**, en los tres `AGENTS.md`: nunca `vercel deploy` desde el árbol local. Los deploys van solo por git. Para forzar un build del admin que el Ignored Build Step saltaría, se cambia la línea de `pdepapel-admin/deploy-stamp.txt`, se hace commit y push.
2. **`.vercelignore`** en la raíz y en las dos apps, excluyendo `.env*` (salvo `*.example`) y las carpetas de borradores. Se verifica con un listado de lo que se subiría. Va después del corte de la base (runbook, «Después del corte»).
3. **Credenciales de la base vieja** (`root` y `pdepapel_ro`): se rotan, o se retira la base, lo que ocurra primero. No antes del corte, porque la app usa `root`. Pasos en el runbook.
4. **Llave de Cloudinary del monitor:** la rota Christian en Cloudinary y actualiza `scripts/cloudinary-monitor/.env` en local (pasos en el runbook).
