// @vitest-environment jsdom

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MeasurementInput } from "@/components/ui/measurement-input";
import { PercentageInput } from "@/components/ui/percentage-input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("responsive layout primitives", () => {
  it("keeps all overlay types within the viewport and allows their children to shrink", () => {
    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Diálogo de prueba</DialogTitle>
            <p>SKU-MUY-LARGO-QUE-NO-DEBE-AGRANDAR-EL-DIÁLOGO</p>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Alerta de prueba</AlertDialogTitle>
            <p>SKU-MUY-LARGO-QUE-NO-DEBE-AGRANDAR-LA-ALERTA</p>
          </AlertDialogContent>
        </AlertDialog>
        <Sheet open>
          <SheetContent>
            <SheetTitle>Panel de prueba</SheetTitle>
            <p>SKU-MUY-LARGO-QUE-NO-DEBE-AGRANDAR-EL-PANEL</p>
          </SheetContent>
        </Sheet>
      </>,
    );

    const dialog = screen
      .getByText("Diálogo de prueba")
      .closest('[role="dialog"]');
    const alertDialog = screen
      .getByText("Alerta de prueba")
      .closest('[role="alertdialog"]');
    const sheet = screen
      .getByText("Panel de prueba")
      .closest('[role="dialog"]');

    expect(dialog).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "min-w-0",
      "overflow-y-auto",
      "[&>*]:min-w-0",
    );
    expect(alertDialog).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "min-w-0",
      "overflow-y-auto",
      "[&>*]:min-w-0",
    );
    expect(sheet).toHaveClass("min-w-0", "overflow-y-auto", "[&>*]:min-w-0");
  });

  it("allows form controls to shrink within grids and dialogs", () => {
    render(
      <>
        <Input data-testid="input" />
        <Textarea data-testid="textarea" />
        <PercentageInput data-testid="percentage" />
        <MeasurementInput data-testid="measurement" unit="cm" />
        <Select>
          <SelectTrigger data-testid="select">
            <SelectValue placeholder="Opción extensa" />
          </SelectTrigger>
        </Select>
      </>,
    );

    const percentage = screen.getByTestId("percentage");
    const measurement = screen.getByTestId("measurement");

    expect(screen.getByTestId("input")).toHaveClass("min-w-0");
    expect(screen.getByTestId("textarea")).toHaveClass("min-w-0");
    expect(percentage).toHaveClass("min-w-0");
    expect(percentage.parentElement).toHaveClass("min-w-0");
    expect(measurement).toHaveClass("min-w-0");
    expect(measurement.parentElement).toHaveClass("min-w-0");
    expect(screen.getByTestId("select")).toHaveClass("min-w-0");
  });
});
