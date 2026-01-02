import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs";

export const getInventoryMovements = async (storeId: string) => {
  const movements = await prismadb.inventoryMovement.findMany({
    where: {
      storeId,
    },
    include: {
      product: {
        select: {
          name: true,
          sku: true,
          images: true,
        },
      },
      store: false, // No need to fetch store details
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1000,
  });

  // 1. Extract unique user IDs to avoid N+1 and avoid fetching ALL users
  const uniqueUserIds = new Set<string>();
  movements.forEach((item) => {
    if (item.createdBy && !item.createdBy.startsWith("SYSTEM")) {
      uniqueUserIds.add(item.createdBy.replace("USER_", ""));
    }
  });

  // 2. Fetch user details in parallel
  const usersMap = new Map<string, any>();
  if (uniqueUserIds.size > 0) {
    await Promise.all(
      Array.from(uniqueUserIds).map(async (userId) => {
        try {
          const user = await clerkClient.users.getUser(userId);
          usersMap.set(userId, user);
        } catch (error) {
          console.error(`Failed to fetch user ${userId}`, error);
        }
      }),
    );
  }

  // 3. Fetch Order details for movements linked to orders (ORDER_PLACED, ORDER_CANCELLED)
  // This allows us to show the real customer name (including Guests) instead of "System" or Admin.
  const orderIds = new Set<string>();
  movements.forEach((item) => {
    if (
      (item.type === "ORDER_PLACED" || item.type === "ORDER_CANCELLED") &&
      item.referenceId
    ) {
      orderIds.add(item.referenceId);
    }
  });

  const ordersMap = new Map<string, any>();
  if (orderIds.size > 0) {
    const orders = await prismadb.order.findMany({
      where: {
        id: {
          in: Array.from(orderIds),
        },
      },
      select: {
        id: true,
        fullName: true,
        userId: true,
        email: true,
        guestId: true,
      },
    });
    orders.forEach((order) => ordersMap.set(order.id, order));
  }

  const store = await prismadb.store.findUnique({
    where: {
      id: storeId,
    },
  });

  const formattedMovements = movements.map((item) => {
    let userName = "Sistema";
    let userImage = "";
    let isOwner = false;

    // Check if this movement is linked to an order first (Priority Display)
    const linkedOrder = item.referenceId
      ? ordersMap.get(item.referenceId)
      : null;

    if (linkedOrder) {
      // Use the name from the order (Guest or registered)
      if (linkedOrder.fullName) {
        userName = linkedOrder.fullName;
        if (!linkedOrder.userId) {
          userName += " (Invitado)";
        }
      } else {
        userName = linkedOrder.email || "Cliente";
      }

      // Attempt to resolve user image if the movement was created by a registered user
      if (item.createdBy && !item.createdBy.startsWith("SYSTEM")) {
        const userId = item.createdBy.replace("USER_", "");
        const user = usersMap.get(userId);
        if (user && user.hasImage) {
          userImage = user.imageUrl;
        }
      }
    } else if (item.createdBy && !item.createdBy.startsWith("SYSTEM")) {
      const userId = item.createdBy.replace("USER_", "");
      const user = usersMap.get(userId);

      if (store && store.userId === userId) {
        isOwner = true;
      }

      if (user) {
        userName =
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          user.username ||
          "Usuario";
        userImage = user.hasImage ? user.imageUrl : "";
      } else {
        userName = "Usuario desconocido";
      }
    } else if (item.createdBy?.startsWith("SYSTEM")) {
      const systemMap: Record<string, string> = {
        SYSTEM_PAYU: "PayU",
        SYSTEM_WOMPI: "Wompi",
        SYSTEM: "Sistema",
        SYSTEM_MIGRATION_SCRIPT: "Migración",
      };
      userName = systemMap[item.createdBy] || item.createdBy;

      if (item.createdBy === "SYSTEM_MIGRATION_SCRIPT") {
        userImage = "BOT";
      }
    }

    return {
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productSku: item.product.sku,
      type: item.type,
      quantity: item.quantity,
      reason: item.reason || "",
      description: item.description || "",
      createdAt: item.createdAt,
      userName,
      userImage,
      isOwner,
      previousStock: item.previousStock,
      newStock: item.newStock,
      cost: item.cost ? item.cost : 0,
      price: item.price ? item.price : 0,
    };
  });

  return formattedMovements;
};
