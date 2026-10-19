import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

/**
 * La lista de Productos cargaba @react-pdf/renderer (con fontkit y pdfkit) y
 * @zxing en cada visita aunque solo se usan al pedir el catálogo o abrir la
 * cámara: más que toda la pantalla junta. Deben seguir llegando por import().
 */
describe("librerías pesadas solo al usarlas", () => {
  it("la lista de Productos no importa el PDF del catálogo de forma estática", () => {
    const client = source("app/(dashboard)/[storeId]/(routes)/productos/components/client.tsx");
    expect(client).not.toMatch(/from "@react-pdf\/renderer"/);
    expect(client).not.toMatch(/from "@\/components\/catalog\/product-catalog"/);
    expect(client).toMatch(/import\("\.\/catalog-pdf-link"\)/);
  });

  it("el lector de códigos trae @zxing/browser solo al abrir la cámara", () => {
    const scanner = source("components/ui/barcode-scanner.tsx");
    expect(scanner).not.toMatch(/import \{[^}]*BrowserMultiFormatReader[^}]*\} from "@zxing\/browser"/);
    expect(scanner).toMatch(/import\("\.\/zxing-reader"\)/);
  });
});
