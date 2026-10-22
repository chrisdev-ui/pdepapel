import { describe, expect, it } from "vitest";

import { PaymentMethod } from "@prisma/client";

import { gatewayFee } from "@/lib/gateway-fees";
import { marginAfterBold, minimumPriceAfterBold, priceKitOptions, ROTATION_FLOOR_MARKUP_PCT, type KitPriceLine } from "@/lib/pricing/kit-price";

/** Valores de prueba: ninguna cifra del negocio. */
const line = (nombre: string, precio: number, acqPrice: number | null, stock = 5, extra: Partial<KitPriceLine> = {}): KitPriceLine => ({
  productId: nombre,
  nombre,
  cantidad: 1,
  acqPrice,
  transportationCost: null,
  precioEfectivo: precio,
  precioDeLista: precio,
  stock,
  reservedUnits: 0,
  ...extra,
});

const FIVE = [line("Libreta", 5000, 2000), line("Cartuchera", 16000, 8000, 3), line("Portaminas", 5500, 3000), line("Rollo de stickers", 10000, 4200, 2), line("Llavero", 10000, 4800, 4)];

describe("margen después de Bold y precio mínimo", () => {
  it("usa la comisión real de Bold en línea (la misma de gateway-fees)", () => {
    expect(gatewayFee(12900, PaymentMethod.Bold)).toBe(1529.99);
    expect(marginAfterBold(12900, 0)).toBe(88.1);
    expect(marginAfterBold(40900, 22000)).toBe(40);
  });

  it("el mínimo es el …900 más bajo que llega al 40 % después de Bold, comprobado con la comisión real", () => {
    const price = minimumPriceAfterBold(22000, 40) as number;
    expect(price).toBe(40900);
    expect(price % 1000).toBe(900);
    expect(marginAfterBold(price, 22000)!).toBeGreaterThanOrEqual(40);
    expect(marginAfterBold(price - 1000, 22000)!).toBeLessThan(40);
  });

  it("sin costo o con un mínimo imposible no hay precio mínimo", () => {
    expect(minimumPriceAfterBold(0, 40)).toBeNull();
    expect(minimumPriceAfterBold(1000, 99)).toBeNull();
  });
});

describe("opciones de precio de un kit armado a mano", () => {
  it("por separado y con descuento bajan a …900; el mínimo sube a …900; el margen es el de la ficha y aparte el de Bold", () => {
    const result = priceKitOptions({ lines: FIVE, minMarginPct: 40, discountPct: 12, forRotation: false });
    expect(result).toMatchObject({ sumaPorSeparado: 46500, costoTotal: 22000, kitsArmables: 2, piezaQueLimita: "Rollo de stickers", minimoSobreLaSuma: false });
    expect(result.opciones).toEqual([
      { kinds: ["separado"], precio: 45900, margenPct: 52.1, margenBoldPct: 46.2, permitido: true },
      { kinds: ["descuento", "minimo"], precio: 40900, margenPct: 46.2, margenBoldPct: 40, permitido: true },
    ]);
  });

  it("una opción con menos del 40 % después de Bold queda «no permitido»", () => {
    const result = priceKitOptions({ lines: FIVE, minMarginPct: 40, discountPct: 25, forRotation: false });
    const discounted = result.opciones.find((option) => option.kinds.includes("descuento"))!;
    expect(discounted.precio).toBe(33900);
    expect(discounted.margenBoldPct).toBeLessThan(40);
    expect(discounted.permitido).toBe(false);
    expect(result.opciones.find((option) => option.kinds.includes("minimo"))).toMatchObject({ precio: 40900, permitido: true });
  });

  it("sin intención de rotar no hay precio para rotar; con ella, el piso de kitsParaRotar (costo + 20 %) al …900", () => {
    expect(priceKitOptions({ lines: FIVE, minMarginPct: 40, discountPct: 12, forRotation: false }).opciones.some((option) => option.kinds.includes("rotar"))).toBe(false);
    const rotation = priceKitOptions({ lines: FIVE, minMarginPct: 40, discountPct: 12, forRotation: true }).opciones.find((option) => option.kinds.includes("rotar"))!;
    expect(ROTATION_FLOOR_MARKUP_PCT).toBe(20);
    expect(rotation).toEqual({ kinds: ["rotar"], precio: 26900, margenPct: 18.2, margenBoldPct: 10.7, permitido: null });
  });

  it("costo de compra en 0 o vacío: la pieza queda «sin costo», el kit sin margen ni mínimo, y nunca se toma como $0", () => {
    const result = priceKitOptions({ lines: [line("Libreta", 5000, 2000), line("Pin", 8000, 0), line("Regla", 6000, null)], minMarginPct: 40, discountPct: 12, forRotation: true });
    expect(result.costoTotal).toBeNull();
    expect(result.sinCostoDe).toEqual(["Pin", "Regla"]);
    expect(result.opciones.map((option) => option.kinds)).toEqual([["separado"], ["descuento"]]);
    expect(result.opciones.every((option) => option.margenPct === null && option.margenBoldPct === null && option.permitido === null)).toBe(true);
  });

  it("transporte vacío, en 0 o el relleno de 1000 es «no registrado»; uno real entra al costo", () => {
    const result = priceKitOptions({
      lines: [line("A", 10000, 4000, 5, { transportationCost: null }), line("B", 10000, 4000, 5, { transportationCost: 0 }), line("C", 10000, 4000, 5, { transportationCost: 1000 }), line("D", 10000, 4000, 5, { transportationCost: 500 })],
      minMarginPct: 40,
      discountPct: 12,
      forRotation: false,
    });
    expect(result.sinTransporteDe).toEqual(["A", "B", "C"]);
    expect(result.costoTotal).toBe(16500);
  });

  it("si el precio más bajo que cumple el mínimo pasa la suma de las piezas, se muestra igual y se marca", () => {
    const result = priceKitOptions({ lines: [line("Caro", 10000, 9000)], minMarginPct: 40, discountPct: 12, forRotation: false });
    expect(result.minimoSobreLaSuma).toBe(true);
    const minimum = result.opciones.find((option) => option.kinds.includes("minimo"))!;
    expect(minimum.precio).toBeGreaterThan(result.sumaPorSeparado);
    expect(minimum.permitido).toBe(true);
  });

  it("las cantidades multiplican costo y precio; los kits que alcanzan descuentan lo apartado", () => {
    const result = priceKitOptions({
      lines: [line("Lapicero", 2500, 1300, 6, { cantidad: 2 }), line("Libreta", 5000, 2000, 5, { reservedUnits: 4 })],
      minMarginPct: 40,
      discountPct: 12,
      forRotation: false,
    });
    expect(result).toMatchObject({ sumaPorSeparado: 10000, costoTotal: 4600, kitsArmables: 1, piezaQueLimita: "Libreta" });
  });

  it("sin mínimo en Configuración no hay precio mínimo ni opciones marcadas", () => {
    const result = priceKitOptions({ lines: FIVE, minMarginPct: null, discountPct: 12, forRotation: false });
    expect(result.opciones.map((option) => option.kinds)).toEqual([["separado"], ["descuento"]]);
    expect(result.opciones.every((option) => option.permitido === null && option.margenPct !== null)).toBe(true);
  });
});
