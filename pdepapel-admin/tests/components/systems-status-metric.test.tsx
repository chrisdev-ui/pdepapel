// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SystemsStatus } from "@/app/(dashboard)/[storeId]/(routes)/components/systems-status";
import type { SystemStatusRow } from "@/lib/job-runs";

afterEach(cleanup);

const metric = (attention: boolean): SystemStatusRow => ({
  name: "whatsapp-bot-ratio",
  label: "Bot de WhatsApp: mensajes por mensaje de clienta (24 h)",
  ranAt: new Date("2026-10-10T19:00:00.000Z"),
  ok: !attention,
  detail: attention ? "1,08 · 13 del bot, 12 de clientas · más de 0,5" : "0,08 · 8 del bot, 100 de clientas",
  overdue: false,
  attention,
  metric: true,
});

describe("Sistemas: la cifra del bot", () => {
  it("enseña la cifra, no «Corrió…»", () => {
    render(<SystemsStatus rows={[metric(false)]} />);
    expect(screen.getByText("0,08 · 8 del bot, 100 de clientas")).toBeInTheDocument();
    expect(screen.queryByText(/Corrió/)).toBeNull();
    expect(screen.getByText("Al día")).toBeInTheDocument();
  });

  it("por encima del límite cuenta como atención", () => {
    render(<SystemsStatus rows={[metric(true)]} />);
    expect(screen.getByText("1 con atención")).toBeInTheDocument();
    expect(screen.getByText(/más de 0,5/)).toBeInTheDocument();
  });
});
