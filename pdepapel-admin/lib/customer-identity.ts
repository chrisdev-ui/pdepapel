import { createHash } from "node:crypto";

/**
 * Identificador de la ficha de un cliente.
 *
 * En Clientes no existe una fila «cliente»: cada persona se arma agrupando los
 * pedidos que comparten teléfono. El identificador natural era entonces el
 * propio teléfono… y así acababa en la URL de `/clientes/[customerId]`, en el
 * historial del navegador, en los registros del servidor y en cualquier
 * analítica que guarde rutas.
 *
 * Aquí se cambia por una huella estable del teléfono. Se calcula siempre igual,
 * así que los enlaces no se rompen entre despliegues, y va salada con el id de
 * la tienda para que la misma persona no tenga el mismo identificador en dos
 * tiendas.
 *
 * **No es un secreto criptográfico.** Un teléfono son diez dígitos: quien ya
 * tenga el id de la tienda y una lista de números puede comprobar cuál
 * coincide. Lo que esto resuelve es la exposición accidental —historial,
 * registros, analítica—, que es por donde el número se filtraba de verdad; para
 * llegar a estas URLs hay que estar autenticado como la dueña.
 */
export const CUSTOMER_ID_LENGTH = 24;

/** Huella de 24 caracteres hexadecimales; lo que debe traer la URL. */
export const CUSTOMER_ID_PATTERN = /^[0-9a-f]{24}$/;

export function customerIdFromPhone(
  storeId: string,
  normalizedPhone: string,
): string {
  return createHash("sha256")
    .update(`cliente:${storeId}:${normalizedPhone}`)
    .digest("hex")
    .slice(0, CUSTOMER_ID_LENGTH);
}

export function isCustomerId(value: string | null | undefined): boolean {
  return typeof value === "string" && CUSTOMER_ID_PATTERN.test(value);
}
