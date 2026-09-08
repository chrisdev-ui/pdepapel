// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FairPhaseHeader } from "@/app/(dashboard)/[storeId]/(routes)/ferias/[fairEventId]/components/fair-phase-header";

const baseProps = {
  storeId: "store-1",
  name: "Comic Con Medellín",
  location: "Plaza Mayor",
  startsAt: "2026-10-03T05:00:00.000Z",
  endsAt: "2026-10-05T05:00:00.000Z",
  allocated: 40,
  sold: 12,
};

describe("FairPhaseHeader", () => {
  afterEach(cleanup);

  it("shows the fair, its status and the four phases with the current one marked", () => {
    render(<FairPhaseHeader {...baseProps} status="OPEN" action={<button type="button">Acción</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Comic Con Medellín" })).toBeInTheDocument();
    expect(screen.getByText("Abierta")).toBeInTheDocument();
    expect(screen.getByText("Plaza Mayor")).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[0].querySelector("a")).toHaveAttribute("href", "#inventario");
    expect(steps[2].querySelector("a")).toBeNull();
    expect(screen.getByRole("button", { name: "Acción" })).toBeInTheDocument();
    expect(screen.getByText(/Siguiente paso/)).toBeInTheDocument();
  });

  it("links the first step to the reservation when nothing is allocated", () => {
    render(<FairPhaseHeader {...baseProps} status="DRAFT" allocated={0} sold={0} />);
    expect(screen.getByRole("link", { name: /Reservar el inventario/ })).toHaveAttribute("href", "#inventario");
  });

  it("hides the stepper for cancelled fairs and the next step for closed ones", () => {
    const { rerender } = render(<FairPhaseHeader {...baseProps} status="CANCELLED" />);
    expect(screen.queryByRole("list")).toBeNull();
    rerender(<FairPhaseHeader {...baseProps} status="CLOSED" />);
    expect(screen.getByText("Cerrada", { selector: "span.text-sm" })).toBeInTheDocument();
    expect(screen.queryByText(/Siguiente paso/)).toBeNull();
  });
});
