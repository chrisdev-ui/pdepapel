import { bulletList, collapsible, copyBlock, heading, keyLine, numberedList, sections, tag } from "@/lib/copiloto/answer-blocks";
import { percent, pesos } from "@/lib/copiloto/kits-rotation";

/**
 * La respuesta de «kits para rotar» la arma el código con lo que trae la
 * herramienta: resumen, los 5 con más plata quieta, un bloque por kit (línea
 * clave, piezas con su etiqueta, «Por qué» plegado) y notas. Del modelo solo
 * se toma, por kit, un nombre corto y el texto para la ficha. Así ningún
 * número, pieza ni término interno sale de lo que escribe el modelo.
 */

interface PieceData {
  nombre: string;
  rol: "lento" | "se vende" | string;
  precioEfectivo: number;
  precioDeLista?: number;
  oferta?: string | null;
  comparteStockCon?: string[];
}

export interface KitData {
  nombreSugerido: string;
  ocasion?: string | null;
  marcador?: string;
  piezas: PieceData[];
  kitsArmables: number;
  sumaPreciosEfectivos: number;
  precioSugerido: number | null;
  ahorroPct: number | null;
  margenPct: number | null;
  /** Debajo del criterio de margen del panel (Crecimiento › Campañas). `null` sin costo. */
  margenBajo?: boolean | null;
  sinCostoDe?: string[];
  estado?: string;
  descuentoObjetivoPct?: number;
  señales?: string[];
}

export interface KitsAnswerData {
  criterios?: { diasSinVenta?: number; lineasSinFamilia?: string[] };
  totalLentos?: number;
  plataQuietaACostoTotal?: number;
  lentosSinCosto?: number;
  lentos?: { nombre: string; disponible: number; plataQuietaACosto: number | null; ultimaVenta: string }[];
  nuevosSinDatosDeVenta?: { cantidad?: number };
  quietosDeBajoValor?: { cantidad?: number; nombres?: string[] };
  kits?: KitData[];
  pocoAtractivos?: { nombre: string; motivo: string }[];
  sinKit?: { nombre: string; motivo: string }[];
}

const MARKER = /\[\[KIT-(\d+)\]\]/;
const AMOUNT_OR_PERCENT = /\$\s?\d|\d\s?%/;
const NAME_MAX = 48;

/** Por kit, lo que escribió el modelo: un nombre corto (opcional) y el texto para la ficha. */
export function readModelKits(text: string): Map<string, { name: string | null; copy: string }> {
  const found = new Map<string, { name: string | null; lines: string[] }>();
  let current: { name: string | null; lines: string[] } | null = null;
  for (const raw of text.split("\n")) {
    const marker = MARKER.exec(raw);
    if (marker) {
      // Solo lo que va después del marcador: lo de antes en el mismo renglón no es el nombre.
      const rest = raw
        .slice(marker.index + marker[0].length)
        .replace(/\*\*/g, "")
        .replace(/^[\s\-–—:·•#]+|[\s\-–—:·.]+$/g, "")
        .trim();
      current = { name: rest && rest.length <= NAME_MAX && !AMOUNT_OR_PERCENT.test(rest) ? rest : null, lines: [] };
      found.set(`[[KIT-${marker[1]}]]`, current);
      continue;
    }
    if (!current) continue;
    // El texto para la clienta no lleva precios, porcentajes ni secciones del panel.
    if (AMOUNT_OR_PERCENT.test(raw) || /^#{1,6}\s|^:::/.test(raw.trim())) continue;
    current.lines.push(raw.trimEnd());
  }
  return new Map(Array.from(found, ([marker, value]) => [marker, { name: value.name, copy: value.lines.join("\n").trim() }]));
}

const OCCASION_EMOJI: [RegExp, string][] = [
  [/grad/i, "🎓"],
  [/navidad/i, "🎄"],
  [/madre|padre|amor|amistad|regalo|cumple/i, "🎁"],
  [/escolar|útiles|utiles|colegio|clases/i, "✏️"],
  [/arte|dibujo|pintura|lettering|manualidad/i, "🎨"],
];
const emojiFor = (kit: KitData) => OCCASION_EMOJI.find(([pattern]) => pattern.test(`${kit.ocasion ?? ""} ${kit.nombreSugerido}`))?.[1] ?? "🧺";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const sinVentas = (ultimaVenta: string) => (/más de un año/.test(ultimaVenta) ? "sin ventas en más de un año" : `sin ventas ${ultimaVenta}`);

function kitBlock(kit: KitData, model: { name: string | null; copy: string } | undefined): string {
  const name = model?.name ?? kit.nombreSugerido;
  const separado = `por separado ${pesos(kit.sumaPreciosEfectivos)}`;
  const rest = [
    ...(kit.precioSugerido !== null ? [separado] : []),
    ...(kit.ahorroPct !== null ? [`ahorro ${percent(kit.ahorroPct)}`] : []),
    ...(kit.margenPct !== null ? [`margen ${percent(kit.margenPct)}${kit.margenBajo ? ` ${tag("margen bajo")}` : ""}`] : []),
    `alcanza para ${plural(kit.kitsArmables, "kit", "kits")}`,
  ];
  const key = kit.precioSugerido !== null ? keyLine(pesos(kit.precioSugerido), rest) : keyLine(separado, rest);
  const items = kit.piezas.map((piece) => {
    const price = `${pesos(piece.precioEfectivo)}${piece.oferta && piece.precioDeLista ? ` (oferta «${piece.oferta}», antes ${pesos(piece.precioDeLista)})` : ""}`;
    const line = `- ${piece.nombre} · ${price} ${tag(piece.rol === "lento" ? "quieto" : "se vende")}`;
    return piece.comparteStockCon?.length ? `${line}\n  - comparte stock con ${piece.comparteStockCon.map((other) => `«${other}»`).join(" y ")}` : line;
  });
  const notes = [
    ...(kit.sinCostoDe?.length ? [`Sin costo de ${kit.sinCostoDe.join(", ")}: no se calcula margen ni precio mínimo.`] : []),
    ...(kit.estado === "descuento limitado por costo" && kit.descuentoObjetivoPct !== undefined
      ? [`El descuento quedó por debajo del ${kit.descuentoObjetivoPct} % porque el costo no deja bajar más.`]
      : []),
  ];
  return sections(
    heading(`${emojiFor(kit)} ${name}`, 3),
    key,
    items.join("\n"),
    notes.join("\n"),
    kit.señales?.length ? collapsible("Por qué estos productos", bulletList(kit.señales)) : null,
    model?.copy ? copyBlock("Texto para la ficha", model.copy) : null,
  );
}

export function composeKitsAnswer(datos: KitsAnswerData, modelText: string): string {
  const days = datos.criterios?.diasSinVenta ?? 90;
  const total = datos.totalLentos ?? 0;
  const nuevos = datos.nuevosSinDatosDeVenta?.cantidad ?? 0;
  const nuevosLine = nuevos > 0 ? `No cuento ${plural(nuevos, "producto nuevo", "productos nuevos")}: entraron hace menos de ${days} días y todavía no se sabe si se venden.` : null;

  if (total === 0) {
    return sections(heading("Resumen"), [`No hay productos con disponible y sin ventas en ${days} días.`, nuevosLine].filter(Boolean).join(" "));
  }

  const sinCosto = datos.lentosSinCosto ?? 0;
  const summary = [
    `Hay **${plural(total, "producto quieto", "productos quietos")}** (sin ventas en ${days} días) con **${pesos(datos.plataQuietaACostoTotal ?? 0)}** quietos a costo.`,
    sinCosto > 0 ? `${plural(sinCosto, "no tiene", "no tienen")} costo registrado y no ${sinCosto === 1 ? "suma" : "suman"} a esa plata.` : null,
    nuevosLine,
  ]
    .filter(Boolean)
    .join(" ");

  const top = (datos.lentos ?? []).slice(0, 5).map((row) =>
    [row.nombre, `${row.disponible} und`, sinVentas(row.ultimaVenta), row.plataQuietaACosto !== null ? `${pesos(row.plataQuietaACosto)} a costo` : "sin costo registrado"].join(" · "),
  );

  const model = readModelKits(modelText);
  const kits = datos.kits ?? [];
  const kitsSection = kits.length
    ? sections(heading(`${plural(kits.length, "kit sugerido", "kits sugeridos")}`), ...kits.map((kit) => kitBlock(kit, kit.marcador ? model.get(kit.marcador) : undefined)))
    : sections(heading("Kits"), "No encontré kits que convengan con estos productos.");

  const lowValue = datos.quietosDeBajoValor?.cantidad ?? 0;
  const notes = [
    ...(lowValue > 0
      ? [`${plural(lowValue, "quieto de bajo valor", "quietos de bajo valor")} no ${lowValue === 1 ? "entra" : "entran"} como pieza principal de un kit${datos.quietosDeBajoValor?.nombres?.length ? ` (${datos.quietosDeBajoValor.nombres.join(", ")})` : ""}: mejor en promo o en un combo de caja.`]
      : []),
    ...(datos.pocoAtractivos ?? []).map((weak) => `Poco atractivo, no lo ofrezcas: ${weak.nombre} — ${weak.motivo}.`),
    ...(datos.sinKit ?? []).map((row) => `Sin kit: ${row.nombre} — ${row.motivo}.`),
    ...(datos.criterios?.lineasSinFamilia?.length ? [`Estas líneas no están en ninguna familia de kits y no se usaron: ${datos.criterios.lineasSinFamilia.join(", ")}.`] : []),
    "Son borradores: créalos en Productos › Kit si te sirven.",
  ];

  return sections(
    heading("Resumen"),
    summary,
    top.length ? heading(`Los ${top.length} con más plata quieta`) : null,
    top.length ? numberedList(top) : null,
    kitsSection,
    heading("Notas"),
    bulletList(notes),
  );
}
