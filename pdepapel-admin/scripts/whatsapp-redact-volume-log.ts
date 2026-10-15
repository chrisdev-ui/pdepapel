/**
 * Limpieza única: quita el nombre (o teléfono) del contacto que guardaban los
 * avisos de volumen de WhatsApp en `JobRun.detail` («whatsapp-webhook-volume»).
 * Desde ahora el aviso solo lleva cuentas y el id de la conversación. Solo
 * imprime conteos: nunca el texto de la fila.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/whatsapp-redact-volume-log.ts                         # ensayo (solo lectura)
 *   npm run prod:write -- scripts/whatsapp-redact-volume-log.ts --expect new --apply     # escribe
 */
process.env.PRISMA_LOG = "quiet";

async function main() {
  const { default: prismadb } = await import("@/lib/prismadb");
  const { redactVolumeDetail } = await import("@/lib/whatsapp/webhook-volume");
  const apply = process.argv.includes("--apply");
  try {
    const rows = await prismadb.jobRun.findMany({ where: { name: "whatsapp-webhook-volume" }, select: { id: true, detail: true } });
    const changes = rows.map((row) => ({ id: row.id, detail: redactVolumeDetail(row.detail) })).filter((row): row is { id: string; detail: string } => row.detail !== null);
    let updated = 0;
    if (apply) {
      for (const change of changes) {
        await prismadb.jobRun.update({ where: { id: change.id }, data: { detail: change.detail } });
        updated += 1;
      }
    }
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", rows: rows.length, withContact: changes.length, updated }));
  } finally {
    await prismadb.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Falló la limpieza del aviso de volumen:", error instanceof Error ? error.message : "desconocido");
  process.exit(1);
});
export {};
