import type { Metadata } from "next";

import { normalizePairingCode } from "@/lib/scanner-pairing";

import { RemoteScannerPhone } from "./remote-scanner-phone";

export const metadata: Metadata = {
  title: "Escáner del celular | PdePapel Admin",
  robots: { index: false, follow: false },
};

export default function RemoteScannerPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: { codigo?: string };
}) {
  return <RemoteScannerPhone storeId={params.storeId} initialCode={normalizePairingCode(searchParams.codigo ?? "")} />;
}
