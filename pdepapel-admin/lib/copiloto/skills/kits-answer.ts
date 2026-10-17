import { describesPieces, piecesPurposeBullet } from "@/lib/copiloto/skills/kit-pieces-copy";
import { bulletList, collapsible, copyBlock, heading, keyLine, numberedList, sections, tag } from "@/lib/copiloto/answer-blocks";
import { KIT_NAME_MAX_WORDS, isNameTaken, percent, pesos, shortKitName, takeName } from "@/lib/copiloto/kits-rotation";
import { validateKitTexts, type KitTexts } from "@/lib/copiloto/skills/kits-texts";

/**
 * La respuesta de «kits para rotar» la arma el código con lo que trae la
 * herramienta: resumen, los 5 con más plata quieta, un bloque por kit (línea
 * clave, piezas con su etiqueta, «Por qué» plegado) y notas. Del modelo solo
 * se toma, por kit y como datos validados (`textosDeKits`), un nombre corto,
 * dos frases y para qué es ideal; la lista de piezas sale de la herramienta.
 * Así ningún número, pieza ni término interno sale de lo que escribe el modelo.
 */

interface PieceData {
  nombre: string;
  rol: "lento" | "se vende" | string;
  categoria?: string | null;
  precioEfectivo: number;
  precioDeLista?: number;
  oferta?: string | null;
  comparteStockCon?: string[];
}

export interface KitData {
  nombreSugerido: string;
  ocasion?: string | null;
  /** Su número en la respuesta: con él el modelo manda sus textos. */
  n?: number;
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

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Por ocasión, la segunda frase de «Lo que amarás» y el «Ideal para…» del texto base. */
const OCCASION_COPY: [RegExp, { bullet: string; ideal: string }][] = [
  [/utiles escolares|regreso a clases/, { bullet: "Listo para el colegio, las tareas y los apuntes", ideal: "el regreso a clases y el día a día del colegio" }],
  [/oficina/, { bullet: "Todo a mano para organizar el escritorio y los pendientes", ideal: "la oficina o el estudio en casa" }],
  [/grados/, { bullet: "Un detalle para celebrar un logro importante", ideal: "regalar en grados" }],
  [/navidad/, { bullet: "Un regalo listo para poner bajo el árbol", ideal: "regalar en Navidad" }],
  [/amor y amistad|san valentin/, { bullet: "Para sorprender a esa persona especial", ideal: "regalar en Amor y Amistad" }],
  [/dia de la madre/, { bullet: "Un detalle para consentir a mamá", ideal: "regalar el Día de la madre" }],
  [/dia del padre/, { bullet: "Un detalle para consentir a papá", ideal: "regalar el Día del padre" }],
  [/dia de la mujer/, { bullet: "Un detalle para celebrar a una mujer especial", ideal: "regalar el Día de la mujer" }],
  [/dia del maestro/, { bullet: "Un detalle para agradecerle a un profe", ideal: "regalar el Día del maestro" }],
  [/dia del nino/, { bullet: "Para crear, colorear y jugar", ideal: "regalar el Día del niño" }],
  [/dia del idioma/, { bullet: "Para leer, escribir y llevar tus ideas a todas partes", ideal: "celebrar el Día del idioma" }],
  [/halloween/, { bullet: "Para decorar y celebrar Halloween", ideal: "celebrar Halloween" }],
  [/velitas/, { bullet: "Para llenar de luz la noche de velitas", ideal: "la noche de velitas" }],
  [/regalo|cumple/, { bullet: "Un detalle bonito, listo para entregar", ideal: "regalar a alguien especial" }],
];
const occasionOf = (kit: Pick<KitData, "ocasion">) => kit.ocasion?.replace(/\s*\(.*\)\s*$/, "").trim() || null;
const occasionCopy = (kit: Pick<KitData, "ocasion">) => {
  const occasion = occasionOf(kit);
  if (!occasion) return null;
  return OCCASION_COPY.find(([pattern]) => pattern.test(fold(occasion)))?.[1] ?? { bullet: "Piezas que combinan entre sí, elegidas para usarse juntas", ideal: occasion.charAt(0).toLowerCase() + occasion.slice(1) };
};
const joinWords = (words: readonly string[]) => (words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} y ${words[words.length - 1]}`);

/** «Marcadores, cuadernos y borradores en un solo kit», con las categorías de sus piezas. */
function categoriesBullet(kit: Pick<KitData, "piezas">): string {
  const seen = new Set<string>();
  const categories = kit.piezas
    .map((piece) => piece.categoria?.trim())
    .filter((category): category is string => Boolean(category) && !seen.has(fold(category!)) && Boolean(seen.add(fold(category!))))
    .map((category, index) => (index === 0 ? category : category.charAt(0).toLowerCase() + category.slice(1)));
  return categories.length ? `${joinWords(categories)} en un solo kit` : "Todo lo que necesitas en un solo kit";
}

function fichaText(kit: Pick<KitData, "piezas">, bullets: readonly [string, string], idealPara: string | null): string {
  return [
    "✨ Lo que amarás",
    bulletList(bullets),
    "📦 Incluye",
    bulletList(kit.piezas.map((piece) => piece.nombre)),
    idealPara ? `🎁 Ideal para ${idealPara}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Sin texto del modelo para ese kit: uno armado con sus datos (cada pieza y para qué sirve, su ocasión), nunca el de otro kit. */
export function fallbackCopy(kit: Pick<KitData, "ocasion" | "piezas">): string {
  const occasion = occasionCopy(kit);
  return fichaText(kit, [piecesPurposeBullet(kit.piezas) ?? categoriesBullet(kit), occasion?.bullet ?? "Piezas que combinan entre sí, elegidas para usarse juntas"], occasion?.ideal ?? null);
}

/** El texto del modelo con la plantilla de Paula, solo si habla de las piezas reales del kit; si no, el texto base. */
export function modelCopy(kit: Pick<KitData, "ocasion" | "piezas">, texts: KitTexts): string | null {
  if (!texts.bullets || !describesPieces(texts.bullets, kit.piezas)) return null;
  return fichaText(kit, texts.bullets, texts.idealPara ?? occasionCopy(kit)?.ideal ?? null);
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

function kitBlock(kit: KitData, texts: KitTexts | undefined, shownName: (name: string) => string, marginGoalPct: number | undefined): string {
  const name = shownName(kit.nombreSugerido);
  const copy = texts ? modelCopy(kit, texts) : null;
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
    copy ? copyBlock("Texto para la ficha", copy) : copyBlock("Texto para la ficha (base)", fallbackCopy(kit)),
  );
}

/** `kitTexts` es lo que el modelo mandó a `textosDeKits` (sin validar), o null si no lo llamó. */
export function composeKitsAnswer(datos: KitsAnswerData, kitTexts: unknown): string {
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

  const model = validateKitTexts(kitTexts);
  const kits = datos.kits ?? [];
  // Un nombre corto y distinto por kit, el mismo en su título y donde otro kit dice que comparte stock con él.
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const kit of kits) {
    const fromModel = kit.n !== undefined ? model.get(kit.n)?.name : null;
    const fromTool = kit.nombreSugerido.split(/\s+/).length <= KIT_NAME_MAX_WORDS ? kit.nombreSugerido : null;
    const chosen = [fromModel, fromTool].find((name): name is string => Boolean(name) && !isNameTaken(name!, taken));
    names.set(kit.nombreSugerido, chosen ? takeName(chosen, taken) : shortKitName({ categoryName: kit.piezas[0]?.categoria ?? null, designName: null, brand: null }, kit.ocasion ?? null, taken));
  }
  const shownName = (name: string) => names.get(name) ?? name;
  const marginGoal = datos.criterios?.margenCriterioPanelPct;
  const kitsSection = kits.length
    ? sections(heading(`${plural(kits.length, "kit sugerido", "kits sugeridos")}`), ...kits.map((kit) => kitBlock(kit, kit.n !== undefined ? model.get(kit.n) : undefined, shownName, marginGoal)))
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
