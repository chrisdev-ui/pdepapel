// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Otra pestaña guardó este mismo grupo: esta deja de guardar su borrador (que
 * tiene los mismos SKU), lo borra y ofrece abrir lo guardado. Así un segundo
 * «Guardar» no vuelve a mandar el mismo grupo desde un borrador viejo.
 *
 * El aviso de la propia pestaña no cuenta: con una sola pestaña abierta, cada
 * guardado mostraba «Este grupo se guardó en otra pestaña» (regresión de
 * b6710ce7). La «otra pestaña» se simula con un segundo `createDraftBroadcast`.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  clearStorage: vi.fn(),
  persist: [] as Array<{ key: string; enabled?: boolean }>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({
  useFormPersist: (options: { key: string; enabled?: boolean }) => {
    mocks.persist.push({ key: options.key, enabled: options.enabled });
    return { clearStorage: mocks.clearStorage };
  },
}));
vi.mock("@/components/ui/image-upload", () => ({ ImageUpload: () => <div data-testid="image-upload" /> }));
vi.mock("@/actions/cleanup-images", () => ({ cleanupImages: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("axios", () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn().mockResolvedValue({ data: [] }), isAxiosError: () => false },
}));

import { ProductGroupForm } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form";
import { announceDraftSaved, createDraftBroadcast } from "@/lib/draft-broadcast";

const otherTab = createDraftBroadcast("otra-pestana");
const wait = () => new Promise((resolve) => setTimeout(resolve, 50));
const notices = () => mocks.toast.mock.calls.map(([arg]) => arg?.title).filter((title) => typeof title === "string" && title.includes("otra pestaña"));

class ObservadorVacio {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.persist = [];
  vi.stubGlobal("IntersectionObserver", ObservadorVacio);
  vi.stubGlobal("ResizeObserver", ObservadorVacio);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("grupo nuevo guardado en otra pestaña", () => {
  it("borra el borrador, deja de guardarlo y ofrece «Ver grupo»", async () => {
    render(<ProductGroupForm categories={[]} sizes={[]} colors={[]} designs={[]} suppliers={[]} />);
    const key = mocks.persist[0].key;
    expect(key).toBe("product-group-form-store-1-new");
    expect(mocks.persist.at(-1)?.enabled).toBe(true);

    otherTab.announceDraftSaved(key, "grupo-9");

    await waitFor(() => expect(mocks.clearStorage).toHaveBeenCalled());
    await waitFor(() => expect(mocks.persist.at(-1)?.enabled).toBe(false));
    const notice = mocks.toast.mock.calls.map(([arg]) => arg).find((arg) => arg?.title === "Este grupo ya se guardó en otra pestaña");
    expect(notice).toBeDefined();
    expect(notice.action).toBeDefined();
  });

  it("el aviso de otro borrador (otra llave) no lo toca", async () => {
    render(<ProductGroupForm categories={[]} sizes={[]} colors={[]} designs={[]} suppliers={[]} />);
    otherTab.announceDraftSaved("product-group-form-store-1-otro", "grupo-1");
    await wait();
    expect(mocks.clearStorage).not.toHaveBeenCalled();
    expect(mocks.persist.at(-1)?.enabled).toBe(true);
  });

  it("lo que avisa esta misma pestaña al guardar no muestra el aviso ni apaga el borrador", async () => {
    render(<ProductGroupForm categories={[]} sizes={[]} colors={[]} designs={[]} suppliers={[]} />);
    announceDraftSaved(mocks.persist[0].key, "grupo-9");
    await wait();
    expect(notices()).toEqual([]);
    expect(mocks.clearStorage).not.toHaveBeenCalled();
    expect(mocks.persist.at(-1)?.enabled).toBe(true);
  });
});

describe("editar un grupo existente", () => {
  const group = (id: string) => ({ id, name: `Grupo ${id}`, description: "", products: [], images: [] }) as never;

  it("cada grupo usa su propia llave; guardar el grupo B en otra pestaña no toca el A", async () => {
    render(<ProductGroupForm initialData={group("grupo-a")} categories={[]} sizes={[]} colors={[]} designs={[]} suppliers={[]} />);
    expect(mocks.persist[0].key).toBe("product-group-form-store-1-grupo-a");
    otherTab.announceDraftSaved("product-group-form-store-1-grupo-b", "grupo-b");
    await wait();
    expect(notices()).toEqual([]);
    expect(mocks.persist.at(-1)?.enabled).toBe(true);
  });

  it("guardar el mismo grupo en esta pestaña no avisa; en otra pestaña sí", async () => {
    render(<ProductGroupForm initialData={group("grupo-a")} categories={[]} sizes={[]} colors={[]} designs={[]} suppliers={[]} />);
    const key = mocks.persist[0].key;
    announceDraftSaved(key, "grupo-a");
    await wait();
    expect(notices()).toEqual([]);
    otherTab.announceDraftSaved(key, "grupo-a");
    await waitFor(() => expect(notices()).toEqual(["Este grupo se guardó en otra pestaña"]));
  });
});
