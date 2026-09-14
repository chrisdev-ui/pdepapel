import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));

import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";

const configured = {
  CHAKRA_API_KEY: "chakra-key",
  CHAKRA_PLUGIN_ID: "plugin-123",
  WHATSAPP_PHONE_NUMBER_ID: "621067881095773",
};

const SEND_URL =
  "https://api.chakrahq.com/v1/ext/plugin/whatsapp/plugin-123/api/v24.0/621067881095773/messages";

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe("sendWhatsAppTextMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to Chakra with bearer auth and returns the wamid", async () => {
    fetchMock.mockResolvedValue(response({ _data: { whatsappMessageId: "wamid.OUT1" } }));

    await expect(
      sendWhatsAppTextMessage("573001234567", "Hola", configured),
    ).resolves.toEqual({ ok: true, externalId: "wamid.OUT1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer chakra-key");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      to: "573001234567",
      type: "text",
      text: { body: "Hola" },
    });
  });

  it("short-circuits without an HTTP call when the credentials are missing", async () => {
    for (const environment of [
      {},
      { CHAKRA_API_KEY: "k" },
      { CHAKRA_PLUGIN_ID: "p" },
      { WHATSAPP_PHONE_NUMBER_ID: "id" },
      { CHAKRA_API_KEY: "  ", CHAKRA_PLUGIN_ID: "p", WHATSAPP_PHONE_NUMBER_ID: "id" },
    ]) {
      await expect(sendWhatsAppTextMessage("573001234567", "Hola", environment)).resolves.toEqual({
        ok: false,
        error: "not configured",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles a Chakra refusal without throwing", async () => {
    fetchMock.mockResolvedValue(
      response(
        { _errors: [{ message: "Connection not routable", code: "connection_not_routable" }] },
        409,
      ),
    );

    await expect(
      sendWhatsAppTextMessage("573001234567", "Hola", configured),
    ).resolves.toEqual({
      ok: false,
      error: "Connection not routable (connection_not_routable)",
      requestId: null,
      fbTraceId: null,
    });
    expect(console.error).toHaveBeenCalledWith(
      "[WHATSAPP_SEND] El envío fue rechazado",
      expect.objectContaining({ error: "Connection not routable (connection_not_routable)" }),
    );
  });

  it("handles a Meta rejection forwarded by Chakra without throwing", async () => {
    fetchMock.mockResolvedValue(
      response(
        {
          _data: {
            error: {
              message: "Message failed to send because more than 24 hours have passed",
              type: "OAuthException",
              code: 131047,
              fbtrace_id: "Az8-abc",
            },
          },
        },
        400,
      ),
    );

    await expect(
      sendWhatsAppTextMessage("573001234567", "Hola", configured),
    ).resolves.toEqual({
      ok: false,
      error: "Message failed to send because more than 24 hours have passed (131047)",
      requestId: null,
      fbTraceId: "Az8-abc",
    });
    expect(console.error).toHaveBeenCalledWith(
      "[WHATSAPP_SEND] El envío fue rechazado",
      expect.objectContaining({ fbTraceId: "Az8-abc" }),
    );
  });

  it("treats a 200 without a wamid as a failure", async () => {
    fetchMock.mockResolvedValue(response({ _data: {} }));

    await expect(
      sendWhatsAppTextMessage("573001234567", "Hola", configured),
    ).resolves.toMatchObject({ ok: false, error: "HTTP 200" });
  });

  it("never throws when the network fails or the body is not JSON", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(
      sendWhatsAppTextMessage("573001234567", "Hola", configured),
    ).resolves.toEqual({ ok: false, error: "socket hang up" });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(
      sendWhatsAppTextMessage("573001234567", "Hola", configured),
    ).resolves.toMatchObject({ ok: false, error: "HTTP 502" });
  });

  it("refuses an empty recipient or body before calling out", async () => {
    await expect(sendWhatsAppTextMessage("", "Hola", configured)).resolves.toMatchObject({ ok: false });
    await expect(sendWhatsAppTextMessage("573001234567", "   ", configured)).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps a very long body instead of letting Chakra reject it", async () => {
    fetchMock.mockResolvedValue(response({ _data: { whatsappMessageId: "wamid.OUT2" } }));

    await sendWhatsAppTextMessage("573001234567", "a".repeat(9000), configured);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text.body).toHaveLength(4096);
  });
});
