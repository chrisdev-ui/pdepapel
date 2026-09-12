// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupplierForm } from "@/app/(dashboard)/[storeId]/(routes)/proveedores/[supplierId]/components/supplier-form";
import type { SupplierDetail } from "@/lib/suppliers";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", supplierId: "sup-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/hooks/use-form-validation-toast", () => ({ useFormValidationToast: () => undefined }));
vi.mock("axios", () => ({
  default: {
    patch: mocks.patch,
    post: mocks.post,
    delete: mocks.del,
    isAxiosError: (error: unknown) => typeof error === "object" && error !== null && "isAxiosError" in error,
  },
}));
// El selector de país de react-phone-number-input no aporta nada a estas
// pruebas; un input plano conserva el contrato value/onChange del formulario.
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({
    value,
    onChange,
    onBlur,
    defaultCountry: _country,
    ...props
  }: {
    value?: string;
    onChange?: (value: string) => void;
    onBlur?: () => void;
    defaultCountry?: string;
    [key: string]: unknown;
  }) => (
    <input
      {...(props as Record<string, string>)}
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={onBlur}
    />
  ),
}));

const supplier: SupplierDetail = {
  id: "sup-1",
  storeId: "store-1",
  name: "Henko Importaciones",
  nit: "900.123.456-7",
  contactName: "Laura Gómez",
  phone: "+573001234567",
  email: "ventas@henko.com",
  leadTimeDays: 15,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  usage: {
    products: 38,
    restockOrders: 6,
    orderedRestockOrders: 0,
    receivingRestockOrders: 1,
    lastPurchaseAt: new Date("2026-08-05T15:00:00.000Z"),
  },
  recentRestockOrders: [
    { id: "ro-1", orderNumber: "PO-1006", status: "PARTIALLY_RECEIVED", createdAt: new Date("2026-08-05T15:00:00.000Z"), totalAmount: 250000 },
  ],
};

const unused: SupplierDetail = {
  ...supplier,
  id: "sup-2",
  name: "Kawaii Co",
  usage: { products: 0, restockOrders: 0, orderedRestockOrders: 0, receivingRestockOrders: 0, lastPurchaseAt: null },
  recentRestockOrders: [],
};

const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label, { exact: false }), { target: { value } });

describe("SupplierForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patch.mockResolvedValue({ data: {} });
    mocks.post.mockResolvedValue({ data: {} });
  });
  afterEach(cleanup);

  it("renders the sections, the headline and the usage card of a referenced supplier", () => {
    render(<SupplierForm initialData={supplier} />);

    expect(screen.getByRole("heading", { name: "Editar proveedor" })).toBeInTheDocument();
    expect(
      screen.getByText("Henko Importaciones · 38 productos · 6 pedidos de aprovisionamiento · última compra el 5 de ago"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Identificación" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contacto" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Con este proveedor" })).toBeInTheDocument();
    expect(screen.getByText("Para cruzar con las facturas de proveedores.")).toBeInTheDocument();
    expect(screen.getByText("Se usa para avisar cuando un pedido se pasa de fecha.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "38 productos" })).toHaveAttribute("href", "/store-1/productos?proveedor=sup-1");
    expect(screen.getByRole("link", { name: "6" })).toHaveAttribute("href", "/store-1/aprovisionamiento?proveedor=sup-1");
    expect(screen.getByText("1 recibiendo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PO-1006" })).toHaveAttribute("href", "/store-1/aprovisionamiento/ro-1");
  });

  it("disables Eliminar and explains why when products or orders reference the supplier", () => {
    render(<SupplierForm initialData={supplier} />);

    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(
      screen.getByText(
        "No se puede eliminar: 38 productos y 6 pedidos de aprovisionamiento lo referencian. Reasigna los productos y conserva los pedidos como historial.",
      ),
    ).toBeInTheDocument();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("asks before deleting an unreferenced supplier and calls the API on confirm", async () => {
    mocks.del.mockResolvedValue({ data: "ok" });
    render(<SupplierForm initialData={unused} />);

    const button = screen.getByRole("button", { name: "Eliminar" });
    expect(button).toBeEnabled();
    await act(async () => fireEvent.click(button));
    expect(await screen.findByText("¿Eliminar el proveedor «Kawaii Co»?")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Eliminar" }).at(-1)!));

    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith("/api/store-1/suppliers/sup-2"));
    expect(mocks.push).toHaveBeenCalledWith("/store-1/suppliers");
  });

  it("submits the parsed fields with PATCH and returns to the list", async () => {
    render(<SupplierForm initialData={supplier} />);

    type("Correo", "  Compras@Henko.COM ");
    type("Tiempo de entrega habitual", "20");
    type("NIT o cédula", "");
    type("Notas", "Mínimo 10 unidades por referencia.");

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/suppliers/sup-1", {
      name: "Henko Importaciones",
      nit: null,
      contactName: "Laura Gómez",
      phone: "+573001234567",
      email: "compras@henko.com",
      leadTimeDays: 20,
      notes: "Mínimo 10 unidades por referencia.",
    });
    expect(mocks.push).toHaveBeenCalledWith("/store-1/suppliers");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success", title: "Proveedor actualizado." }));
  });

  it("creates a new supplier with POST", async () => {
    render(<SupplierForm initialData={null} />);

    expect(screen.getByRole("heading", { name: "Nuevo proveedor" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Con este proveedor" })).toBeNull();

    type("Nombre", "Kawaii Co");
    type("WhatsApp o teléfono", "+57 300 123 4567");
    fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/suppliers", expect.objectContaining({ name: "Kawaii Co", phone: "+573001234567", email: null, leadTimeDays: null }));
  });

  it("shows the Spanish validation message and does not submit an invalid email", async () => {
    render(<SupplierForm initialData={supplier} />);

    type("Correo", "ventas@");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Escribe un correo válido, por ejemplo ventas@proveedor.com");
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("asks before leaving a dirty form and leaves a clean one at once", async () => {
    render(<SupplierForm initialData={supplier} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Volver a proveedores" })));
    expect(mocks.push).toHaveBeenCalledWith("/store-1/suppliers");
    mocks.push.mockClear();

    type("Persona de contacto", "Otra persona");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Volver a proveedores" })));
    expect(await screen.findByText("¿Salir sin guardar?")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Seguir editando" })));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("surfaces the server conflict in the toast", async () => {
    mocks.patch.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "Ya existe un proveedor llamado «Kawaii Co» en esta tienda." } },
    });
    render(<SupplierForm initialData={supplier} />);

    type("Nombre", "Kawaii Co");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: expect.stringContaining("Ya existe un proveedor llamado") }),
      ),
    );
  });
});
