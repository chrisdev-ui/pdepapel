import { CatalogMigrationSource, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  buildShippingProfileSuggestion,
  getCatalogMigrationFingerprint,
  inferCatalogAttributes,
  normalizeCatalogOptionKey,
  splitTaxonomyIcon,
} from "@/lib/catalog-options";
import prismadb from "@/lib/prismadb";

export const catalogMigrationAttributeSchema = z.object({
  key: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  value: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1).max(180),
});

export const catalogMigrationPayloadSchema = z.object({
  shippingProfile: z.object({
    code: z.string().min(1).max(191),
    name: z.string().min(1).max(191),
    dimensionCode: z.string().max(16).nullable(),
    weightCode: z.string().max(16).nullable(),
  }),
  category: z
    .object({
      id: z.string().uuid(),
      currentName: z.string(),
      canonicalName: z.string().min(1),
      icon: z.string().max(32).nullable(),
    })
    .nullable(),
  type: z
    .object({
      id: z.string().uuid(),
      currentName: z.string(),
      canonicalName: z.string().min(1),
      icon: z.string().max(32).nullable(),
    })
    .nullable(),
  attributes: z.array(catalogMigrationAttributeSchema).max(8),
});

export type CatalogMigrationPayload = z.infer<
  typeof catalogMigrationPayloadSchema
>;

export const visualCatalogAttributesSchema = z
  .array(
    z.object({
      key: z.string().min(1).max(60),
      name: z.string().min(1).max(80),
      value: z.string().min(1).max(100),
      evidence: z.string().min(1).max(180),
    }),
  )
  .max(8)
  .superRefine((attributes, context) => {
    const seenKeys = new Set<string>();

    attributes.forEach((attribute, index) => {
      const key = normalizeCatalogOptionKey(attribute.key || attribute.name);
      if (!key || !seenKeys.has(key)) {
        if (key) seenKeys.add(key);
        return;
      }

      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "name"],
        message: "La característica está repetida",
      });
    });
  });

export type EditableCatalogAttribute = z.infer<
  typeof visualCatalogAttributesSchema
>[number];

export async function syncProductCatalogAttributes(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    productId: string;
    categoryId: string;
    attributes: EditableCatalogAttribute[];
  },
) {
  const parsedAttributes = visualCatalogAttributesSchema.parse(
    input.attributes,
  );
  const retainedOptionIds: string[] = [];

  for (const attribute of parsedAttributes) {
    const key = normalizeCatalogOptionKey(attribute.key || attribute.name);
    const valueKey = normalizeCatalogOptionKey(attribute.value);
    if (!key || !valueKey) continue;

    const option = await tx.catalogOption.upsert({
      where: { storeId_key: { storeId: input.storeId, key } },
      create: {
        storeId: input.storeId,
        key,
        name: attribute.name,
      },
      update: { name: attribute.name, isActive: true },
    });
    const optionValue = await tx.catalogOptionValue.upsert({
      where: { optionId_value: { optionId: option.id, value: valueKey } },
      create: {
        storeId: input.storeId,
        optionId: option.id,
        name: attribute.value,
        value: valueKey,
      },
      update: { name: attribute.value },
    });

    retainedOptionIds.push(option.id);
    await tx.categoryCatalogOption.upsert({
      where: {
        categoryId_optionId: {
          categoryId: input.categoryId,
          optionId: option.id,
        },
      },
      create: {
        storeId: input.storeId,
        categoryId: input.categoryId,
        optionId: option.id,
      },
      update: {},
    });
    await tx.productCatalogOptionValue.upsert({
      where: {
        productId_optionId: {
          productId: input.productId,
          optionId: option.id,
        },
      },
      create: {
        storeId: input.storeId,
        productId: input.productId,
        optionId: option.id,
        optionValueId: optionValue.id,
      },
      update: { optionValueId: optionValue.id },
    });
  }

  await tx.productCatalogOptionValue.deleteMany({
    where: {
      productId: input.productId,
      ...(retainedOptionIds.length > 0
        ? { optionId: { notIn: retainedOptionIds } }
        : {}),
    },
  });
}

function getTaxonomySuggestion(entity: {
  id: string;
  name: string;
  icon: string | null;
}) {
  const split = splitTaxonomyIcon(entity.name);
  const icon = entity.icon ?? split.icon;

  if (!icon && split.name === entity.name) return null;

  return {
    id: entity.id,
    currentName: entity.name,
    canonicalName: split.name,
    icon,
  };
}

export async function prepareCatalogMigrationSuggestions(input: {
  storeId: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
  const products = await prismadb.product.findMany({
    where: {
      storeId: input.storeId,
      isArchived: false,
      shippingProfileId: null,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      updatedAt: true,
      productGroupId: true,
      size: { select: { name: true, value: true } },
      category: {
        select: {
          id: true,
          name: true,
          icon: true,
          type: { select: { id: true, name: true, icon: true } },
        },
      },
    },
  });

  let prepared = 0;
  for (const product of products) {
    const fingerprint = getCatalogMigrationFingerprint({
      productId: product.id,
      productUpdatedAt: product.updatedAt,
    });
    const attributes = inferCatalogAttributes(product.name);
    const payload: CatalogMigrationPayload = {
      shippingProfile: buildShippingProfileSuggestion(product.size),
      category: getTaxonomySuggestion(product.category),
      type: getTaxonomySuggestion(product.category.type),
      attributes,
    };

    await prismadb.$transaction([
      prismadb.catalogMigrationSuggestion.deleteMany({
        where: {
          storeId: input.storeId,
          productId: product.id,
          status: { not: "APPLIED" },
          fingerprint: { not: fingerprint },
        },
      }),
      prismadb.catalogMigrationSuggestion.upsert({
        where: {
          storeId_fingerprint: { storeId: input.storeId, fingerprint },
        },
        create: {
          storeId: input.storeId,
          productId: product.id,
          productGroupId: product.productGroupId,
          fingerprint,
          status: "PREPARED",
          source: "DETERMINISTIC",
          confidence: 1,
          payload: payload as Prisma.InputJsonValue,
          evidence: {
            shipping: `Perfil interno ${product.size.value}`,
            attributes: attributes.map((attribute) => attribute.evidence),
          },
        },
        update: {
          productGroupId: product.productGroupId,
          payload: payload as Prisma.InputJsonValue,
          evidence: {
            shipping: `Perfil interno ${product.size.value}`,
            attributes: attributes.map((attribute) => attribute.evidence),
          },
        },
      }),
    ]);
    prepared += 1;
  }

  return { prepared, scanned: products.length };
}

export async function mergeVisualCatalogAttributes(input: {
  storeId: string;
  suggestionId: string;
  attributes: z.infer<typeof visualCatalogAttributesSchema>;
}) {
  const suggestion = await prismadb.catalogMigrationSuggestion.findFirst({
    where: { id: input.suggestionId, storeId: input.storeId },
  });
  if (!suggestion) return null;

  const payload = catalogMigrationPayloadSchema.parse(suggestion.payload);
  const attributesByKey = new Map(
    payload.attributes.map((attribute) => [attribute.key, attribute]),
  );

  for (const attribute of input.attributes) {
    const key = normalizeCatalogOptionKey(attribute.key || attribute.name);
    if (!key) continue;

    attributesByKey.set(key, {
      key,
      name: attribute.name,
      value: attribute.value,
      confidence: 0.75,
      evidence: attribute.evidence,
    });
  }

  const updatedPayload: CatalogMigrationPayload = {
    ...payload,
    attributes: Array.from(attributesByKey.values()).slice(0, 8),
  };

  return prismadb.catalogMigrationSuggestion.update({
    where: { id: suggestion.id },
    data: {
      payload: updatedPayload as Prisma.InputJsonValue,
      source: CatalogMigrationSource.AI,
      status: "NEEDS_REVIEW",
      confidence: 0.75,
      model: "gemini-3.5-flash-lite",
      promptVersion: "catalog-options-v1",
    },
  });
}

export async function updateCatalogMigrationAttributes(input: {
  storeId: string;
  suggestionId: string;
  attributes: CatalogMigrationPayload["attributes"];
}) {
  const suggestion = await prismadb.catalogMigrationSuggestion.findFirst({
    where: {
      id: input.suggestionId,
      storeId: input.storeId,
      status: { not: "APPLIED" },
    },
  });
  if (!suggestion) return null;

  const payload = catalogMigrationPayloadSchema.parse(suggestion.payload);
  const attributes = z
    .array(catalogMigrationAttributeSchema)
    .max(8)
    .parse(input.attributes)
    .map((attribute) => ({
      ...attribute,
      key: normalizeCatalogOptionKey(attribute.key || attribute.name),
    }))
    .filter((attribute) => attribute.key);

  return prismadb.catalogMigrationSuggestion.update({
    where: { id: suggestion.id },
    data: {
      payload: { ...payload, attributes } as Prisma.InputJsonValue,
      status: "APPROVED",
    },
  });
}

async function applySuggestion(
  tx: Prisma.TransactionClient,
  suggestion: {
    id: string;
    storeId: string;
    productId: string | null;
    payload: Prisma.JsonValue;
  },
) {
  if (!suggestion.productId) return false;

  const payload = catalogMigrationPayloadSchema.parse(suggestion.payload);
  const product = await tx.product.findFirst({
    where: { id: suggestion.productId, storeId: suggestion.storeId },
    select: { id: true, categoryId: true },
  });
  if (!product) return false;

  const shippingProfile = await tx.shippingProfile.upsert({
    where: {
      storeId_code: {
        storeId: suggestion.storeId,
        code: payload.shippingProfile.code,
      },
    },
    create: { storeId: suggestion.storeId, ...payload.shippingProfile },
    update: {
      name: payload.shippingProfile.name,
      dimensionCode: payload.shippingProfile.dimensionCode,
      weightCode: payload.shippingProfile.weightCode,
    },
  });

  await tx.product.update({
    where: { id: product.id },
    data: { shippingProfileId: shippingProfile.id },
  });

  if (payload.category) {
    await tx.category.updateMany({
      where: { id: payload.category.id, storeId: suggestion.storeId },
      data: {
        name: payload.category.canonicalName,
        icon: payload.category.icon,
      },
    });
  }
  if (payload.type) {
    await tx.type.updateMany({
      where: { id: payload.type.id, storeId: suggestion.storeId },
      data: { name: payload.type.canonicalName, icon: payload.type.icon },
    });
  }

  await syncProductCatalogAttributes(tx, {
    storeId: suggestion.storeId,
    productId: product.id,
    categoryId: product.categoryId,
    attributes: payload.attributes,
  });

  await tx.catalogMigrationSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "APPLIED", appliedAt: new Date() },
  });
  return true;
}

export async function applyCatalogMigrationSuggestions(input: {
  storeId: string;
  suggestionIds: string[];
}) {
  const suggestions = await prismadb.catalogMigrationSuggestion.findMany({
    where: {
      storeId: input.storeId,
      id: { in: input.suggestionIds },
      status: { in: ["PREPARED", "NEEDS_REVIEW", "APPROVED"] },
    },
    select: { id: true, storeId: true, productId: true, payload: true },
  });

  return prismadb.$transaction(async (tx) => {
    let applied = 0;
    for (const suggestion of suggestions) {
      if (await applySuggestion(tx, suggestion)) applied += 1;
    }
    return { applied, requested: input.suggestionIds.length };
  });
}
