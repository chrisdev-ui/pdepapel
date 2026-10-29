// @vitest-environment jsdom
import { zodResolver } from "@hookform/resolvers/zod";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { MarginExceptionField } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/components/margin-exception-field";
import { Form } from "@/components/ui/form";
import { MARGIN_EXCEPTION_LENGTH_MESSAGE, marginExceptionApplies, marginExceptionFormIssue, marginExceptionSubmission } from "@/lib/margin-exception";
import { productMargin } from "@/lib/pricing/price-calculator";

afterEach(cleanup);

// El mismo par de campos y la misma regla del motivo que la ficha aplica al guardar.
const schema = z
  .object({ marginExceptionEnabled: z.boolean().optional(), marginExceptionReason: z.string().nullable().optional() })
  .superRefine((data, ctx) => {
    const issue = marginExceptionFormIssue(data.marginExceptionEnabled, data.marginExceptionReason);
    if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["marginExceptionReason"], message: issue });
  });

function Harness({ visible, onSubmit, reason = "" }: { visible: boolean; onSubmit: (values: z.infer<typeof schema>) => void; reason?: string }) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { marginExceptionEnabled: Boolean(reason), marginExceptionReason: reason } });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <MarginExceptionField visible={visible} />
        <button type="submit">Guardar</button>
      </form>
    </Form>
  );
}

describe("«Excepción de margen» en la ficha", () => {
  it("solo se ofrece bajo el mínimo y sobre el costo", () => {
    const at = (price: number) => productMargin({ price, acqPrice: 123_778, transportationCost: 0, minMarginPct: 40 });
    expect(marginExceptionApplies(at(160_000), false)).toBe(true);
    expect(marginExceptionApplies(at(250_000), false)).toBe(false);
    expect(marginExceptionApplies(at(100_000), true)).toBe(false);
    expect(marginExceptionApplies(productMargin({ price: 160_000, acqPrice: 123_778, transportationCost: 0, minMarginPct: null }), false)).toBe(false);
    expect(marginExceptionApplies(null, false)).toBe(false);
  });

  it("sin estar bajo el mínimo no pinta nada", () => {
    render(<Harness visible={false} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("margin-exception")).toBeNull();
    expect(screen.queryByText("Precio bajo a propósito")).toBeNull();
  });

  it("marcada pide el motivo y no guarda sin él; con motivo guarda", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness visible onSubmit={onSubmit} />);

    const toggle = screen.getByRole("checkbox", { name: "Precio bajo a propósito" });
    expect(screen.queryByPlaceholderText("Ej.: precio competitivo, estrategia de volumen")).toBeNull();
    await user.click(toggle);

    const input = screen.getByLabelText(/Motivo/);
    expect(input.getAttribute("placeholder")).toBe("Ej.: precio competitivo, estrategia de volumen");
    expect(input.getAttribute("maxlength")).toBe("255");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(MARGIN_EXCEPTION_LENGTH_MESSAGE)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(input, "Precio competitivo");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ marginExceptionEnabled: true, marginExceptionReason: "Precio competitivo" });
  });

  it("desmarcada no exige motivo y el campo se oculta", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness visible onSubmit={onSubmit} reason="Volumen" />);
    expect((screen.getByLabelText(/Motivo/) as HTMLInputElement).value).toBe("Volumen");
    await user.click(screen.getByRole("checkbox", { name: "Precio bajo a propósito" }));
    expect(screen.queryByLabelText(/Motivo/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("la regla del motivo: 3 a 255 caracteres sin contar espacios de los bordes", () => {
    expect(marginExceptionFormIssue(false, "")).toBeNull();
    expect(marginExceptionFormIssue(true, " ab ")).toBe(MARGIN_EXCEPTION_LENGTH_MESSAGE);
    expect(marginExceptionFormIssue(true, "abc")).toBeNull();
    expect(marginExceptionFormIssue(true, "x".repeat(256))).toBe(MARGIN_EXCEPTION_LENGTH_MESSAGE);
  });

  it("al guardar: fuera del mínimo no toca lo guardado; bajo el mínimo desmarcada lo quita y marcada exige motivo", () => {
    expect(marginExceptionSubmission({ applies: false, enabled: true, reason: "" })).toEqual({ ok: true, value: undefined });
    expect(marginExceptionSubmission({ applies: false, enabled: false, reason: "Volumen" })).toEqual({ ok: true, value: undefined });
    expect(marginExceptionSubmission({ applies: true, enabled: false, reason: "Volumen" })).toEqual({ ok: true, value: null });
    expect(marginExceptionSubmission({ applies: true, enabled: true, reason: "  Volumen " })).toEqual({ ok: true, value: "Volumen" });
    expect(marginExceptionSubmission({ applies: true, enabled: true, reason: "" })).toEqual({ ok: false, message: MARGIN_EXCEPTION_LENGTH_MESSAGE });
  });
});
