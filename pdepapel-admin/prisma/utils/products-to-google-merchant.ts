import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import path from "path";

const prismadb = new PrismaClient();
const BASE_URL = "https://papeleriapdepapel.com";

function generateUniqueName(baseName = "file") {
  const now = new Date();
  const dateString = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const timeString = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `${baseName}_${dateString}_${timeString}`;
}

function cleanText(value: string | null | undefined) {
  return (value || "")
    .replace(/[\t\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function exportProductsToGoogleMerchant() {
  try {
    console.log("Fetching products from the database for Google Merchant...");

    const products = await prismadb.product.findMany({
      where: { isArchived: false },
      include: {
        category: { include: { type: true } },
        color: true,
        design: true,
        size: true,
        productGroup: true,
        images: {
          orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });

    if (products.length === 0) {
      console.log("No active products found in the database.");
      return;
    }

    const groupVariantCombinations = new Map<string, Set<string>>();
    const groupsWithDuplicateVariants = new Set<string>();

    for (const product of products) {
      if (!product.productGroupId) continue;

      const combination = [
        product.sizeId,
        product.colorId,
        product.designId,
      ].join("|");
      const combinations = groupVariantCombinations.get(product.productGroupId);

      if (combinations?.has(combination)) {
        groupsWithDuplicateVariants.add(product.productGroupId);
      } else if (combinations) {
        combinations.add(combination);
      } else {
        groupVariantCombinations.set(
          product.productGroupId,
          new Set([combination]),
        );
      }
    }

    if (groupsWithDuplicateVariants.size > 0) {
      console.warn(
        `Excluded item_group_id for ${groupsWithDuplicateVariants.size} group(s) with duplicate variant attributes. Fix those variants in the admin before grouping them in Merchant.`,
      );
    }

    const headers = [
      "id",
      "title",
      "description",
      "link",
      "image_link",
      "additional_image_link",
      "price",
      "condition",
      "availability",
      "brand",
      "gtin",
      "mpn",
      "identifier_exists",
      "product_type",
      "item_group_id",
      "color",
      "size",
      "pattern",
    ];
    const rows = products.map((product) => {
      const mainImage = product.images.find((image) => image.isMain);
      const orderedImages = product.images.filter(
        (image) => image.url !== mainImage?.url,
      );
      const brand = product.brand || product.productGroup?.brand || "";
      const productType = [product.category?.type?.name, product.category?.name]
        .filter(Boolean)
        .join(" > ");
      const identifierExists =
        product.hasNoProductIdentifier ||
        (!product.gtin && !(brand && product.mpn))
          ? "no"
          : "";
      const itemGroupId = groupsWithDuplicateVariants.has(
        product.productGroupId || "",
      )
        ? ""
        : product.productGroupId || "";

      return [
        product.sku || product.id,
        cleanText(product.name),
        cleanText(product.description || product.name),
        `${BASE_URL}/producto/${product.slug || product.id}`,
        mainImage?.url || product.images[0]?.url || "",
        orderedImages
          .slice(0, 10)
          .map((image) => image.url)
          .join(","),
        `${product.price} COP`,
        "new",
        product.stock > 0 ? "in_stock" : "out_of_stock",
        cleanText(brand),
        product.gtin || "",
        product.mpn || "",
        identifierExists,
        cleanText(productType),
        itemGroupId,
        cleanText(product.color?.name),
        cleanText(product.size?.value || product.size?.name),
        cleanText(product.design?.name),
      ].join("\t");
    });

    const filePath = path.resolve(
      `${generateUniqueName("google_merchant_feed")}.txt`,
    );
    fs.writeFileSync(
      filePath,
      `${headers.join("\t")}\n${rows.join("\n")}\n`,
      "utf8",
    );

    console.log(`Google Merchant feed created at: ${filePath}`);
    console.log(`File contains ${products.length} active products.`);
  } catch (error) {
    console.error("Error exporting products to Google Merchant:", error);
    process.exitCode = 1;
  } finally {
    await prismadb.$disconnect();
  }
}

exportProductsToGoogleMerchant();
