// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkManualUpdateModal } from "@/app/(dashboard)/[storeId]/(routes)/envios/components/bulk-manual-update-modal";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const fetchMock = vi.fn();

beforeAll(() => {
  Object.defineProperties(Element.prototype, {
    hasPointerCapture: { value: () => false, configurable: true },
    releasePointerCapture: { value: () => undefined, configurable: true },
    scrollIntoView: { value: () => undefined, configurable: true },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

async function choose(user: ReturnType<typeof userEvent.setup>, triggerLabel: string, optionText: string) {
  await user.click(screen.getByRole("combobox", { name: triggerLabel }));
  await user.click(await screen.findByRole("option", { name: optionText }));
}

describe("BulkManualUpdateModal", () => {
  it("shows the count for the chosen origin before confirming and sends from/to", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.dryRun) return jsonResponse({ count: 20 });
      return jsonResponse({ count: 20, updated: 20, ordersUpdated: 3 });
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BulkManualUpdateModal isOpen onClose={onClose} />);

    expect(screen.getByText(/Elige el estado actual/)).toBeInTheDocument();
    await choose(user, "Estado actual", "Preparando");
    await waitFor(() => expect(screen.getByText(/Hay 20 envíos manuales en «Preparando»/)).toBeInTheDocument());

    await choose(user, "Estado nuevo", "Despachado");
    await waitFor(() => expect(screen.getByText(/Se cambiarán 20 envíos manuales de «Preparando» a «Despachado»/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Corregir 20 envíos" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const finalCall = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body))).find((body) => !body.dryRun);
    expect(finalCall).toMatchObject({ fromStatus: "Preparing", toStatus: "Shipped", includeClosed: false, correction: false });
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps delivered and cancelled out of the origin list until included on purpose", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ count: 427 }));
    const user = userEvent.setup();
    render(<BulkManualUpdateModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Estado actual" }));
    await screen.findByRole("option", { name: "Preparando" });
    expect(screen.queryByRole("option", { name: "Entregado" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("checkbox", { name: "Incluir entregados y cancelados" }));
    await choose(user, "Estado actual", "Entregado");
    await waitFor(() => expect(screen.getByText(/Hay 427 envíos manuales en «Entregado»/)).toBeInTheDocument());
  });

  it("does not offer an out-of-flow target unless it is flagged as a correction", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ count: 2 }));
    const user = userEvent.setup();
    render(<BulkManualUpdateModal isOpen onClose={vi.fn()} />);
    await choose(user, "Estado actual", "Despachado");
    await waitFor(() => expect(screen.getByText(/Hay 2 envíos manuales/)).toBeInTheDocument());

    await user.click(screen.getByRole("combobox", { name: "Estado nuevo" }));
    await screen.findByRole("option", { name: "En tránsito" });
    expect(screen.queryByRole("option", { name: "Preparando" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("checkbox", { name: "Es una corrección" }));
    await user.click(screen.getByRole("combobox", { name: "Estado nuevo" }));
    expect(await screen.findByRole("option", { name: "Preparando" })).toBeInTheDocument();
  });
});
