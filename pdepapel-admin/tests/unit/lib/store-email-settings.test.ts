import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las dos listas de correos de Configuración: se leen de la base, nunca del
 * código, y no salen por ninguna ruta pública.
 */
const mocks = vi.hoisted(() => ({
  session: { userId: null as string | null, metadata: null as unknown },
  settings: new Map<string, { excludedCustomerEmails: string | null; adminNotificationEmails: string | null }>(),
  stores: new Map<string, { email: string | null; userId: string }>(),
  upsert: vi.fn(),
  orders: [] as unknown[],
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: mocks.session.userId,
    sessionClaims: mocks.session.metadata === null ? {} : { metadata: mocks.session.metadata },
  }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    storeSettings: {
      findUnique: async ({ where }: { where: { storeId: string } }) => mocks.settings.get(where.storeId) ?? null,
      upsert: mocks.upsert,
    },
    store: {
      findUnique: async ({ where }: { where: { id: string } }) => mocks.stores.get(where.id) ?? null,
      findMany: async () => Array.from(mocks.stores.keys()).map((id) => ({ id })),
      findFirst: async ({ where }: { where: { id?: string; userId?: string } }) => {
        const store = where.id ? mocks.stores.get(where.id) : undefined;
        return store && store.userId === where.userId ? { id: where.id, userId: store.userId } : null;
      },
    },
    order: { findMany: async () => mocks.orders },
  },
}));

import { loadCustomerProfilesForSystemJob } from "@/actions/get-customer-intelligence";
import { GET as recipientsRoute } from "@/app/api/[storeId]/notification-recipients/route";
import { GET as getEmails, PATCH as patchEmails } from "@/app/api/[storeId]/settings/emails/route";
import { isPlaceholderCustomer } from "@/lib/customer-views";
import { __resetShortMemo } from "@/lib/short-memo";
import {
  EMAIL_LIST_MAX_ENTRIES,
  getAdminNotificationRecipients,
  getExcludedCustomerEmails,
  parseEmailList,
} from "@/lib/store-email-settings";

beforeEach(() => {
  __resetShortMemo();
  mocks.settings.clear();
  mocks.stores.clear();
  mocks.upsert.mockReset();
  mocks.orders = [];
  mocks.session.userId = null;
  mocks.session.metadata = null;
  mocks.stores.set("store-1", { email: "Tienda@Ejemplo.test", userId: "user_owner" });
  delete process.env.REVALIDATION_SECRET;
});

describe("parseEmailList", () => {
  it("una por línea (o con comas), en minúscula y sin repetidas", () => {
    expect(parseEmailList(" Ana@Ejemplo.test \nana@ejemplo.test, luis@ejemplo.test\n\n")).toEqual([
      "ana@ejemplo.test",
      "luis@ejemplo.test",
    ]);
  });

  it("rechaza una línea que no es correo y dice cuál", () => {
    expect(() => parseEmailList("ana@ejemplo.test\nno-es-correo", "Correos del equipo")).toThrow(/no-es-correo/);
  });

  it("tiene tope", () => {
    const many = Array.from({ length: EMAIL_LIST_MAX_ENTRIES + 1 }, (_, i) => `p${i}@ejemplo.test`).join("\n");
    expect(() => parseEmailList(many)).toThrow(/hasta/);
  });
});

describe("quién no es clienta", () => {
  it("la lista del equipo, el correo de la tienda y el de relleno", async () => {
    mocks.settings.set("store-1", { excludedCustomerEmails: "equipo@ejemplo.test", adminNotificationEmails: null });
    const excluded = await getExcludedCustomerEmails("store-1");
    expect(excluded.has("equipo@ejemplo.test")).toBe(true);
    expect(excluded.has("tienda@ejemplo.test")).toBe(true);
    expect(excluded.size).toBe(3);
  });

  it("Clientes deja fuera a quien está en la lista", () => {
    const excluded = new Set(["equipo@ejemplo.test"]);
    const person = { fullName: "Ana Prueba", phone: "3001112233" };
    expect(isPlaceholderCustomer({ ...person, email: "EQUIPO@ejemplo.test" }, excluded)).toBe(true);
    expect(isPlaceholderCustomer({ ...person, email: "clienta@ejemplo.test" }, excluded)).toBe(false);
  });

  it("los perfiles de clientas no cuentan los pedidos del equipo", async () => {
    mocks.settings.set("store-1", { excludedCustomerEmails: "equipo@ejemplo.test", adminNotificationEmails: null });
    const order = (email: string) => ({
      email,
      fullName: "Alguien",
      phone: null,
      total: 10000,
      netProfit: 3000,
      createdAt: new Date(),
      paidAt: new Date(),
      orderItems: [],
      payment: null,
      shipping: null,
    });
    mocks.orders = [order("equipo@ejemplo.test"), order("tienda@ejemplo.test"), order("clienta@ejemplo.test")];
    const profiles = await loadCustomerProfilesForSystemJob("store-1");
    expect(profiles.map((profile) => profile.email)).toEqual(["clienta@ejemplo.test"]);
  });
});

describe("quién recibe los avisos", () => {
  it("la lista de Configuración", async () => {
    mocks.settings.set("store-1", { excludedCustomerEmails: null, adminNotificationEmails: "avisos@ejemplo.test\notro@ejemplo.test" });
    expect(await getAdminNotificationRecipients("store-1")).toEqual(["avisos@ejemplo.test", "otro@ejemplo.test"]);
  });

  it("vacía, el correo de la tienda", async () => {
    expect(await getAdminNotificationRecipients("store-1")).toEqual(["tienda@ejemplo.test"]);
  });

  it("sin lista ni correo de la tienda, nadie", async () => {
    mocks.stores.set("store-1", { email: "", userId: "user_owner" });
    expect(await getAdminNotificationRecipients("store-1")).toEqual([]);
  });

  it("sin tienda (alertas de toda la instalación), la unión de todas", async () => {
    mocks.stores.set("store-2", { email: "segunda@ejemplo.test", userId: "user_owner" });
    mocks.settings.set("store-1", { excludedCustomerEmails: null, adminNotificationEmails: "avisos@ejemplo.test" });
    expect(await getAdminNotificationRecipients()).toEqual(["avisos@ejemplo.test", "segunda@ejemplo.test"]);
  });
});

const ctx = { params: { storeId: "store-1" } };
const patch = (body: unknown) =>
  patchEmails(new Request("https://admin.test/x", { method: "PATCH", body: JSON.stringify(body) }), ctx);

describe("Configuración › correos (solo la dueña)", () => {
  it("rechaza sin sesión, a otra tienda y a la cuenta de solo lectura", async () => {
    expect((await getEmails(new Request("https://admin.test/x"), ctx)).status).toBe(401);
    mocks.session.userId = "user_otra";
    expect((await getEmails(new Request("https://admin.test/x"), ctx)).status).toBe(403);
    mocks.session.userId = "user_viewer";
    mocks.session.metadata = { role: "viewer", allowedStoreIds: ["store-1"] };
    expect((await getEmails(new Request("https://admin.test/x"), ctx)).status).toBe(403);
    expect((await patch({ excludedCustomerEmails: "", adminNotificationEmails: "" })).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("la dueña guarda solo las dos listas, ya limpias", async () => {
    mocks.session.userId = "user_owner";
    const response = await patch({ excludedCustomerEmails: "Equipo@Ejemplo.test\n", adminNotificationEmails: "" });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "store-1" },
      create: { storeId: "store-1", excludedCustomerEmails: "equipo@ejemplo.test", adminNotificationEmails: null },
      update: { excludedCustomerEmails: "equipo@ejemplo.test", adminNotificationEmails: null },
    });
  });

  it("una línea inválida no guarda nada", async () => {
    mocks.session.userId = "user_owner";
    expect((await patch({ excludedCustomerEmails: "no-es-correo", adminNotificationEmails: "" })).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("destinatarios para el formulario de contacto de la tienda", () => {
  const ask = (secret?: string) =>
    recipientsRoute(
      new Request("https://admin.test/x", { headers: secret ? { "x-revalidate-secret": secret } : {} }),
      ctx,
    );

  it("sin el secreto configurado o con otro, no dice nada", async () => {
    expect((await ask("algo")).status).toBe(403);
    process.env.REVALIDATION_SECRET = "secreto-de-prueba";
    expect((await ask()).status).toBe(403);
    expect((await ask("secreto-de-prueba-x")).status).toBe(403);
  });

  it("con el secreto, la lista de avisos", async () => {
    process.env.REVALIDATION_SECRET = "secreto-de-prueba";
    mocks.settings.set("store-1", { excludedCustomerEmails: null, adminNotificationEmails: "avisos@ejemplo.test" });
    const response = await ask("secreto-de-prueba");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recipients: ["avisos@ejemplo.test"] });
  });
});
