/**
 * Google Merchant Center feed export.
 *
 *   npm run export:products-merchant                 # verifies every product URL
 *   npm run export:products-merchant -- --skip-verify
 *
 * Writes `google_merchant_feed_<date>.txt` (tab-separated, upload as a file
 * feed) plus `google_merchant_report_<date>.txt` next to it, after deleting
 * previous exports so only the latest pair remains. Products whose storefront
 * page is not reachable are left out of the feed and listed in the report;
 * links that redirect (slug changes) are exported with their final URL.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import path from "path";
import {
  GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS,
  GOOGLE_MERCHANT_STOREFRONT_URL,
  getGoogleMerchantColor,
  getGoogleMerchantDescription,
  getGoogleMerchantPattern,
  getGoogleMerchantProductLink,
  getGoogleMerchantSize,
  toGoogleMerchantImageUrl,
} from "../../lib/google-merchant";

const prismadb = new PrismaClient();
const OUTPUT_DIR = process.cwd();
const FEED_PREFIX = "google_merchant_feed";
const REPORT_PREFIX = "google_merchant_report";
const VERIFY_CONCURRENCY = 6;
const VERIFY_TIMEOUT_MS = 20_000;
const skipVerify = process.argv.includes("--skip-verify");

function generateTimestamp() {
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

  return `${dateString}_${timeString}`;
}

function cleanText(value: string | null | undefined) {
  return (value || "")
    .replace(/[\t\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePreviousExports() {
  const removed = fs
    .readdirSync(OUTPUT_DIR)
    .filter(
      (file) =>
        (file.startsWith(`${FEED_PREFIX}_`) ||
          file.startsWith(`${REPORT_PREFIX}_`)) &&
        file.endsWith(".txt"),
    );

  for (const file of removed) {
    fs.unlinkSync(path.join(OUTPUT_DIR, file));
  }

  return removed;
}

type LinkCheck =
  | { ok: true; finalUrl: string; redirected: boolean }
  | { ok: false; status: number | "error"; detail?: string };

async function checkLink(url: string): Promise<LinkCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; PdePapelMerchantFeed/1.0; +https://papeleriapdepapel.com)",
        accept: "text/html",
      },
    });
    // Drain the body so the connection can be reused.
    await response.arrayBuffer().catch(() => undefined);

    if (response.status !== 200) {
      return { ok: false, status: response.status };
    }

    const finalUrl = response.url.split("#")[0].split("?")[0];
    return { ok: true, finalUrl, redirected: finalUrl !== url };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

async function exportProductsToGoogleMerchant() {
  try {
    const removed = removePreviousExports();
    if (removed.length > 0) {
      console.log(`Removed previous export(s): ${removed.join(", ")}`);
    }

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

    // --- Storefront link verification ---------------------------------------
    const unreachable: string[] = [];
    const redirected: string[] = [];
    const rewrittenImages: string[] = [];
    const missingImages: string[] = [];
    const linkByProductId = new Map<string, string>();

    for (const product of products) {
      linkByProductId.set(product.id, getGoogleMerchantProductLink(product));
    }

    if (skipVerify) {
      console.log("Skipping storefront URL verification (--skip-verify).");
    } else {
      console.log(
        `Verifying ${products.length} product pages on ${GOOGLE_MERCHANT_STOREFRONT_URL}...`,
      );
      let checked = 0;
      await mapWithConcurrency(
        products,
        VERIFY_CONCURRENCY,
        async (product) => {
          const link = linkByProductId.get(product.id)!;
          const result = await checkLink(link);
          checked += 1;
          if (checked % 100 === 0) {
            console.log(`  ${checked}/${products.length} checked`);
          }

          if (!result.ok) {
            unreachable.push(
              `${product.sku || product.id}\t${product.name}\t${link}\t${result.status}${result.detail ? ` (${result.detail})` : ""}`,
            );
            linkByProductId.delete(product.id);
            return;
          }

          if (result.redirected) {
            redirected.push(
              `${product.sku || product.id}\t${product.name}\t${link} -> ${result.finalUrl}`,
            );
            linkByProductId.set(product.id, result.finalUrl);
          }
        },
      );
    }

    const exportedProducts = products.filter((product) =>
      linkByProductId.has(product.id),
    );

    // --- Rows ----------------------------------------------------------------
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
      "excluded_destination",
    ];

    const rows = exportedProducts.map((product) => {
      const mainImage = product.images.find((image) => image.isMain);
      const orderedImages = product.images
        .filter((image) => image.url !== mainImage?.url)
        .slice(0, 10);
      const rawMainImage = mainImage?.url || product.images[0]?.url || "";
      const imageLink = toGoogleMerchantImageUrl(rawMainImage);
      const additionalImages = orderedImages.map((image) =>
        toGoogleMerchantImageUrl(image.url),
      );

      if (!rawMainImage) {
        missingImages.push(`${product.sku || product.id}\t${product.name}`);
      } else if (imageLink !== rawMainImage) {
        rewrittenImages.push(
          `${product.sku || product.id}\t${rawMainImage} -> ${imageLink}`,
        );
      }
      orderedImages.forEach((image, index) => {
        if (additionalImages[index] !== image.url) {
          rewrittenImages.push(
            `${product.sku || product.id}\t${image.url} -> ${additionalImages[index]}`,
          );
        }
      });

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
        cleanText(
          getGoogleMerchantDescription(product.description, product.name),
        ),
        linkByProductId.get(product.id)!,
        imageLink,
        additionalImages.join(","),
        `${product.price} COP`,
        "new",
        product.stock > 0 ? "in_stock" : "out_of_stock",
        cleanText(brand),
        product.gtin || "",
        product.mpn || "",
        identifierExists,
        cleanText(productType),
        itemGroupId,
        cleanText(getGoogleMerchantColor(product.name, product.color)),
        cleanText(getGoogleMerchantSize(product.category?.name, product.size)),
        cleanText(getGoogleMerchantPattern(product.name, product.design)),
        GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS.join(","),
      ].join("\t");
    });

    // --- Files ---------------------------------------------------------------
    const stamp = generateTimestamp();
    const feedPath = path.join(OUTPUT_DIR, `${FEED_PREFIX}_${stamp}.txt`);
    const reportPath = path.join(OUTPUT_DIR, `${REPORT_PREFIX}_${stamp}.txt`);

    fs.writeFileSync(
      feedPath,
      `${headers.join("\t")}\n${rows.join("\n")}\n`,
      "utf8",
    );

    const reportLines = [
      `Google Merchant feed report — ${new Date().toISOString()}`,
      `Active products in database: ${products.length}`,
      `Products exported: ${exportedProducts.length}`,
      `Excluded (page not reachable): ${unreachable.length}`,
      `Links updated after redirect: ${redirected.length}`,
      `Images converted to a supported format: ${rewrittenImages.length}`,
      `Products without any image: ${missingImages.length}`,
      `excluded_destination: ${GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS.join(", ")}`,
      "",
    ];
    const section = (title: string, lines: string[]) => {
      if (lines.length === 0) return;
      reportLines.push(`## ${title}`, ...lines, "");
    };
    section(
      "Excluded: storefront page not reachable (id\tname\tlink\tstatus)",
      unreachable,
    );
    section("Links updated after redirect (id\tname\told -> new)", redirected);
    section("Images converted (id\told -> new)", rewrittenImages);
    section("Products without any image (id\tname)", missingImages);
    fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf8");

    console.log(`Google Merchant feed created at: ${feedPath}`);
    console.log(`Report created at: ${reportPath}`);
    console.log(
      `Exported ${exportedProducts.length} of ${products.length} active products` +
        (unreachable.length
          ? ` (${unreachable.length} excluded because their page is not reachable — see report)`
          : ""),
    );
  } catch (error) {
    console.error("Error exporting products to Google Merchant:", error);
    process.exitCode = 1;
  } finally {
    await prismadb.$disconnect();
  }
}

exportProductsToGoogleMerchant();
