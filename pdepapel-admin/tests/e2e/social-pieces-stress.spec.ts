import { createClerkClient } from "@clerk/backend";
import type { Page, Request } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «La misma pieza»: unir y separar varias veces seguidas a 390 px, más un doble
 * clic rápido en «Unir». Cada pedido a la ruta de piezas debe salir con cuerpo
 * JSON válido y responder 200; nunca dos uniones a la vez.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e -- tests/e2e/social-pieces-stress.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const HOUR = 3_600_000;
// 5 en cada corrida; para la prueba larga, E2E_PIECE_ROUNDS=20 (así se reprodujo el 2026-10-23: 4 arranques en frío, 164 pedidos, todos 200).
const ROUNDS = Number(process.env.E2E_PIECE_ROUNDS ?? 5);

test.use({ trace: "off" });

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Piezas de redes",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("piezas: unir y separar seguido", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");
  const db = createTestPrismaClient("social-pieces-stress");

  test.beforeAll(async () => {
    await db.socialPiece.deleteMany({ where: { storeId } });
    await db.socialAccount.deleteMany({ where: { storeId } });
    const now = Date.now();
    const instagram = await db.socialAccount.create({ data: { storeId, platform: "INSTAGRAM", externalId: "e2e-ig", username: "papeleria.pdepapel" } });
    const tiktok = await db.socialAccount.create({ data: { storeId, platform: "TIKTOK", externalId: "e2e-tt", username: "P de Papel" } });
    for (const [account, platform, externalId, hoursAgo] of [
      [instagram.id, "INSTAGRAM", "ig-kit", 20],
      [tiktok.id, "TIKTOK", "tt-kit", 19],
    ] as const) {
      await db.socialPost.create({
        data: { socialAccountId: account, platform, externalId, productType: platform === "INSTAGRAM" ? "REELS" : "VIDEO", caption: "Kit de capibara para el colegio", postedAt: new Date(now - hoursAgo * HOUR) },
      });
    }
  });

  test.afterAll(async () => {
    await db.socialPiece.deleteMany({ where: { storeId } });
    await db.socialAccount.deleteMany({ where: { storeId } });
    await db.$disconnect();
  });

  test(`${ROUNDS} veces unir y separar, y un doble clic, sin cuerpos vacíos`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const sent: { method: string; body: string | null; contentType: string | null }[] = [];
    const answered: { method: string; status: number; text: string }[] = [];
    const isPiece = (request: Request) => /\/social\/posts\/[^/]+\/piece$/.test(new URL(request.url()).pathname);
    page.on("request", (request) => {
      if (isPiece(request)) sent.push({ method: request.method(), body: request.postData(), contentType: request.headers()["content-type"] ?? null });
    });
    page.on("response", async (response) => {
      if (isPiece(response.request())) answered.push({ method: response.request().method(), status: response.status(), text: (await response.text().catch(() => "")).slice(0, 200) });
    });

    await signIn(page, `/${storeId}/redes?dias=7`);
    const title = page.getByRole("heading", { level: 1, name: "Métricas de redes" });
    await expect(title).toBeVisible({ timeout: 60_000 });
    // La entrada de la pantalla (template.tsx) y la hidratación terminan antes del clic.
    await expect
      .poll(() => title.evaluate((node) => { for (let el: Element | null = node; el; el = el.parentElement) if (getComputedStyle(el).opacity !== "1") return false; return true; }))
      .toBe(true);
    await page.getByRole("list", { name: "Publicaciones" }).getByText("Kit de capibara para el colegio").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const piece = page.getByRole("dialog").getByRole("region", { name: "La misma pieza en otras redes" });

    for (let round = 0; round < ROUNDS; round += 1) {
      await piece.getByRole("button", { name: /^Unir con la de/ }).click();
      await expect(piece.getByRole("table", { name: "Esta pieza en cada red" })).toBeVisible({ timeout: 20_000 });
      await piece.getByRole("button", { name: "Separar de la pieza" }).click();
      await expect(piece.getByRole("button", { name: /^Unir con la de/ })).toBeVisible({ timeout: 20_000 });
    }

    // Doble clic rápido: un solo pedido de unir sale.
    const before = sent.filter((entry) => entry.method === "POST").length;
    await piece.getByRole("button", { name: /^Unir con la de/ }).dblclick();
    await expect(piece.getByRole("table", { name: "Esta pieza en cada red" })).toBeVisible({ timeout: 20_000 });
    expect(sent.filter((entry) => entry.method === "POST").length - before).toBe(1);

    const posts = sent.filter((entry) => entry.method === "POST");
    expect(posts).toHaveLength(ROUNDS + 1);
    for (const entry of posts) {
      expect(entry.contentType).toContain("application/json");
      expect(JSON.parse(entry.body ?? "null")).toEqual({ otherPostId: expect.any(String) });
    }
    await expect.poll(() => answered.length).toBe(sent.length);
    expect(answered.filter((entry) => entry.status !== 200)).toEqual([]);
    expect(await db.socialPiece.count({ where: { storeId } })).toBe(1);
  });
});
