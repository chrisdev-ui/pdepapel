import { ErrorFactory } from "@/lib/api-errors";
import { Prisma } from "@prisma/client";

export const MAX_CUSTOMER_ADDRESSES = 10;

type CustomerAddressDatabase = Pick<
  Prisma.TransactionClient,
  "customerAddress"
>;

export type CustomerAddressInput = {
  storeId: string;
  userId: string;
  savedAddressId?: string | null;
  label?: string | null;
  fullName: string;
  phone: string;
  documentId?: string | null;
  address: string;
  address2?: string | null;
  city?: string | null;
  department?: string | null;
  daneCode?: string | null;
  neighborhood?: string | null;
  addressReference?: string | null;
  company?: string | null;
};

const normalizeOptionalValue = (value?: string | null) => value?.trim() || null;

const normalizeLabel = (label?: string | null) =>
  label?.trim().slice(0, 60) || "Dirección guardada";

export async function saveCustomerAddressFromCheckout(
  database: CustomerAddressDatabase,
  input: CustomerAddressInput,
) {
  const addressData = {
    label: normalizeLabel(input.label),
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    documentId: normalizeOptionalValue(input.documentId),
    address: input.address.trim(),
    address2: normalizeOptionalValue(input.address2),
    city: normalizeOptionalValue(input.city),
    department: normalizeOptionalValue(input.department),
    daneCode: normalizeOptionalValue(input.daneCode),
    neighborhood: normalizeOptionalValue(input.neighborhood),
    addressReference: normalizeOptionalValue(input.addressReference),
    company: normalizeOptionalValue(input.company),
    lastUsedAt: new Date(),
  };

  if (input.savedAddressId) {
    const existingAddress = await database.customerAddress.findFirst({
      where: {
        id: input.savedAddressId,
        storeId: input.storeId,
        userId: input.userId,
      },
      select: { id: true },
    });

    if (!existingAddress) {
      throw ErrorFactory.NotFound("La dirección guardada no existe");
    }

    return database.customerAddress.update({
      where: { id: existingAddress.id },
      data: addressData,
    });
  }

  const addressCount = await database.customerAddress.count({
    where: { storeId: input.storeId, userId: input.userId },
  });

  if (addressCount >= MAX_CUSTOMER_ADDRESSES) {
    throw ErrorFactory.Conflict(
      `Puedes guardar hasta ${MAX_CUSTOMER_ADDRESSES} direcciones. Elimina una antes de guardar otra.`,
    );
  }

  return database.customerAddress.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      isDefault: addressCount === 0,
      ...addressData,
    },
  });
}
