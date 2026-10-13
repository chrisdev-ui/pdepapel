import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { newsletterFormResolver } from "@/components/newsletter-form";

/** El esquema que tenía el formulario antes de quitar zod del pie. */
const previousSchema = z.object({
  email: z.string().email("Ingresa un correo electrónico válido"),
  consent: z.boolean().refine(Boolean, { message: "Autoriza el envío de novedades para continuar" }),
  company: z.string().max(0).optional(),
});

const run = (values: { email: string; consent: boolean; company?: string }) =>
  newsletterFormResolver(values, undefined, { fields: {}, shouldUseNativeValidation: false });

const cases = [
  { email: "ana@correo.com", consent: true, company: "" },
  { email: "ana.maria+promo@correo.com.co", consent: true },
  { email: "ANA@CORREO.COM", consent: true },
  { email: "ana@correo", consent: true },
  { email: ".ana@correo.com", consent: true },
  { email: "ana..maria@correo.com", consent: true },
  { email: "ana@correo..com", consent: true },
  { email: " ana@correo.com", consent: true },
  { email: "", consent: false },
  { email: "ana@correo.com", consent: false },
  { email: "ana@correo.com", consent: true, company: "bot" },
];

describe("newsletter form validation without zod", () => {
  it.each(cases)("accepts and rejects exactly like the previous zod schema: %o", async (values) => {
    const previous = previousSchema.safeParse(values);
    const result = await run(values);
    const errors = result.errors as Record<string, { message?: string }>;
    expect(Object.keys(errors).length === 0).toBe(previous.success);
    if (!previous.success) {
      const expected = Object.fromEntries(previous.error.issues.map((issue) => [issue.path[0], issue.message]));
      expect(Object.fromEntries(Object.entries(errors).map(([field, error]) => [field, error.message]))).toEqual(expected);
    }
  });
});
