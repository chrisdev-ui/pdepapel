/**
 * Clasificación de los fallos al publicar en Mercado Libre.
 *
 * `kind` decide qué hace el sistema: `review` devuelve el borrador a la
 * persona (algo de la ficha está mal), `transient` reintenta solo (Mercado
 * Libre no respondió bien), `reauth` pide reconectar la cuenta, `unknown` se
 * trata como transitorio con tope. `step`/`field` dicen a qué paso del
 * asistente volver y qué campo tocar, para que el error no sea un callejón.
 */
export type PublicationFailureKind = "review" | "transient" | "reauth" | "unknown";

/** Pasos del asistente de publicación (1 Producto, 2 Categoría y fotos, 3 Ficha técnica, 4 Precio y envío). */
export type PublicationWizardStep = "producto" | "categoria" | "ficha" | "precio";

export type PublicationFailure = {
  kind: PublicationFailureKind;
  step: PublicationWizardStep | null;
  /** Id del campo: un atributo de Mercado Libre (BRAND), o un campo del formulario (marketplacePrice). */
  field: string | null;
  message: string;
  /** Código de causa de Mercado Libre, cuando lo hay. */
  code: string | null;
};

type Cause = { code: string | null; message: string | null; references: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCauses(payload: unknown): Cause[] {
  if (!isRecord(payload) || !Array.isArray(payload.cause)) return [];
  return payload.cause.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    return [
      {
        code: typeof raw.code === "string" ? raw.code : null,
        message: typeof raw.message === "string" ? raw.message : null,
        references: Array.isArray(raw.references)
          ? raw.references.filter((value): value is string => typeof value === "string")
          : [],
      },
    ];
  });
}

function getTopMessage(payload: unknown) {
  if (!isRecord(payload)) return null;
  const message = payload.message ?? payload.error;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

/** «item.attributes.BRAND» → BRAND; «attribute BRAND is required» → BRAND. */
function extractAttributeId(cause: Cause) {
  for (const reference of cause.references) {
    const match = /attributes\.([A-Z0-9_]+)/i.exec(reference);
    if (match) return match[1].toUpperCase();
  }
  const text = `${cause.code ?? ""} ${cause.message ?? ""}`;
  const match =
    /attributes?\s*[:"'«]?\s*\[?([A-Z][A-Z0-9_]{2,})/.exec(text) ??
    /\[([A-Z][A-Z0-9_]{2,})\]/.exec(text);
  return match ? match[1].toUpperCase() : null;
}

function mapCause(cause: Cause): Omit<PublicationFailure, "kind"> | null {
  const code = (cause.code ?? "").toLowerCase();
  const text = `${code} ${cause.message ?? ""} ${cause.references.join(" ")}`.toLowerCase();

  // Orden deliberado: «attribute» antes que «category», porque muchos mensajes
  // de atributos nombran la categoría («…required for category MCO…»).
  if (code.startsWith("item.attributes") || /\battributes?\b/.test(text)) {
    const field = extractAttributeId(cause);
    const invalid = code.includes("invalid") || /invalid|not allowed|no válido/.test(text);
    return {
      step: "ficha",
      field,
      code: cause.code,
      message: field
        ? invalid
          ? `Mercado Libre no acepta el valor del campo «${field}» de la ficha técnica. Elige una opción de la lista o corrige el valor.`
          : `Mercado Libre exige el campo «${field}» en la ficha técnica. Complétalo y vuelve a publicar.`
        : "Mercado Libre necesita datos de la ficha técnica. Vuelve a ese paso, actualiza los campos y completa los obligatorios.",
    };
  }
  if (code.startsWith("item.sale_terms") || text.includes("sale_terms") || text.includes("warranty")) {
    const field = extractAttributeId(cause) ?? "WARRANTY_TYPE";
    return {
      step: "precio",
      field,
      code: cause.code,
      message: `Mercado Libre exige las condiciones de venta «${field}» (garantía) para esta categoría. Complétalas en «Precio y envío».`,
    };
  }
  if (code.startsWith("item.family_name") || text.includes("family_name")) {
    return {
      step: "producto",
      field: "familyName",
      code: cause.code,
      message:
        "Mercado Libre necesita el nombre de familia. Vuelve a «Producto», escribe un nombre genérico que agrupe sus variantes y vuelve a publicar.",
    };
  }
  if (code.startsWith("item.title") || /\btitle\b/.test(text)) {
    return {
      step: "producto",
      field: "familyName",
      code: cause.code,
      message:
        "Mercado Libre rechazó el nombre de familia. Revisa que describa el producto y cumpla el máximo de caracteres de su categoría.",
    };
  }
  if (code.startsWith("item.category") || /\bcategory\b/.test(text)) {
    return {
      step: "categoria",
      field: "categoryId",
      code: cause.code,
      message:
        "Mercado Libre rechazó la categoría seleccionada. Vuelve a «Categoría y fotos», usa «Sugerir categoría» y elige una categoría final.",
    };
  }
  if (code.startsWith("item.pictures") || /\bpictures?\b|\bimages?\b/.test(text)) {
    const index = /pictures\.(\d+)|picture\s+#?(\d+)/i.exec(text);
    const position = index ? Number(index[1] ?? index[2]) + 1 : null;
    return {
      step: "categoria",
      field: "imageUrls",
      code: cause.code,
      message: position
        ? `Mercado Libre rechazó la foto ${position}. Quítala o reemplázala en «Categoría y fotos» y vuelve a intentar.`
        : "Mercado Libre rechazó una foto. Revisa las imágenes seleccionadas en «Categoría y fotos» y vuelve a intentar.",
    };
  }
  if (code.startsWith("item.price") || /\bprice\b/.test(text)) {
    return {
      step: "precio",
      field: "marketplacePrice",
      code: cause.code,
      message:
        "Mercado Libre rechazó el precio. Revisa el precio exclusivo de Mercado Libre (mínimos y máximos de la categoría) y vuelve a intentar.",
    };
  }
  if (code.startsWith("item.listing_type") || text.includes("listing_type")) {
    return {
      step: "precio",
      field: "listingType",
      code: cause.code,
      message:
        "El tipo de publicación no está disponible para esta cuenta o categoría. Elige otro en «Precio y envío» o revisa la configuración de Mercado Libre.",
    };
  }
  if (code.startsWith("item.available_quantity") || text.includes("available_quantity")) {
    return {
      step: "producto",
      field: "stockSafetyBuffer",
      code: cause.code,
      message:
        "Mercado Libre rechazó la cantidad disponible. Revisa el stock y el stock de seguridad en «Producto».",
    };
  }
  if (code.startsWith("item.condition") || text.includes("condition")) {
    return {
      step: "categoria",
      field: "categoryId",
      code: cause.code,
      message:
        "Esta categoría no admite productos nuevos con esta configuración. Elige otra categoría en «Categoría y fotos».",
    };
  }
  return null;
}

/**
 * Convierte la respuesta de `POST /items` (o de cualquier escritura de ítem)
 * en un fallo clasificado. 5xx/429/408 son transitorios; 401/403 piden
 * reconectar; 400/422 se leen causa por causa; lo demás es desconocido.
 */
export function mapMercadoLibreItemError(status: number, payload: unknown): PublicationFailure {
  const top = getTopMessage(payload);
  if (status === 401 || status === 403) {
    return {
      kind: "reauth",
      step: null,
      field: null,
      code: null,
      message: "Mercado Libre no autorizó la publicación. Reconecta la cuenta y vuelve a intentarlo.",
    };
  }
  if (status >= 500 || status === 429 || status === 408) {
    return {
      kind: "transient",
      step: null,
      field: null,
      code: null,
      message: `Mercado Libre no respondió correctamente (${status}). Se reintentará automáticamente.`,
    };
  }
  const causes = getCauses(payload);
  for (const cause of causes) {
    const mapped = mapCause(cause);
    if (mapped) return { kind: "review", ...mapped };
  }
  // Sin causas estructuradas: se intenta con el mensaje principal.
  const fallback = top
    ? mapCause({ code: null, message: top, references: [] })
    : null;
  if (fallback) return { kind: "review", ...fallback };
  const raw = [top, ...causes.map((cause) => [cause.code, cause.message].filter(Boolean).join(" "))]
    .filter(Boolean)
    .join(": ")
    .slice(0, 1_000);
  return {
    kind: status >= 400 && status < 500 ? "review" : "unknown",
    step: null,
    field: null,
    code: causes[0]?.code ?? null,
    message: raw || "Mercado Libre rechazó la publicación",
  };
}

/** Un fallo de red (fetch lanzó) o de nuestro lado antes de llegar a Mercado Libre. */
export function transientPublicationFailure(message: string): PublicationFailure {
  return { kind: "transient", step: null, field: null, code: null, message };
}
