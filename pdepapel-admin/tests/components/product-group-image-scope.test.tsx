// @vitest-environment jsdom

/**
 * Elegir «Todas las variantes» en el reparto de fotos tiene que guardar
 * (chrisdev-ui/pdepapel#1).
 *
 * Paula dejaba una foto en «Todas las variantes» y el grupo no se guardaba:
 * «1 foto no tiene un destino asignado». El selector de cada foto pintaba
 * «Todas las variantes» también cuando la foto no tenía entrada en el
 * reparto, y Radix Select no avisa cuando se elige el valor que ya está
 * puesto, así que elegirlo no escribía nada y el freno de d8740ae9 —que
 * cuenta entradas, con razón— seguía frenando.
 *
 * Se cubre el camino de crear y el de editar, porque llegan al reparto por
 * lados distintos: al crear ninguna foto trae entrada; al editar las
 * guardadas sí (se reconstruyen) y solo las nuevas llegan sin ella.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Foto = { url: string; isMain?: boolean };

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  /** Lo que «sube» el botón falso de fotos. */
  subidas: [] as { url: string; isMain?: boolean }[],
  /** Borrador restaurado al abrir «Nuevo grupo» (camino de crear). */
  borrador: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
/**
 * El borrador del navegador es la forma real de llegar a «Nuevo grupo» con
 * fotos, colores y variantes ya puestos sin pasar por la subida a
 * Cloudinary ni por los selectores de atributos.
 */
vi.mock("@/hooks/use-form-persist", async () => {
  const { useEffect } = await import("react");
  return {
    useFormPersist: ({ form }: { form: { reset: (v: unknown) => void; getValues: () => object } }) => {
      useEffect(() => {
        if (mocks.borrador) form.reset({ ...form.getValues(), ...mocks.borrador });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return { clearStorage: vi.fn() };
    },
  };
});
vi.mock("@/components/ui/image-upload", () => ({
  ImageUpload: (props: {
    value: Foto[];
    onChange: (value: Foto[]) => void;
    onMarkRemoval?: (url: string) => void;
  }) => (
    <div data-testid="image-upload">
      <button type="button" onClick={() => props.onChange([...props.value, ...mocks.subidas])}>
        subir fotos
      </button>
      {props.value.map((foto) => (
        <button key={foto.url} type="button" onClick={() => props.onMarkRemoval?.(foto.url)}>
          {`quitar ${foto.url}`}
        </button>
      ))}
    </div>
  ),
}));
/**
 * Lo que no participa en el reparto de fotos ni en lo que se envía al
 * guardar se sustituye por un marcador. Montar el formulario entero (editor
 * Tiptap, tabla y matriz de variantes, asistente de nombres, importador,
 * escáner) en cada interacción hacía que, con la máquina cargada (la suite
 * completa en paralelo), algunas pruebas pasaran los 5 s de límite: fallaban
 * por tiempo, no por lógica. Los valores del formulario y el envío no
 * dependen de estos componentes.
 */
vi.mock("@/components/editor/rich-text-editor", () => ({ RichTextEditor: () => <div data-testid="rich-text" /> }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/productos/components/variant-grid", () => ({ VariantGrid: () => <div data-testid="variant-grid" /> }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/productos/components/variant-matrix", () => ({ VariantMatrix: () => <div data-testid="variant-matrix" /> }));
vi.mock("@/components/products/product-name-assistant", () => ({ ProductNameAssistant: () => null }));
vi.mock("@/components/modals/product-import-modal", () => ({ ProductImportModal: () => null }));
vi.mock("@/components/products/scan-into-group-button", () => ({ ScanIntoGroupButton: () => null }));
vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.del,
    get: vi.fn().mockResolvedValue({ data: [] }),
    isAxiosError: (e: unknown) => typeof e === "object" && e !== null && "isAxiosError" in e,
  },
}));

import { ProductGroupForm } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form";

const color = { id: "color-1", name: "Lila", value: "#C8A2C8", storeId: "store-1" } as never;
const color2 = { id: "color-2", name: "Menta", value: "#98FF98", storeId: "store-1" } as never;
const design = { id: "design-1", name: "Gatito", storeId: "store-1" } as never;
const size = { id: "size-1", name: "Único", value: "U", storeId: "store-1" } as never;
const category = { id: "cat-1", name: "Cartucheras", storeId: "store-1" } as never;

const variante = (id: string, colorId: string) => ({
  id,
  name: `Cartuchera ${colorId}`,
  sku: `SKU-${id}`,
  price: 20000,
  acqPrice: 10000,
  stock: 3,
  isFeatured: false,
  isArchived: false,
  images: [] as { id: string; url: string; isMain: boolean }[],
  categoryId: "cat-1",
  sizeId: "size-1",
  colorId,
  designId: "design-1",
  size: { id: "size-1", name: "Único", value: "U" },
  color: { id: colorId, name: colorId === "color-1" ? "Lila" : "Menta", value: "#000000" },
  design: { id: "design-1", name: "Gatito" },
});

/** Un grupo guardado tal como lo carga la página: sin `imageMapping`. */
function grupoGuardado(productos = [variante("p1", "color-1"), variante("p2", "color-2")]) {
  return {
    id: "group-1",
    name: "Cartuchera kawaii",
    storeId: "store-1",
    categoryId: "cat-1",
    images: [
      { id: "i1", url: "a.jpg", isMain: true },
      { id: "i2", url: "b.jpg", isMain: false },
    ],
    products: productos,
  } as never;
}

/** Fila generada (sin id) como las deja «Nuevo grupo». */
const filaNueva = (colorId: string, nombre: string) => ({
  sku: `NEW-${colorId}`,
  name: `Cartuchera ${nombre}`,
  size: { id: "size-1", name: "Único", value: "U" },
  color: { id: colorId, name: nombre, value: "#000000" },
  design: { id: "design-1", name: "Gatito" },
  price: 20000,
  acqPrice: 10000,
  stock: 3,
  images: [],
  origin: "new",
});

function borradorNuevo(fotos: Foto[], colores = ["color-1", "color-2"]) {
  return {
    name: "Cartuchera kawaii",
    categoryId: "cat-1",
    sizeIds: ["size-1"],
    colorIds: colores,
    designIds: ["design-1"],
    acqPrice: 10000,
    price: 20000,
    images: fotos,
    imageMapping: [],
    variants: colores.map((id) => filaNueva(id, id === "color-1" ? "Lila" : "Menta")),
  };
}

const props = {
  categories: [category],
  sizes: [size],
  colors: [color, color2],
  designs: [design],
  suppliers: [],
};

function abrirEditar(productos?: ReturnType<typeof variante>[]) {
  render(<ProductGroupForm {...props} initialData={grupoGuardado(productos)} />);
}

async function abrirNuevo(fotos: Foto[], colores?: string[]) {
  mocks.borrador = borradorNuevo(fotos, colores);
  render(<ProductGroupForm {...props} initialData={null as never} />);
  // El borrador se aplica en un efecto: esperar a que el reparto aparezca.
  await waitFor(() => expect(selectores().length).toBe(fotos.length), { timeout: ESPERA_MS });
}

/**
 * Tope de espera de cada `waitFor`: es una condición, no una pausa (termina en
 * cuanto se cumple). El 1 s por defecto no alcanza con la suite completa
 * corriendo en paralelo, porque la validación de Zod y el envío son
 * asíncronos.
 */
const ESPERA_MS = 4000;

const selectores = () => screen.queryAllByRole("combobox", { name: "Quién recibe esta foto" });

/** Abre el selector de la foto `indice` y elige `opcion` con el teclado. */
function elegir(indice: number, opcion: string | RegExp) {
  const trigger = selectores()[indice];
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const lista = screen.getByRole("listbox");
  fireEvent.keyDown(within(lista).getByRole("option", { name: opcion }), { key: "Enter" });
}

function subir(...fotos: Foto[]) {
  mocks.subidas = fotos;
  fireEvent.click(screen.getByRole("button", { name: "subir fotos" }));
}

const guardarEditar = () => fireEvent.click(screen.getByRole("button", { name: /Guardar grupo/i }));
const guardarNuevo = () => fireEvent.click(screen.getByRole("button", { name: /Crear grupo/i }));

const avisos = () => mocks.toast.mock.calls.map((c) => `${c[0]?.title ?? ""} ${c[0]?.description ?? ""}`).join(" | ");

async function esperaGuardado(llamada: typeof mocks.patch) {
  await waitFor(() => expect(llamada, avisos()).toHaveBeenCalledTimes(1), { timeout: ESPERA_MS });
  return llamada.mock.calls[0][1] as {
    images: Foto[];
    imageMapping: { url: string; scope: string }[];
  };
}

async function esperaFreno() {
  await waitFor(() => expect(avisos()).toMatch(/Faltan fotos por repartir/), { timeout: ESPERA_MS });
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
}

/** jsdom no los trae y el formulario los usa para cargar listas al hacer scroll. */
class ObservadorVacio {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { value: () => false, configurable: true },
    releasePointerCapture: { value: () => undefined, configurable: true },
    setPointerCapture: { value: () => undefined, configurable: true },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subidas = [];
  mocks.borrador = null;
  vi.stubGlobal("IntersectionObserver", ObservadorVacio);
  vi.stubGlobal("ResizeObserver", ObservadorVacio);
  Element.prototype.scrollIntoView = vi.fn();
  mocks.patch.mockResolvedValue({ data: {} });
  mocks.post.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("editar un grupo: fotos nuevas en el reparto", () => {
  it("una foto sin decidir se ve «sin repartir», no como «Todas las variantes»", () => {
    abrirEditar();
    subir({ url: "nueva.jpg" });
    const nueva = selectores()[2];
    expect(nueva.textContent).not.toMatch(/Todas las variantes/);
    expect(nueva.textContent).toMatch(/Elige a quién/);
    // Las guardadas conservan su reparto reconstruido.
    expect(selectores()[0].textContent).toMatch(/Todas las variantes/);
  });

  it("(a) elegir «Todas las variantes» en una foto nueva guarda, junto a otras repartidas", async () => {
    abrirEditar();
    subir({ url: "nueva.jpg" }, { url: "lila.jpg" });
    elegir(2, "Todas las variantes");
    elegir(3, "Color: Lila");
    guardarEditar();

    const enviado = await esperaGuardado(mocks.patch);
    expect(enviado.imageMapping).toEqual(
      expect.arrayContaining([
        { url: "nueva.jpg", scope: "all" },
        { url: "lila.jpg", scope: "color-1" },
      ]),
    );
  });

  it("(b) la nueva portada del grupo en «Todas las variantes» guarda y sigue siendo portada", async () => {
    abrirEditar();
    subir({ url: "portada.jpg", isMain: true });
    elegir(2, "Todas las variantes");
    guardarEditar();

    const enviado = await esperaGuardado(mocks.patch);
    expect(enviado.imageMapping).toContainEqual({ url: "portada.jpg", scope: "all" });
    expect(enviado.images.find((f) => f.url === "portada.jpg")?.isMain).toBe(true);
  });

  it("(c) varias fotos de portada para todas las variantes guardan", async () => {
    abrirEditar();
    subir({ url: "portada-1.jpg" }, { url: "portada-2.jpg" }, { url: "portada-3.jpg" });
    elegir(2, "Todas las variantes");
    elegir(3, "Todas las variantes");
    elegir(4, "Todas las variantes");
    guardarEditar();

    const enviado = await esperaGuardado(mocks.patch);
    for (const url of ["portada-1.jpg", "portada-2.jpg", "portada-3.jpg"]) {
      expect(enviado.imageMapping).toContainEqual({ url, scope: "all" });
    }
  });

  it("(d) un grupo de una sola variante guarda sin repartir la foto nueva", async () => {
    abrirEditar([variante("p1", "color-1")]);
    subir({ url: "nueva.jpg" });
    guardarEditar();

    await esperaGuardado(mocks.patch);
    expect(avisos()).not.toMatch(/Faltan fotos/);
  });

  it("(e) una foto nueva marcada para quitar no pide reparto y no viaja", async () => {
    abrirEditar();
    subir({ url: "descartada.jpg" });
    fireEvent.click(screen.getByRole("button", { name: "quitar descartada.jpg" }));
    guardarEditar();

    const enviado = await esperaGuardado(mocks.patch);
    expect(enviado.images.map((f) => f.url)).not.toContain("descartada.jpg");
    expect(enviado.imageMapping.map((m) => m.url)).not.toContain("descartada.jpg");
  });

  it("el freno sigue: una foto nueva sin decidir no deja guardar", async () => {
    abrirEditar();
    subir({ url: "nueva.jpg" }, { url: "otra.jpg" });
    elegir(2, "Todas las variantes");
    guardarEditar();

    await esperaFreno();
    expect(avisos()).toMatch(/1 foto no tiene un destino asignado/);
  });
});

describe("crear un grupo: el reparto empieza vacío", () => {
  it("ninguna foto se ve como «Todas las variantes» antes de decidir", async () => {
    await abrirNuevo([{ url: "a.jpg", isMain: true }, { url: "b.jpg" }]);
    for (const trigger of selectores()) {
      expect(trigger.textContent).not.toMatch(/Todas las variantes/);
    }
  });

  it("(a) una foto en «Todas las variantes» y otra en un color guardan", async () => {
    await abrirNuevo([{ url: "a.jpg" }, { url: "b.jpg", isMain: true }]);
    elegir(0, "Todas las variantes");
    elegir(1, "Color: Menta");
    guardarNuevo();

    const enviado = await esperaGuardado(mocks.post);
    expect(enviado.imageMapping).toEqual([
      { url: "a.jpg", scope: "all" },
      { url: "b.jpg", scope: "color-2" },
    ]);
  });

  it("(b) la portada en «Todas las variantes» guarda y sigue siendo portada", async () => {
    await abrirNuevo([{ url: "portada.jpg", isMain: true }, { url: "menta.jpg" }]);
    elegir(0, "Todas las variantes");
    elegir(1, "Color: Menta");
    guardarNuevo();

    const enviado = await esperaGuardado(mocks.post);
    expect(enviado.imageMapping).toContainEqual({ url: "portada.jpg", scope: "all" });
    expect(enviado.images.find((f) => f.url === "portada.jpg")?.isMain).toBe(true);
  });

  it("(c) varias fotos de portada en «Todas las variantes» guardan", async () => {
    await abrirNuevo([{ url: "p1.jpg", isMain: true }, { url: "p2.jpg" }, { url: "p3.jpg" }]);
    elegir(0, "Todas las variantes");
    elegir(1, "Todas las variantes");
    elegir(2, "Todas las variantes");
    guardarNuevo();

    const enviado = await esperaGuardado(mocks.post);
    expect(enviado.imageMapping).toEqual([
      { url: "p1.jpg", scope: "all" },
      { url: "p2.jpg", scope: "all" },
      { url: "p3.jpg", scope: "all" },
    ]);
  });

  it("(d) un grupo de una sola variante guarda sin repartir", async () => {
    await abrirNuevo([{ url: "a.jpg", isMain: true }], ["color-1"]);
    guardarNuevo();

    await esperaGuardado(mocks.post);
    expect(avisos()).not.toMatch(/Faltan fotos/);
  });

  it("(e) una foto marcada para quitar no pide reparto y no viaja", async () => {
    await abrirNuevo([{ url: "a.jpg", isMain: true }, { url: "descartada.jpg" }]);
    elegir(0, "Todas las variantes");
    fireEvent.click(screen.getByRole("button", { name: "quitar descartada.jpg" }));
    guardarNuevo();

    const enviado = await esperaGuardado(mocks.post);
    expect(enviado.images.map((f) => f.url)).toEqual(["a.jpg"]);
  });

  it("el freno sigue: fotos que nadie tocó no dejan crear el grupo", async () => {
    await abrirNuevo([{ url: "a.jpg", isMain: true }, { url: "b.jpg" }]);
    elegir(0, "Todas las variantes");
    guardarNuevo();

    await esperaFreno();
    expect(avisos()).toMatch(/1 foto no tiene un destino asignado/);
  });
});

describe("editar un grupo: lo que envía el formulario", () => {
  it("manda solo las fotos propias de cada variante y el reparto guardado", async () => {
    const conFotos = (id: string, colorId: string, fotos: { url: string; origin: string }[]) => ({
      ...variante(id, colorId),
      images: fotos.map((foto, i) => ({ id: `${id}-${i}`, url: foto.url, isMain: i === 0, origin: foto.origin })),
    });
    const grupo = {
      ...(grupoGuardado() as object),
      images: [
        { id: "i1", url: "a.jpg", isMain: true, scope: "all" },
        { id: "i2", url: "b.jpg", isMain: false, scope: "COLOR|color-2" },
        { id: "i3", url: "propia.jpg", isMain: false, scope: "COMBO|color-1|design-1" },
      ],
      products: [
        conFotos("p1", "color-1", [
          { url: "propia.jpg", origin: "OWN" },
          { url: "a.jpg", origin: "GROUP_COPY" },
        ]),
        conFotos("p2", "color-2", [
          { url: "a.jpg", origin: "GROUP_COPY" },
          { url: "b.jpg", origin: "GROUP_COPY" },
        ]),
      ],
    } as never;
    render(<ProductGroupForm {...props} initialData={grupo} />);
    await waitFor(() => expect(selectores().length).toBe(3), { timeout: ESPERA_MS });
    elegir(1, "Todas las variantes");
    guardarEditar();

    await waitFor(() => expect(mocks.patch, avisos()).toHaveBeenCalledTimes(1), { timeout: ESPERA_MS });
    const enviado = mocks.patch.mock.calls[0][1] as {
      imageMapping: { url: string; scope: string }[];
      variants: { id: string; images: string[] }[];
    };
    expect(enviado.variants.map((v) => [v.id, v.images])).toEqual([
      ["p1", ["propia.jpg"]],
      ["p2", []],
    ]);
    expect(Object.fromEntries(enviado.imageMapping.map((e) => [e.url, e.scope]))).toEqual({
      "a.jpg": "all",
      "b.jpg": "all",
      "propia.jpg": "COMBO|color-1|design-1",
    });
  });
});
