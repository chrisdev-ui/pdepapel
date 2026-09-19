import {
  DEFAULT_LABEL_SHEET,
  DEFAULT_SHEET_OPTIONS,
  type LabelSheetOptions,
  type LabelSheetTemplateId,
} from "@/lib/label-printing";

/** Un producto en la hoja, con lo que hace falta para pintar su etiqueta. */
export interface LabelDraftProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  variant: string | null;
  imageUrl: string | null;
  productGroupId: string | null;
  /** Solo cuando se agregó como parte de un grupo: es lo que imprime «Nombre del grupo». */
  groupName: string | null;
}

export interface LabelDraftBatch {
  product: LabelDraftProduct;
  copies: number;
}

export interface LabelContentSettings {
  showVariant: boolean;
  showSku: boolean;
  showPrice: boolean;
  showGroupName: boolean;
}

export interface LabelSheetDraft {
  batches: LabelDraftBatch[];
  templateId: LabelSheetTemplateId;
  startAt: number;
  sheet: LabelSheetOptions;
  content: LabelContentSettings;
}

export const MAX_COPIES_PER_PRODUCT = 100;

export const EMPTY_LABEL_DRAFT: LabelSheetDraft = {
  batches: [],
  templateId: DEFAULT_LABEL_SHEET,
  startAt: 1,
  sheet: DEFAULT_SHEET_OPTIONS,
  content: { showVariant: true, showSku: true, showPrice: false, showGroupName: false },
};

export function labelDraftStorageKey(storeId: string) {
  return `pdepapel:etiquetas:hoja:${storeId}`;
}

export { describeVariant } from "@/lib/product-variant";

const clampCopies = (copies: number) =>
  Math.min(Math.max(Math.round(Number(copies) || 0), 1), MAX_COPIES_PER_PRODUCT);

/** Suma copias a un producto que ya está o lo agrega al final. */
export function addToDraft(draft: LabelSheetDraft, product: LabelDraftProduct, copies: number): LabelSheetDraft {
  const wanted = clampCopies(copies);
  const existing = draft.batches.find((batch) => batch.product.id === product.id);
  const batches = existing
    ? draft.batches.map((batch) =>
        batch.product.id === product.id ? { ...batch, product, copies: clampCopies(batch.copies + wanted) } : batch,
      )
    : [...draft.batches, { product, copies: wanted }];
  return { ...draft, batches };
}

export function setDraftCopies(draft: LabelSheetDraft, productId: string, copies: number): LabelSheetDraft {
  if (copies <= 0) return removeFromDraft(draft, productId);
  return {
    ...draft,
    batches: draft.batches.map((batch) =>
      batch.product.id === productId ? { ...batch, copies: clampCopies(copies) } : batch,
    ),
  };
}

export function removeFromDraft(draft: LabelSheetDraft, productId: string): LabelSheetDraft {
  return { ...draft, batches: draft.batches.filter((batch) => batch.product.id !== productId) };
}

export function draftLabelCount(draft: LabelSheetDraft) {
  return draft.batches.reduce((total, batch) => total + batch.copies, 0);
}

/** Lo que se guarda en el navegador puede venir viejo o roto: se sanea al leer. */
export function parseLabelDraft(raw: string | null): LabelSheetDraft {
  if (!raw) return EMPTY_LABEL_DRAFT;
  try {
    const parsed = JSON.parse(raw) as Partial<LabelSheetDraft>;
    const batches = Array.isArray(parsed.batches)
      ? parsed.batches
          .filter((batch): batch is LabelDraftBatch => Boolean(batch?.product?.id && batch.product.name && batch.product.sku))
          .map((batch) => ({
            product: {
              id: String(batch.product.id),
              name: String(batch.product.name),
              sku: String(batch.product.sku),
              price: typeof batch.product.price === "number" ? batch.product.price : null,
              variant: batch.product.variant ? String(batch.product.variant) : null,
              imageUrl: batch.product.imageUrl ? String(batch.product.imageUrl) : null,
              productGroupId: batch.product.productGroupId ? String(batch.product.productGroupId) : null,
              groupName: batch.product.groupName ? String(batch.product.groupName) : null,
            },
            copies: clampCopies(batch.copies),
          }))
      : [];
    return {
      batches,
      templateId: DEFAULT_LABEL_SHEET,
      startAt: Math.max(1, Math.round(Number(parsed.startAt) || 1)),
      sheet: { ...DEFAULT_SHEET_OPTIONS, ...(parsed.sheet ?? {}) },
      content: { ...EMPTY_LABEL_DRAFT.content, ...(parsed.content ?? {}) },
    };
  } catch {
    return EMPTY_LABEL_DRAFT;
  }
}

export function serializeLabelDraft(draft: LabelSheetDraft) {
  return JSON.stringify(draft);
}
