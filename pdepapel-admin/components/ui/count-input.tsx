import { StockQuantityInput, type StockQuantityInputProps } from "@/components/ui/stock-quantity-input";

export type CountInputProps = Omit<
  StockQuantityInputProps,
  "ariaLabel" | "ariaDescribedBy"
> & {
  ariaLabel: string;
  ariaDescribedBy?: string;
};

export function CountInput({
  ariaLabel,
  ariaDescribedBy,
  ...props
}: CountInputProps) {
  return (
    <StockQuantityInput
      ariaLabel={ariaLabel}
      ariaDescribedBy={ariaDescribedBy}
      {...props}
    />
  );
}
