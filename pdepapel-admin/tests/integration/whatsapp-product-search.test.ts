import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * El fallo del 30 de septiembre de 2026, contra MySQL de verdad.
 *
 * Una clienta preguntó «Que precio tienen los tote bag de perrito». El
 * producto existía, activo y con existencias, pero «perrito» solo vivía en el
 * diseño, y la búsqueda del bot miraba nombre y descripción. Cero resultados
 * se contestó como «no lo tengo».
 *
 * Lo que se arregló vive en el `where` que sale a la base (filtros por
 * relación, raíces, sinónimos) y en la segunda búsqueda solo por el tipo. Un
 * doble de Prisma no diría si MySQL encuentra el diseño por su raíz; esto sí.
 *
 * El modelo se dobla: lo que se prueba es la búsqueda, no Gemini. Las ranuras
 * de cada caso son las que devuelve el clasificador para ese mensaje.
 */

const mocks = vi.hoisted(() => {
  process.env.GEMINI_API_KEY ??= "clave-de-prueba";
  return { generateText: vi.fn() };
});

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => "modelo-simulado",
}));

import {
  PRODUCT_TEMPLATES,
  answerProductQuestion,
  resolveProductSearch,
} from "@/lib/whatsapp/bot-products";

const suffix = randomUUID().slice(0, 8);

/** La descripción real del tote bag: nombra los cinco diseños, nunca «perrito». */
const DESCRIPCION_TOTE =
  "<p>Nuestro Tote Bag es el compañero perfecto para llevar tus cosas con estilo. Disponible en cinco diseños: Frida Cato, Un día a la vez, Caribe, Italia y Aquí llevo cosas de señora. Una bolsa de tela resistente con asas largas.</p>";

let storeId = "";
let otraTiendaId = "";

const clasifica = (output: Record<string, unknown>) =>
  mocks.generateText.mockResolvedValue({ output, usage: undefined });

const buscar = (productType: string) =>
  resolveProductSearch(storeId, {
    intent: "product.search",
    productType,
    character: null,
    descriptor: null,
  });

const nombres = async (productType: string) => {
  const fact = await buscar(productType);
  if (!fact.known) throw new Error("debería saberse");
  return fact.value.matches.map((m) => m.name).sort();
};

async function crearTienda(nombre: string) {
  const store = await testPrisma.store.create({
    data: { name: `${nombre} ${suffix}`, userId: `test-user-${nombre}-${suffix}` },
  });
  const type = await testPrisma.type.create({
    data: { name: "Accesorios", slug: `accesorios-${nombre}-${suffix}`, storeId: store.id },
  });
  const categoria = async (name: string) =>
    testPrisma.category.create({
      data: {
        name,
        slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${nombre}-${suffix}`,
        storeId: store.id,
        typeId: type.id,
      },
    });
  const diseno = (name: string) => testPrisma.design.create({ data: { name, storeId: store.id } });
  const color = (name: string) =>
    testPrisma.color.create({ data: { name, value: `#${name}-${suffix}`.slice(0, 20), storeId: store.id } });
  const size = await testPrisma.size.create({
    data: { name: "M", value: `m-${nombre}-${suffix}`, storeId: store.id },
  });

  const categorias = {
    bolsos: await categoria("Bolsos pequeños"),
    cartucheras: await categoria("Cartucheras"),
    kits: await categoria("Kits"),
  };
  const disenos = {
    perrito: await diseno("Perrito"),
    limones: await diseno("Limones"),
    arte: await diseno("Arte"),
    clasico: await diseno("Clásico"),
  };
  const colores = {
    amarillo: await color("Amarillo"),
    rojo: await color("Rojo"),
    azul: await color("Azul"),
    rosaPastel: await color("Rosa pastel"),
  };

  let n = 0;
  const producto = (
    name: string,
    opts: {
      categoria: { id: string };
      diseno: { id: string };
      color: { id: string };
      description?: string;
      stock?: number;
      price?: number;
    },
  ) => {
    n += 1;
    return testPrisma.product.create({
      data: {
        name,
        slug: `p-${nombre}-${suffix}-${n}`,
        description: opts.description ?? "<p>Producto de pruebas.</p>",
        stock: opts.stock ?? 2,
        price: opts.price ?? 35000,
        acqPrice: 10000,
        sku: `TEST-${nombre}-${suffix}-${n}`,
        storeId: store.id,
        categoryId: opts.categoria.id,
        colorId: opts.color.id,
        sizeId: size.id,
        designId: opts.diseno.id,
      },
    });
  };

  return { store, categorias, disenos, colores, producto };
}

async function borrarTienda(id: string) {
  await testPrisma.image.deleteMany({ where: { product: { storeId: id } } });
  await testPrisma.product.deleteMany({ where: { storeId: id } });
  await testPrisma.design.deleteMany({ where: { storeId: id } });
  await testPrisma.color.deleteMany({ where: { storeId: id } });
  await testPrisma.size.deleteMany({ where: { storeId: id } });
  await testPrisma.category.deleteMany({ where: { storeId: id } });
  await testPrisma.type.deleteMany({ where: { storeId: id } });
  await testPrisma.store.delete({ where: { id } });
}

beforeAll(async () => {
  const t = await crearTienda("pdp");
  storeId = t.store.id;
  const { categorias: c, disenos: d, colores: k, producto } = t;

  // Los cinco tote bags reales del 30 de septiembre, con el diseño en la
  // relación y la misma descripción para todos.
  await producto('Tote bag "Un día a la Vez"', {
    categoria: c.bolsos, diseno: d.perrito, color: k.amarillo, description: DESCRIPCION_TOTE,
  });
  await producto('Tote bag "Italia"', {
    categoria: c.bolsos, diseno: d.limones, color: k.amarillo, description: DESCRIPCION_TOTE,
  });
  await producto('Tote bag "Frida Cato"', {
    categoria: c.bolsos, diseno: d.arte, color: k.rojo, description: DESCRIPCION_TOTE,
  });
  // El color solo en la relación: «cartuchera amarilla» no está en el nombre.
  await producto("Cartuchera Wisdom", { categoria: c.cartucheras, diseno: d.clasico, color: k.amarillo });
  // Ni el tipo ni el color en el nombre: solo la categoría y el color lo dicen.
  await producto("Wisdom Azul Pastel", { categoria: c.cartucheras, diseno: d.clasico, color: k.azul });
  // Color «Rosa pastel» y nombre con sinónimo: «cartuchera rosada» tiene que
  // llegar por el sinónimo (estuche) y por el género (rosada → rosa).
  await producto("Estuche Kuromi", { categoria: c.cartucheras, diseno: d.clasico, color: k.rosaPastel });
  // Otro producto con el mismo diseño Perrito, de otro tipo.
  await producto("Kit Puppy Pochacco", { categoria: c.kits, diseno: d.perrito, color: k.amarillo, price: 48000 });
  // Uno archivado que nunca debe salir.
  const archivado = await producto('Tote bag "Retirado"', {
    categoria: c.bolsos, diseno: d.perrito, color: k.amarillo,
  });
  await testPrisma.product.update({ where: { id: archivado.id }, data: { isArchived: true } });

  // Otra tienda con un tote de perrito: el aislamiento por tienda no cambia.
  const otra = await crearTienda("ajena");
  otraTiendaId = otra.store.id;
  await otra.producto('Tote bag "Ajena"', {
    categoria: otra.categorias.bolsos, diseno: otra.disenos.perrito, color: otra.colores.amarillo,
  });
});

afterAll(async () => {
  if (storeId) await borrarTienda(storeId);
  if (otraTiendaId) await borrarTienda(otraTiendaId);
  await testPrisma.$disconnect();
});

beforeEach(() => {
  mocks.generateText.mockReset();
});

describe("el mensaje real, contra el catálogo real", () => {
  it("«Que precio tienen los tote bag de perrito» encuentra el tote de perrito", async () => {
    clasifica({ intent: "product.price", productType: "tote bag", character: "perrito", descriptor: null });

    const r = await answerProductQuestion(storeId, "Que precio tienen los tote bag de perrito");

    expect(r?.text).toBe('Tote bag "Un día a la Vez" está en $35.000 💛 ¿Te lo aparto?');
    expect(r?.handoff).toBeFalsy();
    expect(r?.decision).toEqual({
      intent: "product.price",
      slots: { productType: "tote bag", character: "perrito", descriptor: null },
      query: "tote bag perrito",
      total: 1,
      outcome: "match",
    });
  });

  it("la búsqueda sola ya lo encuentra, y solo a él", async () => {
    expect(await nombres("tote bag perrito")).toEqual(['Tote bag "Un día a la Vez"']);
    // Y en plural, con la raíz.
    expect(await nombres("tote bag perritos")).toEqual(['Tote bag "Un día a la Vez"']);
  });

  it("ni el archivado ni el de la otra tienda se cuelan", async () => {
    const todos = await nombres("tote bag");
    expect(todos).toEqual(['Tote bag "Frida Cato"', 'Tote bag "Italia"', 'Tote bag "Un día a la Vez"']);
    expect(todos).not.toContain('Tote bag "Retirado"');
    expect(todos).not.toContain('Tote bag "Ajena"');
  });
});

describe("los otros casos expuestos: color, categoría y sinónimos", () => {
  it("color solo en la relación: «cartuchera amarilla»", async () => {
    // «amarilla» contra el color «Amarillo»: la raíz «amarill» está en los dos.
    expect(await nombres("cartuchera amarilla")).toEqual(["Cartuchera Wisdom"]);
  });

  it("tipo y color solo en las relaciones: «cartuchera azul»", async () => {
    // El nombre es «Wisdom Azul Pastel»: «cartuchera» solo lo dice la categoría.
    expect(await nombres("cartuchera azul")).toEqual(["Wisdom Azul Pastel"]);
  });

  it("diseño en otro tipo de producto: «kit de perrito»", async () => {
    expect(await nombres("kit de perrito")).toEqual(["Kit Puppy Pochacco"]);
  });

  it("«bolso de perrito» y «bolsa de perrito» son el mismo tote", async () => {
    expect(await nombres("bolso de perrito")).toEqual(['Tote bag "Un día a la Vez"']);
    expect(await nombres("bolsa de perrito")).toEqual(['Tote bag "Un día a la Vez"']);
  });

  it("plural en la pregunta: «kits de perrito», «totes de perrito», «cartucheras amarillas»", async () => {
    expect(await nombres("kits de perrito")).toEqual(["Kit Puppy Pochacco"]);
    expect(await nombres("totes de perrito")).toEqual(['Tote bag "Un día a la Vez"']);
    expect(await nombres("cartucheras amarillas")).toEqual(["Cartuchera Wisdom"]);
  });

  it("género en el color y sinónimo en el tipo: «cartuchera rosada»", async () => {
    expect(await nombres("cartuchera rosada")).toEqual(["Estuche Kuromi"]);
    expect(await nombres("estuches rosados")).toEqual(["Estuche Kuromi"]);
  });

  it("un diseño que no existe sigue dando cero: no se inventa nada", async () => {
    const fact = await buscar("tote bag dinosaurio");
    expect(fact.known && fact.value.total).toBe(0);
  });
});

describe("cuando la consulta entera da cero", () => {
  it("un personaje que no hay: dice lo que falta y enseña los tote bags", async () => {
    clasifica({ intent: "product.search", productType: "tote bag", character: "dinosaurio", descriptor: null });

    const r = await answerProductQuestion(storeId, "¿tienen tote bag de dinosaurio?");

    expect(r?.text.startsWith("De dinosaurio no tengo por ahora 💛 Pero de tote bag sí, mira:\n")).toBe(true);
    expect(r?.text).toContain('• Tote bag "Un día a la Vez" — $35.000');
    expect(r?.text).toContain('• Tote bag "Italia" — $35.000');
    expect(r?.text).toContain('• Tote bag "Frida Cato" — $35.000');
    expect(r?.text).not.toContain("Ajena");
    expect(r?.text).not.toContain("Retirado");
    expect(r?.handoff).toBeFalsy();
    expect(r?.list?.body).toBe(
      "De dinosaurio no tengo por ahora 💛 Pero de tote bag tengo 3. Míralos y escoge el que quieras.",
    );
    expect(r?.list?.rows).toHaveLength(3);
    expect(r?.decision).toEqual({
      intent: "product.search",
      slots: { productType: "tote bag", character: "dinosaurio", descriptor: null },
      query: "tote bag dinosaurio",
      total: 0,
      retry: { query: "tote bag", total: 3 },
      outcome: "partial",
    });
  });

  it("ni el tipo existe: lo confirma con Paula en vez de negar", async () => {
    clasifica({ intent: "product.search", productType: "mantel", character: null, descriptor: "de plástico" });

    const r = await answerProductQuestion(storeId, "Linda, tu tienes esos manteles de plastico?");

    expect(r?.text).toBe(PRODUCT_TEMPLATES["search.unsure"]());
    expect(r?.text).not.toMatch(/no lo tengo/i);
    expect(r?.handoff).toBe(true);
    expect(r?.decision).toEqual({
      intent: "product.search",
      slots: { productType: "mantel", character: null, descriptor: "de plástico" },
      query: "mantel de plástico",
      total: 0,
      retry: { query: "mantel", total: 0 },
      outcome: "unsure",
    });
  });
});
