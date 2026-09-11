// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoxForm } from "@/app/(dashboard)/[storeId]/(routes)/cajas/[boxId]/components/box-form";
import { EMPTY_PREVIEW_MESSAGE } from "@/app/(dashboard)/[storeId]/(routes)/cajas/[boxId]/components/box-3d-preview";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", boxId: "new" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({
  useFormPersist: () => ({ clearStorage: vi.fn() }),
}));
vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.del,
    isAxiosError: (error: unknown) =>
      typeof error === "object" && error !== null && "isAxiosError" in error,
  },
}));

const storedBox = {
  id: "box-1",
  storeId: "store-1",
  name: "Caja mediana",
  type: "M",
  width: 33,
  height: 10,
  length: 20,
  isDefault: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function fillMeasure(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: false }), {
    target: { value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {} });
});
afterEach(() => cleanup());

describe("BoxForm", () => {
  it("starts empty with placeholders and shows the preview empty state", () => {
    render(<BoxForm initialData={null} />);

    const width = screen.getByLabelText("Ancho", { exact: false }) as HTMLInputElement;
    expect(width.value).toBe("");
    expect(width.placeholder).toBe("Ej. 20");
    expect(width.getAttribute("type")).toBe("text");
    expect(width.getAttribute("inputmode")).toBe("decimal");
    expect(document.querySelector("form")?.hasAttribute("novalidate")).toBe(true);

    expect(screen.getAllByText(EMPTY_PREVIEW_MESSAGE).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("box-preview-readout")).toBeNull();
  });

  it("keeps the empty state until every measure is valid, then prints es-CO values", () => {
    render(<BoxForm initialData={null} />);

    fillMeasure("Ancho", "12,5");
    fillMeasure("Alto", "10");
    expect(screen.getAllByText(EMPTY_PREVIEW_MESSAGE).length).toBeGreaterThan(0);

    fillMeasure("Largo", "20");
    expect(screen.queryByText(EMPTY_PREVIEW_MESSAGE)).toBeNull();
    expect(screen.getByTestId("box-preview-readout")).toHaveTextContent(
      "12,5 × 10 × 20 cm",
    );
    expect(screen.getByTestId("box-preview-readout")).toHaveTextContent("Vol: 2,5 L");
    expect(screen.getByTestId("box-measures-readout")).toHaveTextContent("0,5 kg");
  });

  it("submits 12.5 when the admin types 12,5", async () => {
    render(<BoxForm initialData={null} />);

    fireEvent.change(screen.getByLabelText("Nombre", { exact: false }), {
      target: { value: "Caja kraft" },
    });
    fillMeasure("Ancho", "12,5");
    fillMeasure("Alto", "10");
    fillMeasure("Largo", "20");

    fireEvent.click(screen.getByRole("button", { name: "Crear caja" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/boxes", {
      name: "Caja kraft",
      type: "M",
      width: 12.5,
      height: 10,
      length: 20,
      isDefault: false,
    });
    expect(mocks.push).toHaveBeenCalledWith("/store-1/configuracion?tab=envios");
  });

  it("does not submit when a measure is missing and shows the Spanish message", async () => {
    render(<BoxForm initialData={null} />);

    fireEvent.change(screen.getByLabelText("Nombre", { exact: false }), {
      target: { value: "Caja kraft" },
    });
    fillMeasure("Ancho", "12,5");
    fillMeasure("Alto", "10");

    fireEvent.click(screen.getByRole("button", { name: "Crear caja" }));

    await screen.findByText("Ingresa la medida en centímetros");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("explains why a box in use cannot be deleted and disables the button", () => {
    render(<BoxForm initialData={storedBox} shipmentsCount={3} />);

    expect(screen.getByText(/3 envíos la usan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar caja" })).toBeDisabled();
    expect(screen.getByTestId("box-preview-readout")).toHaveTextContent("33 × 10 × 20 cm");
  });

  it("surfaces the server error message in the toast", async () => {
    mocks.post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "Ya existe una caja llamada «Caja kraft» en esta tienda. Usa otro nombre." } },
    });
    render(<BoxForm initialData={null} />);

    fireEvent.change(screen.getByLabelText("Nombre", { exact: false }), {
      target: { value: "Caja kraft" },
    });
    fillMeasure("Ancho", "12,5");
    fillMeasure("Alto", "10");
    fillMeasure("Largo", "20");
    fireEvent.click(screen.getByRole("button", { name: "Crear caja" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringContaining("Ya existe una caja llamada"),
        }),
      ),
    );
  });
});
