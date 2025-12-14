import prismadb from "@/lib/prismadb";
import { BoxForm } from "./components/box-form";
import { getBox } from "./server/get-box";

const BoxPage = async ({
  params,
}: {
  params: { boxId: string; storeId: string };
}) => {
  const box = await getBox(params.boxId);
  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId,
    },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BoxForm
          initialData={box}
          storeLogoUrl={
            store?.logoUrl ||
            `${process.env.ADMIN_WEB_URL}/images/transparent-background.png`
          }
        />
      </div>
    </div>
  );
};

export default BoxPage;
