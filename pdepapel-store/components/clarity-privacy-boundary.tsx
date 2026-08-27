"use client";

import { usePathname } from "next/navigation";

import { shouldMaskClarityPage } from "@/lib/microsoft-clarity";

export function ClarityPrivacyBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const shouldMask = shouldMaskClarityPage(pathname);

  return (
    <main data-clarity-mask={shouldMask ? "true" : undefined}>{children}</main>
  );
}
