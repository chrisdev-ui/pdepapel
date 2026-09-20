import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia del patrón `useCanWrite`.
 *
 * La forma tentadora es cortar arriba:
 *
 *     const canWrite = useCanWrite();
 *     if (!canWrite) return null;
 *     const router = useRouter();   // ← ya no se llama en todos los renders
 *
 * React exige que los hooks se llamen siempre en el mismo orden, así que ese
 * corte deja el estado del componente a merced de cuándo se resuelva el rol.
 * Pasó de verdad en `components/ui/data-table-action-options.tsx`: once hooks
 * quedaron detrás del `return null`.
 *
 * La otra mitad del mismo error es leer `canWrite` dentro de un `useMemo` y
 * olvidarlo en las dependencias: el valor se congela con el del primer render,
 * que es el que trae el rol todavía sin resolver. Así el título de un
 * formulario seguía diciendo «Editar» para una cuenta de solo lectura y el
 * buscador de comandos conservaba las pantallas reservadas.
 *
 * Esta prueba corre ESLint de verdad, con la configuración del proyecto, sobre
 * los archivos que usan el hook. `npm run lint` no corre en CI (el flujo de
 * admin corre `tsc --noEmit` y las pruebas), así que sin esto la regla no
 * detiene nada.
 */
/**
 * `eslint` no publica tipos y no vale una dependencia nueva solo para esta
 * prueba: se declara la parte de su API que se usa aquí.
 */
type LintMessage = { ruleId: string | null; line: number; message: string };
type LintResult = { filePath: string; messages: LintMessage[] };
type ESLintModule = {
  ESLint: new (options: { useEslintrc: boolean; errorOnUnmatchedPattern: boolean; cwd: string }) => {
    lintFiles(patterns: string[]): Promise<LintResult[]>;
  };
};

const ROOT = path.resolve(__dirname, "../../..");
const SEARCH_DIRS = ["app", "components", "hooks"];
const ROLE_HOOK = "useCanWrite";
/** Señales del rol: si un hook las lee, tienen que estar en sus dependencias. */
const ROLE_VALUES = ["canWrite", "ownerAllowlisted"];

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const filesUsingRole = SEARCH_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .filter((file) => readFileSync(file, "utf8").includes(ROLE_HOOK));

describe("el patrón useCanWrite respeta las reglas de los hooks", () => {
  it("encuentra los archivos que deciden por rol", () => {
    expect(filesUsingRole.length).toBeGreaterThan(20);
  });

  it("ninguno llama a un hook de forma condicional ni congela el rol en un useMemo", async () => {
    // El especificador va en una variable a propósito: `eslint` no trae tipos,
    // y con un literal TypeScript lo marcaría como `any` implícito.
    const specifier = "eslint";
    const { ESLint } = ((await import(specifier)) as unknown) as ESLintModule;
    const eslint = new ESLint({ useEslintrc: true, errorOnUnmatchedPattern: false, cwd: ROOT });
    const results = await eslint.lintFiles(filesUsingRole);

    const offences = results.flatMap((result) =>
      result.messages
        .filter((message) => {
          if (message.ruleId === "react-hooks/rules-of-hooks") return true;
          // De `exhaustive-deps` solo importa aquí lo que olvida el rol.
          if (message.ruleId !== "react-hooks/exhaustive-deps") return false;
          return ROLE_VALUES.some((value) => message.message.includes(`'${value}'`));
        })
        .map((message) => `${path.relative(ROOT, result.filePath)}:${message.line} ${message.ruleId} — ${message.message}`),
    );

    expect(offences).toEqual([]);
  }, 60_000);
});
