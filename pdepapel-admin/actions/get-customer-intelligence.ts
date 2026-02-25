import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { subDays } from "date-fns";

export type CustomerSegment = "VIP" | "RECURRENT" | "OCCASIONAL" | "INACTIVE";

export interface CustomerProfile {
  name: string;
  email: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  totalProfitGenerated: number;
  averageTicket: number;
  daysSinceLastPurchase: number;
  segment: CustomerSegment;
}

/**
 * Builds customer intelligence profiles by grouping historical orders.
 */
export async function getCustomerIntelligence(
  storeId: string,
): Promise<CustomerProfile[]> {
  // Fetch all paid orders for the store
  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      status: {
        in: [OrderStatus.PAID, OrderStatus.SENT],
      },
      email: { not: "" }, // Ensure we have an email to group by
    },
    select: {
      email: true,
      fullName: true,
      phone: true,
      total: true,
      netProfit: true,
      paidAt: true,
      createdAt: true,
    } as any,
    orderBy: {
      createdAt: "desc",
    },
  });

  const customerMap = new Map<string, any>();

  const IGNORED_EMAILS = [
    "paufermr@gmail.com",
    "clientesvarios@gmail.com",
    "papeleria.pdepapel@gmail.com",
  ];

  for (const order of orders) {
    let email =
      typeof (order as any).email === "string"
        ? (order as any).email.toLowerCase().trim()
        : "";

    // Fix common customer autofill typos so they group correctly
    if (email.endsWith(".comufl")) {
      email = email.replace(".comufl", ".com");
    }

    if (!email || IGNORED_EMAILS.includes(email)) continue;

    const existing = customerMap.get(email) || {
      name: order.fullName,
      email: email,
      phone: order.phone,
      totalOrders: 0,
      totalSpent: 0,
      totalProfitGenerated: 0,
      lastPurchaseDate: (order as any).paidAt || order.createdAt,
    };

    existing.totalOrders += 1;
    existing.totalSpent += order.total || 0;
    existing.totalProfitGenerated += order.netProfit || 0;

    // Update last purchase date
    const orderDate = (order as any).paidAt || order.createdAt;
    if (orderDate > existing.lastPurchaseDate) {
      existing.lastPurchaseDate = orderDate;
      // Also grab most recent name/phone
      existing.name = order.fullName;
      existing.phone = order.phone;
    }

    customerMap.set(email, existing);
  }

  const profiles: CustomerProfile[] = Array.from(customerMap.values()).map(
    (c) => {
      const daysSinceLastPurchase = Math.floor(
        (new Date().getTime() - new Date(c.lastPurchaseDate).getTime()) /
          (1000 * 3600 * 24),
      );

      let segment: CustomerSegment = "OCCASIONAL";
      if (daysSinceLastPurchase > 90) {
        segment = "INACTIVE";
      } else if (c.totalOrders > 3) {
        // We will formally assign VIP by sorting later, this is a preliminary label
        segment = "VIP";
      } else if (c.totalOrders > 1) {
        segment = "RECURRENT";
      }

      return {
        name: c.name,
        email: c.email,
        phone: c.phone || null,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
        totalProfitGenerated: c.totalProfitGenerated,
        averageTicket: c.totalSpent / c.totalOrders,
        daysSinceLastPurchase,
        segment,
      };
    },
  );

  // Sort by total spent to assign true VIPs (top 10%)
  profiles.sort((a, b) => b.totalSpent - a.totalSpent);

  const vipCount = Math.max(1, Math.floor(profiles.length * 0.1)); // Top 10%

  for (let i = 0; i < profiles.length; i++) {
    if (profiles[i].segment !== "INACTIVE") {
      if (i < vipCount) {
        profiles[i].segment = "VIP";
      } else if (profiles[i].totalOrders > 1) {
        profiles[i].segment = "RECURRENT";
      } else {
        profiles[i].segment = "OCCASIONAL";
      }
    }
  }

  return profiles;
}

/**
 * Returns customers exactly 90 days inactive (or highly eligible) for automated reactivation.
 */
export async function getInactiveCustomersEligibleForReactivation(
  storeId: string,
  targetDaysInactive: number = 90,
): Promise<CustomerProfile[]> {
  const allCustomers = await getCustomerIntelligence(storeId);

  // Find customers inactive for exactly targetDaysInactive (+/- 2 days tolerance for cron drift)
  const minDays = targetDaysInactive - 2;
  const maxDays = targetDaysInactive + 2;

  return allCustomers.filter(
    (c) =>
      c.totalOrders > 0 &&
      c.daysSinceLastPurchase >= minDays &&
      c.daysSinceLastPurchase <= maxDays,
  );
}
