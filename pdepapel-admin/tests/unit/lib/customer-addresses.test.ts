import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_CUSTOMER_ADDRESSES,
  saveCustomerAddressFromCheckout,
} from "@/lib/customer-addresses";

const mocks = {
  count: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
};

const database = {
  customerAddress: {
    count: mocks.count,
    create: mocks.create,
    findFirst: mocks.findFirst,
    update: mocks.update,
  },
} as never;

const baseAddress = {
  storeId: "store-id",
  userId: "customer-id",
  label: "Casa",
  fullName: "Ana Gómez",
  phone: "3001234567",
  documentId: "123456",
  address: "Calle 10 # 20-30",
  city: "Medellín",
  department: "Antioquia",
  daneCode: "05001000",
};

describe("customer address book", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "address-id" });
    mocks.findFirst.mockResolvedValue(null);
    mocks.update.mockResolvedValue({ id: "address-id" });
  });

  it("creates the first explicit checkout address as the default", async () => {
    await saveCustomerAddressFromCheckout(database, baseAddress);

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-id",
        userId: "customer-id",
        label: "Casa",
        isDefault: true,
        fullName: "Ana Gómez",
        address: "Calle 10 # 20-30",
      }),
    });
  });

  it("updates only an address that belongs to the same account and store", async () => {
    mocks.findFirst.mockResolvedValue({ id: "address-id" });

    await saveCustomerAddressFromCheckout(database, {
      ...baseAddress,
      savedAddressId: "address-id",
      address: "Carrera 50 # 10-20",
    });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "address-id",
        storeId: "store-id",
        userId: "customer-id",
      },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "address-id" },
        data: expect.objectContaining({ address: "Carrera 50 # 10-20" }),
      }),
    );
  });

  it("rejects a new address once the account reaches the safe limit", async () => {
    mocks.count.mockResolvedValue(MAX_CUSTOMER_ADDRESSES);

    await expect(
      saveCustomerAddressFromCheckout(database, baseAddress),
    ).rejects.toThrow("Puedes guardar hasta");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
