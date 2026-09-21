/**
 * Rescate de las conversaciones que se perdieron antes de que el panel supiera
 * de los BSUID.
 *
 * Meta deja de mandar el teléfono de quien tiene nombre de usuario, y el módulo
 * identificaba todo por teléfono: esos webhooks se descartaron en silencio.
 * Los cuerpos crudos siguen guardados en `MarketplaceWebhookEvent`, así que la
 * historia se puede reconstruir — pero **la retención los borra a los 30 días**.
 *
 * Qué hace: lee esos eventos en orden, los pasa por la ingesta ya corregida y
 * archiva mensajes y ecos. Qué NO hace, a propósito:
 *
 * - **No despierta al bot.** Entra por `fileInboundMessage` / `fileOwnerEcho` y
 *   no por `processWhatsAppWebhookEvent`, así que no le escribe a nadie. Estas
 *   conversaciones son de hace días: contestarlas ahora sería peor que el
 *   silencio.
 * - **No toca el estado de los eventos.** Ya están en PROCESSED y ahí se
 *   quedan; esto no es una reproducción de la cola.
 * - **No inventa nada.** Si un evento no trae identidad, se cuenta como
 *   saltado y se dice cuál.
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-bsuid-conversations.mjs            # ensayo
 *   node --env-file=.env scripts/backfill-bsuid-conversations.mjs --apply    # escribe
 *
 * El modo que escribe va por el envoltorio de escrituras de producción
 * (`npm run prod:write -- scripts/backfill-bsuid-conversations.mjs --apply`).
 */

import { createRequire } from "node:module";

const require = createRequire(process.cwd() + "/package.json");
const { PrismaClient } = require("@prisma/client");

const APPLY = process.argv.includes("--apply");
const db = new PrismaClient();

const BSUID_PATTERN = /^[A-Z]{2}\.\d{6,}$/;
const asString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const asBsuid = (value) => {
  const raw = asString(value);
  return raw && BSUID_PATTERN.test(raw) ? raw : null;
};
const hora = (d) =>
  new Date(new Date(d).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

/** Los mensajes y ecos que un evento trae SOLO con BSUID (los que se perdieron). */
function soloBsuid(payload) {
  const salida = { mensajes: [], ecos: [] };
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      const contacto = (value.contacts ?? [])[0] ?? {};
      const contactoBsuid = asBsuid(contacto.user_id);
      const username = asString(contacto.profile?.username);
      const nombre = asString(contacto.profile?.name);

      for (const m of value.messages ?? []) {
        if (m?.from) continue; // ese sí se archivó en su momento
        const bsuid = asBsuid(m?.from_user_id) ?? contactoBsuid;
        if (!bsuid) continue;
        salida.mensajes.push({ bsuid, username, nombre, raw: m });
      }
      for (const e of value.message_echoes ?? []) {
        if (e?.to) continue;
        const bsuid = asBsuid(e?.to_user_id) ?? contactoBsuid;
        if (!bsuid) continue;
        salida.ecos.push({ bsuid, username, nombre, raw: e });
      }
    }
  }
  return salida;
}

const cuerpo = (m) =>
  asString(m?.text?.body) ?? asString(m?.caption) ?? asString(m?.button?.text) ?? null;
const fecha = (m) => {
  const raw = asString(m?.timestamp);
  if (!raw || !/^\d{9,13}$/.test(raw)) return null;
  return new Date((raw.length > 10 ? Number(raw) / 1000 : Number(raw)) * 1000);
};

async function main() {
  console.log(
    APPLY
      ? "MODO ESCRITURA: esto crea conversaciones y mensajes de verdad.\n"
      : "ENSAYO: no se escribe nada. Usa --apply para hacerlo de verdad.\n",
  );

  const eventos = await db.marketplaceWebhookEvent.findMany({
    where: { provider: "WHATSAPP" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, payload: true, connection: { select: { storeId: true } } },
  });

  const porContacto = new Map();
  let totalMensajes = 0;
  let totalEcos = 0;
  /**
   * BSUID → teléfono, aprendido del corpus entero.
   *
   * Hace falta para no duplicar: de los nueve, uno (Valentinosky) sí mandó su
   * número más tarde y ya tiene conversación. Si se archivaran sus mensajes
   * solo con el BSUID se abriría una segunda conversación para la misma
   * persona. Pasándole también el teléfono, el resolutor encuentra la que ya
   * está y le pega el BSUID, que es lo que habría hecho solo con el siguiente
   * mensaje que trajera las dos identidades.
   */
  const telefonoDe = new Map();
  for (const evento of eventos) {
    for (const c of (evento.payload?.entry ?? []).flatMap((e) => e?.changes ?? [])) {
      const v = c?.value;
      if (!v) continue;
      const ct = (v.contacts ?? [])[0] ?? {};
      const pares = [];
      if (ct.user_id && ct.wa_id) pares.push([ct.user_id, ct.wa_id]);
      for (const m of v.messages ?? []) if (m?.from_user_id && m?.from) pares.push([m.from_user_id, m.from]);
      for (const e of v.message_echoes ?? []) if (e?.to_user_id && e?.to) pares.push([e.to_user_id, e.to]);
      for (const [b, tel] of pares) {
        const bsuid = asBsuid(b);
        const digits = String(tel).replace(/\D/g, "");
        if (bsuid && digits) telefonoDe.set(bsuid, digits);
      }
    }
  }

  for (const evento of eventos) {
    const { mensajes, ecos } = soloBsuid(evento.payload);
    if (mensajes.length === 0 && ecos.length === 0) continue;
    const storeId = evento.connection?.storeId ?? null;

    for (const item of [...mensajes, ...ecos]) {
      const entrada = mensajes.includes(item);
      const clave = item.bsuid;
      const actual =
        porContacto.get(clave) ??
        {
          bsuid: clave,
          username: null,
          nombre: null,
          storeId,
          entrantes: 0,
          ecos: 0,
          items: [],
        };
      actual.username ??= item.username;
      actual.nombre ??= item.nombre;
      actual.storeId ??= storeId;
      if (entrada) actual.entrantes++;
      else actual.ecos++;
      actual.items.push({
        entrada,
        eventId: evento.id,
        externalId: asString(item.raw?.id),
        body: cuerpo(item.raw),
        mediaType: asString(item.raw?.type) !== "text" ? asString(item.raw?.type) : null,
        sentAt: fecha(item.raw) ?? evento.createdAt,
      });
      porContacto.set(clave, actual);
      if (entrada) totalMensajes++;
      else totalEcos++;
    }
  }

  const contactos = [...porContacto.values()].sort(
    (a, b) => b.entrantes + b.ecos - (a.entrantes + a.ecos),
  );

  console.log(`eventos de WhatsApp revisados: ${eventos.length}`);
  console.log(
    `a recuperar: ${totalMensajes + totalEcos} mensajes (${totalMensajes} de clientas + ${totalEcos} de Paula) en ${contactos.length} conversaciones\n`,
  );
  console.table(
    contactos.map((c) => ({
      bsuid: c.bsuid,
      usuario: c.username ? `@${c.username}` : "—",
      nombre: c.nombre ?? "—",
      tienda: c.storeId ? c.storeId.slice(0, 8) + "…" : "SIN CONEXIÓN",
      telefono_conocido: telefonoDe.get(c.bsuid) ?? "—",
      de_ella: c.entrantes,
      de_Paula: c.ecos,
    })),
  );

  // Una muestra en orden, para poder juzgar si la historia queda legible.
  const muestra = contactos[0];
  if (muestra) {
    console.log(`\nmuestra — ${muestra.username ? "@" + muestra.username : muestra.bsuid}:`);
    for (const item of muestra.items.slice(0, 8)) {
      const quien = item.entrada ? "ella  " : "Paula ";
      const texto = item.body ?? `(${item.mediaType ?? "sin cuerpo"})`;
      console.log(`  ${hora(item.sentAt)}  ${quien}  ${texto.slice(0, 58)}`);
    }
    if (muestra.items.length > 8) console.log(`  … y ${muestra.items.length - 8} más`);
  }

  const sinTienda = contactos.filter((c) => !c.storeId);
  if (sinTienda.length) {
    console.log(
      `\nATENCIÓN: ${sinTienda.length} contacto(s) vienen de eventos sin conexión; no se sabe a qué tienda van y se omiten.`,
    );
  }

  // Qué ya existe, para no duplicar. Antes de aplicar la migración la columna
  // todavía no está, y el ensayo tiene que poder correrse igual: es
  // precisamente lo que se mira antes de decidir si se aplica.
  let migracionAplicada = true;
  try {
    const yaExisten = await db.conversation.findMany({
      where: { bsuid: { in: contactos.map((c) => c.bsuid) } },
      select: { bsuid: true, id: true },
    });
    if (yaExisten.length) {
      console.log(
        `\n${yaExisten.length} de estas conversaciones YA existen (${yaExisten.map((c) => c.bsuid).join(", ")}); sus mensajes se archivan en la que ya está, sin duplicar.`,
      );
    }
  } catch (error) {
    if (error?.code !== "P2022") throw error;
    migracionAplicada = false;
    console.log(
      "\nLa columna `bsuid` todavía NO existe en esta base: falta aplicar\n" +
        "  prisma/manual-migrations/20260921_add_conversation_bsuid.sql\n" +
        "Sin ella esto no puede escribir nada.",
    );
  }

  if (!APPLY) {
    console.log("\nEnsayo terminado. Nada se escribió.");
    await db.$disconnect();
    return;
  }
  if (!migracionAplicada) {
    console.error("\nNo se escribe nada: la migración no está aplicada.");
    await db.$disconnect();
    process.exit(1);
  }

  const { fileInboundMessage, fileOwnerEcho } = await import(
    "../lib/whatsapp/conversation-sync.ts"
  );
  let escritos = 0;
  for (const contacto of contactos) {
    if (!contacto.storeId) continue;
    for (const item of contacto.items) {
      const comun = {
        externalId: item.externalId,
        // Con teléfono conocido, el resolutor adopta la conversación que ya
        // existe en vez de abrir otra.
        phone: telefonoDe.get(contacto.bsuid) ?? null,
        bsuid: contacto.bsuid,
        username: contacto.username,
        body: item.body,
        mediaType: item.mediaType,
        sentAt: item.sentAt,
      };
      if (item.entrada) {
        await fileInboundMessage(
          contacto.storeId,
          { ...comun, contactName: contacto.nombre, interactiveReplyId: null, metadata: null },
          item.eventId,
        );
      } else {
        await fileOwnerEcho(contacto.storeId, comun, item.eventId);
      }
      escritos++;
    }
  }
  console.log(`\nListo: ${escritos} mensajes archivados.`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
