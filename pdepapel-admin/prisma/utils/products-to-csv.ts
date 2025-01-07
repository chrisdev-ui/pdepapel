import { formatter } from "@/lib/utils";
import { PrismaClient } from "@prisma/client";
import { createObjectCsvWriter } from "csv-writer";

const prismadb = new PrismaClient();

async function exportProdcutsToCSV() {
  try {
    const products = await prismadb.product.findMany({
      include: {
        store: true,
        category: true,
        size: true,
        color: true,
        design: true,
        images: true,
      },
    });

    const csvWriter = createObjectCsvWriter({
      path: "products_export.csv",
      header: [
        { id: "id", title: "ID" },
        { id: "name", title: "Nombre" },
        { id: "description", title: "Descripción" },
        { id: "stock", title: "Stock" },
        { id: "price", title: "Precio" },
        { id: "isFeatured", title: "Es Destacado" },
        { id: "isArchived", title: "Está Archivado" },
        { id: "sku", title: "SKU" },
        { id: "categoryName", title: "Categoría" },
        { id: "sizeName", title: "Tamaño" },
        { id: "colorName", title: "Color" },
        { id: "designName", title: "Diseño" },
        { id: "images", title: "Imágenes" },
        { id: "createdAt", title: "Fecha de Creación" },
        { id: "updatedAt", title: "Fecha de Actualización" },
      ],
    });

    const records = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      stock: `${product.stock} unidades`,
      price: formatter.format(product.price),
      isFeatured: product.isFeatured ? "Sí" : "No",
      isArchived: product.isArchived ? "Sí" : "No",
      sku: product.sku,
      categoryName: product.category.name,
      sizeName: product.size.name,
      colorName: product.color.name,
      designName: product.design.name,
      images: product.images.map((img) => img.url).join(", "),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }));

    await csvWriter.writeRecords(records);

    console.log("CSV file has been created successfully!");
  } catch (error) {
    console.error("Error exporting products to CSV:", error);
  } finally {
    await prismadb.$disconnect();
  }
}

exportProdcutsToCSV();
