import prismadb from "@/lib/prismadb";
import { PostBody } from "@/lib/types";
import { Post } from "@prisma/client";

/**
 * Creates a new post with the given data and store ID.
 * @param data The post body and store ID.
 * @returns A promise that resolves to the created post.
 */
export async function createNewPost(
  data: PostBody & { storeId: string },
): Promise<Post> {
  return await prismadb.post.create({ data });
}

/**
 * Retrieves posts by store ID.
 * @param storeId The ID of the store.
 * @returns A promise that resolves to an array of posts.
 */
export async function getPostsByStoreId(storeId: string) {
  return await prismadb.post.findMany({ where: { storeId } });
}

/**
 * Retrieves a post by ID.
 * @param postId The ID of the post.
 * @returns A promise that resolves to a post.
 */
export async function getPostById(postId: string) {
  return await prismadb.post.findUnique({ where: { id: postId } });
}

/**
 * Updates a post with the provided data.
 * @param postId The ID of the post.
 * @param data The data for the post.
 * @returns A promise that resolves to the updated post.
 */
export async function updatePostById(
  postId: string,
  data: PostBody,
): Promise<Post> {
  return await prismadb.post.update({ where: { id: postId }, data });
}

/**
 * Deletes a post with the specified ID.
 * @param postId The ID of the post to delete.
 * @returns A promise that resolves to void.
 */
export async function deletePostById(postId: string): Promise<void> {
  await prismadb.post.delete({ where: { id: postId } });
}
