import { env } from "@/lib/env.mjs";
import { PayUFormProps } from "@/types";
import { useEffect } from "react";

type formattedProduct = {
  name: string;
  quantity: number;
};

export const PayUForm: React.FC<PayUFormProps> = (props) => {
  const {
    tax = 0,
    taxReturnBase = 0,
    currency = "COP",
    products,
    ...requiredProps
  } = props;

  const {
    formRef,
    referenceCode,
    amount,
    signature,
    test,
    responseUrl,
    confirmationUrl,
    shippingAddress,
    shippingCity,
    shippingCountry,
  } = requiredProps;

  useEffect(() => {
    const allPropsDefined = Object.values(requiredProps).every(
      (prop) => prop !== undefined,
    );

    if (allPropsDefined && formRef.current) {
      formRef.current.submit();
    }
  }, [formRef, requiredProps]);

  const getProductListString = (products: formattedProduct[]) => {
    return products
      .map((product) => `${product.quantity}x ${product.name}`)
      .join(", ");
  };
  const productListDescription = `¡Gracias por tu compra en Papelería P de Papel! Tus productos son: ${getProductListString(
    products,
  )}. ¡Estamos emocionados de que adquieras estos fantásticos productos! 😻 ❤️`;

  return (
    <form
      className="hidden"
      ref={formRef}
      method="POST"
      action={env.NEXT_PUBLIC_PAYU_URL}
    >
      <input
        type="hidden"
        name="merchantId"
        value={env.NEXT_PUBLIC_PAYU_MERCHANT_ID}
      />
      <input
        type="hidden"
        name="accountId"
        value={env.NEXT_PUBLIC_PAYU_ACCOUNT_ID}
      />
      <input type="hidden" name="description" value={productListDescription} />
      <input type="hidden" name="referenceCode" value={referenceCode} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="tax" value={tax} />
      <input type="hidden" name="taxReturnBase" value={taxReturnBase} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="signature" value={signature} />
      <input type="hidden" name="test" value={test} />
      <input type="hidden" name="responseUrl" value={responseUrl} />
      <input type="hidden" name="confirmationUrl" value={confirmationUrl} />
      <input type="hidden" name="shippingAddress" value={shippingAddress} />
      <input type="hidden" name="shippingCity" value={shippingCity} />
      <input type="hidden" name="shippingCountry" value={shippingCountry} />
    </form>
  );
};
