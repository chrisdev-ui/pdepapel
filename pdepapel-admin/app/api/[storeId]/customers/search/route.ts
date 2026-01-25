import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { AvailableCustomer } from "@/app/(dashboard)/[storeId]/(routes)/orders/[orderId]/server/get-available-customers";
import parsePhoneNumber from "libphonenumber-js";
import { normalizePhone } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    let results: AvailableCustomer[] = [];

    if (!query) {
      // 🟢 MODE 1: RECENT CUSTOMERS (Infinite Scroll Default)
      const orders = await prismadb.order.findMany({
        where: {
          storeId: params.storeId,
          OR: [{ email: { not: "" } }, { phone: { not: "" } }],
        },
        select: {
          userId: true,
          fullName: true,
          email: true,
          phone: true,
          documentId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        distinct: ["email", "phone"],
        take: limit,
        skip: skip,
      });

      // Map to AvailableCustomer
      results = orders.map((order) => {
        const phone = normalizePhone(order.phone);
        const phoneNumber = order.phone
          ? parsePhoneNumber(order.phone, "CO")
          : undefined;
        const key = phone ? `guest_${phone}` : `guest_${order.email}`;

        return {
          value: key,
          label: `${order.fullName || "Cliente"} ${phoneNumber ? `(${phoneNumber.formatNational()})` : `(${order.phone || order.email})`}`,
          email: order.email || undefined,
          phone: order.phone || undefined,
          documentId: order.documentId || undefined,
          source: "order",
        };
      });
    } else {
      // 🔵 MODE 2: SEARCH (Clerk + Prisma)

      // 1. Clerk Search - ENABLED
      let registered: AvailableCustomer[] = [];
      try {
        const clerkUsers = await clerkClient.users.getUserList({
          query,
          limit: 10,
        });

        registered = clerkUsers.map((u) => {
          const phone = u.phoneNumbers[0]?.phoneNumber;
          const email = u.emailAddresses[0]?.emailAddress;
          return {
            value: `clerk_${u.id}`,
            label: `${u.firstName} ${u.lastName}`.trim() || email || "Usuario",
            email: email,
            phone: phone,
            image: u.imageUrl,
            source: "clerk",
          };
        });
      } catch (err) {
        console.error("Clerk Search Error", err);
      }

      // 2. Orders Search (All Orders, ignoring userId)
      const guestOrders = await prismadb.order.findMany({
        where: {
          storeId: params.storeId,
          // Removed userId: null restriction to include Admin-created orders
          OR: [
            { fullName: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
          ],
        },
        select: {
          fullName: true,
          email: true,
          phone: true,
          documentId: true,
        },
        distinct: ["email", "phone"],
        take: limit,
        orderBy: { createdAt: "desc" },
      });

      const guests = guestOrders.map((order) => {
        const phoneNumber = order.phone
          ? parsePhoneNumber(order.phone)
          : undefined;
        return {
          value: `guest_${order.phone || order.email}`,
          label: `${order.fullName || "Cliente"} ${phoneNumber ? `(${phoneNumber.formatNational()})` : `(${order.phone || order.email})`}`,
          email: order.email || undefined,
          phone: order.phone || undefined,
          documentId: order.documentId || undefined,
          source: "order" as const,
        };
      });

      // Merge: Registered First, then Guests
      // SMART MERGE STRATEGY (Search API)
      const customerMap = new Map<string, AvailableCustomer>();

      const addToMap = (customer: AvailableCustomer) => {
        const phone = normalizePhone(customer.phone);
        const key = phone || customer.value;

        const existing = customerMap.get(key);

        if (!existing) {
          customerMap.set(key, customer);
          return;
        }

        if (existing.source === "order" && customer.source === "clerk") {
          customerMap.set(key, customer);
          return;
        }
        if (existing.source === "clerk" && customer.source === "order") {
          if (!existing.email && customer.email)
            existing.email = customer.email;
          if (!existing.phone && customer.phone)
            existing.phone = customer.phone;
          return;
        }
        // Guest vs Guest
        if (!existing.email && customer.email) existing.email = customer.email;
        if (!existing.documentId && customer.documentId)
          existing.documentId = customer.documentId;
        if (
          (!existing.label || existing.label === "Cliente") &&
          customer.label &&
          customer.label !== "Cliente"
        ) {
          existing.label = customer.label;
        }
      };

      registered.forEach(addToMap);
      guests.forEach(addToMap);

      results = Array.from(customerMap.values());

      // Pagination handling for "Search" is tricky with merge.
      // For now, we return 'limit' items. If they want page 2, we *could* try to offset?
      // But mixing offsets is hard. Let's assume search returns Top (limit * 2) roughly.
    }

    return NextResponse.json(results);
  } catch (error) {
    console.log("[CUSTOMERS_SEARCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
