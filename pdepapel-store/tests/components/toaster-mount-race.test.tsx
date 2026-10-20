/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/providers/toaster";

afterEach(cleanup);

function ToastOnMount() {
  const { toast } = useToast();
  useEffect(() => {
    toast({ title: "Aviso al montar" });
  }, [toast]);
  return null;
}

describe("avisos disparados al montar la página", () => {
  it("se muestran aunque el Toaster vaya después en el árbol", async () => {
    render(
      <>
        <ToastOnMount />
        <Toaster />
      </>,
    );

    expect(await screen.findByText("Aviso al montar")).toBeInTheDocument();
  });
});
