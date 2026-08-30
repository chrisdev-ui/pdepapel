import { CatalogMigrationClient } from "./components/catalog-migration-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function CatalogOptionsMigrationPage() {
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <CatalogMigrationClient />
      </div>
    </div>
  );
}
