/**
 * Recupera el atraso de eventos de WhatsApp que nunca se procesaron (la cuota
 * de QStash del 21-sep), con `recoverWhatsAppBacklog`
 * (lib/whatsapp/recovery-backlog.ts): historial viejo, sin bot ni sombra, sin
 * pasar a Paula; los mensajes quedan marcados «Recuperado» en el panel. Solo
 * imprime el resumen en JSON (conteos): ni teléfonos ni texto, ni consultas.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/whatsapp-recover-backlog.ts                                  # ensayo
 *   npm run prod:write -- scripts/whatsapp-recover-backlog.ts --expect new --apply             # escribe
 */
process.env.PRISMA_LOG = "quiet";

async function main() {
  const { recoverWhatsAppBacklog } = await import("@/lib/whatsapp/recovery-backlog");
  const { default: prismadb } = await import("@/lib/prismadb");
  try {
    console.log(JSON.stringify(await recoverWhatsAppBacklog({ apply: process.argv.includes("--apply") })));
  } finally {
    await prismadb.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Falló la recuperación del atraso:", error instanceof Error ? error.message : "desconocido");
  process.exitCode = 1;
});

export {};
