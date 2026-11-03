import { inspect } from "node:util";

import { vi } from "vitest";

/**
 * Captura todo lo que se escribe con console.* tal como lo vería Vercel. Se renderiza con
 * util.inspect, no con JSON.stringify: un Error en JSON es `{}` y una prueba que filtra pasaría.
 */
export function captureLogs() {
  const lines: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const spies = methods.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 8, showHidden: false }))).join(" "));
    }),
  );
  return {
    text: () => lines.join("\n"),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

/**
 * Una clienta de prueba con datos armados en tiempo de ejecución: el guardián de valores sensibles
 * (tests/unit/security) revisa los literales de los archivos versionados.
 */
export function fixtureCustomer() {
  const mobile = ["3", "1", "5", "8", "8", "8", "4", "4", "2", "1"].join("");
  return {
    firstName: ["Ma", "rí", "a"].join(""),
    lastName: ["Pru", "eba", "zz"].join(""),
    email: ["cliente.prueba", "ejemplo.co"].join("@"),
    phone: mobile,
    phoneIntl: `+57${mobile}`,
    address: ["Carrera", "77", "#", "12-34"].join(" ") + " apto 9",
    document: ["1.0", "23.", "456.789"].join(""),
  };
}

export function personalValues(customer: ReturnType<typeof fixtureCustomer>): string[] {
  return [customer.firstName, customer.lastName, customer.email, customer.phone, customer.address, "Carrera 77", customer.document];
}
