// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Esperando a Paula» en Conversaciones: el botón con la cuenta, el filtro en
 * la dirección (el correo de recordatorio enlaza a `?esperando=1`) y la
 * insignia en la primera columna, para que se vea en el teléfono.
 */
const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, refresh: vi.fn() }),
  usePathname: () => "/store-1/conversaciones",
  useParams: () => ({ storeId: "store-1" }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/components/ui/data-table", () => ({
  DataTable: ({ data, emptyState }: { data: { id: string; contactName: string }[]; emptyState: { title: string } }) =>
    data.length ? (
      <ul aria-label="conversaciones">
        {data.map((row) => (
          <li key={row.id}>{row.contactName}</li>
        ))}
      </ul>
    ) : (
      <p>{emptyState.title}</p>
    ),
}));

import ConversationClient from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/components/client";
import { columns } from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/components/columns";
import type { ConversationRow } from "@/lib/conversations";

const row = (id: string, waitingSince: Date | null): ConversationRow => ({
  id,
  phone: null,
  bsuid: null,
  username: null,
  contactName: `Clienta ${id}`,
  status: "OPEN",
  lastInboundAt: null,
  lastOutboundAt: null,
  lastOwnerAt: null,
  messageCount: 1,
  lastMessagePreview: null,
  lastMessageAt: null,
  hasCart: false,
  orderId: null,
  ignored: false,
  skippedCount: 0,
  pendingOrder: false,
  fromWeb: false,
  recovered: false,
  waitingSince,
});

const data = [row("a", new Date(Date.now() - 25 * 60 * 1000)), row("b", null), row("c", new Date(Date.now() - 3 * 60 * 60 * 1000))];

describe("Esperando a Paula", () => {
  afterEach(() => {
    cleanup();
    navigation.search = "";
    navigation.replace.mockClear();
  });

  it("el botón cuenta las que esperan y lleva el filtro a la dirección", () => {
    render(<ConversationClient data={data} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Esperando a Paula \(2\)/ }));
    expect(navigation.replace).toHaveBeenCalledWith("/store-1/conversaciones?esperando=1", { scroll: false });
  });

  it("con ?esperando=1 solo enseña esas; sin ninguna, lo dice", () => {
    navigation.search = "esperando=1";
    render(<ConversationClient data={data} />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Clienta a", "Clienta c"]);
    expect(screen.getByRole("button", { name: /Esperando a Paula/ }).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    render(<ConversationClient data={[row("b", null)]} />);
    expect(screen.getByText("Nadie te está esperando")).toBeTruthy();
  });

  it("la insignia va en la primera columna con cuánto lleva esperando", () => {
    const cell = columns[0].cell as (context: { row: { original: ConversationRow } }) => JSX.Element;
    render(<>{cell({ row: { original: data[0] } })}</>);
    expect(screen.getByText("Esperando a Paula · 25 min")).toBeTruthy();
    cleanup();
    render(<>{cell({ row: { original: data[1] } })}</>);
    expect(screen.queryByText(/Esperando a Paula/)).toBeNull();
  });
});
