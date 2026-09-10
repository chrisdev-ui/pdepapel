import {
  CustomerAddress,
  deleteCustomerAddress,
  getCustomerAddresses,
} from "@/actions/customer-addresses";
import { isShippingCoverageError } from "@/actions/get-shipping-quote";
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog";
import { AutocompleteLocation } from "@/components/ui/autocomplete-location";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ShippingRatesSelector } from "@/components/ui/shipping-rates-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { ShippingStatus } from "@/constants";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocations } from "@/hooks/use-locations";
import { useShippingQuote } from "@/hooks/use-shipping-quote";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { normalizePhoneForInput } from "@/lib/phone";
import {
  getShippingQuoteKey,
  groupShippingQuotes,
  isShippingQuoteFresh,
} from "@/lib/shipping-rates";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import {
  Bike,
  Check,
  ChevronDown,
  Home,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";

interface ShippingInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  allowSavedAddresses?: boolean;
  cartItems: { id: string; quantity: number }[];
  orderTotal: number;
  /** The order already qualifies for free shipping: rates show «Gratis». */
  freeShipping?: boolean;
}

const MEDELLIN_AREA_CITIES = [
  "medellin",
  "medellín",
  "envigado",
  "itagui",
  "itaguí",
  "sabaneta",
  "bello",
  "la estrella",
  "caldas",
  "copacabana",
  "girardota",
  "barbosa",
  "rionegro",
];

const WHATSAPP_SHIPPING = {
  carrierName: "Acordar por WhatsApp",
  courier: "Transportadora a Convenir",
  productName: "Envío Especial / Flete al Cobro",
  cost: 0,
  flete: 0,
  status: ShippingStatus.Preparing,
};

const MEDELLIN_SHIPPING = {
  carrierName: "Domicilio Mismo Día (Medellín)",
  courier: "Domiciliario Local",
  productName: "Entrega Mismo Día Medellín",
  cost: 0,
  flete: 0,
  status: ShippingStatus.Preparing,
};

const optionalInputClass = "bg-blue-purple/20 invalid:bg-pink-froly/20";

export const ShippingInfoStep = ({
  form,
  isLoading,
  allowSavedAddresses = true,
  cartItems,
  orderTotal,
  freeShipping = false,
}: ShippingInfoStepProps) => {
  const { getToken, isLoaded: isAuthLoaded, userId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [isDeletingAddress, setIsDeletingAddress] = useState(false);
  const [addressPendingDeletion, setAddressPendingDeletion] =
    useState<CustomerAddress | null>(null);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [addressActionError, setAddressActionError] = useState<string | null>(
    null,
  );
  const debouncedQuery = useDebounce(searchQuery, 300);
  const ratesLabelId = useId();
  const modeLabelId = useId();

  const { data: { results: locations } = {}, isLoading: isLoadingLocations } =
    useLocations(debouncedQuery);

  const selectedDaneCode = form.watch("daneCode");
  const address1 = form.watch("address1");
  const address2 = form.watch("address2");
  const neighborhood = form.watch("neighborhood");
  const company = form.watch("company");
  const addressReference = form.watch("addressReference");
  const selectedCity = form.watch("city") || "";
  const selectedDept = form.watch("department") || "";
  const wantsToSaveAddress = form.watch("saveAddress");
  const shippingOptionType = form.watch("shippingOptionType") || "ENVIOCLICK";
  const selectedRateId = form.watch("envioClickIdRate");
  const locationsDisabled = isLoading || isLoadingLocations;

  const hasOptionalDetails = Boolean(
    address2 || neighborhood || company || addressReference,
  );
  const [showDetails, setShowDetails] = useState(hasOptionalDetails);
  useEffect(() => {
    if (hasOptionalDetails) setShowDetails(true);
  }, [hasOptionalDetails]);

  // Exact match on the normalized city name inside Antioquia: «Medellín del
  // Ariari» (Meta) or «Bello» elsewhere must not light up the local badge.
  const isMedellinArea = useMemo(() => {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
    const city = normalize(selectedCity);
    const department = normalize(selectedDept);
    return (
      department === "antioquia" &&
      MEDELLIN_AREA_CITIES.map(normalize).includes(city)
    );
  }, [selectedCity, selectedDept]);

  // ---- Shipping quotes -------------------------------------------------
  const storedQuoteData = useCheckoutStore((state) => state.quoteData);
  const storedQuoteKey = useCheckoutStore((state) => state.quoteKey);
  const storedQuoteFetchedAt = useCheckoutStore(
    (state) => state.quoteFetchedAt,
  );
  const setStoredQuoteData = useCheckoutStore((state) => state.setQuoteData);

  const canFetchQuotes =
    Boolean(selectedDaneCode) &&
    Boolean(address1 && address1.trim().length >= 2) &&
    cartItems.length > 0;

  const quoteKey = useMemo(
    () =>
      canFetchQuotes
        ? getShippingQuoteKey({
            daneCode: selectedDaneCode,
            address: address1,
            orderTotal,
            items: cartItems.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
          })
        : null,
    [address1, canFetchQuotes, cartItems, orderTotal, selectedDaneCode],
  );
  const debouncedQuoteKey = useDebounce(quoteKey, 600);
  const requestedKeyRef = useRef<string | null>(null);

  const {
    mutate: fetchQuotes,
    isPending: isLoadingQuotes,
    error: quoteError,
    reset: resetQuoteRequest,
  } = useShippingQuote({
    onMutate: () => {
      trackCustomerEvent("shipping_quote_requested", {
        checkout_step: 2,
        checkout_step_name: "envio",
      });
    },
    onSuccess: (data, variables) => {
      const quoteCount = data.quotes?.length ?? 0;
      trackCustomerEvent(
        quoteCount > 0
          ? "shipping_quote_succeeded"
          : "shipping_quote_no_results",
        {
          checkout_step: 2,
          checkout_step_name: "envio",
          quote_count: quoteCount,
        },
      );
      setStoredQuoteData(
        data,
        getShippingQuoteKey({
          daneCode: variables.destination.daneCode,
          address: variables.destination.address,
          orderTotal: variables.orderTotal,
          items: variables.items,
        }),
      );
    },
    onError: () => {
      trackCustomerEvent("shipping_quote_failed", {
        checkout_step: 2,
        checkout_step_name: "envio",
        failure_type: "request_error",
      });
    },
  });

  const requestQuotes = useCallback(
    (forceRefresh = false) => {
      if (!canFetchQuotes) return;
      requestedKeyRef.current = quoteKey;
      fetchQuotes({
        destination: { daneCode: selectedDaneCode, address: address1 },
        orderTotal,
        items: cartItems.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        isCOD: true,
        forceRefresh,
      });
    },
    [
      address1,
      canFetchQuotes,
      cartItems,
      fetchQuotes,
      orderTotal,
      quoteKey,
      selectedDaneCode,
    ],
  );

  const quotesMatchCurrentAddress =
    Boolean(storedQuoteData) &&
    storedQuoteKey === quoteKey &&
    isShippingQuoteFresh(storedQuoteFetchedAt);

  // Quotes are fetched as soon as city + address are complete (debounced),
  // and again whenever the address or the cart changes.
  useEffect(() => {
    if (shippingOptionType !== "ENVIOCLICK") return;
    if (!debouncedQuoteKey || debouncedQuoteKey !== quoteKey) return;
    if (quotesMatchCurrentAddress) return;
    if (isLoadingQuotes && requestedKeyRef.current === debouncedQuoteKey) return;
    if (quoteError && requestedKeyRef.current === debouncedQuoteKey) return;
    requestQuotes();
  }, [
    debouncedQuoteKey,
    isLoadingQuotes,
    quoteError,
    quoteKey,
    quotesMatchCurrentAddress,
    requestQuotes,
    shippingOptionType,
  ]);

  const groupedQuotes = useMemo(
    () =>
      quotesMatchCurrentAddress
        ? groupShippingQuotes(storedQuoteData?.quotes)
        : [],
    [quotesMatchCurrentAddress, storedQuoteData],
  );

  const applyRate = useCallback(
    (idRate: number) => {
      const selectedQuote = groupedQuotes.find(
        (quote) => quote.idRate === idRate,
      );
      if (!selectedQuote) return;
      form.setValue("envioClickIdRate", idRate, { shouldDirty: true });
      form.setValue("shipping", {
        carrierName: selectedQuote.carrier,
        courier: selectedQuote.carrier,
        productName: selectedQuote.product,
        flete: selectedQuote.flete,
        minimumInsurance: selectedQuote.minimumInsurance,
        deliveryDays: Number(selectedQuote.deliveryDays),
        isCOD: selectedQuote.isCOD,
        cost: selectedQuote.totalCost,
        status: ShippingStatus.Preparing,
      });
      void form.trigger("envioClickIdRate");
    },
    [form, groupedQuotes],
  );

  // Keep the selection consistent with the rates on screen: drop a rate that
  // no longer exists and preselect the cheapest one when nothing is chosen.
  useEffect(() => {
    if (shippingOptionType !== "ENVIOCLICK") return;
    if (groupedQuotes.length === 0) {
      if (selectedRateId && !quotesMatchCurrentAddress && quoteKey) {
        form.setValue("envioClickIdRate", 0);
        form.setValue("shipping", {});
      }
      return;
    }
    const stillValid = groupedQuotes.some(
      (quote) => quote.idRate === selectedRateId,
    );
    if (!stillValid) applyRate(groupedQuotes[0].idRate);
  }, [
    applyRate,
    form,
    groupedQuotes,
    quoteKey,
    quotesMatchCurrentAddress,
    selectedRateId,
    shippingOptionType,
  ]);

  const handleRetryQuotes = () => {
    resetQuoteRequest();
    requestQuotes(true);
  };

  const chooseWhatsAppShipping = () => {
    form.setValue("shippingOptionType", "CUSTOM_WHATSAPP", {
      shouldDirty: true,
    });
    form.setValue("shippingProvider", "MANUAL");
    form.setValue("envioClickIdRate", 0);
    form.setValue("shipping", WHATSAPP_SHIPPING);
  };

  // ---- Saved addresses -------------------------------------------------
  const applySavedAddress = useCallback(
    async (savedAddress: CustomerAddress) => {
      const options = { shouldDirty: true, shouldValidate: true };

      if (savedAddress.fullName?.trim()) {
        form.setValue("fullName", savedAddress.fullName.trim(), options);
      }
      const phone = normalizePhoneForInput(savedAddress.phone);
      if (phone) form.setValue("telephone", phone, options);
      if (savedAddress.documentId) {
        form.setValue("documentId", savedAddress.documentId, options);
      }
      form.setValue("address1", savedAddress.address || "", options);
      form.setValue("address2", savedAddress.address2 || "", options);
      form.setValue("city", savedAddress.city || "", options);
      form.setValue("department", savedAddress.department || "", options);
      form.setValue("daneCode", savedAddress.daneCode || "", options);
      form.setValue("neighborhood", savedAddress.neighborhood || "", options);
      form.setValue(
        "addressReference",
        savedAddress.addressReference || "",
        options,
      );
      form.setValue("company", savedAddress.company || "", options);
      form.setValue("savedAddressId", savedAddress.id, { shouldDirty: false });
      form.setValue("addressLabel", savedAddress.label || "", {
        shouldDirty: false,
      });
    },
    [form],
  );

  useEffect(() => {
    if (
      !allowSavedAddresses ||
      !isAuthLoaded ||
      !userId ||
      form.formState.isLoading
    ) {
      return;
    }

    let isCurrent = true;

    const loadSavedAddresses = async () => {
      setIsLoadingAddresses(true);
      setAddressActionError(null);

      try {
        const sessionToken = await getToken();
        if (!sessionToken) return;

        const addresses = await getCustomerAddresses(sessionToken);
        if (!isCurrent) return;

        setSavedAddresses(addresses);
        const currentSavedId = form.getValues("savedAddressId");
        const hasCurrentAddress = Boolean(
          form.getValues("address1") || form.getValues("daneCode"),
        );
        const preferredAddress =
          addresses.find((address) => address.id === currentSavedId) ??
          addresses.find((address) => address.isDefault) ??
          addresses[0];

        if (currentSavedId && preferredAddress?.id === currentSavedId) {
          setSelectedSavedAddressId(currentSavedId);
        } else if (!hasCurrentAddress && preferredAddress) {
          setSelectedSavedAddressId(preferredAddress.id);
          await applySavedAddress(preferredAddress);
        }
      } catch (error) {
        console.warn("No se pudieron cargar las direcciones guardadas", error);
        if (isCurrent) {
          setAddressActionError(
            "No pudimos cargar tus direcciones. Puedes ingresar una nueva normalmente.",
          );
        }
      } finally {
        if (isCurrent) setIsLoadingAddresses(false);
      }
    };

    void loadSavedAddresses();

    return () => {
      isCurrent = false;
    };
  }, [
    allowSavedAddresses,
    applySavedAddress,
    form,
    getToken,
    isAuthLoaded,
    userId,
  ]);

  const handleSavedAddressChange = async (value: string) => {
    setAddressActionError(null);
    if (value === "new") {
      setSelectedSavedAddressId("");
      form.setValue("savedAddressId", "", { shouldDirty: false });
      form.setValue("addressLabel", "", { shouldDirty: false });
      return;
    }

    const savedAddress = savedAddresses.find((address) => address.id === value);
    if (!savedAddress) return;

    setSelectedSavedAddressId(savedAddress.id);
    await applySavedAddress(savedAddress);
  };

  const confirmDeleteSelectedAddress = async () => {
    const selectedAddress = addressPendingDeletion;
    if (!selectedAddress || isDeletingAddress) return;

    setIsDeletingAddress(true);
    setAddressActionError(null);
    try {
      const sessionToken = await getToken();
      if (!sessionToken) return;

      await deleteCustomerAddress(selectedAddress.id, sessionToken);
      setSavedAddresses((addresses) =>
        addresses.filter((address) => address.id !== selectedAddress.id),
      );
      setSelectedSavedAddressId("");
      form.setValue("savedAddressId", "", { shouldDirty: false });
      form.setValue("saveAddress", false, { shouldDirty: false });
    } catch (error) {
      console.warn("No se pudo eliminar la dirección guardada", error);
      setAddressActionError(
        "No pudimos eliminar esta dirección. Intenta de nuevo.",
      );
    } finally {
      setIsDeletingAddress(false);
      setAddressPendingDeletion(null);
    }
  };

  const showSavedAddresses = allowSavedAddresses && Boolean(userId);
  const selectedSavedAddress = savedAddresses.find(
    (address) => address.id === selectedSavedAddressId,
  );

  const modeOptions = [
    {
      value: "ENVIOCLICK",
      icon: Truck,
      title: "Encomienda nacional",
      description: "Transportadoras a todo el país. Cotizamos al instante.",
      badge: null,
    },
    {
      value: "MEDELLIN_LOCAL",
      icon: Bike,
      title: "Domicilio mismo día",
      description: "Solo Medellín y Valle de Aburrá.",
      badge: isMedellinArea ? "Medellín" : null,
    },
    {
      value: "CUSTOM_WHATSAPP",
      icon: MessageSquare,
      title: "Acordar por WhatsApp",
      description: "Interrapidísimo contraentrega o casos especiales.",
      badge: null,
    },
  ] as const;

  return (
    <>
      <div className="space-y-6 duration-500 animate-in fade-in-0 slide-in-from-right-4">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
            ¿A dónde lo enviamos?
          </h2>
          <p className="text-sm text-muted-foreground">
            Las tarifas se calculan solas cuando completas ciudad y dirección.
          </p>
        </div>

        {showSavedAddresses && (
          <div className="space-y-3">
            <p className="font-serif text-xs font-semibold text-foreground/90">
              Tus direcciones guardadas
            </p>
            {isLoadingAddresses ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : (
              <RadioGroup
                value={selectedSavedAddressId || "new"}
                onValueChange={(value) => void handleSavedAddressChange(value)}
                disabled={Boolean(isLoading)}
                aria-label="Direcciones guardadas"
                className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
              >
                {savedAddresses.map((savedAddress) => {
                  const isSelected = selectedSavedAddressId === savedAddress.id;
                  return (
                    <div key={savedAddress.id} className="relative">
                      <RadioGroupItem
                        value={savedAddress.id}
                        id={`saved-${savedAddress.id}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`saved-${savedAddress.id}`}
                        className={cn(
                          "flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border-2 border-muted bg-card px-3.5 py-3 font-sans transition-[border-color,background-color] hover:border-primary/50",
                          "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-blue-purple/10",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/50",
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 stroke-[3]" />
                          )}
                        </span>
                        <Home
                          className="h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-semibold">
                            {savedAddress.label || "Dirección guardada"}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {savedAddress.address}
                            {savedAddress.city ? ` · ${savedAddress.city}` : ""}
                          </span>
                        </span>
                      </Label>
                    </div>
                  );
                })}
                <div className="relative">
                  <RadioGroupItem
                    value="new"
                    id="saved-new"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="saved-new"
                    className={cn(
                      "flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-muted bg-card px-3.5 py-3 font-sans transition-[border-color,background-color] hover:border-primary/50",
                      "peer-data-[state=checked]:border-solid peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-blue-purple/10",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                        !selectedSavedAddressId
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/50",
                      )}
                    >
                      {!selectedSavedAddressId && (
                        <Check className="h-3 w-3 stroke-[3]" />
                      )}
                    </span>
                    <Plus
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold">
                      {savedAddresses.length > 0
                        ? "Nueva dirección"
                        : "Escribir mi dirección"}
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            )}
            {selectedSavedAddress && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-full text-destructive hover:text-destructive"
                onClick={() => setAddressPendingDeletion(selectedSavedAddress)}
                disabled={isDeletingAddress || Boolean(isLoading)}
              >
                {isDeletingAddress ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Eliminar «{selectedSavedAddress.label || "esta dirección"}»
              </Button>
            )}
            {addressActionError && (
              <p className="text-sm text-muted-foreground" role="status">
                {addressActionError}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="daneCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground/90">
                  Ciudad y departamento *
                </FormLabel>
                <FormControl>
                  <AutocompleteLocation
                    options={locations || []}
                    value={field.value || ""}
                    defaultDisplayValue={
                      selectedCity && selectedDept
                        ? `${selectedCity} - ${selectedDept}`
                        : undefined
                    }
                    onSearch={setSearchQuery}
                    onChange={async (value, location) => {
                      field.onChange(value);
                      if (location) {
                        form.setValue("city", location.city);
                        form.setValue("department", location.department);
                        await form.trigger(["city", "department", "daneCode"]);
                      }
                    }}
                    onClear={() => {
                      form.setValue("city", "");
                      form.setValue("department", "");
                    }}
                    isLoading={isLoadingLocations}
                    disabled={isLoading}
                    placeholder="Escribe tu ciudad…"
                  />
                </FormControl>
                <FormDescription>
                  Escribe y elige de la lista. Si no aparece, escríbenos por
                  WhatsApp.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address1"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground/90">Dirección *</FormLabel>
                <FormControl>
                  <Input
                    className={optionalInputClass}
                    disabled={locationsDisabled}
                    autoComplete="street-address"
                    placeholder="Ej. Calle 12 AA Sur #55D-30"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Calle, carrera o vereda con número.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-yankees underline-offset-4 hover:underline"
          >
            {showDetails ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Agregar apartamento, barrio, referencia o empresa
          </button>

          {showDetails && (
            <div className="grid grid-cols-1 gap-5 duration-300 animate-in fade-in-0 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="address2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/90">
                      Apartamento, torre u oficina
                    </FormLabel>
                    <FormControl>
                      <Input
                        className={optionalInputClass}
                        disabled={locationsDisabled}
                        autoComplete="address-line2"
                        placeholder="Ej. Torre 2, apto 1801"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="neighborhood"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/90">Barrio</FormLabel>
                    <FormControl>
                      <Input
                        className={optionalInputClass}
                        disabled={locationsDisabled}
                        placeholder="Ej. Belén"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/90">
                      Referencia para el mensajero
                    </FormLabel>
                    <FormControl>
                      <Input
                        className={optionalInputClass}
                        disabled={locationsDisabled}
                        maxLength={25}
                        placeholder="Ej. Portería, frente al parque"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Hasta 25 caracteres.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/90">
                      Empresa (solo si aplica)
                    </FormLabel>
                    <FormControl>
                      <Input
                        className={optionalInputClass}
                        disabled={locationsDisabled}
                        autoComplete="organization"
                        placeholder="Nombre de la empresa"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {showSavedAddresses && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="save-address"
                  checked={wantsToSaveAddress}
                  onCheckedChange={(checked) => {
                    form.setValue("saveAddress", checked === true, {
                      shouldDirty: true,
                    });
                  }}
                  disabled={Boolean(isLoading)}
                  className="mt-0.5 h-5 w-5 border-blue-yankees bg-white"
                />
                <Label
                  htmlFor="save-address"
                  className="cursor-pointer text-sm leading-5"
                >
                  {selectedSavedAddressId
                    ? "Actualizar esta dirección con los datos de este pedido"
                    : "Guardar esta dirección para mi próxima compra"}
                </Label>
              </div>
              {wantsToSaveAddress && (
                <FormField
                  control={form.control}
                  name="addressLabel"
                  render={({ field }) => (
                    <FormItem className="max-w-sm">
                      <FormLabel className="text-foreground/90">
                        Nombre para reconocerla
                      </FormLabel>
                      <FormControl>
                        <Input
                          className={optionalInputClass}
                          placeholder="Ej. Casa, Oficina o Regalo"
                          disabled={Boolean(isLoading)}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Opcional. Si lo dejas vacío aparecerá como «Dirección
                        guardada».
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          )}
        </div>

        <FormField
          control={form.control}
          name="shippingOptionType"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel id={modeLabelId} className="text-foreground/90">
                ¿Cómo quieres recibirlo? *
              </FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === "MEDELLIN_LOCAL") {
                      form.setValue("shippingProvider", "MANUAL");
                      form.setValue("envioClickIdRate", 0);
                      form.setValue("shipping", MEDELLIN_SHIPPING);
                    } else if (value === "CUSTOM_WHATSAPP") {
                      form.setValue("shippingProvider", "MANUAL");
                      form.setValue("envioClickIdRate", 0);
                      form.setValue("shipping", WHATSAPP_SHIPPING);
                    } else {
                      form.setValue("shippingProvider", "ENVIOCLICK");
                      form.setValue("envioClickIdRate", 0);
                      form.setValue("shipping", {});
                    }
                  }}
                  value={shippingOptionType}
                  aria-labelledby={modeLabelId}
                  disabled={Boolean(isLoading)}
                  className="grid grid-cols-1 gap-2.5 md:grid-cols-3"
                >
                  {modeOptions.map((option) => {
                    const Icon = option.icon;
                    const isSelected = shippingOptionType === option.value;
                    return (
                      <div key={option.value} className="relative">
                        <RadioGroupItem
                          value={option.value}
                          id={`opt-${option.value.toLowerCase()}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`opt-${option.value.toLowerCase()}`}
                          className={cn(
                            "flex h-full cursor-pointer flex-col gap-1.5 rounded-xl border-2 border-muted bg-card p-3.5 font-sans transition-[border-color,background-color] hover:border-primary/50",
                            "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-blue-purple/10",
                            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/50",
                              )}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3 stroke-[3]" />
                              )}
                            </span>
                            <Icon
                              className="h-4 w-4 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            <span className="text-sm font-semibold">
                              {option.title}
                            </span>
                            {option.badge && (
                              <span className="ml-auto rounded-full bg-kawaii-mint-light px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                                {option.badge}
                              </span>
                            )}
                          </span>
                          <span className="pl-7 text-xs leading-snug text-muted-foreground">
                            {option.description}
                          </span>
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {shippingOptionType === "MEDELLIN_LOCAL" && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900">
            <Bike
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-sm font-semibold">
                Domicilio mismo día (Medellín y área metropolitana)
              </h3>
              <p className="mt-1 text-xs text-emerald-800">
                Entregamos con nuestro domiciliario. Coordinamos la hora por
                WhatsApp cuando confirmes el pedido; el valor del domicilio se
                acuerda allí.
              </p>
            </div>
          </div>
        )}

        {shippingOptionType === "CUSTOM_WHATSAPP" && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-blue-900">
            <MessageSquare
              className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-sm font-semibold">
                Acordar transportadora y flete por WhatsApp
              </h3>
              <p className="mt-1 text-xs text-blue-800">
                Ideal para Interrapidísimo con flete al cobro o transportadoras
                especiales. Pagas los productos ahora y acordamos el envío por
                WhatsApp al confirmar.
              </p>
            </div>
          </div>
        )}

        {shippingOptionType === "ENVIOCLICK" && (
          <FormField
            control={form.control}
            name="envioClickIdRate"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FormLabel id={ratesLabelId} className="text-foreground/90">
                    Transportadora *
                  </FormLabel>
                  {canFetchQuotes && quotesMatchCurrentAddress && (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check
                        className="h-3.5 w-3.5 text-success"
                        aria-hidden="true"
                      />
                      Tarifas para {selectedCity || "tu ciudad"}
                      <button
                        type="button"
                        onClick={handleRetryQuotes}
                        disabled={isLoadingQuotes}
                        className="inline-flex items-center gap-1 font-semibold text-blue-yankees underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        Actualizar
                      </button>
                    </span>
                  )}
                </div>
                <FormControl>
                  <div>
                    <input
                      type="hidden"
                      name={field.name}
                      value={field.value ?? 0}
                      readOnly
                    />
                    {!canFetchQuotes ? (
                      <p className="flex items-center gap-2 rounded-xl border border-dashed border-muted p-4 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Completa la ciudad y la dirección: las tarifas aparecen
                        aquí solas.
                      </p>
                    ) : isLoadingQuotes || (!quotesMatchCurrentAddress && !quoteError) ? (
                      <ShippingRatesSelector
                        quotes={[]}
                        onSelect={applyRate}
                        isLoading
                        ariaLabelledBy={ratesLabelId}
                      />
                    ) : quoteError && !isShippingCoverageError(quoteError) ? (
                      <div
                        className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                        role="alert"
                      >
                        <p className="text-destructive">
                          <strong>No pudimos calcular el envío.</strong>{" "}
                          {quoteError.message &&
                          !quoteError.message.startsWith("No pudimos calcular")
                            ? quoteError.message
                            : "Suele ser un problema momentáneo de conexión."}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRetryQuotes}
                          className="shrink-0 rounded-full"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                          Volver a calcular
                        </Button>
                      </div>
                    ) : groupedQuotes.length === 0 ||
                      isShippingCoverageError(quoteError) ? (
                      <div
                        className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950"
                        role="status"
                      >
                        <p>
                          <strong>
                            Ninguna transportadora cubre esta dirección por
                            ahora.
                          </strong>{" "}
                          Revisa la ciudad o coordina el envío con nosotras por
                          WhatsApp.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRetryQuotes}
                            className="rounded-full"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Reintentar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={chooseWhatsAppShipping}
                            className="rounded-full"
                          >
                            <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                            Acordar por WhatsApp
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <ShippingRatesSelector
                        quotes={groupedQuotes}
                        selectedRate={field.value || undefined}
                        onSelect={applyRate}
                        freeShipping={freeShipping}
                        disabled={Boolean(isLoading)}
                        ariaLabelledBy={ratesLabelId}
                      />
                    )}
                  </div>
                </FormControl>
                {groupedQuotes.length > 0 && (
                  <FormDescription>
                    Mostramos una tarifa por transportadora, la más barata. La
                    tarifa se mantiene si eliges pago contra entrega.
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
      <ActionConfirmationDialog
        isOpen={Boolean(addressPendingDeletion)}
        onOpenChange={(open) => {
          if (!open && !isDeletingAddress) setAddressPendingDeletion(null);
        }}
        onConfirm={() => void confirmDeleteSelectedAddress()}
        title="¿Eliminar dirección guardada?"
        description={`Eliminarás “${addressPendingDeletion?.label ?? "esta dirección"}”. No afectará los pedidos que ya realizaste.`}
        confirmLabel="Eliminar dirección"
        destructive
        isConfirming={isDeletingAddress}
      />
    </>
  );
};
