import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";

import { getCustomerDetail } from "../server/get-customers";
import { CustomerWorkspace } from "./components/customer-workspace";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Cliente | PdePapel Admin",
};

interface CustomerDetailPageProps {
  params: { storeId: string; customerId: string };
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const [detail, store] = await Promise.all([
    getCustomerDetail(params.storeId, params.customerId),
    prismadb.store.findUnique({ where: { id: params.storeId }, select: { name: true } }),
  ]);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8 sm:pt-6">
      <CustomerWorkspace
        detail={detail}
        storeId={params.storeId}
        storeName={store?.name ?? "P de Papel"}
        storeUrl={env.FRONTEND_STORE_URL}
      />
    </div>
  );
}
