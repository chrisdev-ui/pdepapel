import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
const queue = vi.hoisted(() => ({ enqueued: [] as unknown[] }));
vi.mock("@/lib/social/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social/queue")>()),
  isSocialQueueConfigured: () => true,
  enqueueSocialSync: vi.fn(async (message: unknown) => {
    queue.enqueued.push(message);
    return true;
  }),
}));

import { GET as curveGET } from "@/app/api/[storeId]/social/posts/[postId]/route";
import { PUT as earlyAlertPUT } from "@/app/api/[storeId]/social/early-alert/route";
import { DELETE as pieceDELETE, POST as piecePOST } from "@/app/api/[storeId]/social/posts/[postId]/piece/route";
import { PUT as tagsPUT } from "@/app/api/[storeId]/social/posts/[postId]/tags/route";
import { POST as instagramConnectPOST } from "@/app/api/[storeId]/social/instagram/connect/route";
import { GET as socialGET } from "@/app/api/[storeId]/social/route";
import { POST as syncPOST } from "@/app/api/[storeId]/social/sync/route";
import { GET as tiktokConnectGET } from "@/app/api/[storeId]/social/tiktok/connect/route";
import { GET as tiktokCallbackGET } from "@/app/api/integrations/tiktok/callback/route";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Métricas de redes» es solo de la dueña: la cuenta de solo lectura recibe
 * 403 en todo, y ninguna respuesta lleva tokens, tokenRef ni lo crudo. Meta y
 * TikTok se doblan con un fetch falso (la red de las pruebas está cortada).
 */
let f: InventoryFixture | undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (url: string, method = "GET") => new Request(url, { method });
const ctx = () => ({ params: { storeId: f!.store.id } });

const postJson = (body: unknown) => new Request("http://admin.test/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const putTags = (body: unknown) => new Request("http://admin.test/x", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

function asOwner() {
  session.userId = f!.store.userId;
  session.claims = {};
}
function asViewer() {
  session.userId = "user_viewer_redes";
  session.claims = { metadata: { role: "viewer", allowedStoreIds: [f!.store.id] } };
}

async function seedPost() {
  const account = await testPrisma.socialAccount.create({ data: { storeId: f!.store.id, platform: "INSTAGRAM", externalId: "ig1", tokenRef: "env:META_IG_PAGE_TOKEN", username: "papeleria.pdepapel" } });
  const post = await testPrisma.socialPost.create({ data: { socialAccountId: account.id, platform: "INSTAGRAM", externalId: "m1", productType: "REELS", caption: "Reel", postedAt: new Date(Date.now() - 3_600_000), thumbnailUrl: "https://cdn.example/t.jpg" } });
  await testPrisma.socialMetricSnapshot.create({ data: { socialPostId: post.id, hoursSincePost: 1, views: 10, raw: { views: 10 } } });
  return { account, post };
}

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.socialOAuthState.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialCredential.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialTag.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialPiece.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialAccount.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
  session.userId = null;
  session.claims = {};
  queue.enqueued = [];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("acceso a Métricas de redes", () => {
  it("la cuenta de solo lectura recibe 403 en todas las rutas y no ve nada", async () => {
    f = await createInventoryFixture();
    const { post } = await seedPost();
    asViewer();
    const responses = [
      await socialGET(req(`http://admin.test/api/${f.store.id}/social`), ctx()),
      await curveGET(req("http://admin.test/x"), { params: { storeId: f.store.id, postId: post.id } }),
      await instagramConnectPOST(req("http://admin.test/x", "POST"), ctx()),
      await syncPOST(req("http://admin.test/x", "POST"), ctx()),
      await tiktokConnectGET(req("http://admin.test/x"), ctx()),
      await tagsPUT(putTags({ FORMATO: ["kit"], GANCHO: [] }), { params: { storeId: f.store.id, postId: post.id } }),
      await piecePOST(postJson({ otherPostId: post.id }), { params: { storeId: f.store.id, postId: post.id } }),
      await pieceDELETE(req("http://admin.test/x", "DELETE"), { params: { storeId: f.store.id, postId: post.id } }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      const text = await response.text();
      expect(text).not.toMatch(/papeleria\.pdepapel|Reel|ig1/);
    }
    expect(queue.enqueued).toEqual([]);
    expect(await testPrisma.socialOAuthState.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await testPrisma.socialTag.count({ where: { storeId: f.store.id } })).toBe(0);
  });

  it("la dueña ve el resumen y la curva sin tokens, tokenRef ni raw; otra tienda no ve la curva", async () => {
    f = await createInventoryFixture();
    const { post } = await seedPost();
    asOwner();
    const response = await socialGET(req(`http://admin.test/api/${f.store.id}/social?dias=7`), ctx());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.posts[0]).toMatchObject({ caption: "Reel", views: 10, thumbnailUrl: "https://cdn.example/t.jpg" });
    expect(body.platforms.INSTAGRAM.configured).toBe(true);
    assertNoForbiddenKeys(body, "owner");
    expect(JSON.stringify(body)).not.toMatch(/env:META|test-stub/);

    const curve = await curveGET(req("http://admin.test/x"), { params: { storeId: f.store.id, postId: post.id } });
    assertNoForbiddenKeys(await curve.json(), "owner");
    const other = await createInventoryFixture();
    try {
      session.userId = other.store.userId;
      expect((await curveGET(req("http://admin.test/x"), { params: { storeId: other.store.id, postId: post.id } })).status).toBe(404);
    } finally {
      await deleteInventoryFixture(other);
    }
  });

  it("conectar Instagram liga la cuenta profesional de la página; un token rechazado no deja cuenta", async () => {
    f = await createInventoryFixture();
    asOwner();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        url.pathname.endsWith("/me") ? json({ id: "page1", instagram_business_account: { id: "ig9" } }) : json({ id: "ig9", username: "papeleria.pdepapel", followers_count: 50 }),
      ),
    );
    const ok = await instagramConnectPOST(req("http://admin.test/x", "POST"), ctx());
    expect(ok.status).toBe(200);
    const body = await ok.json();
    assertNoForbiddenKeys(body, "owner");
    expect(await testPrisma.socialAccount.findFirstOrThrow({ where: { storeId: f.store.id } })).toMatchObject({ externalId: "ig9", pageId: "page1", tokenRef: "env:META_IG_PAGE_TOKEN", status: "OK" });

    await testPrisma.socialAccount.deleteMany({ where: { storeId: f.store.id } });
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: 190, message: "Invalid OAuth access token" } }, 400)));
    const rejected = await instagramConnectPOST(req("http://admin.test/x", "POST"), ctx());
    expect(rejected.status).toBe(422);
    expect(await rejected.text()).not.toMatch(/access_token|graph\.facebook/);
    expect(await testPrisma.socialAccount.count({ where: { storeId: f.store.id } })).toBe(0);

    // Un token de usuario en vez de uno de página: así falló en producción, y no es «Meta no respondió».
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "(#100) Tried accessing nonexisting field (instagram_business_account)", type: "OAuthException", code: 100 } }, 400)));
    const userToken = await instagramConnectPOST(req("http://admin.test/x", "POST"), ctx());
    expect(userToken.status).toBe(422);
    const userTokenBody = await userToken.text();
    expect(userTokenBody).toContain("es de usuario, no de página");
    expect(userTokenBody).not.toContain("no respondió");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const down = await instagramConnectPOST(req("http://admin.test/x", "POST"), ctx());
    expect(down.status).toBe(502);
    expect(await down.text()).toContain("no respondió");
    expect(await testPrisma.socialAccount.count({ where: { storeId: f.store.id } })).toBe(0);
  });

  it("«Sincronizar ahora» encola solo las cuentas conectadas de la tienda", async () => {
    f = await createInventoryFixture();
    const { account } = await seedPost();
    await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "TIKTOK", externalId: "open1", status: "NEEDS_RECONNECT" } });
    asOwner();
    const response = await syncPOST(req("http://admin.test/x", "POST"), ctx());
    expect(await response.json()).toEqual({ enqueued: 1 });
    expect(queue.enqueued).toEqual([{ accountId: account.id }]);
  });
});

describe("etiquetas de una publicación", () => {
  it("la dueña las pone y las cambia; «pov» reutiliza «POV»; las quitadas salen de la publicación pero la etiqueta queda", async () => {
    f = await createInventoryFixture();
    const { post } = await seedPost();
    const second = await testPrisma.socialPost.create({ data: { socialAccountId: post.socialAccountId, platform: "INSTAGRAM", externalId: "m2", productType: "CAROUSEL", caption: "Carrusel", postedAt: new Date(Date.now() - 7_200_000) } });
    asOwner();
    const params = (postId: string) => ({ params: { storeId: f!.store.id, postId } });

    const first = await tagsPUT(putTags({ FORMATO: ["ASMR", "  kit  ", "Kit"], GANCHO: ["POV"] }), params(post.id));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ tags: { FORMATO: ["ASMR", "kit"], GANCHO: ["POV"] } });

    const reused = await tagsPUT(putTags({ FORMATO: [], GANCHO: ["pov", "Unboxing  sorpresa"] }), params(second.id));
    expect(await reused.json()).toEqual({ tags: { FORMATO: [], GANCHO: ["POV", "Unboxing sorpresa"] } });
    expect(await testPrisma.socialTag.count({ where: { storeId: f.store.id, kind: "GANCHO" } })).toBe(2);

    const replaced = await tagsPUT(putTags({ FORMATO: ["kit"], GANCHO: [] }), params(post.id));
    expect(await replaced.json()).toEqual({ tags: { FORMATO: ["kit"], GANCHO: [] } });
    expect(await testPrisma.socialPostTag.count({ where: { socialPostId: post.id } })).toBe(1);
    expect(await testPrisma.socialTag.count({ where: { storeId: f.store.id } })).toBe(4);

    const summary = await (await socialGET(req(`http://admin.test/api/${f.store.id}/social?dias=7`), ctx())).json();
    const byCaption = Object.fromEntries(summary.posts.map((item: { caption: string }) => [item.caption, item]));
    expect(byCaption.Reel.tags).toEqual({ FORMATO: ["kit"], GANCHO: [] });
    expect(byCaption.Carrusel.tags).toEqual({ FORMATO: [], GANCHO: ["POV", "Unboxing sorpresa"] });
    // Las de fábrica primero; «Unboxing sorpresa» al final; «POV» una sola vez aunque esté guardada.
    expect(summary.tagOptions.GANCHO).toEqual(["pregunta", "producto en mano", "texto grande", "antes/después", "POV", "Unboxing sorpresa"]);
    expect(summary.tagOptions.FORMATO.slice(0, 3)).toEqual(["pedido con nombre", "ASMR", "kit"]);
    expect(summary.whatWorks).toEqual([expect.objectContaining({ platform: "INSTAGRAM", posts: 2 })]);
    assertNoForbiddenKeys(summary, "owner");
  });

  it("otra tienda no puede etiquetar la publicación; un cuerpo inválido o demasiadas etiquetas dan 400 sin cambios", async () => {
    f = await createInventoryFixture();
    const { post } = await seedPost();
    const other = await createInventoryFixture();
    try {
      session.userId = other.store.userId;
      const foreign = await tagsPUT(putTags({ FORMATO: ["kit"], GANCHO: [] }), { params: { storeId: other.store.id, postId: post.id } });
      expect(foreign.status).toBe(404);
      expect(await testPrisma.socialTag.count({ where: { storeId: { in: [f.store.id, other.store.id] } } })).toBe(0);
    } finally {
      await deleteInventoryFixture(other);
    }
    asOwner();
    const params = { params: { storeId: f.store.id, postId: post.id } };
    expect((await tagsPUT(putTags({ FORMATO: "kit" }), params)).status).toBe(400);
    expect((await tagsPUT(new Request("http://admin.test/x", { method: "PUT", body: "{" }), params)).status).toBe(400);
    const eleven = Array.from({ length: 11 }, (_, index) => `etiqueta ${index}`);
    const tooMany = await tagsPUT(putTags({ FORMATO: eleven, GANCHO: [] }), params);
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toMatchObject({ error: expect.stringContaining("Máximo 10") });
    expect(await testPrisma.socialTag.count({ where: { storeId: f.store.id } })).toBe(0);
  });
});

describe("la misma pieza en varias redes", () => {
  async function seedPair() {
    const { account, post } = await seedPost();
    const tiktok = await testPrisma.socialAccount.create({ data: { storeId: f!.store.id, platform: "TIKTOK", externalId: "open1", username: "P de Papel" } });
    const tt = await testPrisma.socialPost.create({ data: { socialAccountId: tiktok.id, platform: "TIKTOK", externalId: "v1", productType: "VIDEO", caption: "Reel", postedAt: new Date(Date.now() - 7_200_000) } });
    const tt2 = await testPrisma.socialPost.create({ data: { socialAccountId: tiktok.id, platform: "TIKTOK", externalId: "v2", productType: "VIDEO", caption: "Otro", postedAt: new Date(Date.now() - 9_000_000) } });
    const ig2 = await testPrisma.socialPost.create({ data: { socialAccountId: account.id, platform: "INSTAGRAM", externalId: "m2", productType: "REELS", caption: "Otro", postedAt: new Date(Date.now() - 9_000_000) } });
    return { ig: post, tt, tt2, ig2 };
  }
  const params = (postId: string) => ({ params: { storeId: f!.store.id, postId } });

  it("la dueña une y separa; una pieza lleva una publicación por red; el resumen trae la pieza y las sugerencias", async () => {
    f = await createInventoryFixture();
    const { ig, tt, tt2, ig2 } = await seedPair();
    asOwner();

    // Mismo texto, otra red, 1 h de diferencia: se sugiere, pero no se une solo.
    let summary = await (await socialGET(req(`http://admin.test/api/${f.store.id}/social?dias=7`), ctx())).json();
    const byId = (body: { posts: { id: string }[] }, postId: string) => body.posts.find((item) => item.id === postId) as unknown as { pieceId: string | null; pieceSuggestions: string[] };
    expect(byId(summary, ig.id)).toMatchObject({ pieceId: null, pieceSuggestions: [tt.id] });
    expect(summary.pieces).toEqual([]);

    expect((await piecePOST(postJson({ otherPostId: ig2.id }), params(ig.id))).status).toBe(400);
    const linked = await piecePOST(postJson({ otherPostId: tt.id }), params(ig.id));
    expect(linked.status).toBe(200);
    const { pieceId } = await linked.json();
    expect(await testPrisma.socialPost.count({ where: { socialPieceId: pieceId } })).toBe(2);
    // Ya hay TikTok en la pieza: otro TikTok no entra.
    expect((await piecePOST(postJson({ otherPostId: tt2.id }), params(ig.id))).status).toBe(409);
    // Volver a unir las mismas no hace nada.
    expect(await (await piecePOST(postJson({ otherPostId: ig.id }), params(tt.id))).json()).toEqual({ pieceId });

    summary = await (await socialGET(req(`http://admin.test/api/${f.store.id}/social?dias=7`), ctx())).json();
    expect(byId(summary, ig.id)).toMatchObject({ pieceId, pieceSuggestions: [] });
    expect(summary.pieces).toEqual([{ id: pieceId, posts: expect.arrayContaining([expect.objectContaining({ id: ig.id, platform: "INSTAGRAM" }), expect.objectContaining({ id: tt.id, platform: "TIKTOK" })]) }]);
    assertNoForbiddenKeys(summary, "owner");

    // Dos piezas distintas no se mezclan.
    const second = await (await piecePOST(postJson({ otherPostId: tt2.id }), params(ig2.id))).json();
    expect((await piecePOST(postJson({ otherPostId: tt2.id }), params(ig.id))).status).toBe(409);

    // Separar deja la pieza con una sola publicación: se borra y la otra queda libre.
    expect(await (await pieceDELETE(req("http://admin.test/x", "DELETE"), params(tt.id))).json()).toEqual({ removed: true });
    expect(await testPrisma.socialPiece.count({ where: { id: pieceId } })).toBe(0);
    expect((await testPrisma.socialPost.findUniqueOrThrow({ where: { id: ig.id } })).socialPieceId).toBeNull();
    expect(await testPrisma.socialPiece.count({ where: { id: second.pieceId } })).toBe(1);
    expect(await (await pieceDELETE(req("http://admin.test/x", "DELETE"), params(tt.id))).json()).toEqual({ removed: false });
  });

  it("un cuerpo vacío, sin content-type o mal formado da 400 en español y deja el porqué en el registro, sin el contenido", async () => {
    f = await createInventoryFixture();
    const { ig } = await seedPair();
    asOwner();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bodies = [
        new Request("http://admin.test/x", { method: "POST" }),
        new Request("http://admin.test/x", { method: "POST", body: "" }),
        new Request("http://admin.test/x", { method: "POST", body: '{"otherPostId":"secreto-123"', headers: { "content-type": "application/json" } }),
      ];
      for (const request of bodies) {
        const response = await piecePOST(request, params(ig.id));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: "No llegó la publicación a unir. Vuelve a intentarlo." });
      }
      const tags = await tagsPUT(new Request("http://admin.test/x", { method: "PUT" }), params(ig.id));
      expect(tags.status).toBe(400);
      expect(await tags.json()).toMatchObject({ error: "No llegaron las etiquetas. Vuelve a intentarlo." });
      const logged = warn.mock.calls.filter(([message]) => /cuerpo ilegible/.test(String(message)));
      expect(logged.map(([message]) => message)).toEqual([
        "[SOCIAL_POST_PIECE_LINK] cuerpo ilegible",
        "[SOCIAL_POST_PIECE_LINK] cuerpo ilegible",
        "[SOCIAL_POST_PIECE_LINK] cuerpo ilegible",
        "[SOCIAL_POST_TAGS] cuerpo ilegible",
      ]);
      expect(logged[2][1]).toMatchObject({ method: "POST", contentType: "application/json", error: expect.any(String) });
      expect(JSON.stringify(logged)).not.toContain("secreto-123");
      expect(await testPrisma.socialPiece.count({ where: { storeId: f.store.id } })).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("otra tienda no puede unir ni separar publicaciones ajenas", async () => {
    f = await createInventoryFixture();
    const { ig, tt } = await seedPair();
    const other = await createInventoryFixture();
    try {
      session.userId = other.store.userId;
      const foreign = { params: { storeId: other.store.id, postId: ig.id } };
      expect((await piecePOST(postJson({ otherPostId: tt.id }), foreign)).status).toBe(404);
      expect((await pieceDELETE(req("http://admin.test/x", "DELETE"), foreign)).status).toBe(404);
      expect(await testPrisma.socialPiece.count({ where: { storeId: { in: [f.store.id, other.store.id] } } })).toBe(0);
    } finally {
      await deleteInventoryFixture(other);
    }
  });
});

describe("interruptor de la alerta temprana", () => {
  const putSwitch = (body: unknown) => new Request("http://admin.test/x", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  it("solo la dueña la pausa y la reanuda; la cuenta de solo lectura recibe 403; un cuerpo vacío da 400 en español", async () => {
    f = await createInventoryFixture();
    try {
      asViewer();
      expect((await earlyAlertPUT(putSwitch({ enabled: false }), ctx())).status).toBe(403);
      expect(await testPrisma.storeSettings.count({ where: { storeId: f.store.id } })).toBe(0);
      asOwner();
      expect(await (await earlyAlertPUT(putSwitch({ enabled: false }), ctx())).json()).toEqual({ enabled: false });
      expect((await testPrisma.storeSettings.findUniqueOrThrow({ where: { storeId: f.store.id } })).socialEarlyAlertEnabled).toBe(false);
      expect(await (await earlyAlertPUT(putSwitch({ enabled: true }), ctx())).json()).toEqual({ enabled: true });
      expect((await testPrisma.storeSettings.findUniqueOrThrow({ where: { storeId: f.store.id } })).socialEarlyAlertEnabled).toBe(true);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const empty = await earlyAlertPUT(new Request("http://admin.test/x", { method: "PUT" }), ctx());
      warn.mockRestore();
      expect(empty.status).toBe(400);
      expect(await empty.json()).toMatchObject({ error: "No llegó si pausar o reanudar la alerta. Vuelve a intentarlo." });
      expect((await earlyAlertPUT(putSwitch({ enabled: "no" }), ctx())).status).toBe(400);
    } finally {
      await testPrisma.storeSettings.deleteMany({ where: { storeId: f.store.id } });
    }
  });
});

describe("conexión de TikTok", () => {
  const enable = () => vi.stubEnv("TIKTOK_ENABLED", "true");
  const startConnect = async () => {
    const response = await tiktokConnectGET(req("http://admin.test/x"), ctx());
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    return location.searchParams.get("state")!;
  };

  it("apagada no arranca; la dueña la completa y el token queda cifrado; el state no se reutiliza", async () => {
    f = await createInventoryFixture();
    asOwner();
    expect((await tiktokConnectGET(req("http://admin.test/x"), ctx())).status).toBe(409);

    enable();
    const state = await startConnect();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/oauth/token/")
          ? json({ access_token: "act.secreto", refresh_token: "rft.secreto", open_id: "open-9", expires_in: 86400, refresh_expires_in: 31536000, scope: "user.info.basic,video.list" })
          : json({ data: { user: { open_id: "open-9", display_name: "P de Papel", follower_count: 12 } }, error: { code: "ok" } }),
      ),
    );
    const callback = await tiktokCallbackGET(req(`http://admin.test/api/integrations/tiktok/callback?code=c1&state=${state}`));
    expect(callback.headers.get("location")).toContain(`/${f.store.id}/redes?tiktok=conectado`);
    const credential = await testPrisma.socialCredential.findFirstOrThrow({ where: { storeId: f.store.id } });
    expect(`${credential.encryptedAccessToken}${credential.encryptedRefreshToken}`).not.toContain("secreto");
    expect(await testPrisma.socialAccount.findFirstOrThrow({ where: { storeId: f.store.id, platform: "TIKTOK" } })).toMatchObject({ externalId: "open-9", username: "P de Papel", tokenRef: `credential:${credential.id}` });

    const replay = await tiktokCallbackGET(req(`http://admin.test/api/integrations/tiktok/callback?code=c1&state=${state}`));
    expect(replay.headers.get("location")).toContain("tiktok=error&motivo=invalid_state");
  });

  it("otra sesión no puede terminar la conexión que empezó la dueña; cancelar en TikTok no guarda nada", async () => {
    f = await createInventoryFixture();
    enable();
    asOwner();
    const state = await startConnect();
    asViewer();
    const stolen = await tiktokCallbackGET(req(`http://admin.test/api/integrations/tiktok/callback?code=c1&state=${state}`));
    expect(stolen.headers.get("location")).toContain("motivo=not_owner");

    asOwner();
    const denied = await tiktokCallbackGET(req(`http://admin.test/api/integrations/tiktok/callback?error=access_denied&state=${await startConnect()}`));
    expect(denied.headers.get("location")).toContain("motivo=denied");
    expect(await testPrisma.socialCredential.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await testPrisma.socialAccount.count({ where: { storeId: f.store.id } })).toBe(0);
  });
});
