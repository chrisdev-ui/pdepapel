import {
  CustomerAddress,
  deleteCustomerAddress,
  getCustomerAddresses,
} from "@/actions/customer-addresses";
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShippingRatesSelector } from "@/components/ui/shipping-rates-selector";
import { Textarea } from "@/components/ui/textarea";
import { ShippingStatus } from "@/constants";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocations } from "@/hooks/use-locations";
import { useShippingQuote } from "@/hooks/use-shipping-quote";
import { useAuth } from "@clerk/nextjs";
import {
  Bike,
  Loader2,
  MapPin,
  MapPinHouse,
  MessageSquare,
  PackageSearch,
  Trash2,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";

interface ShippingInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  allowSavedAddresses?: boolean;
  cartItems: { id: string; quantity: number }[];
  orderTotal: number;
}

export const ShippingInfoStep = ({
  form,
  isLoading,
  allowSavedAddresses = true,
  cartItems,
  orderTotal,
}: ShippingInfoStepProps) => {
  const { getToken, isLoaded: isAuthLoaded, userId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [isDeletingAddress, setIsDeletingAddress] = useState(false);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [addressActionError, setAddressActionError] = useState<string | null>(
    null,
  );
  const debouncedQuery = useDebounce(searchQuery, 300);

  const {
    data: { results: locations, count } = {},
    isLoading: isLoadingLocations,
  } = useLocations(debouncedQuery);

  // Watch form fields for shipping quote
  const selectedDaneCode = form.watch("daneCode");
  const address1 = form.watch("address1");
  const selectedCity = form.watch("city") || "";
  const selectedDept = form.watch("department") || "";
  const wantsToSaveAddress = form.watch("saveAddress");
  const locationsDisabled = isLoading || isLoadingLocations;

  const isMedellinArea = useMemo(() => {
    const cityLower = selectedCity.toLowerCase();
    const deptLower = selectedDept.toLowerCase();
    const areaCities = [
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
    return (
      areaCities.some((c) => cityLower.includes(c)) ||
      deptLower.includes("antioquia")
    );
  }, [selectedCity, selectedDept]);

  // Get quote data from store
  const storedQuoteData = useCheckoutStore((state) => state.quoteData);
  const setStoredQuoteData = useCheckoutStore((state) => state.setQuoteData);

  // Use mutation for manual quote fetching
  const {
    mutate: fetchQuotes,
    data: quoteData,
    isPending: isLoadingQuotes,
    error: quoteError,
    reset: resetQuotes,
  } = useShippingQuote();

  // Initialize quote data from store on mount
  const [localQuoteData, setLocalQuoteData] = useState(storedQuoteData);

  // Sync local quote data with both mutation data and stored data
  useEffect(() => {
    if (quoteData) {
      setLocalQuoteData(quoteData);
      setStoredQuoteData(quoteData);
    } else if (storedQuoteData && !localQuoteData) {
      setLocalQuoteData(storedQuoteData);
    }
  }, [quoteData, storedQuoteData, localQuoteData, setStoredQuoteData]);

  // Check if required fields are filled for button enable
  const canFetchQuotes =
    !!selectedDaneCode && !!address1 && cartItems.length > 0;

  // Handle quote fetch
  const handleFetchQuotes = () => {
    if (!canFetchQuotes) return;

    fetchQuotes({
      destination: {
        daneCode: selectedDaneCode,
        address: address1,
      },
      orderTotal,
      items: cartItems.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
      isCOD: true,
    });
  };

  // Handle reset quotes
  const handleResetQuotes = useCallback(() => {
    setLocalQuoteData(null);
    setStoredQuoteData(null);
    resetQuotes();
    form.setValue("envioClickIdRate", 0);
    form.setValue("shipping", {});
  }, [form, resetQuotes, setStoredQuoteData]);

  const applySavedAddress = useCallback(
    async (savedAddress: CustomerAddress) => {
      const nameParts = savedAddress.fullName
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const [firstName, ...lastNameParts] = nameParts;
      const options = { shouldDirty: true, shouldValidate: true };

      if (firstName) form.setValue("firstName", firstName, options);
      if (lastNameParts.length > 0) {
        form.setValue("lastName", lastNameParts.join(" "), options);
      }
      form.setValue("telephone", savedAddress.phone || "", options);
      form.setValue("documentId", savedAddress.documentId || "", options);
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
      handleResetQuotes();
      await form.trigger([
        "firstName",
        "lastName",
        "telephone",
        "documentId",
        "address1",
        "city",
        "department",
        "daneCode",
      ]);
    },
    [form, handleResetQuotes],
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
        const hasCurrentAddress = Boolean(
          form.getValues("address1") ||
          form.getValues("city") ||
          form.getValues("department") ||
          form.getValues("daneCode"),
        );
        const preferredAddress =
          addresses.find((address) => address.isDefault) ?? addresses[0];

        if (!hasCurrentAddress && preferredAddress) {
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

  const handleDeleteSelectedAddress = async () => {
    if (!selectedSavedAddressId || isDeletingAddress) return;

    const selectedAddress = savedAddresses.find(
      (address) => address.id === selectedSavedAddressId,
    );
    if (
      !selectedAddress ||
      !window.confirm(`¿Eliminar la dirección “${selectedAddress.label}”?`)
    ) {
      return;
    }

    setIsDeletingAddress(true);
    setAddressActionError(null);
    try {
      const sessionToken = await getToken();
      if (!sessionToken) return;

      await deleteCustomerAddress(selectedSavedAddressId, sessionToken);
      setSavedAddresses((addresses) =>
        addresses.filter((address) => address.id !== selectedSavedAddressId),
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
    }
  };

  return (
    <div className="space-y-8 duration-500 animate-in fade-in-0 slide-in-from-right-4">
      <div className="space-y-2">
        <h2 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-3xl font-bold text-transparent">
          Información de envío
        </h2>
        <p className="text-muted-foreground">¿A dónde enviamos tu pedido?</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {allowSavedAddresses && userId && (
          <div className="col-span-1 space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:col-span-2">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-background p-2 text-primary shadow-sm">
                <MapPinHouse className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Direcciones guardadas</h3>
                <p className="text-sm text-muted-foreground">
                  Elige una para completar el envío más rápido o guarda la que
                  estás escribiendo.
                </p>
              </div>
            </div>

            {isLoadingAddresses ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Cargando tus direcciones…
              </div>
            ) : savedAddresses.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="saved-address">Usar una dirección</Label>
                  <Select
                    value={selectedSavedAddressId || "new"}
                    onValueChange={handleSavedAddressChange}
                    disabled={Boolean(isLoading)}
                  >
                    <SelectTrigger id="saved-address" className="bg-background">
                      <SelectValue placeholder="Elige una dirección" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        Ingresar una dirección nueva
                      </SelectItem>
                      {savedAddresses.map((savedAddress) => (
                        <SelectItem
                          key={savedAddress.id}
                          value={savedAddress.id}
                        >
                          <span className="flex max-w-[18rem] flex-col text-left sm:max-w-[28rem]">
                            <span className="font-medium">
                              {savedAddress.label}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {savedAddress.address} ·{" "}
                              {savedAddress.city || "Sin ciudad"}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSavedAddressId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={handleDeleteSelectedAddress}
                    disabled={isDeletingAddress || Boolean(isLoading)}
                  >
                    {isDeletingAddress ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Eliminar
                  </Button>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Aún no tienes direcciones guardadas.
              </p>
            )}

            <div className="space-y-3 rounded-lg border bg-background/80 p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="save-address"
                  checked={wantsToSaveAddress}
                  onCheckedChange={(checked) => {
                    form.setValue("saveAddress", checked === true, {
                      shouldDirty: true,
                    });
                  }}
                  disabled={Boolean(isLoading)}
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
                    <FormItem>
                      <FormLabel className="text-sm">
                        Nombre para reconocerla
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="bg-background"
                          placeholder="Ej.: Casa, Oficina o Regalo"
                          disabled={Boolean(isLoading)}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Es opcional. Si lo dejas vacío aparecerá como “Dirección
                        guardada”.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {addressActionError && (
              <p className="text-sm text-muted-foreground" role="status">
                {addressActionError}
              </p>
            )}
          </div>
        )}
        <div className="col-span-1 sm:col-span-2">
          <FormField
            control={form.control}
            name="daneCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground/90">
                  Busca tu ciudad y departamento
                </FormLabel>
                <FormControl>
                  <AutocompleteLocation
                    options={locations || []}
                    value={field.value || ""}
                    defaultDisplayValue={
                      form.getValues("city") && form.getValues("department")
                        ? `${form.getValues("city")} - ${form.getValues(
                            "department",
                          )}`
                        : undefined
                    }
                    onSearch={setSearchQuery}
                    onChange={async (value, location) => {
                      field.onChange(value);
                      if (location) {
                        form.setValue("city", location.city);
                        form.setValue("department", location.department);
                        // Trigger validation to clear any errors
                        await form.trigger(["city", "department"]);
                      }
                    }}
                    onClear={() => {
                      form.setValue("city", "");
                      form.setValue("department", "");
                    }}
                    isLoading={isLoadingLocations}
                    disabled={isLoading}
                    placeholder="Escribe el nombre de tu ciudad o departamento..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Ciudad *</FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="Ciudad"
                  readOnly={!!selectedDaneCode}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Departamento *
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="Departamento"
                  readOnly={!!selectedDaneCode}
                  {...field}
                />
              </FormControl>
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
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Calle 123 #45-67"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address2"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Dirección adicional
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Piso 3, Apartamento 123"
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
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Barrio 123"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Tu barrio es opcional, si no lo conoces puedes dejarlo en
                blanco.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="company"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Empresa</FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Empresa 123"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Sólo si la compra es a nombre de una empresa
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="addressReference"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Referencia</FormLabel>
              <FormControl>
                <Textarea
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Frente al supermercado"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Datos adicionales que ayuden a localizar tu domicilio, esto es
                opcional.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Shipping Option Type Selector */}
        <div className="col-span-1 sm:col-span-2">
          <FormField
            control={form.control}
            name="shippingOptionType"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel className="font-medium text-foreground/90">
                  Selecciona la modalidad de entrega *
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(val) => {
                      field.onChange(val);
                      if (val === "MEDELLIN_LOCAL") {
                        form.setValue("shippingProvider", "MANUAL");
                        form.setValue("envioClickIdRate", 0);
                        form.setValue("shipping", {
                          carrierName: "Domicilio Mismo Día (Medellín)",
                          courier: "Domiciliario Local",
                          productName: "Entrega Mismo Día Medellín",
                          cost: 0,
                          flete: 0,
                          status: ShippingStatus.Preparing,
                        });
                      } else if (val === "CUSTOM_WHATSAPP") {
                        form.setValue("shippingProvider", "MANUAL");
                        form.setValue("envioClickIdRate", 0);
                        form.setValue("shipping", {
                          carrierName: "Acordar por WhatsApp",
                          courier: "Transportadora a Convenir",
                          productName: "Envío Especial / Flete al Cobro",
                          cost: 0,
                          flete: 0,
                          status: ShippingStatus.Preparing,
                        });
                      } else {
                        form.setValue("shippingProvider", "ENVIOCLICK");
                        form.setValue("shipping", {});
                      }
                    }}
                    value={field.value || "ENVIOCLICK"}
                    className="grid grid-cols-1 gap-3 md:grid-cols-3"
                  >
                    {/* Card 1: EnvioClick */}
                    <div className="relative">
                      <RadioGroupItem
                        value="ENVIOCLICK"
                        id="opt-envioclick"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="opt-envioclick"
                        className="flex h-full cursor-pointer flex-col items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 transition-all hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-purple-600 peer-data-[state=checked]:bg-purple-50/40"
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <Truck className="h-5 w-5 shrink-0 text-purple-600" />
                          <span className="text-sm">Encomienda Nacional</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Cotización en vivo con múltiples transportadoras
                          nacionales (según cobertura).{" "}
                          <b>Soporta Pago Contraentrega</b>.
                        </p>
                      </Label>
                    </div>

                    {/* Card 2: Domicilio Mismo Día Medellín */}
                    <div className="relative">
                      <RadioGroupItem
                        value="MEDELLIN_LOCAL"
                        id="opt-medellin"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="opt-medellin"
                        className="flex h-full cursor-pointer flex-col items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 transition-all hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-purple-600 peer-data-[state=checked]:bg-purple-50/40"
                      >
                        <div className="flex w-full items-center justify-between font-semibold">
                          <div className="flex items-center gap-2">
                            <Bike className="h-5 w-5 shrink-0 text-emerald-600" />
                            <span className="text-sm">Domicilio Mismo Día</span>
                          </div>
                          {isMedellinArea && (
                            <Badge
                              variant="outline"
                              className="bg-emerald-100 text-[10px] text-emerald-800"
                            >
                              Medellín
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Mensajería local especializada en Medellín y Valle de
                          Aburrá.
                        </p>
                      </Label>
                    </div>

                    {/* Card 3: Acordar por WhatsApp */}
                    <div className="relative">
                      <RadioGroupItem
                        value="CUSTOM_WHATSAPP"
                        id="opt-whatsapp"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="opt-whatsapp"
                        className="flex h-full cursor-pointer flex-col items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 transition-all hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-purple-600 peer-data-[state=checked]:bg-purple-50/40"
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <MessageSquare className="h-5 w-5 shrink-0 text-green-600" />
                          <span className="text-sm">Acordar por WhatsApp</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Interrapidísimo contraentrega, flete al cobro o
                          transportadoras especiales.
                        </p>
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Dynamic Shipping Option Details */}
        {form.watch("shippingOptionType") === "MEDELLIN_LOCAL" && (
          <div className="col-span-1 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900 sm:col-span-2">
            <Bike className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <h4 className="text-sm font-semibold">
                Domicilio Mismo Día (Medellín y Área Metropolitana)
              </h4>
              <p className="mt-1 text-xs text-emerald-700">
                Tu pedido será entregado directamente con nuestro domiciliario
                especializado. Coordinaremos la hora exacta de entrega por
                WhatsApp tras finalizar el pedido.
              </p>
            </div>
          </div>
        )}

        {form.watch("shippingOptionType") === "CUSTOM_WHATSAPP" && (
          <div className="col-span-1 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-blue-900 sm:col-span-2">
            <MessageSquare className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" />
            <div>
              <h4 className="text-sm font-semibold">
                Acordar Transportadora y Flete por WhatsApp
              </h4>
              <p className="mt-1 text-xs text-blue-700">
                Ideal para Interrapidísimo flete al cobro o transportadoras
                personalizadas. Realiza tu pago online y al finalizar podrás
                coordinar directamente con nuestro asesor por WhatsApp.
              </p>
            </div>
          </div>
        )}

        {/* Calculate Rates Button (Only shown for ENVIOCLICK mode) */}
        {(!form.watch("shippingOptionType") ||
          form.watch("shippingOptionType") === "ENVIOCLICK") && (
          <>
            <div className="col-span-1 sm:col-span-2">
              {!localQuoteData && (
                <Button
                  type="button"
                  onClick={handleFetchQuotes}
                  disabled={!canFetchQuotes || isLoadingQuotes}
                  className="w-full bg-gradient-to-r from-blue-baby to-blue-baby/80 text-primary shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl"
                >
                  {isLoadingQuotes ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Calculando tarifas...
                    </>
                  ) : (
                    <>
                      <PackageSearch className="mr-2 h-5 w-5" />
                      Calcular tarifas de envío
                    </>
                  )}
                </Button>
              )}
              {localQuoteData && (
                <Button
                  type="button"
                  onClick={handleResetQuotes}
                  variant="outline"
                  className="w-full"
                >
                  <PackageSearch className="mr-2 h-5 w-5" />
                  Recalcular tarifas de envío
                </Button>
              )}
              {!canFetchQuotes && !localQuoteData && (
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Completa la ubicación y dirección para calcular las tarifas
                </p>
              )}
              {quoteError && (
                <p className="mt-2 text-center text-sm text-destructive">
                  Error: {quoteError.message ?? "Error desconocido"}
                </p>
              )}
            </div>

            {/* Shipping Rates */}
            <div className="col-span-1 sm:col-span-2">
              <FormField
                control={form.control}
                name="envioClickIdRate"
                render={({ field }) => (
                  <FormItem>
                    {localQuoteData && (
                      <FormLabel className="text-foreground/90">
                        Selecciona una tarifa de envío *
                      </FormLabel>
                    )}
                    <FormControl>
                      {localQuoteData ? (
                        <ShippingRatesSelector
                          quotes={localQuoteData?.quotes || []}
                          selectedRate={field.value}
                          onSelect={async (idRate) => {
                            field.onChange(idRate);

                            // Find selected quote and update shipping details
                            const selectedQuote = localQuoteData?.quotes.find(
                              (q) => q.idRate === idRate,
                            );

                            if (selectedQuote) {
                              form.setValue("shipping", {
                                carrierName: selectedQuote.carrier,
                                courier: selectedQuote.carrier,
                                productName: selectedQuote.product,
                                flete: selectedQuote.flete,
                                minimumInsurance:
                                  selectedQuote.minimumInsurance,
                                deliveryDays: Number(
                                  selectedQuote.deliveryDays,
                                ),
                                isCOD: selectedQuote.isCOD,
                                cost: selectedQuote.totalCost,
                                status: ShippingStatus.Preparing,
                              });
                            }

                            // Trigger validation to clear any errors
                            await form.trigger("envioClickIdRate");
                          }}
                          onClear={() => {
                            field.onChange(undefined);
                            form.setValue("shipping", {});
                          }}
                          isLoading={isLoadingQuotes}
                        />
                      ) : (
                        <input type="hidden" {...field} />
                      )}
                    </FormControl>
                    {localQuoteData && (
                      <FormDescription>
                        Selecciona la tarifa de envío que deseas utilizar.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
