import { UnifiedOrder } from "@/types/unified-order";

export const normalizeOrder = (jsonData: any): UnifiedOrder => {
  const normalizedItems = (jsonData.items || jsonData.orderItems || []).map(
    (item: any) => {
      // Case 1: Real Product (has nested 'product' object)
      if (item.product) {
        return {
          id: item.id,
          productId: item.product.id,
          name: item.product.name || item.name,
          description: item.product.description,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice || item.product.price || 0),
          imageUrl:
            item.product.images?.find((img: any) => img.isMain)?.url ||
            item.product.images?.[0]?.url,
          isExternal: false,
          size: item.product.size?.name,
          color: item.product.color?.name,
          design: item.product.design?.name,
        };
      }

      // Case 2: Manual/Flat Item
      return {
        id: item.id,
        productId: item.productId,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice || item.price || 0),
        imageUrl: item.imageUrl,
        isExternal: true,
        size: item.size,
        color: item.color,
        design: item.design,
      };
    },
  );

  return {
    ...jsonData,
    items: normalizedItems,
    customerName: jsonData.customerName || jsonData.fullName,
    customerPhone: jsonData.customerPhone || jsonData.phone,
    shippingCost:
      jsonData.shipping?.cost !== undefined && jsonData.shipping?.cost !== null
        ? Number(jsonData.shipping.cost)
        : jsonData.shippingCost !== undefined && jsonData.shippingCost !== null
        ? Number(jsonData.shippingCost)
        : jsonData.shipping_cost !== undefined &&
          jsonData.shipping_cost !== null
        ? Number(jsonData.shipping_cost)
        : undefined,
    shipping: jsonData.shipping
      ? {
          id: jsonData.shipping.id,
          envioClickIdRate: jsonData.shipping.envioClickIdRate,
          carrierName: jsonData.shipping.carrierName,
          cost: jsonData.shipping.cost,
          status: jsonData.shipping.status,
          provider: jsonData.shipping.provider,
        }
      : undefined,
  };
};
