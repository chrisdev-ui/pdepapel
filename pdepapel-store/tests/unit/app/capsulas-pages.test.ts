import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentCapsuleEdition: vi.fn(),
  getCapsuleEdition: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/actions/get-current-capsule-edition", () => ({
  getCurrentCapsuleEdition: mocks.getCurrentCapsuleEdition,
  capsuleEditionPath: (edition: { segment: string }) => `/capsulas/${edition.segment}`,
}));
vi.mock("@/actions/get-capsule-edition", () => ({ getCapsuleEdition: mocks.getCapsuleEdition }));
vi.mock("@/components/newsletter", () => ({ Newsletter: () => null }));
vi.mock("@/components/capsules/capsule-edition-view", () => ({ CapsuleEditionView: () => null }));

import CapsulesPage, { dynamic, generateMetadata as capsulesMetadata } from "@/app/(routes)/capsulas/page";
import { generateMetadata as editionMetadata } from "@/app/(routes)/capsulas/[edicion]/page";

const live = { number: 1, name: "Escritorio", theme: "escritorio", segment: "1-escritorio", coverImage: null, fromPack: { packSize: 5, total: 64500 } };
const editionData = (extra: Record<string, unknown> = {}) => ({
  edition: { number: 1, name: "Escritorio", segment: "1-escritorio", status: "LIVE" },
  preview: false,
  salesEnabled: true,
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("/capsulas (el enlace de la bio)", () => {
  it("es dinámica: prerenderizada sin edición, leer los utm_* daba 500 al abrir una", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("con la venta apagada da 404 y no se indexa", async () => {
    mocks.getCurrentCapsuleEdition.mockResolvedValue({ salesEnabled: false, edition: null });
    await expect(CapsulesPage({ searchParams: {} })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await capsulesMetadata()).robots).toEqual({ index: false, follow: false });
  });

  it("con una edición a la venta redirige a ella conservando los utm_*", async () => {
    mocks.getCurrentCapsuleEdition.mockResolvedValue({ salesEnabled: true, edition: live });
    await expect(CapsulesPage({ searchParams: { utm_source: "instagram", utm_campaign: "capsulas", otro: "x" } })).rejects.toThrow(
      "NEXT_REDIRECT /capsulas/1-escritorio?utm_source=instagram&utm_campaign=capsulas",
    );
  });

  it("entre ediciones muestra la página «Entre ediciones», indexable", async () => {
    mocks.getCurrentCapsuleEdition.mockResolvedValue({ salesEnabled: true, edition: null });
    const page = await CapsulesPage({ searchParams: {} });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Entre ediciones");
    expect(html).toContain('href="https://instagram.com/papeleria.pdepapel"');
    expect(html).toContain('href="https://tiktok.com/@papeleria.pdepapel"');
    expect(html).toContain('href="https://www.facebook.com/papeleriapdepapel/"');
    expect(html).toContain('href="https://www.youtube.com/@papeleriapdepapel"');
    expect(html).toContain('aria-label="YouTube de P de Papel"');
    expect(mocks.redirect).not.toHaveBeenCalled();
    const metadata = await capsulesMetadata();
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/capsulas");
  });
});

describe("/capsulas/[edicion] metadata", () => {
  const params = { params: { edicion: "1-escritorio" }, searchParams: {} };

  it("se indexa solo la edición a la venta vista sin enlace de vista previa", async () => {
    mocks.getCapsuleEdition.mockResolvedValue(editionData());
    const metadata = await editionMetadata(params);
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("/capsulas/1-escritorio");
  });

  it.each([
    ["una vista previa", editionData({ preview: true })],
    ["una edición en vista previa", editionData({ edition: { number: 1, name: "Escritorio", segment: "1-escritorio", status: "PREVIEW" }, preview: true })],
    ["la venta apagada", editionData({ salesEnabled: false, preview: true })],
  ])("%s queda fuera del índice", async (_case, data) => {
    mocks.getCapsuleEdition.mockResolvedValue(data);
    const metadata = await editionMetadata(params);
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
  });
});
