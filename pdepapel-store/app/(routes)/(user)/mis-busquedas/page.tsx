import { Metadata } from "next";

import { SavedSearches } from "@/components/saved-searches";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Mis búsquedas",
  alternates: { canonical: STOREFRONT_ROUTES.savedSearches },
  robots: { index: false, follow: false },
};

export default function SavedSearchesPage() {
  return <SavedSearches />;
}
