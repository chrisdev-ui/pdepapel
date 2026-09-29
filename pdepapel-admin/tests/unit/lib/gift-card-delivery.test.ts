import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El correo con el código: a quién va, qué dice, y qué pasa si falla (queda
 * registrado, nunca se guarda el código para reintentar).
 */
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  update: vi.fn(),
  recordFailedNotification: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/prismadb", () => ({ default: { giftCard: { update: mocks.update } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: mocks.recordFailedNotification }));
vi.mock("@/lib/utils", () => ({ currencyFormatter: (value: number) => `$ ${value}` }));

import { deliverGiftCard } from "@/lib/gift-card-delivery";

const card = {
  id: "card-1",
  storeId: "store-1",
  codeLast4: "2R8T",
  balance: 100000,
  initialAmount: 100000,
  purchaseOrderId: "order-1",
  buyerEmail: "luisa@example.com",
  recipientName: "Mariana López",
  recipientEmail: "mariana@example.com",
  message: "¡Feliz cumpleaños!",
} as unknown as Parameters<typeof deliverGiftCard>[0]["card"];

describe("deliverGiftCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mocks.send.mockResolvedValue({ data: { id: "email-1" } });
    mocks.update.mockResolvedValue({});
  });

  it("mails the recipient the code with the buyer's name and stamps deliveredAt", async () => {
    const ok = await deliverGiftCard(
      { card, code: "PDP-7K3M-P9QX-2R8T", deliverTo: "mariana@example.com" },
      { buyerName: "Luisa Sánchez" },
    );
    expect(ok).toBe(true);
    const call = mocks.send.mock.calls[0][0] as { to: string[]; subject: string; text: string; react: ReactElement };
    expect(call.to).toEqual(["mariana@example.com"]);
    expect(call.subject).toBe("Luisa Sánchez te envió una tarjeta de regalo de $ 100000");
    expect(call.text).toContain("Código: PDP-7K3M-P9QX-2R8T");
    const html = (await render(call.react)).replace(/<!--[\s\S]*?-->/g, "");
    expect(html).toContain("PDP-7K3M-P9QX-2R8T");
    expect(html).toContain("Mariana, Luisa Sánchez te regaló $ 100000.");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "card-1" }, data: { deliveredAt: expect.any(Date) } });
  });

  it("speaks to the buyer when the code goes to her own inbox", async () => {
    const ok = await deliverGiftCard(
      { card: { ...card, recipientEmail: null, recipientName: null }, code: "PDP-AAAA-BBBB-CCCC", deliverTo: "luisa@example.com" },
      { buyerName: "Luisa Sánchez" },
    );
    expect(ok).toBe(true);
    const call = mocks.send.mock.calls[0][0] as { to: string[]; subject: string };
    expect(call.to).toEqual(["luisa@example.com"]);
    expect(call.subject).toBe("Tu tarjeta de regalo de $ 100000 está lista");
  });

  it("does nothing without a code or a target", async () => {
    expect(await deliverGiftCard({ card, code: null, deliverTo: "x@example.com" })).toBe(false);
    expect(await deliverGiftCard({ card, code: "PDP-AAAA-BBBB-CCCC", deliverTo: null })).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("records a failed send as gift-card:deliver and never stores the code", async () => {
    mocks.send.mockRejectedValueOnce(new Error("resend down"));
    const ok = await deliverGiftCard({ card, code: "PDP-AAAA-BBBB-CCCC", deliverTo: "mariana@example.com" });
    expect(ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordFailedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "gift-card:deliver", recipient: "mariana@example.com", orderId: "order-1", storeId: "store-1" }),
    );
    const recorded = JSON.stringify(mocks.recordFailedNotification.mock.calls[0][0]);
    expect(recorded).not.toContain("PDP-AAAA-BBBB-CCCC");
  });

  it("labels a reissue", async () => {
    await deliverGiftCard({ card, code: "PDP-AAAA-BBBB-CCCC", deliverTo: "mariana@example.com" }, { reissued: true });
    const call = mocks.send.mock.calls[0][0] as { subject: string };
    expect(call.subject).toBe("Código nuevo para tu tarjeta de regalo de $ 100000");
  });
});
