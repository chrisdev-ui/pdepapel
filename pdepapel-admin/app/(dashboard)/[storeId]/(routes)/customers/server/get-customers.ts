"use server";

import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { headers } from "next/headers";

export async function getCustomers(storeId: string) {
  headers();

  try {
    // First, get all unique customers by phone + fullName combination
    // Don't group by email since it can be null/empty
    const customers = await prismadb.order.groupBy({
      by: ["phone", "fullName"],
      where: {
        storeId,
        phone: {
          not: null,
          not: "",
        },
        fullName: {
          not: null,
          not: "",
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        total: true,
      },
      _max: {
        createdAt: true,
      },
      _min: {
        createdAt: true,
      },
    });

    // Get detailed customer data with order statistics
    const customerData = await Promise.all(
      customers.map(async (customer) => {
        // Get all orders for this customer (by phone + fullName)
        const orders = await prismadb.order.findMany({
          where: {
            storeId,
            phone: customer.phone,
            fullName: customer.fullName,
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            email: true, // Include email to get the most recent one
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

        // Get the most recent email from orders (if any)
        const mostRecentEmail = orders.find(
          (order) => order.email && order.email.trim() !== "",
        )?.email;

        const paidOrders = orders.filter(
          (order) => order.status === OrderStatus.PAID,
        );
        const pendingOrders = orders.filter(
          (order) => order.status === OrderStatus.PENDING,
        );
        const cancelledOrders = orders.filter(
          (order) => order.status === OrderStatus.CANCELLED,
        );

        const totalSpent = paidOrders.reduce(
          (sum, order) => sum + order.total,
          0,
        );
        const averageOrderValue =
          paidOrders.length > 0 ? totalSpent / paidOrders.length : 0;

        const totalItems = orders.reduce((sum, order) => {
          return (
            sum +
            order.orderItems.reduce(
              (itemSum, item) => itemSum + item.quantity,
              0,
            )
          );
        }, 0);

        // Get most purchased products
        const productCounts: {
          [key: string]: { count: number; name: string; totalSpent: number };
        } = {};

        orders.forEach((order) => {
          order.orderItems.forEach((item) => {
            const productName = item.product.name;
            if (!productCounts[productName]) {
              productCounts[productName] = {
                count: 0,
                name: productName,
                totalSpent: 0,
              };
            }
            productCounts[productName].count += item.quantity;
            if (order.status === OrderStatus.PAID) {
              productCounts[productName].totalSpent +=
                item.product.price * item.quantity;
            }
          });
        });

        const favoriteProducts = Object.values(productCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        return {
          phone: customer.phone || "",
          fullName: customer.fullName || "",
          email: mostRecentEmail || "Sin email",
          totalOrders: customer._count.id,
          paidOrders: paidOrders.length,
          pendingOrders: pendingOrders.length,
          cancelledOrders: cancelledOrders.length,
          totalSpent,
          averageOrderValue,
          totalItems,
          firstOrderDate: customer._min.createdAt,
          lastOrderDate: customer._max.createdAt,
          favoriteProducts,
          recentOrders: orders.slice(0, 5),
        };
      }),
    );

    return customerData.sort((a, b) => b.totalSpent - a.totalSpent);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return [];
  }
}

export type CustomerData = Awaited<ReturnType<typeof getCustomers>>[0];
