/**
 * Devuelve la portada a las variantes que se quedaron sin ninguna.
 *
 * Contexto: hasta `f318a594`, toda variante de un grupo con fotos propias
 * perdía su `isMain` en cada guardado del grupo. El código ya está corregido
 * —`resolveVariantImages` conserva la marca, el formulario la lee de lo
 * guardado y `withVariantCover` garantiza que siempre quede una—, pero las
 * filas que se guardaron mal siguen mal.
 *
 * Esto arregla **solo lo que no hay que adivinar**: variantes vivas, de un
 * grupo, con **exactamente una foto** que está marcada como no-portada. Con
 * una sola foto la portada es esa y no hay nada que decidir.
 *
 * Las variantes con dos o más fotos sin portada NO se tocan a propósito:
 * ahí habría que adivinar cuál quería Paula, y adivinar es justo el problema
 * que causó esto. Esas salen en una lista aparte para que las elija ella en
 * el panel, que desde el arreglo ya guarda bien.
 *
 * Se ejecuta por la puerta de siempre:
 *
 *   npm run prod:approve -- "poner isMain en la única foto de las variantes de grupo que quedaron sin portada"
 *   npm run prod:write -- scripts/backfill-variant-cover.mjs
 *
 * Sin `--aplicar` no escribe nada y no necesita aprobación: la simulación
 * solo lee, así que corre con el usuario de solo lectura:
 *
 *   node --env-file=.env scripts/backfill-variant-cover.mjs
 *
 * Es idempotente: el filtro exige `isMain: false`, así que una segunda pasada
 * no encuentra nada. Cada fila va en su propia escritura; si una falla, se
 * anota y las demás siguen.
 */
import { PrismaClient } from "@prisma/client";

const APLICAR = process.argv.includes("--aplicar");

/** Las candidatas y las ambiguas, en una sola lectura. */
async function leerEstado(db) {
  const variantes = await db.product.findMany({
    where: { productGroupId: { not: null }, isArchived: false },
    select: {
      id: true,
      name: true,
      sku: true,
      productGroupId: true,
      storeId: true,
      images: { select: { id: true, url: true, isMain: true } },
    },
  });

  const conFotos = variantes.filter((v) => v.images.length > 0);
  const sinPortada = conFotos.filter((v) => !v.images.some((i) => i.isMain));
  return {
    total: variantes.length,
    conFotos: conFotos.length,
    conPortada: conFotos.length - sinPortada.length,
    candidatas: sinPortada.filter((v) => v.images.length === 1),
    ambiguas: sinPortada.filter((v) => v.images.length > 1),
  };
}

const db = APLICAR
  ? (await import("./lib/prod-client.mjs")).createProdClient()
  : new PrismaClient();

try {
  const estado = await leerEstado(db);

  console.log(`variantes vivas en algún grupo : ${estado.total}`);
  console.log(`  con fotos                    : ${estado.conFotos}`);
  console.log(`  ya tienen portada            : ${estado.conPortada}`);
  console.log(`  sin portada, UNA foto        : ${estado.candidatas.length}  <- se arreglan aquí`);
  console.log(`  sin portada, VARIAS fotos    : ${estado.ambiguas.length}  <- no se tocan (hay que elegir)`);

  if (estado.candidatas.length === 0) {
    console.log("\nNo hay nada que arreglar.");
  } else {
    console.log(`\n--- ${APLICAR ? "arreglando" : "[simulación] se arreglaría"} ---`);
    let hechas = 0;
    const fallos = [];

    for (const v of estado.candidatas) {
      const foto = v.images[0];
      const linea = `${(v.sku ?? v.id.slice(0, 8)).padEnd(26)} grupo=${v.productGroupId.slice(0, 8)} ${(v.name ?? "").slice(0, 34).padEnd(34)} ${foto.url}`;
      if (!APLICAR) {
        console.log(`  [simulación] ${linea}`);
        continue;
      }
      try {
        // El `where` lleva `isMain: false`: si alguien la arregló entre la
        // simulación y ahora, esta pasada no la toca.
        const r = await db.image.updateMany({
          where: { id: foto.id, isMain: false },
          data: { isMain: true },
        });
        if (r.count === 1) {
          hechas += 1;
          console.log(`  ✓ ${linea}`);
        } else {
          console.log(`  · ya estaba: ${linea}`);
        }
      } catch (error) {
        fallos.push({ producto: v.id, sku: v.sku, error: String(error?.message ?? error) });
        console.error(`  ✗ ${linea}\n      ${String(error?.message ?? error)}`);
      }
    }

    if (APLICAR) {
      console.log(`\nfotos marcadas como portada: ${hechas} de ${estado.candidatas.length}`);
      if (fallos.length) {
        console.log(`fallos: ${fallos.length}`);
        for (const f of fallos) console.log(`  ${f.sku ?? f.producto}: ${f.error}`);
      } else {
        console.log("fallos: ninguno");
      }
    }
  }

  if (estado.ambiguas.length > 0) {
    console.log(`\n--- para elegir a mano (${estado.ambiguas.length}), agrupadas por grupo ---`);
    const porGrupo = new Map();
    for (const v of estado.ambiguas) {
      if (!porGrupo.has(v.productGroupId)) porGrupo.set(v.productGroupId, []);
      porGrupo.get(v.productGroupId).push(v);
    }
    for (const [grupoId, filas] of porGrupo) {
      const { storeId } = filas[0];
      console.log(`\ngrupo ${grupoId}  (${filas.length} variante(s))`);
      console.log(`  https://admin.papeleriapdepapel.com/${storeId}/productos/grupo/${grupoId}`);
      for (const v of filas) {
        console.log(`    ${(v.sku ?? "—").padEnd(26)} ${String(v.images.length).padStart(2)} fotos  ${(v.name ?? "").slice(0, 44)}  id=${v.id}`);
      }
    }
  }
} finally {
  await db.$disconnect();
}
