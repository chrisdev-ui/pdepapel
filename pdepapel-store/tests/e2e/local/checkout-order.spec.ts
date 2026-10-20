import { expect, Page, test } from "../helpers/safe-test";

import {
  fillContact,
  fillDeliveryWithoutCarrier,
  formButton,
  PRODUCT_ID,
  QUANTITY,
  startCheckout,
  UNIT_PRICE,
} from "./helpers/checkout";
import {
  deliverBoldWebhook,
  readOrderFromAdmin,
  readProductStock,
  SEEDED_STORE_ID,
} from "./helpers/local-environment";

/**
 * Aquí no se simula la creación del pedido: la tienda habla con una
 * administración local y escribe en `pdepapel_test`. Lo único que se bloquea es
 * el script de Bold, que vive en sus servidores y no es lo que se está
 * probando; el pago se resuelve entregando el webhook firmado.
 */


/** Deja el pedido creado y devuelve su id, leído de la URL del pedido. */
async function placeOnlineOrder(page: Page) {
  await startCheckout(page);
  await fillContact(page);
  await fillDeliveryWithoutCarrier(page);

  await page.getByText("Pago en línea", { exact: true }).click();
  await formButton(page, /Pagar \$/).click();

  await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 60_000 });
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  expect(orderId).toBeTruthy();
  return orderId;
}

test.describe("pedido real contra la administración local", () => {
  test("el pago aprobado deja el pedido pagado y descuenta el inventario", async ({
    page,
  }) => {
    const stockBefore = await readProductStock(SEEDED_STORE_ID, PRODUCT_ID);
    const orderId = await placeOnlineOrder(page);

    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(created.status).not.toBe("PAID");
    expect(created.paymentResult).toBe("pending");
    expect(Number(created.total)).toBe(UNIT_PRICE * QUANTITY);

    // Bold vuelve sin `?id`: con el pago aún sin confirmar la página espera
    // en un estado neutro y cambia sola cuando llega el webhook.
    await page.goto(
      `/pedido/${orderId}?bold-order-id=${encodeURIComponent(created.orderNumber || orderId)}&bold-tx-status=approved`,
    );
    await expect(page.getByTestId("payment-return-status")).toContainText(
      "Estamos confirmando tu pago",
    );

    const webhook = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "SALE_APPROVED",
      reference: created.orderNumber || orderId,
      total: Number(created.total),
    });
    expect(webhook.status).toBe(200);

    const paid = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).toBeTruthy();
    expect(paid.paymentResult).toBe("approved");

    // El aviso dura 2 s: se busca antes que el título, que se queda.
    await expect(
      page.getByRole("region", { name: /Notifications/ }).getByText("¡Gracias por tu compra!"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("¡Gracias por tu compra!");
    await expect(page.getByTestId("payment-return-status")).toHaveCount(0);

    const stockAfter = await readProductStock(SEEDED_STORE_ID, PRODUCT_ID);
    expect(stockAfter).toBe(stockBefore - QUANTITY);
  });

  test("el pago rechazado cancela el pedido y no lo marca pagado", async ({
    page,
  }) => {
    const orderId = await placeOnlineOrder(page);
    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);

    const webhook = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "SALE_REJECTED",
      reference: created.orderNumber || orderId,
      total: Number(created.total),
    });
    expect(webhook.status).toBe(200);

    const rejected = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(rejected.status).toBe("CANCELLED");
    expect(rejected.paidAt).toBeFalsy();
    expect(rejected.paymentResult).toBe("declined");

    await page.goto(
      `/pedido/${orderId}?bold-order-id=${encodeURIComponent(created.orderNumber || orderId)}&bold-tx-status=rejected`,
    );
    await expect(
      page.getByRole("region", { name: /Notifications/ }).getByText("¡Hubo un fallo en tu intento de pago!"),
    ).toBeVisible();
  });

  test("la anulación después del cobro también cancela el pedido", async ({
    page,
  }) => {
    const orderId = await placeOnlineOrder(page);
    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    const reference = created.orderNumber || orderId;
    const total = Number(created.total);

    expect(
      (
        await deliverBoldWebhook({
          storeId: SEEDED_STORE_ID,
          type: "SALE_APPROVED",
          reference,
          total,
        })
      ).status,
    ).toBe(200);
    expect((await readOrderFromAdmin(SEEDED_STORE_ID, orderId)).status).toBe(
      "PAID",
    );

    const voided = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "VOID_APPROVED",
      reference,
      total,
    });
    expect(voided.status).toBe(200);

    expect((await readOrderFromAdmin(SEEDED_STORE_ID, orderId)).status).toBe(
      "CANCELLED",
    );
  });

  test("una firma que no corresponde no mueve el pedido", async ({ page }) => {
    const orderId = await placeOnlineOrder(page);
    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);

    const forged = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "SALE_APPROVED",
      reference: created.orderNumber || orderId,
      total: Number(created.total),
      secretKey: "una-clave-que-no-es",
    });
    expect(forged.status).toBe(400);

    const untouched = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(untouched.status).toBe(created.status);
    expect(untouched.paidAt).toBeFalsy();
  });
});
