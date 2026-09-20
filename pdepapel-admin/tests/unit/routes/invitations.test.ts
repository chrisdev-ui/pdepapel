import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Invitaciones de solo lectura respaldadas por Clerk. Solo invita quien está
 * en `ADMIN_ALLOWED_USER_IDS` **y** es dueño de la tienda, y solo puede
 * conceder tiendas suyas. El permiso viaja en el metadato público de la
 * invitación, que es el mismo que lee `requireStoreRead` al entrar.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  storeFindFirst: vi.fn(),
  storeFindMany: vi.fn(),
  getInvitationList: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: async () => ({
    invitations: {
      getInvitationList: mocks.getInvitationList,
      createInvitation: mocks.createInvitation,
      revokeInvitation: mocks.revokeInvitation,
    },
  }),
}));
vi.mock("@/lib/env.mjs", () => ({ env: { ADMIN_WEB_URL: "https://admin.papeleriapdepapel.com/" } }));
vi.mock("@/lib/prismadb", () => ({
  default: { store: { findFirst: mocks.storeFindFirst, findMany: mocks.storeFindMany } },
}));

import { GET, POST } from "@/app/api/[storeId]/invitations/route";
import { DELETE } from "@/app/api/[storeId]/invitations/[invitationId]/route";

const OWNER = "user_owner";
const STORE = "store-1";
const OTHER_STORE = "store-2";
const params = { storeId: STORE };

const list = () => GET(new Request("https://admin.test/api/store-1/invitations"), { params });
const invite = (body: unknown) =>
  POST(new Request("https://admin.test/api/store-1/invitations", { method: "POST", body: JSON.stringify(body) }), { params });
const revoke = (invitationId: string) =>
  DELETE(new Request("https://admin.test/x", { method: "DELETE" }), { params: { storeId: STORE, invitationId } });

const originalAllowlist = process.env.ADMIN_ALLOWED_USER_IDS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_ALLOWED_USER_IDS = OWNER;
  mocks.auth.mockResolvedValue({ userId: OWNER });
  mocks.storeFindFirst.mockImplementation(async (query: any) =>
    query.where.userId === OWNER && query.where.id === STORE ? { id: STORE } : null,
  );
  mocks.storeFindMany.mockResolvedValue([
    { id: STORE, name: "Papelería P de Papel" },
    { id: OTHER_STORE, name: "Segunda tienda" },
  ]);
  mocks.getInvitationList.mockResolvedValue({ data: [], totalCount: 0 });
  mocks.createInvitation.mockImplementation(async (input: any) => ({
    id: "inv_1",
    emailAddress: input.emailAddress,
    status: "pending",
    createdAt: Date.parse("2026-09-19T12:00:00Z"),
    publicMetadata: input.publicMetadata,
  }));
  mocks.revokeInvitation.mockResolvedValue({ id: "inv_1", status: "revoked" });
});

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.ADMIN_ALLOWED_USER_IDS;
  else process.env.ADMIN_ALLOWED_USER_IDS = originalAllowlist;
});

describe("quién puede invitar", () => {
  it("rechaza sin sesión", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await list()).status).toBe(401);
    expect((await invite({ emailAddress: "a@b.com" })).status).toBe(401);
    expect((await revoke("inv_1")).status).toBe(401);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("rechaza a la dueña que no está en la lista explícita del dueño", async () => {
    delete process.env.ADMIN_ALLOWED_USER_IDS;
    expect((await list()).status).toBe(403);
    expect((await invite({ emailAddress: "a@b.com" })).status).toBe(403);
    expect((await revoke("inv_1")).status).toBe(403);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("rechaza a quien está en la lista pero no es dueño de esta tienda", async () => {
    mocks.storeFindFirst.mockResolvedValue(null);
    expect((await list()).status).toBe(403);
    expect((await invite({ emailAddress: "a@b.com" })).status).toBe(403);
  });
});

describe("listar invitaciones pendientes", () => {
  it("devuelve el correo, el permiso y el nombre de las tiendas concedidas", async () => {
    mocks.getInvitationList.mockResolvedValue({
      data: [
        { id: "inv_1", emailAddress: "agencia@ejemplo.com", status: "pending", createdAt: Date.parse("2026-09-18T15:00:00Z"), publicMetadata: { role: "viewer", allowedStoreIds: [STORE] } },
        { id: "inv_2", emailAddress: "rota@ejemplo.com", status: "pending", createdAt: Date.parse("2026-09-18T16:00:00Z"), publicMetadata: { role: "viewer" } },
      ],
    });
    const response = await list();
    expect(response.status).toBe(200);
    expect(mocks.getInvitationList).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
    const body = await response.json();
    expect(body[0]).toMatchObject({
      emailAddress: "agencia@ejemplo.com",
      role: "viewer",
      allowedStoreIds: [STORE],
      storeNames: ["Papelería P de Papel"],
      malformed: false,
    });
    // Un metadato con otra forma no concedería nada: la pantalla lo marca.
    expect(body[1]).toMatchObject({ role: null, allowedStoreIds: [], malformed: true });
  });
});

describe("crear una invitación", () => {
  it("manda el permiso de solo lectura y el enlace de aceptación del panel", async () => {
    const response = await invite({ emailAddress: "  Agencia@Ejemplo.com  " });
    expect(response.status).toBe(201);
    expect(mocks.createInvitation).toHaveBeenCalledWith({
      emailAddress: "agencia@ejemplo.com",
      publicMetadata: { role: "viewer", allowedStoreIds: [STORE] },
      redirectUrl: "https://admin.papeleriapdepapel.com/aceptar-invitacion",
      notify: true,
    });
  });

  it("concede varias tiendas propias cuando se piden", async () => {
    await invite({ emailAddress: "a@b.com", allowedStoreIds: [STORE, OTHER_STORE, STORE] });
    expect(mocks.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ publicMetadata: { role: "viewer", allowedStoreIds: [STORE, OTHER_STORE] } }),
    );
  });

  it("nunca concede una tienda ajena", async () => {
    const response = await invite({ emailAddress: "a@b.com", allowedStoreIds: [STORE, "tienda-de-otra-persona"] });
    expect(response.status).toBe(403);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("pide un correo válido", async () => {
    for (const emailAddress of ["", "   ", "sin-arroba", "a@b", "a b@c.com"]) {
      const response = await invite({ emailAddress });
      expect(response.status, emailAddress).toBe(400);
    }
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("explica en español que ese correo ya tiene invitación o cuenta", async () => {
    mocks.createInvitation.mockRejectedValue(Object.assign(new Error("duplicate"), { status: 400 }));
    const response = await invite({ emailAddress: "a@b.com" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Ese correo ya tiene una invitación o una cuenta en el panel.",
    });
  });
});

describe("anular una invitación", () => {
  it("la anula en Clerk", async () => {
    const response = await revoke("inv_1");
    expect(response.status).toBe(200);
    expect(mocks.revokeInvitation).toHaveBeenCalledWith("inv_1");
  });

  it("responde 404 si ya no existe", async () => {
    mocks.revokeInvitation.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    expect((await revoke("inv_x")).status).toBe(404);
  });
});
