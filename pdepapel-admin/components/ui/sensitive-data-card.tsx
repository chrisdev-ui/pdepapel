"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSensitiveDataStore } from "@/hooks/use-sensitive-data-store";
import { currencyFormatter, numberFormatter } from "@/lib/utils";
import { Asterisk, DollarSign, Eye, EyeOff } from "lucide-react";
import { useMemo } from "react";

interface SensitiveDataCardProps {
  id: string;
  title: string;
  value: number;
  format?: "currency" | "number";
  icon?: React.ReactNode;
}

export const SensitiveDataCard: React.FC<SensitiveDataCardProps> = ({
  id,
  title,
  value,
  format = "currency",
  icon = <DollarSign className="h-4 w-4 text-muted-foreground" />,
}) => {
  const { cards, toggleVisibility } = useSensitiveDataStore();
  const isVisible = useMemo(() => cards[id]?.isVisible ?? true, [cards, id]);

  const formattedValue = useMemo(
    () =>
      format === "currency"
        ? currencyFormatter.format(value)
        : numberFormatter.format(value),
    [format, value],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pr-9">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold">
            {isVisible ? (
              formattedValue
            ) : (
              <div className="flex">
                <Asterisk className="h-4 w-4" />
                <Asterisk className="h-4 w-4" />
                <Asterisk className="h-4 w-4" />
                <Asterisk className="h-4 w-4" />
                <Asterisk className="h-4 w-4" />
                <Asterisk className="h-4 w-4" />
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleVisibility(id)}
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span className="sr-only">
              {isVisible ? "Esconde" : "Muestra"} la información sensible
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
