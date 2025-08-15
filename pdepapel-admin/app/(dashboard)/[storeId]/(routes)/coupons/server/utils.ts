"use server";

import prismadb from "@/lib/prismadb";

// Function to generate a random coupon code
function generateRandomCode(length: number = 8): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

// Function to check if a coupon code exists
async function checkCodeExists(
  storeId: string,
  code: string,
): Promise<boolean> {
  const existingCoupon = await prismadb.coupon.findFirst({
    where: {
      storeId,
      code: {
        equals: code,
      },
    },
  });

  return !!existingCoupon;
}

// Main function to generate a unique coupon code
export async function generateUniqueCouponCode(
  storeId: string,
  maxAttempts: number = 10,
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    if (!storeId) {
      return {
        success: false,
        error: "Store ID es requerido",
      };
    }

    let attempts = 0;
    let generatedCode = "";

    while (attempts < maxAttempts) {
      // Generate a random code (8 characters by default)
      generatedCode = generateRandomCode(8);

      // Check if this code already exists
      const codeExists = await checkCodeExists(storeId, generatedCode);

      if (!codeExists) {
        // Found a unique code!
        return {
          success: true,
          code: generatedCode,
        };
      }

      attempts++;
    }

    // If we couldn't generate a unique code after maxAttempts
    return {
      success: false,
      error: `No se pudo generar un código único después de ${maxAttempts} intentos. Intenta de nuevo.`,
    };
  } catch (error) {
    console.error("Error generating unique coupon code:", error);
    return {
      success: false,
      error: "Error interno del servidor al generar el código",
    };
  }
}

// Function to generate multiple unique codes at once (for batch creation)
export async function generateMultipleUniqueCouponCodes(
  storeId: string,
  count: number = 1,
  length: number = 8,
): Promise<{ success: boolean; codes?: string[]; error?: string }> {
  try {
    if (!storeId) {
      return {
        success: false,
        error: "Store ID es requerido",
      };
    }

    if (count > 50) {
      return {
        success: false,
        error: "No se pueden generar más de 50 códigos a la vez",
      };
    }

    const generatedCodes: string[] = [];
    const maxAttempts = 20;

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let foundUniqueCode = false;

      while (attempts < maxAttempts && !foundUniqueCode) {
        const code = generateRandomCode(length);

        // Check if code exists in database or in our current batch
        const codeExistsInDb = await checkCodeExists(storeId, code);
        const codeExistsInBatch = generatedCodes.includes(code);

        if (!codeExistsInDb && !codeExistsInBatch) {
          generatedCodes.push(code);
          foundUniqueCode = true;
        }

        attempts++;
      }

      if (!foundUniqueCode) {
        return {
          success: false,
          error: `No se pudo generar el código ${i + 1} después de ${maxAttempts} intentos`,
        };
      }
    }

    return {
      success: true,
      codes: generatedCodes,
    };
  } catch (error) {
    console.error("Error generating multiple unique coupon codes:", error);
    return {
      success: false,
      error: "Error interno del servidor al generar los códigos",
    };
  }
}
