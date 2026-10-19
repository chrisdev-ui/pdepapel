import axios from "axios";
import { useEffect, useState } from "react";

import type { GroupVariantCombination } from "@/lib/variant-combinations";

/**
 * Las variantes (combinación y subcategoría) del grupo elegido en la ficha de
 * producto. Las del grupo actual llegan con la página; las de otro grupo se
 * piden una vez al elegirlo y quedan guardadas. Mientras llegan, o si fallan,
 * devuelve `undefined`: no hay aviso previo, pero el servidor rechaza igual una
 * combinación repetida.
 */
export function useGroupVariants(
  storeId: string,
  groupId: string | null,
  initial: { id: string; products: GroupVariantCombination[] } | null,
) {
  const [byGroup, setByGroup] = useState<Record<string, GroupVariantCombination[]>>(() =>
    initial ? { [initial.id]: initial.products } : {},
  );
  const loaded = groupId ? byGroup[groupId] : undefined;

  useEffect(() => {
    if (!groupId || loaded) return;
    let cancelled = false;
    axios
      .get<GroupVariantCombination[]>(`/api/${storeId}/product-groups/${groupId}/combinations`)
      .then(({ data }) => {
        if (!cancelled) setByGroup((current) => ({ ...current, [groupId]: data }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storeId, groupId, loaded]);

  return loaded;
}
