"use server";

import { auth } from "@clerk/nextjs/server";
import { randomInt } from "node:crypto";

import { BATCH_CODE_ALPHABET } from "@/lib/coupons";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 10;

/** Código aleatorio sin caracteres ambiguos (sin O, 0, I ni 1). */
function generateRandomCode(length = CODE_LENGTH): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += BATCH_CODE_ALPHABET.charAt(randomInt(BATCH_CODE_ALPHABET.length));
  }
  return result;
}

/**
 * Propone un código único para el formulario de cupón. Solo el dueño de la
 * tienda: la acción comprueba la sesión como cualquier ruta del panel.
 */
export async function generateUniqueCouponCode(
  storeId: string,
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Inicia sesión para generar códigos" };
    if (!storeId) return { success: false, error: "Se requiere el ID de la tienda" };
    await verifyStoreOwner(userId, storeId);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const code = generateRandomCode();
      const exists = await prismadb.coupon.findFirst({ where: { storeId, code }, select: { id: true } });
      if (!exists) return { success: true, code };
    }

    return { success: false, error: "No se pudo generar un código único. Intenta de nuevo." };
  } catch (error) {
    console.error("Error generating unique coupon code:", error);
    return { success: false, error: "No fue posible generar el código" };
  }
}
