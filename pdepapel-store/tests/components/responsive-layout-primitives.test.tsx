// @vitest-environment jsdom

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("responsive layout primitives", () => {
  it("keeps dialogs, sheets, and drawers within a shrinkable viewport", () => {
    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Diálogo de prueba</DialogTitle>
            <p>REFERENCIA-MUY-LARGA-QUE-NO-DEBE-AGRANDAR-EL-DIÁLOGO</p>
          </DialogContent>
        </Dialog>
        <Sheet open>
          <SheetContent>
            <SheetTitle>Panel de prueba</SheetTitle>
            <p>REFERENCIA-MUY-LARGA-QUE-NO-DEBE-AGRANDAR-EL-PANEL</p>
          </SheetContent>
        </Sheet>
        <Drawer open>
          <DrawerContent>
            <DrawerTitle>Cajón de prueba</DrawerTitle>
            <p>REFERENCIA-MUY-LARGA-QUE-NO-DEBE-AGRANDAR-EL-CAJÓN</p>
          </DrawerContent>
        </Drawer>
      </>,
    );

    const dialog = screen
      .getByText("Diálogo de prueba")
      .closest('[role="dialog"]');
    const sheet = screen
      .getByText("Panel de prueba")
      .closest('[role="dialog"]');
    const drawer = screen
      .getByText("Cajón de prueba")
      .closest('[role="dialog"]');

    expect(dialog).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "min-w-0",
      "overflow-y-auto",
      "[&>*]:min-w-0",
    );
    expect(sheet).toHaveClass("min-w-0", "overflow-y-auto", "[&>*]:min-w-0");
    expect(drawer).toHaveClass("min-w-0", "overflow-y-auto", "[&>*]:min-w-0");
  });

  it("allows standard controls to shrink within responsive form layouts", () => {
    render(
      <>
        <Input data-testid="input" />
        <Textarea data-testid="textarea" />
        <Select>
          <SelectTrigger data-testid="select">
            <SelectValue placeholder="Opción extensa" />
          </SelectTrigger>
        </Select>
      </>,
    );

    expect(screen.getByTestId("input")).toHaveClass("min-w-0");
    expect(screen.getByTestId("textarea")).toHaveClass("min-w-0");
    expect(screen.getByTestId("select")).toHaveClass("min-w-0");
  });

  it("can render default-open accordion content without a layout animation", () => {
    render(
      <Accordion type="single" defaultValue="filters">
        <AccordionItem value="filters">
          <AccordionTrigger>Filtros</AccordionTrigger>
          <AccordionContent animate={false}>Opciones</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const content = screen.getByText("Opciones").parentElement;
    expect(content).toHaveAttribute("data-state", "open");
    expect(content).not.toHaveClass("data-[state=open]:animate-accordion-down");
    expect(content).not.toHaveClass("data-[state=closed]:animate-accordion-up");
  });
});
