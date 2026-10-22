import { bulletList, collapsible, heading, keyLine, numberedList, sections, tag } from "@/lib/copiloto/answer-blocks";
import { percent } from "@/lib/copiloto/kits-rotation";
import type { KitPriceOption, KitPriceOptionKind } from "@/lib/pricing/kit-price";

import type { KitPriceToolResult } from "./kit-price-tool";

/** La respuesta de `precioDeKit` la arma el código: cada monto sale de la herramienta. */

const money = (value: number) => `$${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const units = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const rotationLabel = (minimumPct: number | null) => `Precio para rotar inventario (por debajo del ${minimumPct ?? 40} %, aprobado por Paula para mercancía quieta)`;
export const NOT_SAVED = "No guardé ningún precio: si te sirve, créalo o cámbialo en Productos.";
export const ABOVE_SUM = "Con este costo, el kit no puede quedar más barato que comprar las piezas por separado.";

const PROBLEM_TEXT = {
  ambiguo: "hay varios parecidos",
  "no encontrado": "no lo encontré",
  desactivado: "está desactivado",
  "es un kit": "es un kit: dime sus piezas",
} as const;

function optionLabel(kinds: KitPriceOptionKind[], discountPct: number, minimumPct: number | null) {
  const names: string[] = [];
  if (kinds.includes("separado")) names.push("lo mismo que por separado");
  if (kinds.includes("descuento")) names.push(`con ${percent(discountPct)} de descuento`);
  if (kinds.includes("minimo")) names.push(`el más bajo que cumple tu mínimo${minimumPct !== null ? ` de ${percent(minimumPct)}` : ""}`);
  if (kinds.includes("rotar")) names.push(rotationLabel(minimumPct));
  return names.join(" · ");
}

/**
 * Orden para Paula: el recomendado (el precio más bajo que cumple el mínimo
 * después de Bold), los otros permitidos de mayor a menor, el de rotar si lo
 * pidió y al final los no permitidos. Sin costo o sin mínimo: de mayor a menor.
 */
export function orderKitOptions(options: readonly KitPriceOption[]): { option: KitPriceOption; recommended: boolean }[] {
  const byPriceDesc = (a: KitPriceOption, b: KitPriceOption) => b.precio - a.precio;
  const rotation = (option: KitPriceOption) => option.kinds.includes("rotar");
  const allowed = options.filter((option) => option.permitido === true && !rotation(option)).sort(byPriceDesc);
  const recommended = allowed.length ? allowed[allowed.length - 1] : null;
  const rest = options.filter((option) => option.permitido !== true && !rotation(option));
  return [
    ...(recommended ? [{ option: recommended, recommended: true }] : []),
    ...allowed.filter((option) => option !== recommended).map((option) => ({ option, recommended: false })),
    ...options.filter(rotation).sort(byPriceDesc).map((option) => ({ option, recommended: false })),
    ...rest.filter((option) => option.permitido !== false).sort(byPriceDesc).map((option) => ({ option, recommended: false })),
    ...rest.filter((option) => option.permitido === false).sort(byPriceDesc).map((option) => ({ option, recommended: false })),
  ];
}

function optionLine(option: KitPriceOption, discountPct: number, minimumPct: number | null, recommended = false) {
  const parts = [optionLabel(option.kinds, discountPct, minimumPct)];
  if (option.margenPct !== null) parts.push(`margen ${percent(option.margenPct)}`);
  if (option.margenBoldPct !== null) parts.push(`Si pagan con Bold: ${percent(option.margenBoldPct)}`);
  const rotation = option.kinds.includes("rotar");
  const flag = option.permitido === false && !rotation ? ` ${tag(`no permitido (menos del ${minimumPct} %)`)}` : "";
  return `${keyLine(money(option.precio), parts)}${recommended ? ` ${tag("Recomendado")}` : ""}${flag}`;
}

export function composeKitPriceAnswer(result: KitPriceToolResult): string {
  const datos = result.datos;
  if (datos.estado === "noEsKit") {
    return sections(heading("Resumen"), `«${datos.producto.nombre}» no es un kit en el panel. Dime qué piezas lleva y te doy el precio.`);
  }

  const pieceLine = (piece: (typeof datos.piezas)[number]) =>
    [
      `${piece.nombre} ×${piece.cantidad}`,
      piece.sinCosto ? `sin costo ${tag("sin costo")}` : `costo ${money(piece.costoUnitario as number)}${piece.transporteNoRegistrado ? ` ${tag("transporte no registrado")}` : ""}`,
      `precio ${money(piece.precio)}${piece.oferta ? ` (${piece.oferta})` : ""}`,
      units(piece.disponibles, "disponible", "disponibles"),
      piece.desactivada ? tag("desactivada") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  if (datos.estado === "sinPiezas") {
    return sections(heading("Resumen"), `${datos.kit ? `«${datos.kit.nombre}» no tiene piezas en el panel.` : "No tengo piezas para armar el kit."} Dime qué lleva y te doy el precio.`);
  }

  if (datos.estado === "aclarar") {
    const questions = datos.aclarar.map((item) => {
      const candidates = item.candidatos.map((candidate) =>
        [candidate.nombre, candidate.sku ? `SKU ${candidate.sku}` : null, candidate.precio !== null ? money(candidate.precio) : null, candidate.disponibles !== null ? units(candidate.disponibles, "disponible", "disponibles") : null]
          .filter(Boolean)
          .join(" · "),
      );
      const intro = `«${item.texto}»: ${PROBLEM_TEXT[item.problema]}`;
      if (!candidates.length) return `${intro}.`;
      return `${intro}${item.problema === "no encontrado" ? "; los más parecidos" : ""}:\n${bulletList(candidates, 1)}`;
    });
    return sections(
      heading("Antes de darte el precio"),
      `Encontré ${datos.piezas.length} de ${datos.piezasPedidas} piezas. Me falta saber:`,
      numberedList(questions),
      "Dime cuál es cada una (o quítala del kit) y te doy el precio.",
      datos.piezas.length ? collapsible("Piezas que sí encontré", bulletList(datos.piezas.map(pieceLine))) : null,
    );
  }

  const allUnits = datos.piezas.reduce((total, piece) => total + piece.cantidad, 0);
  const summary = [
    `Kit de ${units(datos.piezas.length, "pieza", "piezas")} (${units(allUnits, "unidad", "unidades")}): por separado cuestan **${money(datos.sumaPorSeparado)}**.`,
    datos.costoTotal !== null ? `Costo total ${money(datos.costoTotal)}.` : null,
    `Alcanza para **${units(datos.kitsArmables, "kit", "kits")}**${datos.piezaQueLimita ? ` (limita ${datos.piezaQueLimita})` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const notes = [
    datos.sinCostoDe.length
      ? `No tengo el costo de: ${datos.sinCostoDe.join(", ")}. Sin eso no puedo darte el margen del kit ni el precio más bajo que cumple tu mínimo; ponlo en la ficha de cada producto.`
      : null,
    datos.sinTransporteDe.length
      ? `Sin transporte registrado: ${datos.sinTransporteDe.join(", ")}. El costo no incluye su envío, así que el margen real puede ser un poco menor.`
      : null,
    datos.minimoSobreLaSuma ? ABOVE_SUM : null,
    datos.minimoPct === null && datos.costoTotal !== null ? "No tienes un margen mínimo en Configuración: no marqué ninguna opción como no permitida." : null,
    datos.kitExistente
      ? `Hoy «${datos.kitExistente.nombre}» está en ${money(datos.kitExistente.precioActual)}${datos.kitExistente.margenPct !== null ? ` (margen ${percent(datos.kitExistente.margenPct)}; si pagan con Bold, ${percent(datos.kitExistente.margenBoldPct ?? 0)})` : ""}.`
      : null,
    NOT_SAVED,
  ].filter(Boolean) as string[];

  const how = collapsible(
    "Cómo se calculó",
    bulletList(
      [
        "Precio por separado: la suma de los precios de hoy de las piezas (con ofertas), bajada a un precio terminado en 900.",
        "Margen como en la ficha de producto: (precio − costo) ÷ precio, con el costo de compra más el transporte registrado.",
        datos.minimoPct !== null ? `Tu mínimo de ${percent(datos.minimoPct)} se exige en el peor caso: después de la comisión de Bold por pago en línea.` : null,
        datos.paraRotar ? "El precio para rotar usa el mismo piso que «Kits para rotar»: el costo más 20 %." : null,
      ].filter(Boolean) as string[],
    ),
  );

  return sections(
    heading("Resumen"),
    summary,
    heading("Opciones de precio"),
    numberedList(orderKitOptions(datos.opciones).map(({ option, recommended }) => optionLine(option, datos.descuentoPct, datos.minimoPct, recommended))),
    heading("Piezas"),
    bulletList(datos.piezas.map(pieceLine)),
    heading("Notas"),
    bulletList(notes),
    how,
  );
}
