"use server";

import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { headers } from "next/headers";

export async function getCustomers(storeId: string) {
  headers();

  try {
    // Get customers with a single optimized query
    const orders = await prismadb.order.findMany({
      where: {
        storeId,
        phone: {
          not: "",
        },
        fullName: {
          not: "",
        },
      },
      select: {
        id: true,
        phone: true,
        fullName: true,
        email: true,
        status: true,
        total: true,
        createdAt: true,
        orderItems: {
          select: {
            quantity: true,
            product: {
              select: {
                name: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Group customers in memory (faster than DB groupBy)
    const customerMap = new Map<string, any>();

    orders.forEach((order) => {
      const customerKey = `${order.phone}_${order.fullName}`;

      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          phone: order.phone,
          fullName: order.fullName,
          email: order.email || "Sin email",
          orders: [],
          totalSpent: 0,
          totalOrders: 0,
          paidOrders: 0,
          pendingOrders: 0,
          cancelledOrders: 0,
          firstOrderDate: order.createdAt,
          lastOrderDate: order.createdAt,
        });
      }

      const customer = customerMap.get(customerKey);
      customer.orders.push(order);
      customer.totalOrders++;

      // Update email if current order has one and stored customer doesn't
      if (order.email && order.email.trim() && customer.email === "Sin email") {
        customer.email = order.email.trim();
      }

      // Update dates
      if (order.createdAt < customer.firstOrderDate) {
        customer.firstOrderDate = order.createdAt;
      }
      if (order.createdAt > customer.lastOrderDate) {
        customer.lastOrderDate = order.createdAt;
      }

      // Count by status
      switch (order.status) {
        case OrderStatus.PAID:
          customer.paidOrders++;
          customer.totalSpent += order.total;
          break;
        case OrderStatus.PENDING:
          customer.pendingOrders++;
          break;
        case OrderStatus.CANCELLED:
          customer.cancelledOrders++;
          break;
      }
    });

    // Convert to array and calculate additional metrics
    const customerData = Array.from(customerMap.values()).map((customer) => {
      const averageOrderValue =
        customer.paidOrders > 0 ? customer.totalSpent / customer.paidOrders : 0;

      const totalItems = customer.orders.reduce((sum: number, order: any) => {
        return (
          sum +
          order.orderItems.reduce(
            (itemSum: number, item: any) => itemSum + item.quantity,
            0,
          )
        );
      }, 0);

      // Get favorite products
      const productCounts: { [key: string]: { count: number; name: string } } =
        {};

      customer.orders.forEach((order: any) => {
        order.orderItems.forEach((item: any) => {
          const productName = item.product.name;
          if (!productCounts[productName]) {
            productCounts[productName] = { count: 0, name: productName };
          }
          productCounts[productName].count += item.quantity;
        });
      });

      const favoriteProducts = Object.values(productCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        ...customer,
        averageOrderValue,
        totalItems,
        favoriteProducts,
        recentOrders: customer.orders.slice(0, 5),
      };
    });

    // Sort by total spent and return
    return customerData.sort((a, b) => b.totalSpent - a.totalSpent);
  } catch (error) {
    console.error("Error fetching customers:", error);
    // Ensure we close any connections
    await prismadb.$disconnect();
    return [];
  } finally {
    // Always disconnect in serverless
    await prismadb.$disconnect();
  }
}

export type CustomerData = Awaited<ReturnType<typeof getCustomers>>[0];
