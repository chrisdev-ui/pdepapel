import { z } from "zod";

import {
  CANONICAL_HEAD_NOUNS,
  LICENCE_NAMES,
  PRODUCT_NAME_EXAMPLES,
  SALES_ADJECTIVES,
} from "@/constants/product-naming";
import { AppError } from "@/lib/api-errors";
import { getCloudinaryImageUrl } from "@/lib/cloudinary-image-loader";
import {
  MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
  productImageAnalysisOutputSchema,
  type ProductImageAnalysisOutput,
} from "@/lib/product-image-analysis";
import {
  fitProductName,
  getHeadNounCategoryKey,
  formatProductQuantity,
  getCanonicalHeadNoun,
  PRODUCT_NAME_HARD_MAX_LENGTH,
  toNamingKey,
} from "@/lib/product-naming";

/**
 * Análisis de todas las fotos de un producto (hasta 10): tandas de hasta 4
 * fotos en paralelo que solo leen lo que se ve en cada una, y una pasada
 * final de solo texto que arma la ficha con la gramática de nombres. Cada
 * llamada tiene su propio límite de tiempo para que el total quede por debajo
 * de los 60 s de la función.
 */

export const PRODUCT_IMAGE_ANALYSIS_MODELS = {
  facts: "gemini-3.5-flash-lite",
  synthesis: "gemini-3.5-flash-lite",
} as const;
export const PHOTO_BATCH_SIZE = 4;
/** Ancho de la copia que lee el modelo: uno de los cinco anchos fijos del panel. */
export const ANALYSIS_IMAGE_WIDTH = 1080;
/**
 * `f_auto` entrega JPEG a quien no manda el Accept de un navegador, y eso sería
 * otra copia derivada por foto. Con este Accept llega la misma WebP del panel.
 */
export const ANALYSIS_IMAGE_ACCEPT = "image/webp,image/*;q=0.8";
/**
 * Una tanda sana tarda 3–6 s, pero Gemini a veces tarda más de 20 s con la
 * misma foto; la pasada final, de solo texto, no pasa de 5 s.
 */
export const PIPELINE_TIMEOUTS = {
  categoryMs: 8_000,
  batchMs: 30_000,
  synthesisMs: 20_000,
  downloadMs: 10_000,
};
/** Todo, reintentos incluidos, cabe aquí; la función tiene 60 s. */
export const PIPELINE_BUDGET_MS = 55_000;
const MIN_RETRY_MS = 8_000;

/**
 * Sin topes de largo: un texto de más tumbaría la tanda entera (el modelo no
 * los respeta siempre). Se recorta después, en `clampPhotoFacts`.
 */
export const photoFactsSchema = z.object({
  photos: z.array(
    z.object({
      photo: z.number().int().min(0),
      productType: z.string().nullable(),
      readableText: z
        .string()
        .nullish()
        .transform((value) => value ?? ""),
      brandText: z.string().nullable(),
      licence: z.string().nullable(),
      designName: z.string().nullable(),
      colorNames: z
        .array(z.string())
        .nullish()
        .transform((value) => value ?? []),
      showsSingleOption: z
        .boolean()
        .nullish()
        .transform((value) => value ?? false),
      quantity: z.number().nullable(),
      quantityMixed: z.enum(["colores", "diseños"]).nullable(),
      tip: z.string().nullable(),
      measurements: z.string().nullable(),
      material: z.string().nullable(),
      inkBase: z.string().nullish(),
      sheetCount: z.number().nullish(),
    }),
  ),
});

export type PhotoFacts = z.infer<typeof photoFactsSchema>["photos"][number];

const clip = (value: string | null, max: number) =>
  value === null ? null : value.trim().slice(0, max);

function clampPhotoFacts(fact: PhotoFacts): PhotoFacts {
  const quantity =
    fact.quantity !== null &&
    Number.isInteger(fact.quantity) &&
    fact.quantity > 0
      ? fact.quantity
      : null;
  return {
    ...fact,
    productType: clip(fact.productType, 80),
    readableText: fact.readableText.trim().slice(0, 400),
    brandText: clip(fact.brandText, 80),
    licence: clip(fact.licence, 80),
    designName: clip(fact.designName, 80),
    colorNames: fact.colorNames
      .map((color) => color.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 6),
    quantity,
    tip: clip(fact.tip, 80),
    measurements: clip(fact.measurements, 80),
    material: clip(fact.material, 80),
    inkBase: clip(fact.inkBase ?? null, 40),
    sheetCount:
      typeof fact.sheetCount === "number" &&
      Number.isInteger(fact.sheetCount) &&
      fact.sheetCount > 0
        ? fact.sheetCount
        : null,
  };
}

export type AnalysisLists = {
  categories: string[];
  sizes: string[];
  colors: string[];
  designs: string[];
};

type Usage = { inputTokens?: number; outputTokens?: number };

export type AnalysisImage = { data: Uint8Array; mediaType: string };

export type AnalysisGenerate = (request: {
  kind: "facts" | "synthesis" | "category";
  prompt: string;
  imageUrls: string[];
  /** Las fotos ya descargadas, en el orden de `imageUrls`, cuando hay `fetchImage`. */
  images?: AnalysisImage[];
  photoNumbers: number[];
  schema: z.ZodTypeAny;
  abortSignal: AbortSignal;
}) => Promise<{ output: unknown; usage?: Usage }>;

export type AnalysisTiming = {
  kind: "facts" | "synthesis" | "category";
  photos: number[];
  attempt: number;
  ms: number;
  ok: boolean;
};

export type ProductImageAnalysisRun = {
  output: ProductImageAnalysisOutput;
  photosRead: number[];
  skipped: { photo: number; reason: string }[];
  usage: { inputTokens: number; outputTokens: number; calls: number };
  timings: AnalysisTiming[];
};

export function isModelQuotaError(error: unknown) {
  if (error instanceof Error && error.name === "AiBusyError") return true;
  return /quota|resource_exhausted|rate limit|\b429\b/i.test(
    error instanceof Error ? error.message : "",
  );
}

export async function fetchAnalysisImage(
  url: string,
  signal: AbortSignal,
): Promise<AnalysisImage> {
  const response = await fetch(url, {
    headers: { Accept: ANALYSIS_IMAGE_ACCEPT },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const mediaType =
    response.headers.get("content-type")?.split(";")[0]?.trim() || "image/webp";
  return { data: new Uint8Array(await response.arrayBuffer()), mediaType };
}

/** La misma URL que arma el cargador del panel (sin el marcador de desarrollo). */
export function toAnalysisImageUrl(url: string) {
  return getCloudinaryImageUrl(url, ANALYSIS_IMAGE_WIDTH);
}

export function buildPhotoFactsPrompt({
  photoNumbers,
  lists,
}: {
  photoNumbers: number[];
  lists: AnalysisLists;
}) {
  return `Mira cada foto de un producto de papelería de una tienda colombiana y anota solo lo que se ve. Las fotos de esta tanda son las número ${photoNumbers.join(", ")}, en ese orden; devuelve una fila por foto con su número en "photo".

Por foto:
- productType: qué producto es, en pocas palabras en español.
- readableText: el texto que se lee en el empaque o el producto (marca, cantidad, medidas, referencia), tal cual.
- brandText: la marca del fabricante si se lee. Una licencia o personaje (${LICENCE_NAMES.slice(0, 12).join(", ")}…) no es marca: va en licence.
- designName: el diseño o motivo (de esta lista si coincide: ${lists.designs.join(", ") || "sin opciones"}).
- colorNames: los colores del producto en esta foto (de esta lista si coinciden: ${lists.colors.join(", ") || "sin opciones"}).
- showsSingleOption: true si la foto muestra una sola opción comprable (un color o diseño), false si muestra un surtido, un set o varias opciones.
- quantity y quantityMixed: unidades del empaque si se leen o se cuentan con certeza; quantityMixed "colores" o "diseños" si las unidades son distintas entre sí, null si son iguales.
- tip (tipo de punta), inkBase (base de la tinta: agua, alcohol, aceite, gel…), measurements (medidas leídas, con unidad), material, sheetCount (número de hojas impreso en el empaque): solo si se leen o se ven con claridad.
Nunca adivines: si algo no se ve, null.`;
}

export function buildSynthesisPrompt({
  facts,
  lists,
  categoryName,
}: {
  facts: PhotoFacts[];
  lists: AnalysisLists;
  categoryName?: string | null;
}) {
  const categories = lists.categories.join("; ");
  const nouns = lists.categories
    .map((category) => {
      const name = category.replace(/\s*\([^)]*\)\s*$/, "");
      const noun = getCanonicalHeadNoun(name);
      return noun ? `${name} → ${noun.singular}` : null;
    })
    .filter(Boolean)
    .join("; ");

  return `Eres la asistente de catálogo de P de Papel, una papelería kawaii de Colombia. Con lo que se leyó en las fotos (abajo, por número de foto), propone la ficha del producto para que la administradora solo revise. Esto es una propuesta para revisión humana: no hay ningún cambio automático.

Subcategoría elegida por la administradora: ${categoryName || "ninguna"}.
Subcategorías disponibles (categoryName copia uno de estos nombres tal cual, sin el tipo entre paréntesis): ${categories}.
Tamaños: ${lists.sizes.join(", ") || "sin opciones"}. Colores: ${lists.colors.join(", ") || "sin opciones"}. Diseños: ${lists.designs.join(", ") || "sin opciones"}.

NOMBRE: suggestedBaseName y hasta 2 opciones más en suggestedNameOptions, distintas en redacción, de máximo ${PRODUCT_NAME_HARD_MAX_LENGTH} caracteres cada una.
- Sustantivo con que empieza el NOMBRE según la subcategoría (no es la subcategoría): ${nouns}.
- Largo: apunta a 50–60 caracteres agregando solo descriptores que se leyeron en las fotos (material, punta, diseño o licencia, medidas, número de hojas). Si no hay más datos, déjalo corto: nada de relleno ni adjetivos sin respaldo.
- Gramática: [Sustantivo canónico de la subcategoría] [Formato/Material/Descriptor] [Marca de fabricante si se lee] [Diseño o licencia] [Color solo si distingue la unidad] [Medida o cantidad].
- Primera letra en mayúscula y el resto en minúscula, salvo nombres propios, marcas y licencias. Sin barras, emoji, códigos internos ni la palabra Lego (se dice "Bloques de construcción").
- Si el empaque trae varias unidades: "Set de {plural}". Cantidad: "N colores" o "N diseños" cuando las unidades son distintas entre sí; "xN" cuando son iguales. Medidas con espacio: 0.7 mm, 350 ml, A5.
- La marca de fabricante (Gipao, Norma, Scribe, Offi-Esco…) va con su grafía normal, nunca en mayúscula sostenida. Una licencia (${LICENCE_NAMES.join(", ")}) es un diseño, nunca una marca: va en designName y brand queda null.
- Ejemplos del estilo de la tienda:
${PRODUCT_NAME_EXAMPLES.map((example) => `  - ${example}`).join("\n")}

CAMPOS:
- categoryName: el nombre exacto de una subcategoría disponible (nunca el sustantivo del nombre). Si ninguna sirve puede proponer una nueva, breve y reutilizable. categoryIsDeterministic true solo si encaja con claridad.
- brand: solo una marca de fabricante leída. sizeName, colorName y designName: de las listas; uno nuevo solo si ninguno sirve (colorHex obligatorio para un color nuevo). Si es multicolor o surtido, colorName null.
- quantity ({value, mixed}), material, tip, measurements y model (línea o modelo del fabricante): solo lo que se leyó.
- suggestedDescription: HTML con <p>, <ul> y <li> únicamente. 2 a 4 frases cortas en tono cercano y claro; nunca abras con adjetivos de venta (${SALES_ADJECTIVES.slice(0, 8).join(", ")}…) ni inventes usos, beneficios, materiales o medidas que no se leyeron. Si sirve, una lista corta de lo que trae.
- keywords: hasta 8 términos que buscaría una clienta colombiana, con sinónimos regionales (tajalápiz/sacapuntas, lapicero/bolígrafo).
- fieldEvidence: para cada campo que llenes (name, category, brand, color, design, size, quantity, material, tip, measurements, model, description), {confidence: alta|media|baja, photos: números de foto que lo prueban}.
- gtin y mpn: solo si se leen completos (gtin con checksum GS1 válido), con evidence; si no, null.
- variantRecommendation y variantCandidates: solo si varias fotos muestran cada una una opción comprable distinta (showsSingleOption) de color, diseño o tamaño. Una fila por foto con imageIndex = número de foto. Un set multicolor o un empaque no son variantes.
- catalogAttributes: otras características útiles para filtrar (Formato=A5, Capacidad=500 ml…), con evidence. observations y limitations: cortas.
- Nunca sugieras SKU, precios, costos, stock, proveedor ni descuentos.

LO QUE SE LEYÓ EN LAS FOTOS:
${JSON.stringify(facts, null, 1)}`;
}

export const NO_LISTED_CATEGORY = "Ninguna de la lista";
const MIN_CATEGORY_MS = 3_000;
const CATEGORY_VOTES = 3;

const stripCategoryType = (category: string) =>
  category.replace(/\s*\([^)]*\)\s*$/, "");

export function buildCategoryPrompt({
  facts,
  name,
  lists,
  categoryName,
}: {
  facts: PhotoFacts[];
  name: string | null;
  lists: AnalysisLists;
  categoryName?: string | null;
}) {
  const seen = (values: (string | null)[]) =>
    Array.from(new Set(values.filter(Boolean))).join(" | ") || "—";
  return `Elige la subcategoría de la tienda para este producto de papelería. Responde con un nombre de la lista copiado tal cual, o "${NO_LISTED_CATEGORY}" si ninguna le sirve.
Elige por lo que el producto ES (planeador, libreta, marcador, carpeta…), no por su tema, licencia o decoración.

Subcategoría elegida por la administradora: ${categoryName || "ninguna"}.
Nombre propuesto: ${name || "—"}.
Qué producto es, según cada foto: ${seen(facts.map((fact) => fact.productType))}.
Texto leído en el empaque: ${seen(facts.map((fact) => fact.readableText.slice(0, 160)))}.

Subcategorías (el tipo entre paréntesis es solo ayuda): ${lists.categories.join("; ")}.`;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

type PackQuantity = { value: number; mixed: "colores" | "diseños" | null };

const PACK_COUNT =
  /\s*(?:\bx\s?\d+(?:\s+(?:colores|diseños|unidades|piezas|uds?)\b\.?)?\b|\b\d+\s+(?:colores|diseños|unidades|piezas|uds?)\b\.?)/gi;
const UNIT_COUNT = /\b(\d+)\s+(materias?|hojas?)\b/gi;

function packFromText(text: string | null | undefined): PackQuantity | null {
  const value = text ?? "";
  const mixed = value.match(/(\d+)\s*(colores|diseños)/i);
  if (mixed)
    return {
      value: Number(mixed[1]),
      mixed: mixed[2].toLowerCase() as "colores" | "diseños",
    };
  const same =
    value.match(/\bx\s?(\d+)\b/i) ??
    value.match(/(\d+)\s*(?:unidades|piezas)\b/i);
  return same ? { value: Number(same[1]), mixed: null } : null;
}

function packFromFacts(facts: PhotoFacts[]): PackQuantity | null {
  const values = Array.from(
    new Set(
      facts
        .map((fact) => fact.quantity)
        .filter((value): value is number => value !== null),
    ),
  );
  if (values.length !== 1) return null;
  return {
    value: values[0],
    mixed: facts.find((fact) => fact.quantityMixed)?.quantityMixed ?? null,
  };
}

/** Cantidad del empaque con respaldo: el nombre actual del producto o lo que todas las fotos coinciden en leer. */
export function resolvePackQuantity(evidence: {
  facts: PhotoFacts[];
  currentName?: string | null;
}) {
  return packFromText(evidence.currentName) ?? packFromFacts(evidence.facts);
}

/**
 * Las cantidades del nombre salen de la evidencia, nunca del modelo: la del
 * empaque se rehace con «N colores» o «xN», y «N materias» u «N hojas» solo
 * quedan si se leyeron. Sin respaldo, la cantidad se quita.
 */
export function reconcileNameCounts(
  name: string,
  evidence: { facts: PhotoFacts[]; currentName?: string | null },
) {
  const units = new Map<string, number>();
  for (const text of [
    evidence.currentName ?? "",
    ...evidence.facts.map((fact) => fact.readableText),
  ]) {
    for (const match of Array.from(text.matchAll(UNIT_COUNT))) {
      const root = match[2].toLowerCase().replace(/s$/, "");
      if (!units.has(root)) units.set(root, Number(match[1]));
    }
  }
  const withUnits = name.replace(
    UNIT_COUNT,
    (_token, _count: string, unit: string) => {
      const root = unit.toLowerCase().replace(/s$/, "");
      const known = units.get(root);
      if (known === undefined) return "";
      return `${known} ${known === 1 ? root : `${root}s`}`;
    },
  );
  const base = withUnits.replace(PACK_COUNT, "").replace(/\s+/g, " ").trim();
  const pack = resolvePackQuantity(evidence);
  const token = pack ? formatProductQuantity(pack.value, pack.mixed) : null;
  return fitProductName(token ? `${base} ${token}` : base);
}

const TARGET_MIN_LENGTH = 50;
const NOUN_FORMS = Object.values(CANONICAL_HEAD_NOUNS)
  .flatMap((noun) => [noun.singular, noun.plural])
  .sort((a, b) => b.split(" ").length - a.split(" ").length);

const spaceUnits = (value: string) =>
  value.replace(
    /(\d)\s*(mm|cm|ml|m|g|kg)\b/gi,
    (_match, digit: string, unit: string) => `${digit} ${unit.toLowerCase()}`,
  );

const wordForms = (word: string) => [
  word,
  ...(word.endsWith("s") ? [word.slice(0, -1)] : []),
  ...(word.endsWith("es") ? [word.slice(0, -2)] : []),
];

/** Lo que más fotos coinciden en leer para un campo; «14cm» y «14 cm aprox.» votan juntas. */
function consensus(values: (string | null)[]) {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    const value = raw
      ?.replace(/\b(aprox(imadamente)?|aprox\.)\.?/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!value) continue;
    const key = toNamingKey(spaceUnits(value));
    const entry = counts.get(key) ?? { value: value.trim(), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return (
    Array.from(counts.values()).sort((a, b) => b.count - a.count)[0]?.value ??
    null
  );
}

const lowerFirst = (value: string) =>
  /^[A-ZÁÉÍÓÚÑ]{2}/.test(value)
    ? value
    : value.charAt(0).toLocaleLowerCase("es-CO") + value.slice(1);
const isAcronym = (value: string | null) =>
  Boolean(value && /^[A-ZÁÉÍÓÚÑ]{2,5}$/.test(value.trim()));
/** Subcategorías donde «punta» describe el producto. */
const TIP_CATEGORY_KEYS = new Set([
  "boligrafos lapiceros",
  "marcadores",
  "plumones",
  "plumigrafos",
  "micropuntas",
  "resaltadores",
  "rapidografos",
  "lapices",
  "colores",
  "crayones",
  "portaminas",
  "correctores",
]);

/**
 * Un nombre de menos de 50 caracteres se completa solo con lo que las fotos
 * leyeron, en el orden de la gramática: material y punta tras el sustantivo,
 * diseño y medida antes de la cantidad. Sin hechos, queda corto.
 */
export function enrichShortName(
  name: string,
  evidence: { facts: PhotoFacts[]; designName: string | null },
) {
  if (name.length >= TARGET_MIN_LENGTH) return name;
  const words = name.split(" ");
  const offset = /^set de /i.test(name) ? 2 : 0;
  const noun = NOUN_FORMS.find(
    (form) =>
      toNamingKey(
        words.slice(offset, offset + form.split(" ").length).join(" "),
      ) === toNamingKey(form),
  );
  const headEnd = offset + (noun ? noun.split(" ").length : 1);
  const quantity = name.match(/\s(x\d+|\d+\s+(?:colores|diseños))$/i);
  const tailStart = quantity
    ? words.length - quantity[1].split(" ").length
    : words.length;

  const readMaterial = consensus(evidence.facts.map((fact) => fact.material));
  const material = isAcronym(readMaterial) ? null : readMaterial;
  const tip = TIP_CATEGORY_KEYS.has(getHeadNounCategoryKey(name) ?? "")
    ? consensus(evidence.facts.map((fact) => fact.tip))
    : null;
  const measure = consensus(evidence.facts.map((fact) => fact.measurements));
  const inkBase = TIP_CATEGORY_KEYS.has(getHeadNounCategoryKey(name) ?? "")
    ? consensus(evidence.facts.map((fact) => fact.inkBase ?? null))
    : null;
  const sheets = consensus(
    evidence.facts.map((fact) =>
      fact.sheetCount ? String(fact.sheetCount) : null,
    ),
  );
  // Sin sustantivo reconocido no se sabe dónde termina la frase del nombre.
  const head = noun
    ? [
        material
          ? /^de /i.test(material)
            ? lowerFirst(material)
            : `de ${lowerFirst(material)}`
          : null,
        tip
          ? spaceUnits(
              /^punta /i.test(tip)
                ? lowerFirst(tip)
                : `punta ${lowerFirst(tip)}`,
            )
          : null,
        inkBase
          ? /^base /i.test(inkBase)
            ? lowerFirst(inkBase)
            : `base ${lowerFirst(inkBase)}`
          : null,
      ]
    : [];
  const tail = [
    evidence.designName && !/diseños$/i.test(quantity?.[1] ?? "")
      ? `diseño ${evidence.designName}`
      : null,
    measure ? spaceUnits(measure) : null,
    sheets && !/\bhojas?\b/i.test(name) ? `${sheets} hojas` : null,
  ];

  let current = words;
  let before = headEnd;
  while (
    before < tailStart &&
    /^[a-záéíóúñ]/.test(current[before]) &&
    !/^(diseño|punta|color|tamaño|modelo)$/i.test(current[before])
  )
    before += 1;
  let after = tailStart;
  // Ya está si cada palabra aparece, en singular o en plural (viaje/Viajes, flor/Flores).
  const has = (text: string) => {
    const words = toNamingKey(text.replace(/^(de|punta|diseño|base) /i, ""))
      .split(" ")
      .filter(Boolean);
    const present = new Set(
      toNamingKey(current.join(" ")).split(" ").flatMap(wordForms),
    );
    return words.every((word) =>
      wordForms(word).some((form) => present.has(form)),
    );
  };
  const tryInsert = (text: string | null, at: "head" | "tail") => {
    if (!text || current.join(" ").length >= TARGET_MIN_LENGTH || has(text))
      return;
    const parts = text.split(" ");
    const index = at === "head" ? before : after;
    const next = [
      ...current.slice(0, index),
      ...parts,
      ...current.slice(index),
    ];
    if (next.join(" ").length > PRODUCT_NAME_HARD_MAX_LENGTH) return;
    current = next;
    if (at === "head") before += parts.length;
    after += parts.length;
  };
  for (const text of head) tryInsert(text, "head");
  for (const text of tail) tryInsert(text, "tail");
  return current.join(" ");
}

export async function analyzeProductImages({
  imageUrls,
  lists,
  categoryName,
  generate,
  fetchImage,
  timeouts: timeoutOverrides,
  budgetMs = PIPELINE_BUDGET_MS,
  currentName,
}: {
  imageUrls: string[];
  /** Nombre que ya tiene el producto: evidencia de la cantidad, nunca se copia tal cual. */
  currentName?: string | null;
  lists: AnalysisLists;
  categoryName?: string | null;
  generate: AnalysisGenerate;
  fetchImage?: (url: string, signal: AbortSignal) => Promise<AnalysisImage>;
  timeouts?: Partial<typeof PIPELINE_TIMEOUTS>;
  budgetMs?: number;
}): Promise<ProductImageAnalysisRun> {
  const timeouts = { ...PIPELINE_TIMEOUTS, ...timeoutOverrides };
  const startedAt = Date.now();
  const remaining = () => budgetMs - (Date.now() - startedAt);
  const timings: AnalysisTiming[] = [];
  const requested = imageUrls
    .slice(0, MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES)
    .map((url, index) => ({ index, url: toAnalysisImageUrl(url) }));
  const downloads = await Promise.all(
    requested.map(async (photo) => {
      if (!fetchImage)
        return {
          ...photo,
          image: undefined as AnalysisImage | undefined,
          ok: true,
        };
      try {
        return {
          ...photo,
          image: await fetchImage(
            photo.url,
            AbortSignal.timeout(timeouts.downloadMs),
          ),
          ok: true,
        };
      } catch {
        return { ...photo, image: undefined, ok: false };
      }
    }),
  );
  const notDownloaded = downloads
    .filter((photo) => !photo.ok)
    .map((photo) => ({ photo: photo.index, reason: "No se pudo descargar" }));
  const photos = downloads.filter((photo) => photo.ok);
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const addUsage = (value?: Usage) => {
    usage.calls += 1;
    usage.inputTokens += value?.inputTokens ?? 0;
    usage.outputTokens += value?.outputTokens ?? 0;
  };

  const readBatch = async (
    batch: typeof photos,
    attempt: number,
    timeoutMs: number,
  ) => {
    const photoNumbers = batch.map((photo) => photo.index);
    const t0 = Date.now();
    try {
      const result = await generate({
        kind: "facts",
        prompt: buildPhotoFactsPrompt({ photoNumbers, lists }),
        imageUrls: batch.map((photo) => photo.url),
        ...(fetchImage
          ? { images: batch.map((photo) => photo.image as AnalysisImage) }
          : {}),
        photoNumbers,
        schema: photoFactsSchema,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });
      addUsage(result.usage);
      const parsed = photoFactsSchema.safeParse(result.output);
      const facts = parsed.success
        ? parsed.data.photos
            .filter((fact) => photoNumbers.includes(fact.photo))
            .map(clampPhotoFacts)
        : [];
      timings.push({
        kind: "facts",
        photos: photoNumbers,
        attempt,
        ms: Date.now() - t0,
        ok: parsed.success,
      });
      return {
        photoNumbers,
        facts,
        ok: parsed.success,
        error: null as unknown,
      };
    } catch (error) {
      timings.push({
        kind: "facts",
        photos: photoNumbers,
        attempt,
        ms: Date.now() - t0,
        ok: false,
      });
      return { photoNumbers, facts: [] as PhotoFacts[], ok: false, error };
    }
  };

  const batches = await Promise.all(
    chunk(photos, PHOTO_BATCH_SIZE).map(async (batch) => {
      const first = await readBatch(batch, 1, timeouts.batchMs);
      if (first.ok || isModelQuotaError(first.error)) return first;
      // Un solo reintento, y solo si después queda tiempo para la pasada final.
      const retryMs = Math.min(
        timeouts.batchMs,
        remaining() - timeouts.synthesisMs - 2_000,
      );
      return retryMs >= MIN_RETRY_MS ? readBatch(batch, 2, retryMs) : first;
    }),
  );

  const facts = batches.flatMap((batch) => batch.facts);
  const photosRead = batches
    .filter((batch) => batch.ok)
    .flatMap((batch) => batch.photoNumbers);
  const skipped = [
    ...notDownloaded,
    ...batches
      .filter((batch) => !batch.ok)
      .flatMap((batch) =>
        batch.photoNumbers.map((photo) => ({
          photo,
          reason: "No se pudo leer",
        })),
      ),
  ].sort((a, b) => a.photo - b.photo);
  if (photosRead.length === 0) {
    const quotaError = batches.find((batch) =>
      isModelQuotaError(batch.error),
    )?.error;
    if (quotaError) throw quotaError;
    throw new AppError(
      "No se pudo leer ninguna foto. Revisa que las fotos carguen bien e intenta de nuevo.",
      422,
    );
  }

  const selectCategory = async (
    name: string | null,
    fallback: { categoryName: string | null; categoryIsDeterministic: boolean },
  ) => {
    const names = Array.from(new Set(lists.categories.map(stripCategoryType)));
    if (names.length === 0 || remaining() < MIN_CATEGORY_MS) return fallback;
    const schema = z.object({
      categoryName: z.enum([NO_LISTED_CATEGORY, ...names] as [
        string,
        ...string[],
      ]),
    });
    const prompt = buildCategoryPrompt({ facts, name, lists, categoryName });
    const timeoutMs = Math.min(timeouts.categoryMs, remaining());
    const ask = async () => {
      const t0 = Date.now();
      try {
        const result = await generate({
          kind: "category",
          prompt,
          imageUrls: [],
          photoNumbers: photosRead,
          schema,
          abortSignal: AbortSignal.timeout(timeoutMs),
        });
        addUsage(result.usage);
        const chosen = schema.parse(result.output).categoryName;
        timings.push({
          kind: "category",
          photos: photosRead,
          attempt: 1,
          ms: Date.now() - t0,
          ok: true,
        });
        return chosen;
      } catch {
        timings.push({
          kind: "category",
          photos: photosRead,
          attempt: 1,
          ms: Date.now() - t0,
          ok: false,
        });
        return null;
      }
    };
    // Tres respuestas en paralelo y gana la mayoría: una sola cambia de una corrida a otra.
    const answers = (
      await Promise.all(Array.from({ length: CATEGORY_VOTES }, ask))
    ).filter((answer): answer is string => answer !== null);
    if (answers.length === 0) return fallback;
    const counts = new Map<string, number>();
    for (const answer of answers)
      counts.set(answer, (counts.get(answer) ?? 0) + 1);
    const [top, topVotes] = Array.from(counts.entries()).sort(
      (x, y) => y[1] - x[1],
    )[0];
    const byKey = (key: string | null) =>
      key ? names.find((option) => toNamingKey(option) === key) : undefined;
    const chosen =
      topVotes >= 2 || answers.length === 1
        ? top
        : (byKey(getHeadNounCategoryKey(name)) ??
          byKey(categoryName ? toNamingKey(categoryName) : null) ??
          NO_LISTED_CATEGORY);
    return chosen === NO_LISTED_CATEGORY
      ? fallback
      : { categoryName: chosen, categoryIsDeterministic: true };
  };

  const prompt = buildSynthesisPrompt({ facts, lists, categoryName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && remaining() < timeouts.synthesisMs) break;
    const t0 = Date.now();
    try {
      const result = await generate({
        kind: "synthesis",
        prompt,
        imageUrls: [],
        photoNumbers: photosRead,
        schema: productImageAnalysisOutputSchema,
        abortSignal: AbortSignal.timeout(
          Math.max(1, Math.min(timeouts.synthesisMs, remaining())),
        ),
      });
      addUsage(result.usage);
      const synthesized = productImageAnalysisOutputSchema.parse(result.output);
      timings.push({
        kind: "synthesis",
        photos: photosRead,
        attempt: attempt + 1,
        ms: Date.now() - t0,
        ok: true,
      });
      const parsed = {
        ...synthesized,
        ...(await selectCategory(synthesized.suggestedBaseName, {
          categoryName: synthesized.categoryName,
          categoryIsDeterministic: synthesized.categoryIsDeterministic,
        })),
      };
      const evidence = { facts, currentName };
      const pack = resolvePackQuantity(evidence);
      const design = parsed.designIsDeterministic ? parsed.designName : null;
      const finalName = (name: string) =>
        enrichShortName(reconcileNameCounts(name, evidence), {
          facts,
          designName: design,
        });
      const output = {
        ...parsed,
        suggestedBaseName: parsed.suggestedBaseName
          ? finalName(parsed.suggestedBaseName)
          : parsed.suggestedBaseName,
        suggestedNameOptions: parsed.suggestedNameOptions.map(finalName),
        quantity: pack && pack.value >= 2 ? pack : null,
      };
      return { output, photosRead, skipped, usage, timings };
    } catch (error) {
      timings.push({
        kind: "synthesis",
        photos: photosRead,
        attempt: attempt + 1,
        ms: Date.now() - t0,
        ok: false,
      });
      lastError = error;
      if (isModelQuotaError(error)) break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No fue posible crear la propuesta");
}

/**
 * El análisis numera las fotos que pudo mandar al modelo; la pantalla las
 * numera en el orden en que la administradora las ve, rotas incluidas.
 */
export function remapAnalysisPhotos(
  run: Omit<ProductImageAnalysisRun, "usage" | "timings">,
  submittedIndexes: number[],
): Omit<ProductImageAnalysisRun, "usage" | "timings"> {
  const toSubmitted = (photo: number) => submittedIndexes[photo];
  const isKnown = (photo: number | undefined): photo is number =>
    photo !== undefined;
  const fieldEvidence = Object.fromEntries(
    Object.entries(run.output.fieldEvidence ?? {}).map(([field, value]) => [
      field,
      value && {
        ...value,
        photos: value.photos.map(toSubmitted).filter(isKnown),
      },
    ]),
  );
  return {
    output: {
      ...run.output,
      fieldEvidence,
      variantCandidates: (run.output.variantCandidates ?? []).flatMap(
        (candidate) => {
          const imageIndex = toSubmitted(candidate.imageIndex);
          return imageIndex === undefined ? [] : [{ ...candidate, imageIndex }];
        },
      ),
    },
    photosRead: run.photosRead.map(toSubmitted).filter(isKnown),
    skipped: run.skipped.flatMap((entry) => {
      const photo = toSubmitted(entry.photo);
      return photo === undefined ? [] : [{ ...entry, photo }];
    }),
  };
}
