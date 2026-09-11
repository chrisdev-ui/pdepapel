import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { describeBoxUsage, formatBoxDimensions } from "@/lib/boxes";
import { BoxForm } from "./components/box-form";
import { getBox } from "./server/get-box";

const BoxPage = async ({
  params,
}: {
  params: { boxId: string; storeId: string };
}) => {
  const isNew = params.boxId === "new";
  const [result, store] = await Promise.all([
    isNew ? Promise.resolve(null) : getBox(params.boxId, params.storeId),
    prismadb.store.findFirst({
      where: { id: params.storeId },
      select: { logoUrl: true },
    }),
  ]);

  // Un id de otra tienda o inexistente no debe abrir el formulario de "nueva".
  if (!isNew && !result) notFound();

  const box = result?.box ?? null;
  const shipmentsCount = result?.shipmentsCount ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          {box ? box.name : "Nueva caja"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {box
            ? `Caja ${box.type} · ${formatBoxDimensions(box.width, box.height, box.length)} · ${describeBoxUsage(shipmentsCount)}`
            : "Escribe el nombre, elige el tipo y anota las medidas exteriores; el cotizador la usará al empacar pedidos."}
        </p>
      </div>
      <BoxForm
        initialData={box}
        shipmentsCount={shipmentsCount}
        // Sin logo de la tienda la vista realista no inventa uno.
        storeLogoUrl={store?.logoUrl || null}
      />
    </div>
  );
};

export default BoxPage;
