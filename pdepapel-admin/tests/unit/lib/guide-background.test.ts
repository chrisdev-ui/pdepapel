import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGuideForOrder: vi.fn(),
  shippingUpdateMany: vi.fn(),
  record: vi.fn(),
  waitUntil: vi.fn(),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: mocks.createGuideForOrder }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: mocks.record }));
vi.mock("@/lib/prismadb", () => ({ default: { shipping: { updateMany: mocks.shippingUpdateMany } } }));

import { createGuideInBackground, createGuideRecordingFailure } from "@/lib/guide-background";

/** Una guía de EnvioClick que no se crea nunca puede pasar en silencio. */
describe("guide creation in the background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.shippingUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("runs through waitUntil", async () => {
    mocks.createGuideForOrder.mockResolvedValue({});
    createGuideInBackground({ orderId: "o1", storeId: "s1", source: "webhook de Bold" });
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    await mocks.waitUntil.mock.calls[0][0];
    expect(mocks.createGuideForOrder).toHaveBeenCalledWith("o1", "s1");
  });

  it("records a failure on the shipping row (shown in the order) and as a GUIDE notification, without retrying", async () => {
    mocks.createGuideForOrder.mockRejectedValue(new Error("EnvioClick: saldo insuficiente"));
    await expect(createGuideRecordingFailure({ orderId: "o1", storeId: "s1", source: "webhook de Wompi" })).resolves.toBe(false);

    expect(mocks.createGuideForOrder).toHaveBeenCalledTimes(1);
    expect(mocks.shippingUpdateMany).toHaveBeenCalledWith({
      where: { orderId: "o1", storeId: "s1", envioClickIdOrder: null },
      data: { guideError: "webhook de Wompi: EnvioClick: saldo insuficiente", guideAttemptedAt: expect.any(Date) },
    });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "GUIDE", kind: "guide:create", orderId: "o1", recipient: null }),
    );
  });

  it("treats an already existing guide as done (repeated webhook)", async () => {
    mocks.createGuideForOrder.mockRejectedValue(new Error("Guide already exists"));
    await expect(createGuideRecordingFailure({ orderId: "o1", storeId: "s1", source: "x" })).resolves.toBe(true);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.shippingUpdateMany).not.toHaveBeenCalled();
  });
});
