import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las dos pantallas nuevas: invitar (solo para la lista explícita del dueño) y
 * aceptar (solo con un billete de invitación). La de aceptar vive en el
 * dominio del panel y la instancia de Clerk tiene el registro abierto, así que
 * sin billete no puede mostrar nada.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  listPendingInvitations: vi.fn(),
  ownedStores: vi.fn(),
}));

const OWNER = "user_owner";
const STORE = "store-1";

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@clerk/nextjs", () => ({ SignUp: () => null, SignIn: () => null }));
vi.mock("@/components/auth/auth-page-shell", () => ({ AuthPageShell: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/auth/clerk-mount-gate", () => ({ ClerkMountGate: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/clerk-appearance", () => ({ adminClerkAppearance: {} }));
vi.mock("@/lib/invitations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invitations")>()),
  listPendingInvitations: mocks.listPendingInvitations,
  ownedStores: mocks.ownedStores,
}));
vi.mock("@/lib/prismadb", () => ({ default: { store: { findFirst: vi.fn(), findMany: vi.fn() } } }));
vi.mock("@/lib/env.mjs", () => ({ env: { ADMIN_WEB_URL: "https://admin.test" } }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/invitaciones/components/client", () => ({
  InvitationsClient: () => null,
}));

import AcceptInvitationPage from "@/app/(auth)/(routes)/aceptar-invitacion/[[...sign-up]]/page";
import InvitationsPage from "@/app/(dashboard)/[storeId]/(routes)/invitaciones/page";

const encode = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload)).toString("base64url");
const validTicket = `cabecera.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.firma`;

/** Devuelve la ruta a la que redirigió, o `null` si la página se pintó. */
async function render(page: () => unknown): Promise<string | null> {
  try {
    await page();
    return null;
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
}

const originalAllowlist = process.env.ADMIN_ALLOWED_USER_IDS;

beforeEach(() => {
  vi.clearAllMocks();
  session.userId = null;
  if (originalAllowlist === undefined) delete process.env.ADMIN_ALLOWED_USER_IDS;
  mocks.ownedStores.mockResolvedValue([{ id: STORE, name: "Papelería P de Papel" }]);
  mocks.listPendingInvitations.mockResolvedValue([]);
});

describe("pantalla de invitaciones", () => {
  it("se pinta para quien está en la lista explícita y es dueño de la tienda", async () => {
    process.env.ADMIN_ALLOWED_USER_IDS = OWNER;
    session.userId = OWNER;
    await expect(render(() => InvitationsPage({ params: { storeId: STORE } }))).resolves.toBeNull();
    expect(mocks.listPendingInvitations).toHaveBeenCalledWith(OWNER);
  });

  // Sale a la raíz, no a «sin acceso»: la raíz ya sabe repartir a cada sesión
  // (su tienda, la tienda permitida, o «sin acceso» si de verdad no tiene
  // nada). Encadenar las dos redirecciones reventaba con un 500 al navegar
  // dentro del panel, sin recargar la página.
  it("echa a la dueña que no está en la lista", async () => {
    delete process.env.ADMIN_ALLOWED_USER_IDS;
    session.userId = OWNER;
    await expect(render(() => InvitationsPage({ params: { storeId: STORE } }))).resolves.toBe("/");
    expect(mocks.listPendingInvitations).not.toHaveBeenCalled();
  });

  it("echa a quien está en la lista pero pide una tienda que no es suya", async () => {
    process.env.ADMIN_ALLOWED_USER_IDS = OWNER;
    session.userId = OWNER;
    mocks.ownedStores.mockResolvedValue([{ id: "otra", name: "Otra" }]);
    await expect(render(() => InvitationsPage({ params: { storeId: STORE } }))).resolves.toBe("/");
  });

  it("manda a iniciar sesión sin sesión", async () => {
    session.userId = null;
    await expect(render(() => InvitationsPage({ params: { storeId: STORE } }))).resolves.toBe("/iniciar-sesion");
  });
});

describe("pantalla de aceptar invitación", () => {
  it("se pinta con un billete válido", async () => {
    await expect(render(() => AcceptInvitationPage({ searchParams: { __clerk_ticket: validTicket } }))).resolves.toBeNull();
  });

  it("no es un registro abierto: sin billete manda a iniciar sesión", async () => {
    await expect(render(() => AcceptInvitationPage({ searchParams: {} }))).resolves.toBe("/iniciar-sesion");
  });

  it("rechaza un billete con forma inválida o caducado", async () => {
    const expired = `cabecera.${encode({ exp: Math.floor(Date.now() / 1000) - 10 })}.firma`;
    await expect(render(() => AcceptInvitationPage({ searchParams: { __clerk_ticket: "cualquier-cosa" } }))).resolves.toBe("/iniciar-sesion");
    await expect(render(() => AcceptInvitationPage({ searchParams: { __clerk_ticket: expired } }))).resolves.toBe("/iniciar-sesion");
  });
});
