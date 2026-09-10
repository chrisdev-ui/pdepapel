import type { Appearance } from "@clerk/types";

/**
 * Clerk components styled with the panel tokens (yankees primary, Inter,
 * 0.5rem radius, baby-blue accent) so the sign-in card and the user menu look
 * like the rest of the dashboard.
 */
export const adminClerkAppearance: Appearance = {
  layout: {
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
    logoPlacement: "none",
    shimmer: false,
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: "#221B41",
    colorText: "#0f172a",
    colorTextSecondary: "#64748b",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#0f172a",
    colorDanger: "#dc2626",
    colorSuccess: "#00994d",
    fontFamily: "inherit",
    fontFamilyButtons: "inherit",
    fontSize: "14px",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-full rounded-none !border-0 !bg-transparent !shadow-none",
    card: "w-full gap-5 rounded-none !border-0 !bg-transparent !px-0 !py-0 !shadow-none",
    main: "gap-5",
    // The page shell owns the heading.
    header: "hidden",
    socialButtons: "flex flex-col gap-2 [&_button]:w-full",
    socialButtonsBlockButton:
      "h-10 rounded-md border border-input bg-white text-sm font-medium text-foreground shadow-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
    socialButtonsBlockButtonText: "font-medium",
    dividerLine: "bg-border",
    dividerText: "text-xs text-muted-foreground",
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "h-10 rounded-md border border-input bg-white px-3 text-sm shadow-none focus:border-ring focus:ring-2 focus:ring-ring/30",
    formFieldErrorText: "text-sm text-destructive",
    formFieldHintText: "text-xs text-muted-foreground",
    formButtonPrimary:
      "h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_span]:font-semibold",
    footer: "!bg-transparent [&>*]:!bg-transparent",
    // No sign-up on the panel: accounts are created on the storefront.
    footerAction: "hidden",
    footerActionText: "text-sm text-muted-foreground",
    footerActionLink: "text-sm font-semibold text-primary underline underline-offset-4",
    identityPreview: "rounded-md border border-border bg-muted/40",
    alternativeMethodsBlockButton: "h-10 rounded-md border border-input text-sm font-medium",
    otpCodeFieldInput: "h-10 rounded-md border-input",
    userButtonPopoverCard: "rounded-lg border border-border shadow-md",
    userButtonPopoverActionButton: "text-sm",
    userButtonPopoverFooter: "hidden",
  },
};
