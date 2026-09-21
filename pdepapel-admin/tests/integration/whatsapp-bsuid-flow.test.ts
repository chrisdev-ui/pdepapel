import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Una clienta con nombre de usuario, contra la base de verdad.
 *
 * Desde que Meta admite nombres de usuario, a quien tiene uno se le **omite el
 * teléfono** del webhook salvo que haya habido trato en 30 días o esté en la
 * libreta del negocio. Contestarle no basta: lo comprobamos con una
 * conversación de venta de veinte minutos en la que `wa_id` no apareció nunca.
 *
 * Todo el módulo identificaba por teléfono, así que esos eventos se
 * descartaban en silencio: 147 mensajes de 8 contactos, seis conversaciones de
 * venta completas que el panel nunca mostró, respuestas de Paula incluidas.
 *
 * Estas pruebas van contra MySQL porque lo que se arregló vive en las
 * consultas: buscar por BSUID, caer al teléfono, y fusionar cuando resultan
 * ser la misma persona. Un doble no diría nada de eso.
 */

// El bot no se ejecuta aquí: lo que se comprueba es el archivo, no la respuesta.
vi.mock("@/lib/whatsapp/bot", () => ({
  runWhatsAppBot: vi.fn().mockResolvedValue({ outcome: "escalated_no_match" }),
}));

import { processWhatsAppWebhookEvent } from "@/lib/whatsapp/conversation-sync";

const suffix = randomUUID().slice(0, 8);
const BSUID = `CO.${suffix.replace(/\D/g, "") || "9"}246562958392`;
const PHONE = "573001234567";
const WABA = "1449676032671804";

let storeId = "";
let otherStoreId = "";
let connectionId = "";
let otherConnectionId = "";
const eventIds: string[] = [];

const crearEvento = async (
  value: Record<string, unknown>,
  field = "messages",
) => {
  const event = await testPrisma.marketplaceWebhookEvent.create({
    data: {
      connectionId,
      provider: "WHATSAPP",
      eventKey: `evt-${suffix}-${eventIds.length}`,
      topic: field,
      resource: "621067881095773",
      sellerId: WABA,
      payload: { entry: [{ id: WABA, changes: [{ field, value }] }] } as never,
      status: "PENDING",
    },
    select: { id: true },
  });
  eventIds.push(event.id);
  return event.id;
};

/** Un entrante de una clienta con nombre de usuario: sin `wa_id`, sin `from`. */
const entranteSoloBsuid = (
  id: string,
  body: string,
  ts: number,
  bsuid = BSUID,
) => ({
  contacts: [
    { profile: { name: "Eliana", username: "mrs_han14" }, user_id: bsuid },
  ],
  messages: [
    {
      id,
      type: "text",
      text: { body },
      timestamp: String(ts),
      from_user_id: bsuid,
    },
  ],
});

/** Una respuesta de Paula desde su celular: el BSUID viaja en `to_user_id`. */
const ecoSoloBsuid = (id: string, body: string, ts: number, bsuid = BSUID) => ({
  contacts: [{ profile: { username: "mrs_han14" }, user_id: bsuid }],
  message_echoes: [
    {
      id,
      type: "text",
      text: { body },
      timestamp: String(ts),
      from: "573999999999",
      to_user_id: bsuid,
    },
  ],
});

const conversacionesDe = (store: string) =>
  testPrisma.conversation.findMany({
    where: { storeId: store },
    select: {
      id: true,
      phone: true,
      bsuid: true,
      username: true,
      contactName: true,
      lastInboundAt: true,
      lastOwnerAt: true,
      status: true,
    },
  });

describe("conversaciones de WhatsApp sin teléfono (BSUID)", () => {
  beforeAll(async () => {
    await testPrisma.$connect();
    const store = await testPrisma.store.create({
      data: { name: `BSUID ${suffix}`, userId: `user-${suffix}` },
      select: { id: true },
    });
    storeId = store.id;
    const other = await testPrisma.store.create({
      data: { name: `BSUID otra ${suffix}`, userId: `user-otra-${suffix}` },
      select: { id: true },
    });
    otherStoreId = other.id;
    // Sin conexión, `resolveStoreId` cae a la primera tienda de la base y el
    // evento acabaría en la tienda equivocada.
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId, provider: "WHATSAPP", sellerId: WABA },
      select: { id: true },
    });
    connectionId = connection.id;
    const otherConnection = await testPrisma.marketplaceConnection.create({
      data: {
        storeId: otherStoreId,
        provider: "WHATSAPP",
        sellerId: "OTRO-WABA",
      },
      select: { id: true },
    });
    otherConnectionId = otherConnection.id;
  });

  beforeEach(async () => {
    await testPrisma.conversationMessage.deleteMany({
      where: { conversation: { storeId: { in: [storeId, otherStoreId] } } },
    });
    await testPrisma.conversation.deleteMany({
      where: { storeId: { in: [storeId, otherStoreId] } },
    });
  });

  afterAll(async () => {
    await testPrisma.conversationMessage.deleteMany({
      where: { conversation: { storeId: { in: [storeId, otherStoreId] } } },
    });
    await testPrisma.conversation.deleteMany({
      where: { storeId: { in: [storeId, otherStoreId] } },
    });
    await testPrisma.marketplaceWebhookEvent.deleteMany({
      where: { id: { in: eventIds } },
    });
    await testPrisma.marketplaceConnection.deleteMany({
      where: { id: { in: [connectionId, otherConnectionId] } },
    });
    await testPrisma.store.deleteMany({
      where: { id: { in: [storeId, otherStoreId] } },
    });
    await testPrisma.$disconnect();
  });

  /** El caso de Eliana de punta a punta. */
  it("reconstruye la conversación entera aunque `wa_id` no llegue nunca", async () => {
    const guion: Array<[string, Record<string, unknown>]> = [
      ["messages", entranteSoloBsuid("wamid.e1", "Hola", 1789300000)],
      [
        "smb_message_echoes",
        ecoSoloBsuid("wamid.p1", "Hola Eliana", 1789300100),
      ],
      [
        "messages",
        entranteSoloBsuid(
          "wamid.e2",
          "Tienes marcadores acrílicos",
          1789300200,
        ),
      ],
      [
        "smb_message_echoes",
        ecoSoloBsuid("wamid.p2", "Stickers de que tipo buscas?", 1789300300),
      ],
      ["messages", entranteSoloBsuid("wamid.e3", "Y stikers", 1789300400)],
    ];
    for (const [field, value] of guion) {
      const id = await crearEvento(value, field);
      const result = await processWhatsAppWebhookEvent(id);
      expect(result.processed).toBe(true);
    }

    const conversaciones = await conversacionesDe(storeId);
    // Una sola conversación, no cinco ni ninguna.
    expect(conversaciones).toHaveLength(1);
    const [conversacion] = conversaciones;
    expect(conversacion.bsuid).toBe(BSUID);
    expect(conversacion.phone).toBeNull();
    expect(conversacion.contactName).toBe("Eliana");
    // Lo que Paula ve en su celular: `@mrs_han14`. Sin teléfono es lo único
    // con lo que puede reconocerla en la lista.
    expect(conversacion.username).toBe("mrs_han14");

    const mensajes = await testPrisma.conversationMessage.findMany({
      where: { conversationId: conversacion.id },
      orderBy: { createdAt: "asc" },
      select: { body: true, direction: true, sentBy: true },
    });
    expect(mensajes.map((m) => m.body)).toEqual([
      "Hola",
      "Hola Eliana",
      "Tienes marcadores acrílicos",
      "Stickers de que tipo buscas?",
      "Y stikers",
    ]);
    expect(mensajes.map((m) => m.direction)).toEqual([
      "INBOUND",
      "OUTBOUND",
      "INBOUND",
      "OUTBOUND",
      "INBOUND",
    ]);

    // Lo que aparta al bot: sin esto, contestaría encima de Paula.
    expect(conversacion.lastOwnerAt).toEqual(new Date(1789300300 * 1000));
    expect(conversacion.lastInboundAt).toEqual(new Date(1789300400 * 1000));
  });

  it("archiva un eco suelto, sin que la clienta haya escrito antes", async () => {
    const id = await crearEvento(
      ecoSoloBsuid("wamid.solo", "¿Sigues por ahí?", 1789301000),
      "smb_message_echoes",
    );
    await processWhatsAppWebhookEvent(id);

    const [conversacion] = await conversacionesDe(storeId);
    expect(conversacion.bsuid).toBe(BSUID);
    expect(conversacion.lastOwnerAt).toEqual(new Date(1789301000 * 1000));
  });

  it("un estado de entrega encuentra su mensaje aunque no traiga destinatario", async () => {
    const entrada = await crearEvento(
      ecoSoloBsuid("wamid.estado", "Te mando el link", 1789302000),
      "smb_message_echoes",
    );
    await processWhatsAppWebhookEvent(entrada);

    // Los estados se buscan por `wamid`, no por teléfono: sin `recipient_id`
    // deben seguir encontrando su mensaje.
    const estado = await crearEvento(
      { statuses: [{ id: "wamid.estado", status: "read" }] },
      "messages",
    );
    await processWhatsAppWebhookEvent(estado);

    const mensaje = await testPrisma.conversationMessage.findUnique({
      where: { externalId: "wamid.estado" },
      select: { status: true },
    });
    expect(mensaje?.status).toBe("READ");
  });

  /** Lo de Valentinosky: primero sin teléfono, y al rato con él. */
  it("pega el teléfono a la conversación que ya existía, sin duplicarla", async () => {
    const sinTelefono = await crearEvento(
      entranteSoloBsuid("wamid.v1", "Hola", 1789303000),
      "messages",
    );
    await processWhatsAppWebhookEvent(sinTelefono);

    const conTelefono = await crearEvento(
      {
        contacts: [
          { profile: { name: "Valentinosky" }, wa_id: PHONE, user_id: BSUID },
        ],
        messages: [
          {
            id: "wamid.v2",
            type: "text",
            text: { body: "Ahí te va mi número" },
            timestamp: "1789303100",
            from: PHONE,
            from_user_id: BSUID,
          },
        ],
      },
      "messages",
    );
    await processWhatsAppWebhookEvent(conTelefono);

    const conversaciones = await conversacionesDe(storeId);
    expect(conversaciones).toHaveLength(1);
    expect(conversaciones[0].phone).toBe(PHONE);
    expect(conversaciones[0].bsuid).toBe(BSUID);
    const mensajes = await testPrisma.conversationMessage.count({
      where: { conversationId: conversaciones[0].id },
    });
    expect(mensajes).toBe(2);
  });

  it("fusiona las dos filas cuando resultan ser la misma persona", async () => {
    // Una conversación vieja, creada solo por teléfono antes de que
    // supiéramos nada de BSUID.
    const vieja = await testPrisma.conversation.create({
      data: {
        storeId,
        channel: "WHATSAPP",
        phone: PHONE,
        contactName: "Número suelto",
        status: "OPEN",
      },
      select: { id: true },
    });
    await testPrisma.conversationMessage.create({
      data: {
        conversationId: vieja.id,
        direction: "INBOUND",
        sentBy: "CUSTOMER",
        body: "mensaje viejo",
        externalId: "wamid.viejo",
      },
    });

    // Y una nueva por BSUID.
    const soloBsuid = await crearEvento(
      entranteSoloBsuid("wamid.nuevo1", "Hola de nuevo", 1789304000),
      "messages",
    );
    await processWhatsAppWebhookEvent(soloBsuid);
    expect(await conversacionesDe(storeId)).toHaveLength(2);

    // Ahora Meta manda las dos identidades: son la misma persona.
    const ambas = await crearEvento(
      {
        contacts: [{ wa_id: PHONE, user_id: BSUID }],
        messages: [
          {
            id: "wamid.nuevo2",
            type: "text",
            text: { body: "Soy yo" },
            timestamp: "1789304100",
            from: PHONE,
            from_user_id: BSUID,
          },
        ],
      },
      "messages",
    );
    await processWhatsAppWebhookEvent(ambas);

    const conversaciones = await conversacionesDe(storeId);
    expect(conversaciones).toHaveLength(1);
    const [superviviente] = conversaciones;
    expect(superviviente.phone).toBe(PHONE);
    expect(superviviente.bsuid).toBe(BSUID);

    // Y la historia vieja no se perdió en la fusión.
    const cuerpos = await testPrisma.conversationMessage.findMany({
      where: { conversationId: superviviente.id },
      select: { body: true },
    });
    expect(cuerpos.map((c) => c.body).sort()).toEqual([
      "Hola de nuevo",
      "Soy yo",
      "mensaje viejo",
    ]);
  });

  it("un BSUID nunca resuelve a la conversación de otra tienda", async () => {
    const mio = await crearEvento(
      entranteSoloBsuid("wamid.t1", "Hola", 1789305000),
      "messages",
    );
    await processWhatsAppWebhookEvent(mio);

    // El mismo BSUID, pero el evento pertenece a la otra tienda.
    const ajeno = await testPrisma.marketplaceWebhookEvent.create({
      data: {
        connectionId: otherConnectionId,
        provider: "WHATSAPP",
        eventKey: `evt-${suffix}-otra-tienda`,
        topic: "messages",
        resource: "otro-numero",
        sellerId: "OTRO-WABA",
        payload: {
          entry: [
            {
              id: "OTRO-WABA",
              changes: [
                {
                  field: "messages",
                  value: entranteSoloBsuid("wamid.t2", "Hola", 1789305100),
                },
              ],
            },
          ],
        },
        status: "PENDING",
      },
      select: { id: true },
    });
    eventIds.push(ajeno.id);
    await processWhatsAppWebhookEvent(ajeno.id);

    const mias = await conversacionesDe(storeId);
    const ajenas = await conversacionesDe(otherStoreId);
    expect(mias).toHaveLength(1);
    expect(ajenas).toHaveLength(1);
    // Mismo BSUID, dos filas: el único es por tienda, no global.
    expect(mias[0].id).not.toBe(ajenas[0].id);
    expect(mias[0].bsuid).toBe(ajenas[0].bsuid);
  });
});
