import { PrismaClient, QuotationType, DiscountType } from "@prisma/client";
import { addDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting quotation seeding...");

  // 1. Get the first store
  const store = await prisma.store.findFirst();

  if (!store) {
    console.error("❌ No store found. Please create a store first.");
    process.exit(1);
  }

  console.log(`📍 Using store: ${store.name} (${store.id})`);

  // 2. Get some products to link
  const products = await prisma.product.findMany({
    where: { storeId: store.id, isArchived: false },
    take: 5,
  });

  if (products.length === 0) {
    console.warn(
      "⚠️ No products found. Creating quotations with manual items only.",
    );
  }

  // 3. Create Quotations

  // A. School List Template (Active)
  const schoolList = await prisma.quotation.create({
    data: {
      storeId: store.id,
      name: "Lista Escolar Grado 5 - 2024",
      description: "Lista base para quinto grado con útiles esenciales.",
      type: QuotationType.SCHOOL_LIST,
      isTemplate: true,
      isActive: true,
      validityDays: 30,
      createdBy: "Seed Script",
      items: {
        create: [
          {
            name: "Cuaderno Norma 100 Hojas",
            quantity: 5,
            unitPrice: 15000,
            productId: products[0]?.id, // Link if available
            isOptional: false,
          },
          {
            name: "Caja de Colores Prismacolor",
            quantity: 1,
            unitPrice: 45000,
            productId: products[1]?.id,
            isOptional: false,
          },
          {
            name: "Diccionario Español (Opcional)",
            quantity: 1,
            unitPrice: 20000,
            productId: products[2]?.id,
            isOptional: true, // Test optional flag
          },
        ],
      },
    },
  });
  console.log(`✅ Created Template: ${schoolList.name}`);

  // B. Corporate Event Quote (General, Non-template)
  const corpQuote = await prisma.quotation.create({
    data: {
      storeId: store.id,
      name: "Cotización Evento Fin de Año",
      description: "Regalos corporativos para empleados.",
      type: QuotationType.CORPORATE,
      isTemplate: false,
      isActive: true,
      validityDays: 15,
      createdBy: "Seed Script",
      defaultDiscount: 10,
      defaultDiscountType: DiscountType.PERCENTAGE,
      items: {
        create: [
          {
            name: "Kit de Escritorio Premium",
            quantity: 50,
            unitPrice: 85000,
            isOptional: false,
          },
          {
            name: "Servicio de Personalización (Logo)",
            quantity: 50,
            unitPrice: 5000,
            isOptional: false,
            description: "Estampado de logo a una tinta.",
          },
        ],
      },
    },
  });
  console.log(`✅ Created Quotation: ${corpQuote.name}`);

  // C. Expired/Short Validity Quote
  const quickQuote = await prisma.quotation.create({
    data: {
      storeId: store.id,
      name: "Oferta Flash Papelería",
      description: "Precios válidos solo por 24 horas.",
      type: QuotationType.GENERAL,
      isTemplate: false,
      isActive: true,
      validityDays: 1,
      createdBy: "Seed Script",
      items: {
        create: [
          {
            name: "Resma de Papel Carta",
            quantity: 10,
            unitPrice: 12000,
            productId: products[0]?.id,
          },
        ],
      },
    },
  });
  console.log(`✅ Created Short-Validity Quote: ${quickQuote.name}`);

  // D. Empty / Base Template
  const baseTemplate = await prisma.quotation.create({
    data: {
      storeId: store.id,
      name: "Plantilla Base",
      description: "Plantilla vacía para iniciar desde cero.",
      type: QuotationType.GENERAL,
      isTemplate: true,
      isActive: true,
      validityDays: 7,
      createdBy: "Seed Script",
      items: {
        create: [
          {
            name: "Ítem de Ejemplo",
            quantity: 1,
            unitPrice: 0,
            isOptional: false,
          },
        ],
      },
    },
  });
  console.log(`✅ Created Base Template: ${baseTemplate.name}`);

  console.log("\n✨ Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
