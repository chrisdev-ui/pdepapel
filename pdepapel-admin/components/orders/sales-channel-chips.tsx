"use client";

import type { OrderSalesChannel } from "@prisma/client";

import { SALES_CHANNEL_LABELS, SALES_CHANNELS } from "@/lib/order-sales-channel";
import { cn } from "@/lib/utils";

interface SalesChannelChipsProps {
  value: OrderSalesChannel | null | undefined;
  onChange: (value: OrderSalesChannel) => void;
  /** Visible label id, so the group is named by its heading. */
  labelledBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}

/** One tap: by where the customer reached us. No default, so the choice is deliberate. */
export function SalesChannelChips({ value, onChange, labelledBy, invalid, disabled, describedBy }: SalesChannelChipsProps) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(
        "flex max-w-full flex-wrap gap-1.5 rounded-2xl border bg-white p-1.5",
        invalid && "border-destructive",
      )}
      data-testid="sales-channel-chips"
    >
      {SALES_CHANNELS.map((channel) => {
        const active = value === channel;
        return (
          <button
            key={channel}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(channel)}
            className={cn(
              "h-9 min-w-[5.5rem] shrink-0 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              active ? "bg-primary text-primary-foreground" : "bg-muted/40 text-primary hover:bg-accent",
            )}
          >
            {SALES_CHANNEL_LABELS[channel]}
          </button>
        );
      })}
    </div>
  );
}
