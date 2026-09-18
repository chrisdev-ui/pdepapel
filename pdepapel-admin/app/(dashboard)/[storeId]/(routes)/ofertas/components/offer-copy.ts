/** Un solo texto para borrar o terminar una oferta, entre desde la lista o desde la ficha. */
export const OFFER_DELETE_COPY = {
  title: (name: string) => `¿Eliminar la oferta ${name}?`,
  description: "Los pedidos ya hechos conservan sus precios. La tienda vuelve al precio normal al instante. Si solo quieres pararla, usa «Terminar ahora».",
} as const;

export const OFFER_END_COPY = {
  title: (name: string) => `¿Terminar la oferta ${name} ahora?`,
  description: "La tienda vuelve al precio normal en unos minutos. Queda como «Desactivada» y puedes volver a encenderla desde la ficha.",
  confirmLabel: "Terminar ahora",
} as const;
