"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Color, Design } from "@prisma/client";
import { MousePointerClick } from "lucide-react";
import { useEffect, useState } from "react";

interface VariantMatrixProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    selectedCombinations: { colorId: string; designId: string }[],
  ) => void;
  colors: Color[];
  designs: Design[];
}

export const VariantMatrix: React.FC<VariantMatrixProps> = ({
  isOpen,
  onClose,
  onConfirm,
  colors,
  designs,
}) => {
  const [selectedCells, setSelectedCells] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, boolean> = {};
      colors.forEach((c) => {
        designs.forEach((d) => {
          initial[`${c.id}|${d.id}`] = true;
        });
      });
      setSelectedCells(initial);
    }
  }, [isOpen, colors, designs]);

  const toggleCell = (colorId: string, designId: string) => {
    const key = `${colorId}|${designId}`;
    setSelectedCells((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleRow = (designId: string) => {
    // Check if currently all selected to determine intent (toggle off)
    // or if mixed/none selected (toggle on)
    const allSelected = colors.every(
      (c) => selectedCells[`${c.id}|${designId}`],
    );
    const nextState = !allSelected;

    setSelectedCells((prev) => {
      const next = { ...prev };
      colors.forEach((c) => {
        next[`${c.id}|${designId}`] = nextState;
      });
      return next;
    });
  };

  const toggleColumn = (colorId: string) => {
    const allSelected = designs.every(
      (d) => selectedCells[`${colorId}|${d.id}`],
    );
    const nextState = !allSelected;

    setSelectedCells((prev) => {
      const next = { ...prev };
      designs.forEach((d) => {
        next[`${colorId}|${d.id}`] = nextState;
      });
      return next;
    });
  };

  const toggleAll = () => {
    const totalCombinations = colors.length * designs.length;
    const selectedCount = Object.values(selectedCells).filter(Boolean).length;
    const isAllSelected =
      totalCombinations > 0 && selectedCount === totalCombinations;
    const nextState = !isAllSelected;

    const next: Record<string, boolean> = {};
    if (nextState) {
      // Select All
      colors.forEach((c) => {
        designs.forEach((d) => {
          next[`${c.id}|${d.id}`] = true;
        });
      });
    }
    // If nextState is false, we return empty object (deselect all)
    setSelectedCells(next);
  };

  const handleConfirm = () => {
    const combinations: { colorId: string; designId: string }[] = [];
    Object.entries(selectedCells).forEach(([key, isSelected]) => {
      if (isSelected) {
        const [colorId, designId] = key.split("|");
        combinations.push({ colorId, designId });
      }
    });
    onConfirm(combinations);
    onClose();
  };

  const totalCombinations = colors.length * designs.length;
  const selectedCount = Object.values(selectedCells).filter(Boolean).length;
  const isAllSelected =
    totalCombinations > 0 && selectedCount === totalCombinations;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[95vw] flex-col">
        <DialogHeader>
          <DialogTitle>Configurar Combinaciones Válidas</DialogTitle>
          <DialogDescription>
            Matriz de variantes: Haz clic en los encabezados para
            activar/desactivar filas o columnas completas.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex max-h-[60vh] flex-col overflow-hidden rounded-md border">
          <ScrollArea className="h-full">
            <div className="relative w-full">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow className="hover:bg-background">
                    <TableHead
                      className="sticky left-0 z-30 min-w-[150px] cursor-pointer bg-background transition-colors hover:bg-muted/80"
                      onClick={toggleAll}
                    >
                      <div className="flex h-12 items-center gap-2 px-2 text-xs font-bold text-primary">
                        <MousePointerClick className="h-4 w-4" />
                        <span>Diseño \ Color</span>
                      </div>
                    </TableHead>
                    {colors.map((c) => {
                      const isColumnFull = designs.every(
                        (d) => selectedCells[`${c.id}|${d.id}`],
                      );
                      return (
                        <TableHead
                          key={c.id}
                          className={cn(
                            "min-w-[100px] cursor-pointer text-center transition-colors hover:bg-muted/80",
                            isColumnFull && "bg-muted/30",
                          )}
                          onClick={() => toggleColumn(c.id)}
                        >
                          <div className="flex flex-col items-center justify-center gap-2 py-2">
                            <div
                              className="h-6 w-6 rounded-full border shadow-sm"
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            />
                            <div className="text-xs font-medium text-muted-foreground">
                              {c.name}
                            </div>
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {designs.map((d) => {
                    const isRowFull = colors.every(
                      (c) => selectedCells[`${c.id}|${d.id}`],
                    );
                    return (
                      <TableRow key={d.id}>
                        <TableCell
                          className={cn(
                            "sticky left-0 z-10 cursor-pointer bg-background font-medium transition-colors hover:bg-muted/80",
                            isRowFull && "bg-muted/30",
                          )}
                          onClick={() => toggleRow(d.id)}
                        >
                          <div className="flex items-center gap-2.5 pr-2">
                            {/* Optional indicator could go here, but background color might be enough */}
                            <span className="truncate">{d.name}</span>
                          </div>
                        </TableCell>
                        {colors.map((c) => {
                          const key = `${c.id}|${d.id}`;
                          const isChecked = !!selectedCells[key];
                          return (
                            <TableCell
                              key={key}
                              className={cn(
                                "cursor-pointer p-0 text-center transition-colors hover:bg-muted/50",
                                isChecked && "bg-primary/5",
                              )}
                              onClick={() => toggleCell(c.id, d.id)}
                            >
                              <div className="flex h-16 items-center justify-center">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleCell(c.id, d.id)}
                                  // Stop propagation to avoid double toggle if cell has handler too
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="mt-4">
          <div className="flex-1 self-center text-sm text-muted-foreground">
            {Object.values(selectedCells).filter(Boolean).length} combinaciones
            seleccionadas
          </div>
          <Button variant="outline" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} type="button">
            Generar Variantes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
