// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Otra pestaña guardó este mismo grupo: esta deja de guardar su borrador (que
 * tiene los mismos SKU), lo borra y ofrece abrir lo guardado. Así un segundo
 * «Guardar» no vuelve a mandar el mismo grupo desde un borrador viejo.
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
import { announceDraftSaved } from "@/lib/draft-broadcast";

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

    announceDraftSaved(key, "grupo-9");

    await waitFor(() => expect(mocks.clearStorage).toHaveBeenCalled());
    await waitFor(() => expect(mocks.persist.at(-1)?.enabled).toBe(false));
    const notice = mocks.toast.mock.calls.map(([arg]) => arg).find((arg) => arg?.title === "Este grupo ya se guardó en otra pestaña");
    expect(notice).toBeDefined();
    expect(notice.action).toBeDefined();
  });

  it("el aviso de otro borrador (otra llave) no lo toca", async () => {
    render(<ProductGroupForm categories={[]} sizes={[]} colors={[]} designs={[]} suppliers={[]} />);
    announceDraftSaved("product-group-form-store-1-otro", "grupo-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.clearStorage).not.toHaveBeenCalled();
    expect(mocks.persist.at(-1)?.enabled).toBe(true);
  });
});
