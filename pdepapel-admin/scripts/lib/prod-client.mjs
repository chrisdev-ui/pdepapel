/**
 * Cliente Prisma para guiones que escriben en producción bajo `prod-write`.
 *
 * Refleja las guardas de la API: en los modelos del libro mayor (kardex,
 * pedidos, pagos, ventas de Mercado Libre) no se borra ni se modifica nada a
 * menos que el motivo aprobado nombre el modelo. La aprobación llega en
 * `PROD_WRITE_REASON` desde el envoltorio; sin ella el cliente rechaza toda
 * escritura sobre esos modelos.
 *
 *   import { createProdClient } from "./lib/prod-client.mjs";
 *   const db = createProdClient();
 *   await db.product.deleteMany({ where: { id: { in: ids } } });        // pasa
 *   await db.inventoryMovement.deleteMany({ where: { productId } });     // sólo si el motivo dice «kardex» o «InventoryMovement»
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { GUARDED_OPERATIONS, isBlockedLedgerOperation, LEDGER_MODELS } from "./prod-guard.mjs";

export class ProdWriteBlockedError extends Error {
  constructor(model, operation, reason) {
    super(
      `prod-client: ${operation} sobre ${model} bloqueado. Es un modelo del libro mayor y el motivo aprobado no lo nombra («${reason || "sin motivo"}»). Pide una aprobación cuyo motivo diga qué filas de ${model} se tocan y por qué.`,
    );
    this.name = "ProdWriteBlockedError";
  }
}

// Las de `lib/prismadb.ts` (un test las ata a `constants/`): con los 5 s de Prisma un `$transaction(fn)` se agota desde fuera de Vercel (2026-11-01).
export const PROD_TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 30_000,
  timeout: 60_000,
});

function withPanelTransactionDefaults(client) {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return (input, options) =>
        typeof input === "function" ? target.$transaction(input, { ...PROD_TRANSACTION_OPTIONS, ...options }) : target.$transaction(input, options);
    },
  });
}

export function createProdClient({ reason = process.env.PROD_WRITE_REASON, client = new PrismaClient() } = {}) {
  if (process.env.PROD_WRITE_APPROVED !== "1") {
    throw new Error("prod-client: ejecuta el guion con `npm run prod:write -- <guion>`; sin aprobación no hay cliente de escritura.");
  }
  return withPanelTransactionDefaults(client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (isBlockedLedgerOperation({ model, operation, reason })) {
            throw new ProdWriteBlockedError(model, operation, reason);
          }
          return query(args);
        },
      },
    },
  }));
}

export { GUARDED_OPERATIONS, LEDGER_MODELS };
