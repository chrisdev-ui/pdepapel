/**
 * Script de migración de tamaños antiguos al nuevo sistema Dimensión-Peso
 *
 * Este script convierte los tamaños actuales al nuevo formato:
 * - "Media Carta" => "S-L" (Pequeño liviano)
 * - "Única" => "M-L" (Mediano liviano)
 * - "Premium" => "L-P" (Grande pesado)
 * - etc.
 *
 * Uso:
 * npx tsx scripts/migrate-sizes.ts
 */

import prismadb from "../lib/prismadb";
import { generateSizeName, generateSizeValue } from "../constants/sizes";

const prisma = prismadb;

/**
 * Mapeo de tamaños antiguos al nuevo sistema
 * Puedes ajustar estos mapeos según tus necesidades
 */
const SIZE_MIGRATION_MAP: Record<
  string,
  { dimension: string; weight: string }
> = {
  // Formatos de papel
  "1/2": { dimension: "S", weight: "L" }, // Media carta - muy pequeño liviano
  "Media Carta": { dimension: "S", weight: "L" },

  // Tamaños únicos
  U: { dimension: "M", weight: "L" }, // Única - mediano liviano
  Única: { dimension: "M", weight: "L" },
  Unica: { dimension: "M", weight: "L" },

  // Premium
  Pr: { dimension: "L", weight: "P" }, // Premium - grande pesado
  Premium: { dimension: "L", weight: "P" },

  // Básicas
  B: { dimension: "S", weight: "L" }, // Básicas - pequeño liviano
  Básicas: { dimension: "S", weight: "L" },
  Basicas: { dimension: "S", weight: "L" },

  // Oficina
  O: { dimension: "L", weight: "L" }, // Oficio - mediano liviano
  Oficio: { dimension: "L", weight: "L" },

  // Carta
  C: { dimension: "M", weight: "P" }, // Carta - pequeño pesado
  Carta: { dimension: "M", weight: "P" },

  // Pequeño
  P: { dimension: "S", weight: "L" }, // Pequeño - pequeño liviano
  Pequeño: { dimension: "S", weight: "L" },
  Pequeno: { dimension: "S", weight: "L" },

  // Minas de lápiz
  "4mm": { dimension: "XS", weight: "L" }, // Mina 4mm - muy pequeño liviano
  "Mina 4mm": { dimension: "XS", weight: "L" },
  "6mm": { dimension: "XS", weight: "L" }, // Mina 6mm - muy pequeño liviano
  "Mina 6mm": { dimension: "XS", weight: "L" },
  "0.7mm": { dimension: "XS", weight: "L" }, // Mina 0.7mm - muy pequeño liviano
  "Mina 0.7mm": { dimension: "XS", weight: "L" },
  "2mm": { dimension: "XS", weight: "L" }, // Mina 2mm - muy pequeño liviano
  "Mina 2mm": { dimension: "XS", weight: "L" },

  // Grosores
  G: { dimension: "M", weight: "P" }, // Grueso - mediano pesado
  Grueso: { dimension: "M", weight: "P" },
  D: { dimension: "S", weight: "L" }, // Delgado - pequeño liviano
  Delgado: { dimension: "S", weight: "L" },

  // Tamaños estándar
  XS: { dimension: "XS", weight: "L" },
  XL: { dimension: "XL", weight: "P" },
  "Extra grande": { dimension: "XL", weight: "P" },
  L: { dimension: "L", weight: "P" },
  Grande: { dimension: "L", weight: "P" },
  M: { dimension: "M", weight: "L" },
  MEDIANO: { dimension: "M", weight: "L" },
  Mediano: { dimension: "M", weight: "L" },
  S: { dimension: "S", weight: "L" },
  Estandar: { dimension: "S", weight: "P" },
  Estándar: { dimension: "S", weight: "P" },
  "XS-L": { dimension: "XS", weight: "L" }, // MUY PEQUEÑO LIVIANO
  "MUY PEQUEÑO LIVIANO": { dimension: "XS", weight: "L" },
};

/**
 * Función para normalizar el nombre de tamaño (case-insensitive, trim)
 */
function normalizeKey(key: string): string {
  return key.trim();
}

/**
 * Busca el mapeo para un tamaño dado
 */
function findMappingForSize(
  value: string,
  name: string,
): { dimension: string; weight: string } | null {
  // Primero intentar por value
  const valueKey = normalizeKey(value);
  if (SIZE_MIGRATION_MAP[valueKey]) {
    return SIZE_MIGRATION_MAP[valueKey];
  }

  // Luego intentar por name
  const nameKey = normalizeKey(name);
  if (SIZE_MIGRATION_MAP[nameKey]) {
    return SIZE_MIGRATION_MAP[nameKey];
  }

  // Buscar coincidencia parcial en el nombre
  const lowerName = name.toLowerCase();
  for (const [key, mapping] of Object.entries(SIZE_MIGRATION_MAP)) {
    if (lowerName.includes(key.toLowerCase())) {
      return mapping;
    }
  }

  return null;
}

async function migrateSizes() {
  console.log("🚀 Iniciando migración de tamaños...\n");

  try {
    // 1. Obtener todos los tamaños actuales
    const allSizes = await prisma.size.findMany({
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    console.log(`📊 Total de tamaños encontrados: ${allSizes.length}\n`);

    const results = {
      migrated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{
        store: string;
        old: { name: string; value: string };
        new: { name: string; value: string } | null;
        status: "migrated" | "skipped" | "error";
        reason?: string;
      }>,
    };

    // 2. Procesar cada tamaño
    for (const size of allSizes) {
      const mapping = findMappingForSize(size.value, size.name);

      if (!mapping) {
        console.log(
          `⚠️  No se encontró mapeo para: "${size.name}" (${size.value}) en tienda "${size.store.name}"`,
        );
        results.skipped++;
        results.details.push({
          store: size.store.name,
          old: { name: size.name, value: size.value },
          new: null,
          status: "skipped",
          reason: "No mapping found",
        });
        continue;
      }

      const newName = generateSizeName(mapping.dimension, mapping.weight);
      const newValue = generateSizeValue(mapping.dimension, mapping.weight);

      // 3. Verificar si ya existe un tamaño con ese valor en la misma tienda
      const existingSize = await prisma.size.findFirst({
        where: {
          storeId: size.storeId,
          value: newValue,
          id: { not: size.id }, // No contar el mismo registro
        },
      });

      if (existingSize) {
        // Ya existe el tamaño nuevo, necesitamos migrar productos y eliminar el viejo
        console.log(
          `🗑️  Ya existe tamaño "${newValue}" en tienda "${size.store.name}". Migrando productos y eliminando tamaño antiguo "${size.name}" (${size.value})...`,
        );

        try {
          // Primero, migrar todos los productos del tamaño viejo al nuevo
          const productsWithOldSize = await prisma.product.count({
            where: { sizeId: size.id },
          });

          if (productsWithOldSize > 0) {
            console.log(
              `   📦 Migrando ${productsWithOldSize} productos del tamaño viejo al nuevo...`,
            );

            await prisma.product.updateMany({
              where: { sizeId: size.id },
              data: { sizeId: existingSize.id },
            });

            console.log(
              `   ✅ ${productsWithOldSize} productos migrados exitosamente`,
            );
          }

          // Ahora eliminar el tamaño viejo
          await prisma.size.delete({
            where: { id: size.id },
          });

          console.log(
            `✅ Eliminado tamaño duplicado: "${size.name}" (${size.value})`,
          );
          results.migrated++;
          results.details.push({
            store: size.store.name,
            old: { name: size.name, value: size.value },
            new: { name: newName, value: newValue },
            status: "migrated",
            reason: `Deleted duplicate after migrating ${productsWithOldSize} products`,
          });
        } catch (error) {
          console.error(
            `❌ Error al eliminar tamaño duplicado "${size.name}":`,
            error,
          );
          results.errors++;
          results.details.push({
            store: size.store.name,
            old: { name: size.name, value: size.value },
            new: { name: newName, value: newValue },
            status: "error",
            reason: `Failed to delete duplicate: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
        continue;
      }

      // 4. Actualizar el tamaño
      try {
        await prisma.size.update({
          where: { id: size.id },
          data: {
            name: newName,
            value: newValue,
          },
        });

        console.log(
          `✅ Migrado: "${size.name}" (${size.value}) => "${newName}" (${newValue}) en "${size.store.name}"`,
        );
        results.migrated++;
        results.details.push({
          store: size.store.name,
          old: { name: size.name, value: size.value },
          new: { name: newName, value: newValue },
          status: "migrated",
        });
      } catch (error) {
        console.error(
          `❌ Error al migrar tamaño "${size.name}" en "${size.store.name}":`,
          error,
        );
        results.errors++;
        results.details.push({
          store: size.store.name,
          old: { name: size.name, value: size.value },
          new: { name: newName, value: newValue },
          status: "error",
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // 5. Resumen
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMEN DE MIGRACIÓN");
    console.log("=".repeat(60));
    console.log(`✅ Migrados exitosamente: ${results.migrated}`);
    console.log(`⚠️  Saltados: ${results.skipped}`);
    console.log(`❌ Errores: ${results.errors}`);
    console.log("=".repeat(60) + "\n");

    // 6. Mostrar tamaños saltados para revisión
    const skippedDetails = results.details.filter(
      (d) => d.status === "skipped",
    );
    if (skippedDetails.length > 0) {
      console.log("\n⚠️  TAMAÑOS SALTADOS (requieren revisión manual):");
      console.log("-".repeat(60));
      skippedDetails.forEach((detail) => {
        console.log(`- Tienda: ${detail.store}`);
        console.log(`  Tamaño: "${detail.old.name}" (${detail.old.value})`);
        console.log(`  Razón: ${detail.reason}`);
        if (detail.new) {
          console.log(
            `  Sugerencia: "${detail.new.name}" (${detail.new.value})`,
          );
        }
        console.log();
      });
    }

    return results;
  } catch (error) {
    console.error("❌ Error fatal durante la migración:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar migración
migrateSizes()
  .then((results) => {
    console.log("✅ Migración completada exitosamente!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ La migración falló:", error);
    process.exit(1);
  });
