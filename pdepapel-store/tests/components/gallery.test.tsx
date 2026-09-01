/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Gallery } from "@/components/gallery";

vi.mock("next/image", () => ({
  default: ({ fill, loader, priority, ...props }: React.ComponentProps<"img"> & {
    fill?: boolean;
    loader?: unknown;
    priority?: boolean;
  }) => <img {...props} data-priority={priority ? "true" : undefined} />,
}));

const images = [
  {
    id: "secondary",
    url: "https://res.cloudinary.com/demo/image/upload/v1/secondary.jpg",
    isMain: false,
  },
  {
    id: "main",
    url: "https://res.cloudinary.com/demo/image/upload/v1/main.jpg",
    isMain: true,
  },
];

afterEach(cleanup);

describe("Gallery", () => {
  it("prioritizes the designated main image with responsive source sizes", () => {
    render(<Gallery images={images} productName="Cuaderno Snoopy" />);

    const mainImage = screen.getByAltText("Cuaderno Snoopy");

    expect(mainImage).toHaveAttribute("src", images[1].url);
    expect(mainImage).toHaveAttribute("data-priority", "true");
    expect(mainImage).toHaveAttribute(
      "sizes",
      "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 3rem), (max-width: 1279px) calc(50vw - 3rem), 608px",
    );
    expect(screen.getByAltText("Vista 1 de Cuaderno Snoopy")).toHaveAttribute(
      "sizes",
      "64px",
    );
  });

  it("updates the main image without creating another gallery", () => {
    render(<Gallery images={images} productName="Cuaderno Snoopy" />);

    fireEvent.click(screen.getByAltText("Vista 1 de Cuaderno Snoopy"));

    expect(screen.getByAltText("Cuaderno Snoopy")).toHaveAttribute(
      "src",
      images[0].url,
    );
    expect(screen.getAllByAltText("Cuaderno Snoopy")).toHaveLength(1);
  });
});
