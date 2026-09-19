"use client";

import { useParams } from "next/navigation";

import { Models } from "@/constants";
import { AttributeRowMenu, deleteBlockedReasonFor } from "../../atributos/components/attribute-row-menu";
import { SizeRow } from "./columns";

export const CellAction: React.FC<{ data: SizeRow }> = ({ data }) => {
  const params = useParams();
  return (
    <AttributeRowMenu
      kind="sizes"
      row={data}
      usage={data.usage}
      editHref={`/${params.storeId}/${Models.Sizes}/${data.id}`}
      usageHref={`/${params.storeId}/productos?tamano=${data.id}`}
      usageLabel={`Ver sus ${data.usage === 1 ? "producto" : `${data.usage} productos`}`}
      apiModel={Models.Sizes}
      deleteTitle={`¿Eliminar el tamaño «${data.name}»?`}
      deleteDescription="Ningún producto lo usa: se elimina de inmediato y no se puede deshacer."
      deleteBlockedReason={deleteBlockedReasonFor("sizes")}
      copiedMessage="ID del tamaño copiado al portapapeles"
      deletedMessage="Tamaño eliminado"
    />
  );
};
