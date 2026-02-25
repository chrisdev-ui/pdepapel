import prismadb from "@/lib/prismadb";
import { getInactiveCustomersEligibleForReactivation } from "@/actions/get-customer-intelligence";
import { DiscountType, ReactivationStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { Resend } from "resend";
import { ReactivationEmailTemplate } from "@/emails/reactivation-email";
import { render } from "@react-email/render";
import { env } from "@/lib/env.mjs";
import { currencyFormatter } from "@/lib/utils";

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Core engine for automated customer reactivation.
 * Should be triggered daily by a cron job (e.g. GitHub Actions).
 */
export async function processAutomaticReactivations(storeId: string) {
  console.log(
    `[REACTIVATION] Starting automatic reactivation for store ${storeId}`,
  );

  // 1. Find eligible customers (exactly 90 days inactive)
  const eligibleCustomers = await getInactiveCustomersEligibleForReactivation(
    storeId,
    90,
  );
  console.log(
    `[REACTIVATION] Found ${eligibleCustomers.length} eligible customers`,
  );

  if (eligibleCustomers.length === 0) {
    return {
      success: true,
      processed: 0,
      message: "No eligible customers found today",
    };
  }

  const store = await prismadb.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error("Store not found");

  let processedCount = 0;
  const errors = [];

  for (const customer of eligibleCustomers) {
    try {
      // 2. Prevent duplicate sending: check if we already sent a reactivation recently
      const existingMails = await prismadb.customerReactivation.count({
        where: {
          storeId,
          customerEmail: customer.email,
          createdAt: {
            // Prevent sending more than once every 60 days to the same person
            gte: addDays(new Date(), -60),
          },
        },
      });

      if (existingMails > 0) {
        console.log(
          `[REACTIVATION] Skipping ${customer.email} - already contacted recently.`,
        );
        continue;
      }

      // 3. Find Product Recommendations
      // Look up their last order to see what categories they bought
      const lastOrder = await prismadb.order.findFirst({
        where: { storeId, email: customer.email },
        orderBy: { createdAt: "desc" },
        include: {
          orderItems: {
            include: { product: true },
          },
        },
      });

      const categoryIds = new Set<string>();
      if (lastOrder && lastOrder.orderItems) {
        for (const item of lastOrder.orderItems) {
          if (item.product?.categoryId) {
            categoryIds.add(item.product.categoryId);
          }
        }
      }

      // Query 4 active, in-stock products matching their previous categories
      // If no categories, just get general top products
      let recommendedProductsQuery = await prismadb.product.findMany({
        where: {
          storeId,
          isArchived: false,
          stock: { gt: 0 },
          ...(categoryIds.size > 0
            ? { categoryId: { in: Array.from(categoryIds) } }
            : {}),
        },
        take: 4,
        orderBy: { createdAt: "desc" },
        include: { images: true },
      });

      // Fallback if they didn't have 4 matching products
      if (recommendedProductsQuery.length < 4) {
        const fillers = await prismadb.product.findMany({
          where: {
            storeId,
            isArchived: false,
            stock: { gt: 0 },
            id: { notIn: recommendedProductsQuery.map((p) => p.id) },
          },
          take: 4 - recommendedProductsQuery.length,
          orderBy: { createdAt: "desc" },
          include: { images: true },
        });
        recommendedProductsQuery = [...recommendedProductsQuery, ...fillers];
      }

      const recommendedProducts = recommendedProductsQuery.map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.images?.[0]?.url || "",
        priceFormatted: currencyFormatter(p.price),
      }));

      // 4. Generate Unique Coupon code (10% off, 7 days valid, 1 use)
      const shortUuid = crypto.randomBytes(3).toString("hex").toUpperCase();
      const code = `VUELVE-${shortUuid}`;

      await prismadb.coupon.create({
        data: {
          storeId,
          code,
          type: DiscountType.PERCENTAGE,
          amount: 10,
          startDate: new Date(),
          endDate: addDays(new Date(), 7),
          maxUses: 1,
          minOrderValue: 0,
        },
      });

      // 5. Render HTML Email
      const htmlContent = await render(
        ReactivationEmailTemplate({
          customerName: customer.name || "Cliente Ideal",
          storeName: store.name,
          discountCode: code,
          discountPercentage: 10,
          recommendedProducts,
          storeUrl: `https://${store.name.toLowerCase().replace(/\\s/g, "")}.com`, // Should use real store URL, this is fallback
        }),
      );

      // 6. Send Email via Resend
      const response = await resend.emails.send({
        from: `Novedades ${store.name} <hola@novedades.pdepapel.com>`, // Replace domain when ready
        to: customer.email,
        subject: `¡Te extrañamos, ${customer.name.split(" ")[0]}! Tienes un regalo 🎁`,
        html: htmlContent,
      });

      if (response.error) {
        throw new Error(`Resend API Error: ${response.error.message}`);
      }

      // 7. Log Reactivation action in DB
      await prismadb.customerReactivation.create({
        data: {
          storeId,
          customerEmail: customer.email,
          customerName: customer.name,
          status: ReactivationStatus.SENT,
          lastOrderDate: lastOrder ? (lastOrder as any).createdAt : new Date(),
          totalSpent: customer.totalSpent,
          orderCount: customer.totalOrders,
          daysSinceLastPurchase: customer.daysSinceLastPurchase,
        },
      });

      processedCount++;
      console.log(
        `[REACTIVATION] Successfully sent to ${customer.email} (Coupon: ${code})`,
      );
    } catch (err: any) {
      console.error(
        `[REACTIVATION] Failed to process customer ${customer.email}:`,
        err,
      );
      errors.push({ email: customer.email, error: err.message });

      // Still log the failure
      await prismadb.customerReactivation.create({
        data: {
          storeId,
          customerEmail: customer.email,
          customerName: customer.name,
          status: ReactivationStatus.FAILED,
          lastOrderDate: new Date(), // fallback
          totalSpent: customer.totalSpent,
          orderCount: customer.totalOrders,
          daysSinceLastPurchase: customer.daysSinceLastPurchase,
          errorMessage: err.message || "Unknown error occurred",
        },
      });
    }
  }

  console.log(
    `[REACTIVATION] Job completed. Processed: ${processedCount}, Errors: ${errors.length}`,
  );

  return {
    success: true,
    processed: processedCount,
    errors,
  };
}
