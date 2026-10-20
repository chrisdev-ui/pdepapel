import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), connection: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: async () => ["panel@example.com"] }));
vi.mock("@/lib/email-delivery", () => ({ deliverEmails: async (jobs: { send: () => Promise<unknown> }[]) => { for (const job of jobs) await job.send(); } }));
vi.mock("@/lib/prismadb", () => ({ default: { marketplaceConnection: { findUnique: mocks.connection } } }));
// Los avisos solo salen en producción; el resto del entorno, el de las pruebas.
vi.mock("@/lib/env.mjs", () => ({
  env: new Proxy({ NODE_ENV: "production" } as Record<string, unknown>, { get: (target, key: string) => (key in target ? target[key] : process.env[key]) }),
}));

import { notifyMercadoLibreReauthRequired } from "@/lib/mercadolibre/reauth-notice";
import { sendStuckEventsAlert } from "@/lib/whatsapp/recovery";
import { sendWaitingReminder } from "@/lib/whatsapp/waiting-reminder";

import { expectPanelEmail } from "../../helpers/panel-email";

/** Los avisos del panel salen con la plantilla y conservan su texto plano. */
beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ data: { id: "email" }, error: null });
});

describe("avisos del panel con plantilla", () => {
  it("Mercado Libre requiere reconexión: con el botón para reconectar", async () => {
    mocks.connection.mockResolvedValue({ storeId: "store-1" });
    await notifyMercadoLibreReauthRequired("conn-1");
    const sent = mocks.send.mock.calls[0][0];
    const html = await expectPanelEmail(sent, { label: "Panel · Mercado Libre", title: "Reconecta Mercado Libre", text: /Reconéctala desde/ });
    expect(html).toContain("https://admin.papeleriapdepapel.com/store-1/mercadolibre");
  });

  it("mensajes de WhatsApp sin procesar: solo conteos", async () => {
    await sendStuckEventsAlert({ pending: 3, retryOverdue: 1 });
    const sent = mocks.send.mock.calls[0][0];
    const html = await expectPanelEmail(sent, { label: "Panel · WhatsApp", title: "Mensajes de WhatsApp sin procesar", text: /3 pendientes y 1 reintentos/ });
    expect(html).toContain("3 pendientes y 1 reintentos vencidos");
  });

  it("clientas esperando: el enlace a la lista filtrada", async () => {
    await sendWaitingReminder({ storeId: "store-1", count: 2 });
    const sent = mocks.send.mock.calls[0][0];
    const html = await expectPanelEmail(sent, { label: "Panel · WhatsApp", title: "2 clientas te esperan en WhatsApp", text: /Hay 2 conversaciones/ });
    expect(html).toContain("/store-1/conversaciones?esperando=1");
  });
});
