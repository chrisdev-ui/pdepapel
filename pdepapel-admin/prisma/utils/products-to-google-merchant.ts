import { PrismaClient } from "@prisma/client";
import path from "path";
import * as fs from "fs";
import prismadb from "../../lib/prismadb";

// Your BASE_URL - adjust this to your actual domain
const BASE_URL = "https://papeleriapdepapel.com";

function generateUniqueName(baseName = "file") {
  const now = new Date();

  const dateString =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    "_" +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0") +
    "_" +
    now.getMilliseconds().toString().padStart(3, "0");

  return `${baseName}_${dateString}`;
}

async function exportProductsToGoogleMerchant() {
  try {
    console.log("Fetching products from the database for Google Merchant...");

    // Only get active (non-archived) products for Google Merchant
    const products = await prismadb.product.findMany({
      where: {
        isArchived: false, // Only active products
      },
      include: {
        store: true,
        category: true,
        size: true,
        color: true,
        design: true,
        images: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    if (products.length === 0) {
      console.log("No active products found in the database.");
      return;
    }

    console.log(
      `Found ${products.length} active products. Preparing Google Merchant TSV data...`,
    );

    // Create TSV file (tab-separated values)
    const filePath = path.resolve(
      `${generateUniqueName("google_merchant_feed")}.txt`,
    );

    // Manual TSV generation (more reliable than csv-writer with tabs)
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
      "identifier_exists",
      "product_type",
      "google_product_category",
      "age_group",
      "gender",
    ];

    let tsvContent = headers.join("\t") + "\n";

    // Generate TSV content manually
    products.forEach((product) => {
      // Clean text fields to remove tabs and newlines
      const cleanText = (text: string) => {
        return text
          .replace(/[\t\n\r]/g, " ") // Replace tabs and newlines with spaces
          .replace(/\s+/g, " ") // Replace multiple spaces with single space
          .trim();
      };

      // Get main image and additional images
      const mainImage = product.images[0]?.url || "";
      const additionalImages = product.images
        .slice(1, 10) // Google allows up to 10 additional images
        .map((img) => img.url)
        .join(",");

      // Determine availability based on stock and archived status
      let availability = "out_of_stock";
      if (!product.isArchived && product.stock > 0) {
        availability = "in_stock";
      }

      // Format price for Google Merchant (price + currency)
      const formattedPrice = `${product.price} COP`;

      const rowData = [
        product.sku || product.id, // Use SKU if available, otherwise use ID
        cleanText(product.name),
        cleanText(product.description || product.name),
        `${BASE_URL}/product/${product.id}`,
        mainImage,
        additionalImages,
        formattedPrice,
        "new", // Assuming all products are new
        availability,
        product.store?.name || "Papelería de Papel", // Use store name as brand
        "", // Add if you have GTIN/EAN codes in your database
        "no", // Change to 'yes' if you have GTINs
        product.category?.name || "",
        "", // You'll need to map your categories to Google's taxonomy
        "adult", // Default to adult, adjust as needed
        "unisex", // Default to unisex, adjust as needed
      ];

      // Join with tabs and add to content
      tsvContent += rowData.join("\t") + "\n";
    });

    console.log("Writing TSV data to file...");

    // Write the TSV content manually using fs
    const fs = require("fs");
    fs.writeFileSync(filePath, tsvContent, "utf8");

    console.log(
      `Google Merchant feed has been created successfully at: ${filePath}`,
    );
    console.log(
      `File contains ${products.length} products ready for Google Merchant Center.`,
    );
    console.log(`\nNext steps:`);
    console.log(
      `1. Review the generated file and adjust any categories or brands as needed`,
    );
    console.log(`2. Upload the .txt file to Google Merchant Center`);
    console.log(
      `3. Map your product_type categories to Google's product categories if needed`,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        "Error exporting products to Google Merchant:",
        error.message,
      );
    } else {
      console.error("Error exporting products to Google Merchant:", error);
    }
  } finally {
    await prismadb.$disconnect();
  }
}

// Run the export
exportProductsToGoogleMerchant();
