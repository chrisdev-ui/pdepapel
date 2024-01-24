import prismadb from "@/lib/prismadb";
import { TypeBody } from "@/lib/types";
import { Type } from "@prisma/client";

/**
 * Creates a new type with the specified data and store ID.
 * @param data The data for the new type.
 * @returns A promise that resolves to the created type.
 */
export async function createNewType(
  data: TypeBody & { storeId: string },
): Promise<Type> {
  return await prismadb.type.create({
    data,
  });
}

/**
 * Gets all types of the store.
 * @param storeId The ID of the store.
 * @returns A promise that resolves to the types.
 */
export async function getTypesByStoreId(storeId: string): Promise<Type[]> {
  return await prismadb.type.findMany({
    where: { storeId },
    include: {
      categories: true,
    },
  });
}

/**
 * Gets a type by its ID.
 * @param typeId The ID of the type.
 * @returns A promise that resolves to the type.
 */
export async function getTypeById(typeId: string): Promise<Type | null> {
  return await prismadb.type.findUnique({
    where: { id: typeId },
  });
}

/**
 * Updates a type by its ID.
 * @param typeId The ID of the type.
 * @param data The data to be updated.
 * @returns A promise that resolves to the updated type.
 */
export async function updateTypeById(
  typeId: string,
  data: TypeBody,
): Promise<Type> {
  return await prismadb.type.update({
    where: { id: typeId },
    data,
  });
}

/**
 * Deletes a type by its ID.
 * @param typeId - The ID of the type to delete.
 * @returns A promise that resolves when the type is deleted.
 */
export async function deleteTypeById(typeId: string): Promise<void> {
  await prismadb.type.delete({
    where: { id: typeId },
  });
}
