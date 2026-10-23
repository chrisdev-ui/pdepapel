// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Ajustes › Cápsulas: guardar manda solo lo que se cambió. La plantilla viaja
 * únicamente si se tocó, así que guardar el margen no crea packs con campos
 * que nadie llenó. La caja en 0 solo vale marcada «Sin caja»; el regalo en 0
 * siempre vale.
 */
const mocks = vi.hoisted(() => ({
  put: vi.fn(async (_url: string, body: Record<string, unknown>) => ({
    data: { minSlipCost: 3000, minMarginPct: (body.minMarginPct as number | undefined) ?? 50, template: [], activeSource: null },
  })),
  toast: vi.fn(),
}));

vi.mock("axios", () => ({ default: { put: mocks.put, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

import { CapsulesPanel } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/capsules-panel";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

const empty = { minSlipCost: 3000, minMarginPct: null, template: [], activeSource: null };
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar ajustes de cápsulas" }));
const sizes = CAPSULE_PACK_PRICES.map((price) => price.packSize);

afterEach(() => {
  cleanup();
  mocks.put.mockClear();
  mocks.toast.mockClear();
});

describe("Ajustes de cápsulas", () => {
  it("cambiar solo el margen manda solo el margen: ni el piso del papel ni una plantilla vacía", async () => {
    render(<CapsulesPanel initial={empty} />);
    fireEvent.change(screen.getByLabelText("Margen mínimo de cápsulas (%)"), { target: { value: "50" } });
    save();
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put.mock.calls[0][1]).toEqual({ minMarginPct: 50 });
  });

  it("sin cambios no llama a la API", () => {
    render(<CapsulesPanel initial={empty} />);
    save();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ description: "No hay cambios para guardar" });
  });

  it("una caja vacía no se guarda: hay que escribir el costo o marcar «Sin caja»", () => {
    render(<CapsulesPanel initial={empty} />);
    fireEvent.change(document.getElementById(`plantilla-${sizes[0]}-caja`)!, { target: { value: "1500" } });
    save();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/Falta el costo de la caja del pack de \d+: escríbelo o marca «Sin caja»/) }));
  });

  it("«Sin caja» es un 0 explícito; los regalos en 0 valen", async () => {
    render(<CapsulesPanel initial={empty} />);
    const [first, ...rest] = sizes;
    expect(screen.getAllByRole("checkbox", { name: "Sin caja" })).toHaveLength(sizes.length);
    fireEvent.click(document.getElementById(`plantilla-${first}-sin-caja`)!);
    for (const size of rest) fireEvent.change(document.getElementById(`plantilla-${size}-caja`)!, { target: { value: "1.500" } });
    expect((document.getElementById(`plantilla-${first}-caja`) as HTMLInputElement).disabled).toBe(true);
    save();
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    const body = mocks.put.mock.calls[0][1] as { template: { packSize: number; boxReserveCost: number; noBox: boolean; giftMaxCost: number }[] };
    expect(Object.keys(body)).toEqual(["template"]);
    expect(body.template.find((row) => row.packSize === first)).toMatchObject({ boxReserveCost: 0, noBox: true, giftMaxCost: 0 });
    for (const size of rest) expect(body.template.find((row) => row.packSize === size)).toMatchObject({ boxReserveCost: 1500, noBox: false });
  });

  it("una fila guardada con caja en 0 se muestra como «Sin caja», no como un costo vacío", () => {
    const template = sizes.map((packSize) => ({ packSize, giftMaxCost: 0, giftMaxItems: 0, giftLabel: null, boxReserveCost: packSize === sizes[0] ? 0 : 1500, noBox: packSize === sizes[0] }));
    render(<CapsulesPanel initial={{ ...empty, template }} />);
    expect((document.getElementById(`plantilla-${sizes[0]}-sin-caja`) as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById(`plantilla-${sizes[1]}-caja`) as HTMLInputElement).value).toBe("1500");
  });
});
