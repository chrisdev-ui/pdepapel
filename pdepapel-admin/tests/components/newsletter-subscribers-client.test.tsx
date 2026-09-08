// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewsletterSubscribersClient } from "@/app/(dashboard)/[storeId]/(routes)/boletin/components/newsletter-subscribers-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1/boletin",
  useParams: () => ({ storeId: "store-1" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const subscriber = (overrides: Partial<Parameters<typeof NewsletterSubscribersClient>[0]["subscribers"][number]>) => ({
  id: "s1",
  email: "ana@example.com",
  status: "ACTIVE" as const,
  source: "footer",
  consentedAt: "2026-09-01T15:00:00.000Z",
  confirmedAt: "2026-09-01T15:10:00.000Z",
  unsubscribedAt: null,
  lastConfirmationSentAt: null,
  ...overrides,
});

describe("NewsletterSubscribersClient", () => {
  afterEach(cleanup);

  it("shows counters, the confirmed view by default and switches views", () => {
    render(
      <NewsletterSubscribersClient
        storeId="store-1"
        subscribers={[
          subscriber({}),
          subscriber({ id: "s2", email: "luis@example.com", status: "PENDING", confirmedAt: null, lastConfirmationSentAt: "2026-09-02T15:00:00.000Z" }),
          subscriber({ id: "s3", email: "baja@example.com", status: "UNSUBSCRIBED", unsubscribedAt: "2026-09-03T15:00:00.000Z" }),
        ]}
        counts={{ ACTIVE: 1, PENDING: 1, UNSUBSCRIBED: 1, SUPPRESSED: 0 }}
        total={3}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Boletín" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Exportar confirmados/ })).toHaveAttribute("href", "/api/store-1/newsletter/export");

    const tabs = screen.getByRole("tablist", { name: "Vistas de suscriptores" });
    expect(within(tabs).getByRole("tab", { name: /Confirmados/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("ana@example.com").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("luis@example.com")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /Dar de baja/ }).length).toBeGreaterThan(0);

    fireEvent.click(within(tabs).getByRole("tab", { name: /Por confirmar/ }));
    expect(screen.getAllByText("luis@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Reenviar confirmación/ }).length).toBeGreaterThan(0);

    fireEvent.click(within(tabs).getByRole("tab", { name: /Todos/ }));
    expect(screen.getAllByText("baja@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cancelada").length).toBeGreaterThan(0);
  });
});
