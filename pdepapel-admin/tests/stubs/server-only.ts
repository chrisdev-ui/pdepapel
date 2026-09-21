/**
 * Sustituto de `server-only` para Vitest.
 *
 * El paquete real lanza en cuanto se importa fuera de un Server Component, lo
 * que impide probar cualquier módulo que lo use. La comprobación de verdad la
 * hace `next build`, que sabe qué acabó en el paquete del navegador; aquí solo
 * hace falta que el import no reviente.
 */
export {};
