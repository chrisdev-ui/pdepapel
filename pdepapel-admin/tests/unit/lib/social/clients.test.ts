import { describe, expect, it, vi } from "vitest";

import { describeInstagramConnectError, SocialApiError } from "@/lib/social/errors";
import { createInstagramAdapter, discoverInstagramAccount, fetchInstagramMediaMetrics, GraphClient, usagePauseSeconds } from "@/lib/social/graph";
import { buildTikTokAuthorizeUrl, createTikTokAdapter, exchangeTikTokCode, refreshTikTokTokens, tiktokCodeChallenge } from "@/lib/social/tiktok";

/** Solo respuestas dobladas: ninguna prueba llama a Meta ni a TikTok (la red de las pruebas además está cortada). */
const TOKEN = "EAA-token-de-prueba-que-no-debe-aparecer";
const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });

const caught = async (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error as SocialApiError);

describe("cliente de Instagram", () => {
  it("manda el token como parámetro y ningún error lo lleva, ni la URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }, { status: 400 }));
    const error = await caught(new GraphClient(TOKEN, fetchImpl).get("/me"));
    expect(String((fetchImpl.mock.calls[0][0] as URL).searchParams.get("access_token"))).toBe(TOKEN);
    expect(error).toMatchObject({ kind: "auth", code: "meta_190", status: 400 });
    expect(`${error?.message} ${JSON.stringify(error)}`).not.toMatch(/EAA-token|graph\.facebook|access_token/);
  });

  it("los códigos de límite y un fallo de red", async () => {
    for (const code of [4, 17, 32, 613, 80002]) {
      const error = await caught(new GraphClient(TOKEN, vi.fn().mockResolvedValue(json({ error: { code } }, { status: 400 }))).get("/x"));
      expect(error, String(code)).toMatchObject({ kind: "rate_limit", code: `meta_${code}` });
      expect(error!.retryAfterSeconds).toBeGreaterThanOrEqual(60);
    }
    const network = await caught(new GraphClient(TOKEN, vi.fn().mockRejectedValue(new TypeError(`fetch failed https://graph.facebook.com/?access_token=${TOKEN}`))).get("/x"));
    expect(network).toMatchObject({ kind: "http", code: "network" });
    expect(network!.message).not.toContain(TOKEN);
  });

  it("desde el 80 % de uso no hace otra llamada en la corrida", async () => {
    expect(usagePauseSeconds(new Headers({ "x-app-usage": JSON.stringify({ call_count: 40, total_time: 10, total_cputime: 5 }) }))).toBeNull();
    expect(usagePauseSeconds(new Headers({ "x-business-use-case-usage": JSON.stringify({ "123": [{ call_count: 85, total_time: 10, total_cputime: 5, estimated_time_to_regain_access: 0 }] }) }))).toBe(300);
    expect(usagePauseSeconds(new Headers({ "x-business-use-case-usage": JSON.stringify({ "123": [{ call_count: 100, estimated_time_to_regain_access: 30 }] }) }))).toBe(1800);

    const fetchImpl = vi.fn().mockResolvedValue(json({ id: "1" }, { headers: { "x-app-usage": JSON.stringify({ call_count: 91 }) } }));
    const client = new GraphClient(TOKEN, fetchImpl);
    await client.get("/me");
    expect(await caught(client.get("/me"))).toMatchObject({ kind: "rate_limit", code: "meta_usage" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("insights por tipo; si una métrica no aplica, una por una y se salta la que falla", async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      const metric = url.searchParams.get("metric")!;
      if (metric.includes(",")) return json({ error: { code: 100 } }, { status: 400 });
      if (metric === "reels_skip_rate") return json({ error: { code: 100 } }, { status: 400 });
      return json({ data: [{ name: metric, values: [{ value: metric === "views" ? 1500 : 10 }] }] });
    });
    const values = await fetchInstagramMediaMetrics(new GraphClient(TOKEN, fetchImpl as unknown as typeof fetch), "m1", "REELS");
    expect(values.columns).toMatchObject({ views: 1500, reach: 10, saves: 10, avgWatchTimeMs: 10 });
    expect(values.columns).not.toHaveProperty("skipRate");
    expect(fetchImpl.mock.calls[0][0].searchParams.get("metric")).toContain("ig_reels_avg_watch_time");

    const feed = vi.fn().mockResolvedValue(json({ data: [{ name: "reach", total_value: { value: 33 } }] }));
    await fetchInstagramMediaMetrics(new GraphClient(TOKEN, feed), "m2", "CAROUSEL");
    expect(feed.mock.calls[0][0].searchParams.get("metric")).not.toContain("ig_reels");
    expect(await fetchInstagramMediaMetrics(new GraphClient(TOKEN, feed), "m3", "STORY")).toEqual({ columns: {}, raw: {} });
    expect(feed).toHaveBeenCalledTimes(1);
  });

  it("descubre la cuenta de la página; sin cuenta profesional pide reconectar", async () => {
    const ok = vi.fn().mockResolvedValueOnce(json({ id: "page1", instagram_business_account: { id: "ig1" } })).mockResolvedValueOnce(json({ id: "ig1", username: "papeleria.pdepapel", followers_count: 10 }));
    expect(await discoverInstagramAccount(new GraphClient(TOKEN, ok))).toMatchObject({ externalId: "ig1", username: "papeleria.pdepapel", pageId: "page1" });
    expect(await caught(discoverInstagramAccount(new GraphClient(TOKEN, vi.fn().mockResolvedValue(json({ id: "page1" })))))).toMatchObject({ kind: "auth", code: "meta_no_ig_account" });
    // Lo que respondió Meta en producción el 2026-10-22 con un token de usuario.
    const userToken = vi.fn().mockResolvedValue(json({ error: { message: "(#100) Tried accessing nonexisting field (instagram_business_account)", type: "OAuthException", code: 100 } }, { status: 400 }));
    expect(await caught(discoverInstagramAccount(new GraphClient(TOKEN, userToken)))).toMatchObject({ kind: "auth", code: "meta_not_page_token", status: 400 });
  });

  it("lista publicaciones: miniatura de video o imagen, tipo y cursor solo si hay otra página", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        data: [
          { id: "a", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "https://cdn/t.jpg", media_url: "https://cdn/v.mp4", timestamp: "2026-10-20T10:00:00+0000", caption: "Reel" },
          { id: "b", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", media_url: "https://cdn/c.jpg", timestamp: "2026-10-19T10:00:00+0000" },
        ],
        paging: { cursors: { after: "CUR" }, next: "https://graph.facebook.com/next" },
      }),
    );
    const page = await createInstagramAdapter({ pageToken: TOKEN, igUserId: "ig1", fetchImpl }).listPosts(null);
    expect(page.next).toBe("CUR");
    expect(page.posts.map((post) => [post.externalId, post.productType, post.thumbnailUrl])).toEqual([
      ["a", "REELS", "https://cdn/t.jpg"],
      ["b", "CAROUSEL", "https://cdn/c.jpg"],
    ]);
    const last = await createInstagramAdapter({ pageToken: TOKEN, igUserId: "ig1", fetchImpl: vi.fn().mockResolvedValue(json({ data: [], paging: { cursors: { after: "X" } } })) }).listPosts("CUR");
    expect(last.next).toBeNull();
  });
});

describe("cliente de TikTok", () => {
  const config = { clientKey: "ck", clientSecret: "cs", redirectUri: "https://admin.papeleriapdepapel.com/api/integrations/tiktok/callback", encryptionKey: Buffer.alloc(32, 1) };

  it("URL de autorización: alcances separados por coma, sin PKCE por defecto; con PKCE el reto es SHA-256 hexadecimal", () => {
    const plain = new URL(buildTikTokAuthorizeUrl(config, "st", "verifier"));
    expect(plain.searchParams.get("scope")).toBe("user.info.basic,user.info.stats,video.list");
    expect(plain.searchParams.get("state")).toBe("st");
    expect(plain.searchParams.has("code_challenge")).toBe(false);
    const pkce = new URL(buildTikTokAuthorizeUrl(config, "st", "verifier", true));
    expect(pkce.searchParams.get("code_challenge")).toBe(tiktokCodeChallenge("verifier"));
    expect(tiktokCodeChallenge("verifier")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("canjea el código por formulario y guarda la forma del token; invalid_grant pide reconectar", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: "act.1", refresh_token: "rft.1", open_id: "open1", expires_in: 86400, refresh_expires_in: 31536000, scope: "video.list" }));
    const tokens = await exchangeTikTokCode(config, "code1", "verifier", fetchImpl);
    expect(tokens).toMatchObject({ accessToken: "act.1", refreshToken: "rft.1", openId: "open1", expiresIn: 86400 });
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0][1].body));
    expect(Object.fromEntries(body)).toMatchObject({ client_key: "ck", grant_type: "authorization_code", code: "code1", redirect_uri: config.redirectUri });
    expect(body.has("code_verifier")).toBe(false);

    const error = await caught(refreshTikTokTokens(config, "rft.old", vi.fn().mockResolvedValue(json({ error: "invalid_grant", error_description: "rft.old expired" }, { status: 400 }))));
    expect(error).toMatchObject({ kind: "auth", code: "tiktok_invalid_grant" });
    expect(error!.message).not.toContain("rft.old");
  });

  it("lista videos con sus contadores, el token en Bearer y el cursor si hay más", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ data: { videos: [{ id: "v1", create_time: 1_760_000_000, cover_image_url: "https://p16/c.jpg", share_url: "https://tiktok/v1", title: "", video_description: "Stickers", duration: 21, view_count: 900, like_count: 40, comment_count: 3, share_count: 2 }], cursor: 1_759_000_000_000, has_more: true }, error: { code: "ok" } }),
    );
    const page = await createTikTokAdapter({ getAccessToken: async () => "act.1", fetchImpl }).listPosts(null);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer act.1");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ max_count: 20 });
    expect(page.next).toBe("1759000000000");
    expect(page.posts[0]).toMatchObject({ externalId: "v1", caption: "Stickers", durationSec: 21, thumbnailUrl: "https://p16/c.jpg", metrics: { columns: { views: 900, likes: 40, comments: 3, shares: 2 } } });
  });

  it("429 pide esperar; 401 pide reconectar", async () => {
    const adapter = (response: Response) => createTikTokAdapter({ getAccessToken: async () => "act.1", fetchImpl: vi.fn().mockResolvedValue(response) });
    expect(await caught(adapter(json({ error: { code: "rate_limit_exceeded" } }, { status: 429, headers: { "retry-after": "90" } })).listPosts(null))).toMatchObject({ kind: "rate_limit", retryAfterSeconds: 90 });
    expect(await caught(adapter(json({ error: { code: "access_token_invalid" } }, { status: 401 })).fetchAccount())).toMatchObject({ kind: "auth", code: "tiktok_access_token_invalid" });
  });
});

describe("mensaje al conectar Instagram", () => {
  const error = (kind: SocialApiError["kind"], code: string, status: number | null) => new SocialApiError("INSTAGRAM", kind, code, status);

  it("«no respondió» solo cuando de verdad no respondió (red o 5xx)", () => {
    expect(describeInstagramConnectError(error("http", "network", null))).toMatchObject({ status: 502, message: expect.stringContaining("no respondió") });
    expect(describeInstagramConnectError(error("http", "http_503", 503))).toMatchObject({ status: 502, message: expect.stringContaining("no respondió") });
    for (const rejected of [error("http", "meta_10", 400), error("http", "meta_200", 403), error("invalid_metric", "meta_100", 400)]) {
      const described = describeInstagramConnectError(rejected);
      expect(described.message, rejected.code).not.toContain("no respondió");
      expect(described.message).toContain(`(${rejected.code})`);
      expect(described.message).toContain("instagram_manage_insights");
    }
  });

  it("cada causa del token con su arreglo", () => {
    expect(describeInstagramConnectError(error("auth", "meta_not_page_token", 400))).toMatchObject({ status: 422, message: expect.stringContaining("es de usuario, no de página") });
    expect(describeInstagramConnectError(error("auth", "meta_no_ig_account", null))).toMatchObject({ status: 422, message: expect.stringContaining("no tiene una cuenta profesional") });
    expect(describeInstagramConnectError(error("auth", "meta_190", 400))).toMatchObject({ status: 422, message: expect.stringContaining("vencido o revocado") });
    expect(describeInstagramConnectError(error("rate_limit", "meta_4", 400))).toMatchObject({ status: 503 });
    expect(JSON.stringify(describeInstagramConnectError(error("auth", "meta_190", 400)))).not.toMatch(/EAA|access_token/);
  });
});
