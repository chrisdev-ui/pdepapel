"use client";

import { useParams } from "next/navigation";

import { Models } from "@/constants";
import { AttributeRowMenu, deleteBlockedReasonFor } from "../../atributos/components/attribute-row-menu";
import { DesignRow } from "./columns";

export const CellAction: React.FC<{ data: DesignRow }> = ({ data }) => {
  const params = useParams();
  return (
    <AttributeRowMenu
      kind="designs"
      row={data}
      usage={data.usage}
      editHref={`/${params.storeId}/${Models.Designs}/${data.id}`}
      usageHref={`/${params.storeId}/productos?diseno=${data.id}`}
      usageLabel={`Ver sus ${data.usage === 1 ? "producto" : `${data.usage} productos`}`}
      apiModel={Models.Designs}
      deleteTitle={`¿Eliminar el diseño «${data.name}»?`}
      deleteDescription="Ningún producto lo usa: se elimina de inmediato y no se puede deshacer."
      deleteBlockedReason={deleteBlockedReasonFor("designs")}
      copiedMessage="ID del diseño copiado al portapapeles"
      deletedMessage="Diseño eliminado"
    />
  );
};
