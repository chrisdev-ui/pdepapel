import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs";
import { normalizePhone } from "@/lib/utils";
import parsePhoneNumber from "libphonenumber-js";

export interface AvailableCustomer {
  value: string;
  label: string;
  email?: string;
  phone?: string;
  image?: string;
  documentId?: string;
  source: "clerk" | "order";
}

export const getAvailableCustomers = async (
  storeId: string,
): Promise<AvailableCustomer[]> => {
  // 1. Fetch Clerk Users - DISABLED (Focus on Orders)
  const registeredCustomers: AvailableCustomer[] = [];

  // 2. Fetch Distinct Past Customers from Orders
  const distinctOrders = await prismadb.order.findMany({
    where: {
      storeId,
      OR: [{ email: { not: "" } }, { phone: { not: "" } }],
    },
    select: {
      userId: true,
      fullName: true,
      email: true,
      phone: true,
      documentId: true, // ⭐ Fetch documentId
    },
    // We fetch all relevant orders to handle deduplication in memory for better control
    // taking the most recent info for each user/phone
    orderBy: {
      createdAt: "desc",
    },
  });

  // 3. Merge and Deduplicate
  // SMART MERGE STRATEGY
  // We use a Map to ensure unique Phone identities while accumulating the best data.
  // CRITICAL: We IGNORE order.userId because many orders are created by Admin and share the same ID.
  // Identity is now purely Phone (or Email) based.
  const customerMap = new Map<string, AvailableCustomer>();

  const addToMap = (customer: AvailableCustomer) => {
    // Normalize phone E.164
    const phone = normalizePhone(customer.phone);
    // Key is ALWAYS based on contact info, never userId
    const key = phone ? `guest_${phone}` : `guest_${customer.email}`;

    // Force the value to match the key (overriding any shared userId)
    customer.value = key;
    customer.source = "order";

    const existing = customerMap.get(key);

    if (!existing) {
      if (key !== "guest_undefined") {
        // Safety check
        customerMap.set(key, customer);
      }
      return;
    }

    // Merge Logic (Simple: Richer data wins)
    if (!existing.email && customer.email) existing.email = customer.email;
    if (!existing.documentId && customer.documentId)
      existing.documentId = customer.documentId;

    // Update label if existing is generic "Cliente" but new one has name
    if (
      (!existing.label || existing.label === "Cliente") &&
      customer.label &&
      customer.label !== "Cliente"
    ) {
      existing.label = customer.label;
    }
  };

  // Process Orders
  distinctOrders.forEach((order) => {
    const phoneNumber = order.phone ? parsePhoneNumber(order.phone) : undefined;

    addToMap({
      value: "", // Will be set in addToMap
      label: `${order.fullName || "Cliente"} ${phoneNumber ? `(${phoneNumber.formatNational()})` : `(${order.phone || order.email})`}`,
      email: order.email || undefined,
      phone: order.phone || undefined,
      documentId: order.documentId || undefined,
      source: "order",
    });
  });

  // A. Process Registered Users
  registeredCustomers.forEach(addToMap);

  // B. Process Orders
  // (Old loop removed)

  return Array.from(customerMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
};
