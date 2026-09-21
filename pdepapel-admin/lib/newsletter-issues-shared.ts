/**
 * Lo que comparten el panel y el servidor sobre los números del boletín.
 *
 * Vive aparte de `lib/newsletter-issues.ts` porque ese archivo lleva
 * `server-only` y arrastra Prisma: una constante importada desde allí por un
 * componente de cliente rompe el build. Misma lección que
 * `lib/business-growth-sections.ts`.
 */

/** Tope de páginas por número: evita que un envío se vuelva un catálogo. */
export const MAX_ISSUE_PAGES = 12;
