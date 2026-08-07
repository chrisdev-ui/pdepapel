import { AutocompleteLocation } from "@/components/ui/autocomplete-location";
import { Button } from "@/components/ui/button";
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
import { ShippingRatesSelector } from "@/components/ui/shipping-rates-selector";
import { Textarea } from "@/components/ui/textarea";
import { ShippingStatus } from "@/constants";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocations } from "@/hooks/use-locations";
import { useShippingQuote } from "@/hooks/use-shipping-quote";
import { Bike, Loader2, MessageSquare, PackageSearch, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";

interface ShippingInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  cartItems: { id: string; quantity: number }[];
  orderTotal: number;
}

export const ShippingInfoStep = ({
  form,
  isLoading,
  cartItems,
  orderTotal,
}: ShippingInfoStepProps) => {
  const [searchQuery, setSearchQuery] = useState("");
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
  const handleResetQuotes = () => {
    setLocalQuoteData(null);
    setStoredQuoteData(null);
    resetQuotes();
    form.setValue("envioClickIdRate", 0);
    form.setValue("shipping", {});
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
                <FormLabel className="text-foreground/90 font-medium">
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
                    className="grid grid-cols-1 md:grid-cols-3 gap-3"
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
                        className="flex flex-col h-full items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-purple-600 peer-data-[state=checked]:bg-purple-50/40 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <Truck className="h-5 w-5 text-purple-600 shrink-0" />
                          <span className="text-sm">Encomienda Nacional</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Cotización en vivo con múltiples transportadoras nacionales (según cobertura). <b>Soporta Pago Contraentrega</b>.
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
                        className="flex flex-col h-full items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-purple-600 peer-data-[state=checked]:bg-purple-50/40 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between w-full font-semibold">
                          <div className="flex items-center gap-2">
                            <Bike className="h-5 w-5 text-emerald-600 shrink-0" />
                            <span className="text-sm">Domicilio Mismo Día</span>
                          </div>
                          {isMedellinArea && (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 text-[10px]">
                              Medellín
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Mensajería local especializada en Medellín y Valle de Aburrá.
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
                        className="flex flex-col h-full items-start justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-purple-600 peer-data-[state=checked]:bg-purple-50/40 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <MessageSquare className="h-5 w-5 text-green-600 shrink-0" />
                          <span className="text-sm">Acordar por WhatsApp</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Interrapidísimo contraentrega, flete al cobro o transportadoras especiales.
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
        {(form.watch("shippingOptionType") === "MEDELLIN_LOCAL") && (
          <div className="col-span-1 sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900 flex items-start gap-3">
            <Bike className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Domicilio Mismo Día (Medellín y Área Metropolitana)</h4>
              <p className="text-xs text-emerald-700 mt-1">
                Tu pedido será entregado directamente con nuestro domiciliario especializado. Coordinaremos la hora exacta de entrega por WhatsApp tras finalizar el pedido.
              </p>
            </div>
          </div>
        )}

        {(form.watch("shippingOptionType") === "CUSTOM_WHATSAPP") && (
          <div className="col-span-1 sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-blue-900 flex items-start gap-3">
            <MessageSquare className="h-6 w-6 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Acordar Transportadora y Flete por WhatsApp</h4>
              <p className="text-xs text-blue-700 mt-1">
                Ideal para Interrapidísimo flete al cobro o transportadoras personalizadas. Realiza tu pago online y al finalizar podrás coordinar directamente con nuestro asesor por WhatsApp.
              </p>
            </div>
          </div>
        )}

        {/* Calculate Rates Button (Only shown for ENVIOCLICK mode) */}
        {(!form.watch("shippingOptionType") || form.watch("shippingOptionType") === "ENVIOCLICK") && (
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
                                minimumInsurance: selectedQuote.minimumInsurance,
                                deliveryDays: Number(selectedQuote.deliveryDays),
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
