# Propuestas de esquema del rediseño del panel (2026-09)

Dos cambios de base de datos quedaron fuera del rediseño porque tocan el
esquema de Prisma. **Estado (2026-09-08): ambos están implementados en el
código y en `schema.prisma`, con sus SQL en
`pdepapel-admin/prisma/manual-migrations/20260908_add_review_moderation.sql` y
`20260908_add_attribute_archive.sql`, probados en la base local de Docker y
aplicados en Railway el 2026-09-08 (reseñas primero, luego atributos) con
verificación en `information_schema`.**
El resto del documento conserva la justificación y el detalle de cada cambio.

Ambos cambios son aditivos (columnas nuevas con valor por defecto), así que
no alteran pedidos, pagos, inventario ni catálogo existentes. Como
`relationMode = "prisma"`, no hay claves foráneas: cualquier índice nuevo se
declara a mano.

## 1. Moderación y respuesta de reseñas

**Qué resuelve.** Hoy `Review` solo se puede eliminar. La pestaña Clientes ›
Reseñas necesita ocultar una reseña sin borrarla (por ejemplo, con lenguaje
inadecuado o datos personales) y publicar una respuesta de la tienda, que
también aparece en la ficha del producto.

**Cambios en `Review`** (`prisma/schema.prisma`):

```prisma
model Review {
  // …campos actuales…
  status        ReviewStatus @default(PUBLISHED)
  moderatedAt   DateTime?
  moderatedBy   String?      @db.VarChar(128) // id de Clerk de quien moderó
  moderationNote String?     @db.VarChar(300) // motivo interno, nunca público
  reply         String?      @db.Text         // respuesta pública de la tienda
  repliedAt     DateTime?
  repliedBy     String?      @db.VarChar(128)

  @@index([storeId, status])
  @@index([productId, status])
}

enum ReviewStatus {
  PUBLISHED // visible en la tienda (valor actual implícito)
  HIDDEN    // oculta por la tienda; sigue en el panel
  PENDING   // reservada para una futura aprobación previa; no se usa aún
}
```

**SQL propuesto** (`prisma/manual-migrations/2026MMDD_add_review_moderation.sql`):

```sql
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: las reseñas existentes quedan PUBLISHED y sin respuesta.

ALTER TABLE `Review`
  ADD COLUMN `status` ENUM('PUBLISHED', 'HIDDEN', 'PENDING') NOT NULL DEFAULT 'PUBLISHED' AFTER `comment`,
  ADD COLUMN `moderatedAt` DATETIME(3) NULL AFTER `status`,
  ADD COLUMN `moderatedBy` VARCHAR(128) NULL AFTER `moderatedAt`,
  ADD COLUMN `moderationNote` VARCHAR(300) NULL AFTER `moderatedBy`,
  ADD COLUMN `reply` TEXT NULL AFTER `moderationNote`,
  ADD COLUMN `repliedAt` DATETIME(3) NULL AFTER `reply`,
  ADD COLUMN `repliedBy` VARCHAR(128) NULL AFTER `repliedAt`;

CREATE INDEX `Review_storeId_status_idx` ON `Review`(`storeId`, `status`);
CREATE INDEX `Review_productId_status_idx` ON `Review`(`productId`, `status`);
```

**Qué cambia en el código cuando se apruebe.**

- `app/api/[storeId]/products/[productId]/reviews` (lectura pública): filtrar
  `status: PUBLISHED` y exponer `reply`/`repliedAt`. La tienda en línea
  muestra la respuesta bajo la reseña; las ocultas no se envían.
- Nuevo `PATCH /api/[storeId]/reviews/[reviewId]` (solo dueño de la tienda,
  con `verifyStoreOwner`) con acciones `hide`, `publish`, `reply`, `clearReply`.
  Escribe `moderatedAt/By` o `repliedAt/By` con el `userId` de Clerk.
- Panel: en `resenas/components/columns.tsx` una insignia de estado
  (Publicada / Oculta) y en el menú de fila «Ocultar», «Publicar» y
  «Responder» (diálogo con un `Textarea`). La pestaña suma «Sin responder»
  como contador. Revalidar la ficha del producto tras cada cambio
  (`lib/revalidate-store.ts`).
- Ficha del producto en el panel: bloque «Reseñas» con las mismas acciones.

**Fuera de alcance.** No se propone aprobación previa (`PENDING`) todavía: la
tienda publica al instante hoy y cambiarlo altera la experiencia del cliente;
el valor queda reservado en el enum para no migrar dos veces.

## 2. Archivar atributos (categorías, subcategorías, tamaños, colores, diseños)

**Qué resuelve.** Los atributos solo se pueden eliminar, y eliminar uno con
productos falla o los deja huérfanos. Archivar los retira de los formularios
y de la tienda sin tocar los productos ni el historial de pedidos, igual que
`Product.isArchived`.

**Cambios en el esquema.** Mismo par de columnas en `Type`, `Category`,
`Size`, `Color` y `Design`:

```prisma
  isArchived Boolean   @default(false)
  archivedAt DateTime?

  @@index([storeId, isArchived])
```

**SQL propuesto** (`prisma/manual-migrations/2026MMDD_add_attribute_archive.sql`):

```sql
-- Aplicar en Railway justo antes de desplegar el código que lo usa.
-- Aditivo: todos los atributos existentes quedan activos.

ALTER TABLE `Type`     ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Category` ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Size`     ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Color`    ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `Design`   ADD COLUMN `isArchived` TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN `archivedAt` DATETIME(3) NULL;

CREATE INDEX `Type_storeId_isArchived_idx`     ON `Type`(`storeId`, `isArchived`);
CREATE INDEX `Category_storeId_isArchived_idx` ON `Category`(`storeId`, `isArchived`);
CREATE INDEX `Size_storeId_isArchived_idx`     ON `Size`(`storeId`, `isArchived`);
CREATE INDEX `Color_storeId_isArchived_idx`    ON `Color`(`storeId`, `isArchived`);
CREATE INDEX `Design_storeId_isArchived_idx`   ON `Design`(`storeId`, `isArchived`);
```

**Reglas de negocio.**

- Archivar nunca borra ni cambia productos: los productos que usan el
  atributo lo conservan y siguen vendiéndose; solo deja de ofrecerse para
  productos nuevos y desaparece de los filtros de la tienda.
- Archivar una categoría con productos activos exige mover o archivar esos
  productos primero, o mostrar el aviso «N productos siguen en esta
  categoría»; la tienda en línea no debe dejar una categoría archivada
  alcanzable por su `slug` (responder 404 y conservar el alias para SEO,
  `docs/seguimiento-seo.md`).
- Desarchivar es una acción explícita («Restaurar») que limpia `archivedAt`.

**Qué cambia en el código cuando se apruebe.**

- Lectores públicos (`/api/[storeId]/categories`, `types`, `sizes`,
  `colors`, `designs` y el menú de la tienda): filtrar `isArchived: false`.
- Formularios de producto y grupo: los `Combobox` de atributos solo listan
  activos, pero muestran el valor actual aunque esté archivado (con la marca
  «Archivado») para no romper la edición.
- Panel › Atributos: vista «Archivados» por pestaña, acciones «Archivar» y
  «Restaurar» en el menú de fila y en lote; «Eliminar» queda solo para
  atributos sin productos.
- Feed de Google Merchant y Mercado Libre: no dependen de estos atributos
  para publicar, pero la categoría archivada no debe usarse como `product_type`
  nuevo.

## Orden sugerido

1. Reseñas primero: cambia una sola tabla, no toca la tienda salvo el filtro
   `PUBLISHED`, y desbloquea la pestaña Reseñas completa.
2. Archivar atributos después, con la vista «Archivados» del panel y el
   filtro en los lectores públicos en el mismo despliegue, para que la tienda
   nunca muestre un atributo archivado.
