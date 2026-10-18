// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { patch, post } = vi.hoisted(() => ({
  patch: vi.fn(async () => ({ data: { id: "b-flor" } })),
  post: vi.fn(async () => ({ data: { id: "b-new" } })),
}));

vi.mock("axios", () => ({ default: { patch, post, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "s" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/shell/viewer-access", () => ({ useCanWrite: () => true }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/marcas/[brandId]/components/brand-logo-upload", () => ({
  BrandLogoUpload: () => null,
  LogoPreview: () => null,
  detectLogoBackground: async () => false,
}));

import { BrandForm } from "@/app/(dashboard)/[storeId]/(routes)/marcas/[brandId]/components/brand-form";
import type { BrandDetail, BrandParentOption } from "@/app/(dashboard)/[storeId]/(routes)/marcas/[brandId]/server/get-brand";

const parentOptions: BrandParentOption[] = [
  { id: "b-prima", name: "Primavera", logoUrl: null, aliases: [], isArchived: false },
  { id: "b-kiut", name: "Kiut", logoUrl: null, aliases: [], isArchived: false },
];

function brand(overrides: Partial<BrandDetail> = {}): BrandDetail {
  return {
    id: "b-flor",
    storeId: "s",
    name: "Flower Power",
    slug: "flower-power",
    aliases: [],
    manufacturerName: null,
    logoUrl: null,
    logoPublicId: null,
    logoWidth: null,
    logoHeight: null,
    logoHasBackground: false,
    logoInverseUrl: null,
    color: null,
    seoText: null,
    website: null,
    logoSourceUrl: null,
    logoPermission: "UNKNOWN",
    isVisible: true,
    isFeatured: false,
    isArchived: false,
    sortOrder: 0,
    parentBrandId: null,
    usage: { activeProducts: 0, totalProducts: 0, groups: 0 },
    activeLines: 0,
    ...overrides,
  } as BrandDetail;
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined, configurable: true });
  patch.mockClear();
  post.mockClear();
});
afterEach(cleanup);

describe("BrandForm · «Es una línea de»", () => {
  it("elige la madre y la manda en el PATCH", async () => {
    render(<BrandForm initialData={brand()} parentOptions={parentOptions} storeUrl={null} />);
    const field = screen.getByRole("combobox", { name: "Es una línea de" });
    expect(field.textContent).toContain("Ninguna (marca principal)");
    expect(screen.getByText(/Una línea se ve como una marca propia/)).toBeTruthy();

    fireEvent.click(field);
    fireEvent.click(screen.getByRole("option", { name: /Primavera/ }));
    expect(field.textContent).toContain("Primavera");
    expect(screen.getByText(/«Marca: Primavera · Línea: Flower Power»/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guardar marca" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("/api/s/brands/b-flor", expect.objectContaining({ parentBrandId: "b-prima" }));
  });

  it("«Ninguna» manda null", async () => {
    render(<BrandForm initialData={brand({ parentBrandId: "b-prima" })} parentOptions={parentOptions} storeUrl={null} />);
    const field = screen.getByRole("combobox", { name: "Es una línea de" });
    expect(field.textContent).toContain("Primavera");
    fireEvent.click(field);
    fireEvent.click(screen.getByRole("option", { name: /Ninguna/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar marca" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("/api/s/brands/b-flor", expect.objectContaining({ parentBrandId: null }));
  });

  it("con líneas activas el campo queda apagado y lo explica", () => {
    render(<BrandForm initialData={brand({ activeLines: 2 })} parentOptions={parentOptions} storeUrl={null} />);
    expect((screen.getByRole("combobox", { name: "Es una línea de" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Tiene líneas: no puede ser a su vez una línea de otra marca.")).toBeTruthy();
  });

  it("una marca nueva también puede nacer como línea", async () => {
    render(<BrandForm initialData={null} parentOptions={parentOptions} storeUrl={null} />);
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Otoño" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Es una línea de" }));
    fireEvent.click(screen.getByRole("option", { name: /Kiut/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/api/s/brands", expect.objectContaining({ name: "Otoño", parentBrandId: "b-kiut" }));
  });
});
