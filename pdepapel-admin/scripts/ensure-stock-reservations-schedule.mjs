// Crea (o actualiza, por el id fijo) la programación horaria de apartados en QStash.
// Uso: node --env-file=.env --import tsx scripts/ensure-stock-reservations-schedule.mjs
// Imprime el id, el cron y el destino; nunca el token.
const { ensureStockReservationsSchedule } = await import("../lib/stock-reservations-schedule.ts");
console.log(JSON.stringify(await ensureStockReservationsSchedule(), null, 2));
