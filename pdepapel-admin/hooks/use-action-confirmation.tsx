"use client";

import {
  ActionConfirmationDialog,
  type ActionConfirmationDialogProps,
} from "@/components/modals/action-confirmation-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

type ConfirmationOptions = Pick<
  ActionConfirmationDialogProps,
  "title" | "description" | "confirmLabel" | "cancelLabel" | "destructive"
>;

type PendingConfirmation = ConfirmationOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useActionConfirmation() {
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const pendingConfirmationRef = useRef<PendingConfirmation | null>(null);

  const settleConfirmation = useCallback((confirmed: boolean) => {
    const pending = pendingConfirmationRef.current;
    if (!pending) return;

    pendingConfirmationRef.current = null;
    setPendingConfirmation(null);
    pending.resolve(confirmed);
  }, []);

  const requestConfirmation = useCallback(
    (options: ConfirmationOptions) =>
      new Promise<boolean>((resolve) => {
        pendingConfirmationRef.current?.resolve(false);

        const pending = { ...options, resolve };
        pendingConfirmationRef.current = pending;
        setPendingConfirmation(pending);
      }),
    [],
  );

  useEffect(
    () => () => {
      pendingConfirmationRef.current?.resolve(false);
      pendingConfirmationRef.current = null;
    },
    [],
  );

  const confirmationDialog = pendingConfirmation ? (
    <ActionConfirmationDialog
      {...pendingConfirmation}
      isOpen
      onOpenChange={(open) => {
        if (!open) settleConfirmation(false);
      }}
      onConfirm={() => settleConfirmation(true)}
    />
  ) : null;

  return { requestConfirmation, confirmationDialog };
}
