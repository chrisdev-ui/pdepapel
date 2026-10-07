// @vitest-environment jsdom

import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { selectedProduct, listState } = vi.hoisted(() => ({
  listState: { rows: [] as unknown[] },
  selectedProduct: {
    id: "product-1",
    name: "Set de marcadores kawaii edición especial con estuche coleccionable",
    sku: "SKU-MARCADOR-KAWAII-EDICION-ESPECIAL-COLECCIONABLE-2026",
    gtin: "77012345678901234567890",
    stock: 12,
    price: 38500,
    category: { name: "Marcadores y resaltadores" },
    images: [],
  },
}));

// La imagen real de Next con el loader del panel: en Vitest no se aplica
// `images.loaderFile` de next.config, así que se le pasa a mano. Así el
// `srcset` que se prueba es el mismo que arma el navegador.
vi.mock("next/image", async () => {
  const actual = await vi.importActual<typeof import("next/image")>("next/image");
  const { default: loader } = await vi.importActual<typeof import("@/lib/cloudinary-image-loader")>("@/lib/cloudinary-image-loader");
  return {
    default: (props: import("next/image").ImageProps) => {
      const { props: img } = actual.getImageProps({ ...props, loader });
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
      return <img {...img} />;
    },
  };
});

/**
 * El candidato que elige el navegador: el más pequeño del `srcset` que cubre
 * el ancho de `sizes` a esa densidad de pantalla (o el mayor, si ninguno).
 */
function requestedSrc(img: HTMLImageElement, cssPx: number, dpr: number) {
  const candidates = (img.getAttribute("srcset") ?? "")
    .split(", ")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(" ");
      return { url, width: Number(descriptor.replace("w", "")) };
    })
    .sort((a, b) => a.width - b.width);
  return (candidates.find((candidate) => candidate.width >= cssPx * dpr) ?? candidates[candidates.length - 1]).url;
}

function stubPhone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
}));

vi.mock("swr", () => ({
  default: (key: string | null) => ({
    data: key ? selectedProduct : undefined,
  }),
}));

vi.mock("swr/infinite", () => ({
  default: () => ({
    data: [{ data: listState.rows.length > 0 ? listState.rows : [selectedProduct], metadata: { hasMore: false } }],
    size: 1,
    setSize: vi.fn(),
    isLoading: false,
    isValidating: false,
  }),
}));

vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

beforeAll(() => {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;
});

describe("AsyncProductSelect", () => {
  it("keeps a selected product with long identifiers within its trigger", () => {
    render(
      <div className="w-80">
        <AsyncProductSelect
          value={selectedProduct.id}
          onChange={() => undefined}
          modal
        />
      </div>,
    );

    const trigger = screen.getByRole("combobox");
    const productName = screen.getByText(selectedProduct.name);
    const details = screen.getByText(/GTIN: 77012345678901234567890/);

    expect(trigger).toHaveClass("min-w-0");
    // El nombre parte en varias líneas en vez de cortarse en una (issue #2).
    // `whitespace-normal` vence al `whitespace-nowrap` del Button: sin él, el
    // nombre medido en el navegador seguía en una línea (issue #2).
    expect(productName).toHaveClass("line-clamp-4", "sm:line-clamp-3", "break-words", "whitespace-normal");
    // `block` pondría `display: block` y el recorte a dos líneas no se aplicaría.
    expect(productName).not.toHaveClass("block");
    expect(productName).not.toHaveClass("truncate");
    expect(productName.parentElement).toHaveClass("min-w-0", "flex-1");
    expect(productName.parentElement?.parentElement).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(details).toHaveClass("truncate");
    expect(details).toHaveAttribute(
      "title",
      expect.stringContaining(selectedProduct.sku),
    );
  });

  it("shows the selected product when the parent controls its value", async () => {
    function ControlledProductSelect() {
      const [value, setValue] = useState("");

      return (
        <AsyncProductSelect
          value={value}
          onChange={(productId) => setValue(productId)}
          modal
          ariaLabel="Seleccionar producto para etiquetar"
        />
      );
    }

    const user = userEvent.setup();
    render(<ControlledProductSelect />);

    const trigger = screen.getByRole("combobox", {
      name: "Seleccionar producto para etiquetar",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("option", { name: new RegExp(selectedProduct.name) }),
    );

    expect(trigger).toHaveTextContent(selectedProduct.name);
  });

  it("forwards a selection while a parent intentionally keeps the trigger clear", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AsyncProductSelect
        value=""
        onChange={onChange}
        modal
        ariaLabel="Agregar producto del catálogo"
      />,
    );

    const trigger = screen.getByRole("combobox", {
      name: "Agregar producto del catálogo",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("option", { name: new RegExp(selectedProduct.name) }),
    );

    expect(onChange).toHaveBeenCalledWith("product-1", selectedProduct);
    expect(trigger).toHaveTextContent("Seleccionar producto...");
  });

  /**
   * Filas como en el lienzo de Etiquetas: «Nombre · Variante», línea mono
   * «SKU · stock · precio», chip de variante, y al final de las variantes de
   * un grupo la fila «todas las variantes» con su cuenta.
   */
  it("renders rich rows and a «todas las variantes» row after the group's last variant", async () => {
    const group = { id: "g1", name: "Cartuchera Wisdom", _count: { products: 2 } };
    listState.rows = [
      { id: "v1", name: "Cartuchera Wisdom", sku: "CAR-ROS", stock: 0, price: 13000, color: { name: "Rosa pastel" }, size: { name: "S" }, productGroupId: "g1", productGroup: group, images: [] },
      { id: "s1", name: "Agenda Hogwarts", sku: "OF-2", stock: 3, price: 19000, images: [] },
      { id: "v2", name: "Cartuchera Wisdom", sku: "CAR-AZU", stock: 1, price: 13000, color: { name: "Azul pastel" }, size: { name: "S" }, productGroupId: "g1", productGroup: group, images: [] },
    ];
    cleanup();
    const onSelectGroup = vi.fn();
    const user = userEvent.setup();
    render(<AsyncProductSelect value="" onChange={() => undefined} onSelectGroup={onSelectGroup} modal />);
    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Cartuchera Wisdom · Rosa pastel · S")).toBeInTheDocument();
    expect(screen.getByText("CAR-ROS · 0 und · $ 13.000")).toHaveClass("font-mono");
    expect(screen.getAllByText("Variante")).toHaveLength(2);
    const groupRow = document.querySelector('[data-group-row="g1"]') as HTMLElement;
    expect(groupRow).not.toBeNull();
    expect(groupRow.textContent).toContain("Cartuchera Wisdom · todas las variantes");
    expect(groupRow.textContent).toContain("(2)");
    expect(groupRow.textContent).toContain("Grupo");
    // Después de la última variante del grupo (v2), no después de la primera.
    const rows = Array.from(document.querySelectorAll("[cmdk-item]")).map((el) => el.getAttribute("data-value"));
    expect(rows).toEqual(["v1", "s1", "v2", "group:g1"]);

    await user.click(groupRow);
    expect(onSelectGroup).toHaveBeenCalledWith({ id: "g1", name: "Cartuchera Wisdom", count: 2 });
    listState.rows = [];
  });
  /** Aprovisionamiento: el disparador cerrado dice «SKU · stock · costo», no el precio de venta. */
  it("shows SKU, stock and purchase cost in the closed trigger when asked for cost details", () => {
    listState.rows = [{ ...selectedProduct, acqPrice: 21500 }];
    cleanup();
    render(<AsyncProductSelect value={selectedProduct.id} onChange={() => undefined} details="cost" modal />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent(`SKU: ${selectedProduct.sku} · Stock: 12 · Costo: $ 21.500`);
    expect(trigger).not.toHaveTextContent("38.500");
    expect(trigger).not.toHaveTextContent("GTIN");
    listState.rows = [];
  });
  /**
   * Issue #2: la lista copiaba el ancho del disparador (34 px en escritorio),
   * los nombres se cortaban en una línea y cada miniatura de 30 px pedía la
   * foto a 1080/1600 px.
   */
  describe("lista legible (issue #2)", () => {
    const longRows = [
      { id: "c1", name: "Carpeta Archivadora Fashion Pastel con 5 compartimientos Verde pastel", sku: "ARC-VER", stock: 4, price: 9900, color: { name: "Verde pastel" }, size: { name: "L" }, design: { name: "Moderno" }, productGroupId: "g1", productGroup: { id: "g1", name: "Carpeta Archivadora Fashion Pastel", _count: { products: 2 } }, images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/audit/p0.jpg" }] },
      { id: "c2", name: "Carpeta Archivadora Fashion Pastel con 5 compartimientos Rosa pastel", sku: "ARC-ROS", stock: 7, price: 13000, color: { name: "Rosa pastel" }, size: { name: "L" }, design: { name: "Moderno" }, productGroupId: "g1", productGroup: { id: "g1", name: "Carpeta Archivadora Fashion Pastel", _count: { products: 2 } }, images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/audit/p1.jpg" }] },
    ];

    afterEach(() => {
      listState.rows = [];
      Reflect.deleteProperty(window, "matchMedia");
    });

    it("opens a list at least min(36rem, viewport - 2rem) wide that never copies the trigger width", async () => {
      listState.rows = longRows;
      cleanup();
      const user = userEvent.setup();
      render(<AsyncProductSelect value="" onChange={() => undefined} ariaLabel="Producto de la línea 1" />);
      await user.click(screen.getByRole("combobox", { name: "Producto de la línea 1" }));

      const list = document.querySelector("[data-product-select-list]") as HTMLElement;
      expect(list).not.toBeNull();
      expect(list.style.width).toBe("");
      expect(list).toHaveClass("w-[max(var(--radix-popover-trigger-width),min(36rem,calc(100vw-2rem)))]");
      expect(list).toHaveClass("max-w-[calc(100vw-2rem)]");
      expect(list).not.toHaveClass("w-72");
      expect(list.querySelector("[cmdk-list]")).toHaveClass("max-h-[min(420px,50dvh)]");
    });

    it("wraps option names (two lines from sm, three on phones) and shows only the variant the name does not already say", async () => {
      listState.rows = longRows;
      cleanup();
      const user = userEvent.setup();
      render(<AsyncProductSelect value="" onChange={() => undefined} />);
      await user.click(screen.getByRole("combobox"));

      const title = await screen.findByText("Carpeta Archivadora Fashion Pastel con 5 compartimientos Verde pastel · L · Moderno");
      // Dos líneas desde `sm`, tres en teléfono.
      expect(title).toHaveClass("line-clamp-3", "sm:line-clamp-2", "break-words");
      expect(title).not.toHaveClass("truncate");
      expect(title).not.toHaveClass("block");
      expect(title).toHaveAttribute("title", title.textContent);
      expect(title.textContent).not.toContain("Verde pastel · Verde pastel");
    });

    it("asks Cloudinary for the 128 px copy for the 32 px thumbnail at any screen density", async () => {
      listState.rows = longRows;
      cleanup();
      const user = userEvent.setup();
      render(<AsyncProductSelect value="" onChange={() => undefined} />);
      await user.click(screen.getByRole("combobox"));

      const img = (await screen.findAllByRole("img"))[0] as HTMLImageElement;
      expect(img).toHaveAttribute("sizes", "32px");
      for (const dpr of [1, 1.25, 2, 3]) {
        expect(requestedSrc(img, 32, dpr)).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_128/v1/audit/p0.jpg");
      }
    });

    it("modal=auto opens a dialog on phones and the anchored list from sm up", async () => {
      listState.rows = longRows;
      cleanup();
      stubPhone(true);
      const user = userEvent.setup();
      const { unmount } = render(<AsyncProductSelect value="" onChange={() => undefined} modal="auto" ariaLabel="Producto de la línea 1" />);
      await user.click(screen.getByRole("combobox", { name: "Producto de la línea 1" }));
      expect(await screen.findByRole("dialog", { name: "Producto de la línea 1" })).toBeInTheDocument();
      expect(document.querySelector("[data-product-select-list]")).toBeNull();
      unmount();

      stubPhone(false);
      render(<AsyncProductSelect value="" onChange={() => undefined} modal="auto" ariaLabel="Producto de la línea 1" />);
      await user.click(screen.getByRole("combobox", { name: "Producto de la línea 1" }));
      expect(document.querySelector("[data-product-select-list]")).not.toBeNull();
    });
  });
});
