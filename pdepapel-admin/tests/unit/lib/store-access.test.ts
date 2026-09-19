import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Acceso a una tienda del panel: la dueña sale de la base (`Store.userId`) y
 * la cuenta de solo lectura sale del metadato público de Clerk
 * (`{ role: "viewer", allowedStoreIds: [...] }`). Todo lo que no encaje
 * exactamente con esa forma se trata como «sin acceso»: el metadato lo
 * escribe una persona a mano en el panel de Clerk, así que un error de dedo
 * nunca puede abrir una tienda.
 */
const session = vi.hoisted(() => ({
  userId: null as string | null,
  sessionClaims: null as unknown,
}));
const mocks = vi.hoisted(() => ({
  storeFindFirst: vi.fn(),
  storeCount: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.sessionClaims }),
  clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prismadb", () => ({
  default: { store: { findFirst: mocks.storeFindFirst, count: mocks.storeCount } },
}));

import {
  getStoreAccess,
  parsePanelMetadata,
  requireAdminSession,
  requireStoreOwner,
  requireStoreRead,
} from "@/lib/store-access";

const OWNER = "user_owner";
const VIEWER = "user_viewer";
const STORE = "store-1";
const OTHER_STORE = "store-2";

/** La base solo reconoce a la dueña de `store-1`. */
function databaseOwnership() {
  mocks.storeFindFirst.mockImplementation(async (query: { where: { id: string; userId: string } }) =>
    query.where.userId === OWNER && query.where.id === STORE ? { id: STORE } : null,
  );
}

function signedInAs(userId: string, metadata?: unknown) {
  session.userId = userId;
  session.sessionClaims = metadata === undefined ? {} : { metadata };
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseOwnership();
  mocks.storeCount.mockResolvedValue(0);
  mocks.getUser.mockResolvedValue({ publicMetadata: {} });
  session.userId = null;
  session.sessionClaims = null;
});

afterEach(() => {
  session.userId = null;
  session.sessionClaims = null;
});

describe("parsePanelMetadata", () => {
  it("acepta las dos formas válidas y recorta los ids", () => {
    expect(parsePanelMetadata({ role: "viewer", allowedStoreIds: [" store-1 "] })).toEqual({
      role: "viewer",
      allowedStoreIds: [STORE],
    });
    expect(parsePanelMetadata({ role: "owner", allowedStoreIds: [] })).toEqual({
      role: "owner",
      allowedStoreIds: [],
    });
  });

  it("rechaza cualquier otra forma, incluida la ausencia del metadato", () => {
    const invalid: unknown[] = [
      undefined,
      null,
      "viewer",
      42,
      [],
      [{ role: "viewer", allowedStoreIds: [] }],
      {},
      { role: "viewer" },
      { allowedStoreIds: [STORE] },
      { role: "admin", allowedStoreIds: [STORE] },
      { role: "VIEWER", allowedStoreIds: [STORE] },
      { role: "viewer", allowedStoreIds: STORE },
      { role: "viewer", allowedStoreIds: [STORE, 7] },
      { role: "viewer", allowedStoreIds: [STORE, null] },
      { role: "viewer", allowedStoreIds: [STORE, "  "] },
    ];
    for (const value of invalid) expect(parsePanelMetadata(value)).toBeNull();
  });
});

describe("requireStoreRead", () => {
  it("deja leer a la dueña de la tienda", async () => {
    signedInAs(OWNER);
    await expect(requireStoreRead(STORE)).resolves.toEqual({ userId: OWNER, role: "owner" });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("deja leer a una cuenta de solo lectura con esa tienda permitida", async () => {
    signedInAs(VIEWER, { role: "viewer", allowedStoreIds: [OTHER_STORE, STORE] });
    await expect(requireStoreRead(STORE)).resolves.toEqual({ userId: VIEWER, role: "viewer" });
  });

  it("rechaza a una cuenta de solo lectura de otra tienda", async () => {
    signedInAs(VIEWER, { role: "viewer", allowedStoreIds: [OTHER_STORE] });
    await expect(requireStoreRead(STORE)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rechaza sin sesión", async () => {
    session.userId = null;
    await expect(requireStoreRead(STORE)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();
  });

  it("rechaza a una sesión cualquiera sin metadato", async () => {
    signedInAs("user_cliente");
    await expect(requireStoreRead(STORE)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rechaza un metadato mal formado en vez de interpretarlo", async () => {
    const malformed: unknown[] = [
      { role: "viewer", allowedStoreIds: STORE },
      { role: "viewer" },
      { role: "admin", allowedStoreIds: [STORE] },
      { allowedStoreIds: [STORE] },
      "viewer",
      null,
    ];
    for (const metadata of malformed) {
      signedInAs(VIEWER, metadata);
      await expect(requireStoreRead(STORE)).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("no concede nada por decir «owner» en el metadato: la propiedad la decide la base", async () => {
    signedInAs("user_impostor", { role: "owner", allowedStoreIds: [STORE] });
    await expect(requireStoreRead(STORE)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("consulta a Clerk cuando la sesión no trae el metadato en sus claims", async () => {
    session.userId = VIEWER;
    session.sessionClaims = {};
    mocks.getUser.mockResolvedValue({ publicMetadata: { role: "viewer", allowedStoreIds: [STORE] } });
    await expect(requireStoreRead(STORE)).resolves.toEqual({ userId: VIEWER, role: "viewer" });
    expect(mocks.getUser).toHaveBeenCalledWith(VIEWER);
  });

  it("rechaza si la consulta a Clerk falla", async () => {
    session.userId = VIEWER;
    session.sessionClaims = {};
    mocks.getUser.mockRejectedValue(new Error("clerk caído"));
    await expect(requireStoreRead(STORE)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rechaza cuando falta el id de la tienda", async () => {
    signedInAs(OWNER);
    await expect(requireStoreRead("")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("requireStoreOwner", () => {
  it("devuelve el id de la dueña", async () => {
    signedInAs(OWNER);
    await expect(requireStoreOwner(STORE)).resolves.toBe(OWNER);
  });

  it("rechaza a una cuenta de solo lectura aunque tenga la tienda permitida", async () => {
    signedInAs(VIEWER, { role: "viewer", allowedStoreIds: [STORE] });
    await expect(requireStoreOwner(STORE)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rechaza sin sesión y a la dueña de otra tienda", async () => {
    session.userId = null;
    await expect(requireStoreOwner(STORE)).rejects.toMatchObject({ statusCode: 401 });
    signedInAs(OWNER);
    await expect(requireStoreOwner(OTHER_STORE)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("getStoreAccess", () => {
  it("describe el acceso sin lanzar", async () => {
    signedInAs(OWNER);
    await expect(getStoreAccess(STORE)).resolves.toEqual({ userId: OWNER, role: "owner" });
    signedInAs(VIEWER, { role: "viewer", allowedStoreIds: [STORE] });
    await expect(getStoreAccess(STORE)).resolves.toEqual({ userId: VIEWER, role: "viewer" });
    signedInAs(VIEWER, { role: "viewer", allowedStoreIds: [OTHER_STORE] });
    await expect(getStoreAccess(STORE)).resolves.toBeNull();
    session.userId = null;
    await expect(getStoreAccess(STORE)).resolves.toBeNull();
  });
});

describe("requireAdminSession", () => {
  it("acepta a quien tiene una tienda y rechaza al resto", async () => {
    session.userId = null;
    await expect(requireAdminSession()).rejects.toMatchObject({ statusCode: 401 });

    session.userId = "user_cliente";
    mocks.storeCount.mockResolvedValue(0);
    await expect(requireAdminSession()).rejects.toMatchObject({ statusCode: 403 });

    session.userId = OWNER;
    mocks.storeCount.mockResolvedValue(1);
    await expect(requireAdminSession()).resolves.toBe(OWNER);
  });
});
