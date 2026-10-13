"use client";


import { shouldMaskClarityPage } from "@/lib/microsoft-clarity";
import { useStorefrontPathname } from "@/hooks/use-storefront-pathname";

export function ClarityPrivacyBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useStorefrontPathname();
  const shouldMask = shouldMaskClarityPage(pathname);

  return (
    <main
      className="flex flex-1 flex-col"
      data-clarity-mask={shouldMask ? "true" : undefined}
    >
      {children}
    </main>
  );
}
