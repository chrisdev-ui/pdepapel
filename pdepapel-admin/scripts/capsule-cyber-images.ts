/**
 * Fotos de los 8 combos «Cápsula sorpresa Cyber xN» (2026-11-04): solo imágenes. No toca precio, stock, nombre,
 * descripción, kit, la unidad compartida, categoría ni visibilidad.
 *
 * Por el mismo camino que una foto subida desde el panel:
 * - Subida: el widget del panel (`components/ui/image-upload.tsx`) sube sin firmar con el preset `u0dp1v1y` a la nube
 *   `dsogxa0hj`; en producción sin carpeta (la carpeta `development/` es solo local) y con el id que asigna Cloudinary.
 *   Aquí: el mismo POST sin firmar (sin secretos). Las fotos son de 1254 px, por debajo del tope de 2000 px del widget.
 * - Fila: `replaceOwnPhotos` (`lib/variant-gallery.ts`), lo que hace el guardado de la ficha de un producto sin grupo:
 *   `Image` con `origin: OWN` y la foto como portada (`isMain`).
 *
 * Un producto por paso. Reanudable sin duplicar: cada subida se anota en `outputs/capsulas-cyber/uploads.json`
 * (url y public_id) antes de escribir la fila; una corrida nueva reutiliza esa url en vez de volver a subir. Un
 * combo que ya tiene alguna foto se salta.
 *
 * Ensayo (no sube ni escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/capsule-cyber-images.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/capsule-cyber-images.ts --apply --expect new
 * Ensayo local (base de pruebas, sin Cloudinary): `--fake-upload` usa una url de prueba y solo corre contra pdepapel_test.
 *
 * prod-write-models: Image
 */
import "./lib/allow-server-only.cjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";

import type { PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

/** Una sola copia de @prisma/client: la del checkout donde corre (regla de AGENTS.md, 2026-11-04). */
const prismaRuntime = createRequire(`${process.cwd()}/package.json`)("@prisma/client") as typeof import("@prisma/client");

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const CLOUD_NAME = "dsogxa0hj";
const UPLOAD_PRESET = "u0dp1v1y";
const SIZES = [5, 6, 7, 8, 9, 10, 12, 15];
const SOURCE_DIR = resolve(process.cwd(), "..", "outputs", "capsulas-cyber");
/** El ensayo con `--fake-upload` anota aparte: una url de prueba nunca debe llegar al registro real. */
const LEDGER = resolve(SOURCE_DIR, process.argv.includes("--fake-upload") ? "uploads-ensayo.json" : "uploads.json");

type Ledger = Record<string, { url: string; publicId: string; uploadedAt: string }>;

function pngSize(file: string) {
  const header = readFileSync(file).subarray(0, 24);
  if (header.toString("ascii", 1, 4) !== "PNG") throw new Error(`${basename(file)} no es PNG`);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

async function uploadUnsigned(file: string): Promise<{ url: string; publicId: string }> {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: "image/png" }), basename(file));
  form.append("upload_preset", UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: form });
  const body = (await response.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } };
  if (!response.ok || !body.secure_url || !body.public_id) throw new Error(`Cloudinary ${response.status}: ${body.error?.message ?? "sin secure_url"}`);
  return { url: body.secure_url, publicId: body.public_id };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fakeUpload = process.argv.includes("--fake-upload");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/capsule-cyber-images.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");
  if (fakeUpload && !/pdepapel_test$/.test(process.env.DATABASE_URL ?? "")) throw new Error("--fake-upload es solo para la base de pruebas local.");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new prismaRuntime.PrismaClient({ transactionOptions: { isolationLevel: prismaRuntime.Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { replaceOwnPhotos } = await import("@/lib/variant-gallery");
  if (typeof replaceOwnPhotos !== "function") throw new Error("el checkout principal no tiene replaceOwnPhotos: actualízalo antes de correr.");

  try {
    if (!viaProdWrite && !fakeUpload) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      if (!user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const ledger: Ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};

    const plan = [];
    for (const n of SIZES) {
      const slug = `capsula-sorpresa-x${n}`;
      const file = resolve(SOURCE_DIR, `x${n}.png`);
      if (!existsSync(file)) throw new Error(`falta ${file}`);
      const rows = await db.product.findMany({
        where: { storeId: STORE_ID, slug },
        select: { id: true, name: true, productGroupId: true, images: { select: { url: true } } },
      });
      if (rows.length !== 1) throw new Error(`${slug}: ${rows.length} productos con ese slug (debe ser 1); no se hizo nada.`);
      const product = rows[0];
      if (!product.name.startsWith("Cápsula sorpresa Cyber x")) throw new Error(`${slug} no es un combo Cyber («${product.name}»).`);
      if (product.productGroupId) throw new Error(`${slug} está en un grupo: sus fotos van por el grupo.`);
      const recorded = ledger[slug];
      const hasRecorded = recorded && product.images.some((image) => image.url === recorded.url);
      const estado = hasRecorded ? "ya tiene su foto" : product.images.length > 0 ? `se salta: ya tiene ${product.images.length} foto(s)` : recorded ? "ya subida, falta la fila" : "por subir";
      const { width, height } = pngSize(file);
      plan.push({ n, slug, file, productId: product.id, estado, recorded });
      console.log(JSON.stringify({
        slug, producto: product.id, nombre: product.name, fotosHoy: product.images.length, estado,
        archivo: `${basename(file)} (${width}×${height}, ${Math.round(readFileSync(file).length / 1024)} KB)`,
        subida: recorded ? `reutiliza ${recorded.url} (${recorded.publicId})` : `POST sin firmar a ${CLOUD_NAME} con el preset ${UPLOAD_PRESET}, sin carpeta, id asignado por Cloudinary`,
        fila: "Image { productId, url: <secure_url>, origin: OWN, isMain: true } por replaceOwnPhotos",
      }));
    }
    const todo = plan.filter((row) => row.estado === "por subir" || row.estado === "ya subida, falta la fila");
    console.log(`Resumen: ${plan.length} combos · por hacer ${todo.length} · ya listos ${plan.filter((row) => row.estado === "ya tiene su foto").length} · saltados ${plan.filter((row) => row.estado.startsWith("se salta")).length}`);
    if (!apply && !fakeUpload) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    let written = 0;
    for (const row of todo) {
      let upload = row.recorded;
      if (!upload) {
        const started = Date.now();
        const result = fakeUpload ? { url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v1/ensayo-${row.slug}.png`, publicId: `ensayo-${row.slug}` } : await uploadUnsigned(row.file);
        upload = { ...result, uploadedAt: new Date().toISOString() };
        ledger[row.slug] = upload;
        writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
        console.log(`subida ${row.slug}: ${upload.url} (public_id ${upload.publicId}) en ${Date.now() - started} ms`);
      }
      const started = Date.now();
      try {
        await db.$transaction(async (tx) => {
          const current = await tx.image.count({ where: { productId: row.productId } });
          if (current > 0) throw new Error(`${row.slug} ya tiene ${current} foto(s); no se agrega otra.`);
          await replaceOwnPhotos(tx, { productId: row.productId, images: [{ url: upload!.url, isMain: true }] });
        });
        written += 1;
        console.log(`fila ${row.slug}: ok en ${Date.now() - started} ms`);
      } catch (error) {
        console.error(`fila ${row.slug}: FALLÓ en ${Date.now() - started} ms — la foto quedó en Cloudinary como public_id ${upload.publicId} (${upload.url}) y está anotada en ${LEDGER}; la próxima corrida la enlaza sin volver a subir. ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  const code = (error as { code?: string }).code;
  console.error(`ERROR${code ? ` ${code}` : ""}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
