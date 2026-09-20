import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia de regresión: toda ruta que escriba bajo `/api/[storeId]` y toda
 * acción de servidor con efectos secundarios tiene que comprobar que quien
 * llama es la **dueña** de la tienda. La lectura se abrirá a cuentas de solo
 * lectura (fase 2); la escritura no se abre nunca, así que este archivo falla
 * si alguien añade un POST/PUT/PATCH/DELETE sin el guardia.
 *
 * Las excepciones se listan una por una con su motivo: si una ruta nueva
 * pertenece a la tienda en línea o a un cron, se agrega aquí a propósito y
 * queda a la vista en la revisión.
 */
const ROOT = path.resolve(__dirname, "../..", "..");
const STORE_API = path.join(ROOT, "app", "api", "[storeId]");
// `requireInviter` es más estricto que los demás: exige la lista explícita del
// dueño y, dentro, el mismo `requireStoreOwner`.
const OWNER_GUARDS = ["verifyStoreOwner", "checkIfStoreOwner", "requireStoreOwner", "requireInviter"];
const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];

/** Rutas de escritura bajo `/api/[storeId]` que no usan el guardia, con su motivo. */
const ALLOWED_WITHOUT_OWNER_GUARD: Record<string, string> = {
  // Comprueban la propiedad en línea (`store.findFirst({ id, userId })`) en vez de usar el helper.
  "customers/reactivation/route.ts": "comprueba la propiedad de la tienda en línea",
  "orders/[orderId]/shipping/clear-rate/route.ts": "comprueba la propiedad de la tienda en línea",
  "orders/[orderId]/shipping/create-guide/route.ts": "comprueba la propiedad de la tienda en línea",
  "products/abc-classification/route.ts": "cron con SCHEDULER_SECRET o propiedad comprobada en línea",
  // Tareas programadas: autenticadas con el secreto del cron, sin sesión de Clerk.
  "scheduler/auto-reactivation/route.ts": "cron autenticado con SCHEDULER_SECRET",
  "scheduler/bank-transfers/route.ts": "cron autenticado con SCHEDULER_SECRET",
  // Tienda en línea: las usa la clienta, no el panel. Su autorización es la sesión de la clienta o el token del pedido.
  "account/addresses/[addressId]/route.ts": "cuenta de la clienta en la tienda",
  "account/saved-searches/route.ts": "cuenta de la clienta en la tienda",
  "account/wishlist/route.ts": "cuenta de la clienta en la tienda",
  "bold/checkout/[orderId]/route.ts": "pago de la clienta desde la tienda",
  "checkout/[orderId]/route.ts": "compra de la clienta desde la tienda",
  "coupons/validate/route.ts": "validación de cupón desde la tienda",
  "newsletter/subscriptions/route.ts": "suscripción al boletín desde la tienda",
  "newsletter/unsubscribe/route.ts": "baja del boletín con token, sin sesión",
  "orders/[orderId]/account/route.ts": "reclamo del pedido por la clienta",
  "products/[productId]/reviews/route.ts": "reseña escrita por la clienta",
  "products/[productId]/reviews/[reviewId]/route.ts":
    "la autora edita la suya; borrar lo permite la autora o la dueña, comprobado en línea",
  "shipment/quote/route.ts": "cotización de envío desde la tienda",
};

/** Acciones de servidor con efectos que no acotan por tienda, con su motivo. */
const ALLOWED_ACTIONS_WITHOUT_OWNER_GUARD: Record<string, string> = {
  "actions/cleanup-images.ts": "borra imágenes huérfanas en Cloudinary, no toca la base; exige sesión con tienda propia",
};

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function hasOwnerGuard(source: string): boolean {
  return OWNER_GUARDS.some((guard) => source.includes(`${guard}(`));
}

function mutatingHandlers(source: string): string[] {
  return MUTATING.filter((method) => new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source));
}

describe("toda escritura del panel comprueba la propiedad de la tienda", () => {
  const routes = walk(STORE_API).filter((file) => file.endsWith("route.ts"));

  it("encuentra las rutas de la API de la tienda", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it("ninguna ruta de escritura se queda sin guardia", () => {
    const unguarded: string[] = [];
    for (const file of routes) {
      const relative = path.relative(STORE_API, file);
      const source = readFileSync(file, "utf8");
      const methods = mutatingHandlers(source);
      if (methods.length === 0) continue;
      if (hasOwnerGuard(source)) continue;
      if (ALLOWED_WITHOUT_OWNER_GUARD[relative]) continue;
      unguarded.push(`${relative} (${methods.join(", ")})`);
    }
    expect(unguarded).toEqual([]);
  });

  it("cada excepción sigue existiendo y sigue sin usar el guardia", () => {
    for (const [relative, reason] of Object.entries(ALLOWED_WITHOUT_OWNER_GUARD)) {
      const file = path.join(STORE_API, relative);
      const source = readFileSync(file, "utf8");
      expect(mutatingHandlers(source).length, `${relative} ya no escribe: quítala de la lista`).toBeGreaterThan(0);
      expect(hasOwnerGuard(source), `${relative} ya usa el guardia: quítala de la lista (${reason})`).toBe(false);
    }
  });

  it("toda acción de servidor que escribe en la base comprueba la propiedad", () => {
    const actionFiles = [...walk(path.join(ROOT, "actions")), ...walk(path.join(ROOT, "app"))].filter((file) =>
      file.endsWith(".ts") || file.endsWith(".tsx"),
    );
    const writes = /prismadb?\.[\w.]*\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw/;
    const unguarded: string[] = [];
    for (const file of actionFiles) {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use server["']/.test(source)) continue;
      if (!writes.test(source)) continue;
      const relative = path.relative(ROOT, file);
      if (hasOwnerGuard(source)) continue;
      if (ALLOWED_ACTIONS_WITHOUT_OWNER_GUARD[relative]) continue;
      unguarded.push(relative);
    }
    expect(unguarded).toEqual([]);
  });
});
