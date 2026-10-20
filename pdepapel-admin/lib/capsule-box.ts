import { parseSizeValue } from "@/constants/sizes";

const ORDER = ["XS", "S", "M", "L", "XL"] as const;
type BoxType = (typeof ORDER)[number];

/** Por cantidad de productos, la caja más pequeña en la que caben sueltos. */
const floorByCount = (items: number): BoxType => (items <= 10 ? "S" : items <= 20 ? "M" : "L");

/**
 * La caja sugerida para un pedido de cápsulas: la más grande entre el
 * producto más grande que salió y el piso por cantidad. Un pack siempre va en
 * caja (nunca en bolsa). Devuelve el tipo y, si la tienda tiene una caja de
 * ese tipo, su nombre (la predeterminada primero).
 */
export function suggestCapsuleBox(sizeValues: readonly (string | null | undefined)[], boxes: readonly { name: string; type: string; isDefault: boolean }[]) {
  let index = ORDER.indexOf(floorByCount(sizeValues.length));
  for (const value of sizeValues) {
    const dimension = (value ? parseSizeValue(value)?.dimension : null) ?? "M";
    index = Math.max(index, ORDER.indexOf(dimension as BoxType));
  }
  const type = ORDER[Math.max(0, index)];
  const box = boxes.find((row) => row.type === type && row.isDefault) ?? boxes.find((row) => row.type === type) ?? null;
  return { type, name: box?.name ?? null };
}
