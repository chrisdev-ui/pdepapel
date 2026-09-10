import type { Appearance } from "@clerk/types";

/**
 * Clerk components styled with the storefront tokens (navy primary, kawaii
 * tints, Caudex headings, 44 px controls) so the sign-in and sign-up cards
 * read as part of the shop instead of a third-party widget. Shared by the
 * auth pages and the user button.
 */
export const storefrontClerkAppearance: Appearance = {
  layout: {
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
    logoPlacement: "none",
    shimmer: false,
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: "#221B41",
    colorText: "#221B41",
    colorTextSecondary: "#6B7280",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#221B41",
    colorDanger: "#DC2626",
    colorSuccess: "#16A34A",
    fontFamily: "var(--font-fredoka), system-ui, sans-serif",
    fontFamilyButtons: "var(--font-fredoka), system-ui, sans-serif",
    fontSize: "15px",
    borderRadius: "0.75rem",
    spacingUnit: "1rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-full rounded-none !border-0 !bg-transparent !shadow-none",
    card: "w-full gap-5 rounded-none !border-0 !bg-transparent !px-0 !py-0 !shadow-none",
    main: "gap-5",
    // The page shell already renders the h1 and the lede.
    header: "hidden",
    socialButtons: "flex flex-col gap-2.5 [&_button]:w-full",
    socialButtonsBlockButton:
      "min-h-[44px] rounded-full border-[1.5px] border-border bg-white font-sans text-[15px] font-semibold text-blue-yankees shadow-none transition hover:border-blue-yankees hover:bg-kawaii-lavender-light/30 focus-visible:ring-2 focus-visible:ring-kawaii-pink",
    socialButtonsBlockButtonText: "font-sans font-semibold",
    socialButtonsProviderIcon: "h-5 w-5",
    dividerLine: "bg-border",
    dividerText: "text-xs text-muted-foreground",
    formFieldLabel: "font-serif text-[13px] font-semibold text-blue-yankees",
    formFieldInput:
      "min-h-[44px] rounded-md border border-input bg-white px-3 text-[15px] text-blue-yankees shadow-none focus:border-blue-yankees focus:ring-2 focus:ring-kawaii-pink/60",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-blue-yankees",
    formFieldErrorText: "text-sm text-rose-700",
    formFieldSuccessText: "text-sm text-emerald-700",
    formFieldHintText: "text-xs text-muted-foreground",
    formButtonPrimary:
      "min-h-[46px] rounded-full bg-blue-yankees font-sans text-[15px] font-bold text-white shadow-none transition hover:bg-blue-yankees/90 focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2 [&_span]:font-sans",
    formButtonReset: "font-sans font-semibold text-blue-yankees hover:bg-transparent hover:underline",
    footer: "!bg-transparent [&>*]:!bg-transparent",
    footerAction: "justify-center gap-1 text-sm",
    footerActionText: "text-sm text-muted-foreground",
    footerActionLink:
      "font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4 hover:text-blue-yankees/80",
    identityPreview: "rounded-xl border border-border bg-muted/40",
    identityPreviewText: "text-blue-yankees",
    identityPreviewEditButton: "text-blue-yankees",
    alternativeMethodsBlockButton:
      "min-h-[44px] rounded-full border-[1.5px] border-border font-sans font-semibold text-blue-yankees",
    otpCodeFieldInput: "min-h-[44px] rounded-md border-input text-blue-yankees",
    backLink: "font-sans font-semibold text-blue-yankees",
    formResendCodeLink: "font-sans font-semibold text-blue-yankees",
    alert: "rounded-xl",
    badge: "rounded-full",
    userButtonPopoverCard: "rounded-2xl border border-pink-shell/30 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]",
    userButtonPopoverActionButton: "font-sans text-blue-yankees",
    userButtonPopoverFooter: "hidden",
  },
};
