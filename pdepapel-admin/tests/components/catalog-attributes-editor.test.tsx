// @vitest-environment jsdom

import {
  CatalogAttributesEditor,
  type CatalogOptionSuggestion,
  type EditableCatalogAttribute,
} from "@/components/products/catalog-attributes-editor";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

const options: CatalogOptionSuggestion[] = [
  {
    id: "option-format",
    key: "formato",
    name: "Formato",
    isActive: true,
    categoryIds: ["category-notebooks"],
    usageCount: 12,
    values: [
      {
        id: "value-a5",
        name: "A5",
        value: "a5",
        usageCount: 8,
      },
      {
        id: "value-a6",
        name: "A6",
        value: "a6",
        usageCount: 4,
      },
    ],
  },
  {
    id: "option-capacity",
    key: "capacidad",
    name: "Capacidad",
    isActive: true,
    categoryIds: ["category-bottles"],
    usageCount: 6,
    values: [
      {
        id: "value-500ml",
        name: "500 ml",
        value: "500-ml",
        usageCount: 6,
      },
    ],
  },
];

function Harness({
  initialValue = [],
}: {
  initialValue?: EditableCatalogAttribute[];
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <CatalogAttributesEditor
      value={value}
      options={options}
      categoryId="category-notebooks"
      onChange={setValue}
    />
  );
}

describe("CatalogAttributesEditor", () => {
  afterEach(cleanup);

  it("suggests category features and reuses an existing canonical value", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Formato" }));

    expect(
      screen.getByRole("combobox", { name: "Nombre de característica 1" }),
    ).toHaveValue("Formato");

    const valueInput = screen.getByRole("combobox", {
      name: "Valor de característica 1",
    });
    await user.click(valueInput);
    await user.click(screen.getByRole("option", { name: /A5/ }));

    expect(valueInput).toHaveValue("A5");
    expect(screen.getByText("2 valores existentes")).toBeInTheDocument();
  });

  it("canonicalizes a manually typed feature that already exists", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={[
          {
            key: "",
            name: "",
            value: "",
            evidence: "Confirmado manualmente por administración",
          },
        ]}
      />,
    );

    const featureInput = screen.getByRole("combobox", {
      name: "Nombre de característica 1",
    });
    await user.type(featureInput, "formato");
    await user.tab();

    expect(featureInput).toHaveValue("Formato");
    expect(screen.getByText("Existente")).toBeInTheDocument();
  });

  it("warns instead of silently accepting the same feature twice", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={[
          {
            key: "formato",
            name: "Formato",
            value: "A5",
            evidence: "Característica guardada en el catálogo",
          },
          {
            key: "",
            name: "",
            value: "",
            evidence: "Confirmado manualmente por administración",
          },
        ]}
      />,
    );

    const duplicateInput = screen.getByRole("combobox", {
      name: "Nombre de característica 2",
    });
    await user.type(duplicateInput, "Formato");

    expect(
      screen.getByText("Esta característica ya está agregada."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Formato.*Ya agregada/ }),
    ).toBeDisabled();
  });

  it("keeps a genuinely new feature editable until the product is saved", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={[
          {
            key: "",
            name: "",
            value: "",
            evidence: "Confirmado manualmente por administración",
          },
        ]}
      />,
    );

    const featureInput = screen.getByRole("combobox", {
      name: "Nombre de característica 1",
    });
    await user.type(featureInput, "Tipo de papel");

    expect(featureInput).toHaveValue("Tipo de papel");
    expect(screen.getByText("Nueva")).toBeInTheDocument();
    expect(
      screen.getByText(/“Tipo de papel” se creará al guardar/),
    ).toBeInTheDocument();
  });
});
