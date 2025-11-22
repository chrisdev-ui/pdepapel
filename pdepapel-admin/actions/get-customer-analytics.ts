"use server";

import { EMPLOYEE_NAMES, EMPLOYEE_PHONES } from "@/constants";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";

export async function getCustomerAnalytics(storeId: string) {
  try {
    const now = getColombiaDate();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfSixMonths = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get customer aggregations with order totals
    const customerData = await prismadb.order.groupBy({
      by: ["fullName", "phone"],
      where: {
        storeId,
        status: "PAID",
        fullName: {
          not: "",
        },
        phone: {
          not: "",
          notIn: EMPLOYEE_PHONES,
        },
        NOT: {
          OR: EMPLOYEE_NAMES.map((name) => ({ fullName: name })),
        },
      },
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
      _min: {
        createdAt: true,
      },
      _max: {
        createdAt: true,
      },
    });

    // Calculate analytics
    const totalCustomers = customerData.length;

    // New customers this month (first order this month)
    const newCustomersThisMonth = customerData.filter(
      (customer) =>
        customer._min.createdAt && customer._min.createdAt >= startOfMonth,
    ).length;

    // Returning customers (more than 1 order)
    const returningCustomers = customerData.filter(
      (customer) => customer._count.id > 1,
    ).length;

    // Customer retention rate
    const customerRetentionRate =
      totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0;

    // Average lifetime value
    const totalLifetimeValue = customerData.reduce(
      (sum, customer) => sum + (customer._sum.total || 0),
      0,
    );
    const averageLifetimeValue =
      totalCustomers > 0 ? totalLifetimeValue / totalCustomers : 0;

    // Get most valuable customers for different periods
    const getMostValuableCustomer = (startDate?: Date) => {
      let filteredData = customerData;

      if (startDate) {
        filteredData = customerData.filter((customer) => {
          // Filter orders that have any order within the period
          return (
            customer._max.createdAt && customer._max.createdAt >= startDate
          );
        });
      }

      if (filteredData.length === 0) return null;

      // For period-specific calculations, we need to recalculate with period-filtered orders
      if (startDate) {
        // This is a simplified approach. For more accuracy, we'd need to query orders within the period
        const topCustomer = filteredData.reduce((prev, current) =>
          (current._sum.total || 0) > (prev._sum.total || 0) ? current : prev,
        );

        return {
          name: topCustomer.fullName,
          totalSpent: topCustomer._sum.total || 0,
          orders: topCustomer._count.id,
        };
      } else {
        // All time
        const topCustomer = filteredData.reduce((prev, current) =>
          (current._sum.total || 0) > (prev._sum.total || 0) ? current : prev,
        );

        return {
          name: topCustomer.fullName,
          totalSpent: topCustomer._sum.total || 0,
          orders: topCustomer._count.id,
        };
      }
    };

    // Get detailed most valuable customers for each period
    const getMostValuableCustomerDetailed = async (startDate?: Date) => {
      const whereCondition: any = {
        storeId,
        status: "PAID",
        fullName: { not: "" },
        phone: { not: "", notIn: EMPLOYEE_PHONES },
        NOT: {
          OR: EMPLOYEE_NAMES.map((name) => ({ fullName: name })),
        },
      };

      if (startDate) {
        whereCondition.createdAt = { gte: startDate };
      }

      const periodData = await prismadb.order.groupBy({
        by: ["fullName", "phone"],
        where: whereCondition,
        _sum: { total: true },
        _count: { id: true },
        orderBy: {
          _sum: {
            total: "desc",
          },
        },
        take: 1,
      });

      if (periodData.length === 0) return null;

      const topCustomer = periodData[0];
      return {
        name: topCustomer.fullName,
        totalSpent: topCustomer._sum.total || 0,
        orders: topCustomer._count.id,
      };
    };

    const [monthTop, sixMonthsTop, yearTop, allTimeTop] = await Promise.all([
      getMostValuableCustomerDetailed(startOfMonth),
      getMostValuableCustomerDetailed(startOfSixMonths),
      getMostValuableCustomerDetailed(startOfYear),
      getMostValuableCustomerDetailed(),
    ]);

    return {
      totalCustomers,
      newCustomersThisMonth,
      returningCustomers,
      customerRetentionRate,
      averageLifetimeValue,
      mostValuableCustomers: {
        month: monthTop,
        sixMonths: sixMonthsTop,
        year: yearTop,
        allTime: allTimeTop,
      },
    };
  } catch (error) {
    console.error("Error fetching customer analytics:", error);
    return {
      totalCustomers: 0,
      newCustomersThisMonth: 0,
      returningCustomers: 0,
      customerRetentionRate: 0,
      averageLifetimeValue: 0,
      mostValuableCustomers: {
        month: null,
        sixMonths: null,
        year: null,
        allTime: null,
      },
    };
  }
}
