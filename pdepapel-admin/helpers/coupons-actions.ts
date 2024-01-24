import prismadb from "@/lib/prismadb";
import { CouponBody } from "@/lib/types";
import { Coupon } from "@prisma/client";

/**
 * Creates a new coupon.
 * @param data - The coupon data and store ID.
 * @returns A promise that resolves to the created coupon.
 */
export async function createNewCoupon(
  data: CouponBody & { storeId: string },
): Promise<Coupon> {
  return await prismadb.coupon.create({ data });
}

/**
 * Retrieves coupons by store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of coupons.
 */
export async function getCouponsByStoreId(storeId: string) {
  return await prismadb.coupon.findMany({ where: { storeId } });
}

/**
 * Retrieves a coupon by ID.
 * @param couponId - The ID of the coupon.
 * @returns A promise that resolves to a coupon.
 */
export async function getCouponById(couponId: string) {
  return await prismadb.coupon.findUnique({ where: { id: couponId } });
}

/**
 * Updates a coupon with the provided data.
 * @param couponId - The ID of the coupon.
 * @param data - The data for the coupon.
 * @returns A promise that resolves to the updated coupon.
 */
export async function updateCouponById(
  couponId: string,
  data: CouponBody,
): Promise<Coupon> {
  return await prismadb.coupon.update({ where: { id: couponId }, data });
}

/**
 * Deletes a coupon with the specified ID.
 * @param couponId - The ID of the coupon to delete.
 * @returns A promise that resolves to void.
 */
export async function deleteCouponById(couponId: string): Promise<void> {
  await prismadb.coupon.delete({ where: { id: couponId } });
}
