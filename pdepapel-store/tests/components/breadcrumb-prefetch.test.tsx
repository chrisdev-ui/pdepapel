// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

import { Breadcrumb } from "@/components/ui/breadcrumb";

describe("Breadcrumb", () => {
  afterEach(cleanup);

  it("does not prefetch the static pages it links to, so they do not compete with the main photo", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Tienda", href: "/tienda" },
          { label: "Mugs", href: "/categoria/mugs" },
          { label: "Mug calabaza", isCurrent: true },
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/tienda", "/categoria/mugs"]);
    expect(links.map((link) => link.getAttribute("data-prefetch"))).toEqual(["false", "false", "false"]);
  });
});
