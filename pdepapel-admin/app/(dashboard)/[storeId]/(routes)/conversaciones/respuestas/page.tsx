import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getBotReplies } from "./server/get-bot-replies";
import { getBusinessFacts } from "./server/get-business-facts";
import { getProductAnswers } from "./server/get-product-answers";

const BotRepliesClient = dynamic(() => import("./components/client"), {
  ssr: false,
});
const ProductAnswersCard = dynamic(
  () =>
    import("./components/product-answers-card").then(
      (mod) => mod.ProductAnswersCard,
    ),
  { ssr: false },
);
const BusinessFactsCard = dynamic(
  () =>
    import("./components/business-facts-card").then(
      (mod) => mod.BusinessFactsCard,
    ),
  { ssr: false },
);

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Respuestas automáticas | PdePapel Admin",
  description: "Lo que contesta el bot de WhatsApp",
};

export default async function BotRepliesPage({
  params,
}: {
  params: { storeId: string };
}) {
  const [data, facts, products] = await Promise.all([
    getBotReplies(params.storeId),
    getBusinessFacts(params.storeId),
    getProductAnswers(params.storeId),
  ]);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <BusinessFactsCard data={facts} />
        <ProductAnswersCard data={products} />
        <BotRepliesClient data={data} />
      </div>
    </div>
  );
}
