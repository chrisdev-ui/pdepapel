import { NewsletterSubscriberStatus } from "@prisma/client";
import { render } from "@react-email/render";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  candidates: [] as { email: string; name: string; totalSpent: number; totalOrders: number; daysSinceLastPurchase: number }[],
  onSend: null as null | ((to: string) => Promise<void>),
}));
const send = vi.hoisted(() => vi.fn());
vi.mock("@/actions/get-customer-intelligence", () => ({
  findReactivationCandidatesForSystemJob: vi.fn(async () => state.candidates),
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send } } }));

import { GET, POST } from "@/app/api/[storeId]/newsletter/unsubscribe/route";
import { NEWSLETTER_CONSENT_VERSION } from "@/lib/newsletter";
import { normalizeNewsletterEmail } from "@/lib/newsletter-tokens";
import { processAutomaticReactivations } from "@/lib/reactivation";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El correo de reactivación es marketing: lleva el enlace de baja del boletín
 * y los encabezados de baja en un clic (RFC 8058), el enlace da de baja de
 * verdad y quien se dio de baja no lo vuelve a recibir, ni siquiera si la baja
 * llega mientras corre el lote.
 */
let f: InventoryFixture | undefined;

function customer(email: string) {
  return { email, name: "Clienta Prueba", totalSpent: 50000, totalOrders: 2, daysSinceLastPurchase: 90 };
}

async function subscriber(email: string, status: NewsletterSubscriberStatus, withHash = true) {
  return testPrisma.newsletterSubscriber.create({
    data: {
      storeId: f!.store.id,
      email,
      emailNormalized: normalizeNewsletterEmail(email),
      status,
      consentText: "Acepto recibir correos",
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      confirmedAt: new Date(),
      unsubscribedAt: status === NewsletterSubscriberStatus.UNSUBSCRIBED ? new Date() : null,
      unsubscribeTokenHash: withHash ? randomBytes(32).toString("hex") : null,
    },
  });
}

beforeAll(async () => {
  await testPrisma.$connect();
});
beforeEach(() => {
  send.mockReset();
  send.mockImplementation(async ({ to }: { to: string }) => {
    await state.onSend?.(to);
    return { data: { id: "email_test" }, error: null };
  });
  state.onSend = null;
  state.candidates = [];
});
afterEach(async () => {
  if (f) await deleteInventoryFixture(f);
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("baja del correo de reactivación", () => {
  it("lleva el enlace de baja y los encabezados de baja en un clic", async () => {
    f = await createInventoryFixture();
    const active = await subscriber("activa@prueba.test", NewsletterSubscriberStatus.ACTIVE);
    state.candidates = [customer("activa@prueba.test")];

    const result = await processAutomaticReactivations(f.store.id);

    expect(result.processed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    const url = `http://127.0.0.1:3001/api/${f.store.id}/newsletter/unsubscribe?hash=${active.unsubscribeTokenHash}`;
    expect(message.headers).toEqual({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(message.text).toContain(`Cancelar suscripción: ${url}`);
    const html = await render(message.react);
    expect(html).toContain(url.replaceAll("&", "&amp;"));
    expect(html).toContain("cancelar la suscripción");
  });

  it("el enlace da de baja (abrirlo y el POST de un clic) y la clienta no lo vuelve a recibir", async () => {
    f = await createInventoryFixture();
    const opened = await subscriber("abre@prueba.test", NewsletterSubscriberStatus.ACTIVE);
    const oneClick = await subscriber("unclic@prueba.test", NewsletterSubscriberStatus.ACTIVE);
    state.candidates = [customer("abre@prueba.test"), customer("unclic@prueba.test")];
    await processAutomaticReactivations(f.store.id);
    const urls = send.mock.calls.map(([message]) => message.headers["List-Unsubscribe"].slice(1, -1) as string);
    expect(urls).toHaveLength(2);
    const params = { params: { storeId: f.store.id } };

    const response = await GET(new Request(urls[0]), params);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/suscripcion/cancelar?estado=unsubscribed");
    const posted = await POST(
      new Request(urls[1], { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
      params,
    );
    expect(posted.status).toBe(200);
    for (const row of [opened, oneClick]) {
      await expect(testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ status: NewsletterSubscriberStatus.UNSUBSCRIBED });
    }

    // Pasado el plazo de 60 días entre correos, tampoco: se dieron de baja.
    await testPrisma.customerReactivation.deleteMany({ where: { storeId: f.store.id } });
    send.mockClear();
    const again = await processAutomaticReactivations(f.store.id);
    expect(send).not.toHaveBeenCalled();
    expect(again.processed).toBe(0);
  });

  it("no escribe a quien se dio de baja, está suprimida, no tiene enlace de baja o nunca se suscribió", async () => {
    f = await createInventoryFixture();
    await subscriber("baja@prueba.test", NewsletterSubscriberStatus.UNSUBSCRIBED);
    await subscriber("suprimida@prueba.test", NewsletterSubscriberStatus.SUPPRESSED);
    await subscriber("sinenlace@prueba.test", NewsletterSubscriberStatus.ACTIVE, false);
    await subscriber("activa@prueba.test", NewsletterSubscriberStatus.ACTIVE);
    state.candidates = ["baja", "suprimida", "sinenlace", "nunca", "activa"].map((name) => customer(`${name}@prueba.test`));

    await processAutomaticReactivations(f.store.id);

    expect(send.mock.calls.map(([message]) => message.to)).toEqual(["activa@prueba.test"]);
  });

  it("si la baja llega mientras corre el lote, a esa clienta no se le escribe ni se le crea cupón", async () => {
    f = await createInventoryFixture();
    await subscriber("primera@prueba.test", NewsletterSubscriberStatus.ACTIVE);
    const second = await subscriber("segunda@prueba.test", NewsletterSubscriberStatus.ACTIVE);
    state.candidates = [customer("primera@prueba.test"), customer("segunda@prueba.test")];
    state.onSend = async (to) => {
      if (to !== "primera@prueba.test") return;
      const response = await GET(new Request(`http://127.0.0.1:3001/api/${f!.store.id}/newsletter/unsubscribe?hash=${second.unsubscribeTokenHash}`), { params: { storeId: f!.store.id } });
      expect(response.status).toBe(303);
    };

    const result = await processAutomaticReactivations(f.store.id);

    expect(send.mock.calls.map(([message]) => message.to)).toEqual(["primera@prueba.test"]);
    expect(result).toMatchObject({ processed: 1, optedOut: 1 });
    await expect(testPrisma.coupon.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
  });
});
