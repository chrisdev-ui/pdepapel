import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Currency } from "@/components/ui/currency";
import { currencyFormatter } from "@/lib/utils";

describe("Currency", () => {
  it("renders its formatted value during the first render", () => {
    const value = 12_500;
    const markup = renderToStaticMarkup(<Currency value={value} />);

    expect(markup).toContain(currencyFormatter.format(value));
  });

  it("keeps the negative prefix during the first render", () => {
    const markup = renderToStaticMarkup(<Currency isNegative value={500} />);

    expect(markup).toContain(`-${currencyFormatter.format(500)}`);
  });
});
