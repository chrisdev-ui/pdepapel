import prismadb from "@/lib/prismadb";
import { TagBody } from "@/lib/types";
import { Tag } from "@prisma/client";

/**
 * Creates a new tag.
 * @param data - The tag data and store ID.
 * @returns A promise that resolves to the created tag.
 */
export async function createNewTag(
  data: TagBody & { storeId: string },
): Promise<Tag> {
  return await prismadb.tag.create({
    data,
  });
}

/**
 * Gets all tags of the store.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to the tags.
 */
export async function getTagsByStoreId(storeId: string): Promise<Tag[]> {
  return await prismadb.tag.findMany({
    where: { storeId },
  });
}

/**
 * Retrieves a tag by its ID.
 * @param tagId - The ID of the tag to retrieve.
 * @returns A promise that resolves to the retrieved tag, or null if no tag is found.
 */
export async function getTagById(tagId: string): Promise<Tag | null> {
  return await prismadb.tag.findUnique({
    where: { id: tagId },
  });
}

/**
 * Updates a tag by its ID.
 * @param tagId - The ID of the tag to update.
 * @param data - The data to be updated.
 * @returns A promise that resolves to the updated tag.
 */
export async function updateTagById(
  tagId: string,
  data: TagBody,
): Promise<Tag> {
  return await prismadb.tag.update({
    where: { id: tagId },
    data,
  });
}

/**
 * Deletes a tag by its ID.
 * @param tagId - The ID of the tag to delete.
 * @returns A promise that resolves when the tag is deleted.
 */
export async function deleteTagById(tagId: string): Promise<void> {
  await prismadb.tag.delete({
    where: { id: tagId },
  });
}
