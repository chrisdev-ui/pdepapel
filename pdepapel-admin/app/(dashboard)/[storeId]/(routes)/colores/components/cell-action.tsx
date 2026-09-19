"use client";

import { useParams } from "next/navigation";

import { Models } from "@/constants";
import { AttributeRowMenu, deleteBlockedReasonFor } from "../../atributos/components/attribute-row-menu";
import { ColorRow } from "./columns";

export const CellAction: React.FC<{ data: ColorRow }> = ({ data }) => {
  const params = useParams();
  return (
    <AttributeRowMenu
      kind="colors"
      row={data}
      usage={data.usage}
      editHref={`/${params.storeId}/${Models.Colors}/${data.id}`}
      usageHref={`/${params.storeId}/productos?color=${data.id}`}
      usageLabel={`Ver sus ${data.usage === 1 ? "producto" : `${data.usage} productos`}`}
      apiModel={Models.Colors}
      deleteTitle={`¿Eliminar el color «${data.name}»?`}
      deleteDescription="Ningún producto lo usa: se elimina de inmediato y no se puede deshacer."
      deleteBlockedReason={deleteBlockedReasonFor("colors")}
      copiedMessage="ID del color copiado al portapapeles"
      deletedMessage="Color eliminado"
    />
  );
};
