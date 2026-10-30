import { currencyFormatter } from "@/lib/utils";

/**
 * Lo que la clienta lee en `/pedido` para abonar o pagar el saldo de una
 * preventa. Todo junto para revisarlo de un vistazo; el lenguaje de pago es
 * neutro («pago en línea»), nunca el nombre de la pasarela.
 */

const money = (value: number) => currencyFormatter.format(value);

export const PREORDER_PAY_COPY = {
  installmentTitle: "Abonar a tu preventa",
  installmentHelp: (min: number, max: number) =>
    min === max ? `Te falta ${money(max)}: puedes pagarlo ya.` : `Abona lo que quieras desde ${money(min)} hasta ${money(max)}. El envío se paga con el saldo, cuando llegue.`,
  installmentLabel: "¿Cuánto quieres abonar?",
  balanceTitle: "Ya llegó tu producto: paga tu saldo",
  balanceHelp: (amount: number) => `Tu saldo es ${money(amount)}: lo que falta del producto más el envío. Cuando lo pagues, preparamos tu envío.`,
  waitingForShipping: "¡Ya llegó tu producto! Estamos cotizando tu envío y te escribimos con el saldo para que lo pagues aquí mismo.",
  unfulfilledTitle: "No alcanzó tu unidad",
  unfulfilledBody: "Llegaron menos unidades de las que vendimos y la tuya no alcanzó. No tienes que pagar nada más: te escribimos para la devolución.",
  payOnline: (amount: number | null) => (amount ? `Pagar ${money(amount)} en línea` : "Pagar en línea"),
  payByTransfer: "Prefiero transferir",
  transferNote: "Cuando nos envíes el comprobante por WhatsApp lo anotamos en tu pedido.",
  otherGateway: "Pagar con otra pasarela segura",
  preparing: "Preparando el pago…",
  confirming: "Estamos confirmando tu pago… Suele tardar unos segundos; esta página se actualiza sola.",
  stillConfirming: "Tu pago sigue en confirmación. Apenas llegue te avisamos por correo; no tienes que pagar de nuevo.",
  installmentReceivedTitle: "¡Recibimos tu abono!",
  installmentReceived: (amount: number) => `Abonaste ${money(amount)}. Gracias, ya quedó en tu pedido.`,
  balancePaidTitle: "¡Listo! Pagaste tu saldo",
  balancePaid: "Ya preparamos tu envío. Te avisamos cuando salga.",
  pendingRow: (amount: number) => `Tienes un pago de ${money(amount)} en confirmación.`,
  errorTitle: "No pudimos preparar el pago",
  errorFallback: "Intenta de nuevo en unos segundos o escríbenos por WhatsApp.",
} as const;
