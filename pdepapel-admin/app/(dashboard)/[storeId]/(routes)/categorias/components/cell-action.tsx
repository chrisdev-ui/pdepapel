"use client";

import { useParams } from "next/navigation";

import { Models } from "@/constants";
import { useAttributeActions } from "../../atributos/components/attribute-actions";
import { AttributeRowMenu, deleteBlockedReasonFor } from "../../atributos/components/attribute-row-menu";
import { CategoryRow } from "./columns";

export const CellAction: React.FC<{ data: CategoryRow }> = ({ data }) => {
  const params = useParams();
  const actions = useAttributeActions();
  const storeHref = actions?.storeUrl && data.slug ? `${actions.storeUrl.replace(/\/$/, "")}/categoria/${data.slug}` : null;
  return (
    <AttributeRowMenu
      kind="categories"
      row={data}
      usage={data.usage}
      editHref={`/${params.storeId}/${Models.Categories}/${data.id}`}
      usageHref={`/${params.storeId}/productos?subcategoria=${data.id}`}
      usageLabel={`Ver sus ${data.usage === 1 ? "producto" : `${data.usage} productos`}`}
      storeHref={storeHref}
      apiModel={Models.Categories}
      deleteTitle={`¿Eliminar la subcategoría «${data.name}»?`}
      deleteDescription="No tiene productos: se elimina de inmediato, junto con sus alias de URL y sus opciones para clientes. No se puede deshacer."
      deleteBlockedReason={deleteBlockedReasonFor("categories")}
      copiedMessage="ID de la subcategoría copiado al portapapeles"
      deletedMessage="Subcategoría eliminada"
    />
  );
};
