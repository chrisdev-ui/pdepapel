/**
 * Ventas de la feria Villaterra Halloween (2026-11-01) que se hicieron en papel, fuera del sistema.
 * Paula las anotó a mano (cápsulas y dos productos sueltos a precio normal). La feria ya está
 * cerrada, así que el inventario todavía cuenta esas unidades: aquí se descuentan.
 *
 * - Un MANUAL_ADJUSTMENT por producto, por el mismo camino del ajuste del panel
 *   (`createInventoryMovement`): kardex, stock y sincronización de Mercado Libre. Nunca un UPDATE
 *   directo. Cada producto va en su propia transacción corta.
 * - Reanudable: cada línea lleva `referenceId = villaterra-2026-11-01:<SKU>`. Si ese movimiento ya
 *   existe, la línea se salta, así que una corrida cortada se repite sin descontar dos veces.
 * - Nunca deja stock negativo ni por debajo de lo apartado: esa línea queda como faltante, sin
 *   escribir nada, y se reporta.
 * - Un solo ingreso aproximado en BusinessCashMovement (OTHER_INFLOW), sin separar efectivo y
 *   transferencia: es el total de la feria que reportó Paula.
 * - Las líneas que siguen ambiguas (PENDIENTES) no se ejecutan; solo se listan.
 *
 * Ensayo (no escribe; pdepapel_ro):
 *   npm run prod:write -- --dry-run <ruta>/villaterra-off-system-sales.ts --reason "<motivo>" --expect new
 * Corrida real:
 *   npm run prod:write -- <ruta>/villaterra-off-system-sales.ts --apply --expect new
 *
 * prod-write-models: Product, InventoryMovement, MarketplaceOutboxEvent, BusinessCashMovement
 */
import "./lib/allow-server-only.cjs";

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { createProdClient } from "./lib/prod-client.mjs";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const REFERENCE = "villaterra-2026-11-01";
const REASONS = {
  capsulas: "Venta feria Villaterra fuera de sistema (cápsulas)",
  individual: "Venta feria Villaterra fuera de sistema (individual)",
} as const;
type Channel = keyof typeof REASONS;

/** [SKU, cantidad, canal, lo que escribió Paula] */
const PLAN: [string, number, Channel, string][] = [
  ["POR-ANI-BLA-XS-L-8224", 1, "capsulas", "portacarnet Bob Esponja"],
  ["POR-CIN-AZU-S-L-7503", 1, "capsulas", "portacarnet Cinnamoroll"],
  ["POR-ANI-BLA-XS-L-4493", 1, "capsulas", "portacarnet Dragon Ball"],
  ["PRO-ANI-PAS-S-L-6340", 1, "capsulas", "mug Happy Animals amarillo"],
  ["LEG-ANI-AMA-XS-L-9555", 1, "capsulas", "bloques pato (Psyduck)"],
  ["LEG-ANI-AZU-XS-L-9317", 1, "capsulas", "bloques Calamardo"],
  ["LEG-ANI-NEG-XS-L-4163", 1, "capsulas", "bloques Batman"],
  ["LLA-ANI-AMA-S-L-6178", 1, "capsulas", "llavero Bob Esponja"],
  ["LLA-ANI-AMA-S-L-4879", 1, "capsulas", "llavero Minions"],
  ["CLI-AES-NEG-S-L-2698", 1, "capsulas", "clips gancho retro x4"],
  ["NOT-STI-PAS-XS-L-5205", 1, "capsulas", "notas stitch"],
  ["BOL-GIR-PAS-S-P-4908", 1, "capsulas", "set lapiceros borrables x4"],
  ["BOL-MOD-BLA-S-L-1317", 1, "capsulas", "lapiceros offi pocket x4"],
  ["LEG-OSI-NEG-M-L-1889", 1, "capsulas", "lego panda"],
  ["CAR-SAN-AZU-S-L-8370", 1, "capsulas", "cosmetiquera hangyodon"],
  ["NOT-OSI-PAS-L-L-3998", 1, "capsulas", "notas pippi pandita"],
  ["BOL-GIR-PAS-M-P-5211", 1, "capsulas", "set lapiceros klipp"],
  ["CAR-KAW-PAS-M-L-2764", 1, "capsulas", "cartuchera caja de leche"],
  ["CAR-FLO-AZU-M-L-3075", 2, "capsulas", "carpeta plástica flores azul ×2"],
  ["CAR-SAN-MUL-M-P-2519", 1, "capsulas", "carpeta plástica Sanrio"],
  ["SOB-VAN-AZU-L-L-9909", 1, "capsulas", "carpeta plástica Van Gogh azul"],
  ["BOL-HAL-MOR-XS-L-5690", 3, "capsulas", "lapicero halloween murciélago ×3"],
  ["BOL-HAL-ROS-XS-L-7717", 1, "capsulas", "lapicero halloween rosado Frankenstein"],
  ["AGE-KAW-VER-M-L-5875", 1, "capsulas", "agenda kawaii Happy Dog"],
  ["AGE-KAW-ROS-M-L-2987", 1, "capsulas", "agenda kawaii Honey Peach"],
  ["ACC-AES-BLA-M-L-2755", 1, "capsulas", "scrunchie de encaje lazo"],
  ["NOT-OSI-VER-XS-L-1318", 1, "capsulas", "notas osos panda (Pandita glotones)"],
  ["NOT-OSI-AMA-XS-L-3187", 1, "capsulas", "notas osos miel"],
  ["BOL-INT-ROS-S-L-2859", 1, "capsulas", "lapicero Intensamente Vergüenza"],
  ["BOL-INT-ROJ-S-L-9922", 1, "capsulas", "lapicero Intensamente Furia"],
  ["BOL-INT-VER-S-L-8742", 1, "capsulas", "lapicero Intensamente Envidia"],
  ["BOL-INT-AMA-S-L-3594", 1, "capsulas", "lapicero Intensamente Alegría"],
  ["BOL-INT-AZU-S-L-6803", 1, "capsulas", "lapicero Intensamente Tristeza"],
  ["STI-COM-BLA-M-L-1697", 1, "capsulas", "sticker en relieve comida rápida"],
  ["KIT-KAW-AZU-S-L-1123", 1, "capsulas", "kit kawaii azul"],
  ["KIT-KAW-VER-S-L-7115", 1, "capsulas", "kit kawaii verde"],
  ["CAR-KAW-LIL-S-L-7176", 1, "capsulas", "cartuchera bolsillo mágico lila"],
  ["KIT-GIR-ROS-S-L-6917", 1, "capsulas", "kit básico cuaderno pastel ROSADO"],
  ["REG-KAW-ROS-L-P-1644", 1, "capsulas", "regla kawaii muñequita"],
  ["FOL-KAW-ROS-M-L-6282", 1, "capsulas", "folder tarjetero kawaii rosado"],
  ["CAR-AES-ROS-S-L-9090", 1, "capsulas", "cartuchera wisdom rosada"],
  ["LLA-ANI-AMA-XS-P-1590", 1, "individual", "llavero peluche abejita"],
  ["LIB-ANI-ROS-L-L-EOI7NN", 1, "individual", "rollo de colorear 3 m unicornio"],
];

/**
 * Vendidos sin estar en el sistema: el sistema decía 0 y Paula vendió 1. Primero el conteo (+N, «había N
 * sin registrar») y después la venta (−N), para que el kardex cuente lo que pasó (Christian, 2026-11-03).
 */
const RECOUNT: Record<string, number> = { "LEG-ANI-NEG-XS-L-4163": 1 };
const RECOUNT_REASON = (n: number) => `Conteo físico: había ${n} sin registrar`;

/** Respuestas que todavía no señalan un solo producto: no se ejecutan. */
const PENDING: [string, number, string][] = [
  ["bloques tigre", 1, "no hay «Bloques tigre»; ¿es «Bloques Winnie Pooh y sus amigos» (Tigger), stock 2?"],
  ["llavero Spiderman", 1, "no hay llavero Spiderman; ¿es «Llaveros Super heroes» (stock 3)?"],
  ["mini libreta capibara", 3, "«1+2 argolladas, sencilla»: ¿2 argolladas + 1 sencilla o 1 + 2? El stock (5 y 4) no lo decide"],
  ["monedero capibara", 1, "dos productos: Multicolor $7.000 (stock 2) y Café $16.000 (stock 1)"],
  ["set plumones punta cónica", 1, "dos sets de 12: Primavera $13.000 y KIUT $19.200 (stock 3 cada uno)"],
  ["vasito kawaii x7", 1, "seis colores (lila, negro, azul, rosa, verde, amarillo), stock 5 cada uno"],
  ["carpeta plástica Harry (carta)", 1, "dos tamaño carta con stock: «Mundo Harry Potter #2» y «#3 Gryffindor» (stock 1 cada una)"],
];

const INCOME = {
  amount: 493_500,
  description: "Ventas feria Villaterra fuera de sistema, aproximado (reportado por Paula)",
  occurredAt: new Date("2026-11-01T17:00:00.000Z"),
  notes:
    "Aproximado, reportado por Paula: total de la feria $493.500 (cápsulas y sueltos), efectivo y transferencias sin separar. " +
    "Queda como OTHER_INFLOW mientras el contador decide cómo entra a los reportes tributarios.",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- …/villaterra-off-system-sales.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const { MAX_WAIT_TIME, TIMEOUT_TIME } = await import("@/constants");
  const base = new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME } });
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { createInventoryMovement } = await import("@/lib/inventory");

  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const skus = PLAN.map(([sku]) => sku);
    if (new Set(skus).size !== skus.length) throw new Error("el plan repite un SKU.");

    const products = await db.product.findMany({
      where: { storeId: STORE_ID, sku: { in: skus } },
      select: { id: true, sku: true, name: true, stock: true, reservedUnits: true, isKit: true, isArchived: true },
    });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const done = await db.inventoryMovement.findMany({
      where: { storeId: STORE_ID, type: "MANUAL_ADJUSTMENT", referenceId: { in: skus.map((sku) => `${REFERENCE}:${sku}`) } },
      select: { referenceId: true },
    });
    const doneRefs = new Set(done.map((m) => m.referenceId));

    const recountDone = new Set(
      (
        await db.inventoryMovement.findMany({
          where: { storeId: STORE_ID, type: "MANUAL_ADJUSTMENT", referenceId: { in: Object.keys(RECOUNT).map((sku) => `${REFERENCE}:${sku}:conteo`) } },
          select: { referenceId: true },
        })
      ).map((m) => m.referenceId),
    );
    const pendingRecount = (sku: string) => (recountDone.has(`${REFERENCE}:${sku}:conteo`) ? 0 : RECOUNT[sku] ?? 0);

    const rows = PLAN.map(([sku, qty, channel, paula]) => {
      const p = bySku.get(sku);
      const reserved = Math.max(0, p?.reservedUnits ?? 0);
      const recount = pendingRecount(sku);
      const problem = !p
        ? "no existe el SKU"
        : p.isKit
          ? "es un kit"
          : p.isArchived
            ? "está archivado"
            : doneRefs.has(`${REFERENCE}:${sku}`)
              ? null
              : p.stock + recount - qty < reserved
                ? `faltante: stock ${p.stock}${reserved ? ` (apartado ${reserved})` : ""}, se piden ${qty}`
                : null;
      return {
        sku, qty, channel, paula,
        nombre: p?.name ?? null,
        antes: p?.stock ?? null,
        conteo: recount || undefined,
        despues: p ? p.stock + recount - qty : null,
        apartado: reserved,
        estado: doneRefs.has(`${REFERENCE}:${sku}`) ? "ya aplicado" : problem ? "faltante" : "por aplicar",
        problema: problem,
      };
    });
    const shortfalls = rows.filter((r) => r.estado === "faltante");
    const todo = rows.filter((r) => r.estado === "por aplicar");
    const incomeDone = await db.businessCashMovement.findFirst({ where: { storeId: STORE_ID, reference: REFERENCE, type: "OTHER_INFLOW" }, select: { id: true } });

    const units = (channel: Channel) => rows.filter((r) => r.channel === channel).reduce((s, r) => s + r.qty, 0);
    console.log(JSON.stringify({ lineas: rows, pendientesSinEjecutar: PENDING.map(([linea, cantidad, por]) => ({ linea, cantidad, por })) }, null, 1));
    console.log(
      `Resumen: ${rows.length} productos · cápsulas ${units("capsulas")} u · sueltos ${units("individual")} u · por aplicar ${todo.length} · ya aplicados ${rows.length - todo.length - shortfalls.length} · faltantes ${shortfalls.length} · pendientes sin ejecutar ${PENDING.length} líneas (${PENDING.reduce((s, [, q]) => s + q, 0)} u) · ingreso aproximado $${INCOME.amount.toLocaleString("es-CO")} ${incomeDone ? "(ya registrado)" : "(por registrar)"}`,
    );
    if (shortfalls.length) throw new Error(`no se escribe nada: ${shortfalls.map((r) => `${r.sku} ${r.problema}`).join("; ")}.`);
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    let written = 0;
    const recounts: string[] = [];
    for (const row of todo) {
      const p = bySku.get(row.sku)!;
      // Una transacción corta por producto: si la corrida se corta, la siguiente salta lo hecho.
      const movement = await db.$transaction(async (tx) => {
        const again = await tx.inventoryMovement.findFirst({ where: { storeId: STORE_ID, referenceId: `${REFERENCE}:${row.sku}` }, select: { id: true } });
        if (again) return null;
        const recount = RECOUNT[row.sku] ?? 0;
        if (recount) {
          const counted = await tx.inventoryMovement.findFirst({ where: { storeId: STORE_ID, referenceId: `${REFERENCE}:${row.sku}:conteo` }, select: { id: true } });
          if (!counted) {
            recounts.push(row.sku);
            await createInventoryMovement(tx, {
              storeId: STORE_ID,
              productId: p.id,
              type: "MANUAL_ADJUSTMENT",
              quantity: recount,
              reason: RECOUNT_REASON(recount),
              description: `Feria Villaterra Halloween 2026-11-01: el sistema tenía 0 y se vendió ${recount}.`,
              referenceId: `${REFERENCE}:${row.sku}:conteo`,
              createdBy: "SYSTEM",
            });
          }
        }
        const fresh = await tx.product.findUniqueOrThrow({ where: { id: p.id }, select: { stock: true, reservedUnits: true } });
        if (fresh.stock - row.qty < Math.max(0, fresh.reservedUnits ?? 0)) throw new Error(`${row.sku}: el stock cambió (${fresh.stock}); no alcanza para ${row.qty}.`);
        return createInventoryMovement(tx, {
          storeId: STORE_ID,
          productId: p.id,
          type: "MANUAL_ADJUSTMENT",
          quantity: -row.qty,
          reason: REASONS[row.channel],
          description: `Feria Villaterra Halloween 2026-11-01, venta anotada en papel: ${row.paula}.`,
          referenceId: `${REFERENCE}:${row.sku}`,
          createdBy: "SYSTEM",
        });
      });
      if (movement) written += 1;
    }
    written += recounts.length;
    let incomeId = incomeDone?.id ?? null;
    if (!incomeDone) {
      const created = await db.businessCashMovement.create({
        data: { storeId: STORE_ID, type: "OTHER_INFLOW", amount: INCOME.amount, description: INCOME.description, occurredAt: INCOME.occurredAt, reference: REFERENCE, notes: INCOME.notes, createdBy: "SYSTEM" },
        select: { id: true },
      });
      incomeId = created.id;
      written += 1;
    }
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      `# ${new Date().toISOString()} villaterra-off-system-sales · ${written} filas · ${todo.length} MANUAL_ADJUSTMENT de venta (referenceId ${REFERENCE}:<SKU>)${recounts.length ? ` + conteo +1 en ${recounts.join(", ")} (${REFERENCE}:<SKU>:conteo)` : ""} + ingreso aproximado $${INCOME.amount} ${incomeId} · pendientes sin ejecutar: ${PENDING.map(([l]) => l).join(", ")} · DESHACER con un ajuste contrario por producto desde Inventario y borrando el ingreso desde Negocio; nunca borrando movimientos.\n`,
    );
    console.log(`Aplicado: ${written} filas.`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
