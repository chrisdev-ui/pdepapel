/**
 * Recupera el atraso de eventos de WhatsApp que nunca se procesaron (la cuota
 * de QStash del 21-sep), con `recoverWhatsAppBacklog`
 * (lib/whatsapp/recovery-backlog.ts): historial viejo, sin bot ni sombra, sin
 * pasar a Paula; los mensajes quedan marcados «Recuperado» en el panel. Solo
 * conteos en la salida: ni teléfonos ni texto.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/whatsapp-recover-backlog.ts                                  # ensayo
 *   npm run prod:write -- scripts/whatsapp-recover-backlog.ts --expect new --apply             # escribe
 */
import { recoverWhatsAppBacklog } from "@/lib/whatsapp/recovery-backlog";

recoverWhatsAppBacklog({ apply: process.argv.includes("--apply") })
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error("Falló la recuperación del atraso:", error instanceof Error ? error.message : "desconocido");
    process.exitCode = 1;
  })
  .finally(async () => {
    const { default: prismadb } = await import("@/lib/prismadb");
    await prismadb.$disconnect();
  });
