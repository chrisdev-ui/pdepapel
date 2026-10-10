import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  canApprove: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/whatsapp/bot-approval", () => ({ canApproveBotReplies: mocks.canApprove }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    storeSettings: { upsert: mocks.upsert, findUnique: mocks.findUnique, update: mocks.update },
  },
}));

import { DELETE, POST } from "@/app/api/[storeId]/bot-casual/approve/route";
import { CASUAL_TEMPLATES_VERSION } from "@/lib/whatsapp/bot-casual";

const params = { params: { storeId: "store-1" } };

describe("aprobación de las respuestas de cortesía", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.auth.mockResolvedValue({ userId: "paula" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.canApprove.mockReturnValue(true);
    mocks.upsert.mockImplementation(async ({ update }) => update);
    mocks.findUnique.mockResolvedValue({ id: "s1" });
    mocks.update.mockImplementation(async ({ data }) => data);
  });

  it("aprobar guarda quién, cuándo y la versión actual de los textos", async () => {
    const response = await POST(new Request("https://x"), params);
    expect(response.status).toBe(200);
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({
      botCasualApprovedBy: "paula",
      botCasualVersion: CASUAL_TEMPLATES_VERSION,
    });
    expect(mocks.upsert.mock.calls[0][0].update.botCasualApprovedAt).toBeInstanceOf(Date);
  });

  it("quien no puede aprobar respuestas del bot no aprueba nada", async () => {
    mocks.canApprove.mockReturnValue(false);
    const response = await POST(new Request("https://x"), params);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("retirar deja las tres columnas vacías", async () => {
    await DELETE(new Request("https://x"), params);
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      botCasualApprovedAt: null,
      botCasualApprovedBy: null,
      botCasualVersion: null,
    });
  });
});
