import { AlertTriangle, Check } from "lucide-react";

import { formatOrderDate } from "@/lib/order-dates";
import type { TimelineStep } from "@/lib/order-status";
import { cn } from "@/lib/utils";

interface OrderTimelineProps {
  steps: TimelineStep[];
}

/**
 * Four milestones on one line (stacked on phones). Only the dates that are
 * actually known are printed, so no step pretends to have happened.
 */
export function OrderTimeline({ steps }: OrderTimelineProps) {
  const lastDoneIndex = steps.reduce(
    (last, step, index) => (step.state === "done" ? index : last),
    -1,
  );
  const progress =
    steps.length > 1 ? Math.max(0, lastDoneIndex) / (steps.length - 1) : 0;

  return (
    <ol
      aria-label="Progreso del pedido"
      className="relative grid gap-4 sm:grid-cols-4 sm:gap-2"
    >
      <div
        aria-hidden="true"
        className="absolute left-[15px] top-4 hidden h-[calc(100%-2rem)] w-0.5 bg-border sm:left-[12.5%] sm:right-[12.5%] sm:top-[15px] sm:h-0.5 sm:w-auto sm:bg-border md:block"
      />
      <div
        aria-hidden="true"
        className="absolute left-[12.5%] top-[15px] hidden h-0.5 rounded-full bg-gradient-to-r from-blue-yankees to-pink-froly transition-all md:block"
        style={{ width: `calc(75% * ${progress})` }}
      />
      {steps.map((step, index) => {
        const isDone = step.state === "done";
        const isCurrent = step.state === "current";
        const isIssue = step.state === "issue";

        return (
          <li
            key={step.id}
            className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center"
            aria-current={isCurrent || isIssue ? "step" : undefined}
          >
            <span
              className={cn(
                "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white font-sans text-xs font-bold",
                isDone && "border-pink-froly bg-pink-froly text-white",
                isCurrent &&
                  "border-blue-yankees bg-blue-yankees text-white ring-4 ring-pink-froly/25",
                isIssue &&
                  "border-rose-600 bg-rose-600 text-white ring-4 ring-rose-600/20",
                step.state === "pending" && "border-border text-muted-foreground",
              )}
            >
              {isDone ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : isIssue ? (
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "font-sans text-sm font-bold leading-tight",
                  step.state === "pending"
                    ? "text-muted-foreground"
                    : isIssue
                      ? "text-rose-700"
                      : "text-blue-yankees",
                )}
              >
                {step.label}
                {isDone && <span className="sr-only"> (completado)</span>}
                {isCurrent && <span className="sr-only"> (en curso)</span>}
              </span>
              {step.date ? (
                <time
                  dateTime={step.date}
                  className="text-xs text-muted-foreground"
                >
                  {formatOrderDate(step.date, "short")}
                </time>
              ) : step.detail ? (
                <span className="text-xs text-muted-foreground">
                  {step.detail}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
