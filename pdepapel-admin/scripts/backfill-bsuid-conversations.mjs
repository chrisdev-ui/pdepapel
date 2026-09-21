/**
 * Este guion se mudó a `backfill-bsuid-conversations.ts`.
 *
 * Como `.mjs` no servía: el envoltorio de escrituras corre los `.mjs` con node
 * a secas, y node no puede importar el `.ts` de la ingesta
 * (ERR_UNKNOWN_FILE_EXTENSION). En `.ts` lo corre tsx y el guion reutiliza la
 * ingesta de verdad en vez de copiarla.
 *
 * Se deja este archivo solo para que nadie lo corra por costumbre y crea que no
 * hizo nada. Se puede borrar.
 */
console.error(
  "Este guion ahora es scripts/backfill-bsuid-conversations.ts\n" +
    "  ensayo:  npx tsx --env-file=.env scripts/backfill-bsuid-conversations.ts\n" +
    "  escribir: npm run prod:write -- scripts/backfill-bsuid-conversations.ts --apply",
);
process.exit(1);
