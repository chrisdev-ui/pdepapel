import { bulletList, collapsible, copyBlock, heading, keyLine, numberedList, sections, stripInternalMarks, tag } from "@/lib/copiloto/answer-blocks";
import { KIT_NAME_MAX_WORDS, isNameTaken, percent, pesos, shortKitName, takeName } from "@/lib/copiloto/kits-rotation";

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
  criterios?: { diasSinVenta?: number; lineasSinFamilia?: string[]; margenCriterioPanelPct?: number; precioMinimoPiezaLenta?: number };
  totalLentos?: number;
  plataQuietaACostoTotal?: number;
  lentosSinCosto?: number;
  lentos?: { nombre: string; disponible: number; plataQuietaACosto: number | null; ultimaVenta: string }[];
  nuevosSinDatosDeVenta?: { cantidad?: number };
  quietosDeBajoValor?: { cantidad?: number; nombres?: string[]; productos?: { nombre: string; precioEfectivo: number; motivo: string }[] };
  kits?: KitData[];
  pocoAtractivos?: { nombre: string; motivo: string }[];
  sinKit?: { nombre: string; motivo: string }[];
}

const MARKER = /\[\[\s*KIT\s*[-‐‑–—_ ]?\s*(\d+)\s*\]\]/gi;
const AMOUNT_OR_PERCENT = /\$\s?\d|\d\s?%/;
const NAME_MAX = 48;
const TEMPLATE_START = /^(?:[-*•]\s+)?(?:\*\*|#{1,6}\s+)?(?:✨|📦|🎁)/;
const TEMPLATE_EMOJI = /(?:✨|📦|🎁)/;
const BULLET_LINE = /^\s*[-*•]\s+(.*)$/;

const cleanName = (raw: string) =>
  stripInternalMarks(raw.replace(MARKER, ""))
    .split(TEMPLATE_EMOJI)[0]
    .replace(/\*\*|__|`/g, "")
    .replace(/^[\s\-–—:·•#>]+|[\s\-–—:·.,;]+$/g, "")
    .replace(/^[«"“]+|[»"”]+$/g, "")
    .trim();

/** Un nombre corto de verdad: 1 a 6 palabras, sin precios ni porcentajes. */
function validName(raw: string): string | null {
  const name = cleanName(raw);
  if (!name || name.length > NAME_MAX || AMOUNT_OR_PERCENT.test(name) || !/[a-záéíóúñü]{2}/i.test(name)) return null;
  const words = name.split(/\s+/).length;
  return words >= 1 && words <= KIT_NAME_MAX_WORDS ? name : null;
}

/** Solo las líneas de la plantilla de Paula (✨ / 📦 / 🎁 y sus viñetas); lo demás (notas, «:::», números) se queda afuera. */
function readCopy(segment: string): string {
  const lines = segment.split("\n");
  const open = lines.findIndex((line) => /^\s*:::copiar/.test(line));
  const close = open < 0 ? -1 : lines.findIndex((line, index) => index > open && /^\s*:::\s*$/.test(line));
  const fenced = open < 0 ? null : lines.slice(open + 1, close < 0 ? undefined : close).join("\n");
  const body = (fenced ?? segment).replace(/([^\n])[ \t]*(✨|📦|🎁)/g, "$1\n$2");
  const kept: string[] = [];
  let started = false;
  let giftSentenceOpen = false;
  for (const raw of body.split("\n")) {
    const trimmed = raw.trim();
    if (/^:::/.test(trimmed) || /^#{1,6}\s/.test(trimmed) && !TEMPLATE_START.test(trimmed)) {
      if (started) break;
      continue;
    }
    const line = stripInternalMarks(raw.replace(MARKER, "")).trim();
    if (!line) continue;
    if (TEMPLATE_START.test(line)) {
      started = true;
      const head = line.replace(/^(?:[-*•]\s+)?(?:#{1,6}\s+)?/, "");
      const [title, ...inline] = head.split(/\s+[-•]\s+/);
      if (!AMOUNT_OR_PERCENT.test(title)) kept.push(title.trim());
      for (const item of inline) if (!AMOUNT_OR_PERCENT.test(item)) kept.push(`- ${item.trim()}`);
      giftSentenceOpen = title.trim().startsWith("🎁") && inline.length === 0 && title.trim().replace(/^🎁\s*/, "").split(/\s+/).length <= 4;
      continue;
    }
    if (!started) continue;
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      if (!AMOUNT_OR_PERCENT.test(bullet[1])) kept.push(`- ${bullet[1].trim()}`);
      continue;
    }
    if (giftSentenceOpen && !AMOUNT_OR_PERCENT.test(line)) {
      kept.push(line);
      giftSentenceOpen = false;
      continue;
    }
    break;
  }
  return kept.join("\n").trim();
}

/**
 * Por kit, lo que escribió el modelo: un nombre corto (opcional) y el texto
 * para la ficha. Tolera el marcador en cualquier lugar del renglón, el nombre
 * en el renglón siguiente, todo en un solo renglón, notas sueltas y bloques
 * «:::»: del texto para la ficha solo se toman las líneas de la plantilla.
 */
export function readModelKits(text: string): Map<string, { name: string | null; copy: string }> {
  const source = text.replace(/\r\n/g, "\n");
  const matches = Array.from(source.matchAll(MARKER));
  const found = new Map<string, { name: string | null; copy: string }>();
  matches.forEach((match, index) => {
    const key = `[[KIT-${Number(match[1])}]]`;
    const from = match.index! + match[0].length;
    const segment = source.slice(from, index + 1 < matches.length ? matches[index + 1].index : source.length);
    const lineStart = source.lastIndexOf("\n", match.index! - 1) + 1;
    const before = source.slice(lineStart, match.index);
    const [sameLine, ...rest] = segment.split("\n");
    const nextLine = rest.find((line) => line.trim()) ?? "";
    const name =
      validName(sameLine) ??
      (cleanName(sameLine) ? null : !TEMPLATE_START.test(nextLine.trim()) && !/^\s*:::/.test(nextLine) ? validName(nextLine) : null) ??
      validName(before);
    const copy = readCopy(segment);
    const previous = found.get(key);
    if (!previous || (!previous.copy && copy) || (!previous.name && name && !previous.copy)) found.set(key, { name: name ?? previous?.name ?? null, copy: copy || previous?.copy || "" });
  });
  return found;
}

const GIFT_OCCASION = /regal|amor|amistad|madre|padre|navidad|grados|valent|mujer|maestro|niño|nino|cumple/i;
const joinNames = (names: readonly string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`);

/** Sin texto del modelo para ese kit: uno armado con sus datos (qué trae y para qué), nunca el de otro kit. */
export function fallbackCopy(kit: Pick<KitData, "ocasion" | "piezas">): string {
  const occasion = kit.ocasion?.replace(/\s*\(.*\)\s*$/, "").trim() || null;
  return [
    occasion ? `✨ Ocasión: ${occasion}` : null,
    `📦 Incluye: ${joinNames(kit.piezas.map((piece) => piece.nombre))}`,
    occasion && GIFT_OCCASION.test(occasion) ? "🎁 Ideal para regalar." : null,
  ]
    .filter(Boolean)
    .join("\n");
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

const DAY_MONTH = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" });
/** «Grados el 2026-11-25» → «Grados (25 de noviembre)». */
const friendlyDates = (line: string) => line.replace(/ el (\d{4}-\d{2}-\d{2})\b/g, (_match, iso: string) => ` (${DAY_MONTH.format(new Date(`${iso}T00:00:00Z`))})`);

function kitBlock(kit: KitData, model: { name: string | null; copy: string } | undefined, shownName: (name: string) => string, marginGoalPct: number | undefined): string {
  const name = shownName(kit.nombreSugerido);
  const lowMargin = marginGoalPct !== undefined ? tag(`margen bajo (meta ${percent(marginGoalPct)})`) : tag("margen bajo");
  const separado = `por separado ${pesos(kit.sumaPreciosEfectivos)}`;
  const rest = [
    ...(kit.precioSugerido !== null ? [separado] : []),
    ...(kit.ahorroPct !== null ? [`ahorro ${percent(kit.ahorroPct)}`] : []),
    ...(kit.margenPct !== null ? [`margen ${percent(kit.margenPct)}${kit.margenBajo ? ` ${lowMargin}` : ""}`] : []),
    `alcanza para ${plural(kit.kitsArmables, "kit", "kits")}`,
  ];
  const key = kit.precioSugerido !== null ? keyLine(pesos(kit.precioSugerido), rest) : keyLine(separado, rest);
  const items = kit.piezas.map((piece) => {
    const price = `${pesos(piece.precioEfectivo)}${piece.oferta && piece.precioDeLista ? ` (oferta «${piece.oferta}», antes ${pesos(piece.precioDeLista)})` : ""}`;
    const line = `- ${piece.nombre} · ${price} ${tag(piece.rol === "lento" ? "quieto" : "se vende")}`;
    return piece.comparteStockCon?.length ? `${line}\n  - comparte stock con ${piece.comparteStockCon.map((other) => `«${shownName(other)}»`).join(" y ")}` : line;
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
    kit.señales?.length ? collapsible("Por qué estos productos", bulletList(kit.señales.map(friendlyDates))) : null,
    model?.copy ? copyBlock("Texto para la ficha", model.copy) : copyBlock("Texto para la ficha (base)", fallbackCopy(kit)),
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

  const lowValueProducts = datos.quietosDeBajoValor?.productos ?? [];
  const lowValueNames = new Set([...(datos.quietosDeBajoValor?.nombres ?? []), ...lowValueProducts.map((row) => row.nombre)]);
  const top = (datos.lentos ?? []).slice(0, 5).map(
    (row) =>
      [row.nombre, `${row.disponible} und`, sinVentas(row.ultimaVenta), row.plataQuietaACosto !== null ? `${pesos(row.plataQuietaACosto)} a costo` : "sin costo registrado"].join(" · ") +
      (lowValueNames.has(row.nombre) ? ` ${tag("no va en kits")}` : ""),
  );

  const model = readModelKits(modelText);
  const kits = datos.kits ?? [];
  // Un nombre corto y distinto por kit, el mismo en su título y donde otro kit dice que comparte stock con él.
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const kit of kits) {
    const fromModel = kit.marcador ? model.get(kit.marcador)?.name : null;
    const fromTool = kit.nombreSugerido.split(/\s+/).length <= KIT_NAME_MAX_WORDS ? kit.nombreSugerido : null;
    const chosen = [fromModel, fromTool].find((name): name is string => Boolean(name) && !isNameTaken(name!, taken));
    names.set(kit.nombreSugerido, chosen ? takeName(chosen, taken) : shortKitName(kit.ocasion ?? null, null, taken));
  }
  const shownName = (name: string) => names.get(name) ?? name;
  const marginGoal = datos.criterios?.margenCriterioPanelPct;
  const kitsSection = kits.length
    ? sections(heading(`${plural(kits.length, "kit sugerido", "kits sugeridos")}`), ...kits.map((kit) => kitBlock(kit, kit.marcador ? model.get(kit.marcador) : undefined, shownName, marginGoal)))
    : sections(heading("Kits"), "No encontré kits que convengan con estos productos.");

  const lowValue = datos.quietosDeBajoValor?.cantidad ?? 0;
  const minSlow = datos.criterios?.precioMinimoPiezaLenta;
  const lowValueNote = (row: { nombre: string; precioEfectivo: number; motivo: string }) =>
    row.motivo === "pesa poco en el kit"
      ? `${row.nombre} no entra en kits: a ${pesos(row.precioEfectivo)} pesa muy poco frente a las otras piezas. Mejor en promo o en un combo de caja.`
      : `${row.nombre} no entra en kits porque su precio por unidad es muy bajo (${pesos(row.precioEfectivo)}${minSlow !== undefined ? `; una pieza quieta debe valer al menos ${pesos(minSlow)}` : ""}). Mejor en promo o en un combo de caja.`;
  const notes = [
    ...(lowValueProducts.length > 0
      ? [
          ...lowValueProducts.map(lowValueNote),
          ...(lowValue > lowValueProducts.length ? [`Hay ${lowValue - lowValueProducts.length} quietos más de bajo valor que tampoco entran en kits.`] : []),
        ]
      : lowValue > 0
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
