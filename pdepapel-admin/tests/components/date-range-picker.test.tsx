// @vitest-environment jsdom

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { getDatePresets } from "@/lib/date-presets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

interface FormValues {
  dateRange?: {
    from?: Date | string;
    to?: Date | string;
  };
}

function DateRangeForm({
  defaultDateRange,
  onSubmit,
}: {
  defaultDateRange?: FormValues["dateRange"];
  onSubmit?: () => void;
}) {
  const form = useForm<FormValues>({
    defaultValues: { dateRange: defaultDateRange },
  });
  const value = useWatch({ control: form.control, name: "dateRange" });

  const rangeText =
    value?.from instanceof Date && value.to instanceof Date
      ? `${format(value.from, "yyyy-MM-dd")}/${format(value.to, "yyyy-MM-dd")}`
      : "unselected";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <DateRangePicker
        control={form.control}
        customDates={() => getDatePresets(new Date(2026, 6, 31, 12))}
        name="dateRange"
      />
      <output data-testid="selected-range">{rangeText}</output>
    </form>
  );
}

afterEach(cleanup);

describe("DateRangePicker", () => {
  it("selects the full current-week shortcut without submitting the form", () => {
    const onSubmit = vi.fn();
    render(<DateRangeForm onSubmit={onSubmit} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Selecciona un rango de fechas" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Esta semana" }));

    expect(screen.getByTestId("selected-range")).toHaveTextContent(
      "2026-07-27/2026-08-02",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("normalizes date ranges restored from local storage", () => {
    render(
      <DateRangeForm
        defaultDateRange={{
          from: "2026-07-31T05:00:00.000Z",
          to: "2026-08-01T04:59:59.999Z",
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: /viernes, 31 de julio de 2026/i }),
    ).toBeVisible();
  });
});
