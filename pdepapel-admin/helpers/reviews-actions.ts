import prismadb from "@/lib/prismadb";
import { ReviewBody } from "@/lib/types";
import { User } from "@clerk/nextjs/server";
import { Review } from "@prisma/client";

/**
 * Creates a new review.
 *
 * @param user - The user creating the review.
 * @param storeId - The ID of the store the review belongs to.
 * @param productId - The ID of the product the review belongs to.
 * @param data - The review data, excluding the user ID.
 * @returns A promise that resolves to the created review.
 */
export async function createNewReview(
  user: User,
  data: Omit<ReviewBody, "userId"> & { storeId: string; productId: string },
): Promise<Review> {
  return await prismadb.review.create({
    data: {
      userId: user.id,
      name: `${user.firstName ?? ""} ${user.lastName ?? ""}`,
      ...data,
    },
  });
}

/**
 * Retrieves the reviews of a product by store.
 *
 * @param storeId - The ID of the store.
 * @param productId - The ID of the product.
 * @returns A promise that resolves to an array of reviews.
 */
export async function getReviewsOfProductByStore(
  storeId: string,
  productId: string,
): Promise<Review[]> {
  return await prismadb.review.findMany({
    where: { storeId, productId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves the reviews of a product by user.
 *
 * @param userId - The ID of the user.
 * @param productId - The ID of the product.
 * @returns A promise that resolves to an array of reviews.
 */
export async function getReviewsOfProductByUser(
  userId: string,
  productId: string,
): Promise<Review[]> {
  return await prismadb.review.findMany({
    where: { userId, productId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves the reviews of a store.
 *
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to an array of reviews.
 */
export async function getReviewsOfStore(storeId: string): Promise<Review[]> {
  return await prismadb.review.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves the reviews of a user.
 *
 * @param userId - The ID of the user.
 * @returns A promise that resolves to an array of reviews.
 */
export async function getReviewsOfUser(userId: string): Promise<Review[]> {
  return await prismadb.review.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves a review of a product by its ID.
 * @param productId - The ID of the product.
 * @param reviewId - The ID of the review.
 * @returns A promise that resolves to the review object if found, or null if not found.
 */
export async function getReviewOfProductById(
  productId: string,
  reviewId: string,
): Promise<Review | null> {
  return await prismadb.review.findFirst({
    where: { productId, id: reviewId },
  });
}

/**
 * Retrieves a review by its ID.
 * @param reviewId The ID of the review to retrieve.
 * @returns A promise that resolves to the review object if found, or null if not found.
 */
export async function getReviewById(reviewId: string): Promise<Review | null> {
  return await prismadb.review.findUnique({ where: { id: reviewId } });
}

/**
 * Updates a review by its ID.
 *
 * @param user - The user performing the update.
 * @param reviewId - The ID of the review to update.
 * @param productId - The ID of the product associated with the review.
 * @param data - The updated review data, excluding the userId.
 * @returns A promise that resolves to the updated review.
 */
export async function updateReviewById(
  user: User,
  reviewId: string,
  productId: string,
  data: Omit<ReviewBody, "userId">,
): Promise<Review> {
  return await prismadb.review.update({
    where: { id: reviewId, userId: user.id, productId },
    data: {
      name: `${user.firstName ?? ""} ${user.lastName ?? ""}`,
      ...data,
    },
  });
}

/**
 * Deletes a review by its ID.
 *
 * @param user - The user performing the delete.
 * @param reviewId - The ID of the review to delete.
 * @param productId - The ID of the product associated with the review.
 * @returns A promise that resolves when the review is deleted.
 */
export async function deleteReviewById(reviewId: string): Promise<void> {
  await prismadb.review.delete({
    where: { id: reviewId },
  });
}
