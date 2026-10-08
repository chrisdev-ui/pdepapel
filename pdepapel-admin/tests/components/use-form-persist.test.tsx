// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useForm } from "react-hook-form";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormPersistenceStore } from "@/hooks/use-form-persistence-store";

type Values = { name: string; shipping: { estimatedDeliveryDate?: Date } };

const STORE = "store-1";

function Harness({ orderId, storageKey }: { orderId?: string; storageKey: string }) {
  const form = useForm<Values>({
    defaultValues: { name: orderId ? "Pedido del servidor" : "", shipping: { estimatedDeliveryDate: undefined } },
  });
  useFormPersist({ form, key: storageKey, enabled: !orderId });
  const values = form.watch();
  const date = values.shipping?.estimatedDeliveryDate;
  return (
    <div>
      <span data-testid="name">{values.name}</span>
      <span data-testid="date-type">{date instanceof Date ? "date" : typeof date}</span>
      <input aria-label="Nombre" {...form.register("name")} />
    </div>
  );
}

/** Simula un borrador guardado por otra pestaña: pasó por JSON, las fechas son texto. */
function seedDraft(key: string) {
  const draft = JSON.parse(
    JSON.stringify({ name: "Borrador nuevo", shipping: { estimatedDeliveryDate: new Date("2026-09-15T05:00:00.000Z") } }),
  );
  useFormPersistenceStore.getState().setFormData(key, draft);
}

beforeEach(() => {
  useFormPersistenceStore.getState().clearAll();
});
afterEach(cleanup);

describe("useFormPersist", () => {
  it("restores a new-record draft and revives its dates", async () => {
    const key = `order-form-${STORE}-STANDARD-new`;
    seedDraft(key);

    await act(async () => {
      render(<Harness storageKey={key} />);
    });

    expect(screen.getByTestId("name").textContent).toBe("Borrador nuevo");
    expect(screen.getByTestId("date-type").textContent).toBe("date");
  });

  it("never merges a new-record draft over an existing record, even when the key ends in -new", async () => {
    // Regression: the order form used a '-new' key for every order and only
    // disabled *saving* for existing ones, so a draft started for a new order
    // was merged over server data with string dates and crashed the page.
    const key = `order-form-${STORE}-STANDARD-new`;
    seedDraft(key);

    await act(async () => {
      render(<Harness orderId="existing-order" storageKey={key} />);
    });

    expect(screen.getByTestId("name").textContent).toBe("Pedido del servidor");
    expect(screen.getByTestId("date-type").textContent).toBe("undefined");
  });

  it("does not restore when there is no draft", async () => {
    await act(async () => {
      render(<Harness storageKey={`order-form-${STORE}-STANDARD-new`} />);
    });
    expect(screen.getByTestId("name").textContent).toBe("");
  });

  it("writes the pending draft right away when the page reloads", async () => {
    const key = `order-form-${STORE}-STANDARD-new`;
    await act(async () => {
      render(<Harness storageKey={key} />);
    });

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Escrito justo antes de recargar" } });
    expect(useFormPersistenceStore.getState().forms[key]).toBeUndefined();

    window.dispatchEvent(new Event("pagehide"));

    expect(useFormPersistenceStore.getState().forms[key]).toMatchObject({ name: "Escrito justo antes de recargar" });
  });
});
