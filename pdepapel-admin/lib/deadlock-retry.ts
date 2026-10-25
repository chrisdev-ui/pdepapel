import { Prisma } from "@prisma/client";

/**
 * Las transacciones corren en Serializable: cada lectura toma un bloqueo
 * compartido, así que dos reservas del mismo producto lo leen las dos y al
 * escribirlo InnoDB mata una por deadlock. Se repite la transacción entera;
 * en el segundo intento la guarda ya ve la unidad tomada y responde 409.
 * También lo usa el cobro (`payment-settlement`): dos pagos del mismo producto
 * a la vez (webhook y conciliación) chocan igual al descontar el stock.
 */
export async function withDeadlockRetry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= attempts || !isDeadlock(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 30)));
    }
  }
}

export function isDeadlock(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2034" || (error.code === "P2010" && String((error.meta as { code?: unknown } | undefined)?.code) === "1213");
}
