"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Box } from "@prisma/client";

interface BoxSelectProps {
  boxes: Box[];
  value?: string;
  onChange: (boxId: string) => void;
  id: string;
  disabled?: boolean;
}

export function BoxSelect({
  boxes,
  value,
  onChange,
  id,
  disabled,
}: BoxSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Caja</Label>
      <Select
        value={value || "auto"}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Automática (recomendada)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Automática (recomendada)</SelectItem>
          {boxes.map((box) => (
            <SelectItem key={box.id} value={box.id}>
              {box.name} ({box.width}×{box.height}×{box.length} cm)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
