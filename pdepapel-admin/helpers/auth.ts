import prismadb from "@/lib/prismadb";
import { auth, clerkClient } from "@clerk/nextjs";

/**
 * Retrieves the authenticated user ID.
 * @returns The user ID if available, otherwise null.
 */
export function getUserId(): string | null {
  const { userId } = auth();
  return userId;
}

/**
 * Retrieves a user by their ID.
 * @param userId The ID of the user to retrieve.
 * @returns A promise that resolves to the user object.
 */
export async function getUserById(userId: string) {
  return await clerkClient.users.getUser(userId);
}

/**
 * Checks if a user is authorized for a specific store.
 * @param userId - The ID of the user.
 * @param storeId - The ID of the store.
 * @returns A Promise that resolves to a boolean indicating whether the user is authorized.
 */
export async function isUserAuthorized(
  userId: string,
  storeId: string,
): Promise<boolean> {
  const storeByUserId = await prismadb.store.findFirst({
    where: { id: storeId, userId },
  });
  return Boolean(storeByUserId);
}

/**
 * Authenticates a user based on the provided userId and guestId.
 *
 * @param {string | null} userId - The ID of the user to authenticate.
 * @param {string | null} guestId - The ID of the guest user to authenticate.
 * @returns {Promise<string | null>} - The ID of the authenticated user, or null if authentication fails.
 */
export async function authenticateUser(
  userId: string | null,
  guestId: string | null,
): Promise<string | null> {
  const loggedUser = getUserId();

  if (loggedUser) {
    return loggedUser;
  }

  if (userId && guestId) {
    console.error(
      "Both userId and guestId provided. Only one should be provided.",
    );
    return null;
  }

  if (userId) {
    try {
      const user = await clerkClient.users.getUser(userId);
      return user.id;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  if (guestId) {
    return guestId;
  }

  console.error("No user information provided.");
  return null;
}
