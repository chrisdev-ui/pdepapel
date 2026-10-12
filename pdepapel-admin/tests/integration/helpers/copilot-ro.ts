import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../../prisma/manual-migrations");

/**
 * Todos los archivos de `copilot_ro` en orden de nombre (el que crea el
 * usuario va primero), los mismos que Christian corre en Railway. Así una
 * concesión nueva en su propio archivo también llega a las pruebas y a la
 * evaluación.
 */
export function copilotRoGrantFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.includes("copilot_ro") && name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(MIGRATIONS, name));
}

/** Las sentencias de esos archivos, apuntando a la base local y con la contraseña de la prueba. */
export function copilotRoStatements(databaseName: string, password: string): string[] {
  return copilotRoGrantFiles().flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .replaceAll("`railway`", `\`${databaseName}\``)
      .replace("<REEMPLAZAR_CONTRASEÑA>", password)
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean),
  );
}
