import { describe, expect, it } from "vitest";

import { buildMercadoLibreListingMetadata, getMercadoLibreListingMetadata } from "@/lib/mercadolibre/listing-metadata";
import { buildMercadoLibreItemPayload } from "@/lib/mercadolibre/listings";
import {
  type WavePlan,
  type WavePlanItem,
  type WaveProduct,
  type WaveProductFacts,
  planWaveItem,
  wavePublishBlockers,
} from "@/lib/mercadolibre/wave-publisher";

const PACK = "https://res.cloudinary.com/demo/image/upload/e_background_removal/e_trim/c_pad,w_1080,h_1080,b_white/c_lpad,w_1200,h_1200,b_white/f_jpg,q_auto:good/v1/a.jpg";
const PHOTO = "https://res.cloudinary.com/demo/image/upload/c_limit,w_1200,h_1200/f_jpg,q_auto:good/v1/a.jpg";

const item: WavePlanItem = {
  rank: 3,
  sku: "RES-1",
  categoryId: "MCO172631",
  approvedMlPrice: 51900,
  package: { profile: "Empaque ML pequeño", lengthCm: 25, widthCm: 20, heightCm: 8, weightGrams: 1000 },
  imagePack: {
    recipe: "mlp2",
    approved: true,
    pictures: [
      { position: 2, kind: "foto-principal", url: PHOTO, ok: true },
      { position: 1, kind: "portada", url: PACK, ok: true },
    ],
  },
};

const product: WaveProduct = {
  id: "p1",
  sku: "RES-1",
  name: "Set de resaltadores 10 colores",
  description: "<p>Diez colores. Escríbenos al 3001112233</p>",
  stock: 6,
  reservedUnits: 1,
  isArchived: false,
  gtin: null,
  mpn: null,
  hasNoProductIdentifier: true,
  acqPrice: 19000,
  transportationCost: 261,
  images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg" }],
  brand: null,
  brandRef: { name: "Scribe", isArchived: false, parent: null },
  productGroup: null,
};

const facts: WaveProductFacts = { sellable: 5, presaleBlocked: false, licensed: null, licenseApproved: false, alreadyListed: false };
const plan: WavePlan = { waveId: "ola-1", items: [item] };

describe("publicador por tandas", () => {
  it("el ensayo produce el cuerpo real de POST /items: precio aprobado, Premium, stock − 1, paquete y fotos del paquete tal cual", () => {
    const planned = planWaveItem(item, product, facts, "conn-1");
    expect(planned).toMatchObject({ publishable: true, reasons: [], packageSource: "perfil de la tanda" });
    const payload = buildMercadoLibreItemPayload(planned.draft!);
    expect(payload).toMatchObject({
      category_id: "MCO172631",
      price: 51900,
      listing_type_id: "gold_pro",
      available_quantity: 4,
      family_name: "Set de resaltadores 10 colores",
      seller_custom_field: "RES-1",
      shipping: { mode: "me2", free_shipping: true, local_pick_up: false, dimensions: "8x20x25,1000" },
    });
    // En el orden del paquete y sin otra transformación de Cloudinary encima.
    expect(payload.pictures).toEqual([{ source: PACK }, { source: PHOTO }]);
    expect(payload.attributes).toEqual(
      expect.arrayContaining([
        { id: "BRAND", value_name: "Scribe" },
        { id: "PACKAGE_WEIGHT", value_name: "1000 g" },
        { id: "PACKAGE_LENGTH", value_name: "25 cm" },
      ]),
    );
  });

  it("el paquete medido del producto gana al perfil de la tanda", () => {
    const measured = { ...product, packageWeightGrams: 320, packageHeightCm: 4, packageWidthCm: 18, packageLengthCm: 22 };
    const planned = planWaveItem(item, measured, facts, "conn-1");
    expect(planned.packageSource).toBe("medido");
    expect(buildMercadoLibreItemPayload(planned.draft!).shipping).toMatchObject({ dimensions: "4x18x22,320" });
  });

  it("bajo 40.000 va como Clásica; sin marca enlazada va «Genérica» con aviso", () => {
    const cheap = planWaveItem({ ...item, approvedMlPrice: 29900 }, { ...product, brandRef: null }, facts, "conn-1");
    const payload = buildMercadoLibreItemPayload(cheap.draft!);
    expect(payload.listing_type_id).toBe("gold_special");
    expect(payload.attributes).toEqual(expect.arrayContaining([{ id: "BRAND", value_name: "Genérica" }]));
    expect(cheap.warnings).toContain("Sin marca enlazada: se publica como «Genérica».");
  });

  it("nunca una preventa, ni con todo lo demás listo", () => {
    expect(planWaveItem(item, product, { ...facts, presaleBlocked: true }, "conn-1")).toMatchObject({
      publishable: false,
      reasons: ["Está en preventa: las preventas no van a Mercado Libre."],
    });
  });

  it("fuera: licencia, una sola unidad, ya publicado, sin paquete, hoja sin aprobar o una foto que no pasa", () => {
    const licensed = { label: "Snoopy", matched: "snoopy", tier: "excluded" as const };
    expect(planWaveItem(item, product, { ...facts, licensed }, "c").publishable).toBe(false);
    expect(planWaveItem(item, product, { ...facts, sellable: 1 }, "c").reasons).toEqual([
      "Solo 1 unidad(es) vendible(s): las tandas excluyen productos de una sola unidad.",
    ]);
    expect(planWaveItem(item, product, { ...facts, alreadyListed: true }, "c").publishable).toBe(false);
    expect(planWaveItem({ ...item, package: null }, product, facts, "c").reasons).toEqual(["Faltan peso y medidas del paquete."]);
    expect(planWaveItem({ ...item, imagePack: { ...item.imagePack!, approved: false } }, product, facts, "c").reasons).toEqual([
      "Falta aprobar la hoja de contacto de la tanda.",
    ]);
    const badPhoto = { ...item.imagePack!, pictures: [{ position: 1, kind: "portada", url: PACK, ok: false }] };
    expect(planWaveItem({ ...item, imagePack: badPhoto }, product, facts, "c").reasons).toEqual([
      "La portada está por revisar en la hoja de contacto.",
    ]);
    expect(planWaveItem(item, null, null, "c").reasons).toEqual(["El SKU no existe en la tienda."]);
  });

  it("la descripción sale limpia y se avisa", () => {
    const planned = planWaveItem(item, product, facts, "c");
    expect(planned.warnings).toContain("La descripción se envía limpia (sin enlaces, contacto, HTML ni emojis).");
  });

  describe("candado de la publicación real", () => {
    const ready = [planWaveItem(item, product, facts, "conn-1")];

    it("en pausa no sale nada, aunque venga la bandera de la tanda", () => {
      expect(wavePublishBlockers({ writesPaused: true, approveWaveFlag: "ola-1", plan, items: ready })).toEqual([
        "Las escrituras a Mercado Libre están en pausa: no se publica nada.",
      ]);
    });

    it("sin bandera, o con la de otra tanda, tampoco", () => {
      expect(wavePublishBlockers({ writesPaused: false, approveWaveFlag: null, plan, items: ready })).toEqual(["Falta --approve-wave=ola-1."]);
      expect(wavePublishBlockers({ writesPaused: false, approveWaveFlag: "ola-2", plan, items: ready })).toEqual([
        "--approve-wave=ola-2 no es la tanda del plan (ola-1).",
      ]);
    });

    it("una preventa frena la tanda entera aunque el interruptor esté apagado y la bandera sea la correcta", () => {
      const withPresale = [planWaveItem(item, product, { ...facts, presaleBlocked: true }, "conn-1")];
      expect(wavePublishBlockers({ writesPaused: false, approveWaveFlag: "ola-1", plan, items: withPresale })).toEqual([
        "#3 RES-1: Está en preventa: las preventas no van a Mercado Libre.",
      ]);
    });

    it("apagado, con la bandera y todo listo: puede salir", () => {
      expect(wavePublishBlockers({ writesPaused: false, approveWaveFlag: "ola-1", plan, items: ready })).toEqual([]);
    });
  });

  it("una edición del panel (fotos, nombre) conserva el paquete de fotos de la tanda", () => {
    const current = { attributes: [], media: { imageUrls: [], packPictures: [PACK, PHOTO], packRecipe: "mlp2" }, version: 1 };
    const next = buildMercadoLibreListingMetadata({ current, familyName: "Otro nombre", imageUrls: ["https://res.cloudinary.com/demo/image/upload/v1/b.jpg"] });
    expect(getMercadoLibreListingMetadata(next as never).media).toEqual({
      imageUrls: ["https://res.cloudinary.com/demo/image/upload/v1/b.jpg"],
      packPictures: [PACK, PHOTO],
      packRecipe: "mlp2",
    });
  });

  it("sin paquete, la publicación manual sigue igual: fotos de la galería con la copia de 1600 px", () => {
    const planned = planWaveItem({ ...item, imagePack: null }, product, facts, "c");
    const payload = buildMercadoLibreItemPayload(planned.draft!);
    expect(payload.pictures).toHaveLength(1);
    expect(payload.pictures[0].source).not.toBe(product.images[0].url);
    expect(payload.pictures[0].source).toContain("res.cloudinary.com/demo/image/upload/");
  });
});
