/**
 * Cabeceras del recibo (`/pedido/<id>`, cuyo id es la llave): fuera de los
 * buscadores y sin la ruta en el referrer. `strict-origin` y no
 * `no-referrer`: las pasarelas (Bold, Wompi) que arrancan desde el recibo
 * siguen recibiendo solo el origen, como hoy con `origin-when-cross-origin`,
 * y ninguna página (tampoco la siguiente de la tienda) recibe la ruta.
 */
export const ORDER_RECEIPT_REFERRER_POLICY = "strict-origin";

export const ORDER_RECEIPT_HEADERS = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: ORDER_RECEIPT_REFERRER_POLICY },
];

export const ORDER_RECEIPT_HEADER_SOURCE = "/pedido/:path*";
