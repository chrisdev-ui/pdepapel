"use client";

import { useParams } from "next/navigation";

import { Models } from "@/constants";
import { useAttributeActions } from "../../atributos/components/attribute-actions";
import { AttributeRowMenu, deleteBlockedReasonFor } from "../../atributos/components/attribute-row-menu";
import { TypeRow } from "./columns";

export const CellAction: React.FC<{ data: TypeRow }> = ({ data }) => {
  const params = useParams();
  const actions = useAttributeActions();
  const storeHref = actions?.storeUrl && data.slug ? `${actions.storeUrl.replace(/\/$/, "")}/tienda?typeId=${data.slug}` : null;
  const subcategories = data._count.categories;
  return (
    <AttributeRowMenu
      kind="types"
      row={data}
      usage={subcategories}
      editHref={`/${params.storeId}/tipos/${data.id}`}
      usageHref={`/${params.storeId}/atributos?tab=subcategorias&categoria=${data.id}`}
      usageLabel={`Ver sus ${subcategories === 1 ? "subcategoría" : `${subcategories} subcategorías`}`}
      storeHref={storeHref}
      apiModel={Models.Types}
      deleteTitle={`¿Eliminar la categoría «${data.name}»?`}
      deleteDescription="No tiene subcategorías, así que se elimina de inmediato. Esta acción no se puede deshacer."
      deleteBlockedReason={deleteBlockedReasonFor("types")}
      copiedMessage="ID de la categoría copiado al portapapeles"
      deletedMessage="Categoría eliminada"
    />
  );
};
