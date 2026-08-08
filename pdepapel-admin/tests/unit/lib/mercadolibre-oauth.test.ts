import { describe, expect, it, vi } from "vitest";

import {
  createMercadoLibreAuthorizationUrl,
  exchangeMercadoLibreAuthorizationCode,
  getMercadoLibreProfile,
} from "@/lib/mercadolibre/oauth";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  oauthRedirectUri:
    "https://admin.papeleriapdepapel.com/api/integrations/mercadolibre/callback",
  tokenEncryptionKey: "unused-by-this-test",
};

describe("Mercado Libre OAuth", () => {
  it("builds an authorization URL with a state and exact callback", () => {
    const url = new URL(
      createMercadoLibreAuthorizationUrl(config, "random-state"),
    );

    expect(url.origin).toBe("https://auth.mercadolibre.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("random-state");
    expect(url.searchParams.get("redirect_uri")).toBe(config.oauthRedirectUri);
  });

  it("exchanges the authorization code using a server-side form request", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 21_600,
        }),
        { status: 200 },
      ),
    );

    await expect(
      exchangeMercadoLibreAuthorizationCode(
        config,
        "authorization-code",
        request,
      ),
    ).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresInSeconds: 21_600,
    });

    expect(request).toHaveBeenCalledWith(
      "https://api.mercadolibre.com/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("normalizes the authenticated seller profile", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: 12345, site_id: "MCO", nickname: "P de Papel" }),
        ),
      );

    await expect(
      getMercadoLibreProfile("access-token", request),
    ).resolves.toEqual({
      id: "12345",
      siteId: "MCO",
      nickname: "P de Papel",
    });
  });
});
