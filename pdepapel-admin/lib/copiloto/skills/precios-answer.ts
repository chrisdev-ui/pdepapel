import { bulletList, collapsible, heading, keyLine, numberedList, sections, tag } from "@/lib/copiloto/answer-blocks";
import { percent } from "@/lib/copiloto/kits-rotation";
import type { MercadoLibreEstimate } from "@/lib/pricing/price-calculator";

import type { BelowMarginResult, PacksResult, PriceResult } from "./precios-tool";

/**
 * Las respuestas de «Precios» las arma el código con lo que trae cada
 * herramienta; el texto libre del modelo se descarta. Así cada monto de la
 * respuesta es uno que calculó la herramienta.
 */

const money = (value: number) => `${value < 0 ? "−" : ""}$${Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const units = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const GROSS = "Es margen bruto, antes de la comisión de la pasarela de pago.";
const ML_RULE = "Hasta el precio límite de Configuración se cobra el cargo fijo en vez del envío; por encima, el envío estimado.";
const ML_TYPES_HOW = "Mercado Libre: comisión estimada por tipo de publicación, 16 % sin cuotas extra (Clásica) y 19 % con cuotas extra (Premium), no la cotización real.";

function mercadoLibreLine(estimate: MercadoLibreEstimate) {
  const parts = [`comisión ${money(estimate.commission)} (${percent(estimate.commissionPct)})`];
  if (estimate.fixedFee > 0) parts.push(`cargo fijo ${money(estimate.fixedFee)}`);
  if (estimate.shipping > 0) parts.push(`envío ${money(estimate.shipping)}`);
  parts.push(`retención ${money(estimate.withholding)}`);
  if (estimate.net !== null) parts.push(`te quedan ${money(estimate.net)}`);
  return parts;
}

const estimateTag = (estimate: MercadoLibreEstimate) =>
  estimate.commissionKind === "real" && !estimate.withoutFixedFee ? tag("comisión real") : tag(estimate.withoutFixedFee ? "estimado, sin cargo fijo" : "estimado");

export function composePriceAnswer(result: PriceResult): string {
  const { entradas, tienda, mercadolibre, mercado, parecidos, parecidosPor } = result.datos;
  const costParts = [`compra ${money(entradas.costoUnitario)}`];
  if (entradas.envioPorUnidad !== null) costParts.push(`envío ${money(entradas.envioPorUnidad)}`);
  if (entradas.costoEmpaque !== null) costParts.push(`empaque ${money(entradas.costoEmpaque)}`);
  const missing = [entradas.envioPorUnidad === null && "envío por unidad", entradas.costoEmpaque === null && "empaque"].filter(Boolean) as string[];

  const summary = tienda
    ? `Con un costo de **${money(entradas.costoTotal)}** por unidad (${costParts.join(" + ")}), el precio sugerido para la tienda es **${money(tienda.precioSugerido)}**, con margen del ${percent(tienda.margenPct ?? 0)} sobre el precio.`
    : `Con un costo de **${money(entradas.costoTotal)}** por unidad (${costParts.join(" + ")}):`;

  const storeBlock = tienda && [
    heading("Tienda"),
    keyLine(money(tienda.precioSugerido), [`margen ${percent(tienda.margenPct ?? 0)} sobre el precio`, `ganas ${money(tienda.ganancia)} por unidad`]),
    bulletList(
      [
        `Aumento de ${percent(tienda.aumentoPct)} sobre el costo: ${tienda.fuente}.`,
        tienda.minimo
          ? tienda.minimo.precio !== null && tienda.precioSugerido < tienda.minimo.precio
            ? `Queda por debajo del mínimo de la tienda (${percent(tienda.minimo.margenPct)}): para llegar, ${money(tienda.minimo.precio)}. ${tag("por debajo del mínimo")}`
            : `Cumple el mínimo de la tienda (${percent(tienda.minimo.margenPct)}); el precio más bajo que lo cumple es ${money(tienda.minimo.precio ?? 0)}.`
          : "No tienes un margen mínimo configurado en Configuración.",
      ].filter(Boolean) as string[],
    ),
  ].join("\n\n");

  const mlBlock =
    mercadolibre &&
    [
      heading("Mercado Libre"),
      mercadolibre.vinculado
        ? `Su publicación es ${mercadolibre.opciones[0]?.nombre ?? mercadolibre.vinculado.tipo}${mercadolibre.opciones[0]?.cuotas ? ` (${mercadolibre.opciones[0].cuotas})` : ""}${mercadolibre.comisionReal ? ", con la comisión real de Mercado Libre." : "; no pude consultar la comisión real, va la estimada."}`
        : "No tiene publicación vinculada: van las dos opciones, según ofrezcas cuotas extra o no.",
      ...mercadolibre.opciones.map((option) => {
        const title = mercadolibre.opciones.length > 1 ? `${option.nombre}, ${option.cuotas}` : null;
        if (option.precioSugerido === null || !option.estimado) {
          return `${title ? `${title}: ` : ""}con tus metas (${percent(mercadolibre.metas.margenPct)} y ${money(mercadolibre.metas.gananciaMinima)} por unidad) no hay un precio que las cumpla.`;
        }
        return [
          `${title ? `${title}: ` : ""}${keyLine(money(option.precioSugerido), mercadoLibreLine(option.estimado))} ${estimateTag(option.estimado)}`,
          option.muyPorEncimaDeLaTienda ? bulletList(["Es más de 1,8 veces el precio de la tienda: en Mercado Libre conviene venderlo en pack o kit."]) : null,
        ]
          .filter(Boolean)
          .join("\n\n");
      }),
    ].join("\n\n");

  const marketBlock =
    mercado && tienda
      ? [
          heading("Frente al mercado"),
          `Los precios que me diste van de ${money(mercado.minimo)} a ${money(mercado.maximo)}. **${money(tienda.precioSugerido)} queda ${mercado.posicion === "dentro" ? "dentro" : mercado.posicion === "debajo" ? "por debajo" : "por encima"}.**`,
        ].join("\n\n")
      : null;

  const similarBlock = parecidos.length
    ? [
        heading(parecidosPor === "nombre" ? "Productos parecidos de tu tienda" : `Otros productos de ${entradas.subcategoria}`),
        numberedList(
          parecidos.map((row) =>
            [row.nombre, money(row.precio), row.margenPct === null ? "sin costo registrado" : `margen ${percent(row.margenPct)}`, units(row.vendidas30Dias, "vendida en 30 días", "vendidas en 30 días")].join(" · "),
          ),
        ),
      ].join("\n\n")
    : null;

  const how = collapsible(
    "Cómo se calculó",
    bulletList(
      [
        `Costo: ${costParts.join(" + ")} = ${money(entradas.costoTotal)}.${missing.length ? ` No me diste: ${missing.join(" ni ")}.` : ""}`,
        entradas.subcategoriaPedidaSinCoincidencia ? "No encontré la subcategoría que nombraste: usé el aumento de la tienda." : null,
        tienda ? "Tienda: costo × (1 + aumento), redondeado al peso. Margen sobre el precio: (precio − costo) ÷ precio." : null,
        tienda ? GROSS : null,
        mercadolibre ? (mercadolibre.comisionReal ? "Mercado Libre: la comisión real para el tipo y la categoría de su publicación." : ML_TYPES_HOW) : null,
        mercadolibre ? ML_RULE : null,
        mercadolibre?.opciones[0]?.estimado?.withoutFixedFee ? "Sin el cargo fijo ni su precio límite de Mercado Libre en Configuración: se estima con envío en cualquier precio." : null,
      ].filter(Boolean) as string[],
    ),
  );

  return sections(heading("Resumen"), summary, storeBlock, mlBlock, marketBlock, similarBlock, how);
}

const MIX_TITLE = { "mayor-ganancia": "Mayor ganancia", "mitad-y-mitad": "Mitad y mitad", "menos-packs": "Menos packs" } as const;

export function composePacksAnswer(result: PacksResult): string {
  const { entradas, tamanos, recomendados, pocosPacks, mezclas, envioTipico, envioGratisDesde, canal } = result.datos;
  const best = [...tamanos].sort((a, b) => b.totalProfit - a.totalProfit)[0];
  const few = tamanos.filter((row) => row.packs < 8);
  const summary = [
    `Con ${units(entradas.disponible, "unidad", "unidades")} a **${money(entradas.costoUnitario)}**, el pack de **${best.size} deja más ganancia en total** (${money(best.totalProfit)} si vendes los ${best.packs}).`,
    `Empieza con **${recomendados.map((size) => `x${size}`).join(" y ")}**${pocosPacks && few.length ? `: de ${few.map((row) => `x${row.size}`).join(" y ")} salen pocos packs` : ""}.`,
  ].join(" ");

  const sizes = tamanos.map((row) =>
    [
      heading(`x${row.size} · ${money(row.price)}${row.sugerido ? ` ${tag("sugerido")}` : ""}`, 3),
      keyLine(`${money(row.profit)} de ganancia`, [
        `${percent(row.profitPct)} sobre el precio`,
        `${money(row.unitPrice)} por unidad${row.unitDiscountPct !== null ? ` (${percent(row.unitDiscountPct)} menos)` : ""}`,
        row.leftover > 0 ? `${units(row.packs, "pack", "packs")} y sobran ${row.leftover}` : `alcanza para ${units(row.packs, "pack", "packs")}`,
      ]),
    ].join("\n"),
  );

  const notes = [
    entradas.costoEmpaque === null ? "Sin costo de empaque: la ganancia no lo descuenta." : `Con empaque de ${money(entradas.costoEmpaque)} por pack, ya descontado.`,
    ...tamanos.filter((row) => row.minimoTienda?.debajo).map((row) => `x${row.size} queda por debajo del margen mínimo de la tienda (${percent(row.minimoTienda!.margenPct)}). ${tag("por debajo del mínimo")}`),
    ...tamanos.filter((row) => row.complemento).map((row) => `x${row.size} cuesta menos que el envío típico (${money(envioTipico.mediana ?? 0)}): mejor como complemento de otra compra. ${tag("se vende como complemento")}`),
    envioGratisDesde ? `Envío gratis desde ${money(envioGratisDesde)}: ${tamanos.map((row) => `${row.packsParaEnvioGratis} de x${row.size}`).join(", ")}.` : null,
    ...(canal === "tienda"
      ? []
      : tamanos
          .filter((row) => row.mercadolibre?.some((option) => option.debajoDelPiso))
          .map(
            (row) =>
              `En Mercado Libre x${row.size} queda por debajo de tus metas: ${row
                .mercadolibre!.map((option) => `te quedan ${option.net === null ? "—" : money(option.net)} con ${percent(option.commissionPct)}`)
                .join(" o ")}. ${estimateTag(row.mercadolibre![0])}`,
          )),
    "Revisa en 2 a 3 semanas con lo que se haya vendido.",
  ].filter(Boolean) as string[];

  const how = collapsible(
    "Cómo se calculó",
    bulletList(
      [
        entradas.precioBase
          ? `Sin precio tuyo: x${entradas.precioBase.tamano} sale del aumento de ${percent(entradas.precioBase.aumentoPct)} (${entradas.precioBase.fuente}).`
          : null,
        tamanos.some((row) => row.sugerido)
          ? `Los tamaños sugeridos: el precio por unidad del tamaño dado, con ${entradas.pasoDescuentoPct} puntos más de descuento por cada tamaño más grande, bajado a un precio terminado en 900.`
          : null,
        "Ganancia: precio del pack − (unidades × costo + empaque).",
        envioTipico.mediana !== null
          ? `Envío típico: la mediana de lo que pagaron de envío ${units(envioTipico.pedidos, "pedido pagado", "pedidos pagados")} de 90 días (sin envío gratis).`
          : "Envío típico: no hay pedidos pagados con envío en 90 días.",
        GROSS,
        canal === "tienda" ? null : ML_TYPES_HOW,
        canal === "tienda" ? null : ML_RULE,
      ].filter(Boolean) as string[],
    ),
  );

  return sections(
    heading("Resumen"),
    summary,
    heading("Por tamaño"),
    sizes.join("\n\n"),
    mezclas.length ? [heading("Mezclas que usan todo el stock"), numberedList(mezclas.map((mix) => `${MIX_TITLE[mix.kind]}: ${mix.counts.map((count) => `${count.packs} × x${count.size}`).join(" + ")} → ${money(mix.totalProfit)}${mix.leftover ? ` (sobran ${mix.leftover})` : ""}`))].join("\n\n") : null,
    heading("Notas"),
    bulletList(notes),
    how,
  );
}

export function composeBelowMarginAnswer(result: BelowMarginResult): string {
  const datos = result.datos;
  if (datos.sinMargen) {
    return sections(heading("Resumen"), "No tienes un margen mínimo en Configuración. Dime qué margen quieres revisar (por ejemplo 35 % o 40 %) y te digo qué productos quedan por debajo.");
  }
  const scope = datos.subcategoria ? ` de ${datos.subcategoria}` : "";
  const summaryLines = datos.porUmbral.map(
    (threshold) =>
      `Por debajo del ${percent(threshold.margenPct)}: **${units(threshold.debajo, "producto", "productos")}** de ${datos.evaluados}${threshold.categorias.length ? ` en ${units(threshold.categorias.length, "subcategoría", "subcategorías")}` : ""}.`,
  );
  const blocks = datos.porUmbral.map((threshold) =>
    [
      heading(`Debajo del ${percent(threshold.margenPct)} (${threshold.debajo})`),
      threshold.categorias.length === 0
        ? "Ningún producto queda por debajo."
        : threshold.categorias
            .map((category) =>
              [
                heading(`${category.categoria} · ${category.debajo} de ${category.evaluados}`, 3),
                `Subirían en promedio ${money(category.subidaPromedio)}.`,
                collapsible(
                  "Precios para llegar",
                  bulletList([
                    ...category.productos.map((product) => `${product.nombre}: ${money(product.precio)} → **${money(product.precioNecesario)}** (hoy ${percent(product.margenPct)})`),
                    ...(category.masProductos ? [`Y ${units(category.masProductos, "producto más", "productos más")}.`] : []),
                  ]),
                ),
              ].join("\n\n"),
            )
            .join("\n\n"),
    ].join("\n\n"),
  );
  const notes = [
    datos.minimoConfigurado !== null ? `Tu margen mínimo hoy es ${percent(datos.minimoConfigurado)} (Configuración).` : "No tienes un margen mínimo en Configuración.",
    datos.sinCosto ? `${units(datos.sinCosto, "producto sin costo de compra no se evaluó", "productos sin costo de compra no se evaluaron")}.` : null,
    datos.kits ? `${units(datos.kits, "kit no entra", "kits no entran")}: se evalúan por sus piezas.` : null,
    datos.conExcepcion ? `${units(datos.conExcepcion, "producto con precio bajo a propósito no entra", "productos con precio bajo a propósito no entran")} (excepción de margen en su ficha).` : null,
    datos.subcategoriaPedidaSinCoincidencia ? "No encontré la subcategoría que nombraste: revisé toda la tienda." : null,
    datos.truncado ? "La tienda tiene más productos de los que reviso de una vez: la lista puede no estar completa." : null,
  ].filter(Boolean) as string[];
  const how = collapsible(
    "Cómo se calculó",
    bulletList([
      "Margen sobre el precio con el precio de lista: (precio − compra − envío por unidad) ÷ precio.",
      "Precio para llegar: costo ÷ (1 − margen), redondeado al peso hacia arriba.",
      GROSS,
    ]),
  );
  return sections(heading("Resumen"), `Productos activos${scope}:`, bulletList(summaryLines), ...blocks, heading("Notas"), bulletList(notes), how);
}
