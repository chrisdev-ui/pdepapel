import prismadb from "@/lib/prismadb";
import { DiscountBody } from "@/lib/types";
import { Discount } from "@prisma/client";

/**
 * Creates a new discount.
 * @param data - The discount data and store ID.
 * @returns A promise that resolves to the created discount.
 */
export async function createNewDiscount(
  data: DiscountBody & { storeId: string },
): Promise<Discount> {
  return await prismadb.discount.create({ data });
}

/**
 * Retrieves discounts by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of discounts.
 */
export async function getDiscountsByStoreId(storeId: string) {
  return await prismadb.discount.findMany({ where: { storeId } });
}

/**
 * Retrieves a discount by ID.
 * @param discountId - The ID of the discount.
 * @returns A promise that resolves to a discount.
 */
export async function getDiscountById(discountId: string) {
  return await prismadb.discount.findUnique({ where: { id: discountId } });
}

/**
 * Updates a discount with the provided data.
 * @param discountId - The ID of the discount.
 * @param data - The data for the discount.
 * @returns A promise that resolves to the updated discount.
 */
export async function updateDiscountById(
  discountId: string,
  data: DiscountBody,
): Promise<Discount> {
  return await prismadb.discount.update({ where: { id: discountId }, data });
}

/**
 * Deletes a discount with the specified ID.
 * @param discountId - The ID of the discount to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteDiscountById(discountId: string): Promise<void> {
  await prismadb.discount.delete({ where: { id: discountId } });
}

/**
 * Checks if a discount is valid based on its start and end dates.
 * @param startDate The start date of the discount.
 * @param endDate The end date of the discount.
 * @returns A boolean indicating whether the discount is valid or not.
 */
export function isValidDiscount(startDate: Date, endDate: Date): boolean {
  const now = new Date();
  return startDate <= now && endDate >= now;
}

export function calculateDiscountQuantity(
  x: number,
  y: number,
  quantity: number,
) {
  if (x && y && quantity >= x) {
    return Math.floor(quantity / x) * y;
  }
  return quantity;
}
